'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  EXACT_RELEASE_TARGET,
  SuiteContractError,
  assertUnique,
  canonicalSkillNames,
  formatRuntimeEdge,
  requireArray,
  runtimeEdgeKey,
} = require('./contract');
const {
  emptyPreExecutionInventory,
} = require('./pre-execution-inventory');

const CONTRACT_FILE = path.join('suite', 'canonical-suite.json');
const EXPECTED_IDENTITY = EXACT_RELEASE_TARGET.identity;
const VALID_CLASSIFICATIONS = new Set(['audience', 'primary', 'private']);
const EXPECTED_INVENTORY = EXACT_RELEASE_TARGET.inventory.map(
  ({ name, classification }) => [name, classification],
);
const EXPECTED_EDGE_KEYS = EXACT_RELEASE_TARGET.runtimeEdges.map(runtimeEdgeKey);
const EXPECTED_EXTERNALS = EXACT_RELEASE_TARGET.externalPrerequisites.map(
  ({ name, consumers }) => [name, consumers],
);
const EXPECTED_PREDECESSORS = EXACT_RELEASE_TARGET.predecessors.map(
  ({ name, replacement }) => [name, replacement],
);
const VALID_SKILL_OPERATIONS = new Set(['select', 'load']);
const VALID_SKILL_STATUSES = new Set([
  'started',
  'succeeded',
  'failed',
  'rejected',
  'cancelled',
  'unknown',
]);
const VALID_SKILL_TRIGGERS = new Set(['user', 'model', 'host', 'unknown']);
const VALID_STATUS_SOURCES = new Set(['observed', 'inferred']);
const productionAdapters = new WeakSet();

function buildDependencyMap(skillNames, edges) {
  const dependencies = new Map([...skillNames].map((name) => [name, []]));
  for (const edge of edges) {
    dependencies.get(edge.consumer).push(edge.dependency);
  }
  return dependencies;
}

function validateInventory(suite) {
  requireArray(suite.inventory, 'inventory');
  requireArray(suite.aliases, 'aliases');
  if (suite.aliases.length > 0) {
    throw new SuiteContractError('aliases are not permitted');
  }

  const entries = suite.inventory.map((entry) => {
    if (!entry || typeof entry.name !== 'string' || entry.name.length === 0) {
      throw new SuiteContractError('inventory entries require a canonical name');
    }
    if (!VALID_CLASSIFICATIONS.has(entry.classification)) {
      throw new SuiteContractError(
        `unknown classification "${entry.classification}" for "${entry.name}"`,
      );
    }
    return [entry.name, entry.classification];
  });

  assertUnique(entries.map(([name]) => name), 'inventory');
  if (JSON.stringify(entries) !== JSON.stringify(EXPECTED_INVENTORY)) {
    throw new SuiteContractError('inventory must contain the exact canonical 19-Skill target');
  }
}

function assertAcyclic(skillNames, edges) {
  const dependencies = buildDependencyMap(skillNames, edges);

  const visiting = new Set();
  const visited = new Set();
  function visit(name) {
    if (visiting.has(name)) {
      throw new SuiteContractError(`runtime graph contains a cycle at "${name}"`);
    }
    if (visited.has(name)) return;
    visiting.add(name);
    for (const dependency of dependencies.get(name)) visit(dependency);
    visiting.delete(name);
    visited.add(name);
  }

  for (const name of skillNames) visit(name);
}

function validateRuntimeGraph(suite) {
  requireArray(suite.runtimeEdges, 'runtimeEdges');
  const skillNames = new Set(suite.inventory.map(({ name }) => name));
  const edgeKeys = suite.runtimeEdges.map((edge) => {
    if (!edge || !skillNames.has(edge.consumer)) {
      throw new SuiteContractError(
        `runtime edge has unknown consumer "${edge?.consumer}"`,
      );
    }
    if (!skillNames.has(edge.dependency)) {
      throw new SuiteContractError(
        `runtime edge has unknown dependency "${edge.dependency}"`,
      );
    }
    if (edge.consumer === edge.dependency) {
      throw new SuiteContractError(`runtime graph contains self-edge "${edge.consumer}"`);
    }
    return runtimeEdgeKey(edge);
  });

  assertUnique(
    suite.runtimeEdges,
    'runtimeEdges',
    runtimeEdgeKey,
    formatRuntimeEdge,
  );
  assertAcyclic(skillNames, suite.runtimeEdges);
  if (JSON.stringify(edgeKeys) !== JSON.stringify(EXPECTED_EDGE_KEYS)) {
    throw new SuiteContractError('runtime graph must contain the exact canonical edges');
  }
}

