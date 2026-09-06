'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repositoryRoot = path.resolve(__dirname, '..');
const holdoutRoot = path.join(
  repositoryRoot,
  'external-holdouts',
  'implementation-planning',
);
const manifestPath = path.join(holdoutRoot, 'manifest.json');

const expectedDomains = [
  'api',
  'authority',
  'concurrency',
  'migration',
  'operations',
  'proportional',
  'security',
];
const manifestCaseFields = ['domain', 'id', 'input', 'oracle'];
const oracleFields = [
  'critical_forbidden_outcomes',
  'expectations',
  'expected_output',
  'expected_status',
  'input',
  'labels',
  'prompt',
  'schema_version',
];
const oracleLeakPattern = new RegExp([
  'answer key',
  'evaluator-only',
  'expected (?:design|implementation|output|status|decisions?)',
  'forbidden outcomes?',
  'grading expectations?',
  'model-visible prompt',
  'stratum labels?',
  '^\\s*"(?:critical_forbidden_outcomes|expected_output|expected_status|expectations|labels|prompt)"\\s*:',
].join('|'), 'im');
const privateSourcePattern = /\/(?:Users|home)\/[^\s/]+|https?:\/\/[^\s/]+\.(?:internal|corp)\b|[\w.+-]+@(?!example\.(?:com|org|net)\b)[\w.-]+\.[a-z]{2,}/i;
const needsDecisionReviewExpectation = 'Run every mandatory independent reviewer on the needs-decision revision; each returns evidence-bearing PASS or concrete findings about authority handling, decision envelopes, decision-independent work, and blocker routing.';
const skippedNeedsDecisionReview = 'Recording any mandatory reviewer as pending, not run, or blocked because the blueprint is needs-decision.';

function resolveContained(relativePath) {
  assert.equal(path.isAbsolute(relativePath), false);
  const resolved = path.resolve(holdoutRoot, relativePath);
  const relative = path.relative(holdoutRoot, resolved);
  assert.equal(relative.startsWith(`..${path.sep}`) || relative === '..', false);
  assert.equal(fs.existsSync(resolved), true, `${relativePath} must exist`);
  assert.equal(fs.lstatSync(resolved).isFile(), true, `${relativePath} must be a file`);
  return resolved;
}

test('external implementation-planning holdouts satisfy their contract', () => {
  const manifestSource = fs.readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestSource);

  assert.deepEqual(Object.keys(manifest).sort(), [
    'cases',
    'kind',
    'schema_version',
  ]);
  assert.equal(manifest.schema_version, 1);
  assert.equal(manifest.kind, 'implementation-planning-external-holdouts');
  assert.equal(manifest.cases.length, 22);

  const caseIds = new Set(manifest.cases.map(({ id }) => id));
  assert.equal(caseIds.size, 22);
  assert.deepEqual(
    [...new Set(manifest.cases.map(({ domain }) => domain))].sort(),
    expectedDomains,
  );

  const allContent = [manifestSource];
  let needsDecisionCount = 0;

  for (const holdoutCase of manifest.cases) {
    assert.deepEqual(Object.keys(holdoutCase).sort(), manifestCaseFields);
    assert.match(holdoutCase.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.equal(expectedDomains.includes(holdoutCase.domain), true);

    const inputPath = resolveContained(holdoutCase.input);
    const oraclePath = resolveContained(holdoutCase.oracle);
    assert.equal(
      holdoutCase.input,
      `${holdoutCase.domain}/${holdoutCase.id}/input.md`,
    );
    assert.equal(
      holdoutCase.oracle,
      `${holdoutCase.domain}/${holdoutCase.id}/oracle.json`,
    );

    const input = fs.readFileSync(inputPath, 'utf8');
    const revisionLine = input.match(/^Immutable revision: `([0-9a-f]+)`$/m);
    assert.notEqual(revisionLine, null, `${holdoutCase.id} needs an immutable revision`);
    assert.match(revisionLine[1], /^[0-9a-f]{40}$/);
    assert.equal(oracleLeakPattern.test(input), false);

    const oracleSource = fs.readFileSync(oraclePath, 'utf8');
    const oracle = JSON.parse(oracleSource);
    assert.deepEqual(Object.keys(oracle).sort(), oracleFields);
    assert.equal(oracle.schema_version, 1);
    assert.equal(oracle.input, holdoutCase.input);
    assert.equal(['design-settled', 'needs-decision'].includes(
      oracle.expected_status,
    ), true);
    assert.equal(typeof oracle.prompt, 'string');
    assert.notEqual(oracle.prompt.trim(), '');
    assert.equal(typeof oracle.expected_output, 'string');
    assert.notEqual(oracle.expected_output.trim(), '');

    for (const field of [
      'labels',
      'expectations',
      'critical_forbidden_outcomes',
    ]) {
      assert.equal(Array.isArray(oracle[field]), true);
      assert.ok(oracle[field].length > 0);
      assert.equal(
        oracle[field].every((value) => (
          typeof value === 'string' && value.trim() !== ''
        )),
        true,
      );
    }

    if (oracle.expected_status === 'design-settled') {
      assert.equal(
        oracle.critical_forbidden_outcomes.some((outcome) => (
          /claim(?:ing)? ready/i.test(outcome)
        )),
        true,
        `${holdoutCase.id} must forbid unsupported ready claims`,
      );
    } else {
      needsDecisionCount += 1;
      assert.ok(
        oracle.expectations.includes(needsDecisionReviewExpectation),
        `${holdoutCase.id} must require complete needs-decision review`,
      );
      assert.ok(
        oracle.critical_forbidden_outcomes.includes(skippedNeedsDecisionReview),
        `${holdoutCase.id} must forbid skipped needs-decision reviews`,
      );
    }

    allContent.push(input, oracleSource);
  }

  assert.equal(needsDecisionCount, 9);
  assert.equal(privateSourcePattern.test(allContent.join('\n')), false);
});
