'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  gradeDeterministicOutput,
  validateEvaluationDefinition,
} = require('../../../suite/evaluation');

const repositoryRoot = path.resolve(__dirname, '../../..');
const skillRoot = path.resolve(__dirname, '..');

function readJson(filePath) {
  assert.equal(fs.existsSync(filePath), true, `${filePath} must exist`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readSkill() {
  const filePath = path.join(skillRoot, 'SKILL.md');
  const markdown = fs.readFileSync(filePath, 'utf8');
  const frontmatter = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  assert.ok(frontmatter, `${filePath} requires YAML frontmatter`);
  const field = (name) => frontmatter[1]
    .match(new RegExp(`^${name}:\\s*(.+)$`, 'm'))?.[1];
  return {
    markdown,
    name: field('name'),
    description: field('description'),
  };
}

function definition(fileName) {
  const value = readJson(path.join(skillRoot, 'evals', fileName));
  assert.equal(validateEvaluationDefinition(value, repositoryRoot), value);
  return value;
}

function referenceFixture(t, prefix, reference) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));
  const contractPath = path.join(
    fixtureRoot,
    'evals',
    'fixtures',
    'behavior-contract.json',
  );
  fs.mkdirSync(path.dirname(contractPath), { recursive: true });
  const contract = readJson(
    path.join(skillRoot, 'evals', 'fixtures', 'behavior-contract.json'),
  );
  contract.branches[1].reference = reference;
  fs.writeFileSync(contractPath, `${JSON.stringify(contract, null, 2)}\n`);
  return fixtureRoot;
}

test('Skill Mechanics exposes only its private representation contract', () => {
  const skill = readSkill();

  assert.equal(skill.name, 'skill-mechanics');
  assert.match(skill.description, /\bskill-writing\b/);
  assert.match(skill.description, /\bconsumers?\b/i);
  assert.match(skill.description, /\bnot\b.*\buser\b.*\bgoal\b/i);
  assert.doesNotMatch(skill.description, /^Use when\b/i);
  for (const heading of [
    'Interface',
    'Represent the decided contract',
    'Validate mechanics',
    'Failure behavior',
    'Completion',
  ]) {
    assert.match(skill.markdown, new RegExp(`^## ${heading}$`, 'm'));
  }
});

test('owner-local definitions cover the Mechanics role and routing boundary', () => {
  const role = definition('role.json');
  const trigger = definition('trigger.json');

  assert.equal(role.evaluation.layer, 'role');
  assert.equal(trigger.evaluation.layer, 'trigger');
  assert.deepEqual(
    trigger.evals.map(({ should_trigger }) => should_trigger),
    [true, false],
  );
  assert.deepEqual(role.evaluation.hosts, ['claude-code', 'cursor']);
  assert.deepEqual(trigger.evaluation.hosts, ['claude-code', 'cursor']);
});

test('mechanical output gates do not claim semantic effectiveness', () => {
  const role = definition('role.json');
  const caseDefinition = role.evals[0];
  const output = fs.readFileSync(
    path.join(skillRoot, 'evals', 'fixtures', 'mechanics-output.md'),
    'utf8',
  );

  assert.equal(gradeDeterministicOutput({
    definition: role,
    caseDefinition,
    output,
  }).passed, true);
  assert.equal(gradeDeterministicOutput({
    definition: role,
    caseDefinition,
    output: `${output}\nThe represented behavior is ineffective in every host.`,
  }).passed, true);
  assert.equal(
    role.judge.dimensions.every(({ description }) => (
      /(?:quote|cite|reference).*output evidence/i.test(description)
    )),
    true,
  );
});

