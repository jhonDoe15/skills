'use strict';

const { validateResult } = require('../../../suite');
const {
  validateRetainedArtifacts,
  validateReviewRun,
} = require('./review-artifact');

function check(name, passed, details) {
  return { name, passed, details };
}

function successfulLoad(events, name) {
  return events.some((event) => (
    event.name === name
      && event.operation === 'load'
      && event.status === 'succeeded'
  ));
}

function expectedArtifacts(run) {
  const { artifacts } = run;
  return [
    [artifacts.run_manifest, 'application/json'],
    [artifacts.immutable_diff_package, 'application/json'],
    ...artifacts.worker_candidate_streams.map((reference) => (
      [reference, 'application/x-ndjson']
    )),
    ...artifacts.worker_concern_coverage.map((reference) => (
      [reference, 'application/json']
    )),
    [artifacts.coordination_dispositions, 'application/json'],
    [artifacts.completeness_state, 'application/json'],
    [artifacts.markdown_brief, 'text/markdown'],
  ];
}

function artifactsMatch(run, observed) {
  const expected = expectedArtifacts(run);
  if (observed.length !== expected.length) return false;
  const observedByReference = new Map(
    observed.map(({ reference, mediaType }) => [reference, mediaType]),
  );
  return observedByReference.size === observed.length
    && expected.every(([reference, mediaType]) => (
      observedByReference.get(reference) === mediaType
    ));
}

function parseReviewRun(value) {
  if (typeof value === 'string') return JSON.parse(value);
  return value;
}

function gradeCodeReviewResult({
  definition,
  caseDefinition,
  result,
  resolveArtifact = () => null,
}) {
  validateResult(result);
  if (definition.skill_name !== 'code-review'
    || definition.evaluation.layer !== 'outcome') {
    throw new TypeError('gradeCodeReviewResult requires a Code Review outcome');
  }

  const runArtifact = result.observations.artifacts.find(
    ({ reference }) => reference.endsWith('run-manifest.json'),
  );
  let run = null;
  let artifactError = null;
  if (runArtifact?.mediaType === 'application/json') {
    try {
      const manifest = resolveArtifact(runArtifact.reference);
      run = validateReviewRun(parseReviewRun(manifest));
      validateRetainedArtifacts(run, resolveArtifact);
    } catch (error) {
      artifactError = error.message;
      run = null;
    }
  }
  const requiredLoads = caseDefinition.required_skill_loads || [];
  const missingLoads = requiredLoads.filter((name) => (
    !successfulLoad(result.observations.skillEvents, name)
  ));
  const response = result.observations.responses
    .map(({ text }) => text)
    .join('\n\n');
  const checks = [
    check(
      'one complete review run manifest',
      run !== null,
      run ? runArtifact.reference : (artifactError || 'manifest unavailable'),
    ),
    check(
      'complete retained artifact set',
      run !== null && artifactsMatch(run, result.observations.artifacts),
      `observed=${result.observations.artifacts.length}`,
    ),
    check(
      'complete canonical Skill loads',
      missingLoads.length === 0,
      `missing=${missingLoads.join(',') || 'none'}`,
    ),
    check(
      'successful complete outcome',
      result.status === 'succeeded' && run?.status === 'completed',
      `result=${result.status} run=${run?.status || 'unavailable'}`,
    ),
    check(
      'response references Markdown brief',
      run !== null && response.includes(run.artifacts.markdown_brief),
      run?.artifacts.markdown_brief || 'brief unavailable',
    ),
    check(
      'reviewed state remains read-only',
      result.observations.attemptedMutations.length === 0,
      `mutations=${result.observations.attemptedMutations.length}`,
    ),
    check(
      'coordinator preserves worker conclusions',
      run?.coordination.preserves_worker_conclusions === true
        && run?.coordination.second_review_performed === false,
      run
        ? `preserves=${run.coordination.preserves_worker_conclusions} `
          + `second_review=${run.coordination.second_review_performed}`
        : 'run unavailable',
    ),
  ];

  return {
    passed: checks.every(({ passed }) => passed),
    checks,
  };
}

module.exports = { gradeCodeReviewResult };