function validateExternalPrerequisites(suite) {
  requireArray(suite.externalPrerequisites, 'externalPrerequisites');
  const skillNames = new Set(suite.inventory.map(({ name }) => name));
  const entries = suite.externalPrerequisites.map((entry) => {
    if (!entry || typeof entry.name !== 'string' || entry.name.length === 0) {
      throw new SuiteContractError('external prerequisites require a name');
    }
    if (skillNames.has(entry.name)) {
      throw new SuiteContractError(`external prerequisite "${entry.name}" is suite-owned`);
    }
    if (!entry.source
      || typeof entry.source.url !== 'string'
      || !entry.source.url.startsWith('https://')
      || typeof entry.source.locator !== 'string'
      || entry.source.locator.length === 0) {
      throw new SuiteContractError(
        `external prerequisite "${entry.name}" requires a source`,
      );
    }
    if (typeof entry.testedRevision !== 'string'
      || !/^sha256:[a-f0-9]{64}$/.test(entry.testedRevision)) {
      throw new SuiteContractError(
        `external prerequisite "${entry.name}" requires a tested revision`,
      );
    }
    if (typeof entry.license !== 'string' || entry.license.length === 0) {
      throw new SuiteContractError(
        `external prerequisite "${entry.name}" requires a license`,
      );
    }
    requireArray(entry.consumers, `external prerequisite "${entry.name}" consumers`);
    assertUnique(entry.consumers, `external prerequisite "${entry.name}" consumers`);
    for (const consumer of entry.consumers) {
      if (!skillNames.has(consumer)) {
        throw new SuiteContractError(
          `external prerequisite "${entry.name}" has unknown consumer "${consumer}"`,
        );
      }
    }
    return [entry.name, entry.consumers];
  });

  assertUnique(entries.map(([name]) => name), 'externalPrerequisites');
  if (JSON.stringify(entries) !== JSON.stringify(EXPECTED_EXTERNALS)) {
    throw new SuiteContractError(
      'external prerequisites must contain the exact canonical declarations',
    );
  }
}

function validateIdentity(suite) {
  if (JSON.stringify(suite.identity) !== JSON.stringify(EXPECTED_IDENTITY)) {
    throw new SuiteContractError(
      'package identity must be skills version 1.0.0 release-candidate',
    );
  }
}

function validatePredecessors(suite) {
  requireArray(suite.predecessors, 'predecessors');
  const entries = suite.predecessors.map((entry) => {
    if (!entry
      || typeof entry.name !== 'string'
      || typeof entry.replacement !== 'string') {
      throw new SuiteContractError('predecessors require a name and replacement');
    }
    return [entry.name, entry.replacement];
  });
  assertUnique(entries.map(([name]) => name), 'predecessors');
  if (JSON.stringify(entries) !== JSON.stringify(EXPECTED_PREDECESSORS)) {
    throw new SuiteContractError('predecessors must contain the exact migration set');
  }
  const inventory = new Set(canonicalSkillNames(suite));
  for (const [name, replacement] of entries) {
    if (inventory.has(name)) {
      throw new SuiteContractError(`predecessor "${name}" cannot remain in inventory`);
    }
    if (!inventory.has(replacement)) {
      throw new SuiteContractError(
        `predecessor "${name}" has unknown replacement "${replacement}"`,
      );
    }
  }
}

