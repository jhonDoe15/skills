'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
  fingerprintValue,
  validateEvaluationDefinition,
} = require('../evaluation');
const {
  loadCanonicalSuite,
} = require('..');

const HOSTS = Object.freeze(['claude-code', 'cursor']);
const MODEL_TIERS = Object.freeze(['ordinary', 'frontier']);
const PLANNING_SKILLS = new Set([
  'carve',
  'pr-carver',
  'slice-plan',
  'ticket-scope',
]);
const MODEL_ALIASES = new Set([
  'auto',
  'claude',
  'default',
  'frontier',
  'gpt',
  'haiku',
  'latest',
  'opus',
  'ordinary',
  'sonnet',
]);
const STATIC_DEFINITION_NAMES = new Set([
  'component.json',
  'outcome.json',
  'role.json',
  'trigger.json',
]);
const MANDATORY_CRITICAL_CASES = Object.freeze([
  'code-review-outcome/nontrivial-ticket-outcome',
  'take-it-offline-role/pressure-and-sensitive-data',
]);

class AdoptionContractError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AdoptionContractError';
  }
}

function requireObject(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AdoptionContractError(`${field} must be an object`);
  }
  return value;
}

function requireArray(value, field, allowEmpty = false) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    throw new AdoptionContractError(
      `${field} must be ${allowEmpty ? 'an array' : 'a non-empty array'}`,
    );
  }
  return value;
}

function requireString(value, field) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new AdoptionContractError(`${field} must be a non-empty string`);
  }
  return value;
}

function requirePositiveInteger(value, field) {
  if (!Number.isInteger(value) || value < 1) {
    throw new AdoptionContractError(`${field} must be a positive integer`);
  }
  return value;
}

function requirePositiveNumber(value, field) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new AdoptionContractError(`${field} must be a positive number`);
  }
  return value;
}

function assertExactFields(value, fields, field) {
  requireObject(value, field);
  const expected = [...fields].sort();
  const actual = Object.keys(value).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new AdoptionContractError(
      `${field} must contain exactly ${expected.join(', ')}`,
    );
  }
}

function assertUnique(values, field) {
  if (new Set(values).size !== values.length) {
    throw new AdoptionContractError(`${field} contains duplicates`);
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function frozenClone(value) {
  return deepFreeze(structuredClone(value));
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new AdoptionContractError(
      `cannot load evaluation definition "${filePath}": ${error.message}`,
    );
  }
}

function isStaticDefinition(entryName, skillName) {
  return STATIC_DEFINITION_NAMES.has(entryName)
    || (entryName.startsWith('component-') && entryName.endsWith('.json'))
    || (skillName === 'incident-investigation' && entryName === 'evals.json');
}

function incidentTriggerDefinition(definition) {
  requireArray(
    definition.trigger_evals,
    'incident-investigation.trigger_evals',
  );
  return {
    ...structuredClone(definition),
    evaluation: {
      ...structuredClone(definition.evaluation),
      scope: 'incident-investigation-trigger',
      layer: 'trigger',
      arms: ['treatment'],
    },
    config: {
      ...structuredClone(definition.config),
      runs_per_configuration: 5,
      minimum_treatment_pass_rate: 1,
      minimum_treatment_win_rate: 0,
      randomization_seed: 'incident-investigation-trigger-v1',
    },
    evals: definition.trigger_evals.map((evaluation) => {
      requireString(evaluation.id, 'incident trigger id');
      requireString(evaluation.query, `incident trigger "${evaluation.id}" query`);
      if (typeof evaluation.should_trigger !== 'boolean') {
        throw new AdoptionContractError(
          `incident trigger "${evaluation.id}" should_trigger must be a boolean`,
        );
      }
      return {
        id: evaluation.id,
        name: evaluation.id,
        prompt: evaluation.query,
        expected_output: evaluation.should_trigger
          ? 'The explicitly requested Skill activates.'
          : 'The Skill remains inactive without an explicit request.',
        files: [],
        expectations: [
          `Activation matches should_trigger=${evaluation.should_trigger}.`,
        ],
        should_trigger: evaluation.should_trigger,
        canonical_invocation: evaluation.should_trigger
          && evaluation.query.trimStart().startsWith('/incident-investigation'),
        expected_output_patterns: structuredClone(
          evaluation.expected_output_patterns || [],
        ),
      };
    }),
  };
}

function incidentRoleDefinition(definition) {
  return {
    ...structuredClone(definition),
    evaluation: {
      ...structuredClone(definition.evaluation),
      scope: 'incident-investigation-role',
      layer: 'role',
    },
    config: {
      ...structuredClone(definition.config),
      randomization_seed: 'incident-investigation-role-v1',
    },
  };
}

function definitionRecord({
  repositoryRoot,
  source,
  origin,
  owner,
  definition,
}) {
  if (definition.skill_name !== owner
    || definition.evaluation?.skill !== owner) {
    throw new AdoptionContractError(
      `evaluation definition "${source}" must be owned by "${owner}"`,
    );
  }
  try {
    validateEvaluationDefinition(definition, repositoryRoot);
  } catch (error) {
    throw new AdoptionContractError(
      `invalid evaluation definition "${source}": ${error.message}`,
    );
  }
  return {
    source,
    origin,
    definition: structuredClone(definition),
  };
}

function loadCanonicalEvaluationDefinitions(repositoryRoot) {
  requireString(repositoryRoot, 'repositoryRoot');
  const suite = loadCanonicalSuite(repositoryRoot);
  const records = [];

  for (const { name } of suite.inventory) {
    const evalsRoot = path.join(
      repositoryRoot,
      suite.skillsSourceRoot,
      name,
      'evals',
    );
    if (!fs.existsSync(evalsRoot)) continue;
    const entries = fs.readdirSync(evalsRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile() && isStaticDefinition(entry.name, name))
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absoluteSource = path.join(evalsRoot, entry.name);
      const source = path.relative(repositoryRoot, absoluteSource);
      const definition = readJson(absoluteSource);
      records.push(definitionRecord({
        repositoryRoot,
        source,
        origin: 'static',
        owner: name,
        definition,
      }));
      if (name === 'incident-investigation' && entry.name === 'evals.json') {
        records.push(definitionRecord({
          repositoryRoot,
          source: `${source}#role`,
          origin: 'derived',
          owner: name,
          definition: incidentRoleDefinition(definition),
        }));
        records.push(definitionRecord({
          repositoryRoot,
          source: `${source}#trigger_evals`,
          origin: 'nested',
          owner: name,
          definition: incidentTriggerDefinition(definition),
        }));
      }
    }
  }

  for (const owner of ['implement', 'take-ticket']) {
    const source = path.join('skills', owner, 'evals', 'evals.json');
    let definitions;
    try {
      definitions = require(path.join(
        repositoryRoot,
        'skills',
        owner,
        'evals',
      )).loadDefinitions(repositoryRoot);
    } catch (error) {
      throw new AdoptionContractError(
        `cannot load dynamic evaluation catalog "${source}": ${error.message}`,
      );
    }
    requireArray(definitions, `${owner} dynamic definitions`);
    for (const definition of definitions) {
      records.push(definitionRecord({
        repositoryRoot,
        source: `${source}#${definition.evaluation.layer}`,
        origin: 'dynamic',
        owner,
        definition,
      }));
    }
  }

  records.sort((left, right) => (
    left.definition.evaluation.scope.localeCompare(
      right.definition.evaluation.scope,
    )
  ));
  const scopes = records.map(({ definition }) => definition.evaluation.scope);
  assertUnique(scopes, 'evaluation definition scopes');
  return frozenClone(records);
}

