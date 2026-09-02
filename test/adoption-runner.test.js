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
  replayCampaignAggregate,
} = require('../suite/adoption');
const {
  buildHumanReviewPacketFromFragments,
  createClaudeCodeJudge,
  paidExecutionAcknowledgement,
  prepareCampaignPlan,
  replayCampaignArtifacts,
  runCampaign,
} = require('../suite/adoption/runner');
const { fingerprintValue } = require('../suite/evaluation');

const repositoryRoot = path.resolve(__dirname, '..');
const currentRevision = spawnSync('git', ['rev-parse', 'HEAD'], {
  cwd: repositoryRoot,
  encoding: 'utf8',
}).stdout.trim();
const cleanWorktree = () => '';

function configuration() {
  return {
    schema_version: 1,
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
          model: 'claude-sonnet-4-5-20250929',
          timeout_ms: 180000,
          budget_usd: 0.5,
          max_attempts: 2,
        },
        frontier: {
          model: 'claude-opus-4-1-20250805',
          timeout_ms: 240000,
          budget_usd: 1.5,
          max_attempts: 2,
        },
      },
      cursor: {
        ordinary: {
          model: 'anthropic/claude-4.5-sonnet@20250929',
          timeout_ms: 180000,
          budget_usd: 0.5,
          max_attempts: 2,
        },
        frontier: {
          model: 'openai/gpt-5.2@20251211',
          timeout_ms: 240000,
          budget_usd: 1.5,
          max_attempts: 2,
        },
      },
    },
    judge: {
      model: 'anthropic/claude-opus-4.1@20250805',
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
      passing_sample: [
        'to-humans-outcome/complete-human-decision',
      ],
    },
  };
}

