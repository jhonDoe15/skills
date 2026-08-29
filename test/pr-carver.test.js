'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  defineProductionAdapter,
  discoverCanonicalPackage,
  executeProduction,
  loadCanonicalSuite,
} = require('../suite');
const {
  validateEvaluationDefinition,
} = require('../suite/evaluation');
const {
  executeTest,
} = require('../suite/testing');
const {
  gradePrCarverResult,
  validateTopologyAssessment,
} = require('../skills/pr-carver/evals/grader');
const {
  createAssessmentAdapter,
} = require('./fixtures/pr-carver/assessment-adapter');

const REPOSITORY_ROOT = path.join(__dirname, '..');
const EVALUATION_ROOT = path.join(
  REPOSITORY_ROOT,
  'skills',
  'pr-carver',
  'evals',
);
const FIXTURE_ROOT = path.join(__dirname, 'fixtures', 'pr-carver');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readEvaluation(fileName) {
  return readJson(path.join(EVALUATION_ROOT, fileName));
}

function readFixture(fileName) {
  return readJson(path.join(FIXTURE_ROOT, fileName));
}

function createPackageFixture(t, skillNames) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-carver-package-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'suite'), { recursive: true });
  fs.copyFileSync(
    path.join(REPOSITORY_ROOT, 'suite', 'canonical-suite.json'),
    path.join(root, 'suite', 'canonical-suite.json'),
  );
  for (const name of skillNames) {
    const directory = path.join(root, 'skills', name);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(
      path.join(directory, 'SKILL.md'),
      `---\nname: ${name}\ndescription: Test fixture.\n---\n`,
    );
  }
  return root;
}

test('PR Carver contract is topology-first, fail-closed, and read-only', () => {
  const skill = fs.readFileSync(path.join(
    REPOSITORY_ROOT,
    'skills',
    'pr-carver',
    'SKILL.md',
  ), 'utf8');
  const readme = fs.readFileSync(path.join(REPOSITORY_ROOT, 'README.md'), 'utf8');

  assert.match(skill, /Missing internal dependency "ticket-scope"/);
  assert.doesNotMatch(skill, /\b(?:500|1000)\b/);
  assert.match(skill, /direct ordering edges/i);
  assert.match(skill, /migration treatment/i);
  assert.match(skill, /collisions require serialization/i);
  assert.match(skill, /read-only/i);
  assert.doesNotMatch(readme, /bands at 500 and 1000/);
  assert.match(readme, /concrete prerequisite edges/i);
});

test('PR Carver evaluation catalog covers role, component, outcome, and routing', () => {
  const definitions = [
    'role.json',
    'component.json',
    'outcome.json',
    'trigger.json',
  ].map(readEvaluation);

  for (const definition of definitions) {
    assert.strictEqual(
      validateEvaluationDefinition(definition, REPOSITORY_ROOT),
      definition,
    );
    assert.equal(definition.evaluation.skill, 'pr-carver');
    assert.deepEqual(definition.evaluation.hosts, ['claude-code', 'cursor']);
  }
  assert.deepEqual(
    definitions.map(({ evaluation }) => evaluation.layer),
    ['role', 'component', 'outcome', 'trigger'],
  );
  assert.equal(definitions[1].evals[0].ablated_dependency, 'ticket-scope');
  assert.deepEqual(definitions[2].evals[0].required_skill_loads, [
    'pr-carver',
    'ticket-scope',
  ]);
});

test('production package closure fails before PR Carver when Ticket Scope is absent', async (t) => {
  const contract = readEvaluation('package-closure.json');
  const root = createPackageFixture(t, ['pr-carver']);
  let executions = 0;
  const result = await executeProduction({
    repositoryRoot: root,
    adapter: defineProductionAdapter({
      name: 'pr-carver-package-closure',
      async execute() {
        executions += 1;
        throw new Error('must not execute');
      },
    }),
    invocation: {
      requestId: contract.cases[0].id,
      skill: 'pr-carver',
      prompt: 'Assess one existing branch.',
      model: 'test-model',
    },
  });

  assert.equal(executions, 0);
  assert.deepEqual(result.failure, contract.cases[0].expected_failure);
  assert.deepEqual(result.observations.responses, []);
  assert.deepEqual(result.observations.attemptedMutations, []);
  assert.deepEqual(
    loadCanonicalSuite(REPOSITORY_ROOT).runtimeEdges.filter(
      ({ consumer }) => consumer === 'pr-carver',
    ),
    [{ consumer: 'pr-carver', dependency: 'ticket-scope' }],
  );
});

