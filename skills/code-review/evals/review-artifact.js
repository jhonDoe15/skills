'use strict';

const CONCERNS = [
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
const LENSES = ['Domain', 'Engineering/Design'];
const LEVELS = [
  'Requirements & Expectations',
  'Engineering & Architecture',
  'Code Quality',
];
const SEVERITIES = ['Blocker', 'Major', 'Minor', 'Note'];
const DISPOSITIONS = new Set([
  'applicable-now',
  'applicable-later',
  'not-applicable',
]);
const ANALYSIS_STATUSES = new Set(['examined', 'superseded']);
const ARTIFACT_FIELDS = [
  'run_manifest',
  'immutable_diff_package',
  'worker_candidate_streams',
  'worker_concern_coverage',
  'coordination_dispositions',
  'completeness_state',
  'markdown_brief',
];

class ReviewArtifactError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ReviewArtifactError';
  }
}

function fail(message) {
  throw new ReviewArtifactError(message);
}

function requireObject(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${field} must be an object`);
  }
}

function requireString(value, field) {
  if (typeof value !== 'string' || value.length === 0) {
    fail(`${field} must be a non-empty string`);
  }
}

function requireArray(value, field) {
  if (!Array.isArray(value)) fail(`${field} must be an array`);
}

function requireUniqueStrings(value, field, { allowEmpty = false } = {}) {
  requireArray(value, field);
  if (!allowEmpty && value.length === 0) fail(`${field} must not be empty`);
  for (const [index, item] of value.entries()) {
    requireString(item, `${field}[${index}]`);
  }
  if (new Set(value).size !== value.length) fail(`${field} must be unique`);
}

function requireExactMembers(actual, expected, field) {
  requireUniqueStrings(actual, field);
  if (actual.length !== expected.length
    || expected.some((item) => !actual.includes(item))) {
    fail(`${field} must contain the exact required members`);
  }
}

function requireSha(value, field) {
  if (typeof value !== 'string' || !/^[a-f0-9]{40}$/.test(value)) {
    fail(`${field} must be a 40-character lowercase revision`);
  }
}

function requireIntegerInRange(value, minimum, maximum, field) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    fail(`${field} must be an integer from ${minimum} through ${maximum}`);
  }
}

function validateRange(range, field) {
  requireObject(range, field);
  requireSha(range.base, `${field}.base`);
  requireSha(range.head, `${field}.head`);
  if (range.base === range.head) fail(`${field} must identify a non-empty range`);
}

function sameRange(left, right) {
  return left.base === right.base && left.head === right.head;
}

function ticketReferences(ticketOutcome) {
  return [
    ...ticketOutcome.requirement_references,
    ticketOutcome.implementation_handoff,
    ...ticketOutcome.validation_evidence,
    ticketOutcome.diff_package,
  ];
}

function validateTicketOutcome(ticketOutcome) {
  requireObject(ticketOutcome, 'ticket_outcome');
  requireUniqueStrings(
    ticketOutcome.requirement_references,
    'ticket_outcome.requirement_references',
  );
  validateRange(ticketOutcome.immutable_range, 'ticket_outcome.immutable_range');
  requireString(
    ticketOutcome.implementation_handoff,
    'ticket_outcome.implementation_handoff',
  );
  requireUniqueStrings(
    ticketOutcome.validation_evidence,
    'ticket_outcome.validation_evidence',
  );
  requireString(ticketOutcome.diff_package, 'ticket_outcome.diff_package');
  const references = ticketReferences(ticketOutcome);
  if (new Set(references).size !== references.length) {
    fail('ticket_outcome artifact references must be unique');
  }
  return references;
}

function validateGuidanceCoverage(coverage, field) {
  requireArray(coverage, field);
  if (coverage.length !== CONCERNS.length) {
    fail(`${field} must dispose all nine Engineering Guidance concerns`);
  }
  const concerns = coverage.map(({ concern }) => concern);
  requireExactMembers(concerns, CONCERNS, `${field} concern identities`);
  for (const [index, record] of coverage.entries()) {
    const recordField = `${field}[${index}]`;
    requireObject(record, recordField);
    if (!DISPOSITIONS.has(record.disposition)) {
      fail(`${recordField}.disposition is invalid`);
    }
    requireUniqueStrings(record.sources, `${recordField}.sources`);
    requireString(record.reason, `${recordField}.reason`);
  }
}

function validateAnalysis(analysis, field) {
  requireArray(analysis, field);
  if (analysis.length !== LEVELS.length) {
    fail(`${field} must account for all three Review levels`);
  }
  for (const [index, record] of analysis.entries()) {
    const recordField = `${field}[${index}]`;
    requireObject(record, recordField);
    if (record.level !== LEVELS[index]) {
      fail(`${field} must follow the required Review level order`);
    }
    if (!ANALYSIS_STATUSES.has(record.status)) {
      fail(`${recordField}.status must be examined or superseded`);
    }
    requireUniqueStrings(record.evidence, `${recordField}.evidence`);
  }
}

function validateRegion(region, field) {
  requireObject(region, field);
  requireString(region.id, `${field}.id`);
  requireUniqueStrings(region.affected_scope, `${field}.affected_scope`);
  validateAnalysis(region.analysis, `${field}.analysis`);
  if (region.supersession === null) {
    if (region.analysis.some(({ status }) => status === 'superseded')) {
      fail(`${field} has superseded analysis without worker declaration`);
    }
    return;
  }
  requireObject(region.supersession, `${field}.supersession`);
  requireString(
    region.supersession.source_finding_id,
    `${field}.supersession.source_finding_id`,
  );
  requireString(region.supersession.reason, `${field}.supersession.reason`);
  const firstSuperseded = region.analysis.findIndex(
    ({ status }) => status === 'superseded',
  );
  if (firstSuperseded < 1
    || region.analysis.slice(firstSuperseded).some(
      ({ status }) => status !== 'superseded',
    )) {
    fail(`${field} supersession must follow an examined higher level`);
  }
}

function validateFinding(finding, field, regionIds) {
  requireObject(finding, field);
  for (const name of [
    'id',
    'region_id',
    'review_level',
    'severity',
    'impact',
    'highest_actionable_fix_direction',
    'conclusion',
  ]) {
    requireString(finding[name], `${field}.${name}`);
  }
  if (!regionIds.has(finding.region_id)) {
    fail(`${field}.region_id must name a worker Review region`);
  }
  if (!LEVELS.includes(finding.review_level)) {
    fail(`${field}.review_level is invalid`);
  }
  if (!SEVERITIES.includes(finding.severity)) {
    fail(`${field}.severity is invalid`);
  }
  for (const confidence of [
    'finding_confidence',
    'fix_direction_confidence',
  ]) {
    requireIntegerInRange(finding[confidence], 0, 100, `${field}.${confidence}`);
  }
  requireUniqueStrings(
    finding.context_limits,
    `${field}.context_limits`,
    { allowEmpty: true },
  );
  requireUniqueStrings(finding.affected_scope, `${field}.affected_scope`);
  requireUniqueStrings(
    finding.acceptance_evidence,
    `${field}.acceptance_evidence`,
  );
  requireArray(finding.evidence, `${field}.evidence`);
  if (finding.evidence.length === 0) fail(`${field}.evidence must not be empty`);
  for (const [index, evidence] of finding.evidence.entries()) {
    requireObject(evidence, `${field}.evidence[${index}]`);
    requireString(evidence.reference, `${field}.evidence[${index}].reference`);
    requireString(evidence.observation, `${field}.evidence[${index}].observation`);
  }
  if (Object.hasOwn(finding, 'duplicate_key')) {
    requireString(finding.duplicate_key, `${field}.duplicate_key`);
  }
}

function validateWorker(worker, expectedReferences, expectedRange, field) {
  requireObject(worker, field);
  requireString(worker.id, `${field}.id`);
  if (!LENSES.includes(worker.lens)) fail(`${field}.lens is invalid`);
  requireString(worker.lens_provenance, `${field}.lens_provenance`);
  validateRange(worker.immutable_range, `${field}.immutable_range`);
  if (!sameRange(worker.immutable_range, expectedRange)) {
    fail(`${field}.immutable_range must match the Ticket outcome`);
  }
  requireExactMembers(
    worker.input_artifact_references,
    expectedReferences,
    `${field}.input_artifact_references`,
  );
  validateGuidanceCoverage(
    worker.guidance_coverage,
    `${field}.guidance_coverage`,
  );
  requireArray(worker.regions, `${field}.regions`);
  if (worker.regions.length === 0) fail(`${field}.regions must not be empty`);
  const regionIds = new Set();
  for (const [index, region] of worker.regions.entries()) {
    validateRegion(region, `${field}.regions[${index}]`);
    if (regionIds.has(region.id)) fail(`${field}.regions contains duplicate id`);
    regionIds.add(region.id);
  }
  requireArray(worker.findings, `${field}.findings`);
  const findingIds = new Set();
  for (const [index, finding] of worker.findings.entries()) {
    validateFinding(finding, `${field}.findings[${index}]`, regionIds);
    if (findingIds.has(finding.id)) fail(`${field}.findings contains duplicate id`);
    findingIds.add(finding.id);
  }
  for (const region of worker.regions) {
    if (region.supersession
      && !findingIds.has(region.supersession.source_finding_id)) {
      fail(`${field} supersession source must name a finding from the same worker`);
    }
  }
}

function validateArtifacts(artifacts) {
  requireObject(artifacts, 'artifacts');
  for (const field of ARTIFACT_FIELDS) {
    if (!Object.hasOwn(artifacts, field)) {
      fail(`artifacts is missing ${field}`);
    }
  }
  requireString(artifacts.run_manifest, 'artifacts.run_manifest');
  requireString(
    artifacts.immutable_diff_package,
    'artifacts.immutable_diff_package',
  );
  requireUniqueStrings(
    artifacts.worker_candidate_streams,
    'artifacts.worker_candidate_streams',
  );
  requireUniqueStrings(
    artifacts.worker_concern_coverage,
    'artifacts.worker_concern_coverage',
  );
  if (artifacts.worker_candidate_streams.length !== LENSES.length
    || artifacts.worker_concern_coverage.length !== LENSES.length) {
    fail('artifacts must contain one candidate stream and coverage per lens');
  }
  for (const field of [
    'coordination_dispositions',
    'completeness_state',
    'markdown_brief',
  ]) {
    requireString(artifacts[field], `artifacts.${field}`);
  }
}

function validateInput(input) {
  requireObject(input, 'review input');
  if (input.schema !== 'code-review-input/v1') {
    fail('review input schema must be code-review-input/v1');
  }
  requireString(input.run_id, 'run_id');
  const references = validateTicketOutcome(input.ticket_outcome);
  requireArray(input.workers, 'workers');
  if (input.workers.length !== LENSES.length
    || LENSES.some((lens) => (
      input.workers.filter((worker) => worker?.lens === lens).length !== 1
    ))) {
    fail('review requires exactly one Domain and one Engineering/Design worker');
  }
  const workerIds = input.workers.map(({ id }) => id);
  if (new Set(workerIds).size !== workerIds.length) {
    fail('review worker identities must be distinct');
  }
  for (const [index, worker] of input.workers.entries()) {
    validateWorker(
      worker,
      references,
      input.ticket_outcome.immutable_range,
      `workers[${index}]`,
    );
  }
  const allFindingIds = input.workers.flatMap(({ findings }) => (
    findings.map(({ id }) => id)
  ));
  if (new Set(allFindingIds).size !== allFindingIds.length) {
    fail('finding identities must be unique across workers');
  }
  validateArtifacts(input.artifacts);
}

function findingCompatibilityKey(finding) {
  if (!finding.duplicate_key) return null;
  return JSON.stringify([
    finding.duplicate_key,
    finding.review_level,
    finding.severity,
    finding.impact,
    [...finding.affected_scope].sort(),
    finding.highest_actionable_fix_direction,
  ]);
}

function compareFindings(left, right) {
  return LEVELS.indexOf(left.finding.review_level)
      - LEVELS.indexOf(right.finding.review_level)
    || SEVERITIES.indexOf(left.finding.severity)
      - SEVERITIES.indexOf(right.finding.severity)
    || left.finding.id.localeCompare(right.finding.id);
}

function buildCoordination(workers) {
  const sources = workers.flatMap((worker) => worker.findings.map((finding) => ({
    worker_id: worker.id,
    finding,
  })));
  const candidates = new Map();
  for (const source of sources) {
    const key = findingCompatibilityKey(source.finding);
    if (!key) continue;
    if (!candidates.has(key)) candidates.set(key, []);
    candidates.get(key).push(source);
  }
  const groups = [...candidates.values()]
    .filter((group) => group.length > 1)
    .map((group) => ({
      id: `group:${group[0].finding.duplicate_key}`,
      source_finding_ids: group.map(({ finding }) => finding.id),
      source_worker_ids: group.map(({ worker_id: workerId }) => workerId),
      rationale:
        'Workers declared the same duplicate key with compatible conclusions.',
      representative: group[0],
    }))
    .sort((left, right) => compareFindings(left.representative, right.representative));
  const grouped = new Map(groups.flatMap((group) => (
    group.source_finding_ids.map((findingId) => [findingId, group.id])
  )));
  const dispositions = sources.map(({ worker_id: workerId, finding }) => {
    const groupId = grouped.get(finding.id);
    if (groupId) {
      return {
        worker_id: workerId,
        finding_id: finding.id,
        disposition: 'grouped',
        group_id: groupId,
      };
    }
    return {
      worker_id: workerId,
      finding_id: finding.id,
      disposition: 'retained',
    };
  });
  const supersessions = workers.flatMap((worker) => worker.regions
    .filter(({ supersession }) => supersession !== null)
    .map((region) => ({
      worker_id: worker.id,
      region_id: region.id,
      source_finding_id: region.supersession.source_finding_id,
      superseded_levels: region.analysis
        .filter(({ status }) => status === 'superseded')
        .map(({ level }) => level),
      reason: region.supersession.reason,
    })));
  const retained = sources
    .filter(({ finding }) => !grouped.has(finding.id))
    .sort(compareFindings);
  const orderedFindingIds = [
    ...groups.map(({ id, representative }) => ({ id, representative })),
    ...retained.map((source) => ({ id: source.finding.id, representative: source })),
  ]
    .sort((left, right) => compareFindings(
      left.representative,
      right.representative,
    ))
    .map(({ id }) => id);

  return {
    groups: groups.map(({ representative, ...group }) => group),
    dispositions,
    supersessions,
    ordered_finding_ids: orderedFindingIds,
    coverage_union: {
      workers: workers.map(({ id }) => id),
      lenses: [...LENSES],
      regions: [...new Set(workers.flatMap(({ regions }) => (
        regions.map(({ id }) => id)
      )))].sort(),
      review_levels: [...LEVELS],
      engineering_concerns: [...CONCERNS],
    },
    preserves_worker_conclusions: true,
    second_review_performed: false,
  };
}

function coordinateReview(input) {
  validateInput(input);
  return {
    ...structuredClone(input),
    schema: 'code-review-run/v1',
    status: 'completed',
    coordination: buildCoordination(input.workers),
    completeness: {
      state: 'complete',
      checks: [
        'complete-ticket-outcome',
        'two-independent-lenses',
        'independent-guidance-coverage',
        'ordered-region-analysis',
        'complete-finding-records',
        'inspectable-artifacts',
      ],
    },
  };
}

function validateReviewRun(run) {
  requireObject(run, 'review run');
  if (run.schema !== 'code-review-run/v1') {
    fail('review run schema must be code-review-run/v1');
  }
  if (run.status !== 'completed') fail('review run status must be completed');
  validateInput({ ...run, schema: 'code-review-input/v1' });
  requireObject(run.coordination, 'coordination');
  requireArray(run.coordination.groups, 'coordination.groups');
  requireArray(run.coordination.dispositions, 'coordination.dispositions');
  requireUniqueStrings(
    run.coordination.ordered_finding_ids,
    'coordination.ordered_finding_ids',
    { allowEmpty: true },
  );
  requireObject(run.coordination.coverage_union, 'coordination.coverage_union');
  if (run.coordination.preserves_worker_conclusions !== true) {
    fail('coordination must preserve worker conclusions');
  }
  if (run.coordination.second_review_performed !== false) {
    fail('coordination must not perform a second review');
  }
  const expected = buildCoordination(run.workers);
  if (JSON.stringify(run.coordination) !== JSON.stringify(expected)) {
    fail('coordination does not match structural worker aggregation');
  }
  requireObject(run.completeness, 'completeness');
  if (run.completeness.state !== 'complete') {
    fail('completeness.state must be complete');
  }
  requireUniqueStrings(run.completeness.checks, 'completeness.checks');
  return run;
}

module.exports = {
  CONCERNS,
  LEVELS,
  LENSES,
  ReviewArtifactError,
  coordinateReview,
  validateReviewRun,
};
