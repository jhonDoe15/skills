'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const {
  defineProductionAdapter,
  discoverCanonicalPackage,
  executeProduction,
} = require('../suite');
const { executeTest } = require('../suite/testing');
const {
  createEngineeringGuidanceAdapter,
} = require('./fixtures/implement/engineering-guidance-adapter');

const repositoryRoot = path.resolve(__dirname, '..');
const skillRoot = path.join(repositoryRoot, 'skills', 'implement');
const fixtureRoot = path.join(__dirname, 'fixtures', 'implement');
const artifactAllowlist = new Map();
const concernIds = [
  'intent-and-scope',
  'responsibilities-and-seams',
  'dependencies-and-contracts',
  'state-and-invariants',
  'failure-and-boundaries',
  'simplicity-and-reuse',
  'compatibility-and-change',
  'maintainer-legibility',
  'evidence-and-validation',
];

function assertFile(filePath) {
  assert.equal(
    fs.existsSync(filePath),
    true,
    `required issue #41 artifact is missing: ${path.relative(repositoryRoot, filePath)}`,
  );
}

function writeSkill(root, name, source) {
  const destination = path.join(root, 'skills', name, 'SKILL.md');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function createPackageRoot(t, { includeGuidance = false } = {}) {
  assertFile(path.join(skillRoot, 'SKILL.md'));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'implement-package-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'suite'), { recursive: true });
  fs.copyFileSync(
    path.join(repositoryRoot, 'suite', 'canonical-suite.json'),
    path.join(root, 'suite', 'canonical-suite.json'),
  );
  writeSkill(root, 'implement', path.join(skillRoot, 'SKILL.md'));
  if (includeGuidance) {
    writeSkill(
      root,
      'engineering-guidance',
      path.join(fixtureRoot, 'engineering-guidance.skill.md'),
    );
  }
  return root;
}

function invocation() {
  return {
    requestId: 'implement-issue-41',
    skill: 'implement',
    prompt: 'Implement one settled, bounded patch and return its handoff.',
    model: 'test-model',
  };
}

function successfulHandoff() {
  return {
    schema: 'implement-handoff/v2',
    status: 'completed',
    requirements: {
      references: ['issue://41'],
      summary: 'Implement one settled and bounded patch.',
    },
    implementation_range: {
      base: 'a'.repeat(40),
      head: 'b'.repeat(40),
    },
    guidance_coverage: {
      dependency: 'engineering-guidance',
      authorities: [{
        source: 'AGENTS.md',
        references: ['Agent skills'],
      }],
      concerns: concernIds.map((id) => ({
        id,
        disposition: 'applicable-now',
        sources: ['AGENTS.md#agent-skills'],
        notes: `Fixture disposition for ${id}.`,
      })),
      unresolved_gaps: [],
    },
    lifecycle: [
      {
        sequence: 1,
        kind: 'guidance',
        status: 'completed',
        reference: 'engineering-guidance',
      },
      {
        sequence: 2,
        kind: 'test',
        status: 'red',
        reference: 'bounded-rule',
      },
      {
        sequence: 3,
        kind: 'mutation',
        status: 'succeeded',
        reference: 'write:src/bounded-change.js',
      },
      {
        sequence: 4,
        kind: 'test',
        status: 'green',
        reference: 'bounded-rule',
      },
      {
        sequence: 5,
        kind: 'validation',
        status: 'completed',
        reference: 'node --test',
      },
      {
        sequence: 6,
        kind: 'range',
        status: 'pinned',
        reference: 'b'.repeat(40),
      },
    ],
    changed_behavior: ['The bounded fixture behavior is implemented.'],
    changed_files: ['src/bounded-change.js', 'test/bounded-change.test.js'],
    tests: [
      {
        behavior: 'bounded-rule',
        phase: 'red',
        command: 'node --test test/bounded-change.test.js',
        outcome: 'failed-as-expected',
        evidence: 'The missing validation rule caused the expected assertion failure.',
      },
      {
        behavior: 'bounded-rule',
        phase: 'green',
        command: 'node --test test/bounded-change.test.js',
        outcome: 'passed',
        evidence: '1 test passed.',
      },
    ],
    validation: [{
      command: 'node --test',
      outcome: 'passed',
      evidence: 'All tests passed.',
    }],
    unresolved_risks: [],
    correction: {
      state: 'ready',
      next_action: 'Use this immutable range for independent review.',
    },
    failure: null,
  };
}

function failedHandoff(kind) {
  const guidanceFailure = kind === 'guidance';
  return {
    schema: 'implement-handoff/v2',
    status: 'failed',
    requirements: {
      references: ['issue://41'],
      summary: 'Implement one settled and bounded patch.',
    },
    implementation_range: {
      base: 'a'.repeat(40),
      head: null,
    },
    guidance_coverage: {
      dependency: 'engineering-guidance',
      authorities: [],
      concerns: [],
      unresolved_gaps: ['The required phase did not complete.'],
    },
    lifecycle: [{
      sequence: 1,
      kind,
      status: 'failed',
      reference: `${kind}-failure`,
    }],
    changed_behavior: [],
    changed_files: [],
    tests: [],
    validation: [],
    unresolved_risks: ['No complete patch is available.'],
    correction: {
      state: 'blocked',
      next_action: 'Correct the failed phase before review.',
    },
    failure: {
      kind,
      stage: guidanceFailure ? 'before-mutation' : kind,
      message: guidanceFailure
        ? 'Missing internal dependency "engineering-guidance"'
        : `${kind} phase failed.`,
    },
  };
}

function createArtifact(t, value) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'implement-artifact-'));
  const filePath = path.join(root, 'handoff.json');
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
  const reference = pathToFileURL(filePath).href;
  artifactAllowlist.set(reference, filePath);
  t.after(() => {
    artifactAllowlist.delete(reference);
    fs.rmSync(root, { recursive: true, force: true });
  });
  return {
    descriptor: { reference, mediaType: 'application/json' },
    reference,
  };
}

