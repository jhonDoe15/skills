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
const collisionPlanPath = path.join(
  __dirname,
  'fixtures',
  'carve',
  'ready-plan-with-collisions.json',
);
const splitPlanPath = path.join(
  __dirname,
  'fixtures',
  'carve',
  'split-plan.json',
);
const combinePlanPath = path.join(
  __dirname,
  'fixtures',
  'carve',
  'combine-plan.json',
);
const prefactorPlanPath = path.join(
  __dirname,
  'fixtures',
  'carve',
  'prefactor-plan.json',
);
const expandContractPlanPath = path.join(
  __dirname,
  'fixtures',
  'carve',
  'expand-contract-plan.json',
);
const needsDecisionPlanPath = path.join(
  __dirname,
  'fixtures',
  'carve',
  'needs-decision-plan.json',
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

function runValidator(t, plan, { previousPlan = null } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'slice-plan-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const planPath = path.join(directory, 'plan.json');
  fs.writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`);
  const args = [validatorPath, planPath];
  if (previousPlan) {
    const previousPlanPath = path.join(directory, 'previous-plan.json');
    fs.writeFileSync(
      previousPlanPath,
      `${JSON.stringify(previousPlan, null, 2)}\n`,
    );
    args.push(previousPlanPath);
  }
  return spawnSync(process.execPath, args, {
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
  responseText = `Ready plan: ${artifactReference}`,
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
      responses: [{ text: responseText }],
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
  assert.match(result.stdout, /Valid slice-plan\/v2 ready plan/);
});

test('plan schema declares the hardened artifact contract', () => {
  const schema = readJson(path.join(
    repositoryRoot,
    'skills',
    'slice-plan',
    'schemas',
    'plan.schema.json',
  ));

  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.$id, 'https://jhonDoe15.github.io/skills/schemas/slice-plan-v2.json');
  assert.deepEqual(schema.required, [
    'schema',
    'status',
    'migration_strategy',
    'migration',
    'requirements',
    'coverage_ledger',
    'tickets',
    'lineage',
    'decisions',
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

test('regeneration preserves stable identities and explicit split/combine lineage', (t) => {
  const {
    validatePlan,
    validateRegeneration,
  } = require('../skills/slice-plan/scripts/validate-plan');
  const original = readJson(readyPlanPath);
  const unchanged = structuredClone(original);
  const split = readJson(splitPlanPath);
  const combined = readJson(combinePlanPath);

  assert.strictEqual(validateRegeneration(original, unchanged), unchanged);
  assert.strictEqual(validateRegeneration(original, split), split);
  assert.strictEqual(
    validateRegeneration(split, structuredClone(split)).status,
    'ready',
  );
  assert.strictEqual(validateRegeneration(split, combined), combined);
  assert.strictEqual(validatePlan(split), split);
  assert.strictEqual(validatePlan(combined), combined);
  const result = runValidator(t, split, { previousPlan: original });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Validated regeneration lineage/);

  const reused = structuredClone(original);
  reused.tickets[1].outcome = 'Changed work under the old identity.';
  assert.throws(
    () => validateRegeneration(original, reused),
    /reuses identity "T2" for changed work/,
  );

  const missingLineage = structuredClone(split);
  missingLineage.lineage = [];
  assert.throws(
    () => validateRegeneration(original, missingLineage),
    /removed ticket "T2" has no replacement lineage/,
  );

  const reusedPredecessor = structuredClone(split);
  reusedPredecessor.lineage[0].predecessor_ids = ['T1'];
  assert.throws(
    () => validatePlan(reusedPredecessor),
    /lineage predecessor "T1" is still a current ticket/,
  );

  const duplicateCandidate = structuredClone(original);
  const duplicateTicket = structuredClone(duplicateCandidate.tickets[1]);
  duplicateTicket.id = 'T9';
  duplicateCandidate.tickets.push(duplicateTicket);
  duplicateCandidate.coverage_ledger[1].ticket_ids.push('T9');
  assert.throws(
    () => validatePlan(duplicateCandidate),
    /tickets contain duplicate outcome and seam/,
  );

  const cyclicLineage = structuredClone(original);
  cyclicLineage.lineage = [
    {
      kind: 'replace',
      predecessor_ids: ['OLD-1'],
      successor_ids: ['OLD-2'],
    },
    {
      kind: 'replace',
      predecessor_ids: ['OLD-2'],
      successor_ids: ['OLD-1'],
    },
  ];
  assert.throws(
    () => validatePlan(cyclicLineage),
    /replacement lineage must be acyclic/,
  );
});

test('prefactor and expand-contract plans validate concrete migration ordering', () => {
  const {
    validatePlan,
  } = require('../skills/slice-plan/scripts/validate-plan');
  const prefactor = readJson(prefactorPlanPath);
  const expandContract = readJson(expandContractPlanPath);

  assert.strictEqual(validatePlan(prefactor), prefactor);
  assert.strictEqual(validatePlan(expandContract), expandContract);
  assert.equal(prefactor.tickets[0].shape, 'prerequisite');
  assert.equal(prefactor.migration_strategy, 'prefactor');
  assert.equal(expandContract.tickets[0].shape, 'prerequisite');
  assert.equal(expandContract.migration_strategy, 'expand-contract');

  const convenienceFoundation = structuredClone(prefactor);
  convenienceFoundation.tickets[2].blockers = [];
  convenienceFoundation.tickets[2].consumes = [];
  assert.throws(
    () => validatePlan(convenienceFoundation),
    /prefactor ticket "P1" must provide concrete output to multiple consumers/,
  );

  const incompleteContraction = structuredClone(expandContract);
  incompleteContraction.tickets[3].blockers = ['M1'];
  incompleteContraction.tickets[3].consumes.pop();
  assert.throws(
    () => validatePlan(incompleteContraction),
    /contraction ticket "C1" must depend directly on every migration group ticket/,
  );

  const coupledGroup = structuredClone(expandContract);
  coupledGroup.migration.migration_groups[0].independently_mergeable = false;
  assert.throws(
    () => validatePlan(coupledGroup),
    /migration group "api-readers" must be independently mergeable/,
  );

  const missingIntegrationPoint = structuredClone(expandContract);
  missingIntegrationPoint.migration.migration_groups[1].integration_point = null;
  assert.throws(
    () => validatePlan(missingIntegrationPoint),
    /migration group "scheduler-readers" must record its required integration point/,
  );
});

test('needs-decision plans validate unresolved choices and refuse publication', () => {
  const {
    validatePlan,
  } = require('../skills/slice-plan/scripts/validate-plan');
  const definition = readEvaluation('carve', 'outcome.json');
  const caseDefinition = definition.evals.find(
    ({ id }) => id === 'needs-decision-refuses-publication',
  );
  const { gradeCarveResult } = require('../skills/carve/evals/grader');
  const plan = readJson(needsDecisionPlanPath);
  const artifactReference = 'fixture://needs-decision-plan.json';
  const responseText = `Needs decision plan: ${artifactReference}`;
  const result = normalizedPlanningResult({ artifactReference, responseText });
  const grade = (attemptedMutations = []) => gradeCarveResult({
    definition,
    caseDefinition,
    result: normalizedPlanningResult({
      artifactReference,
      attemptedMutations,
      responseText,
    }),
    resolvePlan: (reference) => (
      reference === artifactReference ? plan : null
    ),
  });

  assert.strictEqual(validatePlan(plan), plan);
  assert.equal(caseDefinition.publication_authorized, true);
  assert.equal(caseDefinition.expected_status, 'needs-decision');
  assert.equal(grade().passed, true);
  assert.equal(grade([{
    operation: 'create-ticket',
    target: 'T1',
    outcome: 'succeeded',
  }]).passed, false);

  const malformed = structuredClone(plan);
  malformed.decisions = [];
  assert.throws(
    () => validatePlan(malformed),
    /needs-decision plan must state at least one unresolved choice/,
  );
  const noUnresolvedCoverage = structuredClone(plan);
  noUnresolvedCoverage.coverage_ledger[0].disposition = 'excluded';
  assert.throws(
    () => validatePlan(noUnresolvedCoverage),
    /needs-decision plan must leave at least one requirement unresolved/,
  );
  assert.equal(result.observations.attemptedMutations.length, 0);
});

test('graph validation rejects every structural defect before publication', () => {
  const {
    validatePlan,
  } = require('../skills/slice-plan/scripts/validate-plan');

  const missingTarget = readJson(readyPlanPath);
  missingTarget.tickets[1].blockers = ['MISSING'];
  missingTarget.tickets[1].consumes[0].ticket_id = 'MISSING';
  assert.throws(
    () => validatePlan(missingTarget),
    /names unknown ticket "MISSING"/,
  );

  const convenienceFoundation = readJson(readyPlanPath);
  convenienceFoundation.tickets[1].blockers = [];
  convenienceFoundation.tickets[1].consumes = [];
  convenienceFoundation.initial_frontier = ['T1', 'T2'];
  assert.throws(
    () => validatePlan(convenienceFoundation),
    /prerequisite ticket "T1" must provide concrete output to a consumer/,
  );

  const skeletalTicket = readJson(readyPlanPath);
  skeletalTicket.tickets[1].acceptance = [];
  assert.throws(
    () => validatePlan(skeletalTicket),
    /tickets\[1\]\.acceptance must be a non-empty array/,
  );
});

test('overlapping collisions remain metadata and preserve equivalent frontiers', () => {
  const {
    validatePlan,
    validateRegeneration,
  } = require('../skills/slice-plan/scripts/validate-plan');
  const plan = readJson(collisionPlanPath);
  plan.tickets.push({
    id: 'T3',
    title: 'Document the preference contract',
    outcome: 'Clients can discover the account time-zone preference contract.',
    seam: 'account API documentation',
    shape: 'vertical',
    in_scope: ['Document the account time-zone request and response fields.'],
    out_of_scope: ['Change account API runtime behavior.'],
    acceptance: ['Published API documentation includes the preference fields.'],
    validation: ['Run the API documentation contract test.'],
    blockers: [],
    consumes: [],
    collisions: ['account persistence model'],
  });
  plan.coverage_ledger[1].ticket_ids.push('T3');
  plan.initial_frontier.push('T3');

  assert.strictEqual(validatePlan(plan), plan);
  assert.deepEqual(plan.initial_frontier, ['T1', 'T3']);
  assert.deepEqual(plan.tickets[2].blockers, []);

  const regenerated = structuredClone(plan);
  regenerated.tickets.reverse();
  regenerated.initial_frontier.reverse();
  assert.strictEqual(validateRegeneration(plan, regenerated), regenerated);
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
    seam: 'account audit stream',
    shape: 'vertical',
    in_scope: ['Record API updates in the audit stream.'],
    out_of_scope: ['Add new audit storage.'],
    acceptance: ['Updating a preference emits an audit record.'],
    validation: ['Run the audit integration test.'],
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
    collisions: [],
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

test('publication grading requires exact collision records', () => {
  const definition = readEvaluation('carve', 'outcome.json');
  const [authorized] = definition.evals;
  const { gradeCarveResult } = require('../skills/carve/evals/grader');
  const plan = readJson(collisionPlanPath);
  const artifactReference = 'fixture://ready-plan-with-collisions.json';
  const collisionMutations = [
    { operation: 'create-ticket', target: 'T1', outcome: 'succeeded' },
    { operation: 'create-ticket', target: 'T2', outcome: 'succeeded' },
    { operation: 'create-blocker', target: 'T2<-T1', outcome: 'succeeded' },
    {
      operation: 'record-collision',
      target: '["T1","account persistence model"]',
      outcome: 'succeeded',
    },
    {
      operation: 'record-collision',
      target: '["T2","account persistence model"]',
      outcome: 'succeeded',
    },
  ];
  const publication = {
    ticket_ids: ['T1', 'T2'],
    blockers: [{ ticket_id: 'T2', blocked_by: 'T1' }],
    collisions: [
      { ticket_id: 'T1', collision: 'account persistence model' },
      { ticket_id: 'T2', collision: 'account persistence model' },
    ],
    initial_frontier: ['T1'],
    later_workflow_started: false,
  };
  function grade(mutations, observedPublication = publication) {
    return gradeCarveResult({
      definition,
      caseDefinition: authorized,
      result: normalizedPlanningResult({
        artifactReference,
        attemptedMutations: mutations,
      }),
      resolvePlan: (reference) => (
        reference === artifactReference ? plan : null
      ),
      observedPublication,
    });
  }

  assert.equal(grade(collisionMutations).passed, true);
  assert.equal(
    grade(collisionMutations, {
      ...publication,
      collisions: publication.collisions.slice(0, 1),
    }).passed,
    false,
    'missing collision read-back must fail',
  );
  assert.equal(
    grade(collisionMutations.slice(0, -1)).passed,
    false,
    'missing collision mutation must fail',
  );
  assert.equal(
    grade([
      ...collisionMutations,
      collisionMutations[3],
    ]).passed,
    false,
    'duplicate collision mutation must fail',
  );
  assert.equal(
    grade([
      ...collisionMutations,
      {
        operation: 'record-collision',
        target: '["T3","account persistence model"]',
        outcome: 'succeeded',
      },
    ]).passed,
    false,
    'extra collision mutation must fail',
  );
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
