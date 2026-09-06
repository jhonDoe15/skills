'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { defineProductionAdapter } = require('../suite');
const {
  buildCampaignPlan,
  buildFocusedHoldoutPlan,
  validateFocusedHoldoutPlan,
} = require('../suite/adoption');
const {
  compileFocusedHoldoutPlan,
  compileRuntimePackage,
  loadExternalHoldouts,
  loadHoldoutInput,
  selectHoldouts,
} = require('../suite/adoption/holdouts');
const {
  buildHumanReviewPacket,
  paidExecutionAcknowledgement,
  prepareFocusedHoldoutPlan,
  replayCampaignArtifacts,
  runCampaign,
} = require('../suite/adoption/runner');
const { fingerprintValue } = require('../suite/evaluation');

const repositoryRoot = path.resolve(__dirname, '..');
const holdoutRoot = path.join(
  repositoryRoot,
  'external-holdouts',
  'implementation-planning',
);
const currentRevision = spawnSync('git', ['rev-parse', 'HEAD'], {
  cwd: repositoryRoot,
  encoding: 'utf8',
}).stdout.trim();

function model(id, params = []) {
  return { id, params };
}

function configuration() {
  return {
    schema_version: 2,
    kind: 'adoption-campaign-configuration',
    candidate: {
      identity: {
        name: 'skills',
        version: '1.0.0',
        stage: 'release-candidate',
      },
      git_revision: currentRevision,
    },
    hosts: {
      'claude-code': {
        ordinary: {
          model: model('claude-sonnet-4-5-20250929'),
          timeout_ms: 180000,
          budget_usd: 0.5,
          max_attempts: 2,
        },
        frontier: {
          model: model('claude-opus-4-1-20250805'),
          timeout_ms: 240000,
          budget_usd: 1.5,
          max_attempts: 2,
        },
      },
      cursor: {
        ordinary: {
          model: model('cursor-terra-shaped-model', [{
            id: 'reasoning_effort',
            value: 'low',
          }]),
          timeout_ms: 180000,
          budget_usd: 0.5,
          max_attempts: 2,
        },
        frontier: {
          model: model('cursor-terra-shaped-model', [{
            id: 'reasoning_effort',
            value: 'high',
          }]),
          timeout_ms: 240000,
          budget_usd: 1.5,
          max_attempts: 2,
        },
      },
    },
    judge: {
      model: model('anthropic/claude-opus-4.1@20250805'),
      timeout_ms: 180000,
      budget_usd: 1,
      max_attempts: 2,
    },
    repetitions: {
      ordinary: 3,
      mixed: 5,
      critical: 5,
    },
    critical_cases: [
      'code-review-outcome/nontrivial-ticket-outcome',
      'take-it-offline-role/pressure-and-sensitive-data',
    ],
    human_review: {
      passing_sample: ['to-humans-outcome/complete-human-decision'],
    },
  };
}

function focusedPlan(selectors = {}) {
  return buildFocusedHoldoutPlan({
    repositoryRoot,
    configuration: configuration(),
    selectors,
  });
}

