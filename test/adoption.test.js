'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const {
  buildCampaignPlan,
  buildHumanReviewPacketIndex,
  loadCanonicalEvaluationDefinitions,
  replayCampaignAggregate,
  validateCampaignConfiguration,
  validateCampaignCoverage,
} = require('../suite/adoption');
const { fingerprintValue } = require('../suite/evaluation');

const repositoryRoot = path.resolve(__dirname, '..');

function campaignConfiguration() {
  return {
    schema_version: 1,
    kind: 'adoption-campaign-configuration',
    candidate: {
      identity: {
        name: 'skills',
        version: '1.0.0',
        stage: 'release-candidate',
      },
      git_revision: 'a'.repeat(40),
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

function replayFragments(plan) {
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
          gate: 'offline-replay',
          evidence_pointer: `evidence://${manifest.id}/${evaluation.id}/pass`,
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
        observed_parallelism: 64,
        suggested_parallelism: 1,
        observed_cost_usd: 0.3,
      },
      provenance: {
        replay_result: `evidence://${manifest.id}/replay.json`,
      },
    };
    fragment.fingerprint = fingerprintValue(fragment);
    return fragment;
  });
}

function clone(value) {
  return structuredClone(value);
}

function reseal(fragment) {
  delete fragment.fingerprint;
  fragment.fingerprint = fingerprintValue(fragment);
}

const plan = buildCampaignPlan({
  repositoryRoot,
  configuration: campaignConfiguration(),
});

test('loads and validates every owner-local definition source', () => {
  const records = loadCanonicalEvaluationDefinitions(repositoryRoot);
  const layerCounts = Object.fromEntries(
    ['role', 'component', 'outcome', 'trigger'].map((layer) => [
      layer,
      records.filter(
        ({ definition }) => definition.evaluation.layer === layer,
      ).length,
    ]),
  );

  assert.equal(records.length, 62);
  assert.deepEqual(layerCounts, {
    role: 19,
    component: 15,
    outcome: 12,
    trigger: 16,
  });
  assert.ok(records.some(({ source, origin }) => (
    source === 'skills/implement/evals/evals.json#role'
    && origin === 'dynamic'
  )));
  assert.ok(records.some(({ source, origin, definition }) => (
    source.endsWith('incident-investigation/evals/evals.json#role')
    && origin === 'derived'
    && definition.evaluation.layer === 'role'
  )));
  assert.ok(records.some(({ source, origin, definition }) => (
    source.endsWith('incident-investigation/evals/evals.json#trigger_evals')
    && origin === 'nested'
    && definition.evals.some(({ id }) => id === 'trigger-ambient')
  )));
});

test('proves complete role, edge, outcome, and trigger-category coverage', () => {
  const coverage = validateCampaignCoverage(repositoryRoot);

  assert.equal(coverage.role_owners.length, 19);
  assert.equal(coverage.component_edges.length, 21);
  assert.equal(coverage.public_outcomes.length, 12);
  for (const category of [
    'positive',
    'negative',
    'ambiguous',
    'canonical_only',
    'private_false_activation',
  ]) {
    assert.ok(coverage.trigger_categories[category].length > 0, category);
  }
});

test('freezes exact campaign identity, models, limits, and policies', () => {
  const configuration = validateCampaignConfiguration(
    repositoryRoot,
    campaignConfiguration(),
  );

  assert.equal(Object.isFrozen(configuration), true);
  assert.equal(Object.isFrozen(configuration.hosts.cursor.frontier), true);
  assert.deepEqual(configuration.repetitions, {
    ordinary: 3,
    mixed: 5,
    critical: 5,
  });

  const aliased = campaignConfiguration();
  aliased.hosts['claude-code'].ordinary.model = 'sonnet';
  assert.throws(
    () => validateCampaignConfiguration(repositoryRoot, aliased),
    /exact non-alias model identifier/,
  );

  const staleIdentity = campaignConfiguration();
  staleIdentity.candidate.git_revision = 'main';
  assert.throws(
    () => validateCampaignConfiguration(repositoryRoot, staleIdentity),
    /exact 40-character revision/,
  );

  const missingPressure = campaignConfiguration();
  missingPressure.critical_cases = [
    'code-review-outcome/nontrivial-ticket-outcome',
  ];
  assert.throws(
    () => validateCampaignConfiguration(repositoryRoot, missingPressure),
    /pressure-and-sensitive-data/,
  );
});

