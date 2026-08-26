'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  createBlindComparison,
  createCampaignManifest,
  createRunEvidence,
  gradeDeterministicOutput,
  validateEvaluationDefinition,
} = require('../../../suite/evaluation');

const repositoryRoot = path.resolve(__dirname, '../../..');
const skillRoot = path.resolve(__dirname, '..');
const definitions = new Map();
const expectedCoverage = new Map([
  ['wf-accepted-context', 'writing-foundation'],
  ['wf-coverage', 'writing-foundation'],
  ['wf-grounding', 'writing-foundation'],
  ['wf-uncertainty', 'writing-foundation'],
  ['wf-structure', 'writing-foundation'],
  ['wf-terminology', 'writing-foundation'],
  ['wf-relevance', 'writing-foundation'],
  ['wf-work-product-fidelity', 'writing-foundation'],
  ['wf-behavioral-pruning', 'writing-foundation'],
  ['wf-exclusions', 'writing-foundation'],
  ['wf-failure-behavior', 'writing-foundation'],
  ['wf-completion', 'writing-foundation'],
  ['wf-canonical-private-reach', 'writing-foundation'],
  ['wf-private-routing-exclusion', 'writing-foundation'],
  ['aw-accepted-context', 'agent-writing'],
  ['aw-activation', 'agent-writing'],
  ['aw-intended-outcomes', 'agent-writing'],
  ['aw-branches', 'agent-writing'],
  ['aw-completion', 'agent-writing'],
  ['aw-steps-reference', 'agent-writing'],
  ['aw-branch-disclosure', 'agent-writing'],
  ['aw-co-located-authority', 'agent-writing'],
  ['aw-instruction-form', 'agent-writing'],
  ['aw-context-load', 'agent-writing'],
  ['aw-behavioral-pruning', 'agent-writing'],
  ['aw-terminology', 'agent-writing'],
  ['aw-execution-semantics', 'agent-writing'],
  ['aw-environment-source', 'agent-writing'],
  ['aw-failure-behavior', 'agent-writing'],
  ['aw-routing-positive', 'agent-writing'],
  ['aw-routing-agent-skill-exclusion', 'agent-writing'],
  ['aw-routing-handoff-exclusion', 'agent-writing'],
  ['aw-routing-human-exclusion', 'agent-writing'],
  ['aw-routing-ambiguous', 'agent-writing'],
  ['aw-routing-canonical', 'agent-writing'],
  ['aw-foundation-edge', 'agent-writing'],
  ['aw-missing-dependency', 'agent-writing'],
]);

