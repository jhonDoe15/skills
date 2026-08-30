'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
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
  gradeTakeItOfflineResult,
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
const COMPLETED_DISPATCH_ARTIFACTS = {
  'fixture://dispatch/completed': 'completed-dispatch.json',
  'fixture://reviewed-ticket/A': 'reviewed-ticket-A.json',
  'fixture://reviewed-ticket/B': 'reviewed-ticket-B.json',
  'fixture://reviewed-ticket/C': 'reviewed-ticket-C.json',
  'fixture://reviewed-ticket/D': 'reviewed-ticket-D.json',
  'fixture://retained-reviewed-ticket/A': 'retained-reviewed-ticket-A.json',
  'fixture://canonical-reviewed-ticket/A': 'canonical-reviewed-ticket.json',
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readDispatchFixture(fileName) {
  return readJson(path.join(DISPATCH_FIXTURE_ROOT, fileName));
}

function resolveCompletedDispatchArtifact(reference) {
  return readJson(path.join(
    DISPATCH_FIXTURE_ROOT,
    COMPLETED_DISPATCH_ARTIFACTS[reference],
  ));
}

function validateResumedArtifact(
  artifact,
  resolveArtifact = resolveCompletedDispatchArtifact,
) {
  return validateDispatchArtifact(artifact, { resolveArtifact });
}

function refreshExecutionFingerprint(artifact) {
  function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
    );
  }
  const inputs = {
    execution_context: artifact.execution_context,
    executor: artifact.executor,
  };
  const digest = crypto.createHash('sha256')
    .update(JSON.stringify(canonicalize(inputs)))
    .digest('hex');
  artifact.resume.execution_fingerprint.current = `sha256:${digest}`;
  if (artifact.resume.requested) {
    artifact.resume.execution_fingerprint.retained = `sha256:${digest}`;
    artifact.resume.execution_fingerprint.retained_inputs =
      structuredClone(inputs);
  }
}