function validateAdaptedUpstream(suite) {
  requireArray(suite.adaptedUpstream, 'adaptedUpstream');
  if (suite.adaptedUpstream.length === 0) {
    throw new SuiteContractError('adaptedUpstream must record adapted contributions');
  }
  const inventory = new Set(canonicalSkillNames(suite));
  const revisions = [];
  for (const contribution of suite.adaptedUpstream) {
    if (!contribution?.source
      || typeof contribution.source.name !== 'string'
      || contribution.source.name.length === 0
      || typeof contribution.source.url !== 'string'
      || !contribution.source.url.startsWith('https://github.com/')) {
      throw new SuiteContractError('adapted upstream contribution requires a source');
    }
    if (typeof contribution.pinnedRevision !== 'string'
      || !/^[a-f0-9]{40}$/.test(contribution.pinnedRevision)) {
      throw new SuiteContractError(
        `adapted upstream "${contribution.source.name}" requires a pinned revision`,
      );
    }
    if (typeof contribution.license !== 'string'
      || contribution.license.length === 0) {
      throw new SuiteContractError(
        `adapted upstream "${contribution.source.name}" requires a license`,
      );
    }
    requireArray(
      contribution.modules,
      `adapted upstream "${contribution.source.name}" modules`,
    );
    if (contribution.modules.length === 0) {
      throw new SuiteContractError(
        `adapted upstream "${contribution.source.name}" requires affected modules`,
      );
    }
    assertUnique(
      contribution.modules,
      `adapted upstream "${contribution.source.name}" modules`,
    );
    for (const moduleName of contribution.modules) {
      if (!inventory.has(moduleName)) {
        throw new SuiteContractError(
          `adapted upstream "${contribution.source.name}" has unknown module `
            + `"${moduleName}"`,
        );
      }
    }
    revisions.push(`${contribution.source.url}@${contribution.pinnedRevision}`);
  }
  assertUnique(revisions, 'adaptedUpstream');
}

function validateCanonicalSuite(suite) {
  if (!suite || suite.skillsSourceRoot !== 'skills') {
    throw new SuiteContractError('skillsSourceRoot must be the canonical "skills" directory');
  }
  validateIdentity(suite);
  validateInventory(suite);
  validatePredecessors(suite);
  validateRuntimeGraph(suite);
  validateExternalPrerequisites(suite);
  validateAdaptedUpstream(suite);
  return suite;
}

function loadCanonicalSuite(repositoryRoot) {
  const contractPath = path.join(repositoryRoot, CONTRACT_FILE);
  const suite = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  return validateCanonicalSuite(suite);
}

function walkSkillDefinitions(
  directory,
  repositoryRoot,
  discovery = { definitions: [], symlinks: [] },
) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (directory === repositoryRoot && entry.name === '.git') continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      discovery.symlinks.push(path.relative(repositoryRoot, entryPath));
      if (entry.name === 'SKILL.md') {
        discovery.definitions.push(path.relative(repositoryRoot, entryPath));
      }
      continue;
    }
    if (entry.isDirectory()) {
      walkSkillDefinitions(entryPath, repositoryRoot, discovery);
    } else if (entry.isFile() && entry.name === 'SKILL.md') {
      discovery.definitions.push(path.relative(repositoryRoot, entryPath));
    }
  }
  return discovery;
}

function readSkillName(definitionPath) {
  const markdown = fs.readFileSync(definitionPath, 'utf8');
  const frontmatter = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  const name = frontmatter?.[1].match(/^name:\s*([^\s]+)\s*$/m)?.[1];
  if (!name) {
    throw new SuiteContractError(
      `canonical Skill definition "${definitionPath}" has no frontmatter name`,
    );
  }
  return name;
}

