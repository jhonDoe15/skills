'use strict';

const FAILURE_STAGES = new Map([
  ['guidance', 'before-mutation'],
  ['test', 'test'],
  ['validation', 'validation'],
  ['implementation', 'implementation'],
]);
const SUCCESSFUL_VALIDATION_OUTCOME = 'passed';
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
  'lifecycle',
  'changed_behavior',
  'changed_files',
  'tests',
  'validation',
  'unresolved_risks',
  'correction',
  'failure',
];
const LIFECYCLE_STATUSES = new Map([
  ['guidance', new Set(['completed', 'failed'])],
  ['test', new Set(['red', 'green', 'failed'])],
  ['mutation', new Set(['attempted', 'succeeded', 'failed'])],
  ['validation', new Set(['completed', 'failed'])],
  ['range', new Set(['pinned'])],
  ['implementation', new Set(['failed'])],
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

function validateTestItem(item, index) {
  const field = `handoff.tests[${index}]`;
  requireExactFields(
    item,
    ['behavior', 'phase', 'command', 'outcome', 'evidence'],
    field,
  );
  for (const name of ['behavior', 'command', 'outcome', 'evidence']) {
    requireString(item[name], `${field}.${name}`);
  }
  if (!['red', 'green'].includes(item.phase)) {
    throw new ImplementEvaluationError(`${field}.phase is invalid`);
  }
}

function redGreenPairsAreComplete(tests) {
  if (tests.length % 2 !== 0) return false;

  for (let index = 0; index < tests.length; index += 2) {
    const red = tests[index];
    const green = tests[index + 1];
    if (
      red.phase !== 'red'
      || red.outcome !== 'failed-as-expected'
      || green.phase !== 'green'
      || green.outcome !== 'passed'
      || green.behavior !== red.behavior
      || green.command !== red.command
    ) {
      return false;
    }
  }
  return true;
}

function validateTests(tests, complete) {
  if (!Array.isArray(tests) || (complete && tests.length === 0)) {
    throw new ImplementEvaluationError('handoff.tests is incomplete');
  }
  tests.forEach(validateTestItem);
  if (!complete) return;

  if (!redGreenPairsAreComplete(tests)) {
    throw new ImplementEvaluationError(
      'completed handoff tests require ordered red then green evidence '
        + 'for the same behavior and command',
    );
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
  if (!complete) return;
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

function validateLifecycle(lifecycle, complete) {
  if (!Array.isArray(lifecycle) || lifecycle.length === 0) {
    throw new ImplementEvaluationError('handoff.lifecycle must be non-empty');
  }
  lifecycle.forEach((event, index) => {
    const field = `handoff.lifecycle[${index}]`;
    requireExactFields(
      event,
      ['sequence', 'kind', 'status', 'reference'],
      field,
    );
    if (event.sequence !== index + 1) {
      throw new ImplementEvaluationError(
        'handoff.lifecycle sequence must be contiguous and ordered',
      );
    }
    requireString(event.kind, `${field}.kind`);
    requireString(event.status, `${field}.status`);
    requireString(event.reference, `${field}.reference`);
    if (!LIFECYCLE_STATUSES.get(event.kind)?.has(event.status)) {
      throw new ImplementEvaluationError(`${field} kind/status is invalid`);
    }
  });
  if (!complete) return;

  const firstMutationIndex = lifecycle.findIndex(({ kind }) => kind === 'mutation');
  const completedGuidanceIndex = lifecycle.findIndex((event) => (
    event.kind === 'guidance' && event.status === 'completed'
  ));
  const guidancePrecedesMutation = completedGuidanceIndex !== -1
    && firstMutationIndex !== -1
    && completedGuidanceIndex < firstMutationIndex;
  if (!guidancePrecedesMutation) {
    throw new ImplementEvaluationError(
      'completed guidance must precede the first mutation',
    );
  }
}

function lifecycleEntries(lifecycle, kind) {
  return lifecycle
    .filter((event) => event.kind === kind)
    .map(({ status, reference }) => ({ status, reference }));
}

function sameLifecycleEntries(actual, expected) {
  return actual.length === expected.length
    && actual.every((entry, index) => (
      entry.status === expected[index].status
      && entry.reference === expected[index].reference
    ));
}

function requireMatchingLifecycleEntries(lifecycle, kind, expected, message) {
  const actual = lifecycleEntries(lifecycle, kind);
  if (!sameLifecycleEntries(actual, expected)) {
    throw new ImplementEvaluationError(message);
  }
}

function validateCompletedLifecycle({
  tests,
  validation,
  implementation_range: implementationRange,
  lifecycle,
  changed_files: changedFiles,
}) {
  const testEntries = tests.map(({ behavior, phase, command }) => ({
    status: phase,
    reference: JSON.stringify([behavior, command]),
  }));
  requireMatchingLifecycleEntries(
    lifecycle,
    'test',
    testEntries,
    'lifecycle test evidence must match handoff.tests',
  );
  const lifecycleTestIndexes = lifecycle.flatMap((event, index) => (
    event.kind === 'test' ? [index] : []
  ));
  for (let index = 0; index < lifecycleTestIndexes.length; index += 2) {
    const redIndex = lifecycleTestIndexes[index];
    const greenIndex = lifecycleTestIndexes[index + 1];
    const hasSuccessfulMutation = lifecycle
      .slice(redIndex + 1, greenIndex)
      .some((event) => (
        event.kind === 'mutation' && event.status === 'succeeded'
      ));
    if (!hasSuccessfulMutation) {
      throw new ImplementEvaluationError(
        'completed handoff requires a successful mutation between red and green',
      );
    }
  }

  const hasNonPassingValidation = validation.some(
    ({ outcome }) => outcome !== SUCCESSFUL_VALIDATION_OUTCOME,
  );
  if (hasNonPassingValidation) {
    throw new ImplementEvaluationError(
      'completed handoff validation outcome must be passed',
    );
  }
  const validationEntries = validation.map(({ command, outcome }) => ({
    status: 'completed',
    reference: JSON.stringify([command, outcome]),
  }));
  requireMatchingLifecycleEntries(
    lifecycle,
    'validation',
    validationEntries,
    'lifecycle validation evidence must match handoff.validation',
  );

  const expectedRange = `${implementationRange.base}..${implementationRange.head}`;
  const rangeEntries = lifecycleEntries(lifecycle, 'range');
  if (!sameLifecycleEntries(rangeEntries, [{
    status: 'pinned',
    reference: expectedRange,
  }]) || lifecycle.at(-1).kind !== 'range') {
    throw new ImplementEvaluationError(
      'lifecycle must pin the exact implementation range',
    );
  }

  const mutationTargets = new Set(
    lifecycleEntries(lifecycle, 'mutation')
      .filter(({ status }) => status === 'succeeded')
      .map(({ reference }) => {
        const separator = reference.indexOf(':');
        return separator > 0 ? reference.slice(separator + 1) : null;
      }),
  );
  if (!changedFiles.every((file) => mutationTargets.has(file))) {
    throw new ImplementEvaluationError(
      'lifecycle mutations must cover every changed file',
    );
  }
}

function validateFailedLifecycle({ failure, lifecycle }) {
  const { kind, stage } = failure;
  const failedKinds = lifecycle
    .filter((event) => event.status === 'failed' && FAILURE_STAGES.has(event.kind))
    .map((event) => event.kind);
  if (!failedKinds.includes(kind)) {
    throw new ImplementEvaluationError(
      'lifecycle must include the declared failure kind',
    );
  }
  if (failedKinds.some((failedKind) => failedKind !== kind)) {
    throw new ImplementEvaluationError(
      'lifecycle contains conflicting failure kinds',
    );
  }
  if (stage !== FAILURE_STAGES.get(kind)) {
    throw new ImplementEvaluationError('failure stage does not match its kind');
  }
}

function validateImplementHandoff(handoff) {
  requireExactFields(handoff, HANDOFF_FIELDS, 'handoff');
  if (handoff.schema !== 'implement-handoff/v2') {
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
  validateLifecycle(handoff.lifecycle, completed);
  requireStringArray(
    handoff.changed_behavior,
    'handoff.changed_behavior',
    !completed,
  );
  requireStringArray(handoff.changed_files, 'handoff.changed_files', !completed);
  validateTests(handoff.tests, completed);
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
    validateCompletedLifecycle(handoff);
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
  if (!FAILURE_STAGES.has(handoff.failure.kind)) {
    throw new ImplementEvaluationError('handoff.failure.kind is invalid');
  }
  requireString(handoff.failure.stage, 'handoff.failure.stage');
  requireString(handoff.failure.message, 'handoff.failure.message');
  validateFailedLifecycle(handoff);
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

module.exports = {
  ImplementEvaluationError,
  validateImplementHandoff,
};