function minimalArtifact() {
  return readDispatchFixture('completed-dispatch.json');
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

test('dispatch requires the complete hardening evidence envelope', () => {
  const requiredFields = [
    'resume',
    'execution_context',
    'executor',
    'collision_constraints',
    'worktrees',
    'pr_maintenance',
    'unresolved_systematic_concerns',
  ];
  for (const field of requiredFields) {
    const artifact = readDispatchFixture('completed-dispatch.json');
    delete artifact[field];
    assert.throws(
      () => validateDispatchArtifact(artifact),
      /retained dispatch evidence/,
      field,
    );
  }

  const incompleteExecutionContext =
    readDispatchFixture('completed-dispatch.json');
  incompleteExecutionContext.execution_context.canonical_dependencies.pop();
  refreshExecutionFingerprint(incompleteExecutionContext);
  assert.throws(
    () => validateDispatchArtifact(incompleteExecutionContext),
    /execution context/,
  );
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
  const artifactChecks = readJson(
    path.join(EVALUATION_ROOT, 'outcome.json'),
  ).evals[0].artifact_checks;
  const graded = gradeDispatchResult(takeTicketResult, {
    resolveArtifact: resolveCompletedDispatchArtifact,
    artifactChecks,
  });

  assert.deepEqual(
    publishedDagResult.observations.toolUses,
    [{ name: 'published-dag.read', outcome: 'succeeded' }],
  );
  assert.strictEqual(graded.artifact.schema, 'dispatch-work-artifact/v1');
  assert.ok(takeTicketResult.observations.skillEvents.every((event) => (
    event.operation === 'load'
    && event.status === 'succeeded'
    && event.provenance.statusSource === 'observed'
  )));
  assert.deepEqual(
    graded.reviewedTickets.map(({ ticket }) => ticket),
    ['A', 'C', 'B', 'D'],
  );
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

  const contradictoryExtras = [
    { name: 'take-ticket.invoke:A', outcome: 'failed' },
    { name: 'take-ticket.complete:A', outcome: 'incomplete' },
    { name: 'take-ticket.invoke:Z', outcome: 'succeeded' },
    { name: 'take-ticket.complete:', outcome: 'succeeded' },
    { name: 'take-ticket.retry:A', outcome: 'succeeded' },
    { name: 'take-ticket:A', outcome: 'succeeded' },
  ];
  for (const extra of contradictoryExtras) {
    const contradictory = structuredClone(takeTicketResult);
    contradictory.observations.toolUses.push(extra);
    assert.throws(
      () => gradeDispatchResult(contradictory, {
        resolveArtifact: resolveCompletedDispatchArtifact,
        artifactChecks,
      }),
      /exact Take Ticket tool event set/,
      extra.name,
    );
  }
  const duplicateWithMissingPair = structuredClone(takeTicketResult);
  const lastToolIndex = duplicateWithMissingPair.observations.toolUses
    .findIndex(({ name }) => name === 'take-ticket.complete:D');
  duplicateWithMissingPair.observations.toolUses[lastToolIndex] = {
    name: 'take-ticket.invoke:A',
    outcome: 'succeeded',
  };
  assert.throws(
    () => gradeDispatchResult(duplicateWithMissingPair, {
      resolveArtifact: resolveCompletedDispatchArtifact,
      artifactChecks,
    }),
    /exact Take Ticket tool event set/,
  );

  const unrelatedEvidence = structuredClone(takeTicketResult);
  unrelatedEvidence.observations.toolUses.push({
    name: 'unrelated.observe',
    outcome: 'succeeded',
  });
  gradeDispatchResult(unrelatedEvidence, {
    resolveArtifact: resolveCompletedDispatchArtifact,
    artifactChecks,
  });

  const duplicateReview = structuredClone(takeTicketResult);
  duplicateReview.observations.toolUses.push({
    name: 'code-review.invoke:A',
    outcome: 'succeeded',
  });
  assert.throws(
    () => gradeDispatchResult(duplicateReview, {
      resolveArtifact: resolveCompletedDispatchArtifact,
      artifactChecks,
    }),
    /duplicate per-ticket Code Review/,
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
    assert.deepEqual(definition.signals, {});
    assert.deepEqual(definition.global_required_signals, []);
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

test('owner artifact checks reject matching prose with invalid evidence', async (t) => {
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-evidence-'));
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
  const {
    createTakeTicketAdapter,
  } = require('./fixtures/dispatch-work/take-ticket-adapter');
  const result = await executeTest({
    repositoryRoot: packageRoot,
    adapter: createTakeTicketAdapter({ repository }),
    invocation: {
      requestId: 'dispatch-adversarial-evidence',
      skill: 'dispatch-work',
      prompt: 'Dispatch the authorized published ready fixture DAG.',
      model: 'fixture-model',
    },
  });
  const artifactChecks = [
    ...new Set([
      'role.json',
      'component-take-ticket.json',
      'outcome.json',
    ].flatMap((fileName) => (
      readJson(path.join(EVALUATION_ROOT, fileName))
        .evals[0].artifact_checks
    ))),
  ];
  const graded = gradeDispatchResult(result, {
    resolveArtifact: resolveCompletedDispatchArtifact,
    artifactChecks,
  });

  assert.deepEqual(
    graded.checks.map(({ id, passed }) => ({ id, passed })),
    artifactChecks.map((id) => ({ id, passed: true })),
  );

  const invalidEvents = structuredClone(result);
  invalidEvents.observations.skillEvents[0].operation = 'select';
  assert.throws(
    () => gradeDispatchResult(invalidEvents, {
      resolveArtifact: resolveCompletedDispatchArtifact,
      artifactChecks,
    }),
    /observed successful load operations/,
  );

  const invalidArtifact = readJson(
    path.join(DISPATCH_FIXTURE_ROOT, 'completed-dispatch.json'),
  );
  invalidArtifact.authorization.granted = false;
  assert.throws(
    () => gradeDispatchResult(result, {
      artifactChecks,
      resolveArtifact(reference) {
        return reference === 'fixture://dispatch/completed'
          ? invalidArtifact
          : resolveCompletedDispatchArtifact(reference);
      },
    }),
    /explicit dispatch authorization is required/,
  );
});

test('Take It Offline component grades its own continuation evidence', async (t) => {
  const packageRoot = createPackageFixture(t, COMPLETE_DISPATCH_CLOSURE);
  const {
    createTakeItOfflineAdapter,
  } = require('./fixtures/dispatch-work/take-it-offline-adapter');
  const result = await executeTest({
    repositoryRoot: packageRoot,
    adapter: createTakeItOfflineAdapter(),
    invocation: {
      requestId: 'dispatch-continuation-evidence',
      skill: 'dispatch-work',
      prompt: 'Continue the retained dispatch in a fresh context.',
      model: 'fixture-model',
    },
  });
  const definition = readJson(
    path.join(EVALUATION_ROOT, 'component-take-it-offline.json'),
  );
  const artifactChecks = definition.evals[0].artifact_checks;
  const artifactFiles = {
    'fixture://dispatch/completed': 'completed-dispatch.json',
    'fixture://continuation/completed': 'continuation.json',
  };
  const resolveArtifact = (reference) => readJson(
    path.join(DISPATCH_FIXTURE_ROOT, artifactFiles[reference]),
  );
  function grade(candidate, resolver = resolveArtifact) {
    return gradeTakeItOfflineResult(candidate, {
      resolveArtifact: resolver,
      artifactChecks,
    });
  }
  const graded = grade(result);

  assert.equal(graded.continuation.owner, 'take-it-offline');
  assert.deepEqual(
    graded.checks.map(({ id, passed }) => ({ id, passed })),
    artifactChecks.map((id) => ({ id, passed: true })),
  );

  const missingLoad = structuredClone(result);
  missingLoad.observations.skillEvents = missingLoad.observations.skillEvents
    .filter(({ name }) => name !== 'take-it-offline');
  assert.throws(
    () => grade(missingLoad),
    /observed successful take-it-offline load/,
  );

  const missingTool = structuredClone(result);
  missingTool.observations.toolUses = [];
  assert.throws(
    () => grade(missingTool),
    /take-it-offline tool evidence/,
  );

  const wrongContinuation = readJson(
    path.join(DISPATCH_FIXTURE_ROOT, 'continuation.json'),
  );
  wrongContinuation.owner = 'take-ticket';
  assert.throws(
    () => grade(
      result,
      function resolveWrongContinuation(reference) {
        return reference === 'fixture://continuation/completed'
          ? wrongContinuation
          : resolveArtifact(reference);
      },
    ),
    /owned by Take It Offline/,
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

test('resume verifies fingerprints and skips only completed lifecycle work', () => {
  const artifact = readDispatchFixture('resumed-dispatch.json');

  assert.strictEqual(validateResumedArtifact(artifact), artifact);
  assert.deepEqual(
    artifact.resume.ticket_decisions,
    [
      {
        ticket: 'A',
        decision: 'skip-completed',
        retained_result: 'fixture://retained-reviewed-ticket/A',
      },
      {
        ticket: 'B',
        decision: 'restart-incomplete',
      },
      {
        ticket: 'C',
        decision: 'preserve-terminal',
      },
      {
        ticket: 'D',
        decision: 'preserve-terminal',
      },
      {
        ticket: 'E',
        decision: 'preserve-terminal',
      },
    ],
  );
  assert.deepEqual(artifact.final_state.failed_tickets, ['C']);
  assert.deepEqual(artifact.final_state.retryable_tickets, ['D']);
  assert.deepEqual(artifact.final_state.human_decision_tickets, ['E']);

  const changedDag = structuredClone(artifact);
  changedDag.source_dag.identity = 'fixture://published-dag/resume-v2';
  assert.throws(
    () => validateResumedArtifact(changedDag),
    /source DAG fingerprint/,
  );

  const changedFingerprintInputs = structuredClone(artifact);
  changedFingerprintInputs.execution_context.repositories =
    ['fixture://repository/other'];
  assert.throws(
    () => validateResumedArtifact(changedFingerprintInputs),
    /execution fingerprint/,
  );

  const freshArtifact = readDispatchFixture('completed-dispatch.json');
  freshArtifact.source_dag.identity =
    'fixture://published-dag/ordinary-frontier-v2';
  assert.throws(
    () => validateDispatchArtifact(freshArtifact),
    /source DAG fingerprint/,
  );

  assert.throws(
    () => validateResumedArtifact(artifact, (reference) => {
      const retained = resolveCompletedDispatchArtifact(reference);
      retained.status = 'incomplete';
      return retained;
    }),
    /complete authoritative reviewed-ticket/,
  );

  const unboundCanonical = structuredClone(artifact);
  unboundCanonical.resume.ticket_decisions[0].retained_result =
    'fixture://canonical-reviewed-ticket/A';
  assert.throws(
    () => validateResumedArtifact(unboundCanonical),
    /exact skipped ticket/,
  );

  assert.throws(
    () => validateResumedArtifact(artifact, (reference) => {
      if (reference !== 'fixture://retained-reviewed-ticket/A') {
        return resolveCompletedDispatchArtifact(reference);
      }
      const binding = readDispatchFixture('retained-reviewed-ticket-A.json');
      binding.ticket = 'B';
      binding.invocation.ticket = 'B';
      binding.completion.ticket = 'B';
      return binding;
    }),
    /exact skipped ticket/,
  );

  for (const { name, mutate } of [
    {
      name: 'stale source DAG',
      mutate(candidate) {
        candidate.resume.source_dag_fingerprint.current = 'sha256:changed-source';
      },
    },
    {
      name: 'mismatched execution inputs',
      mutate(candidate) {
        candidate.resume.execution_fingerprint.current =
          'sha256:changed-execution';
      },
    },
    {
      name: 'partial retained evidence',
      mutate(candidate) {
        candidate.resume.evidence_status = 'partial';
      },
    },
    {
      name: 'malformed fingerprint',
      mutate(candidate) {
        candidate.resume.source_dag_fingerprint.retained = 'sha256:short';
        candidate.resume.source_dag_fingerprint.current = 'sha256:short';
      },
    },
    {
      name: 'arbitrary matching digests',
      mutate(candidate) {
        const arbitrary = `sha256:${'c'.repeat(64)}`;
        candidate.resume.source_dag_fingerprint.retained = arbitrary;
        candidate.resume.source_dag_fingerprint.current = arbitrary;
      },
    },
    {
      name: 'incomplete ticket skipped',
      mutate(candidate) {
        candidate.resume.ticket_decisions[1].decision = 'skip-completed';
        candidate.resume.ticket_decisions[1].retained_result =
          'fixture://reviewed-ticket/B';
      },
    },
  ]) {
    const candidate = structuredClone(artifact);
    mutate(candidate);
    assert.throws(
      () => validateResumedArtifact(candidate),
      /(?:resume evidence|fingerprint)/,
      name,
    );
  }
});

test('PR maintenance requires authorization at a bounded test seam', async (t) => {
  const artifact = readDispatchFixture('resumed-dispatch.json');
  assert.strictEqual(validateResumedArtifact(artifact), artifact);

  const unauthorizedMutation = structuredClone(artifact);
  unauthorizedMutation.pr_maintenance[0].attempted_mutations.push({
    id: 'unauthorized-A-1',
    action: 'refresh-pr',
  });
  assert.throws(
    () => validateResumedArtifact(unauthorizedMutation),
    /PR maintenance authorization/,
  );
  const ambiguousAuthorization = structuredClone(artifact);
  delete ambiguousAuthorization.pr_maintenance[0].authorization.granted;
  assert.throws(
    () => validateResumedArtifact(ambiguousAuthorization),
    /PR maintenance authorization/,
  );

  const outOfScopeMutation = structuredClone(artifact);
  outOfScopeMutation.pr_maintenance[1].attempted_mutations[0].target =
    'fixture://pr/99';
  assert.throws(
    () => validateResumedArtifact(outOfScopeMutation),
    /PR maintenance authorization tuple/,
  );

  const unprovenCompletion = structuredClone(artifact);
  unprovenCompletion.pr_maintenance[1].completed_mutations[0].outcome =
    'failed';
  assert.throws(
    () => validateResumedArtifact(unprovenCompletion),
    /completed PR mutation evidence/,
  );

  const crossPairedAuthorization = structuredClone(artifact);
  const crossPairedMaintenance = crossPairedAuthorization.pr_maintenance[1];
  crossPairedMaintenance.authorization.scope.tuples.push({
    repository: 'fixture://repository/other',
    action: 'close-pr',
    target: 'fixture://pr/99',
  });
  crossPairedAuthorization.execution_context.repositories.push(
    'fixture://repository/other',
  );
  for (const mutation of [
    crossPairedMaintenance.attempted_mutations[0],
    crossPairedMaintenance.completed_mutations[0],
  ]) {
    mutation.repository = 'fixture://repository/other';
  }
  refreshExecutionFingerprint(crossPairedAuthorization);
  assert.throws(
    () => validateResumedArtifact(crossPairedAuthorization),
    /exact PR maintenance authorization tuple/,
  );

  const {
    createPrMaintenanceAdapter,
  } = require('./fixtures/dispatch-work/pr-maintenance-adapter');
  const packageRoot = createPackageFixture(t, COMPLETE_DISPATCH_CLOSURE);
  const invocation = {
    requestId: 'pr-maintenance-authorization',
    skill: 'dispatch-work',
    prompt: 'Observe bounded PR maintenance authorization behavior.',
    model: 'fixture-model',
  };
  const denied = await executeTest({
    repositoryRoot: packageRoot,
    adapter: createPrMaintenanceAdapter({ authorizationGranted: false }),
    invocation,
  });
  const authorized = await executeTest({
    repositoryRoot: packageRoot,
    adapter: createPrMaintenanceAdapter({ authorizationGranted: true }),
    invocation,
  });

  assert.deepEqual(denied.observations.attemptedMutations, []);
  assert.match(denied.observations.responses[0].text, /authorization required/);
  assert.deepEqual(authorized.observations.attemptedMutations, [{
    operation: 'refresh-pr',
    target: 'fixture://pr/42',
    outcome: 'succeeded-in-sandbox',
  }]);
});

test('collision scheduling preserves unrelated concurrency within executor capacity', () => {
  const artifact = readDispatchFixture('collision-dispatch.json');

  assert.strictEqual(validateDispatchArtifact(artifact), artifact);
  assert.deepEqual(
    artifact.frontier_calculations.map(({ eligible, selected }) => ({
      eligible,
      selected,
    })),
    [
      { eligible: ['A', 'B', 'C'], selected: ['A', 'C'] },
      { eligible: ['B'], selected: [] },
      { eligible: ['B'], selected: ['B'] },
      { eligible: [], selected: [] },
    ],
  );
  assert.deepEqual(artifact.source_dag.dependencies, []);
  assert.equal(artifact.executor.selected.scope, 'repository');
  assert.equal(artifact.executor.selected.value, 2);

  const collidingSelection = structuredClone(artifact);
  collidingSelection.frontier_calculations[0].selected = ['A', 'B'];
  collidingSelection.frontier_calculations[0].deferred = [{
    ticket: 'C',
    reason: 'capacity',
    conflicts_with: [],
  }];
  assert.throws(
    () => validateDispatchArtifact(collidingSelection),
    /collision scheduling/,
  );

  const wrongPrecedence = structuredClone(artifact);
  wrongPrecedence.executor.selected = {
    scope: 'project',
    value: 4,
    source: 'fixture://config/project',
  };
  refreshExecutionFingerprint(wrongPrecedence);
  assert.throws(
    () => validateDispatchArtifact(wrongPrecedence),
    /executor selection/,
  );

  const userConfigured = structuredClone(artifact);
  userConfigured.executor.candidates.repository.value = null;
  userConfigured.executor.candidates.project.value = null;
  userConfigured.executor.selected = {
    scope: 'user',
    value: 8,
    source: 'fixture://config/user',
  };
  refreshExecutionFingerprint(userConfigured);
  assert.strictEqual(validateDispatchArtifact(userConfigured), userConfigured);
});

test('isolated worktrees preserve partial failure and systematic concerns', () => {
  const artifact = readDispatchFixture('hardened-partial-dispatch.json');

  assert.strictEqual(validateDispatchArtifact(artifact), artifact);
  assert.deepEqual(artifact.final_state.completed_tickets, ['A', 'B', 'C']);
  assert.deepEqual(artifact.final_state.retryable_tickets, ['F']);
  assert.deepEqual(artifact.final_state.failed_tickets, ['D']);
  assert.deepEqual(artifact.final_state.human_decision_tickets, ['E']);
  assert.deepEqual(artifact.final_state.blocked_tickets, ['G']);
  assert.deepEqual(
    artifact.unresolved_systematic_concerns,
    ['systematic-worktree-cleanup'],
  );
  assert.equal(artifact.worktrees[5].lifecycle_state, 'creation-failed');
  assert.deepEqual(
    artifact.worktrees[5].cleanup.diagnostic_artifacts,
    ['artifact://diagnostics/worktree-F.json'],
  );
  assert.equal(
    artifact.ticket_lifecycles.some(({ ticket }) => ticket === 'F'),
    false,
  );
  for (const lifecycle of artifact.ticket_lifecycles) {
    const worktree = artifact.worktrees.find(
      ({ ticket }) => ticket === lifecycle.ticket,
    );
    assert.ok(worktree.created_sequence < lifecycle.started_sequence);
    assert.equal(worktree.isolation_check.status, 'passed');
  }

  const sharedWorktree = structuredClone(artifact);
  sharedWorktree.worktrees[1].path = sharedWorktree.worktrees[0].path;
  assert.throws(
    () => validateDispatchArtifact(sharedWorktree),
    /worktree ownership/,
  );

  const missingBase = structuredClone(artifact);
  delete missingBase.worktrees[0].base;
  assert.throws(
    () => validateDispatchArtifact(missingBase),
    /worktree ownership.*base/,
  );

  const lateWorktree = structuredClone(artifact);
  lateWorktree.worktrees[0].created_sequence =
    lateWorktree.ticket_lifecycles[0].started_sequence;
  assert.throws(
    () => validateDispatchArtifact(lateWorktree),
    /before its ticket lifecycle starts/,
  );

  const failedIsolation = structuredClone(artifact);
  failedIsolation.worktrees[0].isolation_check.status = 'failed';
  assert.throws(
    () => validateDispatchArtifact(failedIsolation),
    /worktree isolation/,
  );

  const discardedFailure = structuredClone(artifact);
  discardedFailure.worktrees[3].lifecycle_state = 'removed';
  discardedFailure.worktrees[3].cleanup = {
    decision: 'remove-after-failure',
    diagnostic_artifacts: [],
  };
  assert.throws(
    () => validateDispatchArtifact(discardedFailure),
    /failure diagnostics/,
  );

  const lostConcern = structuredClone(artifact);
  lostConcern.unresolved_systematic_concerns = [];
  assert.throws(
    () => validateDispatchArtifact(lostConcern),
    /systematic concern/,
  );

  const evidenceFreeConcern = structuredClone(artifact);
  evidenceFreeConcern.synthesis[1].concerns[0].evidence.review_briefs = [];
  assert.throws(
    () => validateDispatchArtifact(evidenceFreeConcern),
    /systematic concern.*evidence/,
  );

  const legacyStringConcern = structuredClone(artifact);
  legacyStringConcern.synthesis[1].concerns[0] = 'unstructured concern';
  assert.throws(
    () => validateDispatchArtifact(legacyStringConcern),
    /systematic concern disposition/,
  );

  const oneTicketConcern = structuredClone(artifact);
  oneTicketConcern.synthesis[1].concerns[0].evidence = {
    implementation_handoffs: ['artifact://implement/A.json'],
    review_briefs: ['artifact://review/A.json'],
  };
  assert.throws(
    () => validateDispatchArtifact(oneTicketConcern),
    /at least two distinct ticket identities/,
  );

  const aliasedFutureTicketEvidence = structuredClone(artifact);
  const ticketB = aliasedFutureTicketEvidence.ticket_lifecycles.find(
    ({ ticket }) => ticket === 'B',
  );
  ticketB.result.implementation_handoff = 'artifact://implement/A.json';
  aliasedFutureTicketEvidence.synthesis[1].inputs.implementation_handoffs =
    ['artifact://implement/A.json'];
  aliasedFutureTicketEvidence.synthesis[1].concerns = [];
  aliasedFutureTicketEvidence.synthesis[1].recommendations = ['accept B'];
  aliasedFutureTicketEvidence.unresolved_systematic_concerns = [];
  aliasedFutureTicketEvidence.synthesis[0].concerns = [{
    id: 'aliased-future-ticket',
    scope: 'cross-ticket',
    status: 'resolved',
    disposition: 'accept',
    evidence: {
      implementation_handoffs: ['artifact://implement/A.json'],
      review_briefs: ['artifact://review/A.json'],
    },
  }];
  assert.throws(
    () => validateDispatchArtifact(aliasedFutureTicketEvidence),
    /duplicate synthesis evidence ownership/,
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
    'Repair the retained failure for ticket D, then resume dispatch.',
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

test('final replay status, recovery, and edge transitions are derived exactly', () => {
  const wrongStatus = readJson(
    path.join(DISPATCH_FIXTURE_ROOT, 'held-dispatch.json'),
  );
  wrongStatus.final_state.status = 'blocked';
  assert.throws(
    () => validateDispatchArtifact(wrongStatus),
    /final dispatch status/,
  );

  const wrongRecovery = readJson(
    path.join(DISPATCH_FIXTURE_ROOT, 'held-dispatch.json'),
  );
  wrongRecovery.final_state.first_recovery_action = 'Retry something later.';
  assert.throws(
    () => validateDispatchArtifact(wrongRecovery),
    /earliest retained recovery action/,
  );

  const missingPreSatisfiedState = readJson(
    path.join(DISPATCH_FIXTURE_ROOT, 'held-dispatch.json'),
  );
  missingPreSatisfiedState.source_dag.dependencies[0].initial_state = 'open';
  assert.throws(
    () => validateDispatchArtifact(missingPreSatisfiedState),
    /pre-satisfied edge state/,
  );

  const missingTransition = readJson(
    path.join(DISPATCH_FIXTURE_ROOT, 'completed-dispatch.json'),
  );
  missingTransition.dependency_transitions.pop();
  assert.throws(
    () => validateDispatchArtifact(missingTransition),
    /dependency transition identities/,
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

test('mixed terminal frontier synthesizes its completed subset and still advances', () => {
  const artifact = readJson(
    path.join(DISPATCH_FIXTURE_ROOT, 'mixed-frontier-dispatch.json'),
  );

  assert.strictEqual(validateDispatchArtifact(artifact), artifact);
  assert.deepEqual(artifact.synthesis[0].tickets, ['A']);
  assert.deepEqual(artifact.frontier_calculations[1].active, ['B']);
  assert.deepEqual(artifact.frontier_calculations[1].selected, ['C']);
  assert.deepEqual(artifact.final_state.completed_tickets, ['A', 'C']);
  assert.deepEqual(artifact.final_state.held_tickets, ['B']);
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
