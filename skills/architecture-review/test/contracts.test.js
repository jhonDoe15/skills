'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  loadCanonicalSuite,
  resolvePackageDependencies,
} = require('../../../suite');
const {
  validateEvaluationDefinition,
} = require('../../../suite/evaluation');

const repositoryRoot = path.resolve(__dirname, '../../..');
const skillRoot = path.resolve(__dirname, '..');

function read(...segments) {
  return fs.readFileSync(path.join(skillRoot, ...segments), 'utf8');
}

function readJson(fileName) {
  return JSON.parse(read('evals', fileName));
}

test('Architecture Review is a public read-only outcome with canonical guidance', () => {
  const suite = loadCanonicalSuite(repositoryRoot);

  assert.deepEqual(
    suite.inventory.find(({ name }) => name === 'architecture-review'),
    { name: 'architecture-review', classification: 'primary' },
  );
  assert.deepEqual(
    resolvePackageDependencies(
      suite,
      { skills: suite.inventory.map(({ name }) => ({ name })) },
      'architecture-review',
    ).resolved,
    ['engineering-guidance', 'architecture-review'],
  );
  assert.ok(suite.runtimeEdges.some(({ consumer, dependency }) => (
    consumer === 'architecture-review'
      && dependency === 'engineering-guidance'
  )));
});

test('Architecture Review follows a bounded evidence-backed workflow', () => {
  const skill = read('SKILL.md');
  const quality = read('references', 'architecture-quality.md');
  const brief = read('references', 'architecture-review-brief.md');

  assert.match(skill, /^name: architecture-review$/m);
  assert.match(
    skill,
    /^description: "Architecture review of existing code, a supplied technical design, or a PR change range\./m,
  );
  for (const heading of [
    '1. Admit the architecture target',
    '2. Ground the current architecture',
    '3. Evaluate architecture quality',
    '4. Review through independent lenses',
    '5. Reconcile findings',
    '6. Return the architecture brief',
  ]) {
    assert.match(skill, new RegExp(`^## ${heading}$`, 'm'));
  }
  assert.equal((skill.match(/\*Complete when:\*/g) || []).length, 6);
  assert.match(skill, /existing code at one immutable revision/);
  assert.match(skill, /numbered technical-design\s+revision/);
  assert.match(
    skill,
    /pull request or branch at one immutable base and head/,
  );
  assert.match(
    skill,
    /Invoke `engineering-guidance`[\s\S]*`existing-code` and `change-range` use activity `review`/,
  );
  assert.match(skill, /decision ladder/);
  assert.match(skill, /project or feature\s+intent/);
  assert.match(skill, /falsification pass/);
  assert.match(skill, /public\s+entry points/);
  assert.match(skill, /architecture-quality\.md/);
  assert.match(skill, /every\s+affected module and the target as a whole/);
  assert.match(quality, /Uncle Bob\/Clean Architecture/);
  assert.match(quality, /John Ousterhout\/APOSD/);
  assert.match(skill, /read-only/i);
  assert.match(skill, /keeps the reviewed target read-only/);
  assert.match(skill, /credible in-scope finding[\s\S]*regardless of severity/i);

  for (const phrase of [
    'caller bouncing',
    'deletion test',
    'seam reality',
    'deterministic interpretation',
    'boundary\\s+violation',
    'merge-blocking',
    'intentional staging',
    'Supported consumer contract',
    'Effective behavioral coverage',
    'Coherent ownership and locality',
    'Earned depth',
    'Real seam and justified dependency direction',
    'Proportional change',
    'Both persona lenses are mandatory and\\s+separate',
  ]) {
    assert.match(quality, new RegExp(phrase, 'i'));
  }
  assert.match(brief, /<!-- architecture-review-brief:v1 -->/);
  assert.match(brief, /existing-code \| technical-design \| change-range/);
  assert.match(brief, /Quality-claim ledger/);
  assert.match(brief, /Current architecture/);
  assert.match(brief, /Decision ladder/);
  assert.match(brief, /Falsification evidence/);
  assert.match(brief, /Findings and dispositions/);
  assert.match(brief, /reported \| disproved \| out-of-scope \| needs-decision/);
  assert.match(brief, /Review coverage/);
});