function readJson(filePath) {
  assert.equal(fs.existsSync(filePath), true, `${filePath} must exist`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadDefinition(owner, fileName) {
  const definition = readJson(path.join(
    repositoryRoot,
    'skills',
    owner,
    'evals',
    fileName,
  ));
  assert.equal(validateEvaluationDefinition(definition), definition);
  definitions.set(definition.evaluation.scope, definition);
  return definition;
}

function caseKey(scope, id) {
  return `${scope}:${id}`;
}

function loadPackageClosureCases() {
  const definition = readJson(path.join(
    skillRoot,
    'evals',
    'package-closure.json',
  ));
  assert.deepEqual(definition, {
    version: 1,
    scope: 'agent-writing-package-closure',
    owner: 'agent-writing',
    cases: [{
      id: 'missing-writing-foundation',
      consumer: 'agent-writing',
      missing_dependency: 'writing-foundation',
      expected_failure: {
        stage: 'dependency-resolution',
        code: 'missing-internal-dependency',
        message: 'Missing internal dependency "writing-foundation"',
        missingSkill: 'writing-foundation',
      },
      covered_clauses: ['aw-missing-dependency'],
    }],
  });
  definitions.set(definition.scope, {
    skill_name: definition.owner,
    evals: definition.cases,
  });
  return definition;
}

function normalizedResult({ output, invokedSkills }) {
  return {
    status: 'succeeded',
    observations: {
      discoveredSkills: invokedSkills,
      routing: {
        requestedSkill: 'agent-writing',
        invokedSkills,
      },
      responses: [{ text: output }],
      artifacts: [{
        reference: 'response://0',
        mediaType: 'text/markdown',
      }],
      toolUses: [],
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

test('owner-local definitions isolate roles, the dependency edge, and the public outcome', () => {
  const foundationRole = loadDefinition('writing-foundation', 'role.json');
  const agentRole = loadDefinition('agent-writing', 'role.json');
  const component = loadDefinition('agent-writing', 'component.json');
  const outcome = loadDefinition('agent-writing', 'outcome.json');

  assert.equal(foundationRole.evaluation.layer, 'role');
  assert.equal(agentRole.evaluation.layer, 'role');
  assert.deepEqual(
    agentRole.evals[0].covered_clauses.filter((clause) => clause.startsWith('wf-')),
    [],
  );
  assert.equal(component.evaluation.layer, 'component');
  assert.deepEqual(component.evaluation.arms, ['treatment', 'component-ablation']);
  assert.equal(component.evals[0].ablated_dependency, 'writing-foundation');
  assert.deepEqual(component.evals[0].covered_clauses, ['aw-foundation-edge']);
  assert.equal(outcome.evaluation.layer, 'outcome');
  assert.deepEqual(outcome.evaluation.arms, ['no-skill', 'treatment']);
  for (const definition of [foundationRole, agentRole, component, outcome]) {
    assert.deepEqual(definition.evaluation.hosts, ['claude-code', 'cursor']);
  }
});

test('Agent Writing trigger cases cover every positive and exclusion boundary', () => {
  const definition = loadDefinition('agent-writing', 'trigger.json');

  assert.equal(definition.evaluation.layer, 'trigger');
  assert.deepEqual(
    definition.evals.map(({ name, should_trigger }) => [name, should_trigger]),
    [
      ['agent-consumed-artifact', true],
      ['agent-skill-package-exclusion', false],
      ['fresh-context-handoff-exclusion', false],
      ['human-facing-expression-exclusion', false],
      ['ambiguous-primary-reader', false],
      ['canonical-direct-invocation', true],
    ],
  );
  assert.match(definition.evals.at(-1).prompt, /^\/agent-writing\b/);
});

test('Contract coverage maps every clause to a case owned by the highest Skill', () => {
  loadDefinition('writing-foundation', 'role.json');
  loadDefinition('writing-foundation', 'trigger.json');
  loadDefinition('agent-writing', 'role.json');
  loadDefinition('agent-writing', 'trigger.json');
  loadDefinition('agent-writing', 'component.json');
  loadDefinition('agent-writing', 'outcome.json');
  loadPackageClosureCases();
  const coverage = readJson(path.join(skillRoot, 'evals', 'contract-coverage.json'));
  const entries = new Map(coverage.clauses.map((entry) => [entry.id, entry]));

  assert.deepEqual(
    [...entries.keys()].sort(),
    [...expectedCoverage.keys()].sort(),
  );
  for (const [clause, owner] of expectedCoverage) {
    const entry = entries.get(clause);
    assert.equal(entry.owner, owner, clause);
    assert.ok(entry.cases.length > 0, `${clause} must have a case`);
    for (const reference of entry.cases) {
      const definition = definitions.get(reference.scope);
      assert.ok(definition, `${reference.scope} must identify a definition`);
      assert.equal(definition.skill_name, owner, `${clause} has the wrong owner`);
      const caseDefinition = definition.evals.find(
        ({ id }) => String(id) === String(reference.id),
      );
      assert.ok(caseDefinition, caseKey(reference.scope, reference.id));
      assert.equal(
        caseDefinition.covered_clauses.includes(clause),
        true,
        `${caseKey(reference.scope, reference.id)} must cover ${clause}`,
      );
    }
  }
});

test('deterministic grading reports clause evidence and blocks blind judgment', () => {
  const definition = loadDefinition('agent-writing', 'outcome.json');
  const caseDefinition = definition.evals[0];
  const fixtureOutput = fs.readFileSync(
    path.join(skillRoot, 'evals', 'fixtures', 'outcome-output.md'),
    'utf8',
  );
  const passing = gradeDeterministicOutput({
    definition,
    caseDefinition,
    output: fixtureOutput,
  });

  assert.equal(passing.passed, true);
  assert.ok(passing.checks.length > 0);
  for (const check of passing.checks) {
    assert.match(check.name, /^(?:signal aw-|order )/);
    assert.match(check.details, /line \d+/);
  }

  const incompleteOutput = fixtureOutput.replace(/^Branch:.*\n/m, '');
  const failing = gradeDeterministicOutput({
    definition,
    caseDefinition,
    output: incompleteOutput,
  });
  assert.equal(failing.passed, false);
  assert.equal(
    failing.checks.find(({ name }) => name === 'signal aw-branches').passed,
    false,
  );

  const manifest = createCampaignManifest({
    definition,
    packageRevision: 'db26f9d7410b982995a8f7b5a50ef045238a4fd4',
    cells: [{ host: 'claude-code', model: 'test-model' }],
    repetitions: 1,
    executionConfiguration: { timeout_ms: 1000, tools: [] },
    limitations: ['Static fixture only; no model behavior claim.'],
  });
  const cell = manifest.cells[0];
  const control = createRunEvidence({
    manifest,
    caseDefinition,
    cell,
    repetition: 1,
    arm: 'no-skill',
    result: normalizedResult({ output: 'Unstructured response.', invokedSkills: [] }),
    deterministicGrade: { passed: true, checks: [], status: 'baseline' },
  });
  const treatment = createRunEvidence({
    manifest,
    caseDefinition,
    cell,
    repetition: 1,
    arm: 'treatment',
    result: normalizedResult({
      output: incompleteOutput,
      invokedSkills: ['writing-foundation', 'agent-writing'],
    }),
    deterministicGrade: failing,
  });

  assert.throws(
    () => createBlindComparison({
      manifest,
      definition,
      caseDefinition,
      repetition: 1,
      control,
      treatment,
      judgeModel: 'judge-model',
    }),
    /deterministic gate failed before judging/,
  );
});
