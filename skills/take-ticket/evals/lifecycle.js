'use strict';

const RESULT_FIELDS = [
  'schema',
  'status',
  'requirements',
  'implementation',
  'full_review',
  'correction',
  'targeted_re_review',
  'lifecycle',
  'artifacts',
  'completeness',
  'failure',
];
const PHASES = [
  'implementation',
  'full-review',
  'correction',
  'targeted-re-review',
];
const PHASE_STATUSES = new Set([
  'completed',
  'failed',
  'incomplete',
  'not-required',
]);

class TakeTicketEvaluationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TakeTicketEvaluationError';
  }
}

function requireObject(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TakeTicketEvaluationError(`${field} must be an object`);
  }
}

function requireExactFields(value, fields, field) {
  requireObject(value, field);
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new TakeTicketEvaluationError(`${field} fields are invalid`);
  }
}

function requireString(value, field) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TakeTicketEvaluationError(`${field} must be a non-empty string`);
  }
}

function requireSha(value, field) {
  if (typeof value !== 'string' || !/^[a-f0-9]{40}$/.test(value)) {
    throw new TakeTicketEvaluationError(`${field} must be an immutable SHA`);
  }
}

function requireStringArray(value, field, allowEmpty = false) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    throw new TakeTicketEvaluationError(`${field} is incomplete`);
  }
  value.forEach((item, index) => requireString(item, `${field}[${index}]`));
  if (new Set(value).size !== value.length) {
    throw new TakeTicketEvaluationError(`${field} contains duplicates`);
  }
}

function haveExactUniqueMembers(left, right) {
  if (left.length !== right.length) return false;
  const actual = new Set(left);
  const expected = new Set(right);
  return actual.size === left.length
    && expected.size === right.length
    && [...actual].every((value) => expected.has(value));
}

function validateDescriptor(value, field, fields = ['reference', 'mediaType']) {
  requireExactFields(value, fields, field);
  requireString(value.reference, `${field}.reference`);
  requireString(value.mediaType, `${field}.mediaType`);
}

function validateValidation(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TakeTicketEvaluationError('result.implementation.validation is incomplete');
  }
  value.forEach((entry, index) => {
    const field = `result.implementation.validation[${index}]`;
    requireExactFields(entry, ['command', 'outcome', 'evidence'], field);
    requireString(entry.command, `${field}.command`);
    requireString(entry.evidence, `${field}.evidence`);
    if (entry.outcome !== 'passed') {
      throw new TakeTicketEvaluationError(
        'reviewed result requires passing implementation validation',
      );
    }
  });
}

function validateImplementation(value) {
  requireExactFields(value, ['range', 'handoff', 'validation'], 'result.implementation');
  requireExactFields(value.range, ['base', 'head'], 'result.implementation.range');
  requireSha(value.range.base, 'result.implementation.range.base');
  requireSha(value.range.head, 'result.implementation.range.head');
  validateDescriptor(
    value.handoff,
    'result.implementation.handoff',
    ['reference', 'mediaType', 'schema'],
  );
  if (value.handoff.schema !== 'implement-handoff/v2') {
    throw new TakeTicketEvaluationError(
      'implementation handoff must use implement-handoff/v2',
    );
  }
  validateValidation(value.validation);
}

