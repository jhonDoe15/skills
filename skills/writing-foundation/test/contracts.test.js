'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { discoverCanonicalPackage } = require('../../../suite');
const {
  gradeDeterministicOutput,
  gradeTriggerResult,
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

function skillEvent(name, {
  operation = 'load',
  status = 'succeeded',
  trigger = 'model',
} = {}) {
  return {
    name,
    operation,
    status,
    trigger,
    callId: `${name}-${operation}-${status}`,
    provenance: {
      host: 'fixture',
      mechanism: 'owner-local-lifecycle-fixture',
      eventType: 'fixture.skill-lifecycle',
      observerVersion: '1',
      statusSource: 'observed',
    },
  };
}

function triggerResult(skillEvents) {
  return {
    status: 'succeeded',
    observations: {
      packageSkills: ['agent-writing', 'writing-foundation'],
      hostAvailableSkills: null,
      preExecutionInventory: {
        skillDefinitions: [],
        plugins: [],
        ruleSources: [],
        packageDigest: '0'.repeat(64),
        truncated: false,
      },
      skillEvents,
      routing: {
        requestedSkill: 'writing-foundation',
        resolvedSkills: ['writing-foundation'],
      },
      responses: [{ text: 'No activation sentinel.' }],
      artifacts: [],
      toolUses: [{ name: 'Skill', outcome: 'succeeded' }],
      attemptedMutations: [],
    },
    failure: null,
    durationMs: 1,
    costUsd: 0,
    model: {
      requested: 'test-model',
      resolved: 'resolved-test-model',
    },
  };
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

test('writing-foundation separates mechanical gates from semantic adoption', () => {
  const definition = readJson('evals/role.json');
  const caseDefinition = definition.evals[0];
  assert.equal(validateEvaluationDefinition(definition), definition);
  assert.equal(definition.evaluation.layer, 'role');
  assert.deepEqual(definition.evaluation.hosts, ['claude-code', 'cursor']);
  assert.deepEqual(caseDefinition.covered_clauses, foundationClauses);

  const validOutput = fs.readFileSync(
    path.join(skillRoot, 'evals', 'fixtures', 'role-output.md'),
    'utf8',
  );
  const conciseAlternate = [
    'Keep `DAG frontier` unchanged.',
    'Retain `{"maxAttempts":3}` exactly.',
  ].join('\n');
  const semanticCounterexample = [
    conciseAlternate,
    'Until the owner responds, use a cap of 8.',
  ].join('\n');
  const grade = (output) => gradeDeterministicOutput({
    definition,
    caseDefinition,
    output,
  });

  assert.equal(grade(validOutput).passed, true);
  assert.equal(grade(conciseAlternate).passed, true);
  assert.equal(
    grade(semanticCounterexample).passed,
    true,
    'invented concurrency is judged semantically, not by keywords',
  );
  assert.deepEqual(definition.global_required_signals, [
    'wf-terminology',
    'wf-work-product-fidelity',
  ]);
  assert.equal(
    grade(conciseAlternate.replace('DAG frontier', 'queue frontier')).passed,
    false,
  );
  assert.equal(
    grade(conciseAlternate.replace(
      '{"maxAttempts":3}',
      '{"maxAttempts":4}',
    )).passed,
    false,
  );

  const duplicatedParagraph = 'Historical background: the legacy deployer used a weekly batch window that does not control this deployment.';
  const source = fs.readFileSync(
    path.join(skillRoot, 'evals', 'fixtures', 'deployment-note-source.md'),
    'utf8',
  );
  assert.equal(source.split(duplicatedParagraph).length - 1, 2);
  assert.equal(
    grade(`${conciseAlternate}\n${duplicatedParagraph}`).passed,
    false,
  );

  const semanticRequirements = [
    ...caseDefinition.expectations,
    ...definition.judge.dimensions.map(({ description }) => description),
  ].join(' ');
  assert.match(semanticRequirements, /unblocked/i);
  assert.match(semanticRequirements, /concurrency.*(?:unresolved|owner)/i);
  assert.match(semanticRequirements, /audience-specific/i);
  assert.match(semanticRequirements, /duplicate|prun/i);
  assert.equal(
    definition.judge.dimensions.every(({ description }) => (
      /(?:quote|cite|reference).*output evidence/i.test(description)
    )),
    true,
  );
  assert.deepEqual(caseDefinition.files, [
    'evals/fixtures/deployment-note-source.md',
  ]);

  const boundary = fs.readFileSync(
    path.join(skillRoot, 'evals', 'README.md'),
    'utf8',
  );
  assert.match(boundary, /deterministic.*mechanical/i);
  assert.match(boundary, /blind.*judg/i);
  assert.match(boundary, /sampled human review/i);
  assert.match(boundary, /non-overridable/i);
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
  assert.equal(definition.evals[0].canonical_invocation, true);
  assert.equal(
    definition.evals[1].covered_clauses.includes('wf-private-routing-exclusion'),
    true,
  );
});

test('writing-foundation trigger grading rejects consumer-only and wrong-Skill evidence', () => {
  const definition = readJson('evals/trigger.json');
  const canonical = definition.evals[0];
  const privateFalseActivation = definition.evals[1];
  const grade = (caseDefinition, skillEvents) => gradeTriggerResult({
    definition,
    caseDefinition,
    result: triggerResult(skillEvents),
  });

  assert.equal(
    grade(canonical, [skillEvent('writing-foundation')]).passed,
    true,
  );
  assert.equal(
    grade(canonical, [skillEvent('agent-writing')]).passed,
    false,
    'consumer-only activation must not satisfy its private dependency',
  );
  assert.equal(
    grade(canonical, [skillEvent('to-humans')]).passed,
    false,
    'a wrong public Skill must not satisfy Foundation',
  );
  assert.equal(
    grade(privateFalseActivation, [skillEvent('to-humans')]).passed,
    true,
  );
  assert.equal(
    grade(privateFalseActivation, [skillEvent('writing-foundation', {
      operation: 'select',
      status: 'rejected',
    })]).passed,
    false,
    'private false activation rejects any exact Foundation attempt',
  );
});
