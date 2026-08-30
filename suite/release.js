'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
  SuiteContractError,
  discoverCanonicalPackage,
  loadCanonicalSuite,
} = require('.');

function requireArray(value, field) {
  if (!Array.isArray(value)) {
    throw new SuiteContractError(`${field} must be an array`);
  }
}

function assertUnique(values, field) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) {
      throw new SuiteContractError(`${field} contains duplicate "${value}"`);
    }
    seen.add(value);
  }
}

function canonicalSkillNames(suite) {
  return suite.inventory.map(({ name }) => name);
}

function validatePackageClosure(suite, packageDefinition) {
  const installed = packageDefinition.skills.map(({ name }) => name);
  assertUnique(installed, 'package Skills');
  const installedSet = new Set(installed);
  const packageSkills = canonicalSkillNames(suite);
  for (const name of packageSkills) {
    if (!installedSet.has(name)) {
      throw new SuiteContractError(`missing suite-owned Skill "${name}"`);
    }
  }
  return packageSkills;
}

function findInstallCollisions(suite, installedDefinitions) {
  requireArray(installedDefinitions, 'installedDefinitions');
  const byName = new Map();
  for (const definition of installedDefinitions) {
    if (!definition
      || typeof definition.name !== 'string'
      || definition.name.length === 0
      || typeof definition.source !== 'string'
      || definition.source.length === 0) {
      throw new SuiteContractError(
        'installed definitions require a name and source',
      );
    }
    const sources = byName.get(definition.name) || [];
    sources.push(definition.source);
    byName.set(definition.name, sources);
  }

  const collisions = [];
  for (const { name } of suite.inventory) {
    const sources = byName.get(name) || [];
    if (sources.length > 1) {
      collisions.push({
        kind: 'canonical-name-collision',
        name,
        sources,
      });
    }
  }
  for (const { name, replacement } of suite.predecessors) {
    const sources = byName.get(name) || [];
    if (sources.length > 0) {
      collisions.push({
        kind: 'conflicting-predecessor',
        name,
        replacement,
        sources,
      });
    }
  }
  return collisions;
}

function validateInstallCollisions(suite, installedDefinitions) {
  const collisions = findInstallCollisions(suite, installedDefinitions);
  if (collisions.length === 0) {
    return [];
  }
  const summary = collisions.map(({ kind, name, sources }) => (
    `${kind} "${name}" at ${sources.join(', ')}`
  )).join('; ');
  const error = new SuiteContractError(`installation collisions: ${summary}`);
  error.collisions = collisions;
  throw error;
}

function validateComponentCoverage(repositoryRoot, suite, expectedEdges) {
  const found = new Set();
  for (const { name } of suite.inventory) {
    const evaluationsRoot = path.join(
      repositoryRoot,
      suite.skillsSourceRoot,
      name,
      'evals',
    );
    if (!fs.existsSync(evaluationsRoot)) continue;
    for (const entry of fs.readdirSync(evaluationsRoot, { withFileTypes: true })) {
      if (!entry.isFile() || path.extname(entry.name) !== '.json') continue;
      const definition = readJsonFile(evaluationsRoot, entry.name);
      const consumer = definition.evaluation?.skill || definition.skill_name;
      for (const evaluationCase of definition.evals || []) {
        if (evaluationCase.ablated_dependency) {
          found.add(`${consumer}->${evaluationCase.ablated_dependency}`);
        }
      }
    }
  }
  const unknown = [...found].find((edge) => !expectedEdges.includes(edge));
  if (unknown) {
    throw new SuiteContractError(`component evaluation has unknown edge "${unknown}"`);
  }
  const missing = expectedEdges.find((edge) => !found.has(edge));
  if (missing) {
    throw new SuiteContractError(`missing component evaluation for "${missing}"`);
  }
  return [...expectedEdges];
}

function readJsonFile(root, ...segments) {
  return JSON.parse(fs.readFileSync(path.join(root, ...segments), 'utf8'));
}

function validateReleaseMetadata(repositoryRoot, suite) {
  const packageMetadata = readJsonFile(repositoryRoot, 'package.json');
  const plugin = readJsonFile(
    repositoryRoot,
    '.claude-plugin',
    'plugin.json',
  );
  const marketplace = readJsonFile(
    repositoryRoot,
    '.claude-plugin',
    'marketplace.json',
  );
  for (const [source, identity] of [
    ['package.json', packageMetadata],
    ['Claude plugin', plugin],
  ]) {
    if (identity.name !== suite.identity.name
      || identity.version !== suite.identity.version) {
      throw new SuiteContractError(`${source} must match canonical package identity`);
    }
  }
  if (plugin.skills !== `./${suite.skillsSourceRoot}`) {
    throw new SuiteContractError('Claude plugin must expose the canonical Skill source');
  }
  if (!Array.isArray(marketplace.plugins)
    || marketplace.plugins.length !== 1
    || marketplace.plugins[0].name !== suite.identity.name
    || marketplace.plugins[0].source !== '.') {
    throw new SuiteContractError('marketplace must expose one canonical package');
  }
}

function validateReleasePackage(repositoryRoot) {
  const suite = loadCanonicalSuite(repositoryRoot);
  const packageDefinition = discoverCanonicalPackage(repositoryRoot);
  const skills = validatePackageClosure(suite, packageDefinition);
  const runtimeEdges = suite.runtimeEdges.map(
    ({ consumer, dependency }) => `${consumer}->${dependency}`,
  );
  const componentEdges = validateComponentCoverage(
    repositoryRoot,
    suite,
    runtimeEdges,
  );
  validateReleaseMetadata(repositoryRoot, suite);
  return Object.freeze({
    identity: Object.freeze({ ...suite.identity }),
    skills: Object.freeze(skills),
    runtimeEdges: Object.freeze(runtimeEdges),
    componentEdges: Object.freeze(componentEdges),
  });
}

function validateHostDiscovery(result) {
  const packageSkills = result?.observations?.packageSkills;
  const discovery = result?.observations?.hostAvailableSkills;
  if (!Array.isArray(packageSkills) || !discovery) {
    throw new SuiteContractError('host did not report packaged Skill discovery');
  }
  if (discovery.provenance?.statusSource !== 'observed') {
    throw new SuiteContractError('host Skill discovery must be observed');
  }
  const discoveredSkills = discovery.names;
  const discoveredSkillSet = new Set(discoveredSkills);
  const missing = packageSkills.find((name) => !discoveredSkillSet.has(name));
  if (missing) {
    throw new SuiteContractError(`host did not discover packaged Skill "${missing}"`);
  }
  const unexpected = discoveredSkills.find(
    (name) => !packageSkills.includes(name),
  );
  if (unexpected) {
    throw new SuiteContractError(`host discovered unexpected packaged Skill "${unexpected}"`);
  }
  if (discoveredSkillSet.size !== discoveredSkills.length) {
    throw new SuiteContractError('host packaged Skill discovery contains duplicates');
  }
  return packageSkills;
}

module.exports = {
  findInstallCollisions,
  validateHostDiscovery,
  validateInstallCollisions,
  validatePackageClosure,
  validateReleasePackage,
};