function runtimeEdgeKey({ consumer, dependency }) {
  return `${consumer}\0${dependency}`;
}

function selectorFor(scope, caseId) {
  return `${scope}/${String(caseId)}`;
}

function includesText(value, pattern) {
  return pattern.test(JSON.stringify(value));
}

function validateCampaignCoverage(repositoryRoot, records = null) {
  const definitions = records || loadCanonicalEvaluationDefinitions(repositoryRoot);
  const suite = loadCanonicalSuite(repositoryRoot);
  const inventory = new Set(suite.inventory.map(({ name }) => name));

  const roleDefinitions = definitions.filter(
    ({ definition }) => definition.evaluation.layer === 'role',
  );
  const directRoleOwners = new Set(
    roleDefinitions.map(({ definition }) => definition.skill_name),
  );
  const missingDirectRoles = [...inventory].filter(
    (name) => !directRoleOwners.has(name),
  );
  if (missingDirectRoles.length > 0) {
    throw new AdoptionContractError(
      `role coverage is incomplete: ${missingDirectRoles.join(', ') || 'unexpected role definitions'}`,
    );
  }
  const roleOwners = [...directRoleOwners].sort();
  if (roleOwners.length !== suite.inventory.length) {
    throw new AdoptionContractError('not every canonical owner has role evidence');
  }

  const expectedEdges = new Map(
    suite.runtimeEdges.map((edge) => [runtimeEdgeKey(edge), edge]),
  );
  const componentCases = [];
  for (const { definition } of definitions) {
    if (definition.evaluation.layer !== 'component') continue;
    for (const evaluation of definition.evals) {
      const edge = {
        consumer: definition.evaluation.skill,
        dependency: evaluation.ablated_dependency,
      };
      componentCases.push({
        ...edge,
        selector: selectorFor(definition.evaluation.scope, evaluation.id),
      });
    }
  }
  const foundEdgeKeys = componentCases.map(runtimeEdgeKey);
  assertUnique(foundEdgeKeys, 'component runtime edges');
  const unknownEdge = componentCases.find(
    (edge) => !expectedEdges.has(runtimeEdgeKey(edge)),
  );
  if (unknownEdge) {
    throw new AdoptionContractError(
      `component coverage has unknown edge "${unknownEdge.consumer} -> ${unknownEdge.dependency}"`,
    );
  }
  const missingEdge = suite.runtimeEdges.find(
    (edge) => !foundEdgeKeys.includes(runtimeEdgeKey(edge)),
  );
  if (missingEdge) {
    throw new AdoptionContractError(
      `component coverage is missing "${missingEdge.consumer} -> ${missingEdge.dependency}"`,
    );
  }

  const publicOwners = suite.inventory
    .filter(({ classification }) => classification !== 'private')
    .map(({ name }) => name)
    .sort();
  const outcomeOwners = definitions
    .filter(({ definition }) => definition.evaluation.layer === 'outcome')
    .map(({ definition }) => definition.skill_name)
    .sort();
  assertUnique(outcomeOwners, 'public outcome owners');
  if (JSON.stringify(outcomeOwners) !== JSON.stringify(publicOwners)) {
    throw new AdoptionContractError(
      'outcome coverage must match the 12 canonical public owners',
    );
  }

  const classifications = new Map(
    suite.inventory.map(({ name, classification }) => [name, classification]),
  );
  const triggerCategories = {
    positive: [],
    negative: [],
    ambiguous: [],
    canonical_only: [],
    private_false_activation: [],
  };
  for (const { definition } of definitions) {
    if (definition.evaluation.layer !== 'trigger') continue;
    const cases = definition.evals;
    for (const evaluation of cases) {
      const selector = selectorFor(definition.evaluation.scope, evaluation.id);
      if (evaluation.should_trigger && !evaluation.canonical_invocation) {
        triggerCategories.positive.push(selector);
      }
      if (!evaluation.should_trigger) triggerCategories.negative.push(selector);
      if (evaluation.case_category === 'ambiguous'
        || includesText(
          { id: evaluation.id, name: evaluation.name },
          /ambiguous/i,
        )) {
        triggerCategories.ambiguous.push(selector);
      }
      if (!evaluation.should_trigger
        && classifications.get(definition.skill_name) === 'private') {
        triggerCategories.private_false_activation.push(selector);
      }
    }
    const hasAmbientNegative = cases.some((evaluation) => (
      !evaluation.should_trigger
      && includesText(
        {
          id: evaluation.id,
          name: evaluation.name,
          clauses: evaluation.covered_clauses,
        },
        /ambient|canonical-only/i,
      )
    ));
    if (hasAmbientNegative) {
      triggerCategories.canonical_only.push(
        ...cases
          .filter((evaluation) => (
            evaluation.should_trigger && evaluation.canonical_invocation
          ))
          .map((evaluation) => selectorFor(
            definition.evaluation.scope,
            evaluation.id,
          )),
      );
    }
  }
  for (const [category, selectors] of Object.entries(triggerCategories)) {
    if (selectors.length === 0) {
      throw new AdoptionContractError(
        `trigger coverage is missing ${category.replaceAll('_', '-')} cases`,
      );
    }
    selectors.sort();
  }

  return frozenClone({
    definition_count: definitions.length,
    role_owners: roleOwners,
    component_edges: componentCases
      .sort((left, right) => left.selector.localeCompare(right.selector)),
    public_outcomes: outcomeOwners,
    trigger_categories: triggerCategories,
  });
}