function validateReview(value) {
  requireExactFields(
    value,
    ['authority', 'kind', 'outcome', 'brief', 'finding_dispositions'],
    'result.full_review',
  );
  requireExactFields(
    value.authority,
    ['source', 'inherited', 'references'],
    'result.full_review.authority',
  );
  requireString(value.authority.source, 'result.full_review.authority.source');
  requireStringArray(
    value.authority.references,
    'result.full_review.authority.references',
  );
  if (value.authority.inherited !== false) {
    throw new TakeTicketEvaluationError(
      'full Review authority must be resolved independently',
    );
  }
  if (value.kind !== 'full') {
    throw new TakeTicketEvaluationError('result.full_review.kind must be "full"');
  }
  if (!['clean', 'findings'].includes(value.outcome)) {
    throw new TakeTicketEvaluationError('result.full_review.outcome is invalid');
  }
  validateDescriptor(value.brief, 'result.full_review.brief');
  if (!Array.isArray(value.finding_dispositions)) {
    throw new TakeTicketEvaluationError(
      'result.full_review.finding_dispositions must be an array',
    );
  }
  const findingIds = [];
  value.finding_dispositions.forEach((finding, index) => {
    const field = `result.full_review.finding_dispositions[${index}]`;
    requireExactFields(finding, ['id', 'disposition', 'regions'], field);
    requireString(finding.id, `${field}.id`);
    if (!['accepted', 'rejected', 'deferred'].includes(finding.disposition)) {
      throw new TakeTicketEvaluationError(`${field}.disposition is invalid`);
    }
    requireStringArray(finding.regions, `${field}.regions`);
    findingIds.push(finding.id);
  });
  if (new Set(findingIds).size !== findingIds.length) {
    throw new TakeTicketEvaluationError('Review finding dispositions contain duplicates');
  }
  if ((value.outcome === 'clean') !== (findingIds.length === 0)) {
    throw new TakeTicketEvaluationError(
      'full Review outcome contradicts finding dispositions',
    );
  }
}

function acceptedFindingIds(fullReview) {
  return fullReview.finding_dispositions
    .filter(({ disposition }) => disposition === 'accepted')
    .map(({ id }) => id);
}

function validateCorrection(value, fullReview, implementation) {
  requireExactFields(
    value,
    ['state', 'range', 'scopes', 'evidence'],
    'result.correction',
  );
  const accepted = acceptedFindingIds(fullReview);
  const correctionRequired = accepted.length > 0;
  const expectedState = correctionRequired ? 'completed' : 'not-required';
  if (value.state !== expectedState) {
    throw new TakeTicketEvaluationError(
      `correction must be ${expectedState} for accepted findings`,
    );
  }
  if (!Array.isArray(value.scopes) || !Array.isArray(value.evidence)) {
    throw new TakeTicketEvaluationError('result.correction collections are invalid');
  }
  if (!correctionRequired) {
    if (value.range !== null || value.scopes.length > 0 || value.evidence.length > 0) {
      throw new TakeTicketEvaluationError('clean Review cannot contain correction work');
    }
    return;
  }

  requireExactFields(value.range, ['base', 'head'], 'result.correction.range');
  requireSha(value.range.base, 'result.correction.range.base');
  requireSha(value.range.head, 'result.correction.range.head');
  if (value.range.base !== implementation.range.head) {
    throw new TakeTicketEvaluationError(
      'correction range must start at the implementation head',
    );
  }
  const scopedFindings = [];
  value.scopes.forEach((scope, index) => {
    const field = `result.correction.scopes[${index}]`;
    requireExactFields(
      scope,
      ['finding_id', 'regions', 'materially_affected_regions'],
      field,
    );
    requireString(scope.finding_id, `${field}.finding_id`);
    requireStringArray(scope.regions, `${field}.regions`);
    requireStringArray(
      scope.materially_affected_regions,
      `${field}.materially_affected_regions`,
      true,
    );
    scopedFindings.push(scope.finding_id);
  });
  if (!haveExactUniqueMembers(scopedFindings, accepted)) {
    throw new TakeTicketEvaluationError(
      'correction scope must match every accepted finding',
    );
  }
  if (value.evidence.length === 0) {
    throw new TakeTicketEvaluationError('correction evidence is incomplete');
  }
  const evidenceFindings = [];
  value.evidence.forEach((descriptor, index) => {
    const field = `result.correction.evidence[${index}]`;
    validateDescriptor(
      descriptor,
      field,
      ['finding_id', 'reference', 'mediaType'],
    );
    requireString(descriptor.finding_id, `${field}.finding_id`);
    evidenceFindings.push(descriptor.finding_id);
  });
  if (!haveExactUniqueMembers(evidenceFindings, accepted)) {
    throw new TakeTicketEvaluationError(
      'correction evidence must cover every accepted finding',
    );
  }
}

function requiredTargetRegions(correction) {
  return correction.scopes.flatMap((scope) => [
    ...scope.regions,
    ...scope.materially_affected_regions,
  ]);
}