function resolveArtifact(reference) {
  const filePath = artifactAllowlist.get(reference);
  if (!filePath) return null;
  const status = fs.lstatSync(filePath);
  if (!status.isFile() || status.isSymbolicLink()) return null;
  return fs.readFileSync(filePath, 'utf8');
}

function skillEvents(names) {
  return names.map((name, index) => ({
    name,
    operation: 'load',
    status: 'succeeded',
    trigger: name === 'implement' ? 'model' : 'host',
    callId: `implement-fixture-${index}`,
    provenance: {
      host: 'fixture',
      mechanism: 'test-only-engineering-guidance-adapter',
      eventType: 'fixture.skill-load',
      observerVersion: '1',
      statusSource: 'observed',
    },
  }));
}

function normalizedResult(invocationValue, context, artifact, status) {
  const failed = status === 'failed';
  return {
    status,
    observations: {
      packageSkills: context.packageSkills,
      hostAvailableSkills: null,
      preExecutionInventory: {
        skillDefinitions: context.packageSkills.map((name) => ({
          name,
          path: `.fixture/skills/${name}/SKILL.md`,
          digest: '0'.repeat(64),
        })),
        plugins: [],
        ruleSources: [],
        packageDigest: '1'.repeat(64),
        truncated: false,
      },
      skillEvents: skillEvents(context.resolvedSkills),
      routing: {
        requestedSkill: invocationValue.skill,
        resolvedSkills: context.resolvedSkills,
      },
      responses: [{ text: `Implementation handoff: ${artifact.reference}` }],
      artifacts: [artifact.descriptor],
      toolUses: failed ? [{
        name: 'engineering-guidance',
        outcome: 'failed',
      }] : [{
        name: 'engineering-guidance',
        outcome: 'succeeded',
      }, {
        name: 'tdd',
        outcome: 'succeeded',
      }],
      attemptedMutations: failed ? [] : [{
        operation: 'write',
        target: 'src/bounded-change.js',
        outcome: 'succeeded',
      }],
    },
    failure: failed ? {
      stage: 'execution',
      code: 'guidance-failure',
      message: 'Missing internal dependency "engineering-guidance"',
      missingSkill: 'engineering-guidance',
    } : null,
    durationMs: 2,
    costUsd: 0,
    model: {
      requested: invocationValue.model,
      resolved: 'resolved-test-model',
    },
  };
}

