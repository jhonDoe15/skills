'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  defineProductionAdapter,
  discoverCanonicalPackage,
  executeProduction,
} = require('../suite');
const {
  validateEvaluationDefinition,
} = require('../suite/evaluation');
const {
  executeTest,
} = require('../suite/testing');
const {
  gradeDispatchResult,
  validateDispatchArtifact,
} = require('../skills/dispatch-work/evals/grader');

const REPOSITORY_ROOT = path.join(__dirname, '..');
const DISPATCH_FIXTURE_ROOT = path.join(__dirname, 'fixtures', 'dispatch-work');
const EVALUATION_ROOT = path.join(
  REPOSITORY_ROOT,
  'skills',
  'dispatch-work',
  'evals',
);
const COMPLETE_DISPATCH_CLOSURE = [
  'dispatch-work',
  'take-ticket',
  'take-it-offline',
  'code-review',
  'implement',
  'review-coordinator',
  'review-worker',
  'engineering-guidance',
  'agent-writing',
  'writing-foundation',
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function minimalArtifact() {
  return {
    schema: 'dispatch-work-artifact/v1',
    source_dag: {
      identity: 'fixture://published-dag/ordinary-frontier',
      published: true,
      ready: true,
      tickets: [],
      dependencies: [],
    },
    authorization: {
      explicit: true,
      granted: true,
      source: 'fixture://authorization/dispatch',
    },
    frontier_calculations: [],
    ticket_lifecycles: [],
    completion_events: [],
    dependency_transitions: [],
    synthesis: [],
    final_state: {
      status: 'completed',
      open_tickets: [],
      active_tickets: [],
      completed_tickets: [],
    },
  };
}

test('dispatch rejects absent explicit authorization before execution', () => {
  const unauthorized = minimalArtifact();
  unauthorized.authorization.explicit = false;

  assert.throws(
    () => validateDispatchArtifact(unauthorized),
    /explicit dispatch authorization is required/,
  );
});

test('dispatch requires a published ready DAG rather than a plan artifact', () => {
  for (const field of ['published', 'ready']) {
    const unavailable = minimalArtifact();
    unavailable.source_dag[field] = false;

    assert.throws(
      () => validateDispatchArtifact(unavailable),
      /published ready DAG is required/,
      field,
    );
  }
});

test('fixture Adapters normalize observed dispatch and reviewed-ticket evidence', async (t) => {
  const artifact = readJson(
    path.join(DISPATCH_FIXTURE_ROOT, 'completed-dispatch.json'),
  );
  const {
    createPublishedDagAdapter,
  } = require('./fixtures/dispatch-work/published-dag-adapter');
  const {
    createTakeTicketAdapter,
  } = require('./fixtures/dispatch-work/take-ticket-adapter');
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-repository-'));
  t.after(() => fs.rmSync(repository, { recursive: true, force: true }));
  fs.copyFileSync(
    path.join(DISPATCH_FIXTURE_ROOT, 'repository', 'app.txt'),
    path.join(repository, 'app.txt'),
  );
  assert.equal(
    spawnSync('git', ['init', '--quiet'], { cwd: repository }).status,
    0,
  );
  const packageRoot = createPackageFixture(t, COMPLETE_DISPATCH_CLOSURE);
  const invocation = {
    requestId: 'dispatch-fixture',
    skill: 'dispatch-work',
    prompt: 'Dispatch the authorized published ready fixture DAG.',
    model: 'fixture-model',
  };
  const publishedDagResult = await executeTest({
    repositoryRoot: packageRoot,
    adapter: createPublishedDagAdapter(),
    invocation,
  });
  const takeTicketResult = await executeTest({
    repositoryRoot: packageRoot,
    adapter: createTakeTicketAdapter({ repository }),
    invocation,
  });
  const artifactFiles = {
    'fixture://dispatch/completed': 'completed-dispatch.json',
    'fixture://reviewed-ticket/B': 'reviewed-ticket-B.json',
  };
  function resolveArtifact(reference) {
    return readJson(path.join(DISPATCH_FIXTURE_ROOT, artifactFiles[reference]));
  }
  const graded = gradeDispatchResult(takeTicketResult, { resolveArtifact });

  assert.deepEqual(
    publishedDagResult.observations.toolUses,
    [{ name: 'published-dag.read', outcome: 'succeeded' }],
  );
  assert.strictEqual(graded.artifact.schema, 'dispatch-work-artifact/v1');
  assert.equal(graded.reviewedTicket.ticket, 'B');
  assert.deepEqual(
    takeTicketResult.observations.attemptedMutations
      .filter(({ target }) => target.startsWith('fixture-repository:'))
      .map(({ target }) => target),
    [
      'fixture-repository:A',
      'fixture-repository:C',
      'fixture-repository:B',
      'fixture-repository:D',
    ],
  );
});

function createPackageFixture(t, skillNames) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-work-package-'));
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

test('production package closure fails on each exact canonical dependency', async (t) => {
  const contract = readJson(path.join(EVALUATION_ROOT, 'package-closure.json'));
  let executions = 0;
  const adapter = defineProductionAdapter({
    name: 'dispatch-work-package-closure',
    async execute() {
      executions += 1;
      throw new Error('must not execute');
    },
  });
  const installedByMissingDependency = {
    'take-it-offline': ['dispatch-work'],
    'take-ticket': [
      'agent-writing',
      'dispatch-work',
      'take-it-offline',
      'writing-foundation',
    ],
  };

  for (const contractCase of contract.cases) {
    const root = createPackageFixture(
      t,
      installedByMissingDependency[contractCase.missing_dependency],
    );
    const result = await executeProduction({
      repositoryRoot: root,
      adapter,
      invocation: {
        requestId: contractCase.id,
        skill: 'dispatch-work',
        prompt: 'Dispatch the authorized published ready DAG.',
        model: 'test-model',
      },
    });
    assert.deepEqual(result.failure, contractCase.expected_failure);
  }
  assert.equal(executions, 0);
});

test('evaluation catalog separates role, both components, outcome, and routing', () => {
  const definitions = [
    'role.json',
    'component-take-ticket.json',
    'component-take-it-offline.json',
    'outcome.json',
    'trigger.json',
  ].map((fileName) => readJson(path.join(EVALUATION_ROOT, fileName)));

  for (const definition of definitions) {
    assert.strictEqual(
      validateEvaluationDefinition(
        definition,
        REPOSITORY_ROOT,
      ),
      definition,
    );
    assert.equal(definition.evaluation.skill, 'dispatch-work');
  }
  assert.deepEqual(
    definitions.map(({ evaluation }) => evaluation.layer),
    ['role', 'component', 'component', 'outcome', 'trigger'],
  );
  assert.deepEqual(
    definitions.slice(1, 3).map(
      ({ evals }) => evals[0].ablated_dependency,
    ),
    ['take-ticket', 'take-it-offline'],
  );
  assert.deepEqual(
    definitions[3].evals[0].required_skill_loads,
    COMPLETE_DISPATCH_CLOSURE,
  );
  for (const definition of definitions) {
    assert.notEqual(Object.keys(definition.signals).length, 0);
  }
  assert.deepEqual(
    definitions[0].evals[0].artifact_checks,
    [
      'authorization',
      'frontier-causality',
      'reviewed-lifecycle',
      'synthesis-timing',
      'replay-state',
    ],
  );
});

test('only complete authoritative reviewed-ticket results advance the DAG', () => {
  const artifact = readJson(
    path.join(DISPATCH_FIXTURE_ROOT, 'completed-dispatch.json'),
  );
  artifact.ticket_lifecycles[1].result.status = 'ordinary-success';

  assert.throws(
    () => validateDispatchArtifact(artifact),
    /complete authoritative reviewed-ticket result/,
  );
});

test('replay retains pre-satisfied state and non-complete terminal recovery', () => {
  const artifact = readJson(
    path.join(DISPATCH_FIXTURE_ROOT, 'held-dispatch.json'),
  );

  assert.strictEqual(validateDispatchArtifact(artifact), artifact);
  assert.deepEqual(artifact.final_state.completed_tickets, ['A']);
  assert.deepEqual(artifact.final_state.held_tickets, ['B']);
  assert.deepEqual(artifact.final_state.blocked_tickets, ['C']);
  assert.deepEqual(artifact.final_state.failed_tickets, ['D']);
  assert.equal(
    artifact.final_state.first_recovery_action,
    'Resolve the human decision recorded by ticket B, then resume B.',
  );

  const misclassified = readJson(
    path.join(DISPATCH_FIXTURE_ROOT, 'held-dispatch.json'),
  );
  misclassified.final_state.open_tickets = ['C'];
  misclassified.final_state.blocked_tickets = [];
  assert.throws(
    () => validateDispatchArtifact(misclassified),
    /final (?:open|blocked)_tickets/,
  );
});

test('dispatch rejects cyclic DAGs and starts without one selecting calculation', () => {
  const withoutSelection = readJson(
    path.join(DISPATCH_FIXTURE_ROOT, 'completed-dispatch.json'),
  );
  delete withoutSelection.ticket_lifecycles[0].frontier_calculation;
  assert.throws(
    () => validateDispatchArtifact(withoutSelection),
    /frontier calculation/,
  );

  const cyclic = readJson(
    path.join(DISPATCH_FIXTURE_ROOT, 'completed-dispatch.json'),
  );
  cyclic.source_dag.tickets[0].dependencies.push('D');
  cyclic.source_dag.dependencies.push({
    ticket: 'A',
    depends_on: 'D',
    initial_state: 'open',
  });
  assert.throws(
    () => validateDispatchArtifact(cyclic),
    /cycle/,
  );
});

test('frontier synthesis binds exact selections after their completion events', () => {
  const premature = readJson(
    path.join(DISPATCH_FIXTURE_ROOT, 'completed-dispatch.json'),
  );
  premature.synthesis[0].sequence = 7;
  assert.throws(
    () => validateDispatchArtifact(premature),
    /after.*completion events/,
  );

  const duplicateFrontier = readJson(
    path.join(DISPATCH_FIXTURE_ROOT, 'completed-dispatch.json'),
  );
  duplicateFrontier.synthesis[1].frontier_id = 'frontier-1';
  assert.throws(
    () => validateDispatchArtifact(duplicateFrontier),
    /unique frontier calculation/,
  );
});

test('completed fixture does not retain an unmodeled gate before ticket D', () => {
  const artifact = readJson(
    path.join(DISPATCH_FIXTURE_ROOT, 'completed-dispatch.json'),
  );

  assert.deepEqual(
    artifact.synthesis[0].recommendations,
    ['accept A', 'accept C'],
  );
  assert.strictEqual(validateDispatchArtifact(artifact), artifact);
});

test('test-only dispatch Adapters remain outside production package surfaces', (t) => {
  const packageRoot = createPackageFixture(t, ['dispatch-work']);
  const packageDefinition = discoverCanonicalPackage(packageRoot);

  assert.deepEqual(
    packageDefinition.skills.map(({ name }) => name),
    ['dispatch-work'],
  );
  assert.equal(
    require('../suite').createTakeTicketAdapter,
    undefined,
  );
  assert.equal(
    require('../suite/testing').createTakeTicketAdapter,
    undefined,
  );
  assert.equal(
    require('../suite').createPublishedDagAdapter,
    undefined,
  );
  assert.equal(
    require('../suite/testing').createPublishedDagAdapter,
    undefined,
  );
});
