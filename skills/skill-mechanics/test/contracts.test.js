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
