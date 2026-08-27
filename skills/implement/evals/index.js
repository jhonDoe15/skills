'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { validateResult } = require('../../../suite');
const {
  validateEvaluationDefinition,
} = require('../../../suite/evaluation');

const DEFINITION_PATH = path.join(__dirname, 'evals.json');
const LAYERS = ['role', 'component', 'outcome', 'trigger'];
const FAILURE_KINDS = new Set([
  'guidance',
  'test',
  'validation',
  'implementation',
]);
const DISPOSITIONS = new Set([
  'applicable-now',
  'applicable-later',
  'not-applicable',
]);
const CONCERN_IDS = [
  'intent-and-scope',
  'responsibilities-and-seams',
  'dependencies-and-contracts',
  'state-and-invariants',
  'failure-and-boundaries',
  'simplicity-and-reuse',
  'compatibility-and-change',
  'maintainer-legibility',
  'evidence-and-validation',
];
const HANDOFF_FIELDS = [
  'schema',
  'status',
  'requirements',
  'implementation_range',
  'guidance_coverage',
  'changed_behavior',
  'changed_files',
  'tests',
  'validation',
  'unresolved_risks',
  'correction',
  'failure',
];
const FORBIDDEN_TOOL_NAMES = new Set(['code-review']);
const FORBIDDEN_MUTATIONS = new Set([
  'review-comment',
  'pull-request-create',
  'pull-request-update',
  'issue-close',
  'issue-comment',
  'issue-dependency-update',
]);

class ImplementEvaluationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ImplementEvaluationError';
  }
}

function requireObject(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ImplementEvaluationError(`${field} must be an object`);
  }
}

function requireExactFields(value, fields, field) {
  requireObject(value, field);
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new ImplementEvaluationError(`${field} fields are invalid`);
  }
}

function requireString(value, field) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ImplementEvaluationError(`${field} must be a non-empty string`);
  }
}

function requireStringArray(value, field, allowEmpty = false) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    throw new ImplementEvaluationError(
      `${field} must be ${allowEmpty ? 'an array' : 'a non-empty array'}`,
    );
  }
  value.forEach((item, index) => requireString(item, `${field}[${index}]`));
}

function requireSha(value, field, allowNull = false) {
  if (allowNull && value === null) return;
  if (typeof value !== 'string' || !/^[a-f0-9]{40}$/.test(value)) {
    throw new ImplementEvaluationError(`${field} must be an immutable SHA`);
  }
}

function validateEvidence(items, field, allowEmpty) {
  if (!Array.isArray(items) || (!allowEmpty && items.length === 0)) {
    throw new ImplementEvaluationError(`${field} is incomplete`);
  }
  items.forEach((item, index) => {
    requireExactFields(
      item,
      ['command', 'outcome', 'evidence'],
      `${field}[${index}]`,
    );
    requireString(item.command, `${field}[${index}].command`);
    requireString(item.outcome, `${field}[${index}].outcome`);
    requireString(item.evidence, `${field}[${index}].evidence`);
  });
}

function validateGuidanceAuthority(authority, index) {
  const field = `handoff.guidance_coverage.authorities[${index}]`;
  requireExactFields(authority, ['source', 'references'], field);
  requireString(authority.source, `${field}.source`);
  requireStringArray(authority.references, `${field}.references`);
}

function validateGuidanceConcern(concern, index) {
  const field = `handoff.guidance_coverage.concerns[${index}]`;
  requireExactFields(
    concern,
    ['id', 'disposition', 'sources', 'notes'],
    field,
  );
  requireString(concern.id, `${field}.id`);
  if (!DISPOSITIONS.has(concern.disposition)) {
    throw new ImplementEvaluationError(`${field}.disposition is invalid`);
  }
  requireStringArray(
    concern.sources,
    `${field}.sources`,
    concern.disposition === 'not-applicable',
  );
  requireString(concern.notes, `${field}.notes`);
}