function validateModelId(model, field) {
  requireString(model, field);
  const normalized = model.toLowerCase();
  if (MODEL_ALIASES.has(normalized)
    || normalized.endsWith('-latest')
    || normalized.endsWith('/latest')
    || !/\d/.test(normalized)) {
    throw new AdoptionContractError(
      `${field} must be an exact non-alias model identifier`,
    );
  }
  return model;
}

function validateRunConfiguration(value, field) {
  assertExactFields(
    value,
    ['model', 'timeout_ms', 'budget_usd', 'max_attempts'],
    field,
  );
  validateModelId(value.model, `${field}.model`);
  requirePositiveInteger(value.timeout_ms, `${field}.timeout_ms`);
  requirePositiveNumber(value.budget_usd, `${field}.budget_usd`);
  requirePositiveInteger(value.max_attempts, `${field}.max_attempts`);
}

function allCaseSelectors(definitions) {
  return new Set(definitions.flatMap(({ definition }) => (
    definition.evals.map((evaluation) => selectorFor(
      definition.evaluation.scope,
      evaluation.id,
    ))
  )));
}

function validateSelectors(selectors, field, knownSelectors) {
  requireArray(selectors, field, true);
  selectors.forEach((selector, index) => {
    requireString(selector, `${field}[${index}]`);
    if (!knownSelectors.has(selector)) {
      throw new AdoptionContractError(
        `${field}[${index}] names unknown case "${selector}"`,
      );
    }
  });
  assertUnique(selectors, field);
}

function validateCampaignConfiguration(
  repositoryRoot,
  configuration,
  definitions = null,
) {
  const records = definitions || loadCanonicalEvaluationDefinitions(repositoryRoot);
  const suite = loadCanonicalSuite(repositoryRoot);
  assertExactFields(configuration, [
    'schema_version',
    'kind',
    'candidate',
    'hosts',
    'judge',
    'repetitions',
    'critical_cases',
    'human_review',
  ], 'configuration');
  if (configuration.schema_version !== 1) {
    throw new AdoptionContractError('configuration.schema_version must be 1');
  }
  if (configuration.kind !== 'adoption-campaign-configuration') {
    throw new AdoptionContractError('configuration.kind is invalid');
  }

  assertExactFields(
    configuration.candidate,
    ['identity', 'git_revision'],
    'configuration.candidate',
  );
  if (JSON.stringify(configuration.candidate.identity)
    !== JSON.stringify(suite.identity)) {
    throw new AdoptionContractError(
      'configuration.candidate.identity must match the canonical release candidate',
    );
  }
  if (!/^[a-f0-9]{40}$/.test(configuration.candidate.git_revision)) {
    throw new AdoptionContractError(
      'configuration.candidate.git_revision must be an exact 40-character revision',
    );
  }

  assertExactFields(configuration.hosts, HOSTS, 'configuration.hosts');
  for (const host of HOSTS) {
    assertExactFields(
      configuration.hosts[host],
      MODEL_TIERS,
      `configuration.hosts.${host}`,
    );
    for (const tier of MODEL_TIERS) {
      validateRunConfiguration(
        configuration.hosts[host][tier],
        `configuration.hosts.${host}.${tier}`,
      );
    }
    if (configuration.hosts[host].ordinary.model
      === configuration.hosts[host].frontier.model) {
      throw new AdoptionContractError(
        `configuration.hosts.${host} must use distinct ordinary and frontier models`,
      );
    }
  }

  validateRunConfiguration(configuration.judge, 'configuration.judge');
  assertExactFields(
    configuration.repetitions,
    ['ordinary', 'mixed', 'critical'],
    'configuration.repetitions',
  );
  for (const [policy, expected] of [
    ['ordinary', 3],
    ['mixed', 5],
    ['critical', 5],
  ]) {
    if (configuration.repetitions[policy] !== expected) {
      throw new AdoptionContractError(
        `configuration.repetitions.${policy} must be ${expected}`,
      );
    }
  }

  const knownSelectors = allCaseSelectors(records);
  validateSelectors(
    configuration.critical_cases,
    'configuration.critical_cases',
    knownSelectors,
  );
  if (configuration.critical_cases.length === 0) {
    throw new AdoptionContractError(
      'configuration.critical_cases must predeclare pressure cases',
    );
  }
  const configuredCriticalCases = new Set(configuration.critical_cases);
  const missingCriticalCase = MANDATORY_CRITICAL_CASES.find(
    (selector) => !configuredCriticalCases.has(selector),
  );
  if (missingCriticalCase) {
    throw new AdoptionContractError(
      `configuration.critical_cases must include "${missingCriticalCase}"`,
    );
  }
  assertExactFields(
    configuration.human_review,
    ['passing_sample'],
    'configuration.human_review',
  );
  validateSelectors(
    configuration.human_review.passing_sample,
    'configuration.human_review.passing_sample',
    knownSelectors,
  );
  if (configuration.human_review.passing_sample.length === 0) {
    throw new AdoptionContractError(
      'configuration.human_review.passing_sample must be predeclared',
    );
  }
  return frozenClone(configuration);
}

