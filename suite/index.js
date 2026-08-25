'use strict';

const fs = require('node:fs');
const path = require('node:path');

const CONTRACT_FILE = path.join('suite', 'canonical-suite.json');
const VALID_CLASSIFICATIONS = new Set(['audience', 'primary', 'private']);
const EXPECTED_INVENTORY = [
  ['agent-writing', 'primary'],
  ['carve', 'primary'],
  ['code-review', 'primary'],
  ['dispatch-work', 'primary'],
  ['engineering-guidance', 'primary'],
  ['implement', 'primary'],
  ['incident-investigation', 'primary'],
  ['pr-carver', 'primary'],
  ['skill-writing', 'primary'],
  ['take-it-offline', 'primary'],
  ['take-ticket', 'primary'],
  ['to-humans', 'audience'],
  ['review-coordinator', 'private'],
  ['review-worker', 'private'],
  ['skill-evaluation', 'private'],
  ['skill-mechanics', 'private'],
  ['slice-plan', 'private'],
  ['ticket-scope', 'private'],
  ['writing-foundation', 'private'],
];
const EXPECTED_EDGES = [
  'agent-writing->writing-foundation',
  'carve->slice-plan',
  'code-review->review-coordinator',
  'code-review->review-worker',
  'code-review->take-it-offline',
  'dispatch-work->take-it-offline',
  'dispatch-work->take-ticket',
  'implement->engineering-guidance',
  'pr-carver->ticket-scope',
  'review-coordinator->take-it-offline',
  'review-worker->engineering-guidance',
  'review-worker->take-it-offline',
  'skill-writing->agent-writing',
  'skill-writing->skill-evaluation',
  'skill-writing->skill-mechanics',
  'slice-plan->take-it-offline',
  'slice-plan->ticket-scope',
  'take-it-offline->agent-writing',
  'take-ticket->code-review',
  'take-ticket->implement',
  'to-humans->writing-foundation',
];
const EXPECTED_EXTERNALS = [
  ['autopilot', ['dispatch-work', 'pr-carver']],
  ['split-to-prs', ['pr-carver']],
  ['tdd', ['implement']],
];
const productionAdapters = new WeakSet();

class SuiteContractError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SuiteContractError';
  }
}

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
    return `${edge.consumer}->${edge.dependency}`;
  });

  assertUnique(edgeKeys, 'runtimeEdges');
  assertAcyclic(skillNames, suite.runtimeEdges);
  if (JSON.stringify(edgeKeys) !== JSON.stringify(EXPECTED_EDGES)) {
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

function validateCanonicalSuite(suite) {
  if (!suite || suite.skillsSourceRoot !== 'skills') {
    throw new SuiteContractError('skillsSourceRoot must be the canonical "skills" directory');
  }
  validateInventory(suite);
  validateRuntimeGraph(suite);
  validateExternalPrerequisites(suite);
  return suite;
}

function loadCanonicalSuite(repositoryRoot) {
  const contractPath = path.join(repositoryRoot, CONTRACT_FILE);
  const suite = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  return validateCanonicalSuite(suite);
}

function walkSkillDefinitions(directory, repositoryRoot, definitions = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      if (entry.name === 'SKILL.md') {
        definitions.push(path.relative(repositoryRoot, entryPath));
      }
      continue;
    }
    if (entry.isDirectory()) {
      walkSkillDefinitions(entryPath, repositoryRoot, definitions);
    } else if (entry.isFile() && entry.name === 'SKILL.md') {
      definitions.push(path.relative(repositoryRoot, entryPath));
    }
  }
  return definitions;
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
  const definitions = walkSkillDefinitions(repositoryRoot, repositoryRoot);
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

function missingDependencyResult(invocation, discoveredSkills, failure) {
  const internalDependency = failure.code === 'missing-internal-dependency';
  const noun = internalDependency ? 'internal dependency' : 'requested Skill';
  return {
    status: 'failed',
    observations: {
      discoveredSkills,
      routing: {
        requestedSkill: invocation.skill,
        invokedSkills: [],
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

function validateObservationItems(items, fields, itemName) {
  requireArray(items, itemName);
  for (const [index, item] of items.entries()) {
    assertFields(item, fields, [], `${itemName}[${index}]`);
    for (const field of fields) {
      requireString(item[field], `${itemName}[${index}].${field}`);
    }
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
      'discoveredSkills',
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
    result.observations.discoveredSkills,
    'result.observations.discoveredSkills',
  );

  assertFields(
    result.observations.routing,
    ['requestedSkill', 'invokedSkills'],
    [],
    'result.observations.routing',
  );
  requireString(
    result.observations.routing.requestedSkill,
    'result.observations.routing.requestedSkill',
  );
  validateUniqueStringArray(
    result.observations.routing.invokedSkills,
    'result.observations.routing.invokedSkills',
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

async function executeProduction({ repositoryRoot, adapter, invocation }) {
  validateInvocation(invocation);
  if (!productionAdapters.has(adapter)) {
    throw new SuiteContractError('production execution requires a production Adapter');
  }

  const suite = loadCanonicalSuite(repositoryRoot);
  const packageDefinition = discoverCanonicalPackage(repositoryRoot);
  const discoveredSkills = packageDefinition.skills.map(({ name }) => name);
  const resolution = resolveDependencies(suite, packageDefinition, invocation.skill);
  if (resolution.missingSkill) {
    return validateResult(
      missingDependencyResult(invocation, discoveredSkills, resolution),
    );
  }
  const context = {
    discoveredSkills,
    resolvedSkills: resolution.resolved,
  };
  const result = validateResult(await adapter.execute(invocation, context));
  if (result.model.requested !== invocation.model) {
    throw new SuiteContractError('result.model.requested must match invocation.model');
  }
  if (result.observations.routing.requestedSkill !== invocation.skill) {
    throw new SuiteContractError(
      'result.observations.routing.requestedSkill must match invocation.skill',
    );
  }
  if (JSON.stringify(result.observations.discoveredSkills)
    !== JSON.stringify(context.discoveredSkills)) {
    throw new SuiteContractError(
      'result.observations.discoveredSkills must match canonical discovery',
    );
  }
  return result;
}

module.exports = {
  SuiteContractError,
  defineProductionAdapter,
  discoverCanonicalPackage,
  executeProduction,
  loadCanonicalSuite,
  resolvePackageDependencies: resolveDependencies,
  validateInvocation,
  validateCanonicalSuite,
  validateResult,
};