function validateGuidanceCoverage(coverage, complete) {
  requireExactFields(
    coverage,
    ['dependency', 'authorities', 'concerns', 'unresolved_gaps'],
    'handoff.guidance_coverage',
  );
  if (coverage.dependency !== 'engineering-guidance') {
    throw new ImplementEvaluationError(
      'handoff.guidance_coverage.dependency must be "engineering-guidance"',
    );
  }
  if (!Array.isArray(coverage.authorities)) {
    throw new ImplementEvaluationError(
      'handoff.guidance_coverage.authorities must be an array',
    );
  }
  coverage.authorities.forEach(validateGuidanceAuthority);
  if (!Array.isArray(coverage.concerns)) {
    throw new ImplementEvaluationError(
      'handoff.guidance_coverage.concerns must be an array',
    );
  }
  coverage.concerns.forEach(validateGuidanceConcern);
  requireStringArray(
    coverage.unresolved_gaps,
    'handoff.guidance_coverage.unresolved_gaps',
    true,
  );
  if (complete) {
    if (coverage.authorities.length === 0) {
      throw new ImplementEvaluationError(
        'completed handoff requires guidance authority',
      );
    }
    const actual = coverage.concerns.map(({ id }) => id);
    if (JSON.stringify(actual) !== JSON.stringify(CONCERN_IDS)) {
      throw new ImplementEvaluationError(
        'completed handoff requires the complete concern index',
      );
    }
  }
}

function validateImplementHandoff(handoff) {
  requireExactFields(handoff, HANDOFF_FIELDS, 'handoff');
  if (handoff.schema !== 'implement-handoff/v1') {
    throw new ImplementEvaluationError('handoff schema is invalid');
  }
  if (!['completed', 'failed'].includes(handoff.status)) {
    throw new ImplementEvaluationError('handoff status is invalid');
  }

  requireExactFields(
    handoff.requirements,
    ['references', 'summary'],
    'handoff.requirements',
  );
  requireStringArray(
    handoff.requirements.references,
    'handoff.requirements.references',
  );
  requireString(handoff.requirements.summary, 'handoff.requirements.summary');

  requireExactFields(
    handoff.implementation_range,
    ['base', 'head'],
    'handoff.implementation_range',
  );
  requireSha(handoff.implementation_range.base, 'handoff.implementation_range.base');
  const completed = handoff.status === 'completed';
  requireSha(
    handoff.implementation_range.head,
    'handoff.implementation_range.head',
    !completed,
  );
  validateGuidanceCoverage(handoff.guidance_coverage, completed);
  requireStringArray(
    handoff.changed_behavior,
    'handoff.changed_behavior',
    !completed,
  );
  requireStringArray(handoff.changed_files, 'handoff.changed_files', !completed);
  validateEvidence(handoff.tests, 'handoff.tests', !completed);
  validateEvidence(handoff.validation, 'handoff.validation', !completed);
  requireStringArray(
    handoff.unresolved_risks,
    'handoff.unresolved_risks',
    true,
  );
  requireExactFields(
    handoff.correction,
    ['state', 'next_action'],
    'handoff.correction',
  );
  requireString(handoff.correction.next_action, 'handoff.correction.next_action');

  if (completed) {
    if (handoff.failure !== null) {
      throw new ImplementEvaluationError(
        'completed handoff cannot contain a failure',
      );
    }
    if (handoff.correction.state !== 'ready') {
      throw new ImplementEvaluationError(
        'completed handoff must be correction-ready',
      );
    }
    return handoff;
  }

  requireExactFields(
    handoff.failure,
    ['kind', 'stage', 'message'],
    'handoff.failure',
  );
  if (!FAILURE_KINDS.has(handoff.failure.kind)) {
    throw new ImplementEvaluationError('handoff.failure.kind is invalid');
  }
  requireString(handoff.failure.stage, 'handoff.failure.stage');
  requireString(handoff.failure.message, 'handoff.failure.message');
  if (handoff.correction.state !== 'blocked') {
    throw new ImplementEvaluationError('failed handoff must be blocked');
  }
  if (handoff.implementation_range.head !== null) {
    throw new ImplementEvaluationError(
      'failed handoff cannot claim a completed implementation range',
    );
  }
  return handoff;
}

function check(name, passed, details) {
  return { name, passed, details };
}

function resultText(result) {
  return result.observations.responses.map(({ text }) => text).join('\n\n');
}

function loadedSkill(result, name) {
  return result.observations.skillEvents.some((event) => (
    event.name === name
      && event.operation === 'load'
      && event.status === 'succeeded'
  ));
}