function manifestContents(manifest) {
  const contents = { ...manifest };
  delete contents.fingerprint;
  return contents;
}

function createManifest({
  record,
  configuration,
  configurationFingerprint,
  host,
  tier,
}) {
  const { definition, source, origin } = record;
  const scope = definition.evaluation.scope;
  const criticalCases = new Set(configuration.critical_cases);
  const cases = definition.evals.map((evaluation) => {
    const selector = selectorFor(scope, evaluation.id);
    const critical = definition.evaluation.layer === 'trigger'
      || criticalCases.has(selector);
    return {
      id: String(evaluation.id),
      name: evaluation.name,
      selector,
      critical,
      initial_repetitions: critical
        ? configuration.repetitions.critical
        : configuration.repetitions.ordinary,
      mixed_repetitions: configuration.repetitions.mixed,
    };
  });
  const run = configuration.hosts[host][tier];
  const executionConfiguration = {
    host_adapter: host === 'claude-code'
      ? 'claude-code-production-v1'
      : 'cursor-local-production-v1',
    settings_precedence: 'inline-and-project-only',
    timeout_ms: run.timeout_ms,
    budget_usd: run.budget_usd,
    max_attempts: run.max_attempts,
  };
  const manifest = {
    schema_version: 1,
    kind: 'adoption-campaign-manifest',
    id: `${scope}:${host}:${tier}`,
    configuration_fingerprint: configurationFingerprint,
    candidate: structuredClone(configuration.candidate),
    definition: {
      scope,
      layer: definition.evaluation.layer,
      skill: definition.evaluation.skill,
      version: definition.version,
      source,
      origin,
      fingerprint: fingerprintValue(definition),
    },
    cell: {
      host,
      tier,
      model: run.model,
    },
    execution_configuration: executionConfiguration,
    judge: structuredClone(configuration.judge),
    arms: [...definition.evaluation.arms],
    cases,
    thresholds: {
      minimum_treatment_pass_rate:
        definition.config.minimum_treatment_pass_rate,
      minimum_treatment_win_rate:
        definition.config.minimum_treatment_win_rate,
    },
    randomization_seed: definition.config.randomization_seed,
    planning_semantics: PLANNING_SKILLS.has(definition.evaluation.skill)
      && ['role', 'outcome'].includes(definition.evaluation.layer),
  };
  manifest.execution_fingerprint = fingerprintValue({
    candidate: manifest.candidate,
    definition: manifest.definition,
    cell: manifest.cell,
    execution_configuration: manifest.execution_configuration,
    judge: manifest.judge,
    arms: manifest.arms,
    cases: manifest.cases,
  });
  manifest.fingerprint = fingerprintValue(manifest);
  return manifest;
}

function roundedUsd(value) {
  return Number(value.toFixed(6));
}

function campaignExecutionEstimate(manifests, configuration) {
  let hostExecutions = 0;
  let judgeCalls = 0;
  let maximumHostExecutions = 0;
  let maximumJudgeCalls = 0;
  let hostAttempts = 0;
  let judgeAttempts = 0;
  let costCeiling = 0;

  for (const manifest of manifests) {
    const initialRepetitions = manifest.cases.reduce(
      (sum, evaluation) => sum + evaluation.initial_repetitions,
      0,
    );
    const maximumRepetitions = manifest.cases.reduce(
      (sum, evaluation) => sum + (
        evaluation.critical
          ? evaluation.initial_repetitions
          : evaluation.mixed_repetitions
      ),
      0,
    );
    const executionsPerRepetition = manifest.definition.layer === 'trigger'
      ? 1
      : 2;
    const manifestExecutions = initialRepetitions * executionsPerRepetition;
    const manifestJudgments = manifest.definition.layer === 'trigger'
      ? 0
      : initialRepetitions;
    const maximumManifestExecutions = (
      maximumRepetitions * executionsPerRepetition
    );
    const maximumManifestJudgments = manifest.definition.layer === 'trigger'
      ? 0
      : maximumRepetitions;
    hostExecutions += manifestExecutions;
    judgeCalls += manifestJudgments;
    maximumHostExecutions += maximumManifestExecutions;
    maximumJudgeCalls += maximumManifestJudgments;
    hostAttempts += (
      maximumManifestExecutions
        * manifest.execution_configuration.max_attempts
    );
    judgeAttempts += (
      maximumManifestJudgments * configuration.judge.max_attempts
    );
    costCeiling += (
      maximumManifestExecutions
        * manifest.execution_configuration.max_attempts
        * manifest.execution_configuration.budget_usd
    );
    costCeiling += (
      maximumManifestJudgments
        * configuration.judge.max_attempts
        * configuration.judge.budget_usd
    );
  }

  return {
    initial_calls: {
      host_executions: hostExecutions,
      judge_calls: judgeCalls,
      total: hostExecutions + judgeCalls,
    },
    maximum_calls: {
      host_executions: maximumHostExecutions,
      judge_calls: maximumJudgeCalls,
      total: maximumHostExecutions + maximumJudgeCalls,
    },
    maximum_attempts: {
      host_executions: hostAttempts,
      judge_calls: judgeAttempts,
      total: hostAttempts + judgeAttempts,
    },
    maximum_configured_cost_ceiling_usd: roundedUsd(costCeiling),
  };
}

