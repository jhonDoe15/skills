'use strict';

const {
  fingerprintValue,
} = require('../evaluation');
const {
  validateImplementationBlueprint,
} = require('./blueprint');

const REQUIRED_DIMENSIONS = Object.freeze([
  'requirement_fidelity',
  'architecture',
  'maintainability',
  'test_quality',
  'scope_discipline',
  'cross_ticket_coherence',
]);
const CRITICAL_FAILURES = new Set([
  'blueprint-contract',
  'trusted-verification',
  'requirement-coverage',
  'merge-conflict',
  'intermediate-regression',
  'blocker-findings',
  'major-findings',
]);

class ImplementationOutcomeGradeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ImplementationOutcomeGradeError';
  }
}

function recordContents(record) {
  const contents = structuredClone(record);
  delete contents.fingerprint;
  return contents;
}

function seal(record) {
  const contents = recordContents(record);
  return Object.freeze({
    ...contents,
    fingerprint: fingerprintValue(contents),
  });
}

function validateSealed(value, kind, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ImplementationOutcomeGradeError(`${field} must be an object`);
  }
  if (value.kind !== kind) {
    throw new ImplementationOutcomeGradeError(`${field} kind is invalid`);
  }
  if (value.fingerprint !== fingerprintValue(recordContents(value))) {
    throw new ImplementationOutcomeGradeError(`${field} fingerprint mismatch`);
  }
  return value;
}

function failure(failures, condition, name) {
  if (!condition) {
    failures.push(name);
  }
}

function arrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

function isSinglePassCount(value) {
  return Number.isInteger(value) && value >= 0 && value <= 1;
}

function sumTicketMetric(tickets, metric) {
  return tickets.reduce((sum, ticket) => sum + (ticket[metric] || 0), 0);
}

function inputIdentity(evidence) {
  return fingerprintValue(evidence.inputIdentity);
}

function gradeBlueprint(arm, evidence, failures) {
  if (arm === 'baseline') {
    failure(failures, evidence.blueprint === null, 'baseline-contamination');
    return [];
  }
  const sources = Array.isArray(evidence.blueprint)
    ? evidence.blueprint
    : [evidence.blueprint];
  try {
    if (sources.length !== evidence.tickets.length) {
      throw new Error('blueprint count does not match tickets');
    }
    return sources.map(validateImplementationBlueprint);
  } catch {
    failures.push('blueprint-contract');
    return [];
  }
}

function gradeTickets(evidence, oracle, failures) {
  const tickets = arrayOrEmpty(evidence.tickets);
  const ticketIds = tickets.map(({ id }) => id);
  failure(
    failures,
    JSON.stringify(ticketIds) === JSON.stringify(oracle.expected_tickets),
    'ticket-coverage',
  );
  failure(
    failures,
    tickets.every(({ reviewLoads }) => isSinglePassCount(reviewLoads)),
    'review-cycle-limit',
  );
  failure(
    failures,
    tickets.every(({ correctionCount }) => isSinglePassCount(correctionCount)),
    'correction-limit',
  );
  return {
    reviewLoads: sumTicketMetric(tickets, 'reviewLoads'),
    corrections: sumTicketMetric(tickets, 'correctionCount'),
    clarifications: sumTicketMetric(tickets, 'clarifications'),
    costUsd: sumTicketMetric(tickets, 'costUsd'),
    durationMs: sumTicketMetric(tickets, 'durationMs'),
  };
}

function gradeFeature(evidence, oracle, failures) {
  const feature = evidence.feature || {};
  const changedPaths = arrayOrEmpty(feature.changedPaths);
  const allowed = new Set(oracle.allowed_paths);
  failure(
    failures,
    changedPaths.every((changedPath) => allowed.has(changedPath)),
    'scope-discipline',
  );
  failure(
    failures,
    /^[a-f0-9]{40}$/.test(feature.baseRevision || '')
      && /^[a-f0-9]{40}$/.test(feature.headRevision || '')
      && feature.baseRevision !== feature.headRevision,
    'immutable-feature-range',
  );

  const merges = arrayOrEmpty(feature.merges);
  const mergePositions = new Map(
    merges.map(({ ticketId }, index) => [ticketId, index]),
  );
  failure(
    failures,
    oracle.expected_tickets.every((ticketId) => mergePositions.has(ticketId))
      && mergePositions.size === oracle.expected_tickets.length,
    'merge-coverage',
  );
  failure(
    failures,
    merges.every(({ conflict }) => conflict === false),
    'merge-conflict',
  );
  failure(
    failures,
    merges.every(({ verificationPassed }) => verificationPassed === true),
    'intermediate-regression',
  );
  failure(
    failures,
    oracle.ticket_graph.every((ticket) => ticket.blockers.every(
      (blocker) => mergePositions.get(blocker) < mergePositions.get(ticket.id),
    )),
    'dependency-order',
  );
}

function gradeRequirements(evidence, oracle, failures) {
  const coverage = arrayOrEmpty(evidence.requirementCoverage);
  const byRequirement = new Map(
    coverage.map((entry) => [entry.requirement, entry]),
  );
  failure(
    failures,
    coverage.length === oracle.requirements.length
      && oracle.requirements.every((requirement) => {
        const entry = byRequirement.get(requirement);
        return entry?.passed === true
          && typeof entry.evidence === 'string'
          && entry.evidence.length > 0;
      }),
    'requirement-coverage',
  );
}

