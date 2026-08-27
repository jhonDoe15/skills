'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
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

const repositoryRoot = path.resolve(__dirname, '..');
const readyPlanPath = path.join(
  __dirname,
  'fixtures',
  'carve',
  'ready-plan.json',
);
const validatorPath = path.join(
  repositoryRoot,
  'skills',
  'slice-plan',
  'scripts',
  'validate-plan.js',
);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readEvaluation(owner, file) {
  return readJson(path.join(
    repositoryRoot,
    'skills',
    owner,
    'evals',
    file,
  ));
}

function runValidator(t, plan) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'slice-plan-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const planPath = path.join(directory, 'plan.json');
  fs.writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`);
  return spawnSync(process.execPath, [validatorPath, planPath], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
}

function createPackageFixture(t, skillNames) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'carve-package-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'suite'), { recursive: true });
  fs.copyFileSync(
    path.join(repositoryRoot, 'suite', 'canonical-suite.json'),
    path.join(root, 'suite', 'canonical-suite.json'),
  );
  for (const name of skillNames) {
    const source = path.join(repositoryRoot, 'skills', name, 'SKILL.md');
    assert.equal(fs.existsSync(source), true, `${name} must have a canonical Skill`);
    const destination = path.join(root, 'skills', name, 'SKILL.md');
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }
  return root;
}

function invocation(skill) {
  return {
    requestId: `missing-${skill}`,
    skill,
    prompt: 'Produce the ordinary settled-requirements plan.',
    model: 'test-model',
  };
}

function skillEvent(name, index) {
  return {
    name,
    operation: 'load',
    status: 'succeeded',
    trigger: name === 'carve' ? 'user' : 'host',
    callId: `carve-${index}`,
    provenance: {
      host: 'fixture',
      mechanism: 'deterministic-publication-fixture',
      eventType: 'fixture.skill-load',
      observerVersion: '1',
      statusSource: 'observed',
    },
  };
}

function normalizedPlanningResult({
  artifactReference,
  attemptedMutations = [],
}) {
  const resolvedSkills = [
    'writing-foundation',
    'agent-writing',
    'take-it-offline',
    'ticket-scope',
    'slice-plan',
    'carve',
  ];
  return {
    status: 'succeeded',
    observations: {
      packageSkills: [
        'agent-writing',
        'carve',
        'slice-plan',
        'take-it-offline',
        'ticket-scope',
        'writing-foundation',
      ],
      hostAvailableSkills: null,
      preExecutionInventory: {
        skillDefinitions: resolvedSkills.map((name) => ({
          name,
          path: `.fixture/skills/${name}/SKILL.md`,
          digest: '0'.repeat(64),
        })),
        plugins: [],
        ruleSources: [],
        packageDigest: '1'.repeat(64),
        truncated: false,
      },
      skillEvents: resolvedSkills.map(skillEvent),
      routing: {
        requestedSkill: 'carve',
        resolvedSkills,
      },
      responses: [{ text: `Ready plan: ${artifactReference}` }],
      artifacts: [{
        reference: artifactReference,
        mediaType: 'application/json',
      }],
      toolUses: [],
      attemptedMutations,
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

async function missingDependency(t, skill, installed, expectedName) {
  const root = createPackageFixture(t, installed);
  let executions = 0;
  const result = await executeProduction({
    repositoryRoot: root,
    adapter: defineProductionAdapter({
      name: `missing-${expectedName}`,
      async execute() {
        executions += 1;
        throw new Error('must not execute');
      },
    }),
    invocation: invocation(skill),
  });

  assert.equal(executions, 0);
  assert.deepEqual(result.failure, {
    stage: 'dependency-resolution',
    code: 'missing-internal-dependency',
    message: `Missing internal dependency "${expectedName}"`,
    missingSkill: expectedName,
  });
  assert.deepEqual(result.observations.responses, []);
  assert.deepEqual(result.observations.artifacts, []);
  assert.deepEqual(result.observations.attemptedMutations, []);
}

test('canonical package contains the complete ordinary Carve planning roles', (t) => {
  const root = createPackageFixture(
    t,
    ['carve', 'slice-plan', 'ticket-scope'],
  );
  const names = discoverCanonicalPackage(root).skills
    .map(({ name }) => name);

  assert.equal(names.includes('carve'), true);
  assert.equal(names.includes('slice-plan'), true);
  assert.equal(names.includes('ticket-scope'), true);
});

test('canonical graph exposes only the settled Carve planning runtime edges', () => {
  const suite = loadCanonicalSuite(repositoryRoot);
  const planningEdges = suite.runtimeEdges.filter(({ consumer }) => (
    consumer === 'carve' || consumer === 'slice-plan'
  ));

  assert.deepEqual(planningEdges, [
    { consumer: 'carve', dependency: 'slice-plan' },
    { consumer: 'slice-plan', dependency: 'take-it-offline' },
    { consumer: 'slice-plan', dependency: 'ticket-scope' },
  ]);
});

test('production package closure reports each missing planning dependency exactly', async (t) => {
  await missingDependency(t, 'carve', ['carve'], 'slice-plan');
  await missingDependency(
    t,
    'slice-plan',
    ['slice-plan', 'ticket-scope'],
    'take-it-offline',
  );
  await missingDependency(
    t,
    'carve',
    [
      'agent-writing',
      'carve',
      'slice-plan',
      'take-it-offline',
      'writing-foundation',
    ],
    'ticket-scope',
  );
});

test('ordinary ready plan passes deterministic graph and coverage validation', (t) => {
  const result = runValidator(t, readJson(readyPlanPath));

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Valid slice-plan\/v1 ready plan/);
});

test('ordinary plan schema declares the validated artifact contract', () => {
  const schema = readJson(path.join(
    repositoryRoot,
    'skills',
    'slice-plan',
    'schemas',
    'plan.schema.json',
  ));

  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.$id, 'https://jhonDoe15.github.io/skills/schemas/slice-plan-v1.json');
  assert.deepEqual(schema.required, [
    'schema',
    'status',
    'migration_strategy',
    'requirements',
    'coverage_ledger',
    'tickets',
    'initial_frontier',
  ]);
  assert.equal(schema.additionalProperties, false);
});

test('plan validation rejects silent requirement omissions', (t) => {
  const plan = readJson(readyPlanPath);
  plan.coverage_ledger.pop();

  const result = runValidator(t, plan);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /coverage_ledger must cover every requirement exactly once/);
});

test('plan validation rejects blockers without concrete consumed output', (t) => {
  const plan = readJson(readyPlanPath);
  plan.tickets[1].consumes = [];

  const result = runValidator(t, plan);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /blockers and consumes must identify the same direct tickets/);
});

test('plan validation preserves unambiguous replacement lineage', (t) => {
  const plan = readJson(readyPlanPath);
  plan.tickets[0].replaces = ['OLD-1'];
  plan.tickets[1].replaces = ['OLD-1'];

  const result = runValidator(t, plan);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /replacement lineage contains duplicate "OLD-1"/);
});

test('plan validation rejects cycles, redundant blockers, and an incorrect frontier', (t) => {
  const cycle = readJson(readyPlanPath);
  cycle.tickets[0].blockers = ['T2'];
  cycle.tickets[0].consumes = [{
    ticket_id: 'T2',
    output: 'The API path that depends on the schema.',
  }];
  assert.match(runValidator(t, cycle).stderr, /ticket dependency graph must be acyclic/);

  const redundant = readJson(readyPlanPath);
  redundant.requirements[0].text = 'Store and audit each account time zone.';
  redundant.coverage_ledger[0].ticket_ids.push('T3');
  redundant.tickets.push({
    id: 'T3',
    title: 'Audit account time-zone changes',
    outcome: 'Operators can audit account time-zone changes.',
    shape: 'vertical',
    in_scope: ['Record API updates in the audit stream.'],
    out_of_scope: ['Add new audit storage.'],
    acceptance: ['Updating a preference emits an audit record.'],
    validation: ['Run the audit integration test.'],
    replaces: [],
    blockers: ['T1', 'T2'],
    consumes: [
      {
        ticket_id: 'T1',
        output: 'The migrated account table.',
      },
      {
        ticket_id: 'T2',
        output: 'The account preference update path.',
      },
    ],
    collisions: [],
  });
  assert.match(runValidator(t, redundant).stderr, /transitively redundant blocker/);

  const wrongFrontier = readJson(readyPlanPath);
  wrongFrontier.initial_frontier = ['T2'];
  assert.match(runValidator(t, wrongFrontier).stderr, /initial_frontier/);
});

test('owner-local evaluations cover planning roles, edges, outcome, and routing', () => {
  const files = [
    ['ticket-scope', 'role.json', 'role'],
    ['ticket-scope', 'trigger.json', 'trigger'],
    ['slice-plan', 'role.json', 'role'],
    ['slice-plan', 'component-ticket-scope.json', 'component'],
    ['slice-plan', 'component-take-it-offline.json', 'component'],
    ['slice-plan', 'trigger.json', 'trigger'],
    ['carve', 'role.json', 'role'],
    ['carve', 'component.json', 'component'],
    ['carve', 'outcome.json', 'outcome'],
    ['carve', 'trigger.json', 'trigger'],
  ];

  for (const [owner, file, layer] of files) {
    const definition = readEvaluation(owner, file);
    assert.strictEqual(
      validateEvaluationDefinition(definition, repositoryRoot),
      definition,
    );
    assert.equal(definition.skill_name, owner);
    assert.equal(definition.evaluation.layer, layer);
    assert.deepEqual(definition.evaluation.hosts, ['claude-code', 'cursor']);
  }
});

test('outcome and role cases declare matched fresh-session controls and exact loads', () => {
  const carveOutcome = readEvaluation('carve', 'outcome.json');
  const sliceRole = readEvaluation('slice-plan', 'role.json');

  assert.deepEqual(carveOutcome.evaluation.arms, ['no-skill', 'treatment']);
  assert.deepEqual(carveOutcome.evals[0].required_skill_loads, [
    'carve',
    'slice-plan',
    'ticket-scope',
    'take-it-offline',
    'agent-writing',
    'writing-foundation',
  ]);
  assert.deepEqual(sliceRole.evaluation.arms, ['no-skill', 'treatment']);
  assert.deepEqual(sliceRole.evals[0].required_skill_loads, [
    'slice-plan',
    'ticket-scope',
    'take-it-offline',
    'agent-writing',
    'writing-foundation',
  ]);
});

test('package-closure failures remain separate from component ablations', () => {
  const carveClosure = readEvaluation('carve', 'package-closure.json');
  const sliceClosure = readEvaluation('slice-plan', 'package-closure.json');

  assert.deepEqual(
    carveClosure.cases.map(({ consumer, missing_dependency: missingDependency }) => (
      [consumer, missingDependency]
    )),
    [['carve', 'slice-plan']],
  );
  assert.deepEqual(
    sliceClosure.cases.map(({ consumer, missing_dependency: missingDependency }) => (
      [consumer, missingDependency]
    )),
    [
      ['slice-plan', 'ticket-scope'],
      ['slice-plan', 'take-it-offline'],
    ],
  );
  for (const [owner, file] of [
    ['carve', 'component.json'],
    ['slice-plan', 'component-ticket-scope.json'],
    ['slice-plan', 'component-take-it-offline.json'],
  ]) {
    const component = readEvaluation(owner, file);
    assert.deepEqual(component.evaluation.arms, [
      'treatment',
      'component-ablation',
    ]);
    assert.equal(
      component.evals.every((entry) => (
        !Object.hasOwn(entry, 'missing_dependency')
          && !Object.hasOwn(entry, 'expected_failure')
      )),
      true,
    );
  }
});

test('deterministic outcome grading separates publication from plan quality', () => {
  const definition = readEvaluation('carve', 'outcome.json');
  const [authorized, assessment] = definition.evals;
  const { gradeCarveResult } = require('../skills/carve/evals/grader');
  const plan = readJson(readyPlanPath);
  const artifactReference = 'fixture://ready-plan.json';
  function resolvePlan(reference) {
    return reference === artifactReference ? plan : null;
  }
  const attemptedMutations = [
    {
      operation: 'create-ticket',
      target: 'T1',
      outcome: 'succeeded',
    },
    {
      operation: 'create-ticket',
      target: 'T2',
      outcome: 'succeeded',
    },
    {
      operation: 'create-blocker',
      target: 'T2<-T1',
      outcome: 'succeeded',
    },
  ];
  const publication = {
    ticket_ids: ['T1', 'T2'],
    blockers: [{ ticket_id: 'T2', blocked_by: 'T1' }],
    initial_frontier: ['T1'],
    later_workflow_started: false,
  };
  function grade(caseDefinition, mutations, observedPublication = null) {
    return gradeCarveResult({
      definition,
      caseDefinition,
      result: normalizedPlanningResult({
        artifactReference,
        attemptedMutations: mutations,
      }),
      resolvePlan,
      observedPublication,
    });
  }

  assert.equal(authorized.publication_authorized, true);
  assert.equal(grade(authorized, attemptedMutations, publication).passed, true);
  assert.equal(
    grade(authorized, attemptedMutations, {
      ...publication,
      ticket_ids: ['T1', 'T1'],
    }).passed,
    false,
    'duplicate read-back must not hide a missing ticket',
  );
  assert.equal(
    grade(authorized, attemptedMutations, {
      ...publication,
      blockers: [],
    }).passed,
    false,
  );
  assert.equal(
    grade(authorized, [
      ...attemptedMutations,
      {
        operation: 'dispatch-work',
        target: 'T1',
        outcome: 'succeeded',
      },
    ], publication).passed,
    false,
    'later-workflow mutations are outside publication authority',
  );
  assert.equal(
    grade(authorized, [
      attemptedMutations[0],
      attemptedMutations[0],
      attemptedMutations[2],
    ], publication).passed,
    false,
    'duplicate mutations must not hide a missing ticket creation',
  );
  assert.equal(assessment.publication_authorized, false);
  assert.equal(grade(assessment, []).passed, true);
  assert.equal(grade(assessment, attemptedMutations).passed, false);
});

test('Ticket Scope preserves each declared consumer shape contract', () => {
  const skill = fs.readFileSync(path.join(
    repositoryRoot,
    'skills',
    'ticket-scope',
    'SKILL.md',
  ), 'utf8');
  const role = readEvaluation('ticket-scope', 'role.json');

  assert.match(skill, /Shape: vertical \| prerequisite \| layered/);
  assert.deepEqual(
    role.evals.map(({ id }) => id),
    [
      'reject-convenience-foundation',
      'pr-carver-layered-candidate',
    ],
  );
});

test('semantic planning criteria require evidence-bearing blind judgment', () => {
  for (const [owner, file] of [
    ['ticket-scope', 'role.json'],
    ['slice-plan', 'role.json'],
    ['slice-plan', 'component-ticket-scope.json'],
    ['slice-plan', 'component-take-it-offline.json'],
    ['carve', 'role.json'],
    ['carve', 'component.json'],
    ['carve', 'outcome.json'],
  ]) {
    const definition = readEvaluation(owner, file);
    assert.equal(
      definition.judge.dimensions.every(({ description }) => (
        /(?:quote|cite|reference).*output evidence/i.test(description)
      )),
      true,
      `${owner}/${file}`,
    );
    assert.equal(
      definition.evals.every(({ expectations }) => (
        expectations.some((expectation) => /sampled human review/i.test(expectation))
      )),
      true,
      `${owner}/${file}`,
    );
  }
});

test('trigger definitions separate canonical Carve activation from private routing', () => {
  const carve = readEvaluation('carve', 'trigger.json');
  const slicePlan = readEvaluation('slice-plan', 'trigger.json');
  const ticketScope = readEvaluation('ticket-scope', 'trigger.json');

  assert.deepEqual(
    carve.evals.map(({ id, should_trigger: shouldTrigger }) => [id, shouldTrigger]),
    [
      ['canonical-carve', true],
      ['ambient-planning-request', false],
      ['unsettled-idea', false],
    ],
  );
  assert.equal(carve.evals[0].canonical_invocation, true);
  assert.deepEqual(
    slicePlan.evals.map(({ id, should_trigger: shouldTrigger }) => (
      [id, shouldTrigger]
    )),
    [
      ['declared-consumer-load', true],
      ['private-ambient-false-activation', false],
    ],
  );
  assert.deepEqual(
    ticketScope.evals.map(({ id, should_trigger: shouldTrigger }) => (
      [id, shouldTrigger]
    )),
    [
      ['declared-consumer-load', true],
      ['pr-carver-declared-consumer-load', true],
      ['private-ambient-false-activation', false],
    ],
  );
});