function buildCampaignPlan({ repositoryRoot, configuration }) {
  const definitions = loadCanonicalEvaluationDefinitions(repositoryRoot);
  const coverage = validateCampaignCoverage(repositoryRoot, definitions);
  const frozenConfiguration = validateCampaignConfiguration(
    repositoryRoot,
    configuration,
    definitions,
  );
  const configurationFingerprint = fingerprintValue(frozenConfiguration);
  const manifests = [];
  for (const record of definitions) {
    for (const host of HOSTS) {
      for (const tier of MODEL_TIERS) {
        manifests.push(createManifest({
          record,
          configuration: frozenConfiguration,
          configurationFingerprint,
          host,
          tier,
        }));
      }
    }
  }
  const plan = {
    schema_version: 1,
    kind: 'adoption-campaign-plan',
    configuration: structuredClone(frozenConfiguration),
    configuration_fingerprint: configurationFingerprint,
    coverage: structuredClone(coverage),
    manifests,
    execution_estimate: campaignExecutionEstimate(
      manifests,
      frozenConfiguration,
    ),
  };
  plan.fingerprint = fingerprintValue(plan);
  return frozenClone(plan);
}

function validateCampaignPlan(repositoryRoot, plan) {
  requireObject(plan, 'plan');
  requireString(plan.fingerprint, 'plan.fingerprint');
  const expected = buildCampaignPlan({
    repositoryRoot,
    configuration: plan.configuration,
  });
  if (plan.fingerprint !== fingerprintValue(manifestContents(plan))) {
    throw new AdoptionContractError('campaign plan fingerprint mismatch');
  }
  if (plan.fingerprint !== expected.fingerprint) {
    throw new AdoptionContractError(
      'campaign plan is stale or mismatched with canonical definitions',
    );
  }
  return expected;
}

function cellKey(cell) {
  return `${cell.host}\0${cell.tier}\0${cell.model}`;
}

function validatePointer(value, field) {
  requireString(value, field);
  if (/[\r\n]/.test(value)) {
    throw new AdoptionContractError(`${field} must be a provenance pointer`);
  }
}

function validateGateRecords(records, field, failure) {
  requireArray(records, field, true);
  for (const [index, record] of records.entries()) {
    const recordField = `${field}[${index}]`;
    assertExactFields(
      record,
      failure
        ? ['gate', 'critical', 'evidence_pointer']
        : ['gate', 'evidence_pointer'],
      recordField,
    );
    requireString(record.gate, `${recordField}.gate`);
    validatePointer(
      record.evidence_pointer,
      `${recordField}.evidence_pointer`,
    );
    if (failure && typeof record.critical !== 'boolean') {
      throw new AdoptionContractError(
        `${recordField}.critical must be a boolean`,
      );
    }
  }
}

function validateMetricSeries(series, field) {
  assertExactFields(
    series,
    ['first_pass', 'attempts', 'cost_usd'],
    field,
  );
  requireArray(series.first_pass, `${field}.first_pass`);
  if (!series.first_pass.every((value) => typeof value === 'boolean')) {
    throw new AdoptionContractError(
      `${field}.first_pass must contain booleans`,
    );
  }
  requireArray(series.attempts, `${field}.attempts`);
  if (!series.attempts.every((value) => Number.isInteger(value) && value >= 1)) {
    throw new AdoptionContractError(
      `${field}.attempts must contain positive integers`,
    );
  }
  requireArray(series.cost_usd, `${field}.cost_usd`);
  if (!series.cost_usd.every(
    (value) => Number.isFinite(value) && value >= 0,
  )) {
    throw new AdoptionContractError(
      `${field}.cost_usd must contain non-negative numbers`,
    );
  }
}

function validatePlanningSemantics(value, field, manifest, caseResults) {
  assertExactFields(value, ['cases'], field);
  requireArray(value.cases, `${field}.cases`);
  const retained = new Set();
  for (const [index, metric] of value.cases.entries()) {
    const metricField = `${field}.cases[${index}]`;
    assertExactFields(metric, ['id', 'baseline', 'candidate'], metricField);
    requireString(metric.id, `${metricField}.id`);
    const planned = manifest.cases.find(({ id }) => id === metric.id);
    if (!planned || retained.has(metric.id)) {
      throw new AdoptionContractError(
        `${metricField}.id must identify one unique manifest case`,
      );
    }
    retained.add(metric.id);
    validateMetricSeries(metric.baseline, `${metricField}.baseline`);
    validateMetricSeries(metric.candidate, `${metricField}.candidate`);
    const repetitions = caseResults.find(({ id }) => id === metric.id)
      .repetitions;
    for (const side of ['baseline', 'candidate']) {
      for (const name of ['first_pass', 'attempts', 'cost_usd']) {
        if (metric[side][name].length !== repetitions) {
          throw new AdoptionContractError(
            `${metricField}.${side}.${name} must match case repetitions`,
          );
        }
      }
    }
  }
  const missing = manifest.cases.find(({ id }) => !retained.has(id));
  if (missing || retained.size !== manifest.cases.length) {
    throw new AdoptionContractError(
      `${field} is missing case "${missing?.id || 'unknown'}"`,
    );
  }
}