function temporaryDirectory(t) {
  const root = path.join(repositoryRoot, '.artifacts');
  fs.mkdirSync(root, { recursive: true });
  const directory = fs.mkdtempSync(path.join(root, 'adoption-runner-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function skillEvent(name, callId) {
  return {
    name,
    operation: 'load',
    status: 'succeeded',
    trigger: 'model',
    callId,
    provenance: {
      host: 'fixture',
      mechanism: 'fixture',
      eventType: 'fixture',
      observerVersion: '1',
      statusSource: 'observed',
    },
  };
}

function fakeResult(invocation, context) {
  const treatment = context.packageSkills.length > 0;
  const loaded = treatment ? context.resolvedSkills : [];
  const output = treatment
    ? 'TREATMENT: Keep the staged rollout because rollback is verified and '
      + 'exposure is contained. Peak traffic remains untested. Move to full '
      + 'deployment only if the noon p95 stays under 200 ms; otherwise keep '
      + 'the staged rollout.'
    : 'CONTROL: Continue with a cautious deployment.';
  return {
    status: 'succeeded',
    observations: {
      packageSkills: [...context.packageSkills],
      hostAvailableSkills: treatment
        ? {
          names: [...context.packageSkills],
          provenance: {
            host: 'fixture',
            mechanism: 'fixture-catalog',
            eventType: 'fixture.init',
            observerVersion: '1',
            statusSource: 'observed',
          },
        }
        : null,
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
      skillEvents: loaded.map((name, index) => (
        skillEvent(name, `load-${index}`)
      )),
      routing: {
        requestedSkill: invocation.skill,
        resolvedSkills: [...context.resolvedSkills],
      },
      responses: [{ text: output }],
      artifacts: [],
      toolUses: [],
      attemptedMutations: [],
    },
    failure: null,
    durationMs: 5,
    costUsd: 0.01,
    model: {
      requested: invocation.model,
      resolved: invocation.model,
    },
  };
}

function fakeJudge(outcomes) {
  let call = 0;
  return {
    judge(request) {
      const treatment = Object.entries(request.payload.candidates).find(
        ([, candidate]) => candidate.content.includes('TREATMENT:'),
      )[0];
      const control = treatment === 'A' ? 'B' : 'A';
      const winner = outcomes[call] ? treatment : control;
      call += 1;
      const dimensions = Object.fromEntries(
        Object.keys(
          request.schema.properties.A.properties.dimensions.properties,
        ).map((id) => [id, 2]),
      );
      const candidate = {
        expectation_results: request.payload.expectations.map((text) => ({
          text,
          passed: true,
          evidence: 'The fixture output contains corresponding evidence.',
        })),
        dimensions,
      };
      return {
        judgment: {
          winner,
          reasoning: 'Fixture judgment.',
          A: candidate,
          B: structuredClone(candidate),
        },
        duration_ms: 3,
        cost_usd: 0.01,
      };
    },
  };
}

function passingFragments(plan) {
  return plan.manifests.map((manifest) => {
    const fragment = {
      schema_version: 1,
      kind: 'adoption-manifest-replay',
      campaign_fingerprint: plan.fingerprint,
      manifest_fingerprint: manifest.fingerprint,
      definition_fingerprint: manifest.definition.fingerprint,
      candidate: structuredClone(manifest.candidate),
      cell: structuredClone(manifest.cell),
      cases: manifest.cases.map((evaluation) => ({
        id: evaluation.id,
        repetition_class: evaluation.critical ? 'critical' : 'ordinary',
        repetitions: evaluation.initial_repetitions,
        passed: true,
        failures: [],
        passes: [{
          gate: 'offline-core-replay',
          evidence_pointer: `artifact://replay/${manifest.fingerprint}.json`,
        }],
      })),
      planning_semantics: manifest.planning_semantics
        ? {
          cases: manifest.cases.map((evaluation) => {
            const repetitions = evaluation.initial_repetitions;
            return {
              id: evaluation.id,
              baseline: {
                first_pass: Array(repetitions).fill(true),
                attempts: Array(repetitions).fill(1),
                cost_usd: Array(repetitions).fill(0.1),
              },
              candidate: {
                first_pass: Array(repetitions).fill(true),
                attempts: Array(repetitions).fill(1),
                cost_usd: Array(repetitions).fill(0.1),
              },
            };
          }),
        }
        : null,
      executor_sizing: {
        execution_calls: 3,
        execution_attempts: 3,
        observed_cost_usd: 0.3,
      },
      provenance: {
        replay_result: `artifact://replay/${manifest.fingerprint}.json`,
      },
    };
    fragment.fingerprint = fingerprintValue(fragment);
    return fragment;
  });
}

test('plan validates HEAD, computes a ceiling, and creates no spend clients', (t) => {
  const directory = temporaryDirectory(t);
  const configPath = path.join(directory, 'campaign.json');
  const artifacts = path.join(directory, 'artifacts');
  writeJson(configPath, configuration());

  const prepared = prepareCampaignPlan({
    repositoryRoot,
    configurationPath: configPath,
    artifactDirectory: artifacts,
    resolveWorktreeStatus: cleanWorktree,
  });

  assert.equal(prepared.plan.manifests.length, 248);
  assert.deepEqual(prepared.plan.execution_estimate, {
    initial_calls: {
      host_executions: 3700,
      judge_calls: 1120,
      total: 4820,
    },
    maximum_calls: {
      host_executions: 5140,
      judge_calls: 1840,
      total: 6980,
    },
    maximum_attempts: {
      host_executions: 10280,
      judge_calls: 3680,
      total: 13960,
    },
    maximum_configured_cost_ceiling_usd: 13960,
  });
  assert.deepEqual(
    fs.readdirSync(artifacts).sort(),
    ['configuration.json', 'definitions.json', 'plan.json'],
  );
});

test('plan rejects a dirty candidate and artifact roots outside .artifacts', (t) => {
  const directory = temporaryDirectory(t);
  const configPath = path.join(directory, 'campaign.json');
  writeJson(configPath, configuration());

  assert.throws(() => prepareCampaignPlan({
    repositoryRoot,
    configurationPath: configPath,
    artifactDirectory: path.join(directory, 'dirty'),
    resolveWorktreeStatus: () => ' M skills/to-humans/SKILL.md',
  }), /worktree must be clean/);

  const outsideArtifacts = path.join(repositoryRoot, 'campaign-output');
  assert.throws(() => prepareCampaignPlan({
    repositoryRoot,
    configurationPath: configPath,
    artifactDirectory: outsideArtifacts,
    resolveWorktreeStatus: cleanWorktree,
  }), /inside the ignored \.artifacts directory/);
  assert.equal(fs.existsSync(outsideArtifacts), false);
});

test('paid guard rejects absent or mismatched acknowledgement before factories', async (t) => {
  const directory = temporaryDirectory(t);
  const plan = buildCampaignPlan({
    repositoryRoot,
    configuration: configuration(),
  });
  let adapters = 0;
  let judges = 0;

  await assert.rejects(runCampaign({
    repositoryRoot,
    plan,
    artifactDirectory: directory,
    acknowledgement: `${paidExecutionAcknowledgement(plan)}-wrong`,
    resolveWorktreeStatus: cleanWorktree,
    createAdapter() {
      adapters += 1;
      throw new Error('must not instantiate');
    },
    createJudge() {
      judges += 1;
      throw new Error('must not instantiate');
    },
  }), /acknowledgement/);
  assert.equal(adapters, 0);
  assert.equal(judges, 0);
  assert.equal(fs.readdirSync(directory).length, 0);
});

test('production Cursor execution stops before spend without an enforceable cap', async (t) => {
  const directory = temporaryDirectory(t);
  const plan = buildCampaignPlan({
    repositoryRoot,
    configuration: configuration(),
  });

  await assert.rejects(runCampaign({
    repositoryRoot,
    plan,
    artifactDirectory: directory,
    acknowledgement: paidExecutionAcknowledgement(plan),
    resolveWorktreeStatus: cleanWorktree,
  }), /Cursor SDK does not expose an enforceable per-run budget cap/);
  assert.equal(fs.readdirSync(directory).length, 0);
});

test('Claude judge runs in an isolated project with ambient integrations disabled', (t) => {
  const directory = temporaryDirectory(t);
  const commandPath = path.join(directory, 'fake-claude');
  const logPath = path.join(directory, 'judge.json');
  fs.writeFileSync(commandPath, `#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
fs.writeFileSync(${JSON.stringify(logPath)}, JSON.stringify({
  args: process.argv.slice(2),
  cwd: process.cwd(),
  environment: {
    autoMemory: process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY,
    connectors: process.env.ENABLE_CLAUDEAI_MCP_SERVERS,
    hasClaudeCode: Object.hasOwn(process.env, 'CLAUDECODE'),
  },
  input: fs.readFileSync(0, 'utf8'),
}));
process.stdout.write(JSON.stringify({
  structured_output: { accepted: true },
  duration_ms: 1,
  total_cost_usd: 0,
}));
`, { mode: 0o755 });
  const result = createClaudeCodeJudge({ command: commandPath }).judge({
    model: 'claude-opus-4-1-20250805',
    timeout_ms: 1000,
    budget_usd: 0.01,
    payload: { candidates: { A: 'untrusted', B: 'untrusted' } },
    schema: {
      type: 'object',
      properties: { accepted: { type: 'boolean' } },
      required: ['accepted'],
    },
  });
  const observation = JSON.parse(fs.readFileSync(logPath, 'utf8'));

  assert.deepEqual(result.judgment, { accepted: true });
  assert.notEqual(observation.cwd, repositoryRoot);
  assert.equal(fs.existsSync(observation.cwd), false);
  assert.deepEqual(observation.environment, {
    autoMemory: '1',
    connectors: 'false',
    hasClaudeCode: false,
  });
  assert.ok(observation.args.includes('--strict-mcp-config'));
  assert.ok(observation.args.includes('--no-chrome'));
  assert.deepEqual(
    observation.args.slice(
      observation.args.indexOf('--setting-sources'),
      observation.args.indexOf('--setting-sources') + 2,
    ),
    ['--setting-sources', 'project'],
  );
  assert.match(
    observation.args[observation.args.indexOf('--system-prompt') + 1],
    /untrusted data/,
  );
});

test('fake execution expands mixed ordinary evidence and replays offline', async (t) => {
  const directory = temporaryDirectory(t);
  const plan = buildCampaignPlan({
    repositoryRoot,
    configuration: configuration(),
  });
  const manifest = plan.manifests.find(({ definition, cell }) => (
    definition.scope === 'to-humans-outcome'
    && cell.host === 'claude-code'
    && cell.tier === 'ordinary'
  ));
  let adapters = 0;
  let judges = 0;
  const index = await runCampaign({
    repositoryRoot,
    plan,
    artifactDirectory: directory,
    acknowledgement: paidExecutionAcknowledgement(plan),
    resolveWorktreeStatus: cleanWorktree,
    manifestFingerprints: [manifest.fingerprint],
    createAdapter() {
      adapters += 1;
      return defineProductionAdapter({
        name: 'fake-adoption-host',
        execute: fakeResult,
      });
    },
    createJudge() {
      judges += 1;
      return fakeJudge([true, false, true, true, true]);
    },
  });

  assert.equal(index.complete, false);
  assert.equal(adapters, 1);
  assert.equal(judges, 1);
  assert.equal(index.entries[0].cases[0].phases.length, 2);
  assert.deepEqual(
    index.entries[0].cases[0].phases.map(({ repetitions }) => repetitions),
    [3, 2],
  );

  let forbiddenCalls = 0;
  const replayed = replayCampaignArtifacts({
    repositoryRoot,
    plan,
    artifactDirectory: directory,
    requireComplete: false,
    createAdapter() {
      forbiddenCalls += 1;
    },
    createJudge() {
      forbiddenCalls += 1;
    },
  });
  assert.equal(forbiddenCalls, 0);
  assert.equal(replayed.fragments.length, 1);
  assert.equal(replayed.fragments[0].cases[0].repetition_class, 'mixed');
  assert.equal(replayed.fragments[0].cases[0].repetitions, 5);
  assert.equal(replayed.fragments[0].cases[0].passed, true);
});

test('campaign retains validated fixture provenance for every execution arm', async (t) => {
  const directory = temporaryDirectory(t);
  const plan = buildCampaignPlan({
    repositoryRoot,
    configuration: configuration(),
  });
  const manifest = plan.manifests.find(({ definition, cell }) => (
    definition.scope === 'code-review-outcome'
    && cell.host === 'claude-code'
    && cell.tier === 'ordinary'
  ));
  const observedFixtures = [];
  const index = await runCampaign({
    repositoryRoot,
    plan,
    artifactDirectory: directory,
    acknowledgement: paidExecutionAcknowledgement(plan),
    resolveWorktreeStatus: cleanWorktree,
    manifestFingerprints: [manifest.fingerprint],
    createAdapter() {
      return defineProductionAdapter({
        name: 'fixture-observer',
        execute(invocation, context) {
          observedFixtures.push(context.fixtures);
          return fakeResult(invocation, context);
        },
      });
    },
    createJudge() {
      return fakeJudge([true, true, true, true, true]);
    },
  });

  assert.equal(observedFixtures.length, 10);
  assert.ok(observedFixtures.every((fixtures) => fixtures.length === 9));
  const expectedSource = 'test/fixtures/code-review/scenario/requirements.md';
  const retained = observedFixtures[0].find(
    ({ provenance }) => provenance.source === expectedSource,
  );
  assert.equal(retained.destination, expectedSource);
  assert.equal(
    fs.readFileSync(retained.sourcePath, 'utf8'),
    fs.readFileSync(path.join(repositoryRoot, expectedSource), 'utf8'),
  );
  assert.match(retained.provenance.digest, /^[a-f0-9]{64}$/);
  assert.equal(Object.isFrozen(observedFixtures[0]), true);

  const attemptPointer = index.entries[0].cases[0].phases[0]
    .execution_attempts[0];
  const attempt = JSON.parse(fs.readFileSync(
    path.join(directory, attemptPointer.slice('artifact://'.length)),
    'utf8',
  ));
  assert.deepEqual(
    attempt.fixture_provenance,
    observedFixtures[0].map(({ provenance }) => provenance),
  );
  assert.equal(JSON.stringify(attempt).includes(retained.sourcePath), false);
});

test('offline replay rejects unknown execution cost instead of treating it as zero', async (t) => {
  const directory = temporaryDirectory(t);
  const plan = buildCampaignPlan({
    repositoryRoot,
    configuration: configuration(),
  });
  const manifest = plan.manifests.find(({ definition, cell }) => (
    definition.scope === 'to-humans-outcome'
    && cell.host === 'claude-code'
    && cell.tier === 'ordinary'
  ));
  await runCampaign({
    repositoryRoot,
    plan,
    artifactDirectory: directory,
    acknowledgement: paidExecutionAcknowledgement(plan),
    resolveWorktreeStatus: cleanWorktree,
    manifestFingerprints: [manifest.fingerprint],
    createAdapter() {
      return defineProductionAdapter({
        name: 'unknown-cost-host',
        execute(invocation, context) {
          return { ...fakeResult(invocation, context), costUsd: null };
        },
      });
    },
    createJudge() {
      return fakeJudge([true, true, true]);
    },
  });

  assert.throws(() => replayCampaignArtifacts({
    repositoryRoot,
    plan,
    artifactDirectory: directory,
    requireComplete: false,
  }), /execution cost.*incomplete/i);
});

test('offline replay rejects unknown judgment cost', async (t) => {
  const directory = temporaryDirectory(t);
  const plan = buildCampaignPlan({
    repositoryRoot,
    configuration: configuration(),
  });
  const manifest = plan.manifests.find(({ definition, cell }) => (
    definition.scope === 'to-humans-outcome'
    && cell.host === 'claude-code'
    && cell.tier === 'ordinary'
  ));
  const judge = fakeJudge([true, true, true]);
  await runCampaign({
    repositoryRoot,
    plan,
    artifactDirectory: directory,
    acknowledgement: paidExecutionAcknowledgement(plan),
    resolveWorktreeStatus: cleanWorktree,
    manifestFingerprints: [manifest.fingerprint],
    createAdapter() {
      return defineProductionAdapter({
        name: 'known-cost-host',
        execute: fakeResult,
      });
    },
    createJudge() {
      return {
        judge(request) {
          return { ...judge.judge(request), cost_usd: null };
        },
      };
    },
  });

  assert.throws(() => replayCampaignArtifacts({
    repositoryRoot,
    plan,
    artifactDirectory: directory,
    requireComplete: false,
  }), /judgment cost.*incomplete/i);
});

test('full treatment evidence fails closed without observed host discovery', async (t) => {
  const directory = temporaryDirectory(t);
  const plan = buildCampaignPlan({
    repositoryRoot,
    configuration: configuration(),
  });
  const manifest = plan.manifests.find(({ definition, cell }) => (
    definition.scope === 'to-humans-outcome'
    && cell.host === 'cursor'
    && cell.tier === 'ordinary'
  ));
  const index = await runCampaign({
    repositoryRoot,
    plan,
    artifactDirectory: directory,
    acknowledgement: paidExecutionAcknowledgement(plan),
    resolveWorktreeStatus: cleanWorktree,
    manifestFingerprints: [manifest.fingerprint],
    createAdapter() {
      return defineProductionAdapter({
        name: 'fake-undiscovered-host',
        execute(invocation, context) {
          const result = fakeResult(invocation, context);
          result.observations.hostAvailableSkills = null;
          return result;
        },
      });
    },
    createJudge() {
      return fakeJudge([true, true, true]);
    },
  });
  const attemptPointers = index.entries[0].cases[0].phases
    .flatMap(({ execution_attempts: attempts }) => attempts);
  const attempts = attemptPointers.map((pointer) => JSON.parse(
    fs.readFileSync(
      path.join(directory, pointer.slice('artifact://'.length)),
      'utf8',
    ),
  ));

  assert.ok(attempts.some(({ failure }) => (
    failure?.code === 'host-discovery-failed'
  )));
  assert.equal(index.entries[0].cases[0].phases[0].judgments.length, 0);
});

test('a resolved fallback model cannot pass as the configured cell', async (t) => {
  const directory = temporaryDirectory(t);
  const plan = buildCampaignPlan({
    repositoryRoot,
    configuration: configuration(),
  });
  const manifest = plan.manifests.find(({ definition, cell }) => (
    definition.scope === 'to-humans-outcome'
    && cell.host === 'claude-code'
    && cell.tier === 'ordinary'
  ));
  const index = await runCampaign({
    repositoryRoot,
    plan,
    artifactDirectory: directory,
    acknowledgement: paidExecutionAcknowledgement(plan),
    resolveWorktreeStatus: cleanWorktree,
    manifestFingerprints: [manifest.fingerprint],
    createAdapter() {
      return defineProductionAdapter({
        name: 'fake-fallback-model-host',
        execute(invocation, context) {
          const result = fakeResult(invocation, context);
          result.model.resolved = 'fallback-model-1';
          return result;
        },
      });
    },
    createJudge() {
      return fakeJudge([true, true, true]);
    },
  });
  const attemptPointers = index.entries[0].cases[0].phases
    .flatMap(({ execution_attempts: attempts }) => attempts);
  const attempts = attemptPointers.map((pointer) => JSON.parse(
    fs.readFileSync(
      path.join(directory, pointer.slice('artifact://'.length)),
      'utf8',
    ),
  ));

  assert.ok(attempts.some(({ failure }) => (
    failure?.code === 'resolved-model-mismatch'
  )));
  assert.equal(index.entries[0].cases[0].phases[0].judgments.length, 0);
});

test('offline replay rejects stale retained run evidence', async (t) => {
  const directory = temporaryDirectory(t);
  const plan = buildCampaignPlan({
    repositoryRoot,
    configuration: configuration(),
  });
  const manifest = plan.manifests.find(({ definition, cell }) => (
    definition.scope === 'to-humans-outcome'
    && cell.host === 'claude-code'
    && cell.tier === 'ordinary'
  ));
  const index = await runCampaign({
    repositoryRoot,
    plan,
    artifactDirectory: directory,
    acknowledgement: paidExecutionAcknowledgement(plan),
    resolveWorktreeStatus: cleanWorktree,
    manifestFingerprints: [manifest.fingerprint],
    createAdapter() {
      return defineProductionAdapter({
        name: 'fake-stale-host',
        execute: fakeResult,
      });
    },
    createJudge() {
      return fakeJudge([true, true, true]);
    },
  });
  const runPointer = index.entries[0].cases[0].phases[0].runs[0];
  const runPath = path.join(
    directory,
    runPointer.slice('artifact://'.length),
  );
  const stale = JSON.parse(fs.readFileSync(runPath, 'utf8'));
  stale.execution.output = 'tampered';
  writeJson(runPath, stale);

  assert.throws(() => replayCampaignArtifacts({
    repositoryRoot,
    plan,
    artifactDirectory: directory,
    requireComplete: false,
  }), /record fingerprint mismatch|incompatible/);
});

test('review packet includes failures, samples, thresholds, and pending decision', (t) => {
  const directory = temporaryDirectory(t);
  const plan = buildCampaignPlan({
    repositoryRoot,
    configuration: configuration(),
  });
  const fragments = passingFragments(plan);
  const failed = fragments.find((fragment) => {
    const manifest = plan.manifests.find(
      ({ fingerprint }) => fingerprint === fragment.manifest_fingerprint,
    );
    return manifest.definition.scope === 'agent-writing-role'
      && manifest.cell.host === 'claude-code'
      && manifest.cell.tier === 'ordinary';
  });
  failed.cases[0].passed = false;
  failed.cases[0].passes = [];
  failed.cases[0].failures = [{
    gate: 'deterministic',
    critical: false,
    evidence_pointer: 'artifact://evidence/failure.json',
  }];
  delete failed.fingerprint;
  failed.fingerprint = fingerprintValue(failed);
  const aggregate = replayCampaignAggregate({
    repositoryRoot,
    plan,
    fragments,
  });

  const packet = buildHumanReviewPacketFromFragments({
    repositoryRoot,
    plan,
    artifactDirectory: directory,
    fragments,
    aggregate,
  });

  assert.equal(packet.human_decision.go_no_go, null);
  assert.equal(
    packet.human_decision.status,
    'pending-human-adjudication',
  );
  assert.equal(packet.review_adoption_checklist.length, 6);
  assert.ok(packet.evidence_index.entries.some(
    ({ kind }) => kind === 'failure',
  ));
  assert.equal(packet.evidence_index.entries.filter(
    ({ kind }) => kind === 'passing-sample',
  ).length, 4);
  assert.equal(packet.planning_thresholds.length, 4);
  assert.ok(packet.executor_sizing.every(
    ({ observations }) => Array.isArray(observations),
  ));
  assert.equal(JSON.stringify(packet).includes('transcript'), false);
});

test('review packet rejects an aggregate that does not match its fragments', (t) => {
  const directory = temporaryDirectory(t);
  const plan = buildCampaignPlan({
    repositoryRoot,
    configuration: configuration(),
  });
  const fragments = passingFragments(plan);
  const aggregate = structuredClone(replayCampaignAggregate({
    repositoryRoot,
    plan,
    fragments,
  }));
  aggregate.passed = !aggregate.passed;
  delete aggregate.fingerprint;
  aggregate.fingerprint = fingerprintValue(aggregate);

  assert.throws(() => buildHumanReviewPacketFromFragments({
    repositoryRoot,
    plan,
    artifactDirectory: directory,
    fragments,
    aggregate,
  }), /aggregate.*fragments/i);
});

test('review packet rejects artifact directories that traverse a symlink', (t) => {
  const outsideDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'adoption-packet-'),
  );
  const artifactDirectoryLink = path.join(
    repositoryRoot,
    '.artifacts',
    `packet-link-${path.basename(outsideDirectory)}`,
  );
  fs.symlinkSync(outsideDirectory, artifactDirectoryLink, 'dir');
  t.after(() => {
    fs.rmSync(artifactDirectoryLink, { force: true });
    fs.rmSync(outsideDirectory, { recursive: true, force: true });
  });
  const plan = buildCampaignPlan({
    repositoryRoot,
    configuration: configuration(),
  });
  const fragments = passingFragments(plan);

  assert.throws(() => buildHumanReviewPacketFromFragments({
    repositoryRoot,
    plan,
    artifactDirectory: artifactDirectoryLink,
    fragments,
  }), /artifactDirectory.*symlink|ignored \.artifacts/i);
  assert.deepEqual(fs.readdirSync(outsideDirectory), []);
});