function temporaryDirectory(t, prefix = 'focused-holdout-') {
  const artifacts = path.join(repositoryRoot, '.artifacts');
  fs.mkdirSync(artifacts, { recursive: true });
  const directory = fs.mkdtempSync(path.join(artifacts, prefix));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function copiedCorpus(t) {
  const fixtureRepository = fs.mkdtempSync(
    path.join(os.tmpdir(), 'holdout-corpus-'),
  );
  t.after(() => fs.rmSync(
    fixtureRepository,
    { recursive: true, force: true },
  ));
  const corpus = path.join(
    fixtureRepository,
    'external-holdouts',
    'implementation-planning',
  );
  fs.mkdirSync(path.dirname(corpus), { recursive: true });
  fs.cpSync(holdoutRoot, corpus, { recursive: true });
  fs.mkdirSync(path.join(fixtureRepository, 'suite'), { recursive: true });
  fs.copyFileSync(
    path.join(repositoryRoot, 'suite', 'canonical-suite.json'),
    path.join(fixtureRepository, 'suite', 'canonical-suite.json'),
  );
  for (const skill of [
    'engineering-guidance',
    'architecture-review',
    'implementation-planning',
  ]) {
    fs.cpSync(
      path.join(repositoryRoot, 'skills', skill),
      path.join(fixtureRepository, 'skills', skill),
      { recursive: true },
    );
  }
  return {
    repositoryRoot: fixtureRepository,
    root: corpus,
    manifestPath: path.join(corpus, 'manifest.json'),
  };
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function selectors(overrides = {}) {
  return {
    cases: [],
    domains: [],
    hosts: [],
    model_cells: [],
    ...overrides,
  };
}

test('compiles deterministic focused identities without absolute paths', () => {
  const selected = selectors({
    cases: ['compact-celsius'],
    hosts: ['claude-code'],
    model_cells: ['claude-code:ordinary'],
  });
  const first = focusedPlan(selected);
  const second = focusedPlan({
    ...selected,
    cases: ['proportional/compact-celsius'],
  });

  assert.equal(first.kind, 'adoption-external-holdout-plan');
  assert.equal(first.assessment_class, 'partial-holdout-assessment');
  assert.equal(first.canonical_release_evidence, false);
  assert.deepEqual(first.coverage.selected_cases, [
    'proportional/compact-celsius',
  ]);
  assert.deepEqual(first.coverage.selected_cells, ['claude-code:ordinary']);
  assert.equal(first.manifests.length, 1);
  assert.equal(first.fingerprint, second.fingerprint);
  assert.equal(JSON.stringify(first).includes(repositoryRoot), false);
  assert.equal(validateFocusedHoldoutPlan(repositoryRoot, first).fingerprint,
    first.fingerprint);
  assert.deepEqual(first.execution_estimate, {
    initial_calls: {
      host_executions: 6,
      judge_calls: 3,
      total: 9,
    },
    maximum_calls: {
      host_executions: 10,
      judge_calls: 5,
      total: 15,
    },
    maximum_attempts: {
      host_executions: 20,
      judge_calls: 10,
      total: 30,
    },
    maximum_configured_cost_ceiling_usd: 20,
  });
});

test('selector categories union internally and intersect across categories', () => {
  const catalog = loadExternalHoldouts({ repositoryRoot });
  const selection = selectHoldouts(catalog, selectors({
    cases: ['compact-celsius', 'scalar-ellipsis'],
    domains: ['proportional'],
    hosts: ['claude-code'],
    model_cells: ['claude-code:ordinary', 'claude-code:frontier'],
  }));
  assert.deepEqual(
    selection.cases.map(({ id }) => id),
    ['compact-celsius', 'scalar-ellipsis'],
  );
  assert.deepEqual(selection.cells, [
    { host: 'claude-code', tier: 'ordinary' },
    { host: 'claude-code', tier: 'frontier' },
  ]);

  for (const [selectionSelectors, pattern] of [
    [selectors({ cases: ['missing'] }), /unknown holdout case/],
    [selectors({ domains: ['missing'] }), /unknown holdout domain/],
    [selectors({ hosts: ['missing'] }), /unknown holdout host/],
    [selectors({ model_cells: ['claude-code:missing'] }), /unknown model cell/],
    [selectors({ cases: ['compact-celsius', 'compact-celsius'] }), /duplicates/],
    [selectors({
      cases: ['compact-celsius'],
      domains: ['security'],
    }), /zero work/],
    [selectors({
      hosts: ['cursor'],
      model_cells: ['claude-code:ordinary'],
    }), /zero work/],
  ]) {
    assert.throws(
      () => selectHoldouts(catalog, selectionSelectors),
      pattern,
    );
  }
});

test('invalid focused selection fails before artifact creation', (t) => {
  const directory = temporaryDirectory(t);
  const configurationPath = path.join(directory, 'configuration.json');
  const artifactDirectory = path.join(directory, 'must-not-exist');
  writeJson(configurationPath, configuration());

  assert.throws(() => prepareFocusedHoldoutPlan({
    repositoryRoot,
    configurationPath,
    artifactDirectory,
    selectors: selectors({ cases: ['missing'] }),
    resolveWorktreeStatus: () => '',
  }), /unknown holdout case/);
  assert.equal(fs.existsSync(artifactDirectory), false);
});

test('changed input and oracle bytes change focused identity', (t) => {
  const fixture = copiedCorpus(t);
  const options = {
    repositoryRoot: fixture.repositoryRoot,
    configuration: configuration(),
    selectors: selectors({
      cases: ['compact-celsius'],
      model_cells: ['claude-code:ordinary'],
    }),
    manifestPath: fixture.manifestPath,
  };
  const initial = compileFocusedHoldoutPlan(options);
  fs.appendFileSync(
    path.join(fixture.root, 'proportional', 'compact-celsius', 'input.md'),
    '\nChanged input byte.\n',
  );
  const changedInput = compileFocusedHoldoutPlan(options);
  assert.notEqual(initial.fingerprint, changedInput.fingerprint);

  const oraclePath = path.join(
    fixture.root,
    'proportional',
    'compact-celsius',
    'oracle.json',
  );
  const oracle = JSON.parse(fs.readFileSync(oraclePath, 'utf8'));
  oracle.expected_output += ' Changed oracle byte.';
  fs.writeFileSync(oraclePath, `${JSON.stringify(oracle, null, 2)}\n`);
  const changedOracle = compileFocusedHoldoutPlan(options);
  assert.notEqual(changedInput.fingerprint, changedOracle.fingerprint);
});

test('rejects path escape, symlink, revision, and post-plan digest drift', (t) => {
  {
    const fixture = copiedCorpus(t);
    const manifest = JSON.parse(fs.readFileSync(fixture.manifestPath, 'utf8'));
    manifest.cases[0].input = '../outside.md';
    fs.writeFileSync(fixture.manifestPath, `${JSON.stringify(manifest)}\n`);
    assert.throws(
      () => loadExternalHoldouts({
        repositoryRoot: fixture.repositoryRoot,
        manifestPath: fixture.manifestPath,
      }),
      /paths must match|contained relative path/,
    );
  }
  {
    const fixture = copiedCorpus(t);
    const inputPath = path.join(
      fixture.root,
      'proportional',
      'compact-celsius',
      'input.md',
    );
    const target = `${inputPath}.target`;
    fs.renameSync(inputPath, target);
    fs.symlinkSync(target, inputPath);
    assert.throws(
      () => loadExternalHoldouts({
        repositoryRoot: fixture.repositoryRoot,
        manifestPath: fixture.manifestPath,
      }),
      /symlink/,
    );
  }
  {
    const fixture = copiedCorpus(t);
    const inputPath = path.join(
      fixture.root,
      'proportional',
      'compact-celsius',
      'input.md',
    );
    fs.writeFileSync(inputPath, 'Immutable revision: `short`\n');
    assert.throws(
      () => loadExternalHoldouts({
        repositoryRoot: fixture.repositoryRoot,
        manifestPath: fixture.manifestPath,
      }),
      /40-hex immutable revision/,
    );
  }
  {
    const fixture = copiedCorpus(t);
    const plan = compileFocusedHoldoutPlan({
      repositoryRoot: fixture.repositoryRoot,
      configuration: configuration(),
      selectors: selectors({
        cases: ['compact-celsius'],
        model_cells: ['claude-code:ordinary'],
      }),
      manifestPath: fixture.manifestPath,
    });
    const input = plan.holdout_catalog.cases[0];
    const plannedCase = plan.manifests[0].cases[0];
    const source = path.join(
      path.dirname(path.join(
        fixture.repositoryRoot,
        plan.holdout_catalog.source,
      )),
      input.input,
    );
    const original = fs.readFileSync(source);
    fs.appendFileSync(source, '\ndrift\n');
    assert.throws(
      () => loadHoldoutInput(fixture.repositoryRoot, plan, plannedCase),
      /changed after planning/,
    );
    fs.writeFileSync(source, original);
  }
});

function fakeResult(invocation, context) {
  const treatment = context.packageSkills.length > 0;
  const skillEvents = treatment
    ? context.resolvedSkills.map((name, index) => ({
      name,
      operation: 'load',
      status: 'succeeded',
      trigger: 'model',
      callId: `load-${index}`,
      provenance: {
        host: 'fixture',
        mechanism: 'fixture',
        eventType: 'fixture',
        observerVersion: '1',
        statusSource: 'observed',
      },
    }))
    : [];
  return {
    status: 'succeeded',
    observations: {
      packageSkills: [...context.packageSkills],
      hostAvailableSkills: null,
      preExecutionInventory: {
        skillDefinitions: context.packageSkills.map((name) => ({
          name,
          path: `.fixture/skills/${name}/SKILL.md`,
          digest: '0'.repeat(64),
        })),
        plugins: [],
        ruleSources: [],
        packageDigest: '0'.repeat(64),
        truncated: false,
      },
      skillEvents,
      routing: {
        requestedSkill: invocation.skill,
        resolvedSkills: [...context.resolvedSkills],
      },
      responses: [{
        text: treatment
          ? 'A grounded technical design and test plan.'
          : 'A brief unstructured plan.',
      }],
      artifacts: [],
      toolUses: [],
      attemptedMutations: [],
    },
    failure: null,
    durationMs: 1,
    costUsd: 0.01,
    model: {
      requested: invocation.model,
      resolved: invocation.model,
      verification: {
        status: 'verified',
        source: 'fixture',
        reason: null,
        catalogEntryFingerprint: null,
      },
    },
  };
}

function fakeJudge() {
  return {
    judge(request) {
      const treatment = Object.entries(request.payload.candidates)
        .find(([, candidate]) => candidate.content.includes('grounded'))[0];
      const dimensions = Object.fromEntries(
        Object.keys(request.schema.properties.A.properties.dimensions.properties)
          .map((id) => [id, 2]),
      );
      const candidate = {
        expectation_results: request.payload.expectations.map((text) => ({
          text,
          passed: true,
          evidence: 'Fixture evidence.',
        })),
        dimensions,
      };
      return {
        model: {
          requested: request.model,
          resolved: request.model,
          verification: {
            status: 'verified',
            source: 'fixture',
            reason: null,
            catalogEntryFingerprint: null,
          },
        },
        judgment: {
          winner: treatment,
          reasoning: 'Treatment wins in the deterministic fixture.',
          A: candidate,
          B: structuredClone(candidate),
        },
        duration_ms: 1,
        cost_usd: 0.01,
      };
    },
  };
}

test('focused run isolates oracle data and replays without host calls', async (t) => {
  const directory = temporaryDirectory(t);
  const plan = focusedPlan(selectors({
    cases: ['compact-celsius'],
    model_cells: ['claude-code:ordinary'],
  }));
  const oracle = JSON.parse(fs.readFileSync(
    path.join(holdoutRoot, 'proportional/compact-celsius/oracle.json'),
    'utf8',
  ));
  const stagedInputPath =
    'holdout-inputs/proportional/compact-celsius/input.md';
  const expectedExecutionPrompt = [
    oracle.prompt,
    '',
    'Read the staged input evidence at these exact paths:',
    `- ${stagedInputPath}`,
  ].join('\n');
  assert.equal(
    plan.definition.evals[0].prompt,
    oracle.prompt,
    'retained judge semantics keep the oracle prompt unchanged',
  );
  const transmitted = [];
  const index = await runCampaign({
    repositoryRoot,
    plan,
    artifactDirectory: directory,
    acknowledgement: paidExecutionAcknowledgement(plan),
    resolveWorktreeStatus: () => '',
    createAdapter() {
      return defineProductionAdapter({
        name: 'focused-holdout-fixture',
        execute(invocation, context) {
          transmitted.push({
            prompt: invocation.prompt,
            packageSkills: [...context.packageSkills],
          });
          const visible = JSON.stringify({
            invocation,
            context: {
              ...context,
              holdoutInputs: context.holdoutInputs.map((input) => ({
                destination: input.destination,
                bytes: input.bytes.toString('utf8'),
                digest: input.digest,
              })),
            },
          });
          for (const secret of [
            oracle.expected_output,
            ...oracle.expectations,
            ...oracle.critical_forbidden_outcomes,
          ]) {
            assert.equal(visible.includes(secret), false);
          }
          assert.equal(context.stagingPolicy, 'external-holdout-v1');
          assert.deepEqual(
            context.holdoutInputs.map(({ destination }) => destination),
            [stagedInputPath],
          );
          return fakeResult(invocation, context);
        },
      });
    },
    createJudge: fakeJudge,
  });
  assert.equal(index.complete, true);
  assert.equal(index.kind, 'adoption-external-holdout-run-index');
  assert.equal(transmitted.length, 6);
  assert.ok(transmitted.some(({ packageSkills }) => packageSkills.length === 0));
  assert.ok(transmitted.some(({ packageSkills }) => packageSkills.length > 0));
  assert.ok(transmitted.every(
    ({ prompt }) => prompt === expectedExecutionPrompt,
  ));

  const executionsBeforeReplay = transmitted.length;
  const { aggregate } = replayCampaignArtifacts({
    repositoryRoot,
    plan,
    artifactDirectory: directory,
  });
  assert.equal(transmitted.length, executionsBeforeReplay);
  assert.equal(aggregate.kind, 'adoption-external-holdout-aggregate-replay');
  assert.equal(aggregate.assessment_class, 'partial-holdout-assessment');
  assert.equal(aggregate.canonical_release_evidence, false);

  const packet = buildHumanReviewPacket({
    repositoryRoot,
    plan,
    artifactDirectory: directory,
  });
  assert.equal(packet.kind, 'adoption-external-holdout-review-packet');
  assert.equal(packet.human_decision.status, 'partial-holdout-assessment');
  assert.equal(packet.canonical_release_evidence, false);
  assert.deepEqual(packet.review_adoption_checklist, []);
});

test('focused resume validates every retained case before missing work', async (t) => {
  const directory = temporaryDirectory(t);
  const plan = focusedPlan(selectors({
    cases: ['compact-celsius'],
    model_cells: [
      'claude-code:ordinary',
      'claude-code:frontier',
    ],
  }));
  const laterManifest = plan.manifests[1];
  const partial = await runCampaign({
    repositoryRoot,
    plan,
    artifactDirectory: directory,
    acknowledgement: paidExecutionAcknowledgement(plan),
    resolveWorktreeStatus: () => '',
    manifestFingerprints: [laterManifest.fingerprint],
    createAdapter() {
      return defineProductionAdapter({
        name: 'focused-later-evidence-fixture',
        execute: fakeResult,
      });
    },
    createJudge: fakeJudge,
  });
  assert.equal(partial.complete, false);
  assert.equal(partial.entries.length, 1);
  const corruptPointer = partial.entries[0].cases[0].phases[0].runs[0];
  const corruptPath = path.join(
    directory,
    corruptPointer.slice('artifact://'.length),
  );
  const corruptEvidence = JSON.parse(fs.readFileSync(corruptPath, 'utf8'));
  corruptEvidence.execution.output = 'corrupt retained output';
  writeJson(corruptPath, corruptEvidence);

  let factoryCalls = 0;
  let hostCalls = 0;
  await assert.rejects(runCampaign({
    repositoryRoot,
    plan,
    artifactDirectory: directory,
    acknowledgement: paidExecutionAcknowledgement(plan),
    resume: true,
    resolveWorktreeStatus: () => '',
    createAdapter() {
      factoryCalls += 1;
      return defineProductionAdapter({
        name: 'must-not-execute',
        execute(invocation, context) {
          hostCalls += 1;
          return fakeResult(invocation, context);
        },
      });
    },
    createJudge() {
      factoryCalls += 1;
      return fakeJudge();
    },
  }), /fingerprint mismatch|incompatible/);
  assert.equal(factoryCalls, 0);
  assert.equal(hostCalls, 0);
});

test('focused resume blocks an indeterminate started paid attempt', async (t) => {
  const directory = temporaryDirectory(t);
  const plan = focusedPlan(selectors({
    cases: ['compact-celsius'],
    model_cells: ['claude-code:ordinary'],
  }));
  const started = {
    schema_version: 2,
    kind: 'adoption-paid-attempt-started',
    attempt_kind: 'execution',
    campaign_fingerprint: plan.fingerprint,
    evaluation_manifest_fingerprint: plan.manifests[0].fingerprint,
    selector: plan.manifests[0].cases[0].selector,
    phase: 'initial',
    logical_repetition: 1,
    arm: 'treatment',
    attempt: 1,
    status: 'started',
  };
  started.fingerprint = fingerprintValue(started);
  writeJson(
    path.join(directory, 'run', 'execution-attempts', 'started.json'),
    started,
  );
  let clients = 0;

  await assert.rejects(runCampaign({
    repositoryRoot,
    plan,
    artifactDirectory: directory,
    acknowledgement: paidExecutionAcknowledgement(plan),
    resume: true,
    resolveWorktreeStatus: () => '',
    createAdapter() {
      clients += 1;
    },
    createJudge() {
      clients += 1;
    },
  }), /indeterminate started paid attempt/);
  assert.equal(clients, 0);
});

test('Cursor cells plan with an explicit paid-execution blocker', () => {
  const plan = focusedPlan(selectors({
    cases: ['compact-celsius'],
    model_cells: ['cursor:ordinary'],
  }));
  assert.deepEqual(plan.coverage.selected_cells, ['cursor:ordinary']);
  assert.equal(plan.manifests[0].execution_status.runnable, false);
  assert.match(plan.manifests[0].execution_status.blocker, /budget cap/);
  assert.deepEqual(plan.manifests[0].cell.model.params, [{
    id: 'reasoning_effort',
    value: 'low',
  }]);
});

test('unbounded Cursor opt-in is retained and required on resume', async (t) => {
  const directory = temporaryDirectory(t);
  const plan = focusedPlan(selectors({
    cases: ['compact-celsius'],
    model_cells: ['cursor:ordinary'],
  }));
  const index = await runCampaign({
    repositoryRoot,
    plan,
    artifactDirectory: directory,
    acknowledgement: paidExecutionAcknowledgement(plan),
    allowUnboundedCursorExecution: true,
    resolveWorktreeStatus: () => '',
    createAdapter() {
      return defineProductionAdapter({
        name: 'unbounded-cursor-opt-in-fixture',
        execute: fakeResult,
      });
    },
    createJudge: fakeJudge,
  });

  assert.deepEqual(index.execution_exceptions, [
    'cursor-sdk-no-enforceable-per-run-budget-cap',
  ]);

  let clientFactories = 0;
  await assert.rejects(runCampaign({
    repositoryRoot,
    plan,
    artifactDirectory: directory,
    acknowledgement: paidExecutionAcknowledgement(plan),
    resume: true,
    resolveWorktreeStatus: () => '',
    createAdapter() {
      clientFactories += 1;
    },
    createJudge() {
      clientFactories += 1;
    },
  }), /run index is stale or incompatible/);
  assert.equal(clientFactories, 0);
});

test('runtime package includes only recognized execution files', () => {
  const runtimePackage = compileRuntimePackage(
    repositoryRoot,
    'implementation-planning',
  );
  assert.deepEqual(runtimePackage.skills, [
    'engineering-guidance',
    'architecture-review',
    'implementation-planning',
  ]);
  assert.ok(runtimePackage.entries.some(({ skill, path: entryPath }) => (
    skill === 'implementation-planning' && entryPath === 'SKILL.md'
  )));
  assert.ok(runtimePackage.entries.some(({ path: entryPath }) => (
    entryPath.startsWith('references/')
  )));
  assert.equal(runtimePackage.entries.some(({ path: entryPath }) => (
    /^(?:evals(?:\/|\.md$)|tests?\/|\.)/.test(entryPath)
  )), false);
  assert.equal(runtimePackage.entries.some(({ path: entryPath }) => (
    !entryPath.includes('/')
      && entryPath !== 'SKILL.md'
  )), false);
});

test('canonical campaign planning remains the unchanged default', () => {
  const plan = buildCampaignPlan({
    repositoryRoot,
    configuration: configuration(),
  });
  assert.equal(plan.kind, 'adoption-campaign-plan');
  assert.equal(plan.manifests.length, 300);
  assert.equal(Object.hasOwn(plan, 'holdout_catalog'), false);
  assert.equal(Object.hasOwn(plan, 'selection'), false);
});

test('run, replay, and packet reject holdout selector flags', () => {
  const script = path.join(repositoryRoot, 'scripts', 'run-adoption-campaign.js');
  for (const mode of ['run', 'replay', 'packet']) {
    const result = spawnSync(process.execPath, [
      script,
      mode,
      '--plan',
      'missing.json',
      '--case',
      'compact-celsius',
    ], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    });
    assert.equal(result.status, 1, mode);
    assert.match(result.stderr, /selector flags are plan-only/, mode);
  }
});

test('unbounded Cursor execution opt-in is run-only', () => {
  const script = path.join(repositoryRoot, 'scripts', 'run-adoption-campaign.js');
  for (const mode of ['plan', 'replay', 'packet']) {
    const result = spawnSync(process.execPath, [
      script,
      mode,
      '--allow-unbounded-cursor-execution',
    ], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    });
    assert.equal(result.status, 1, mode);
    assert.match(result.stderr, /is run-only/, mode);
  }
});