function gradeImplementResult({ result, resolveArtifact = () => null }) {
  validateResult(result);
  const { observations } = result;
  const artifacts = observations.artifacts;
  const artifact = artifacts.length === 1 ? artifacts[0] : null;
  const serialized = artifact?.mediaType === 'application/json'
    ? resolveArtifact(artifact.reference)
    : null;
  let handoff = null;
  let artifactError = null;
  if (typeof serialized === 'string') {
    try {
      handoff = validateImplementHandoff(JSON.parse(serialized));
    } catch (error) {
      artifactError = error.message;
    }
  }
  const implementLoaded = loadedSkill(result, 'implement');
  const guidanceLoaded = loadedSkill(result, 'engineering-guidance');

  const checks = [
    check(
      'one readable JSON handoff',
      handoff !== null,
      handoff ? artifact.reference : (artifactError || 'artifact unavailable'),
    ),
    check(
      'response references handoff',
      artifact !== null && resultText(result).includes(artifact.reference),
      artifact?.reference || 'artifact absent',
    ),
    check(
      'Implement lifecycle observed',
      implementLoaded,
      `loaded=${implementLoaded}`,
    ),
    check(
      'no full Code Review',
      !observations.toolUses.some(({ name }) => (
        FORBIDDEN_TOOL_NAMES.has(name)
      )),
      `tools=${observations.toolUses.map(({ name }) => name).join(',')}`,
    ),
    check(
      'no ticket or PR topology mutation',
      !observations.attemptedMutations.some(({ operation }) => (
        FORBIDDEN_MUTATIONS.has(operation)
      )),
      `mutations=${observations.attemptedMutations
        .map(({ operation }) => operation).join(',')}`,
    ),
  ];

  if (handoff?.status === 'completed') {
    checks.push(check(
      'completed result and guidance load',
      result.status === 'succeeded'
        && guidanceLoaded,
      `status=${result.status} guidance=${guidanceLoaded}`,
    ));
  } else if (handoff?.failure.kind === 'guidance') {
    checks.push(check(
      'guidance failure stops before mutation',
      result.status === 'failed'
        && observations.attemptedMutations.length === 0
        && handoff.failure.message
          === 'Missing internal dependency "engineering-guidance"',
      `status=${result.status} mutations=${
        observations.attemptedMutations.length
      } message=${handoff.failure.message}`,
    ));
  } else if (handoff) {
    checks.push(check(
      'failed artifact is not complete',
      result.status === 'failed',
      `status=${result.status} kind=${handoff.failure.kind}`,
    ));
  }

  return {
    passed: checks.every(({ passed }) => passed),
    checks,
  };
}

function loadCatalog() {
  const catalog = JSON.parse(fs.readFileSync(DEFINITION_PATH, 'utf8'));
  requireObject(catalog.evaluation_policy, 'evaluation_policy');
  const expectedPolicy = {
    fresh_sessions: true,
    matched_no_skill: true,
    trigger_separate: true,
    semantic_grade: 'blind-model-with-output-evidence',
    human_review: 'every-failure-and-predeclared-passing-sample',
    generated_artifacts: 'uncommitted',
  };
  if (JSON.stringify(catalog.evaluation_policy) !== JSON.stringify(expectedPolicy)) {
    throw new ImplementEvaluationError('evaluation policy is incomplete');
  }
  return catalog;
}

function definitionForLayer(catalog, layer) {
  let arms = ['no-skill', 'treatment'];
  if (layer === 'component') {
    arms = ['treatment', 'component-ablation'];
  } else if (layer === 'trigger') {
    arms = ['treatment'];
  }
  return {
    skill_name: catalog.skill_name,
    version: catalog.version,
    evaluation: {
      scope: `implement-${layer}`,
      layer,
      skill: catalog.skill_name,
      hosts: [...catalog.hosts],
      arms,
    },
    config: {
      ...catalog.config,
      minimum_treatment_win_rate: layer === 'trigger'
        ? 0
        : catalog.config.minimum_treatment_win_rate,
      randomization_seed: `${catalog.config.randomization_seed}-${layer}`,
    },
    signals: {},
    global_required_signals: [],
    global_order: [],
    forbidden_patterns: [],
    judge: structuredClone(catalog.judge),
    evals: catalog.evals
      .filter((evaluation) => evaluation.layer === layer)
      .map((evaluation) => {
        const normalized = structuredClone(evaluation);
        delete normalized.layer;
        return normalized;
      }),
  };
}

function loadDefinitions(repositoryRoot) {
  const catalog = loadCatalog();
  return LAYERS.map((layer) => {
    const definition = definitionForLayer(catalog, layer);
    validateEvaluationDefinition(definition, repositoryRoot);
    return definition;
  });
}

module.exports = {
  ImplementEvaluationError,
  gradeImplementResult,
  loadDefinitions,
  validateImplementHandoff,
};
