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

test('staggered completions expose a moving frontier without a fixed barrier', async () => {
  const artifact = readJson(
    path.join(DISPATCH_FIXTURE_ROOT, 'completed-dispatch.json'),
  );
  const {
    createPublishedDagAdapter,
  } = require('./fixtures/dispatch-work/published-dag-adapter');
  const {
    createTakeTicketAdapter,
  } = require('./fixtures/dispatch-work/take-ticket-adapter');
  const dagAdapter = createPublishedDagAdapter(artifact.source_dag);
  const takeTicketAdapter = createTakeTicketAdapter();

  const sourceDag = await dagAdapter.read();
  const ticketA = takeTicketAdapter.start('A');
  const ticketC = takeTicketAdapter.start('C');
  takeTicketAdapter.complete('A', artifact.ticket_lifecycles[0].result);
  await ticketA;
  const ticketB = takeTicketAdapter.start('B');

  assert.deepEqual(sourceDag, artifact.source_dag);
  assert.deepEqual(takeTicketAdapter.started(), ['A', 'C', 'B']);
  assert.deepEqual(takeTicketAdapter.active(), ['C', 'B']);

  takeTicketAdapter.complete('C', artifact.ticket_lifecycles[2].result);
  takeTicketAdapter.complete('B', artifact.ticket_lifecycles[1].result);
  await Promise.all([ticketB, ticketC]);

  assert.strictEqual(validateDispatchArtifact(artifact), artifact);
});

test('production contract requires canonical dependencies and event-driven advancement', () => {
  const skill = fs.readFileSync(
    path.join(REPOSITORY_ROOT, 'skills', 'dispatch-work', 'SKILL.md'),
    'utf8',
  );

  assert.match(skill, /explicit dispatch authorization/i);
  assert.match(skill, /published ready DAG/i);
  assert.match(skill, /Missing internal dependency "take-ticket"/);
  assert.match(skill, /Missing internal dependency "take-it-offline"/);
  assert.match(skill, /without waiting for unrelated active tickets/i);
  assert.match(skill, /authoritative\s+reviewed-ticket result/i);
  assert.match(skill, /implementation handoffs and Review briefs/i);
  assert.match(skill, /does not repeat per-ticket Code Review/i);
  assert.match(skill, /source DAG identity/i);
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
    [
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

test('outcome fixture uses a real repository and sandboxed effect boundaries', (t) => {
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-repository-'));
  t.after(() => fs.rmSync(repository, { recursive: true, force: true }));
  fs.copyFileSync(
    path.join(DISPATCH_FIXTURE_ROOT, 'repository', 'app.txt'),
    path.join(repository, 'app.txt'),
  );
  const initialized = spawnSync('git', ['init', '--quiet'], {
    cwd: repository,
    encoding: 'utf8',
  });
  assert.equal(initialized.status, 0, initialized.stderr);
  const inspected = spawnSync(
    'git',
    ['rev-parse', '--is-inside-work-tree'],
    { cwd: repository, encoding: 'utf8' },
  );
  assert.equal(inspected.stdout.trim(), 'true');

  for (const boundary of ['tracker', 'pr', 'ci']) {
    const fixture = readJson(
      path.join(DISPATCH_FIXTURE_ROOT, 'sandbox', `${boundary}.json`),
    );
    assert.equal(fixture.sandboxed, true, boundary);
    assert.equal(fixture.writes_allowed, false, boundary);
  }
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

test('documented Dispatch Work outcome matches the moving frontier contract', () => {
  const readme = fs.readFileSync(path.join(REPOSITORY_ROOT, 'README.md'), 'utf8');
  const dispatchSection = readme.match(
    /## `\/dispatch-work`[\s\S]*?(?=\n## |\n# |$)/,
  )?.[0] || '';
  const normalizedSection = dispatchSection.replace(/\s+/g, ' ');

  assert.match(normalizedSection, /published ready ticket DAG/i);
  assert.match(normalizedSection, /Take Ticket/i);
  assert.match(normalizedSection, /completion event/i);
  assert.match(normalizedSection, /without waiting for unrelated work/i);
  assert.doesNotMatch(normalizedSection, /babysat through PR approval/i);
});
