'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { discoverCanonicalPackage } = require('../../../suite');
const {
  gradeDeterministicOutput,
  validateEvaluationDefinition,
} = require('../../../suite/evaluation');

const repositoryRoot = path.resolve(__dirname, '../../..');
const skillRoot = path.resolve(__dirname, '..');
const foundationClauses = [
  'wf-accepted-context',
  'wf-coverage',
  'wf-grounding',
  'wf-uncertainty',
  'wf-structure',
  'wf-terminology',
  'wf-relevance',
  'wf-work-product-fidelity',
  'wf-behavioral-pruning',
  'wf-exclusions',
  'wf-failure-behavior',
  'wf-completion',
];

function readJson(relativePath) {
  const filePath = path.join(skillRoot, relativePath);
  assert.equal(fs.existsSync(filePath), true, `${relativePath} must exist`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readSkill() {
  const filePath = path.join(skillRoot, 'SKILL.md');
  assert.equal(fs.existsSync(filePath), true, 'SKILL.md must exist');
  const markdown = fs.readFileSync(filePath, 'utf8');
  const frontmatter = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  assert.ok(frontmatter, 'writing-foundation requires YAML frontmatter');
  const field = (name) => frontmatter[1].match(new RegExp(`^${name}:\\s*(.+)$`, 'm'))?.[1];
  return { markdown, name: field('name'), description: field('description') };
}

test('writing-foundation exposes its private audience-independent Interface', (t) => {
  const skill = readSkill();

  assert.equal(skill.name, 'writing-foundation');
  assert.match(skill.description, /\bto-humans\b/);
  assert.match(skill.description, /\bagent-writing\b/);
  assert.match(skill.description, /\bnot\b.*\buser-facing\b/i);
  assert.doesNotMatch(skill.description, /^Use when\b/i);
  for (const heading of [
    'Interface',
    'Apply the shared contract',
    'Failure behavior',
    'Completion',
  ]) {
    assert.match(skill.markdown, new RegExp(`^## ${heading}$`, 'm'));
  }

  const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'writing-foundation-'));
  t.after(() => fs.rmSync(packageRoot, { recursive: true, force: true }));
  fs.mkdirSync(path.join(packageRoot, 'suite'), { recursive: true });
  fs.copyFileSync(
    path.join(repositoryRoot, 'suite', 'canonical-suite.json'),
    path.join(packageRoot, 'suite', 'canonical-suite.json'),
  );
  fs.mkdirSync(path.join(packageRoot, 'skills', 'writing-foundation'), {
    recursive: true,
  });
  fs.copyFileSync(
    path.join(skillRoot, 'SKILL.md'),
    path.join(packageRoot, 'skills', 'writing-foundation', 'SKILL.md'),
  );

  assert.deepEqual(
    discoverCanonicalPackage(packageRoot).skills.map(({ name }) => name),
    ['writing-foundation'],
  );
});

test('writing-foundation role evaluation grades every owned clause with line evidence', () => {
  const definition = readJson('evals/role.json');
  const caseDefinition = definition.evals[0];

  assert.equal(validateEvaluationDefinition(definition), definition);
  assert.equal(definition.evaluation.layer, 'role');
  assert.deepEqual(definition.evaluation.hosts, ['claude-code', 'cursor']);
  assert.deepEqual(caseDefinition.covered_clauses, foundationClauses);
  assert.deepEqual(definition.global_required_signals, foundationClauses);

  const fixtureOutput = fs.readFileSync(
    path.join(skillRoot, 'evals', 'fixtures', 'role-output.md'),
    'utf8',
  );
  const grade = gradeDeterministicOutput({
    definition,
    caseDefinition,
    output: fixtureOutput,
  });

  assert.equal(grade.passed, true);
  assert.deepEqual(
    grade.checks.map(({ name }) => name),
    foundationClauses.map((clause) => `signal ${clause}`),
  );
  for (const check of grade.checks) {
    assert.match(check.details, /^line \d+$/);
  }
});

test('writing-foundation trigger cases cover canonical reach and private false activation', () => {
  const definition = readJson('evals/trigger.json');

  assert.equal(validateEvaluationDefinition(definition), definition);
  assert.equal(definition.evaluation.layer, 'trigger');
  assert.deepEqual(
    definition.evals.map(({ name, should_trigger }) => [name, should_trigger]),
    [
      ['canonical-dependency-invocation', true],
      ['private-user-goal-false-activation', false],
    ],
  );
  assert.match(definition.evals[0].prompt, /^\/writing-foundation\b/);
  assert.equal(
    definition.evals[1].covered_clauses.includes('wf-private-routing-exclusion'),
    true,
  );
});