function validateLifecyclePosition(event, index) {
  const field = `result.lifecycle[${index}]`;
  requireExactFields(event, ['sequence', 'phase', 'status', 'reference'], field);
  if (event.sequence !== index + 1 || event.phase !== PHASES[index]) {
    throw new TakeTicketEvaluationError(
      'result.lifecycle sequence must be contiguous and ordered',
    );
  }
}

function validateTargetedReview(value, correction, fullReview) {
  requireExactFields(
    value,
    ['state', 'regions', 'dispositions', 'artifact'],
    'result.targeted_re_review',
  );
  const accepted = acceptedFindingIds(fullReview);
  const required = requiredTargetRegions(correction);
  const reviewRequired = accepted.length > 0;
  const expectedState = reviewRequired ? 'completed' : 'not-required';
  if (value.state !== expectedState) {
    throw new TakeTicketEvaluationError(
      `targeted re-review must be ${expectedState}`,
    );
  }
  requireStringArray(
    value.regions,
    'result.targeted_re_review.regions',
    !reviewRequired,
  );
  if (!Array.isArray(value.dispositions)) {
    throw new TakeTicketEvaluationError(
      'result.targeted_re_review.dispositions must be an array',
    );
  }
  if (!reviewRequired) {
    if (value.artifact !== null || value.dispositions.length > 0) {
      throw new TakeTicketEvaluationError(
        'clean Review cannot contain targeted re-review work',
      );
    }
    return;
  }
  if (!required.every((region) => value.regions.includes(region))) {
    throw new TakeTicketEvaluationError(
      'targeted re-review must cover every corrected and materially affected region',
    );
  }
  if (value.regions.length !== new Set(required).size) {
    throw new TakeTicketEvaluationError(
      'targeted re-review regions must exactly match correction effects',
    );
  }
  validateDescriptor(value.artifact, 'result.targeted_re_review.artifact');
  const dispositionKeys = new Set();
  value.dispositions.forEach((disposition, index) => {
    const field = `result.targeted_re_review.dispositions[${index}]`;
    requireExactFields(disposition, ['finding_id', 'region', 'outcome'], field);
    requireString(disposition.finding_id, `${field}.finding_id`);
    requireString(disposition.region, `${field}.region`);
    if (disposition.outcome !== 'accepted') {
      throw new TakeTicketEvaluationError(
        'reviewed result requires accepted targeted dispositions',
      );
    }
    dispositionKeys.add(`${disposition.finding_id}\0${disposition.region}`);
  });
  for (const scope of correction.scopes) {
    for (const region of [...scope.regions, ...scope.materially_affected_regions]) {
      if (!dispositionKeys.has(`${scope.finding_id}\0${region}`)) {
        throw new TakeTicketEvaluationError(
          'targeted re-review dispositions are incomplete',
        );
      }
    }
  }
}

function validateLifecycle(value, correctionRequired, result) {
  if (!Array.isArray(value)) {
    throw new TakeTicketEvaluationError('result.lifecycle must cover every phase');
  }
  const fullReviewEvents = value.filter(({ phase }) => phase === 'full-review');
  if (fullReviewEvents.length !== 1) {
    throw new TakeTicketEvaluationError(
      'reviewed result requires exactly one full authoritative Review',
    );
  }
  if (value.length !== PHASES.length) {
    throw new TakeTicketEvaluationError('result.lifecycle must cover every phase');
  }
  value.forEach((event, index) => {
    validateLifecyclePosition(event, index);
    const field = `result.lifecycle[${index}]`;
    if (!PHASE_STATUSES.has(event.status)) {
      throw new TakeTicketEvaluationError(`${field}.status is invalid`);
    }
    requireString(event.reference, `${field}.reference`);
  });
  const expectedStatuses = correctionRequired
    ? ['completed', 'completed', 'completed', 'completed']
    : ['completed', 'completed', 'not-required', 'not-required'];
  if (value.some((event, index) => event.status !== expectedStatuses[index])) {
    throw new TakeTicketEvaluationError(
      'reviewed result lifecycle phase statuses are incomplete',
    );
  }
  const expectedReferences = [
    `${result.implementation.range.base}..${result.implementation.range.head}`,
    result.full_review.brief.reference,
    correctionRequired
      ? `${result.correction.range.base}..${result.correction.range.head}`
      : 'clean-review',
    correctionRequired
      ? result.targeted_re_review.artifact.reference
      : 'clean-review',
  ];
  for (const [index, reference] of expectedReferences.entries()) {
    if (value[index].reference !== reference) {
      const phase = PHASES[index];
      throw new TakeTicketEvaluationError(
        `${phase} lifecycle range must match the retained range`,
      );
    }
  }
}