function loadImplementEvaluation() {
  const indexPath = path.join(skillRoot, 'evals', 'index.js');
  assertFile(indexPath);
  return require(indexPath);
}

test('canonical package discovers Implement without test fixtures', (t) => {
  const packageRoot = createPackageRoot(t);
  assert.deepEqual(
    discoverCanonicalPackage(packageRoot).skills.map(({ name }) => name),
    ['implement'],
  );
  assert.equal(require('../suite').createEngineeringGuidanceAdapter, undefined);
  assert.equal(require('../suite/testing').createEngineeringGuidanceAdapter, undefined);
});

test('production fails closed on the exact Engineering Guidance name', async (t) => {
  const packageRoot = createPackageRoot(t);
  let executions = 0;
  const adapter = defineProductionAdapter({
    name: 'implement-missing-guidance',
    async execute() {
      executions += 1;
      throw new Error('must not execute');
    },
  });
  const result = await executeProduction({
    repositoryRoot: packageRoot,
    adapter,
    invocation: invocation(),
  });

  assert.equal(executions, 0);
  assert.deepEqual(result.failure, {
    stage: 'dependency-resolution',
    code: 'missing-internal-dependency',
    message: 'Missing internal dependency "engineering-guidance"',
    missingSkill: 'engineering-guidance',
  });
  assert.deepEqual(result.observations.attemptedMutations, []);
  assert.deepEqual(result.observations.artifacts, []);
});

test('test-only guidance Adapter drives complete and ablated cases', async (t) => {
  const packageRoot = createPackageRoot(t, { includeGuidance: true });
  const completeArtifact = createArtifact(t, successfulHandoff());
  const failedArtifact = createArtifact(t, failedHandoff('guidance'));
  const { gradeImplementResult } = loadImplementEvaluation();
  const fixture = createEngineeringGuidanceAdapter((invocationValue, context) => {
    const guidanceAvailable = context.dependencyAblation === null;
    return normalizedResult(
      invocationValue,
      context,
      guidanceAvailable ? completeArtifact : failedArtifact,
      guidanceAvailable ? 'succeeded' : 'failed',
    );
  });

  const complete = await executeTest({
    repositoryRoot: packageRoot,
    adapter: fixture.adapter,
    invocation: invocation(),
  });
  const ablated = await executeTest({
    repositoryRoot: packageRoot,
    adapter: fixture.adapter,
    invocation: invocation(),
    dependencyAblation: {
      consumer: 'implement',
      dependency: 'engineering-guidance',
    },
  });

  assert.equal(fixture.calls.length, 2);
  assert.deepEqual(complete.observations.routing.resolvedSkills, [
    'engineering-guidance',
    'implement',
  ]);
  assert.equal(
    gradeImplementResult({ result: complete, resolveArtifact }).passed,
    true,
  );
  assert.deepEqual(ablated.observations.routing.resolvedSkills, ['implement']);
  assert.equal(ablated.status, 'failed');
  assert.deepEqual(ablated.observations.attemptedMutations, []);
  assert.equal(
    gradeImplementResult({ result: ablated, resolveArtifact }).passed,
    true,
  );
  await assert.rejects(
    executeProduction({
      repositoryRoot: packageRoot,
      adapter: fixture.adapter,
      invocation: invocation(),
    }),
    /production execution requires a production Adapter/,
  );
});