function validateExecutorSizing(value, field) {
  requireObject(value, field);
  if (!Number.isFinite(value.observed_cost_usd)
    || value.observed_cost_usd < 0) {
    throw new AdoptionContractError(
      `${field}.observed_cost_usd must be a non-negative number`,
    );
  }
  const semanticFields = [
    'critical_failure',
    'failures',
    'passed',
    'semantic_passed',
  ];
  const semanticField = semanticFields.find((name) => Object.hasOwn(value, name));
  if (semanticField) {
    throw new AdoptionContractError(
      `${field}.${semanticField} cannot define semantic pass or failure`,
    );
  }
}

function validateReplayFragment(fragment, manifest, plan) {
  assertExactFields(fragment, [
    'schema_version',
    'kind',
    'campaign_fingerprint',
    'manifest_fingerprint',
    'definition_fingerprint',
    'candidate',
    'cell',
    'cases',
    'planning_semantics',
    'executor_sizing',
    'provenance',
    'fingerprint',
  ], 'replay fragment');
  if (fragment.schema_version !== 1
    || fragment.kind !== 'adoption-manifest-replay') {
    throw new AdoptionContractError('replay fragment version or kind is invalid');
  }
  if (fragment.campaign_fingerprint !== plan.fingerprint) {
    throw new AdoptionContractError('stale replay fragment campaign fingerprint');
  }
  if (fragment.manifest_fingerprint !== manifest.fingerprint) {
    throw new AdoptionContractError('replay fragment manifest fingerprint mismatch');
  }
  if (fragment.definition_fingerprint !== manifest.definition.fingerprint) {
    throw new AdoptionContractError('replay fragment definition fingerprint mismatch');
  }
  if (fragment.fingerprint !== fingerprintValue(manifestContents(fragment))) {
    throw new AdoptionContractError('replay fragment fingerprint mismatch');
  }
  if (JSON.stringify(fragment.candidate)
    !== JSON.stringify(manifest.candidate)) {
    throw new AdoptionContractError('replay fragment candidate mismatch');
  }
  if (JSON.stringify(fragment.cell) !== JSON.stringify(manifest.cell)) {
    throw new AdoptionContractError('replay fragment cell mismatch');
  }

  requireArray(fragment.cases, 'replay fragment cases');
  const cases = new Map();
  for (const [index, result] of fragment.cases.entries()) {
    const field = `replay fragment cases[${index}]`;
    assertExactFields(result, [
      'id',
      'repetition_class',
      'repetitions',
      'passed',
      'failures',
      'passes',
    ], field);
    requireString(result.id, `${field}.id`);
    if (cases.has(result.id)) {
      throw new AdoptionContractError('replay fragment cases contain duplicates');
    }
    const planned = manifest.cases.find(({ id }) => id === result.id);
    if (!planned) {
      throw new AdoptionContractError(
        `replay fragment has unknown case "${result.id}"`,
      );
    }
    if (typeof result.passed !== 'boolean') {
      throw new AdoptionContractError(`${field}.passed must be a boolean`);
    }
    validateGateRecords(result.failures, `${field}.failures`, true);
    validateGateRecords(result.passes, `${field}.passes`, false);
    if (result.passed && result.failures.length > 0) {
      throw new AdoptionContractError(
        `${field} cannot pass with failure records`,
      );
    }
    if (!result.passed && result.failures.length === 0) {
      throw new AdoptionContractError(
        `${field} must retain at least one failure`,
      );
    }
    if (planned.critical) {
      if (result.repetition_class !== 'critical'
        || result.repetitions !== planned.initial_repetitions) {
        throw new AdoptionContractError(
          `${field} must retain the critical repetition policy`,
        );
      }
    } else if (result.repetition_class === 'ordinary') {
      if (result.repetitions !== planned.initial_repetitions) {
        throw new AdoptionContractError(
          `${field} ordinary repetitions do not match the plan`,
        );
      }
    } else if (result.repetition_class === 'mixed') {
      if (result.repetitions !== planned.mixed_repetitions) {
        throw new AdoptionContractError(
          `${field} mixed repetitions do not match the expansion policy`,
        );
      }
    } else {
      throw new AdoptionContractError(
        `${field}.repetition_class is invalid`,
      );
    }
    cases.set(result.id, result);
  }
  const missingCase = manifest.cases.find(({ id }) => !cases.has(id));
  if (missingCase || cases.size !== manifest.cases.length) {
    throw new AdoptionContractError(
      `replay fragment is missing case "${missingCase?.id || 'unknown'}"`,
    );
  }

  if (manifest.planning_semantics) {
    validatePlanningSemantics(
      fragment.planning_semantics,
      'replay fragment planning_semantics',
      manifest,
      fragment.cases,
    );
  } else if (fragment.planning_semantics !== null) {
    throw new AdoptionContractError(
      'non-planning replay fragment planning_semantics must be null',
    );
  }
  validateExecutorSizing(
    fragment.executor_sizing,
    'replay fragment executor_sizing',
  );
  assertExactFields(
    fragment.provenance,
    ['replay_result'],
    'replay fragment provenance',
  );
  validatePointer(
    fragment.provenance.replay_result,
    'replay fragment provenance.replay_result',
  );
  return fragment;
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function increaseRatio(candidate, baseline) {
  if (baseline === 0) return candidate === 0 ? 0 : Number.POSITIVE_INFINITY;
  return (candidate - baseline) / baseline;
}

function trueRate(values) {
  return values.filter(Boolean).length / values.length;
}

function planningSummary(fragments) {
  const values = {
    baseline: { first_pass: [], attempts: [], cost_usd: [] },
    candidate: { first_pass: [], attempts: [], cost_usd: [] },
  };
  for (const fragment of fragments) {
    if (fragment.planning_semantics === null) continue;
    for (const planningCase of fragment.planning_semantics.cases) {
      for (const side of ['baseline', 'candidate']) {
        for (const metric of ['first_pass', 'attempts', 'cost_usd']) {
          values[side][metric].push(...planningCase[side][metric]);
        }
      }
    }
  }
  if (values.candidate.first_pass.length === 0) {
    throw new AdoptionContractError(
      'cell is missing planning semantic evidence',
    );
  }
  const baselineFirstPass = trueRate(values.baseline.first_pass);
  const candidateFirstPass = trueRate(values.candidate.first_pass);
  const firstPassLoss = baselineFirstPass - candidateFirstPass;
  const baselineAttempts = median(values.baseline.attempts);
  const candidateAttempts = median(values.candidate.attempts);
  const attemptsIncrease = increaseRatio(candidateAttempts, baselineAttempts);
  const baselineCost = median(values.baseline.cost_usd);
  const candidateCost = median(values.candidate.cost_usd);
  const costIncrease = increaseRatio(candidateCost, baselineCost);
  const gates = [
    {
      gate: 'planning-first-pass-loss',
      passed: firstPassLoss <= 0.10,
      observed: firstPassLoss,
      limit: 0.10,
    },
    {
      gate: 'planning-median-attempts-increase',
      passed: attemptsIncrease <= 0.20,
      observed: attemptsIncrease,
      limit: 0.20,
    },
    {
      gate: 'planning-median-cost-increase',
      passed: costIncrease <= 0.20,
      observed: costIncrease,
      limit: 0.20,
    },
  ];
  return {
    baseline: {
      first_pass_rate: baselineFirstPass,
      median_attempts: baselineAttempts,
      median_cost_usd: baselineCost,
    },
    candidate: {
      first_pass_rate: candidateFirstPass,
      median_attempts: candidateAttempts,
      median_cost_usd: candidateCost,
    },
    gates,
    passed: gates.every(({ passed }) => passed),
  };
}

function criticalPlanningFailures(values) {
  const failures = [];
  for (const { manifest, fragment } of values) {
    if (fragment.planning_semantics === null) continue;
    for (const metric of fragment.planning_semantics.cases) {
      const planned = manifest.cases.find(({ id }) => id === metric.id);
      if (!planned.critical) continue;
      const baselineFirstPass = trueRate(metric.baseline.first_pass);
      const candidateFirstPass = trueRate(metric.candidate.first_pass);
      const regressions = [
        [
          'critical-planning-first-pass-regression',
          candidateFirstPass < baselineFirstPass,
        ],
        [
          'critical-planning-median-attempts-regression',
          median(metric.candidate.attempts) > median(metric.baseline.attempts),
        ],
        [
          'critical-planning-median-cost-regression',
          median(metric.candidate.cost_usd) > median(metric.baseline.cost_usd),
        ],
      ];
      for (const [gate, regressed] of regressions) {
        if (!regressed) continue;
        failures.push({
          manifest_fingerprint: manifest.fingerprint,
          definition_fingerprint: manifest.definition.fingerprint,
          selector: planned.selector,
          host: manifest.cell.host,
          tier: manifest.cell.tier,
          model: manifest.cell.model,
          gate,
          critical: true,
          evidence_pointer: fragment.provenance.replay_result,
        });
      }
    }
  }
  return failures;
}

function replayCampaignAggregate({ repositoryRoot, plan, fragments }) {
  const canonicalPlan = validateCampaignPlan(repositoryRoot, plan);
  requireArray(fragments, 'fragments');
  const manifests = new Map(
    canonicalPlan.manifests.map((manifest) => [
      manifest.fingerprint,
      manifest,
    ]),
  );
  const retained = new Map();
  for (const fragment of fragments) {
    requireObject(fragment, 'replay fragment');
    const fingerprint = fragment.manifest_fingerprint;
    const manifest = manifests.get(fingerprint);
    if (!manifest) {
      throw new AdoptionContractError(
        'replay fragment references an unknown or stale manifest',
      );
    }
    if (retained.has(fingerprint)) {
      throw new AdoptionContractError(
        `duplicate replay fragment for manifest "${manifest.id}"`,
      );
    }
    validateReplayFragment(fragment, manifest, canonicalPlan);
    retained.set(fingerprint, fragment);
  }
  const missingManifest = canonicalPlan.manifests.find(
    ({ fingerprint }) => !retained.has(fingerprint),
  );
  if (missingManifest || retained.size !== canonicalPlan.manifests.length) {
    throw new AdoptionContractError(
      `missing replay fragment for manifest "${missingManifest?.id || 'unknown'}"`,
    );
  }

  const fragmentsByCell = new Map();
  for (const manifest of canonicalPlan.manifests) {
    const key = cellKey(manifest.cell);
    const values = fragmentsByCell.get(key) || [];
    values.push({
      manifest,
      fragment: retained.get(manifest.fingerprint),
    });
    fragmentsByCell.set(key, values);
  }

  const cells = [];
  const allFailures = [];
  for (const values of fragmentsByCell.values()) {
    const [{ manifest: firstManifest }] = values;
    const failures = [];
    for (const { manifest, fragment } of values) {
      for (const result of fragment.cases) {
        const planned = manifest.cases.find(({ id }) => id === result.id);
        for (const failure of result.failures) {
          failures.push({
            manifest_fingerprint: manifest.fingerprint,
            definition_fingerprint: manifest.definition.fingerprint,
            selector: planned.selector,
            host: manifest.cell.host,
            tier: manifest.cell.tier,
            model: manifest.cell.model,
            gate: failure.gate,
            critical: planned.critical || failure.critical,
            evidence_pointer: failure.evidence_pointer,
          });
        }
      }
    }
    failures.push(...criticalPlanningFailures(values));
    const planning = planningSummary(values.map(({ fragment }) => fragment));
    for (const gate of planning.gates.filter(({ passed }) => !passed)) {
      failures.push({
        manifest_fingerprint: null,
        definition_fingerprint: null,
        selector: 'planning-aggregate',
        host: firstManifest.cell.host,
        tier: firstManifest.cell.tier,
        model: firstManifest.cell.model,
        gate: gate.gate,
        critical: false,
        evidence_pointer: `campaign://${canonicalPlan.fingerprint}/planning/${
          firstManifest.cell.host
        }/${firstManifest.cell.tier}/${gate.gate}`,
      });
    }
    const cell = {
      ...structuredClone(firstManifest.cell),
      passed: failures.length === 0,
      critical_failure: failures.some(({ critical }) => critical),
      planning,
      failures,
      executor_sizing: values.map(({ manifest, fragment }) => ({
        manifest_fingerprint: manifest.fingerprint,
        value: structuredClone(fragment.executor_sizing),
      })),
    };
    cells.push(cell);
    allFailures.push(...failures);
  }
  cells.sort((left, right) => cellKey(left).localeCompare(cellKey(right)));
  const aggregate = {
    schema_version: 1,
    kind: 'adoption-campaign-aggregate-replay',
    campaign_fingerprint: canonicalPlan.fingerprint,
    passed: cells.every(({ passed }) => passed),
    critical_failure: cells.some(({ critical_failure }) => critical_failure),
    cells,
    failures: allFailures,
  };
  aggregate.fingerprint = fingerprintValue(aggregate);
  return frozenClone(aggregate);
}

function buildHumanReviewPacketIndex({ repositoryRoot, plan, fragments }) {
  const aggregate = replayCampaignAggregate({
    repositoryRoot,
    plan,
    fragments,
  });
  const retained = new Map(
    fragments.map((fragment) => [fragment.manifest_fingerprint, fragment]),
  );
  const entries = aggregate.failures.map((failure) => ({
    kind: 'failure',
    selector: failure.selector,
    host: failure.host,
    tier: failure.tier,
    model: failure.model,
    gate: failure.gate,
    critical: failure.critical,
    manifest_fingerprint: failure.manifest_fingerprint,
    definition_fingerprint: failure.definition_fingerprint,
    provenance_pointers: [failure.evidence_pointer],
  }));
  const sampleShortfalls = [];
  const passingSample = new Set(
    plan.configuration.human_review.passing_sample,
  );
  for (const manifest of plan.manifests) {
    const sampledCases = manifest.cases.filter(
      ({ selector }) => passingSample.has(selector),
    );
    if (sampledCases.length === 0) continue;
    const fragment = retained.get(manifest.fingerprint);
    for (const planned of sampledCases) {
      const result = fragment.cases.find(({ id }) => id === planned.id);
      if (!result.passed) {
        sampleShortfalls.push({
          selector: planned.selector,
          host: manifest.cell.host,
          tier: manifest.cell.tier,
          model: manifest.cell.model,
        });
        continue;
      }
      entries.push({
        kind: 'passing-sample',
        selector: planned.selector,
        host: manifest.cell.host,
        tier: manifest.cell.tier,
        model: manifest.cell.model,
        gate: null,
        critical: false,
        manifest_fingerprint: manifest.fingerprint,
        definition_fingerprint: manifest.definition.fingerprint,
        provenance_pointers: [
          fragment.provenance.replay_result,
          ...result.passes.map(({ evidence_pointer: pointer }) => pointer),
        ],
      });
    }
  }
  entries.sort((left, right) => (
    `${left.kind}\0${left.selector}\0${left.host}\0${left.tier}\0${left.gate}`
      .localeCompare(
        `${right.kind}\0${right.selector}\0${right.host}\0${right.tier}\0${right.gate}`,
      )
  ));
  const index = {
    schema_version: 1,
    kind: 'adoption-human-review-packet-index',
    campaign_fingerprint: plan.fingerprint,
    aggregate_fingerprint: aggregate.fingerprint,
    entries,
    passing_sample_shortfalls: sampleShortfalls,
  };
  index.fingerprint = fingerprintValue(index);
  return frozenClone(index);
}

function adoptionRunnerApi(name, args) {
  return require('./runner')[name](...args);
}

module.exports = {
  AdoptionContractError,
  buildCampaignPlan,
  buildHumanReviewPacket(...args) {
    return adoptionRunnerApi('buildHumanReviewPacket', args);
  },
  buildHumanReviewPacketIndex,
  loadCanonicalEvaluationDefinitions,
  loadCampaignPlan(...args) {
    return adoptionRunnerApi('loadCampaignPlan', args);
  },
  paidExecutionAcknowledgement(...args) {
    return adoptionRunnerApi('paidExecutionAcknowledgement', args);
  },
  prepareCampaignPlan(...args) {
    return adoptionRunnerApi('prepareCampaignPlan', args);
  },
  replayCampaignAggregate,
  replayCampaignArtifacts(...args) {
    return adoptionRunnerApi('replayCampaignArtifacts', args);
  },
  runCampaign(...args) {
    return adoptionRunnerApi('runCampaign', args);
  },
  validateCampaignConfiguration,
  validateCampaignCoverage,
  validateCampaignPlan,
};