function validateArtifacts(value, result) {
  validatePartialArtifacts(value);
  const descriptors = new Set(
    value.map(({ kind, reference }) => `${kind}\0${reference}`),
  );
  const required = [
    ['implementation-handoff', result.implementation.handoff.reference],
    ['full-review-brief', result.full_review.brief.reference],
  ];
  if (result.correction.state === 'completed') {
    required.push(...result.correction.evidence.map(
      ({ reference }) => ['correction-evidence', reference],
    ));
    required.push([
      'targeted-re-review',
      result.targeted_re_review.artifact.reference,
    ]);
  }
  if (!required.every(([kind, reference]) => descriptors.has(`${kind}\0${reference}`))) {
    throw new TakeTicketEvaluationError('result.artifacts is incomplete');
  }
}

function validateCompleteness(value, correctionRequired) {
  requireExactFields(
    value,
    ['required_phases', 'completed_phases', 'reviewed'],
    'result.completeness',
  );
  requireStringArray(value.required_phases, 'result.completeness.required_phases');
  requireStringArray(value.completed_phases, 'result.completeness.completed_phases');
  const expected = correctionRequired ? PHASES : PHASES.slice(0, 2);
  if (JSON.stringify(value.required_phases) !== JSON.stringify(expected)
    || JSON.stringify(value.completed_phases) !== JSON.stringify(expected)
    || value.reviewed !== true) {
    throw new TakeTicketEvaluationError(
      'reviewed result completeness does not match required phases',
    );
  }
}

function validateReviewedResult(result) {
  if (result.failure !== null) {
    throw new TakeTicketEvaluationError('reviewed result cannot contain a failure');
  }
  validateImplementation(result.implementation);
  validateReview(result.full_review);
  validateCorrection(result.correction, result.full_review, result.implementation);
  validateTargetedReview(
    result.targeted_re_review,
    result.correction,
    result.full_review,
  );
  const correctionRequired = acceptedFindingIds(result.full_review).length > 0;
  validateLifecycle(result.lifecycle, correctionRequired, result);
  validateArtifacts(result.artifacts, result);
  validateCompleteness(result.completeness, correctionRequired);
}

function validatePartialArtifacts(value) {
  if (!Array.isArray(value)) {
    throw new TakeTicketEvaluationError('result.artifacts must be an array');
  }
  value.forEach((artifact, index) => {
    const field = `result.artifacts[${index}]`;
    validateDescriptor(artifact, field, ['kind', 'reference', 'mediaType']);
    requireString(artifact.kind, `${field}.kind`);
  });
}

function validateNonReviewedPhaseData(result, phaseIndex) {
  const values = [
    result.implementation,
    result.full_review,
    result.correction,
    result.targeted_re_review,
  ];
  for (let index = phaseIndex + 1; index < values.length; index += 1) {
    if (values[index] !== null) {
      throw new TakeTicketEvaluationError(
        'phases after the failure must remain incomplete',
      );
    }
  }
  if (phaseIndex > 0) validateImplementation(result.implementation);
  if (phaseIndex > 1) validateReview(result.full_review);

  if (phaseIndex === 0 && result.implementation !== null) {
    throw new TakeTicketEvaluationError(
      'failed implementation cannot contain a completed implementation',
    );
  }
  if (phaseIndex === 1 && result.full_review !== null) {
    throw new TakeTicketEvaluationError(
      'failed full Review cannot contain a completed Review',
    );
  }
  if (phaseIndex === 2) {
    requireExactFields(
      result.correction,
      ['state', 'range', 'scopes', 'evidence'],
      'result.correction',
    );
    if (result.correction.state !== result.failure.status
      || result.correction.range !== null
      || result.correction.evidence.length !== 0
      || !Array.isArray(result.correction.scopes)
      || result.correction.scopes.length === 0) {
      throw new TakeTicketEvaluationError(
        'failed correction must preserve scope without claiming completion',
      );
    }
  }
  if (phaseIndex === 3) {
    validateCorrection(
      result.correction,
      result.full_review,
      result.implementation,
    );
    requireExactFields(
      result.targeted_re_review,
      ['state', 'regions', 'dispositions', 'artifact'],
      'result.targeted_re_review',
    );
    if (result.targeted_re_review.state !== result.failure.status
      || result.targeted_re_review.artifact !== null
      || !Array.isArray(result.targeted_re_review.regions)
      || result.targeted_re_review.regions.length === 0
      || !Array.isArray(result.targeted_re_review.dispositions)) {
      throw new TakeTicketEvaluationError(
        'incomplete targeted re-review must preserve its required regions',
      );
    }
  }
}