function discoverCanonicalPackage(repositoryRoot) {
  const suite = loadCanonicalSuite(repositoryRoot);
  const canonicalRoot = path.join(repositoryRoot, suite.skillsSourceRoot);
  const rootStatus = fs.lstatSync(canonicalRoot);
  if (!rootStatus.isDirectory() || rootStatus.isSymbolicLink()) {
    throw new SuiteContractError('canonical Skill source root must be a real directory');
  }

  const canonicalPrefix = `${suite.skillsSourceRoot}${path.sep}`;
  const { definitions, symlinks } = walkSkillDefinitions(
    repositoryRoot,
    repositoryRoot,
  );
  const canonicalSkillSymlink = symlinks
    .find((symlink) => symlink.startsWith(canonicalPrefix));
  if (canonicalSkillSymlink) {
    throw new SuiteContractError(
      `symlinked Skill definition "${canonicalSkillSymlink}"`,
    );
  }
  const nonCanonicalSkillSymlink = symlinks
    .filter((symlink) => !symlink.startsWith(canonicalPrefix))
    .find((symlink) => {
      const symlinkPath = path.join(repositoryRoot, symlink);
      const targetPath = path.resolve(
        path.dirname(symlinkPath),
        fs.readlinkSync(symlinkPath),
      );
      const targetRelative = path.relative(canonicalRoot, targetPath);
      const targetsCanonicalRoot = targetRelative === ''
        || (!targetRelative.startsWith('..') && !path.isAbsolute(targetRelative));
      return symlink.split(path.sep).includes('skills') || targetsCanonicalRoot;
    });
  if (nonCanonicalSkillSymlink) {
    throw new SuiteContractError(
      `non-canonical symlinked Skill directory "${nonCanonicalSkillSymlink}"`,
    );
  }
  const nonCanonical = definitions
    .filter((definition) => !definition.startsWith(canonicalPrefix));
  if (nonCanonical.length > 0) {
    throw new SuiteContractError(
      `non-canonical Skill definition "${nonCanonical.sort()[0]}"`,
    );
  }
  const generated = definitions.filter((definition) => {
    const parts = definition.split(path.sep);
    return parts[0] === suite.skillsSourceRoot
      && (parts.length !== 3 || parts[2] !== 'SKILL.md');
  });
  if (generated.length > 0) {
    throw new SuiteContractError(
      `generated or nested Skill definition "${generated.sort()[0]}"`,
    );
  }

  const canonicalNames = new Set(suite.inventory.map(({ name }) => name));
  const discovered = new Map();
  for (const entry of fs.readdirSync(canonicalRoot, { withFileTypes: true })) {
    const skillDirectory = path.join(canonicalRoot, entry.name);
    const status = fs.lstatSync(skillDirectory);
    if (entry.isSymbolicLink() || status.isSymbolicLink()) {
      throw new SuiteContractError(`symlinked Skill definition "${entry.name}"`);
    }
    if (!entry.isDirectory()) continue;
    if (!canonicalNames.has(entry.name)) {
      throw new SuiteContractError(`unknown or aliased Skill definition "${entry.name}"`);
    }

    const definitionPath = path.join(skillDirectory, 'SKILL.md');
    if (!fs.existsSync(definitionPath)) continue;
    const definitionStatus = fs.lstatSync(definitionPath);
    if (!definitionStatus.isFile() || definitionStatus.isSymbolicLink()) {
      throw new SuiteContractError(`symlinked Skill definition "${entry.name}"`);
    }
    const declaredName = readSkillName(definitionPath);
    if (declaredName !== entry.name) {
      throw new SuiteContractError(
        `Skill directory "${entry.name}" declares alias "${declaredName}"`,
      );
    }
    discovered.set(entry.name, {
      name: entry.name,
      definitionPath,
    });
  }

  return Object.freeze({
    canonicalRoot,
    skills: Object.freeze(
      suite.inventory
        .filter(({ name }) => discovered.has(name))
        .map(({ name }) => Object.freeze(discovered.get(name))),
    ),
  });
}

function defineProductionAdapter({ name, execute }) {
  if (typeof name !== 'string' || name.length === 0 || typeof execute !== 'function') {
    throw new SuiteContractError('production Adapter requires a name and execute function');
  }
  const adapter = Object.freeze({ name, execute });
  productionAdapters.add(adapter);
  return adapter;
}

function validateInvocation(invocation) {
  if (!invocation || typeof invocation !== 'object' || Array.isArray(invocation)) {
    throw new SuiteContractError('invocation must be an object');
  }
  const allowedFields = new Set(['requestId', 'skill', 'prompt', 'model']);
  const unsupported = Object.keys(invocation).filter((field) => !allowedFields.has(field));
  if (unsupported.length > 0) {
    throw new SuiteContractError(`unsupported production invocation field "${unsupported[0]}"`);
  }
  for (const field of allowedFields) {
    if (typeof invocation[field] !== 'string' || invocation[field].length === 0) {
      throw new SuiteContractError(`invocation.${field} must be a non-empty string`);
    }
  }
  return invocation;
}