test('builds deterministic per-definition and per-cell manifests', () => {
  const repeated = buildCampaignPlan({
    repositoryRoot,
    configuration: campaignConfiguration(),
  });

  assert.equal(plan.fingerprint, repeated.fingerprint);
  assert.equal(plan.manifests.length, 62 * 4);
  assert.equal(
    new Set(plan.manifests.map(({ fingerprint }) => fingerprint)).size,
    plan.manifests.length,
  );
  assert.ok(plan.manifests.every(({ execution_fingerprint: fingerprint }) => (
    /^[a-f0-9]{64}$/.test(fingerprint)
  )));
  assert.ok(plan.manifests.every(({ execution_configuration: execution }) => (
    execution.settings_precedence === 'inline-and-project-only'
      && /production-v1$/.test(execution.host_adapter)
  )));
  assert.deepEqual(
    new Set(plan.manifests.map(({ cell }) => (
      `${cell.host}/${cell.tier}/${cell.model}`
    ))).size,
    4,
  );
  const critical = plan.manifests.find(
    ({ definition, cell }) => (
      definition.scope === 'code-review-outcome'
      && cell.host === 'claude-code'
      && cell.tier === 'ordinary'
    ),
  ).cases.find(({ id }) => id === 'nontrivial-ticket-outcome');
  assert.equal(critical.critical, true);
  assert.equal(critical.initial_repetitions, 5);

  const trigger = plan.manifests.find(
    ({ definition }) => definition.layer === 'trigger',
  );
  assert.ok(trigger.cases.every(({ critical: value }) => value));
  assert.ok(trigger.cases.every(({ initial_repetitions: value }) => value === 5));
});

test('replays complete fragments and keeps executor sizing non-semantic', () => {
  const fragments = replayFragments(plan);
  const expanded = fragments.find((fragment) => {
    const manifest = plan.manifests.find(
      ({ fingerprint }) => fingerprint === fragment.manifest_fingerprint,
    );
    return manifest.definition.layer === 'role'
      && !manifest.cases[0].critical;
  });
  expanded.cases[0].repetition_class = 'mixed';
  expanded.cases[0].repetitions = 5;
  reseal(expanded);

  const replay = replayCampaignAggregate({
    repositoryRoot,
    plan,
    fragments,
  });

  assert.equal(replay.passed, true);
  assert.equal(replay.critical_failure, false);
  assert.equal(replay.cells.length, 4);
  assert.ok(replay.cells.every(({ passed }) => passed));
  assert.ok(replay.cells.every(({ planning }) => planning.passed));
  assert.ok(replay.cells.every(({ executor_sizing: sizing }) => (
    sizing.some(({ value }) => value.observed_parallelism === 64)
  )));
});

test('rejects missing, duplicate, stale, and mismatched fragments', () => {
  const complete = replayFragments(plan);
  assert.throws(
    () => replayCampaignAggregate({
      repositoryRoot,
      plan,
      fragments: complete.slice(1),
    }),
    /missing replay fragment/,
  );
  assert.throws(
    () => replayCampaignAggregate({
      repositoryRoot,
      plan,
      fragments: [...complete, clone(complete[0])],
    }),
    /duplicate replay fragment/,
  );

  const stale = clone(complete);
  stale[0].campaign_fingerprint = '0'.repeat(64);
  reseal(stale[0]);
  assert.throws(
    () => replayCampaignAggregate({ repositoryRoot, plan, fragments: stale }),
    /stale replay fragment/,
  );

  const mismatched = clone(complete);
  mismatched[0].cell.model = 'other-model-1';
  reseal(mismatched[0]);
  assert.throws(
    () => replayCampaignAggregate({
      repositoryRoot,
      plan,
      fragments: mismatched,
    }),
    /cell mismatch/,
  );
});

test('rejects replay fragments with unknown aggregate cost', () => {
  const fragments = replayFragments(plan);
  delete fragments[0].executor_sizing.observed_cost_usd;
  reseal(fragments[0]);

  assert.throws(() => replayCampaignAggregate({
    repositoryRoot,
    plan,
    fragments,
  }), /observed_cost_usd.*non-negative number/);
});