function expectedNonReviewedStatus(index, failedPhaseIndex, failureStatus) {
  if (index < failedPhaseIndex) {
    return 'completed';
  }
  if (index === failedPhaseIndex) {
    return failureStatus;
  }
  return 'incomplete';
}

function validateNonReviewedResult(result) {
  requireExactFields(
    result.failure,
    ['phase', 'status', 'message', 'recovery'],
    'result.failure',
  );
  if (!PHASES.includes(result.failure.phase)) {
    throw new TakeTicketEvaluationError('result.failure.phase is invalid');
  }
  if (result.failure.status !== result.status) {
    throw new TakeTicketEvaluationError(
      'result failure status must match the lifecycle status',
    );
  }
  requireString(result.failure.message, 'result.failure.message');
  requireString(result.failure.recovery, 'result.failure.recovery');
  const phaseIndex = PHASES.indexOf(result.failure.phase);

  if (!Array.isArray(result.lifecycle) || result.lifecycle.length !== PHASES.length) {
    throw new TakeTicketEvaluationError('result.lifecycle must cover every phase');
  }
  result.lifecycle.forEach((event, index) => {
    validateLifecyclePosition(event, index);
    const field = `result.lifecycle[${index}]`;
    requireString(event.reference, `${field}.reference`);
    const expectedStatus = expectedNonReviewedStatus(
      index,
      phaseIndex,
      result.failure.status,
    );
    if (event.status !== expectedStatus) {
      throw new TakeTicketEvaluationError(
        'non-reviewed lifecycle status does not match its failed phase',
      );
    }
  });

  requireExactFields(
    result.completeness,
    ['required_phases', 'completed_phases', 'reviewed'],
    'result.completeness',
  );
  requireStringArray(
    result.completeness.required_phases,
    'result.completeness.required_phases',
  );
  requireStringArray(
    result.completeness.completed_phases,
    'result.completeness.completed_phases',
    phaseIndex === 0,
  );
  if (result.completeness.reviewed !== false) {
    throw new TakeTicketEvaluationError(
      'non-reviewed result cannot claim reviewed completeness',
    );
  }
  if (JSON.stringify(result.completeness.completed_phases)
    !== JSON.stringify(PHASES.slice(0, phaseIndex))) {
    throw new TakeTicketEvaluationError(
      'completed phases must stop before the failed phase',
    );
  }
  validateNonReviewedPhaseData(result, phaseIndex);
  validatePartialArtifacts(result.artifacts);
}

function validateTakeTicketResult(result) {
  requireExactFields(result, RESULT_FIELDS, 'result');
  if (result.schema !== 'take-ticket-result/v1') {
    throw new TakeTicketEvaluationError('result schema is invalid');
  }
  if (!['reviewed', 'failed', 'incomplete'].includes(result.status)) {
    throw new TakeTicketEvaluationError('result status is invalid');
  }
  requireExactFields(
    result.requirements,
    ['references', 'summary'],
    'result.requirements',
  );
  requireStringArray(result.requirements.references, 'result.requirements.references');
  requireString(result.requirements.summary, 'result.requirements.summary');
  if (result.status === 'reviewed') validateReviewedResult(result);
  else validateNonReviewedResult(result);
  return result;
}

module.exports = {
  TakeTicketEvaluationError,
  validateTakeTicketResult,
};