function resolveDependencies(suite, packageDefinition, requestedSkill) {
  const installed = new Set(packageDefinition.skills.map(({ name }) => name));
  const dependencies = buildDependencyMap(
    suite.inventory.map(({ name }) => name),
    suite.runtimeEdges,
  );

  const resolved = [];
  const visited = new Set();
  function resolve(name, isRequested = false) {
    if (!installed.has(name)) {
      return {
        missingSkill: name,
        code: isRequested ? 'missing-requested-skill' : 'missing-internal-dependency',
      };
    }
    if (visited.has(name)) return null;
    visited.add(name);
    for (const dependency of dependencies.get(name)) {
      const failure = resolve(dependency);
      if (failure) return failure;
    }
    resolved.push(name);
    return null;
  }

  const failure = resolve(requestedSkill, true);
  return failure || { resolved };
}

function missingDependencyResult(invocation, packageSkills, failure) {
  const internalDependency = failure.code === 'missing-internal-dependency';
  const noun = internalDependency ? 'internal dependency' : 'requested Skill';
  return {
    status: 'failed',
    observations: {
      packageSkills,
      hostAvailableSkills: null,
      preExecutionInventory: emptyPreExecutionInventory(),
      skillEvents: [],
      routing: {
        requestedSkill: invocation.skill,
        resolvedSkills: [],
      },
      responses: [],
      artifacts: [],
      toolUses: [],
      attemptedMutations: [],
    },
    failure: {
      stage: 'dependency-resolution',
      code: failure.code,
      message: `Missing ${noun} "${failure.missingSkill}"`,
      missingSkill: failure.missingSkill,
    },
    durationMs: 0,
    costUsd: 0,
    model: {
      requested: invocation.model,
      resolved: null,
    },
  };
}

function requireObject(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SuiteContractError(`${field} must be an object`);
  }
}

function assertFields(value, required, optional, field) {
  requireObject(value, field);
  const allowed = new Set([...required, ...optional]);
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) {
    throw new SuiteContractError(`${field} has unsupported field "${unknown}"`);
  }
  const missing = required.find((key) => !Object.hasOwn(value, key));
  if (missing) {
    throw new SuiteContractError(`${field} is missing "${missing}"`);
  }
}

function requireString(value, field, allowNull = false) {
  if (allowNull && value === null) return;
  if (typeof value !== 'string' || value.length === 0) {
    throw new SuiteContractError(`${field} must be a non-empty string`);
  }
}

function validateUniqueStringArray(value, field) {
  requireArray(value, field);
  for (const [index, item] of value.entries()) {
    requireString(item, `${field}[${index}]`);
  }
  assertUnique(value, field);
}

function containsExactly(actual, expected) {
  return actual.length === expected.length
    && expected.every((item) => actual.includes(item));
}

function validateObservationItems(items, fields, itemName) {
  requireArray(items, itemName);
  for (const [index, item] of items.entries()) {
    assertFields(item, fields, [], `${itemName}[${index}]`);
    for (const field of fields) {
      requireString(item[field], `${itemName}[${index}].${field}`);
    }
  }
}

function validateProvenance(value, field) {
  assertFields(
    value,
    [
      'host',
      'mechanism',
      'eventType',
      'observerVersion',
      'statusSource',
    ],
    ['runId'],
    field,
  );
  for (const name of ['host', 'mechanism', 'eventType', 'observerVersion']) {
    requireString(value[name], `${field}.${name}`);
  }
  if (!VALID_STATUS_SOURCES.has(value.statusSource)) {
    throw new SuiteContractError(
      `${field}.statusSource must be "observed" or "inferred"`,
    );
  }
  if (Object.hasOwn(value, 'runId')) {
    requireString(value.runId, `${field}.runId`);
  }
}