test('Architecture Review binds technical designs and owns guidance activity', () => {
  const skill = read('SKILL.md');
  const brief = read('references', 'architecture-review-brief.md');

  assert.match(skill, /`technical-design`: a named design artifact and numbered technical-design\s+revision, together with its immutable repository base/);
  assert.match(skill, /`technical-design` uses activity `design`/);
  assert.match(skill, /`existing-code` and `change-range` use activity `review`/);
  assert.match(skill, /proposed architecture in the bound design revision with existing\s+architecture at its repository base/);
  assert.match(skill, /Label proposed contracts and planned\s+proof separately from observed behavior and executed proof/);
  assert.match(skill, /an unresolved target identity makes the review incomplete/);
  assert.match(brief, /Design target, when applicable: \[artifact identity and numbered design revision\]/);
  assert.match(brief, /Design repository base, when applicable: \[immutable repository revision\]/);
  assert.match(brief, /Code target, when applicable:/);
  assert.doesNotMatch(brief, /^- Revision:/m);
  assert.match(brief, /## Proposed architecture \(technical-design targets\)/);

  const outcome = readJson('outcome.json');
  for (const caseId of ['review-bound-technical-design', 'design-missing-repository-base']) {
    const evaluation = outcome.evals.find(({ id }) => id === caseId);
    assert.ok(evaluation, `missing design regression: ${caseId}`);
    assert.ok(evaluation.required_skill_loads.includes('architecture-review'));
  }
  const trigger = readJson('trigger.json').evals.find(
    ({ id }) => id === 'ambient-technical-design-architecture',
  );
  assert.ok(trigger);
  assert.equal(trigger.should_trigger, true);
  assert.ok(trigger.required_skill_loads.includes('engineering-guidance'));
});

test('Architecture Review makes specialist coverage and publication inspectable', () => {
  const skill = read('SKILL.md');
  const quality = read('references', 'architecture-quality.md');
  const brief = read('references', 'architecture-review-brief.md');

  for (const disposition of ['covered-by-existing-lenses', 'separately-reviewed', 'unavailable']) {
    assert.ok(quality.includes(`\`${disposition}\``));
    assert.ok(brief.includes(disposition));
  }
  assert.match(quality, /Unknown coverage remains a context limit/);
  assert.match(quality, /Any unavailable\s+required coverage makes the caller's review incomplete/);
  assert.match(skill, /every assessed risk has an evidence-backed specialist coverage\s+disposition/);
  assert.match(skill, /brief and retained evidence references as a draft by default/);
  assert.match(skill, /Explicit\s+authorization permits publication of the brief or review comments to the named\s+destination/);
  assert.doesNotMatch(skill, /does not edit code or publish review\s+comments/);
  assert.match(brief, /Publication authorization, destination, and result/);
  for (const lens of [
    'Architecture dynamic behavior',
    'Architecture static structure',
    'Uncle Bob/Clean Architecture',
    'John Ousterhout/APOSD',
  ]) {
    assert.ok(brief.includes(`${lens}: PASS | [source finding IDs] | INCOMPLETE`));
  }
  assert.match(brief, /Each INCOMPLETE result: \[reason, retained evidence, and recovery condition\]/);
  assert.match(skill, /Incomplete coverage includes its reason, retained evidence, and\s+recovery condition/);

  const outcome = readJson('outcome.json');
  for (const caseId of ['specialist-coverage-unavailable', 'authorized-review-publication']) {
    assert.ok(outcome.evals.some(({ id }) => id === caseId), `missing boundary regression: ${caseId}`);
  }
});

test('Architecture Review evaluates staged decisions and boundary evidence', () => {
  const outcome = readJson('outcome.json');
  const evaluation = outcome.evals.find(
    ({ id }) => id === 'verify-staged-seams-and-boundary-bypasses',
  );

  assert.ok(evaluation);
  assert.deepEqual(evaluation.covers, [
    'decision-ladder',
    'falsification-pass',
    'public-entry-point-boundary',
    'deterministic-interface',
  ]);

  const evaluationContract = [
    evaluation.prompt,
    evaluation.expected_output,
    ...evaluation.expectations,
  ].join('\n');

  for (const phrase of [
    'broad feature spec',
    'intentionally publishes a cache contract',
    'wider decision and consumer locations',
    'entry-point bypass as merge-blocking',
    'explicit controlling authority',
    'AI-navigability debt',
    'candidate conclusions changed',
  ]) {
    assert.match(evaluationContract, new RegExp(phrase, 'i'));
  }
});

test('Architecture Review owns role, dependency, outcome, and routing evaluations', () => {
  const definitions = [
    'role.json',
    'component.json',
    'outcome.json',
    'trigger.json',
  ].map(readJson);

  for (const definition of definitions) {
    assert.equal(validateEvaluationDefinition(definition, repositoryRoot), definition);
    assert.equal(definition.skill_name, 'architecture-review');
    assert.equal(definition.evaluation.skill, 'architecture-review');
  }
  assert.deepEqual(
    definitions.map(({ evaluation }) => evaluation.layer).sort(),
    ['component', 'outcome', 'role', 'trigger'],
  );
  assert.deepEqual(
    definitions.find(({ evaluation }) => evaluation.layer === 'component')
      .evals.map(({ ablated_dependency }) => ablated_dependency),
    ['engineering-guidance'],
  );
});
