'use strict';

const crypto = require('node:crypto');

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
const BASE_LENSES = ['Domain', 'Engineering/Design'];
const CONSOLIDATION_DIMENSIONS = [
  'behavior',
  'contracts',
  'state',
  'dependencies',
  'data',
  'failure-handling',
];
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
const COMPLETENESS_CHECKS = [
  'complete-ticket-outcome',
  'planned-review-lenses',
  'independent-guidance-coverage',
  'ordered-region-analysis',
  'complete-finding-records',
  'inspectable-artifacts',
];
const INCOMPLETE_PASSED_CHECKS = new Set([
  'complete-ticket-outcome',
  'inspectable-artifacts',
]);
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

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const properties = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);
    return `{${properties.join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
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

function validateGuidanceCoverage(coverage, field, { complete = true } = {}) {
  requireArray(coverage, field);
  if (complete && coverage.length !== CONCERNS.length) {
    fail(`${field} must dispose all nine Engineering Guidance concerns`);
  }
  const concerns = coverage.map(({ concern }) => concern);
  requireUniqueStrings(
    concerns,
    `${field} concern identities`,
    { allowEmpty: !complete },
  );
  if (concerns.some((concern) => !CONCERNS.includes(concern))) {
    fail(`${field} contains an unknown Engineering Guidance concern`);
  }
  if (complete && CONCERNS.some((concern) => !concerns.includes(concern))) {
    fail(`${field} must dispose all nine Engineering Guidance concerns`);
  }
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

function validateReviewPlan(plan) {
  requireObject(plan, 'review_plan');
  requireObject(plan.consolidation, 'review_plan.consolidation');
  if (!['separate', 'combined'].includes(plan.consolidation.mode)) {
    fail('review_plan.consolidation.mode must be separate or combined');
  }
  requireArray(plan.consolidation.evidence, 'review_plan.consolidation.evidence');
  const dimensions = plan.consolidation.evidence.map(({ dimension }) => dimension);
  requireExactMembers(
    dimensions,
    CONSOLIDATION_DIMENSIONS,
    'review_plan.consolidation evidence dimensions',
  );
  for (const [index, record] of plan.consolidation.evidence.entries()) {
    const field = `review_plan.consolidation.evidence[${index}]`;
    requireObject(record, field);
    if (typeof record.unchanged !== 'boolean') {
      fail(`${field}.unchanged must be a boolean`);
    }
    requireUniqueStrings(record.references, `${field}.references`);
  }
  if (plan.consolidation.mode === 'combined'
    && plan.consolidation.evidence.some(({ unchanged }) => !unchanged)) {
    fail('combined worker requires unchanged consolidation evidence');
  }
  requireArray(plan.specialist_routing, 'review_plan.specialist_routing');
  const routedLenses = plan.specialist_routing.map(({ lens }) => lens);
  requireUniqueStrings(
    routedLenses,
    'review_plan.specialist_routing lens identities',
    { allowEmpty: true },
  );
  if (routedLenses.some((lens) => (
    [...BASE_LENSES, 'Combined'].includes(lens)
  ))) {
    fail('specialist routing lens must be distinct from the base lenses');
  }
  const availableLenses = [];
  const unavailableLenses = [];
  for (const [index, route] of plan.specialist_routing.entries()) {
    const field = `review_plan.specialist_routing[${index}]`;
    requireObject(route, field);
    requireString(route.lens, `${field}.lens`);
    if (!['technology', 'specialist'].includes(route.category)) {
      fail(`${field}.category must be technology or specialist`);
    }
    requireUniqueStrings(
      route.signal_references,
      `${field}.signal_references`,
    );
    if (!['available', 'unavailable'].includes(route.capability)) {
      fail(`${field}.capability must be available or unavailable`);
    }
    if (route.capability === 'available') {
      requireString(route.worker_id, `${field}.worker_id`);
      if (route.context_limit !== null) {
        fail(`${field}.context_limit must be null when capability is available`);
      }
      availableLenses.push(route.lens);
    } else {
      if (route.worker_id !== null) {
        fail(`${field}.worker_id must be null when capability is unavailable`);
      }
      requireString(route.context_limit, `${field}.context_limit`);
      unavailableLenses.push(route.lens);
    }
  }
  const baseLenses = plan.consolidation.mode === 'combined'
    ? ['Combined']
    : [...BASE_LENSES];
  return {
    expectedLenses: [...baseLenses, ...availableLenses],
    unavailableLenses,
    availableRoutes: plan.specialist_routing.filter(
      ({ capability }) => capability === 'available',
    ),
  };
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
  requireUniqueStrings(
    region.supersession.suppressed_finding_ids,
    `${field}.supersession.suppressed_finding_ids`,
    { allowEmpty: true },
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

function validateConfidenceInputs(finding, field) {
  const inputs = finding.confidence_inputs;
  requireObject(inputs, `${field}.confidence_inputs`);
  requireArray(
    inputs.evidence_quality,
    `${field}.confidence_inputs.evidence_quality`,
  );
  const evidenceReferences = inputs.evidence_quality.map(
    ({ reference }) => reference,
  );
  requireExactMembers(
    evidenceReferences,
    finding.evidence.map(({ reference }) => reference),
    `${field}.confidence_inputs evidence references`,
  );
  for (const [index, record] of inputs.evidence_quality.entries()) {
    const recordField = `${field}.confidence_inputs.evidence_quality[${index}]`;
    requireObject(record, recordField);
    if (!['direct', 'corroborated', 'limited', 'conflicting'].includes(
      record.quality,
    )) {
      fail(`${recordField}.quality is invalid`);
    }
  }
  for (const dimension of ['finding', 'fix_direction']) {
    const dimensionField = `${field}.confidence_inputs.${dimension}`;
    requireObject(inputs[dimension], dimensionField);
    requireUniqueStrings(
      inputs[dimension].context_limits,
      `${dimensionField}.context_limits`,
      { allowEmpty: true },
    );
    requireString(inputs[dimension].rationale, `${dimensionField}.rationale`);
    if (inputs[dimension].context_limits.some(
      (limit) => !finding.context_limits.includes(limit),
    )) {
      fail(`${dimensionField} contains an unknown Context limit`);
    }
  }
  const accountedLimits = new Set([
    ...inputs.finding.context_limits,
    ...inputs.fix_direction.context_limits,
  ]);
  if (accountedLimits.size !== finding.context_limits.length) {
    fail(`${field} confidence inputs must account for every Context limit`);
  }
  if (inputs.finding.context_limits.length > 0
    && finding.finding_confidence === 100) {
    fail(`${field} Context limit must reduce Finding confidence`);
  }
  if (inputs.fix_direction.context_limits.length > 0
    && finding.fix_direction_confidence === 100) {
    fail(`${field} Context limit must reduce Fix-direction confidence`);
  }
  if (inputs.evidence_quality.some(({ quality }) => (
    quality === 'limited' || quality === 'conflicting'
  )) && finding.finding_confidence === 100) {
    fail(`${field} limited evidence quality must reduce Finding confidence`);
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
  validateConfidenceInputs(finding, field);
  if (Object.hasOwn(finding, 'duplicate_key')) {
    requireString(finding.duplicate_key, `${field}.duplicate_key`);
    requireString(finding.conclusion_key, `${field}.conclusion_key`);
  }
}

function validateWorker(
  worker,
  expectedReferences,
  expectedRange,
  expectedLenses,
  field,
) {
  requireObject(worker, field);
  requireString(worker.id, `${field}.id`);
  if (!expectedLenses.includes(worker.lens)) fail(`${field}.lens is invalid`);
  if (!['completed', 'failed'].includes(worker.status)) {
    fail(`${field}.status must be completed or failed`);
  }
  if (worker.status === 'completed') {
    if (worker.failure !== null) fail(`${field}.failure must be null when completed`);
  } else {
    requireObject(worker.failure, `${field}.failure`);
    for (const name of ['stage', 'code', 'message']) {
      requireString(worker.failure[name], `${field}.failure.${name}`);
    }
    requireUniqueStrings(
      worker.failure.evidence,
      `${field}.failure.evidence`,
    );
  }
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
    { complete: worker.status === 'completed' },
  );
  requireArray(worker.regions, `${field}.regions`);
  if (worker.status === 'completed' && worker.regions.length === 0) {
    fail(`${field}.regions must not be empty`);
  }
  const regionIds = new Set();
  for (const [index, region] of worker.regions.entries()) {
    validateRegion(region, `${field}.regions[${index}]`);
    if (regionIds.has(region.id)) fail(`${field}.regions contains duplicate id`);
    regionIds.add(region.id);
  }
  requireArray(worker.findings, `${field}.findings`);
  const findingsById = new Map();
  for (const [index, finding] of worker.findings.entries()) {
    validateFinding(finding, `${field}.findings[${index}]`, regionIds);
    if (findingsById.has(finding.id)) {
      fail(`${field}.findings contains duplicate id`);
    }
    findingsById.set(finding.id, finding);
  }
  for (const region of worker.regions) {
    if (!region.supersession) continue;
    const source = findingsById.get(region.supersession.source_finding_id);
    if (!source) {
      fail(`${field} supersession source must name a finding from the same worker`);
    }
    if (source.region_id !== region.id) {
      fail(`${field} supersession source must belong to the same Review region`);
    }
    const sourceLevel = LEVELS.indexOf(source.review_level);
    const firstSuperseded = region.analysis.findIndex(
      ({ status }) => status === 'superseded',
    );
    if (sourceLevel < 0
      || sourceLevel >= firstSuperseded
      || region.analysis[sourceLevel].status !== 'examined') {
      fail(`${field} supersession source must be an examined higher Review level`);
    }
    for (const findingId of region.supersession.suppressed_finding_ids) {
      const suppressed = findingsById.get(findingId);
      if (!suppressed || suppressed.region_id !== region.id) {
        fail(`${field} supersession must name a suppressed finding from the same worker and Review region`);
      }
      const suppressedLevel = LEVELS.indexOf(suppressed.review_level);
      if (suppressedLevel < firstSuperseded
        || region.analysis[suppressedLevel].status !== 'superseded') {
        fail(`${field} supersession may suppress only declared lower Review levels`);
      }
    }
  }
}

function validateArtifacts(artifacts, status, workerCount) {
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
  if (artifacts.worker_candidate_streams.length !== workerCount
    || artifacts.worker_concern_coverage.length !== workerCount) {
    fail('artifacts must contain one candidate stream and coverage per lens');
  }
  for (const field of [
    'coordination_dispositions',
    'completeness_state',
  ]) {
    requireString(artifacts[field], `artifacts.${field}`);
  }
  if (status === 'completed') {
    requireString(artifacts.markdown_brief, 'artifacts.markdown_brief');
  } else if (artifacts.markdown_brief !== null) {
    fail('incomplete review must not declare a Markdown brief');
  }
}

function validateInput(input) {
  requireObject(input, 'review input');
  if (input.schema !== 'code-review-input/v1') {
    fail('review input schema must be code-review-input/v1');
  }
  requireString(input.run_id, 'run_id');
  const {
    expectedLenses,
    unavailableLenses,
    availableRoutes,
  } = validateReviewPlan(input.review_plan);
  const references = validateTicketOutcome(input.ticket_outcome);
  requireArray(input.workers, 'workers');
  if (input.workers.some(({ lens }) => unavailableLenses.includes(lens))) {
    fail('unavailable specialist must not have a Review worker');
  }
  if (input.workers.length !== expectedLenses.length
    || expectedLenses.some((lens) => (
      input.workers.filter((worker) => worker?.lens === lens).length !== 1
    ))) {
    const requirement = expectedLenses.length === 1
      ? 'exactly one Combined worker'
      : 'exactly one Domain and one Engineering/Design worker';
    fail(`review requires ${requirement}`);
  }
  const workerIds = input.workers.map(({ id }) => id);
  if (new Set(workerIds).size !== workerIds.length) {
    fail('review worker identities must be distinct');
  }
  for (const route of availableRoutes) {
    if (!input.workers.some(({ id, lens }) => (
      id === route.worker_id && lens === route.lens
    ))) {
      fail('available specialist route must identify its Review worker');
    }
  }
  for (const [index, worker] of input.workers.entries()) {
    validateWorker(
      worker,
      references,
      input.ticket_outcome.immutable_range,
      expectedLenses,
      `workers[${index}]`,
    );
  }
  const allFindingIds = input.workers.flatMap(({ findings }) => (
    findings.map(({ id }) => id)
  ));
  if (new Set(allFindingIds).size !== allFindingIds.length) {
    fail('finding identities must be unique across workers');
  }
  const status = input.workers.every(({ status: workerStatus }) => (
    workerStatus === 'completed'
  )) ? 'completed' : 'incomplete';
  validateArtifacts(input.artifacts, status, input.workers.length);
  return {
    status,
    completedWorkers: input.workers.filter(({ status: workerStatus }) => (
      workerStatus === 'completed'
    )),
  };
}

function completenessCheckState(id, status) {
  return status === 'completed' || INCOMPLETE_PASSED_CHECKS.has(id)
    ? 'passed'
    : 'failed';
}

const FINDING_COMPATIBILITY_FIELDS = [
  ['conclusion', ({ conclusion_key: value }) => value],
  ['review_level', ({ review_level: value }) => value],
  ['severity', ({ severity: value }) => value],
  ['finding_confidence', ({ finding_confidence: value }) => value],
  [
    'fix_direction_confidence',
    ({ fix_direction_confidence: value }) => value,
  ],
  ['context_limits', ({ context_limits: value }) => [...value].sort()],
  ['impact', ({ impact: value }) => value],
  ['affected_scope', ({ affected_scope: value }) => [...value].sort()],
  [
    'highest_actionable_fix_direction',
    ({ highest_actionable_fix_direction: value }) => value,
  ],
  [
    'acceptance_evidence',
    ({ acceptance_evidence: value }) => [...value].sort(),
  ],
];

function findingCompatibilityKey(finding) {
  if (!finding.duplicate_key) return null;
  return JSON.stringify([
    finding.duplicate_key,
    ...FINDING_COMPATIBILITY_FIELDS.map(([, select]) => select(finding)),
  ]);
}

function incompatibleFindingFields(sources) {
  return FINDING_COMPATIBILITY_FIELDS
    .filter(([, select]) => (
      new Set(sources.map(({ finding }) => canonicalJson(select(finding)))).size > 1
    ))
    .map(([field]) => field);
}

function coordinateGuidance(workers) {
  const byConcern = new Map(CONCERNS.map((concern) => [concern, []]));
  for (const worker of workers) {
    for (const record of worker.guidance_coverage) {
      byConcern.get(record.concern).push({
        worker_id: worker.id,
        record,
      });
    }
  }
  const groups = [];
  const disagreements = [];
  for (const concern of CONCERNS) {
    const entries = byConcern.get(concern);
    const byRecord = new Map();
    for (const entry of entries) {
      const key = canonicalJson(entry.record);
      if (!byRecord.has(key)) byRecord.set(key, []);
      byRecord.get(key).push(entry);
    }
    for (const matching of byRecord.values()) {
      if (matching.length < 2) continue;
      groups.push({
        concern,
        worker_ids: matching.map(({ worker_id: workerId }) => workerId),
        record: structuredClone(matching[0].record),
      });
    }
    if (byRecord.size > 1) {
      disagreements.push({
        concern,
        entries: structuredClone(entries),
      });
    }
  }
  return { groups, disagreements };
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
  const supersessions = workers.flatMap((worker) => worker.regions
    .filter(({ supersession }) => supersession !== null)
    .map((region) => ({
      worker_id: worker.id,
      region_id: region.id,
      source_finding_id: region.supersession.source_finding_id,
      suppressed_finding_ids: [
        ...region.supersession.suppressed_finding_ids,
      ],
      superseded_levels: region.analysis
        .filter(({ status }) => status === 'superseded')
        .map(({ level }) => level),
      reason: region.supersession.reason,
    })));
  const suppressed = new Map(supersessions.flatMap((declaration) => (
    declaration.suppressed_finding_ids.map((findingId) => [
      findingId,
      declaration,
    ])
  )));
  const activeSources = sources.filter(
    ({ finding }) => !suppressed.has(finding.id),
  );
  const candidates = new Map();
  for (const source of activeSources) {
    const key = findingCompatibilityKey(source.finding);
    if (!key) continue;
    if (!candidates.has(key)) candidates.set(key, []);
    candidates.get(key).push(source);
  }
  const groups = [...candidates.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([compatibilityKey, group]) => ({
      id: `group:${group[0].finding.duplicate_key}:`
        + sha256(compatibilityKey).slice(0, 12),
      source_finding_ids: group.map(({ finding }) => finding.id),
      source_worker_ids: group.map(({ worker_id: workerId }) => workerId),
      rationale:
        'Workers declared the same duplicate key with compatible conclusions.',
      representative: group[0],
    }))
    .sort((left, right) => compareFindings(left.representative, right.representative));
  const byDuplicateKey = new Map();
  for (const source of activeSources) {
    if (!source.finding.duplicate_key) continue;
    if (!byDuplicateKey.has(source.finding.duplicate_key)) {
      byDuplicateKey.set(source.finding.duplicate_key, []);
    }
    byDuplicateKey.get(source.finding.duplicate_key).push(source);
  }
  const disagreements = [];
  for (const [duplicateKey, matching] of byDuplicateKey) {
    if (matching.length < 2) continue;
    const incompatibleFields = incompatibleFindingFields(matching);
    if (incompatibleFields.length === 0) continue;
    disagreements.push({
      duplicate_key: duplicateKey,
      finding_ids: matching.map(({ finding }) => finding.id),
      worker_ids: matching.map(({ worker_id: workerId }) => workerId),
      incompatible_fields: incompatibleFields,
    });
  }
  const grouped = new Map(groups.flatMap((group) => (
    group.source_finding_ids.map((findingId) => [findingId, group.id])
  )));
  const dispositions = sources.map(({ worker_id: workerId, finding }) => {
    const declaration = suppressed.get(finding.id);
    if (declaration) {
      return {
        worker_id: workerId,
        finding_id: finding.id,
        disposition: 'superseded',
        source_finding_id: declaration.source_finding_id,
        region_id: declaration.region_id,
      };
    }
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
  const retained = activeSources
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
  const guidance = coordinateGuidance(workers);

  return {
    groups: groups.map(({ representative, ...group }) => group),
    disagreements,
    guidance_groups: guidance.groups,
    guidance_disagreements: guidance.disagreements,
    dispositions,
    supersessions,
    ordered_finding_ids: orderedFindingIds,
    coverage_union: {
      workers: workers.map(({ id }) => id),
      lenses: workers.map(({ lens }) => lens),
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
  const { status, completedWorkers } = validateInput(input);
  return {
    ...structuredClone(input),
    schema: 'code-review-run/v1',
    status,
    failures: input.workers
      .filter(({ status: workerStatus }) => workerStatus === 'failed')
      .map((worker) => ({
        worker_id: worker.id,
        lens: worker.lens,
        ...structuredClone(worker.failure),
      })),
    coordination: buildCoordination(completedWorkers),
    completeness: {
      state: status === 'completed' ? 'complete' : 'incomplete',
      checks: COMPLETENESS_CHECKS.map((id) => ({
        id,
        state: completenessCheckState(id, status),
      })),
    },
  };
}

function validateReviewRun(run) {
  requireObject(run, 'review run');
  if (run.schema !== 'code-review-run/v1') {
    fail('review run schema must be code-review-run/v1');
  }
  if (!['completed', 'incomplete'].includes(run.status)) {
    fail('review run status must be completed or incomplete');
  }
  const validatedInput = validateInput({
    ...run,
    schema: 'code-review-input/v1',
  });
  if (run.status !== validatedInput.status) {
    fail('review run status does not match worker results');
  }
  requireArray(run.failures, 'failures');
  const expectedFailures = run.workers
    .filter(({ status }) => status === 'failed')
    .map((worker) => ({
      worker_id: worker.id,
      lens: worker.lens,
      ...worker.failure,
    }));
  if (JSON.stringify(run.failures) !== JSON.stringify(expectedFailures)) {
    fail('review failures do not match failed workers');
  }
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
  const expected = buildCoordination(validatedInput.completedWorkers);
  if (JSON.stringify(run.coordination) !== JSON.stringify(expected)) {
    fail('coordination does not match structural worker aggregation');
  }
  requireObject(run.completeness, 'completeness');
  const expectedState = run.status === 'completed' ? 'complete' : 'incomplete';
  if (run.completeness.state !== expectedState) {
    fail(`completeness.state must be ${expectedState}`);
  }
  requireArray(run.completeness.checks, 'completeness.checks');
  const checkIds = run.completeness.checks.map(({ id }) => id);
  requireExactMembers(checkIds, COMPLETENESS_CHECKS, 'completeness.check identities');
  for (const [index, check] of run.completeness.checks.entries()) {
    requireObject(check, `completeness.checks[${index}]`);
    const expectedCheckState = completenessCheckState(check.id, run.status);
    if (check.state !== expectedCheckState) {
      fail(`completeness check ${check.id} has an invalid state`);
    }
  }
  return run;
}

function retainedArtifactEntries(run, fingerprint) {
  const binding = {
    run_id: run.run_id,
    immutable_range: run.ticket_outcome.immutable_range,
    ticket_outcome_fingerprint: fingerprint,
  };
  function jsonEntry(kind, reference, value, worker = null) {
    return {
      kind,
      reference,
      media_type: 'application/json',
      body: JSON.stringify(value),
      worker,
    };
  }

  const entries = [
    jsonEntry(
      'immutable-diff-package',
      run.artifacts.immutable_diff_package,
      {
        schema: 'code-review-diff/v1',
        ...binding,
        source_reference: run.ticket_outcome.diff_package,
      },
    ),
  ];
  for (const [index, worker] of run.workers.entries()) {
    entries.push({
      kind: 'worker-candidate-stream',
      reference: run.artifacts.worker_candidate_streams[index],
      media_type: 'application/x-ndjson',
      body: `${JSON.stringify({
        schema: 'code-review-worker-stream/v1',
        ...binding,
        worker_id: worker.id,
        lens: worker.lens,
        findings: worker.findings,
      })}\n`,
      worker,
    });
  }
  for (const [index, worker] of run.workers.entries()) {
    entries.push(jsonEntry(
      'worker-concern-coverage',
      run.artifacts.worker_concern_coverage[index],
      {
        schema: 'code-review-worker-coverage/v1',
        ...binding,
        worker_id: worker.id,
        lens: worker.lens,
        guidance_coverage: worker.guidance_coverage,
        regions: worker.regions,
      },
      worker,
    ));
  }
  entries.push(jsonEntry(
    'coordination-dispositions',
    run.artifacts.coordination_dispositions,
    {
      schema: 'code-review-coordination/v1',
      ...binding,
      coordination: run.coordination,
    },
  ));
  entries.push(jsonEntry(
    'completeness-state',
    run.artifacts.completeness_state,
    {
      schema: 'code-review-completeness/v1',
      ...binding,
      status: run.status,
      completeness: run.completeness,
    },
  ));
  if (run.status === 'completed') {
    const findingIds = run.coordination.ordered_finding_ids.join(', ') || 'none';
    const findingDisagreements = run.coordination.disagreements
      .map(({ duplicate_key: key, incompatible_fields: fields }) => (
        `${key} (${fields.join(', ')})`
      ))
      .join('; ') || 'none';
    const guidanceDisagreements = run.coordination.guidance_disagreements
      .map(({ concern }) => concern)
      .join(', ') || 'none';
    const supersessions = run.coordination.supersessions
      .map(({ worker_id: workerId, region_id: regionId }) => (
        `${workerId}:${regionId}`
      ))
      .join(', ') || 'none';
    const contextLimits = [
      ...run.workers.flatMap(({ findings }) => (
        findings.flatMap(({ context_limits: limits }) => limits)
      )),
      ...run.review_plan.specialist_routing
        .filter(({ capability }) => capability === 'unavailable')
        .map(({ context_limit: limit }) => limit),
    ];
    entries.push({
      kind: 'markdown-brief',
      reference: run.artifacts.markdown_brief,
      media_type: 'text/markdown',
      body: [
        '# Review brief',
        `Review run: ${run.run_id}`,
        `Ticket outcome fingerprint: ${fingerprint}`,
        `Immutable range: ${run.ticket_outcome.immutable_range.base}`
          + `..${run.ticket_outcome.immutable_range.head}`,
        `Status: ${run.status}`,
        `Ordered findings: ${findingIds}`,
        `Finding disagreements: ${findingDisagreements}`,
        `Guidance disagreements: ${guidanceDisagreements}`,
        `Supersessions: ${supersessions}`,
        `Context limits: ${[...new Set(contextLimits)].join('; ') || 'none'}`,
        '',
      ].join('\n'),
      worker: null,
    });
  }
  return entries;
}

function retainReview(logicalRun) {
  validateReviewRun(logicalRun);
  const run = structuredClone(logicalRun);
  const fingerprint = sha256(canonicalJson(run.ticket_outcome));
  const entries = retainedArtifactEntries(run, fingerprint);
  const bodies = new Map(entries.map(({ reference, body }) => [reference, body]));
  run.retained_artifacts = entries.map((entry) => ({
    kind: entry.kind,
    reference: entry.reference,
    media_type: entry.media_type,
    run_id: run.run_id,
    immutable_range: structuredClone(run.ticket_outcome.immutable_range),
    ticket_outcome_fingerprint: fingerprint,
    sha256: sha256(entry.body),
    ...(entry.worker ? {
      worker_id: entry.worker.id,
      lens: entry.worker.lens,
    } : {}),
  }));
  bodies.set(run.artifacts.run_manifest, JSON.stringify(run));
  return { run, bodies };
}

function descriptorMatchesEntry(descriptor, entry, run, fingerprint) {
  if (descriptor.kind !== entry.kind
    || descriptor.media_type !== entry.media_type
    || descriptor.run_id !== run.run_id
    || descriptor.ticket_outcome_fingerprint !== fingerprint
    || !descriptor.immutable_range
    || !sameRange(descriptor.immutable_range, run.ticket_outcome.immutable_range)) {
    return false;
  }
  if (!entry.worker) return true;
  return descriptor.worker_id === entry.worker.id
    && descriptor.lens === entry.worker.lens;
}

function validateRetainedArtifacts(run, resolveArtifact) {
  validateReviewRun(run);
  if (!Array.isArray(run.retained_artifacts)) {
    fail('run manifest must declare retained_artifacts');
  }
  const fingerprint = sha256(canonicalJson(run.ticket_outcome));
  const expected = retainedArtifactEntries(run, fingerprint);
  if (run.retained_artifacts.length !== expected.length) {
    fail('run manifest retained artifact count is invalid');
  }
  const descriptors = new Map();
  for (const descriptor of run.retained_artifacts) {
    requireObject(descriptor, 'retained artifact descriptor');
    requireString(descriptor.reference, 'retained artifact descriptor.reference');
    if (descriptors.has(descriptor.reference)) {
      fail('run manifest contains duplicate retained artifact reference');
    }
    descriptors.set(descriptor.reference, descriptor);
  }
  for (const entry of expected) {
    const descriptor = descriptors.get(entry.reference);
    if (!descriptor) fail(`run manifest is missing ${entry.kind}`);
    const body = resolveArtifact(entry.reference);
    if (typeof body !== 'string') fail('retained artifact body is missing');
    if (sha256(body) !== descriptor.sha256) {
      fail('retained artifact digest mismatch');
    }
    if (!descriptorMatchesEntry(descriptor, entry, run, fingerprint)) {
      fail(`retained ${entry.kind} descriptor binding is invalid`);
    }
    if (body !== entry.body) {
      const label = entry.kind === 'immutable-diff-package'
        ? 'diff'
        : entry.kind;
      fail(`retained ${label} body does not match its run binding`);
    }
  }
  return run;
}

module.exports = {
  CONCERNS,
  LEVELS,
  LENSES: BASE_LENSES,
  ReviewArtifactError,
  coordinateReview,
  retainReview,
  sha256,
  validateRetainedArtifacts,
  validateReviewRun,
};