function validatePreExecutionInventory(value) {
  assertFields(
    value,
    [
      'skillDefinitions',
      'plugins',
      'ruleSources',
      'packageDigest',
      'truncated',
    ],
    [],
    'result.observations.preExecutionInventory',
  );
  requireArray(
    value.skillDefinitions,
    'result.observations.preExecutionInventory.skillDefinitions',
  );
  const identities = [];
  for (const [index, definition] of value.skillDefinitions.entries()) {
    const field = `result.observations.preExecutionInventory.skillDefinitions[${index}]`;
    assertFields(definition, ['name', 'path', 'digest'], [], field);
    for (const name of ['name', 'path', 'digest']) {
      requireString(definition[name], `${field}.${name}`);
    }
    if (!/^[a-z0-9-]+$/.test(definition.name)) {
      throw new SuiteContractError(`${field}.name must be a canonical Skill name`);
    }
    if (!/^[a-f0-9]{64}$/.test(definition.digest)) {
      throw new SuiteContractError(`${field}.digest must be a SHA-256 fingerprint`);
    }
    identities.push(`${definition.name}\0${definition.path}`);
  }
  assertUnique(
    identities,
    'result.observations.preExecutionInventory.skillDefinitions',
  );
  validateUniqueStringArray(
    value.plugins,
    'result.observations.preExecutionInventory.plugins',
  );
  validateUniqueStringArray(
    value.ruleSources,
    'result.observations.preExecutionInventory.ruleSources',
  );
  if (!/^[a-f0-9]{64}$/.test(value.packageDigest)) {
    throw new SuiteContractError(
      'result.observations.preExecutionInventory.packageDigest '
        + 'must be a SHA-256 fingerprint',
    );
  }
  if (typeof value.truncated !== 'boolean') {
    throw new SuiteContractError(
      'result.observations.preExecutionInventory.truncated must be a boolean',
    );
  }
}

function validateSkillEvents(events) {
  requireArray(events, 'result.observations.skillEvents');
  for (const [index, event] of events.entries()) {
    const field = `result.observations.skillEvents[${index}]`;
    assertFields(
      event,
      ['name', 'operation', 'status', 'provenance'],
      ['trigger', 'callId'],
      field,
    );
    requireString(event.name, `${field}.name`);
    if (!/^[a-z0-9-]+$/.test(event.name)) {
      throw new SuiteContractError(`${field}.name must be a canonical Skill name`);
    }
    if (!VALID_SKILL_OPERATIONS.has(event.operation)) {
      throw new SuiteContractError(`${field}.operation must be "select" or "load"`);
    }
    if (!VALID_SKILL_STATUSES.has(event.status)) {
      throw new SuiteContractError(`${field}.status is invalid`);
    }
    if (Object.hasOwn(event, 'trigger')) {
      if (!VALID_SKILL_TRIGGERS.has(event.trigger)) {
        throw new SuiteContractError(`${field}.trigger is invalid`);
      }
    }
    if (Object.hasOwn(event, 'callId')) {
      requireString(event.callId, `${field}.callId`);
    }
    validateProvenance(event.provenance, `${field}.provenance`);
  }
}