test('enforces critical and planning thresholds per host/model cell', () => {
  const criticalFragments = replayFragments(plan);
  const criticalFragment = criticalFragments.find((fragment) => {
    const manifest = plan.manifests.find(
      ({ fingerprint }) => fingerprint === fragment.manifest_fingerprint,
    );
    return manifest.definition.scope === 'code-review-outcome'
      && manifest.cell.host === 'cursor'
      && manifest.cell.tier === 'frontier';
  });
  criticalFragment.cases[0].passed = false;
  criticalFragment.cases[0].passes = [];
  criticalFragment.cases[0].failures = [{
    gate: 'critical-seeded-finding',
    critical: true,
    evidence_pointer: 'evidence://critical/failure',
  }];
  reseal(criticalFragment);
  const criticalReplay = replayCampaignAggregate({
    repositoryRoot,
    plan,
    fragments: criticalFragments,
  });
  assert.equal(criticalReplay.passed, false);
  assert.equal(criticalReplay.critical_failure, true);
  assert.equal(
    criticalReplay.cells.filter(({ passed }) => !passed).length,
    1,
  );

  for (const [metric, mutate, expectedGate] of [
    [
      'first pass',
      (semantics) => {
        semantics.candidate.first_pass = [false, false, false];
      },
      'planning-first-pass-loss',
    ],
    [
      'attempts',
      (semantics) => {
        semantics.candidate.attempts = [2, 2, 2];
      },
      'planning-median-attempts-increase',
    ],
    [
      'cost',
      (semantics) => {
        semantics.candidate.cost_usd = [0.3, 0.3, 0.3];
      },
      'planning-median-cost-increase',
    ],
  ]) {
    const fragments = replayFragments(plan);
    for (const fragment of fragments) {
      if (fragment.cell.host === 'claude-code'
        && fragment.cell.tier === 'ordinary'
        && fragment.planning_semantics) {
        fragment.planning_semantics.cases.forEach(mutate);
        reseal(fragment);
      }
    }
    const replay = replayCampaignAggregate({
      repositoryRoot,
      plan,
      fragments,
    });
    const failedCells = replay.cells.filter(({ passed }) => !passed);
    assert.equal(failedCells.length, 1, metric);
    assert.ok(
      failedCells[0].failures.some(({ gate }) => gate === expectedGate),
      metric,
    );
  }
});

test('fails a host and model cell for a diluted critical planning regression', () => {
  const configuration = campaignConfiguration();
  configuration.critical_cases.push(
    'ticket-scope-role/reject-convenience-foundation',
  );
  const criticalPlan = buildCampaignPlan({
    repositoryRoot,
    configuration,
  });
  const fragments = replayFragments(criticalPlan);
  const regressed = fragments.find((fragment) => {
    const manifest = criticalPlan.manifests.find(
      ({ fingerprint }) => fingerprint === fragment.manifest_fingerprint,
    );
    return manifest.definition.scope === 'ticket-scope-role'
      && manifest.cell.host === 'claude-code'
      && manifest.cell.tier === 'ordinary';
  });
  const regressedCase = regressed.planning_semantics.cases.find(
    ({ id }) => id === 'reject-convenience-foundation',
  );
  regressedCase.baseline.first_pass = [
    true,
    true,
    true,
    true,
    true,
  ];
  regressedCase.candidate.first_pass = [
    false,
    true,
    true,
    true,
    true,
  ];
  reseal(regressed);

  const replay = replayCampaignAggregate({
    repositoryRoot,
    plan: criticalPlan,
    fragments,
  });
  const cell = replay.cells.find(({ host, tier }) => (
    host === 'claude-code' && tier === 'ordinary'
  ));
  assert.equal(cell.planning.passed, true);
  assert.equal(cell.passed, false);
  assert.equal(cell.critical_failure, true);
  assert.ok(cell.failures.some(({ selector, critical }) => (
    selector === 'ticket-scope-role/reject-convenience-foundation'
      && critical
  )));
});

test('indexes every failure and the predeclared passing sample by pointer', () => {
  const fragments = replayFragments(plan);
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
    gate: 'deterministic-output',
    critical: false,
    evidence_pointer: 'evidence://agent-writing/failure',
  }];
  reseal(failed);

  const index = buildHumanReviewPacketIndex({
    repositoryRoot,
    plan,
    fragments,
  });
  const failures = index.entries.filter(({ kind }) => kind === 'failure');
  const samples = index.entries.filter(
    ({ kind }) => kind === 'passing-sample',
  );

  assert.equal(failures.length, 1);
  assert.equal(failures[0].provenance_pointers[0], 'evidence://agent-writing/failure');
  assert.equal(samples.length, 4);
  assert.ok(samples.every(({ selector }) => (
    selector === 'to-humans-outcome/complete-human-decision'
  )));
  assert.equal(JSON.stringify(index).includes('transcript'), false);
  assert.equal(index.passing_sample_shortfalls.length, 0);
});