test('topology fixtures preserve migration order and collision separation', () => {
  const normal = readFixture('normal-parallel.json');
  const onePr = readFixture('one-pr.json');
  const prefactor = readFixture('prefactor.json');
  const expandContract = readFixture('expand-contract.json');
  const missingPrerequisite = readFixture('missing-prerequisite.json');
  const needsDecision = readFixture('needs-decision.json');

  for (const assessment of [
    normal,
    onePr,
    prefactor,
    expandContract,
    missingPrerequisite,
    needsDecision,
  ]) {
    assert.strictEqual(validateTopologyAssessment(assessment), assessment);
    assert.deepEqual(assessment.authorization.allowed_mutations, []);
  }
  assert.equal(normal.structure, 'parallel');
  assert.deepEqual(normal.ordering_edges, []);
  assert.equal(onePr.structure, 'one-pr');
  assert.equal(onePr.units.length, 1);
  assert.deepEqual(
    prefactor.ordering_edges.map(({ prerequisite, consumer }) => (
      [prerequisite, consumer]
    )),
    [['prefactor-seam', 'api-behavior']],
  );
  assert.equal(expandContract.structure, 'stacked');
  assert.equal(
    expandContract.ordering_edges.some(({ prerequisite, consumer }) => (
      (prerequisite === 'api-consumer' && consumer === 'data-backfill')
      || (prerequisite === 'data-backfill' && consumer === 'api-consumer')
    )),
    false,
  );
  assert.deepEqual(
    expandContract.collisions.map(({ units }) => units),
    [['api-consumer', 'data-backfill']],
  );
  assert.equal(needsDecision.status, 'needs-decision');
  assert.equal(needsDecision.structure, 'needs-decision');
  assert.equal(missingPrerequisite.status, 'needs-decision');

  const collisionAsDependency = structuredClone(expandContract);
  collisionAsDependency.ordering_edges.push({
    prerequisite: 'api-consumer',
    consumer: 'data-backfill',
    output: 'shared generated manifest',
  });
  assert.throws(
    () => validateTopologyAssessment(collisionAsDependency),
    /collision.*ordering edge/i,
  );
});

test('test Adapter exposes read-only outcome evidence without entering production', async (t) => {
  const packageRoot = createPackageFixture(t, ['pr-carver', 'ticket-scope']);
  const artifactReference = 'fixture://pr-carver/normal-parallel';
  const adapter = createAssessmentAdapter({ artifactReference });
  const invocation = {
    requestId: 'pr-carver-read-only',
    skill: 'pr-carver',
    prompt: 'Assess this existing branch without mutation.',
    model: 'fixture-model',
  };
  const result = await executeTest({
    repositoryRoot: packageRoot,
    adapter,
    invocation,
  });
  const fixture = readFixture('normal-parallel.json');
  const graded = gradePrCarverResult(result, {
    resolveArtifact: (reference) => (
      reference === artifactReference ? fixture : null
    ),
  });

  assert.strictEqual(graded.assessment, fixture);
  assert.deepEqual(result.observations.attemptedMutations, []);

  const writeAttempt = structuredClone(result);
  writeAttempt.observations.attemptedMutations.push({
    operation: 'push',
    target: 'fixture/branch',
    outcome: 'blocked',
  });
  assert.throws(
    () => gradePrCarverResult(writeAttempt, {
      resolveArtifact: () => fixture,
    }),
    /read-only/,
  );

  const ablated = await executeTest({
    repositoryRoot: packageRoot,
    adapter,
    invocation: {
      ...invocation,
      requestId: 'pr-carver-component-ablation',
    },
    dependencyAblation: {
      consumer: 'pr-carver',
      dependency: 'ticket-scope',
    },
  });
  assert.throws(
    () => gradePrCarverResult(ablated, {
      resolveArtifact: () => fixture,
    }),
    /Ticket Scope|assessment artifact/,
  );

  assert.deepEqual(
    discoverCanonicalPackage(packageRoot).skills.map(({ name }) => name),
    ['pr-carver', 'ticket-scope'],
  );
  assert.equal(require('../suite').createAssessmentAdapter, undefined);
  assert.equal(require('../suite/testing').createAssessmentAdapter, undefined);
});

test('evaluation cases cover migration, activation, private routing, and evidence', () => {
  const role = readEvaluation('role.json');
  const component = readEvaluation('component.json');
  const outcome = readEvaluation('outcome.json');
  const trigger = readEvaluation('trigger.json');
  const roleFixture = readJson(path.join(
    REPOSITORY_ROOT,
    role.evals[0].files[0],
  ));
  const ticketScopeTrigger = readJson(path.join(
    REPOSITORY_ROOT,
    'skills',
    'ticket-scope',
    'evals',
    'trigger.json',
  ));
  const packageClosure = readEvaluation('package-closure.json');

  assert.deepEqual(
    outcome.evals.map(({ id }) => id),
    [
      'normal-independent-units',
      'cohesive-one-pr',
      'prefactor-enables-consumer',
      'expand-contract-with-collision',
      'missing-prerequisite-evidence',
      'contradictory-prerequisites',
      'separate-mutation-authorization',
    ],
  );
  assert.deepEqual(
    trigger.evals.map(({ id, should_trigger: shouldTrigger }) => (
      [id, shouldTrigger]
    )),
    [
      ['existing-pr-topology', true],
      ['canonical-pr-carver', true],
      ['unrelated-size-request', false],
    ],
  );
  assert.equal(trigger.evals[1].canonical_invocation, true);
  assert.equal(
    ticketScopeTrigger.evals.find(
      ({ id }) => id === 'private-ambient-false-activation',
    ).should_trigger,
    false,
  );
  assert.strictEqual(validateTopologyAssessment(roleFixture), roleFixture);
  assert.notEqual(roleFixture.ordering_edges.length, 0);
  assert.notEqual(roleFixture.collisions.length, 0);
  for (const definition of [role, component, outcome]) {
    assert.equal(
      definition.judge.dimensions.every(({ description }) => (
        /quote or reference output evidence/i.test(description)
      )),
      true,
    );
    assert.equal(
      definition.evals.every(({ expectations }) => (
        expectations.some((expectation) => /sampled human review/i.test(expectation))
      )),
      true,
    );
  }
  assert.equal(component.evals[0].missing_dependency, undefined);
  assert.equal(component.evals[0].expected_failure, undefined);
  assert.equal(packageClosure.cases[0].missing_dependency, 'ticket-scope');
});