function validateResult(result) {
  assertFields(
    result,
    ['status', 'observations', 'failure', 'durationMs', 'costUsd', 'model'],
    [],
    'result',
  );
  if (!['succeeded', 'failed'].includes(result.status)) {
    throw new SuiteContractError('result.status must be "succeeded" or "failed"');
  }

  assertFields(
    result.observations,
    [
      'packageSkills',
      'hostAvailableSkills',
      'preExecutionInventory',
      'skillEvents',
      'routing',
      'responses',
      'artifacts',
      'toolUses',
      'attemptedMutations',
    ],
    [],
    'result.observations',
  );
  validateUniqueStringArray(
    result.observations.packageSkills,
    'result.observations.packageSkills',
  );
  if (result.observations.hostAvailableSkills !== null) {
    assertFields(
      result.observations.hostAvailableSkills,
      ['names', 'provenance'],
      [],
      'result.observations.hostAvailableSkills',
    );
    validateUniqueStringArray(
      result.observations.hostAvailableSkills.names,
      'result.observations.hostAvailableSkills.names',
    );
    validateProvenance(
      result.observations.hostAvailableSkills.provenance,
      'result.observations.hostAvailableSkills.provenance',
    );
  }
  validatePreExecutionInventory(result.observations.preExecutionInventory);
  validateSkillEvents(result.observations.skillEvents);

  assertFields(
    result.observations.routing,
    ['requestedSkill', 'resolvedSkills'],
    [],
    'result.observations.routing',
  );
  requireString(
    result.observations.routing.requestedSkill,
    'result.observations.routing.requestedSkill',
  );
  validateUniqueStringArray(
    result.observations.routing.resolvedSkills,
    'result.observations.routing.resolvedSkills',
  );

  validateObservationItems(
    result.observations.responses,
    ['text'],
    'result.observations.responses',
  );
  validateObservationItems(
    result.observations.artifacts,
    ['reference', 'mediaType'],
    'result.observations.artifacts',
  );
  validateObservationItems(
    result.observations.toolUses,
    ['name', 'outcome'],
    'result.observations.toolUses',
  );
  validateObservationItems(
    result.observations.attemptedMutations,
    ['operation', 'target', 'outcome'],
    'result.observations.attemptedMutations',
  );

  if (!Number.isFinite(result.durationMs) || result.durationMs < 0) {
    throw new SuiteContractError('result.durationMs must be a non-negative number');
  }
  if (result.costUsd !== null
    && (!Number.isFinite(result.costUsd) || result.costUsd < 0)) {
    throw new SuiteContractError('result.costUsd must be null or a non-negative number');
  }
  assertFields(result.model, ['requested', 'resolved'], [], 'result.model');
  requireString(result.model.requested, 'result.model.requested');
  requireString(result.model.resolved, 'result.model.resolved', true);

  if (result.status === 'succeeded') {
    if (result.failure !== null) {
      throw new SuiteContractError('successful result.failure must be null');
    }
  } else {
    assertFields(
      result.failure,
      ['stage', 'code', 'message'],
      ['missingSkill'],
      'result.failure',
    );
    if (![
      'dependency-resolution',
      'setup',
      'startup',
      'execution',
      'result-normalization',
    ].includes(result.failure.stage)) {
      throw new SuiteContractError(`unknown failure stage "${result.failure.stage}"`);
    }
    requireString(result.failure.code, 'result.failure.code');
    requireString(result.failure.message, 'result.failure.message');
    if (Object.hasOwn(result.failure, 'missingSkill')) {
      requireString(result.failure.missingSkill, 'result.failure.missingSkill');
    }
  }
  return result;
}

function validateAdapterResult(result, invocation, context) {
  validateResult(result);
  if (result.model.requested !== invocation.model) {
    throw new SuiteContractError('result.model.requested must match invocation.model');
  }
  if (result.observations.routing.requestedSkill !== invocation.skill) {
    throw new SuiteContractError(
      'result.observations.routing.requestedSkill must match invocation.skill',
    );
  }
  if (JSON.stringify(result.observations.packageSkills)
    !== JSON.stringify(context.packageSkills)) {
    throw new SuiteContractError(
      'result.observations.packageSkills must match canonical package inventory',
    );
  }
  if (!containsExactly(
    result.observations.routing.resolvedSkills,
    context.resolvedSkills,
  )) {
    throw new SuiteContractError(
      'result.observations.routing.resolvedSkills must match resolved Skills',
    );
  }
  return result;
}

async function executeProduction({ repositoryRoot, adapter, invocation }) {
  const contractInvocation = Object.freeze({ ...validateInvocation(invocation) });
  if (!productionAdapters.has(adapter)) {
    throw new SuiteContractError('production execution requires a production Adapter');
  }

  const suite = loadCanonicalSuite(repositoryRoot);
  const packageDefinition = discoverCanonicalPackage(repositoryRoot);
  const packageSkills = Object.freeze(
    packageDefinition.skills.map(({ name }) => name),
  );
  const resolution = resolveDependencies(
    suite,
    packageDefinition,
    contractInvocation.skill,
  );
  if (resolution.missingSkill) {
    return validateResult(
      missingDependencyResult(contractInvocation, packageSkills, resolution),
    );
  }
  const context = Object.freeze({
    packageSkills,
    resolvedSkills: Object.freeze([...resolution.resolved]),
  });
  return validateAdapterResult(
    await adapter.execute(contractInvocation, context),
    contractInvocation,
    context,
  );
}

module.exports = {
  SuiteContractError,
  defineProductionAdapter,
  discoverCanonicalPackage,
  executeProduction,
  loadCanonicalSuite,
  resolvePackageDependencies: resolveDependencies,
  validateAdapterResult,
  validateInvocation,
  validateCanonicalSuite,
  validateResult,
};