test('handoff validation distinguishes every failure phase from completion', () => {
  const { validateImplementHandoff } = loadImplementEvaluation();
  const completed = successfulHandoff();

  assert.strictEqual(
    validateImplementHandoff(completed),
    completed,
  );
  for (const kind of ['guidance', 'test', 'validation', 'implementation']) {
    const artifact = failedHandoff(kind);
    assert.strictEqual(validateImplementHandoff(artifact), artifact);
  }
  const mislabeled = successfulHandoff();
  mislabeled.failure = {
    kind: 'test',
    stage: 'test',
    message: 'test phase failed.',
  };
  assert.throws(
    () => validateImplementHandoff(mislabeled),
    /completed handoff cannot contain a failure/,
  );
});

test('completed handoff rejects mutation before completed guidance', () => {
  const { validateImplementHandoff } = loadImplementEvaluation();
  const handoff = successfulHandoff();
  const [guidance, redTest, mutation, ...remainingEvents] = handoff.lifecycle;
  handoff.lifecycle = [
    mutation,
    guidance,
    redTest,
    ...remainingEvents,
  ].map((event, index) => ({
    ...event,
    sequence: index + 1,
  }));

  assert.throws(
    () => validateImplementHandoff(handoff),
    /completed guidance must precede the first mutation/,
  );
});

test('completed handoff requires red evidence before matching green evidence', () => {
  const { validateImplementHandoff } = loadImplementEvaluation();
  const missingRed = successfulHandoff();
  missingRed.tests = missingRed.tests.filter(({ phase }) => phase !== 'red');
  assert.throws(
    () => validateImplementHandoff(missingRed),
    /tests require ordered red then green evidence/,
  );

  const reversed = successfulHandoff();
  reversed.tests.reverse();
  assert.throws(
    () => validateImplementHandoff(reversed),
    /tests require ordered red then green evidence/,
  );
});

test('result grading rejects topology and unknown mutation operations', (t) => {
  const { gradeImplementResult } = loadImplementEvaluation();
  for (const operation of ['issue-create', 'unknown-mutation']) {
    const artifact = createArtifact(t, successfulHandoff());
    const context = {
      packageSkills: ['engineering-guidance', 'implement'],
      resolvedSkills: ['engineering-guidance', 'implement'],
    };
    const result = normalizedResult(invocation(), context, artifact, 'succeeded');
    result.observations.attemptedMutations.push({
      operation,
      target: 'issue://42',
      outcome: 'succeeded',
    });

    const grade = gradeImplementResult({ result, resolveArtifact });
    assert.equal(grade.passed, false, operation);
    assert.equal(
      grade.checks.some(({ name, passed }) => (
        name === 'only scoped patch mutations' && passed === false
      )),
      true,
      operation,
    );
  }
});

test('evaluation catalog covers role, component, outcome, and trigger separately', () => {
  const { loadDefinitions } = loadImplementEvaluation();
  const definitions = loadDefinitions(repositoryRoot);
  assert.deepEqual(
    definitions.map(({ evaluation }) => evaluation.layer),
    ['role', 'component', 'outcome', 'trigger'],
  );
  const cases = definitions.flatMap(({ evals }) => evals);
  assert.equal(cases.every(({ expectations }) => expectations.length > 0), true);
  assert.deepEqual(
    definitions.find(({ evaluation }) => evaluation.layer === 'component')
      .evals.map(({ ablated_dependency: dependency }) => dependency),
    ['engineering-guidance'],
  );
  assert.deepEqual(
    definitions.find(({ evaluation }) => evaluation.layer === 'outcome')
      .evals[0].required_skill_loads,
    ['implement', 'engineering-guidance'],
  );
  assert.equal(
    cases.some(({ expectations }) => expectations.some((expectation) => (
      /duration, cost, and model identity/.test(expectation)
    ))),
    true,
  );
});