test('mechanics grading resolves every declared conditional reference', (t) => {
  const graderPath = path.join(skillRoot, 'evals', 'grader.js');
  assert.equal(
    fs.existsSync(graderPath),
    true,
    'Skill Mechanics requires an artifact/path grader',
  );
  const { gradeMechanicsArtifacts } = require(graderPath);
  const role = definition('role.json');
  const caseDefinition = role.evals[0];

  const valid = gradeMechanicsArtifacts({
    skillRoot,
    caseDefinition,
  });
  assert.equal(valid.passed, true, JSON.stringify(valid.checks));
  assert.equal(
    valid.checks.some(({ name }) => name === 'reference references/failure-path.md'),
    true,
  );

  const incompleteRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mechanics-inputs-'));
  t.after(() => fs.rmSync(incompleteRoot, { recursive: true, force: true }));
  fs.mkdirSync(path.join(incompleteRoot, 'evals', 'fixtures'), {
    recursive: true,
  });
  fs.copyFileSync(
    path.join(skillRoot, 'evals', 'fixtures', 'behavior-contract.json'),
    path.join(incompleteRoot, 'evals', 'fixtures', 'behavior-contract.json'),
  );
  const missing = gradeMechanicsArtifacts({
    skillRoot: incompleteRoot,
    caseDefinition,
  });
  assert.equal(missing.passed, false);
  assert.deepEqual(
    missing.checks.find(({ name }) => (
      name === 'reference references/failure-path.md'
    )),
    {
      name: 'reference references/failure-path.md',
      passed: false,
      details: 'missing evals/fixtures/references/failure-path.md',
    },
  );
});

test('mechanics grading rejects a declared reference that escapes fixture root', (t) => {
  const fixtureRoot = referenceFixture(t, 'mechanics-traversal-', '../README.md');
  const escapedTarget = path.join(fixtureRoot, 'evals', 'README.md');
  fs.writeFileSync(escapedTarget, '# Escaped target\n');
  const role = definition('role.json');
  const caseDefinition = {
    ...role.evals[0],
    files: [
      'evals/fixtures/behavior-contract.json',
      'evals/README.md',
    ],
  };
  const { gradeMechanicsArtifacts } = require('../evals/grader');

  const grade = gradeMechanicsArtifacts({
    skillRoot: fixtureRoot,
    caseDefinition,
  });

  assert.equal(grade.passed, false);
  assert.equal(
    grade.checks.find(({ name }) => name === 'reference ../README.md').passed,
    false,
  );
});

test('mechanics grading rejects an absolute reference after normalization', (t) => {
  const fixtureRoot = referenceFixture(t, 'mechanics-absolute-', '/escape.md');
  const normalizedTarget = path.join(
    fixtureRoot,
    'evals',
    'fixtures',
    'escape.md',
  );
  fs.writeFileSync(normalizedTarget, '# Normalized absolute target\n');
  const role = definition('role.json');
  const caseDefinition = {
    ...role.evals[0],
    files: [
      'evals/fixtures/behavior-contract.json',
      'evals/fixtures/escape.md',
    ],
  };
  const { gradeMechanicsArtifacts } = require('../evals/grader');

  const grade = gradeMechanicsArtifacts({
    skillRoot: fixtureRoot,
    caseDefinition,
  });

  assert.equal(
    grade.checks.find(({ name }) => name === 'reference /escape.md').passed,
    false,
  );
});

test('mechanics grading rejects a reference through an escaping symlink', (t) => {
  const fixtureRoot = referenceFixture(
    t,
    'mechanics-symlink-',
    'references/target.md',
  );
  const externalRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mechanics-external-'));
  t.after(() => fs.rmSync(externalRoot, { recursive: true, force: true }));
  fs.writeFileSync(path.join(externalRoot, 'target.md'), '# External target\n');
  fs.symlinkSync(
    externalRoot,
    path.join(fixtureRoot, 'evals', 'fixtures', 'references'),
  );
  const role = definition('role.json');
  const caseDefinition = {
    ...role.evals[0],
    files: [
      'evals/fixtures/behavior-contract.json',
      'evals/fixtures/references/target.md',
    ],
  };
  const { gradeMechanicsArtifacts } = require('../evals/grader');

  const grade = gradeMechanicsArtifacts({
    skillRoot: fixtureRoot,
    caseDefinition,
  });

  assert.equal(
    grade.checks.find(
      ({ name }) => name === 'reference references/target.md',
    ).passed,
    false,
  );
});