test('review packet rejects nested artifact symlinks before writing', (t) => {
  const artifactDirectory = temporaryDirectory(t);
  const outsideDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'adoption-packet-'),
  );
  fs.symlinkSync(
    outsideDirectory,
    path.join(artifactDirectory, 'packet'),
    'dir',
  );
  t.after(() => {
    fs.rmSync(outsideDirectory, { recursive: true, force: true });
  });
  const plan = buildCampaignPlan({
    repositoryRoot,
    configuration: configuration(),
  });

  assert.throws(() => buildHumanReviewPacketFromFragments({
    repositoryRoot,
    plan,
    artifactDirectory,
    fragments: passingFragments(plan),
  }), /artifact.*symlink/i);
  assert.deepEqual(fs.readdirSync(outsideDirectory), []);
});

test('review packet never follows an atomic-write temporary symlink', (t) => {
  const artifactDirectory = temporaryDirectory(t);
  const replayDirectory = path.join(artifactDirectory, 'replay');
  fs.mkdirSync(replayDirectory);
  const outsideFile = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'adoption-packet-')),
    'outside.json',
  );
  fs.writeFileSync(outsideFile, 'unchanged\n');
  fs.symlinkSync(
    outsideFile,
    path.join(replayDirectory, `aggregate.json.${process.pid}.tmp`),
  );
  t.after(() => fs.rmSync(
    path.dirname(outsideFile),
    { recursive: true, force: true },
  ));
  const plan = buildCampaignPlan({
    repositoryRoot,
    configuration: configuration(),
  });

  assert.throws(() => buildHumanReviewPacketFromFragments({
    repositoryRoot,
    plan,
    artifactDirectory,
    fragments: passingFragments(plan),
  }), /EEXIST|temporary artifact/i);
  assert.equal(fs.readFileSync(outsideFile, 'utf8'), 'unchanged\n');
});