function gradeReview(evidence, oracle, failures) {
  const review = evidence.finalReview || {};
  failure(
    failures,
    review.feedbackExposed === false,
    'blind-review-feedback',
  );
  const findings = arrayOrEmpty(review.findings);
  const counts = Object.fromEntries(['blocker', 'major', 'minor', 'note'].map(
    (severity) => [
      severity,
      findings.filter((finding) => finding.severity === severity).length,
    ],
  ));
  failure(
    failures,
    counts.blocker <= oracle.maximum_review_findings.blocker,
    'blocker-findings',
  );
  failure(
    failures,
    counts.major <= oracle.maximum_review_findings.major,
    'major-findings',
  );
  const dimensions = review.dimensions || {};
  failure(
    failures,
    REQUIRED_DIMENSIONS.every((dimension) => (
      Number.isInteger(dimensions[dimension])
      && dimensions[dimension] >= 1
      && dimensions[dimension] <= 2
    )),
    'blind-quality-threshold',
  );
  return counts;
}

function gradeFirstPass(preReview) {
  if (preReview === null) {
    return null;
  }
  return preReview.verificationPassed === true
    && Array.isArray(preReview.findings)
    && preReview.findings.length === 0;
}

function gradeArm(arm, evidence, oracle) {
  if (evidence?.arm !== arm) {
    throw new ImplementationOutcomeGradeError(`${arm} evidence arm is invalid`);
  }
  const failures = [];
  const blueprint = gradeBlueprint(arm, evidence, failures);
  const ticketMetrics = gradeTickets(evidence, oracle, failures);
  gradeFeature(evidence, oracle, failures);
  failure(
    failures,
    evidence.trustedVerification?.passed === true,
    'trusted-verification',
  );
  gradeRequirements(evidence, oracle, failures);
  const mutationChecks = arrayOrEmpty(evidence.mutationChecks);
  failure(
    failures,
    mutationChecks.every(({ killed }) => killed === true),
    'mutation-sensitivity',
  );
  const findingCounts = gradeReview(evidence, oracle, failures);
  const preReview = evidence.preReview || null;
  return Object.freeze({
    mergeReady: failures.length === 0,
    firstPassReady: gradeFirstPass(preReview),
    failures: Object.freeze(failures),
    criticalFailures: Object.freeze(
      failures.filter((name) => CRITICAL_FAILURES.has(name)),
    ),
    blueprintRevision: blueprint[0]?.revision || null,
    blueprintRevisions: Object.freeze(
      blueprint.map(({ revision }) => revision),
    ),
    findingCounts: Object.freeze(findingCounts),
    ...ticketMetrics,
  });
}

function significantFindingCount(grade) {
  return grade.findingCounts.blocker
    + grade.findingCounts.major
    + grade.findingCounts.minor;
}

function treatmentImproved(baseline, treatment) {
  if (treatment.mergeReady && !baseline.mergeReady) return true;
  if (!treatment.mergeReady) return false;
  const baselineFindings = significantFindingCount(baseline);
  const treatmentFindings = significantFindingCount(treatment);
  return treatmentFindings < baselineFindings
    || treatment.clarifications < baseline.clarifications
    || treatment.costUsd < baseline.costUsd;
}

function gradeOutcomePair({
  pairFingerprint,
  oracle,
  baseline,
  treatment,
}) {
  if (!/^[a-f0-9]{64}$/.test(pairFingerprint || '')) {
    throw new ImplementationOutcomeGradeError('pairFingerprint is invalid');
  }
  if (inputIdentity(baseline) !== inputIdentity(treatment)) {
    throw new ImplementationOutcomeGradeError(
      'matched arms do not share one input identity',
    );
  }
  const baselineGrade = gradeArm('baseline', baseline, oracle);
  const treatmentGrade = gradeArm('treatment', treatment, oracle);
  const criticalRegression = treatmentGrade.criticalFailures.some(
    (name) => !baselineGrade.criticalFailures.includes(name),
  );
  const improved = treatmentImproved(baselineGrade, treatmentGrade);
  return seal({
    schemaVersion: 1,
    kind: 'implementation-outcome-pair-grade',
    pairFingerprint,
    inputFingerprint: inputIdentity(baseline),
    arms: {
      baseline: baselineGrade,
      treatment: treatmentGrade,
    },
    treatmentImproved: improved,
    criticalRegression,
    passed: treatmentGrade.mergeReady && !criticalRegression,
  });
}

function replayOutcomeGrades({
  planFingerprint,
  expectedPairFingerprints,
  grades,
}) {
  if (!/^[a-f0-9]{64}$/.test(planFingerprint || '')
    || !Array.isArray(expectedPairFingerprints)
    || !Array.isArray(grades)) {
    throw new ImplementationOutcomeGradeError('replay inputs are invalid');
  }
  const expected = new Set(expectedPairFingerprints);
  const retained = new Set();
  for (const [index, grade] of grades.entries()) {
    validateSealed(
      grade,
      'implementation-outcome-pair-grade',
      `grades[${index}]`,
    );
    if (!expected.has(grade.pairFingerprint)
      || retained.has(grade.pairFingerprint)) {
      throw new ImplementationOutcomeGradeError(
        'replay grade identity is unknown or duplicated',
      );
    }
    retained.add(grade.pairFingerprint);
  }
  const complete = retained.size === expected.size;
  const improvedCount = grades.filter(
    ({ treatmentImproved: improved }) => improved,
  ).length;
  return seal({
    schemaVersion: 1,
    kind: 'implementation-outcome-aggregate-replay',
    planFingerprint,
    complete,
    passed: complete && grades.every(({ passed }) => passed),
    treatmentImprovedRate: grades.length === 0
      ? 0
      : improvedCount / grades.length,
    criticalRegression: grades.some(
      ({ criticalRegression: regressed }) => regressed,
    ),
    pairGrades: grades.map(({ fingerprint }) => fingerprint),
  });
}

module.exports = {
  ImplementationOutcomeGradeError,
  gradeOutcomePair,
  replayOutcomeGrades,
};
