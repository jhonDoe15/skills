'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  assessReusableEvidence,
  buildAdoptionReport,
  createBlindComparison,
  createCampaignManifest,
  createGraderRegistry,
  createJudgmentEvidence,
  createRunEvidence,
  gradeDeterministicOutput,
  gradeTriggerResult,
  inspectNoSkillContamination,
  replayCampaign,
  replayTriggerCampaign,
  runComponentEvaluation,
  runMatchedEvaluation,
  runTriggerEvaluation,
  validateCampaignManifest,
  validateEvaluationDefinition,
  validateEvaluationSchemas,
  validateJudgmentEvidence,
  validateRunEvidence,
} = require('../suite/evaluation');
const { defineTestAdapter } = require('../suite/testing');

const repositoryRoot = path.resolve(__dirname, '..');
const baseRevision = '65860269897fb826fed8b66009f293ad28bb4731';

function fixtureSkillEvent(name, {
  operation = 'load',
  status = 'succeeded',
  trigger = 'unknown',
  callId,
  eventType = 'fixture.skill-load',
} = {}) {
  return {
    name,
    operation,
    status,
    trigger,
    ...(callId ? { callId } : {}),
    provenance: {
      host: 'fixture',
      mechanism: 'deterministic-fixture',
      eventType,
      observerVersion: 'fixture-v1',
      runId: 'fixture-run',
      statusSource: 'observed',
    },
  };
}

function testDefinition({
  skill = 'incident-investigation',
  scope = skill,
  layer = 'outcome',
} = {}) {
  return {
    skill_name: skill,
    version: 1,
    evaluation: {
      scope,
      layer,
      skill,
      hosts: ['claude-code', 'cursor'],
      arms: layer === 'component'
        ? ['treatment', 'component-ablation']
        : ['no-skill', 'treatment'],
    },
    config: {
      runs_per_configuration: 1,
      executor_model: 'test-model',
      judge_model: 'judge-model',
      minimum_treatment_pass_rate: 1,
      minimum_treatment_win_rate: 1,
      randomization_seed: 'shared-evaluation-test',
    },
    signals: {
      ordered_trace: ['^Frame$', '^Inventory$', '^Map$'],
    },
    global_required_signals: ['ordered_trace'],
    global_order: [['ordered_trace']],
    forbidden_patterns: ['MUTATED'],
    judge: {
      score_range: [0, 2],
      minimum_dimension_score: 1,
      dimensions: [
        {
          id: 'safety',
          description: 'Keeps the evaluation read-only.',
        },
      ],
    },
    evals: [
      {
        id: 1,
        name: 'preserved-incident-behavior',
        prompt: 'Investigate without making changes.',
        expected_output: 'An ordered, read-only investigation.',
        files: [],
        expectations: ['The output stays read-only.'],
        required_signals: [],
        ...(layer === 'component'
          ? { ablated_dependency: 'writing-foundation' }
          : {}),
      },
    ],
  };
}

function normalizedResult({
  skill,
  model,
  output,
  responses = [{ text: output }],
  loadedSkills = [],
  resolvedSkills = loadedSkills,
  packageSkills = resolvedSkills,
  durationMs = 10,
  costUsd = 0.01,
  preExecutionSkills = resolvedSkills,
  preExecutionTruncated = false,
  preExecutionPlugins = [],
  preExecutionRuleSources = [],
  skillEvents = loadedSkills.map((name, index) => fixtureSkillEvent(name, {
    callId: `fixture-load-${index}`,
  })),
}) {
  return {
    status: 'succeeded',
    observations: {
      packageSkills,
      hostAvailableSkills: null,
      preExecutionInventory: {
        skillDefinitions: preExecutionSkills.map((name) => ({
          name,
          path: `.fixture/skills/${name}/SKILL.md`,
          digest: hash(`fixture:${name}`),
        })),
        plugins: preExecutionPlugins,
        ruleSources: preExecutionRuleSources,
        packageDigest: hash(preExecutionSkills),
        truncated: preExecutionTruncated,
      },
      skillEvents,
      routing: {
        requestedSkill: skill,
        resolvedSkills,
      },
      responses,
      artifacts: [],
      toolUses: [],
      attemptedMutations: [],
    },
    failure: null,
    durationMs,
    costUsd,
    model: {
      requested: model,
      resolved: `${model}-resolved`,
    },
  };
}

function createManifest(definition = testDefinition(), overrides = {}) {
  return createCampaignManifest({
    repositoryRoot,
    definition,
    packageRevision: baseRevision,
    cells: [
      { host: 'claude-code', model: 'test-model' },
    ],
    repetitions: 1,
    executionConfiguration: {
      timeout_ms: 1000,
      tools: [],
    },
    limitations: ['Fixture proves shared machinery, not full suite Contract coverage.'],
    ...overrides,
  });
}

function triggerDefinition(caseOverrides = {}) {
  const definition = testDefinition({
    skill: 'agent-writing',
    scope: 'agent-writing-trigger',
    layer: 'trigger',
  });
  definition.evaluation.arms = ['treatment'];
  definition.evals[0] = {
    ...definition.evals[0],
    prompt: 'Create agent-facing instructions.',
    should_trigger: true,
    ...caseOverrides,
  };
  return definition;
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableStringify(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hash(value) {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function ownerGraderRegistration(overrides = {}) {
  return {
    id: 'fixture.clause-aware',
    version: '1',
    implementationDigest: hash('fixture grader artifact v1'),
    configuration: {
      requiredClause: 'OWNER CLAUSE',
    },
    layers: ['role', 'component', 'outcome', 'trigger'],
    arms: ['no-skill', 'treatment', 'component-ablation'],
    grade({ arm, output }) {
      const passed = arm.kind !== 'treatment' || output.includes('OWNER CLAUSE');
      return {
        passed,
        checks: [{
          name: 'owner clause',
          passed,
          details: passed ? 'clause-level fixture evidence' : 'owner clause missing',
        }],
      };
    },
    ...overrides,
  };
}

function ownerGraderRegistry(overrides = {}) {
  return createGraderRegistry({
    graders: [ownerGraderRegistration(overrides)],
  });
}

function declareOwnerGrader(definition, overrides = {}) {
  definition.evaluation.grader = {
    id: 'fixture.clause-aware',
    version: '1',
    ...overrides,
  };
  return definition;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function argumentsForMode(args, mode) {
  return args.map((argument, index) => (
    args[index - 1] === '--mode' ? mode : argument
  ));
}

function reseal(record) {
  const candidate = structuredClone(record);
  delete candidate.fingerprints.record;
  record.fingerprints.record = hash(candidate);
  return record;
}

function asLegacyRunEvidence(record, {
  manifest,
  caseDefinition,
  cell,
  deterministicOverrides = {},
}) {
  const legacy = structuredClone(record);
  delete legacy.grader;
  delete legacy.fingerprints.grading;
  delete legacy.execution.responses;
  Object.assign(legacy.deterministic, deterministicOverrides);
  legacy.fingerprints.input = hash({
    campaign_fingerprint: manifest.fingerprint,
    definition_fingerprint: manifest.definition_fingerprint,
    scope: manifest.scope,
    skill: manifest.skill,
    case: caseDefinition,
    host: cell.host,
    model: cell.model,
    repetition: legacy.repetition,
    arm: legacy.arm,
    package_revision: manifest.package_revision,
    execution_configuration: manifest.execution_configuration,
  });
  return reseal(legacy);
}

function resealManifest(manifest) {
  const candidate = structuredClone(manifest);
  delete candidate.fingerprint;
  manifest.fingerprint = hash(candidate);
  return manifest;
}

function resealLoadAuthority(manifest) {
  const authority = manifest.skill_load_authority;
  const candidate = structuredClone(authority);
  delete candidate.fingerprint;
  authority.fingerprint = hash(candidate);
  return resealManifest(manifest);
}

function resealJudgment(evidence) {
  const candidate = structuredClone(evidence);
  delete candidate.fingerprint;
  evidence.fingerprint = hash(candidate);
  return evidence;
}

function createPackageFixture(t, skillNames) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-evaluation-'));
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));
  fs.mkdirSync(path.join(fixtureRoot, 'suite'), { recursive: true });
  fs.copyFileSync(
    path.join(repositoryRoot, 'suite', 'canonical-suite.json'),
    path.join(fixtureRoot, 'suite', 'canonical-suite.json'),
  );
  for (const name of skillNames) {
    const directory = path.join(fixtureRoot, 'skills', name);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(
      path.join(directory, 'SKILL.md'),
      `---\nname: ${name}\ndescription: Test fixture.\n---\n`,
    );
  }
  return fixtureRoot;
}

test('trigger grading requires exact target lifecycle evidence', () => {
  const definition = triggerDefinition();
  const caseDefinition = definition.evals[0];
  const grade = (result) => gradeTriggerResult({
    definition,
    caseDefinition,
    result,
  });

  assert.equal(grade(normalizedResult({
    skill: 'agent-writing',
    model: 'test-model',
    output: 'Exact target loaded.',
    resolvedSkills: ['writing-foundation', 'agent-writing'],
    loadedSkills: ['agent-writing'],
  })).passed, true);

  for (const loadedSkill of ['to-humans', 'writing-foundation']) {
    const falsePositive = normalizedResult({
      skill: 'agent-writing',
      model: 'test-model',
      output: 'ACTIVATION_SENTINEL',
      resolvedSkills: ['writing-foundation', 'agent-writing'],
      loadedSkills: [loadedSkill],
    });
    falsePositive.observations.toolUses.push({
      name: 'Skill',
      outcome: 'succeeded',
    });
    assert.equal(grade(falsePositive).passed, false, loadedSkill);
  }
});

test('positive trigger grading always requires the exact target load', () => {
  for (const requiredSkillLoads of [[], ['writing-foundation']]) {
    const definition = triggerDefinition({
      required_skill_loads: requiredSkillLoads,
    });
    const grade = gradeTriggerResult({
      definition,
      caseDefinition: definition.evals[0],
      result: normalizedResult({
        skill: 'agent-writing',
        model: 'test-model',
        output: 'Only a dependency loaded.',
        resolvedSkills: ['writing-foundation', 'agent-writing'],
        loadedSkills: ['writing-foundation'],
      }),
    });
    assert.equal(grade.passed, false, JSON.stringify(requiredSkillLoads));
  }

  const definition = triggerDefinition({
    required_skill_loads: ['writing-foundation'],
  });
  assert.equal(gradeTriggerResult({
    definition,
    caseDefinition: definition.evals[0],
    result: normalizedResult({
      skill: 'agent-writing',
      model: 'test-model',
      output: 'Target and dependency loaded.',
      resolvedSkills: ['writing-foundation', 'agent-writing'],
      loadedSkills: ['writing-foundation', 'agent-writing'],
    }),
  }).passed, true);
});

test('trigger definitions require explicit exact-lifecycle expectations', () => {
  const missingExpectation = triggerDefinition();
  delete missingExpectation.evals[0].should_trigger;
  assert.throws(
    () => validateEvaluationDefinition(missingExpectation),
    /should_trigger must be a boolean/,
  );

  const duplicateDependency = triggerDefinition({
    required_skill_loads: ['agent-writing', 'agent-writing'],
  });
  assert.throws(
    () => validateEvaluationDefinition(duplicateDependency),
    /required_skill_loads contains duplicate/,
  );
});

test('negative, canonical, and private trigger grades use exact predicates', () => {
  const negative = triggerDefinition({
    prompt: 'Write ordinary prose.',
    should_trigger: false,
  });
  const negativeGrade = (result) => gradeTriggerResult({
    definition: negative,
    caseDefinition: negative.evals[0],
    result,
  });
  const siblingOnly = normalizedResult({
    skill: 'agent-writing',
    model: 'test-model',
    output: 'Sibling activity remained visible.',
    resolvedSkills: ['writing-foundation', 'agent-writing'],
    loadedSkills: ['to-humans'],
  });
  assert.equal(negativeGrade(siblingOnly).passed, true);
  negative.evals[0].prompt = '/to-humans write ordinary prose.';
  assert.equal(negativeGrade(siblingOnly).passed, true);

  for (const status of ['rejected', 'failed', 'cancelled']) {
    const attemptedTarget = normalizedResult({
      skill: 'agent-writing',
      model: 'test-model',
      output: 'Target did not complete.',
      resolvedSkills: ['writing-foundation', 'agent-writing'],
      skillEvents: [fixtureSkillEvent('agent-writing', {
        operation: status === 'rejected' ? 'select' : 'load',
        status,
        trigger: 'model',
        callId: `target-${status}`,
        eventType: 'fixture.skill-lifecycle',
      })],
    });
    assert.equal(negativeGrade(attemptedTarget).passed, false, status);
  }

  const canonical = triggerDefinition({
    prompt: '/agent-writing create instructions.',
    canonical_invocation: true,
  });
  assert.equal(gradeTriggerResult({
    definition: canonical,
    caseDefinition: canonical.evals[0],
    result: normalizedResult({
      skill: 'agent-writing',
      model: 'test-model',
      output: 'Canonical target loaded.',
      loadedSkills: ['agent-writing'],
    }),
  }).passed, true);
  canonical.evals[0].prompt = '/agent-writing-extra create instructions.';
  assert.equal(gradeTriggerResult({
    definition: canonical,
    caseDefinition: canonical.evals[0],
    result: normalizedResult({
      skill: 'agent-writing',
      model: 'test-model',
      output: 'Wrong command boundary.',
      loadedSkills: ['agent-writing'],
    }),
  }).passed, false);

  const privateEdge = triggerDefinition({
    required_skill_loads: ['agent-writing', 'writing-foundation'],
  });
  assert.equal(gradeTriggerResult({
    definition: privateEdge,
    caseDefinition: privateEdge.evals[0],
    result: normalizedResult({
      skill: 'agent-writing',
      model: 'test-model',
      output: 'Consumer only.',
      resolvedSkills: ['writing-foundation', 'agent-writing'],
      loadedSkills: ['agent-writing'],
    }),
  }).passed, false);
  assert.equal(gradeTriggerResult({
    definition: privateEdge,
    caseDefinition: privateEdge.evals[0],
    result: normalizedResult({
      skill: 'agent-writing',
      model: 'test-model',
      output: 'Consumer and dependency.',
      resolvedSkills: ['writing-foundation', 'agent-writing'],
      loadedSkills: ['agent-writing', 'writing-foundation'],
    }),
  }).passed, true);
});

test('No-Skill contamination checks provisioning and runtime independently', () => {
  const policy = {
    target: 'agent-writing',
    dependencies: ['writing-foundation'],
    aliases: ['legacy-writing'],
    conflictingOwners: ['other-writer'],
  };
  const clean = normalizedResult({
    skill: 'agent-writing',
    model: 'test-model',
    output: 'Control output.',
    packageSkills: [],
    resolvedSkills: [],
    loadedSkills: ['unrelated-skill'],
    preExecutionSkills: ['unrelated-skill'],
  });
  assert.deepEqual(
    inspectNoSkillContamination(clean.observations, policy),
    {
      clean: true,
      inventoryVerifiable: true,
      prohibitedSkills: [
        'agent-writing',
        'writing-foundation',
        'legacy-writing',
        'other-writer',
      ],
      provisioningMatches: [],
      runtimeMatches: [],
    },
  );

  const contradictoryPackage = normalizedResult({
    skill: 'agent-writing',
    model: 'test-model',
    output: 'Contradictory control.',
    packageSkills: ['agent-writing'],
    resolvedSkills: [],
    preExecutionSkills: [],
  });
  assert.equal(
    inspectNoSkillContamination(
      contradictoryPackage.observations,
      policy,
    ).clean,
    false,
  );

  const contradictoryResolution = normalizedResult({
    skill: 'agent-writing',
    model: 'test-model',
    output: 'Contradictory control.',
    packageSkills: [],
    resolvedSkills: ['writing-foundation'],
    preExecutionSkills: [],
  });
  assert.equal(
    inspectNoSkillContamination(
      contradictoryResolution.observations,
      policy,
    ).clean,
    false,
  );

  const truncated = normalizedResult({
    skill: 'agent-writing',
    model: 'test-model',
    output: 'Unverifiable control.',
    packageSkills: [],
    resolvedSkills: [],
    preExecutionSkills: [],
    preExecutionTruncated: true,
  });
  assert.deepEqual(
    inspectNoSkillContamination(truncated.observations, policy),
    {
      clean: false,
      inventoryVerifiable: false,
      prohibitedSkills: [
        'agent-writing',
        'writing-foundation',
        'legacy-writing',
        'other-writer',
      ],
      provisioningMatches: [],
      runtimeMatches: [],
    },
  );

  for (const {
    label,
    plugins = [],
    ruleSources = [],
    expectedClean,
    expectedVerifiable,
    expectedMatch = null,
  } of [
    {
      label: 'target plugin',
      plugins: ['plugin:agent-writing'],
      expectedClean: false,
      expectedVerifiable: true,
      expectedMatch: 'agent-writing',
    },
    {
      label: 'dependency plugin',
      plugins: ['plugin:writing-foundation'],
      expectedClean: false,
      expectedVerifiable: true,
      expectedMatch: 'writing-foundation',
    },
    {
      label: 'conflicting owner plugin',
      plugins: ['plugin:other-writer'],
      expectedClean: false,
      expectedVerifiable: true,
      expectedMatch: 'other-writer',
    },
    {
      label: 'target rule source',
      ruleSources: ['.cursor/rules/agent-writing.mdc'],
      expectedClean: false,
      expectedVerifiable: true,
      expectedMatch: 'agent-writing',
    },
    {
      label: 'unrelated verified source',
      plugins: ['plugin:unrelated-linter'],
      ruleSources: ['.cursor/rules/safety.mdc'],
      expectedClean: true,
      expectedVerifiable: true,
    },
    {
      label: 'unknown source owner',
      plugins: ['plugin:unknown'],
      expectedClean: false,
      expectedVerifiable: false,
    },
    {
      label: 'ambiguous relevant source owner',
      plugins: ['plugin:agent-writing-copy'],
      expectedClean: false,
      expectedVerifiable: false,
    },
  ]) {
    const sourced = normalizedResult({
      skill: 'agent-writing',
      model: 'test-model',
      output: `Control with ${label}.`,
      packageSkills: [],
      resolvedSkills: [],
      preExecutionSkills: [],
      preExecutionPlugins: plugins,
      preExecutionRuleSources: ruleSources,
    });
    const contamination = inspectNoSkillContamination(
      sourced.observations,
      policy,
    );
    assert.equal(contamination.clean, expectedClean, label);
    assert.equal(
      contamination.inventoryVerifiable,
      expectedVerifiable,
      label,
    );
    assert.equal(
      expectedMatch === null
        ? contamination.provisioningMatches.length === 0
        : contamination.provisioningMatches.includes(expectedMatch),
      true,
      label,
    );
  }

  for (const prohibited of [
    'agent-writing',
    'writing-foundation',
    'legacy-writing',
    'other-writer',
  ]) {
    const provisioned = normalizedResult({
      skill: 'agent-writing',
      model: 'test-model',
      output: 'Contaminated control.',
      packageSkills: [],
      resolvedSkills: [],
      preExecutionSkills: [prohibited],
    });
    assert.equal(
      inspectNoSkillContamination(provisioned.observations, policy).clean,
      false,
      `provisioned ${prohibited}`,
    );

    const runtime = normalizedResult({
      skill: 'agent-writing',
      model: 'test-model',
      output: 'Runtime-contaminated control.',
      packageSkills: [],
      resolvedSkills: [],
      loadedSkills: [prohibited],
    });
    assert.equal(
      inspectNoSkillContamination(runtime.observations, policy).clean,
      false,
      `runtime ${prohibited}`,
    );
  }
});

test('trigger replay rejects legacy evidence and lifecycle tampering', async (t) => {
  const definition = triggerDefinition();
  const manifest = createManifest(definition);
  const fixtureRoot = createPackageFixture(
    t,
    ['agent-writing', 'writing-foundation'],
  );
  const record = await runTriggerEvaluation({
    repositoryRoot: fixtureRoot,
    manifest,
    definition,
    caseDefinition: definition.evals[0],
    cell: manifest.cells[0],
    repetition: 1,
    execute() {
      return normalizedResult({
        skill: 'agent-writing',
        model: 'test-model',
        output: 'Exact target lifecycle.',
        packageSkills: ['agent-writing', 'writing-foundation'],
        resolvedSkills: ['writing-foundation', 'agent-writing'],
        loadedSkills: ['agent-writing'],
      });
    },
  });

  assert.equal(record.schema_version, 2);
  assert.deepEqual(record.execution.package_skills, [
    'agent-writing',
    'writing-foundation',
  ]);
  assert.deepEqual(record.execution.routing.resolved_skills, [
    'writing-foundation',
    'agent-writing',
  ]);
  assert.equal(record.execution.skill_events[0].name, 'agent-writing');
  assert.equal(replayTriggerCampaign({
    manifest,
    definition,
    runs: [record],
  }).passed, true);

  const legacy = structuredClone(record);
  legacy.schema_version = 1;
  delete legacy.execution.skill_events;
  reseal(legacy);
  assert.throws(
    () => replayTriggerCampaign({ manifest, definition, runs: [legacy] }),
    /incompatible schema version/,
  );

  const fingerprintTampering = structuredClone(record);
  fingerprintTampering.execution.skill_events[0].name = 'writing-foundation';
  assert.throws(
    () => replayTriggerCampaign({
      manifest,
      definition,
      runs: [fingerprintTampering],
    }),
    /record fingerprint mismatch/,
  );

  const resealedTampering = structuredClone(fingerprintTampering);
  reseal(resealedTampering);
  assert.throws(
    () => replayTriggerCampaign({
      manifest,
      definition,
      runs: [resealedTampering],
    }),
    /trigger grade mismatch/,
  );
});

test('trigger reuse applies positive and negative exact lifecycle predicates', async (t) => {
  const fixtureRoot = createPackageFixture(
    t,
    ['agent-writing', 'writing-foundation'],
  );
  async function retained(caseOverrides, skillEvents) {
    const definition = triggerDefinition(caseOverrides);
    const manifest = createManifest(definition);
    const caseDefinition = definition.evals[0];
    const record = await runTriggerEvaluation({
      repositoryRoot: fixtureRoot,
      manifest,
      definition,
      caseDefinition,
      cell: manifest.cells[0],
      repetition: 1,
      execute() {
        return normalizedResult({
          skill: 'agent-writing',
          model: 'test-model',
          output: 'Retained exact lifecycle evidence.',
          packageSkills: ['agent-writing', 'writing-foundation'],
          resolvedSkills: ['writing-foundation', 'agent-writing'],
          skillEvents,
        });
      },
    });
    return {
      expected: {
        manifest,
        definition,
        caseDefinition,
        cell: manifest.cells[0],
        repetition: 1,
        arm: 'treatment',
      },
      record,
    };
  }

  const positive = await retained({}, [fixtureSkillEvent('agent-writing', {
    trigger: 'model',
    callId: 'positive-target',
  })]);
  assert.equal(
    assessReusableEvidence({ ...positive.expected, record: positive.record }).reusable,
    true,
  );

  const negative = await retained({ should_trigger: false }, []);
  assert.equal(
    assessReusableEvidence({ ...negative.expected, record: negative.record }).reusable,
    true,
  );

  const siblingOnly = await retained({ should_trigger: false }, [
    fixtureSkillEvent('to-humans', {
      trigger: 'model',
      callId: 'sibling-only',
    }),
  ]);
  assert.equal(
    assessReusableEvidence({
      ...siblingOnly.expected,
      record: siblingOnly.record,
    }).reusable,
    true,
  );

  const rejected = await retained({ should_trigger: false }, [
    fixtureSkillEvent('agent-writing', {
      operation: 'select',
      status: 'rejected',
      trigger: 'model',
      callId: 'rejected-target',
      eventType: 'fixture.skill-selection',
    }),
  ]);
  assert.deepEqual(
    assessReusableEvidence({ ...rejected.expected, record: rejected.record }),
    { reusable: false, reason: 'deterministic gate not successful' },
  );
});

test('matched role and outcome cases canonicalize required Skill loads', () => {
  const defaultDefinition = testDefinition();
  const defaultManifest = createManifest(defaultDefinition);
  assert.deepEqual(defaultManifest.cases[0].required_skill_loads, [
    'incident-investigation',
  ]);
  assert.deepEqual(defaultManifest.skill_load_authority.resolved_skills, [
    'incident-investigation',
  ]);

  for (const layer of ['role', 'outcome']) {
    const definition = testDefinition({
      skill: 'skill-writing',
      scope: `skill-writing-${layer}`,
      layer,
    });
    definition.evals[0].required_skill_loads = [
      'skill-writing',
      'agent-writing',
      'writing-foundation',
      'skill-mechanics',
      'skill-evaluation',
    ];
    assert.equal(
      validateEvaluationDefinition(definition, repositoryRoot),
      definition,
    );
    assert.deepEqual(
      createManifest(definition).cases[0].required_skill_loads,
      definition.evals[0].required_skill_loads,
    );
  }

  for (const [requiredSkillLoads, expectedError] of [
    [[], /non-empty array/],
    [['writing-foundation'], /must contain evaluated target "agent-writing"/],
    [
      ['agent-writing', 'writing-foundation', 'writing-foundation'],
      /required_skill_loads contains duplicate/,
    ],
    [['agent-writing', 'Writing-Foundation'], /not canonical/],
  ]) {
    const invalid = testDefinition({
      skill: 'agent-writing',
      scope: 'agent-writing-outcome',
    });
    invalid.evals[0].required_skill_loads = requiredSkillLoads;
    assert.throws(() => validateEvaluationDefinition(invalid), expectedError);
  }
});

test('matched outcome rejects required loads outside the trusted closure', () => {
  const definition = testDefinition({
    skill: 'agent-writing',
    scope: 'agent-writing-outcome',
  });
  definition.evals[0].required_skill_loads = [
    'agent-writing',
    'engineering-guidance',
  ];
  assert.throws(
    () => createManifest(definition),
    /required_skill_loads contains "engineering-guidance" outside trusted canonical closure/,
  );
});

test('matched outcome checks every required load before deterministic grading', async (t) => {
  const definition = testDefinition({
    skill: 'agent-writing',
    scope: 'agent-writing-outcome',
  });
  declareOwnerGrader(definition);
  definition.evals[0].required_skill_loads = [
    'agent-writing',
    'writing-foundation',
  ];
  const manifest = createManifest(definition);
  const fixtureRoot = createPackageFixture(
    t,
    ['agent-writing', 'writing-foundation'],
  );
  let treatmentGrades = 0;
  const graderRegistry = ownerGraderRegistry({
    grade({ arm }) {
      if (arm.kind === 'treatment') treatmentGrades += 1;
      return passingGrade();
    },
  });
  const records = await runMatchedEvaluation({
    repositoryRoot: fixtureRoot,
    manifest,
    definition,
    caseDefinition: definition.evals[0],
    cell: manifest.cells[0],
    repetition: 1,
    async executeArm({ arm }) {
      const treatment = arm === 'treatment';
      return normalizedResult({
        skill: definition.skill_name,
        model: 'test-model',
        output: treatment
          ? 'Frame\nInventory\nMap\nOnly the target loaded.'
          : 'Independent control.',
        loadedSkills: treatment ? ['agent-writing'] : [],
        resolvedSkills: treatment
          ? ['writing-foundation', 'agent-writing']
          : [],
        packageSkills: treatment
          ? ['agent-writing', 'writing-foundation']
          : [],
        preExecutionSkills: treatment
          ? ['writing-foundation', 'agent-writing']
          : [],
      });
    },
    graderRegistry,
  });
  const control = records.find(({ arm }) => arm.kind === 'no-skill');
  const treatment = records.find(({ arm }) => arm.kind === 'treatment');

  assert.equal(treatmentGrades, 0);
  assert.equal(control.execution.control_contamination.clean, true);
  assert.equal(treatment.deterministic.passed, false);
  assert.throws(
    () => createBlindComparison({
      manifest,
      definition,
      caseDefinition: definition.evals[0],
      repetition: 1,
      control,
      treatment,
      judgeModel: 'judge-model',
      graderRegistry,
    }),
    /required Skill load gate failed.*writing-foundation/,
  );
});

test('matched lifecycle gate accepts only exact successful required loads', async (t) => {
  const definition = testDefinition({
    skill: 'agent-writing',
    scope: 'agent-writing-outcome',
  });
  const caseDefinition = definition.evals[0];
  caseDefinition.required_skill_loads = [
    'agent-writing',
    'writing-foundation',
  ];
  const manifest = createManifest(definition);
  const fixtureRoot = createPackageFixture(
    t,
    ['agent-writing', 'writing-foundation'],
  );
  const output = 'Frame\nInventory\nMap\nRead-only investigation.';
  const records = await runMatchedEvaluation({
    repositoryRoot: fixtureRoot,
    manifest,
    definition,
    caseDefinition,
    cell: manifest.cells[0],
    repetition: 1,
    async executeArm({ arm }) {
      const treatment = arm === 'treatment';
      return normalizedResult({
        skill: definition.skill_name,
        model: 'test-model',
        output: treatment ? output : 'Independent control.',
        loadedSkills: treatment
          ? ['agent-writing', 'writing-foundation']
          : [],
        resolvedSkills: treatment
          ? ['writing-foundation', 'agent-writing']
          : [],
        packageSkills: treatment
          ? ['agent-writing', 'writing-foundation']
          : [],
        preExecutionSkills: treatment
          ? ['writing-foundation', 'agent-writing']
          : [],
      });
    },
  });
  const control = records.find(({ arm }) => arm.kind === 'no-skill');
  const validTreatment = records.find(({ arm }) => arm.kind === 'treatment');
  const expected = {
    manifest,
    definition,
    caseDefinition,
    cell: manifest.cells[0],
    repetition: 1,
    arm: 'treatment',
  };
  const treatmentWithEvents = (skillEvents) => createRunEvidence({
    manifest,
    caseDefinition,
    cell: manifest.cells[0],
    repetition: 1,
    arm: 'treatment',
    result: normalizedResult({
      skill: definition.skill_name,
      model: 'test-model',
      output,
      resolvedSkills: ['writing-foundation', 'agent-writing'],
      packageSkills: ['agent-writing', 'writing-foundation'],
      preExecutionSkills: ['writing-foundation', 'agent-writing'],
      skillEvents,
    }),
    deterministicGrade: gradeDeterministicOutput({
      definition,
      caseDefinition,
      output,
    }),
  });

  for (const [label, events] of [
    ['missing dependency', [fixtureSkillEvent('agent-writing')]],
    ['dependency only', [fixtureSkillEvent('writing-foundation')]],
    ['wrong Skill', [
      fixtureSkillEvent('agent-writing'),
      fixtureSkillEvent('skill-mechanics'),
    ]],
    ['unrelated Skill', [fixtureSkillEvent('to-humans')]],
    ...['started', 'failed', 'rejected', 'cancelled', 'unknown'].map((status) => [
      status,
      [
        fixtureSkillEvent('agent-writing'),
        fixtureSkillEvent('writing-foundation', { status }),
      ],
    ]),
  ]) {
    const treatment = treatmentWithEvents(events);
    assert.throws(
      () => createBlindComparison({
        manifest,
        definition,
        caseDefinition,
        repetition: 1,
        control,
        treatment,
        judgeModel: 'judge-model',
      }),
      /required Skill load gate failed/,
      label,
    );
    assert.deepEqual(
      assessReusableEvidence({ ...expected, record: treatment }),
      { reusable: false, reason: 'activation evidence not successful' },
      label,
    );
  }

  const duplicateSuccesses = treatmentWithEvents([
    fixtureSkillEvent('agent-writing', { callId: 'target-1' }),
    fixtureSkillEvent('agent-writing', { callId: 'target-2' }),
    fixtureSkillEvent('writing-foundation', { callId: 'dependency-1' }),
    fixtureSkillEvent('writing-foundation', { callId: 'dependency-2' }),
  ]);
  assert.doesNotThrow(() => createBlindComparison({
    manifest,
    definition,
    caseDefinition,
    repetition: 1,
    control,
    treatment: duplicateSuccesses,
    judgeModel: 'judge-model',
  }));
  assert.deepEqual(
    assessReusableEvidence({ ...expected, record: duplicateSuccesses }),
    { reusable: true, reason: 'complete matching evidence' },
  );

  const missingDependency = treatmentWithEvents([
    fixtureSkillEvent('agent-writing'),
  ]);
  const replay = replayCampaign({
    manifest,
    definition,
    runs: [control, missingDependency],
    judgments: [],
  });
  assert.equal(replay.passed, false);
  assert.equal(replay.failures[0].gate, 'treatment-activation');
  const validComparison = createBlindComparison({
    manifest,
    definition,
    caseDefinition,
    repetition: 1,
    control,
    treatment: validTreatment,
    judgeModel: 'judge-model',
  });
  assert.throws(
    () => replayCampaign({
      manifest,
      definition,
      runs: [control, missingDependency],
      judgments: [createJudgmentEvidence({
        comparison: validComparison,
        definition,
        caseDefinition,
        judgeModel: 'judge-model',
        judgment: structuredJudgment(validComparison),
        durationMs: 5,
        costUsd: 0,
      })],
    }),
    /judgment exists after failed deterministic gate/,
  );
});

test('required-load metadata and lifecycle evidence are fingerprint protected', async (t) => {
  const definition = testDefinition({
    skill: 'agent-writing',
    scope: 'agent-writing-outcome',
  });
  definition.evals[0].required_skill_loads = [
    'agent-writing',
    'writing-foundation',
  ];
  const manifest = createManifest(definition);
  const fixtureRoot = createPackageFixture(
    t,
    ['agent-writing', 'writing-foundation'],
  );
  const records = await runMatchedEvaluation({
    repositoryRoot: fixtureRoot,
    manifest,
    definition,
    caseDefinition: definition.evals[0],
    cell: manifest.cells[0],
    repetition: 1,
    executeArm({ arm }) {
      const treatment = arm === 'treatment';
      return normalizedResult({
        skill: definition.skill_name,
        model: 'test-model',
        output: treatment
          ? 'Frame\nInventory\nMap\nRead-only investigation.'
          : 'Independent control.',
        loadedSkills: treatment
          ? ['agent-writing', 'writing-foundation']
          : [],
        resolvedSkills: treatment
          ? ['writing-foundation', 'agent-writing']
          : [],
        packageSkills: treatment
          ? ['agent-writing', 'writing-foundation']
          : [],
        preExecutionSkills: treatment
          ? ['writing-foundation', 'agent-writing']
          : [],
      });
    },
  });

  const tamperedManifest = structuredClone(manifest);
  tamperedManifest.cases[0].required_skill_loads = ['agent-writing'];
  assert.throws(
    () => validateRunEvidence({
      manifest: tamperedManifest,
      caseDefinition: definition.evals[0],
      cell: manifest.cells[0],
      repetition: 1,
      arm: 'treatment',
      record: records[1],
    }),
    /campaign fingerprint mismatch/,
  );

  resealManifest(tamperedManifest);
  assert.throws(
    () => createBlindComparison({
      manifest: tamperedManifest,
      definition,
      caseDefinition: definition.evals[0],
      repetition: 1,
      control: records[0],
      treatment: records[1],
      judgeModel: 'judge-model',
    }),
    /manifest cases do not match definition/,
  );

  const changedDefinition = structuredClone(definition);
  changedDefinition.evals[0].required_skill_loads = ['agent-writing'];
  assert.throws(
    () => createBlindComparison({
      manifest,
      definition: changedDefinition,
      caseDefinition: changedDefinition.evals[0],
      repetition: 1,
      control: records[0],
      treatment: records[1],
      judgeModel: 'judge-model',
    }),
    /stale definition fingerprint/,
  );

  const tamperedEvidence = structuredClone(records[1]);
  tamperedEvidence.execution.skill_events = [
    fixtureSkillEvent('agent-writing'),
  ];
  assert.throws(
    () => validateRunEvidence({
      manifest,
      caseDefinition: definition.evals[0],
      cell: manifest.cells[0],
      repetition: 1,
      arm: 'treatment',
      record: tamperedEvidence,
    }),
    /record fingerprint mismatch/,
  );
  reseal(tamperedEvidence);
  assert.throws(
    () => createBlindComparison({
      manifest,
      definition,
      caseDefinition: definition.evals[0],
      repetition: 1,
      control: records[0],
      treatment: tamperedEvidence,
      judgeModel: 'judge-model',
    }),
    /required Skill load gate failed.*writing-foundation/,
  );
});

test('matched load authority rejects self-consistent unrelated Skill evidence', () => {
  const validDefinition = testDefinition({
    skill: 'agent-writing',
    scope: 'agent-writing-outcome',
  });
  validDefinition.evals[0].required_skill_loads = [
    'agent-writing',
    'writing-foundation',
  ];
  const validManifest = createManifest(validDefinition);

  const definition = structuredClone(validDefinition);
  definition.evals[0].required_skill_loads = [
    'agent-writing',
    'engineering-guidance',
  ];
  definition.trusted_required_skill_closure = [
    'writing-foundation',
    'engineering-guidance',
    'agent-writing',
  ];
  const manifest = structuredClone(validManifest);
  manifest.definition_fingerprint = hash(definition);
  manifest.cases[0].required_skill_loads = [
    'agent-writing',
    'engineering-guidance',
  ];
  manifest.skill_load_authority = {
    target: 'agent-writing',
    package_revision: manifest.package_revision,
    resolved_skills: [
      'writing-foundation',
      'engineering-guidance',
      'agent-writing',
    ],
    suite_fingerprint: 'f'.repeat(64),
    fingerprint: null,
  };
  resealLoadAuthority(manifest);

  const caseDefinition = definition.evals[0];
  const cell = manifest.cells[0];
  const controlPolicy = {
    target: 'agent-writing',
    dependencies: ['writing-foundation', 'engineering-guidance'],
  };
  const control = createRunEvidence({
    manifest,
    definition,
    caseDefinition,
    cell,
    repetition: 1,
    arm: 'no-skill',
    result: normalizedResult({
      skill: 'agent-writing',
      model: cell.model,
      output: 'Independent control.',
      packageSkills: [],
      resolvedSkills: [],
      preExecutionSkills: [],
      skillEvents: [],
    }),
    deterministicGrade: gradeDeterministicOutput({
      definition,
      caseDefinition,
      output: 'Independent control.',
    }),
    controlPolicy,
  });
  const output = 'Frame\nInventory\nMap\nRead-only investigation.';
  const treatment = createRunEvidence({
    manifest,
    definition,
    caseDefinition,
    cell,
    repetition: 1,
    arm: 'treatment',
    result: normalizedResult({
      skill: 'agent-writing',
      model: cell.model,
      output,
      packageSkills: [
        'agent-writing',
        'writing-foundation',
        'engineering-guidance',
      ],
      resolvedSkills: [
        'writing-foundation',
        'engineering-guidance',
        'agent-writing',
      ],
      preExecutionSkills: [
        'writing-foundation',
        'engineering-guidance',
        'agent-writing',
      ],
      skillEvents: [
        fixtureSkillEvent('agent-writing', { callId: 'target-load' }),
        fixtureSkillEvent('engineering-guidance', {
          callId: 'fabricated-unrelated-load',
        }),
      ],
    }),
    deterministicGrade: gradeDeterministicOutput({
      definition,
      caseDefinition,
      output,
    }),
  });

  assert.throws(
    () => validateEvaluationDefinition(definition),
    /repository context is required for canonical definition validation/,
  );
  assert.throws(
    () => validateEvaluationDefinition(definition, repositoryRoot),
    /outside trusted canonical closure/,
  );
  assert.throws(
    () => validateCampaignManifest(manifest, definition, repositoryRoot),
    /trusted canonical load authority mismatch/,
  );
  assert.throws(
    () => createBlindComparison({
      repositoryRoot,
      manifest,
      definition,
      caseDefinition,
      repetition: 1,
      control,
      treatment,
      judgeModel: 'judge-model',
    }),
    /trusted canonical load authority mismatch/,
  );
  assert.deepEqual(
    assessReusableEvidence({
      repositoryRoot,
      manifest,
      definition,
      caseDefinition,
      cell,
      repetition: 1,
      arm: 'treatment',
      record: treatment,
    }),
    {
      reusable: false,
      reason: 'trusted canonical load authority mismatch',
    },
  );
  assert.throws(
    () => replayCampaign({
      repositoryRoot,
      manifest,
      definition,
      runs: [control, treatment],
      judgments: [],
    }),
    /trusted canonical load authority mismatch/,
  );
});

test('matched load authority rejects stale revision and closure digests', () => {
  const definition = testDefinition({
    skill: 'agent-writing',
    scope: 'agent-writing-outcome',
  });
  definition.evals[0].required_skill_loads = [
    'agent-writing',
    'writing-foundation',
  ];
  assert.equal(
    validateEvaluationDefinition(definition, repositoryRoot),
    definition,
  );
  const manifest = createManifest(definition);
  assert.deepEqual(manifest.skill_load_authority?.resolved_skills, [
    'writing-foundation',
    'agent-writing',
  ]);

  const staleRevision = structuredClone(manifest);
  staleRevision.skill_load_authority.package_revision = 'stale-revision';
  resealLoadAuthority(staleRevision);
  assert.throws(
    () => validateCampaignManifest(staleRevision, definition, repositoryRoot),
    /load authority package revision mismatch/,
  );

  const staleDigest = structuredClone(manifest);
  staleDigest.skill_load_authority.suite_fingerprint = '0'.repeat(64);
  resealLoadAuthority(staleDigest);
  assert.throws(
    () => validateCampaignManifest(staleDigest, definition, repositoryRoot),
    /trusted canonical load authority mismatch/,
  );

  const retainedManifest = structuredClone(manifest);
  assert.throws(
    () => validateCampaignManifest(retainedManifest, definition),
    /repository context is required/,
  );
});

test('rootless matched validation is explicitly structural and target-only', () => {
  const evaluation = require('../suite/evaluation');
  assert.equal(
    typeof evaluation.validateEvaluationDefinitionStructure,
    'function',
  );
  const definition = testDefinition();

  assert.equal(
    evaluation.validateEvaluationDefinitionStructure(definition),
    definition,
  );
  assert.throws(
    () => validateEvaluationDefinition(definition),
    /repository context is required for canonical definition validation/,
  );
  assert.equal(
    validateEvaluationDefinition(definition, repositoryRoot),
    definition,
  );
});

function passingGrade() {
  return {
    passed: true,
    checks: [
      {
        name: 'read-only boundary',
        passed: true,
        details: 'No mutation observed.',
      },
    ],
  };
}

function failingGrade() {
  return {
    passed: false,
    checks: [
      {
        name: 'ordered trace',
        passed: false,
        details: 'Map was missing.',
      },
    ],
  };
}

function baselineGrade() {
  return {
    passed: true,
    checks: [],
    status: 'baseline',
  };
}

function structuredJudgment(comparison) {
  const candidate = {
    expectation_results: [
      {
        text: 'The output stays read-only.',
        passed: true,
        evidence: 'The output names the read-only boundary.',
      },
    ],
    dimensions: {
      safety: 2,
    },
  };
  return {
    winner: comparison.placement.treatment,
    reasoning: 'The treatment follows the declared contract.',
    A: candidate,
    B: candidate,
  };
}

async function passingCampaign(t) {
  const definition = testDefinition();
  const manifest = createManifest(definition);
  const cell = manifest.cells[0];
  const caseDefinition = definition.evals[0];
  const fixtureRoot = createPackageFixture(t, ['incident-investigation']);
  const runs = await runMatchedEvaluation({
    repositoryRoot: fixtureRoot,
    manifest,
    definition,
    caseDefinition,
    cell,
    repetition: 1,
    async executeArm({ arm }) {
      const treatment = arm === 'treatment';
      return normalizedResult({
        skill: definition.skill_name,
        model: cell.model,
        output: treatment
          ? 'Frame\nInventory\nMap\nRead-only investigation.'
          : 'Possible cause.',
        loadedSkills: treatment ? [definition.skill_name] : [],
        packageSkills: treatment ? [definition.skill_name] : [],
      });
    },
  });
  const control = runs.find((run) => run.arm.kind === 'no-skill');
  const treatment = runs.find((run) => run.arm.kind === 'treatment');
  const comparison = createBlindComparison({
    manifest,
    definition,
    caseDefinition,
    repetition: 1,
    control,
    treatment,
    judgeModel: 'judge-model',
  });
  const judgment = createJudgmentEvidence({
    comparison,
    definition,
    caseDefinition,
    judgeModel: 'judge-model',
    judgment: structuredJudgment(comparison),
    durationMs: 5,
    costUsd: 0.02,
  });
  return {
    definition,
    manifest,
    runs,
    comparison,
    judgments: [judgment],
  };
}

test('shared schemas accept the normalized Incident Investigation definition', () => {
  const incidentDefinition = readJson(path.join(
    repositoryRoot,
    'skills',
    'incident-investigation',
    'evals',
    'evals.json',
  ));

  assert.equal(
    validateEvaluationDefinition(incidentDefinition, repositoryRoot),
    incidentDefinition,
  );
  assert.deepEqual(validateEvaluationSchemas(repositoryRoot), {
    definition: true,
    retainedEvidence: true,
  });

  const componentWithoutAblation = testDefinition({
    skill: 'agent-writing',
    scope: 'agent-writing-component',
    layer: 'component',
  });
  delete componentWithoutAblation.evals[0].ablated_dependency;
  assert.throws(
    () => validateEvaluationDefinition(componentWithoutAblation),
    /ablated_dependency/,
  );
});

test('suite-wide generated evaluation outputs stay ignored', () => {
  for (const generatedPath of [
    'skills/example/.eval-results/raw-run.json',
    'suite/.eval-results/adoption-report.md',
    'skills/example/.eval-workspaces/pristine-project/transcript.jsonl',
  ]) {
    const result = spawnSync('git', ['check-ignore', '--quiet', generatedPath], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, `${generatedPath} must be ignored`);
  }
});

test('Incident Investigation static gate consumes shared evaluation contracts', (t) => {
  const resultsDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'incident-static-evaluation-'),
  );
  t.after(() => fs.rmSync(resultsDirectory, { recursive: true, force: true }));
  const result = spawnSync(
    process.execPath,
    [
      'skills/incident-investigation/scripts/run-evals.js',
      '--mode',
      'static',
      '--results-dir',
      resultsDirectory,
      '--json',
    ],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
    },
  );

  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(result.stdout);
  const checkNames = summary.gates[0].checks.map(({ name }) => name);
  assert.equal(summary.passed, true);
  assert.equal(checkNames.includes('shared evaluation definition'), true);
  assert.equal(checkNames.includes('shared retained-evidence schemas'), true);
});

test('Incident behavior runner retains shared evidence and resumes without host calls', (t) => {
  const fixtureRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'incident-behavior-evaluation-'),
  );
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));
  const binDirectory = path.join(fixtureRoot, 'bin');
  const resultsDirectory = path.join(fixtureRoot, 'results');
  const callLog = path.join(fixtureRoot, 'host-calls.log');
  fs.mkdirSync(binDirectory, { recursive: true });
  const fakeClaude = path.join(binDirectory, 'claude');
  fs.writeFileSync(fakeClaude, `#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
fs.appendFileSync(process.env.INCIDENT_EVAL_CALL_LOG, 'called\\n');
const args = process.argv.slice(2);
const schemaIndex = args.indexOf('--json-schema');
if (schemaIndex !== -1) {
  const { createHash } = require('node:crypto');
  const schema = JSON.parse(args[schemaIndex + 1]);
  const expectations = schema.properties.A.properties.expectation_results
    .items.properties.text.enum;
  const dimensions = Object.fromEntries(
    Object.keys(schema.properties.A.properties.dimensions.properties)
      .map((id) => [id, 2]),
  );
  const candidate = {
    expectation_results: expectations.map((text) => ({
      text,
      passed: true,
      evidence: 'The output contains concrete contract evidence.',
    })),
    dimensions,
  };
  const digest = createHash('sha256')
    .update('incident-investigation-v1:1:1')
    .digest();
  const judgment = {
    winner: digest[0] % 2 === 0 ? 'A' : 'B',
    reasoning: 'The treatment satisfies the declared expectations.',
    A: candidate,
    B: candidate,
  };
  console.log(JSON.stringify({
    structured_output: judgment,
    result: JSON.stringify(judgment),
    total_cost_usd: 0.02,
    duration_ms: 4,
    is_error: false,
  }));
  process.exit(0);
}
const available = fs.existsSync(path.join(
  process.cwd(),
  '.claude',
  'skills',
  'incident-investigation',
  'SKILL.md',
));
const prompt = args[args.indexOf('-p') + 1] || '';
const explicitlyInvoked = available
  && prompt.trimStart().startsWith('/incident-investigation');
const triggerProbe = prompt.includes('exact bracketed placeholder');
const settingsIndex = args.indexOf('--settings');
if (explicitlyInvoked && settingsIndex !== -1) {
  const settings = JSON.parse(args[settingsIndex + 1]);
  const observerScript = settings.hooks.UserPromptExpansion[0].hooks[0].args[0];
  spawnSync(process.execPath, [observerScript], {
    input: JSON.stringify({
      session_id: 'incident-explicit-session',
      hook_event_name: 'UserPromptExpansion',
      expansion_type: 'slash_command',
      command_name: 'incident-investigation',
    }),
    env: process.env,
    encoding: 'utf8',
  });
}
const behaviorOutput = [
  '# Phase 1 — Frame',
  'Impact and scope: eu-west checkout errors after deployment.',
  '# Phase 2 — Inventory',
  'Available capabilities: read-only traces, logs, metrics, configuration.',
  '# Phase 3 — Map',
  'Request path: client to checkout to inventory.',
  '# Boundary isolation',
  '- H1 pool contention',
  '- Prediction: affected requests wait before the dependency call.',
  '- Check: compare region and pool telemetry.',
  '- Result: eu-west changed the pool from 20 to 2.',
  '- Hypothesis confidence: root cause likely pending runtime confirmation.',
  'Read-only investigation. Re-zoom from the timeout symptom.',
  '# Causal assessment',
  'Root cause: caller-side pool contention explains the observations.',
  '# Remediation options',
  'The authorized owner may restore the prior setting after confirmation.',
].join('\\n');
const output = triggerProbe
  ? (explicitlyInvoked ? '[untrusted instruction omitted]' : 'No skill invocation.')
  : behaviorOutput;
console.log(JSON.stringify({
  type: 'system',
  subtype: 'init',
  skills: available ? ['incident-investigation'] : [],
  slash_commands: available ? ['incident-investigation'] : [],
  model: 'resolved-test-model',
}));
console.log(JSON.stringify({
  type: 'assistant',
  message: {
    content: [
      ...(explicitlyInvoked ? [{
        type: 'text',
        text: output,
      }] : triggerProbe ? [{
        type: 'tool_use',
        id: 'wrong-sibling-use',
        name: 'Skill',
        input: { skill: 'to-humans' },
      }, {
        type: 'text',
        text: output,
      }] : [{ type: 'text', text: output }]),
    ],
  },
}));
if (triggerProbe && !explicitlyInvoked) {
  console.log(JSON.stringify({
    type: 'user',
    message: {
      content: [{
        type: 'tool_result',
        tool_use_id: 'wrong-sibling-use',
        content: 'Skill loaded',
      }],
    },
  }));
}
console.log(JSON.stringify({
  type: 'result',
  result: output,
  total_cost_usd: 0.01,
  duration_ms: 5,
  is_error: false,
}));
`);
  fs.chmodSync(fakeClaude, 0o755);
  const args = [
    'skills/incident-investigation/scripts/run-evals.js',
    '--mode',
    'behavior',
    '--case',
    '1',
    '--runs',
    '1',
    '--model',
    'test-model',
    '--results-dir',
    resultsDirectory,
    '--json',
  ];
  const environment = {
    ...process.env,
    PATH: `${binDirectory}${path.delimiter}${process.env.PATH}`,
    INCIDENT_EVAL_CALL_LOG: callLog,
  };
  const triggerArgs = [
    'skills/incident-investigation/scripts/run-evals.js',
    '--mode',
    'trigger',
    '--model',
    'test-model',
    '--results-dir',
    resultsDirectory,
    '--json',
  ];
  const triggered = spawnSync(process.execPath, triggerArgs, {
    cwd: repositoryRoot,
    env: environment,
    encoding: 'utf8',
  });
  assert.equal(triggered.status, 0, triggered.stderr);
  const triggerManifest = readJson(
    path.join(resultsDirectory, 'trigger-campaign.json'),
  );
  const triggerDefinition = readJson(
    path.join(resultsDirectory, 'trigger-definition.json'),
  );
  const triggerRuns = triggerDefinition.evals.map(({ id }) => readJson(
    path.join(resultsDirectory, 'triggers', id, 'evidence.json'),
  ));
  const triggerReplay = replayTriggerCampaign({
    manifest: triggerManifest,
    definition: triggerDefinition,
    runs: triggerRuns,
  });
  assert.equal(triggerReplay.passed, true);
  assert.equal(triggerReplay.summary.valid_runs, 2);
  const explicitEvents = triggerRuns[0].execution.skill_events;
  assert.deepEqual(
    explicitEvents.map(({ name, operation, status, trigger }) => (
      [name, operation, status, trigger]
    )),
    [
      ['incident-investigation', 'select', 'succeeded', 'user'],
      ['incident-investigation', 'load', 'succeeded', 'user'],
    ],
  );
  assert.equal(
    explicitEvents[0].provenance.mechanism,
    'user-prompt-expansion',
  );
  assert.deepEqual(
    triggerRuns[1].execution.skill_events.map(({ name, status }) => [name, status]),
    [
      ['to-humans', 'started'],
      ['to-humans', 'started'],
      ['to-humans', 'succeeded'],
    ],
  );

  const first = spawnSync(process.execPath, args, {
    cwd: repositoryRoot,
    env: environment,
    encoding: 'utf8',
  });
  assert.equal(first.status, 0, first.stderr);

  const definition = readJson(path.join(
    repositoryRoot,
    'skills',
    'incident-investigation',
    'evals',
    'evals.json',
  ));
  definition.evals = [definition.evals[0]];
  const manifest = readJson(path.join(resultsDirectory, 'campaign.json'));
  const evalDirectory = path.join(
    resultsDirectory,
    'eval-1-regional-post-deploy-errors',
  );
  const control = readJson(
    path.join(evalDirectory, 'without_skill', 'run-1', 'evidence.json'),
  );
  const treatment = readJson(
    path.join(evalDirectory, 'with_skill', 'run-1', 'evidence.json'),
  );
  const cell = { host: 'claude-code', model: 'test-model' };
  validateRunEvidence({
    manifest,
    caseDefinition: definition.evals[0],
    cell,
    repetition: 1,
    arm: 'no-skill',
    record: control,
  });
  validateRunEvidence({
    manifest,
    caseDefinition: definition.evals[0],
    cell,
    repetition: 1,
    arm: 'treatment',
    record: treatment,
  });
  assert.equal(treatment.model.resolved, 'resolved-test-model');
  assert.equal(treatment.execution.observable_tool_use[0].name, 'Skill');
  assert.equal(treatment.execution.attempted_mutations.length, 0);

  const checkArgs = argumentsForMode(args, 'check');
  const checked = spawnSync(process.execPath, checkArgs, {
    cwd: repositoryRoot,
    env: environment,
    encoding: 'utf8',
  });
  assert.equal(checked.status, 0, checked.stderr);

  const treatmentOutputPath = path.join(
    evalDirectory,
    'with_skill',
    'run-1',
    'output.md',
  );
  const treatmentOutput = fs.readFileSync(treatmentOutputPath, 'utf8');
  fs.writeFileSync(treatmentOutputPath, `${treatmentOutput}tampered\n`);
  const tampered = spawnSync(process.execPath, checkArgs, {
    cwd: repositoryRoot,
    env: environment,
    encoding: 'utf8',
  });
  assert.equal(tampered.status, 1);
  fs.writeFileSync(treatmentOutputPath, treatmentOutput);

  const judgeArgs = argumentsForMode(args, 'judge')
    .concat(['--judge-model', 'judge-model']);
  const judged = spawnSync(process.execPath, judgeArgs, {
    cwd: repositoryRoot,
    env: environment,
    encoding: 'utf8',
  });
  assert.equal(judged.status, 0, judged.stderr);
  const comparison = createBlindComparison({
    repositoryRoot,
    manifest,
    definition,
    caseDefinition: definition.evals[0],
    repetition: 1,
    control,
    treatment,
    judgeModel: 'judge-model',
  });
  const judgment = readJson(
    path.join(evalDirectory, 'judging', 'comparison-1.json'),
  );
  validateJudgmentEvidence({
    evidence: judgment,
    comparison,
    definition,
    caseDefinition: definition.evals[0],
  });

  const reportArgs = argumentsForMode(args, 'report')
    .concat(['--judge-model', 'judge-model']);
  const reported = spawnSync(process.execPath, reportArgs, {
    cwd: repositoryRoot,
    env: environment,
    encoding: 'utf8',
  });
  assert.equal(reported.status, 0, reported.stderr);
  assert.match(
    fs.readFileSync(
      path.join(resultsDirectory, 'adoption-report.md'),
      'utf8',
    ),
    /trigger-explicit, trigger-ambient/,
  );

  const replayArgs = argumentsForMode(args, 'replay')
    .concat(['--judge-model', 'judge-model']);
  const replayed = spawnSync(process.execPath, replayArgs, {
    cwd: repositoryRoot,
    env: environment,
    encoding: 'utf8',
  });
  assert.equal(replayed.status, 0, replayed.stderr);

  for (const [fileName, expectedFailure] of [
    ['trigger-campaign.json', 'missing trigger campaign manifest'],
    ['trigger-definition.json', 'missing trigger evaluation definition'],
  ]) {
    const retainedPath = path.join(resultsDirectory, fileName);
    const retained = fs.readFileSync(retainedPath, 'utf8');
    fs.rmSync(retainedPath);
    const missingTriggerInput = spawnSync(process.execPath, replayArgs, {
      cwd: repositoryRoot,
      env: environment,
      encoding: 'utf8',
    });
    assert.equal(missingTriggerInput.status, 1);
    assert.match(missingTriggerInput.stdout, new RegExp(expectedFailure));
    fs.writeFileSync(retainedPath, retained);
  }

  const resumed = spawnSync(process.execPath, [...args, '--resume'], {
    cwd: repositoryRoot,
    env: environment,
    encoding: 'utf8',
  });
  assert.equal(resumed.status, 0, resumed.stderr);
  assert.equal(
    fs.readFileSync(callLog, 'utf8').trim().split(/\r?\n/).length,
    5,
  );

  const missingEvidencePath = path.join(
    evalDirectory,
    'with_skill',
    'run-1',
    'evidence.json',
  );
  fs.rmSync(missingEvidencePath);
  const resumedWithoutEvidence = spawnSync(
    process.execPath,
    [...args, '--resume'],
    {
      cwd: repositoryRoot,
      env: environment,
      encoding: 'utf8',
    },
  );
  assert.equal(resumedWithoutEvidence.status, 0, resumedWithoutEvidence.stderr);
  assert.equal(
    readJson(path.join(
      evalDirectory,
      'with_skill',
      'run-1',
      'execution.json',
    )).resume_reason,
    'evidence missing',
  );
  assert.equal(
    fs.readFileSync(callLog, 'utf8').trim().split(/\r?\n/).length,
    6,
  );
});

test('Incident runner retains wrong-Skill and timeout lifecycle evidence', (t) => {
  const fixtureRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'incident-failure-evaluation-'),
  );
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));
  const isolatedRepositoryRoot = path.join(fixtureRoot, 'repository');
  fs.mkdirSync(isolatedRepositoryRoot);
  for (const entry of ['skills', 'suite', '.claude-plugin', 'README.md']) {
    fs.cpSync(
      path.join(repositoryRoot, entry),
      path.join(isolatedRepositoryRoot, entry),
      { recursive: true },
    );
  }
  spawnSync('git', ['init', '--quiet'], { cwd: isolatedRepositoryRoot });
  const fixtureCommit = spawnSync('git', [
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '--allow-empty',
    '--quiet',
    '-m',
    'fixture',
  ], {
    cwd: isolatedRepositoryRoot,
    encoding: 'utf8',
  });
  assert.equal(fixtureCommit.status, 0, fixtureCommit.stderr);
  const binDirectory = path.join(fixtureRoot, 'bin');
  fs.mkdirSync(binDirectory, { recursive: true });
  const fakeClaude = path.join(binDirectory, 'claude');
  fs.writeFileSync(fakeClaude, `#!/usr/bin/env node
'use strict';
const { spawnSync } = require('node:child_process');
const args = process.argv.slice(2);
const mode = process.env.INCIDENT_LIFECYCLE_FIXTURE;
const settings = JSON.parse(args[args.indexOf('--settings') + 1]);
const observerScript = settings.hooks.PreToolUse[0].hooks[0].args[0];
const target = mode === 'timeout' ? 'incident-investigation' : 'to-humans';
spawnSync(process.execPath, [observerScript], {
  input: JSON.stringify({
    session_id: 'incident-failure-session',
    hook_event_name: 'PreToolUse',
    tool_name: 'Skill',
    tool_input: { skill: target },
    tool_use_id: mode + '-call',
  }),
  env: process.env,
  encoding: 'utf8',
});
console.log(JSON.stringify({
  type: 'system',
  subtype: 'init',
  skills: ['incident-investigation'],
  slash_commands: ['incident-investigation'],
  model: 'resolved-test-model',
}));
if (mode === 'timeout') {
  setTimeout(() => {}, 5000);
} else {
  console.error('fixture process failure');
  process.exit(2);
}
`);
  fs.chmodSync(fakeClaude, 0o755);

  const definitionPath = path.join(
    isolatedRepositoryRoot,
    'skills',
    'incident-investigation',
    'evals',
    'evals.json',
  );
  const definition = readJson(definitionPath);
  definition.config.timeout_ms = 2000;
  definition.config.max_executor_attempts = 1;
  fs.writeFileSync(definitionPath, `${JSON.stringify(definition, null, 2)}\n`);

  for (const mode of ['failure', 'timeout']) {
    const resultsDirectory = path.join(fixtureRoot, mode);
    const result = spawnSync(process.execPath, [
      'skills/incident-investigation/scripts/run-evals.js',
      '--mode',
      'trigger',
      '--model',
      'test-model',
      '--results-dir',
      resultsDirectory,
      '--json',
    ], {
      cwd: isolatedRepositoryRoot,
      env: {
        ...process.env,
        PATH: `${binDirectory}${path.delimiter}${process.env.PATH}`,
        INCIDENT_LIFECYCLE_FIXTURE: mode,
      },
      encoding: 'utf8',
    });
    assert.equal(result.status, 1, result.stderr);
    const evidence = readJson(path.join(
      resultsDirectory,
      'triggers',
      'trigger-explicit',
      'evidence.json',
    ));
    const statuses = evidence.execution.skill_events.map((event) => [
      event.name,
      event.operation,
      event.status,
    ]);
    assert.deepEqual(
      statuses,
      mode === 'timeout'
        ? [
          ['incident-investigation', 'select', 'started'],
          ['incident-investigation', 'load', 'started'],
          ['incident-investigation', 'load', 'cancelled'],
        ]
        : [
          ['to-humans', 'select', 'started'],
          ['to-humans', 'load', 'started'],
          ['to-humans', 'load', 'unknown'],
        ],
    );
  }
});

test('matched evaluation checks package closure before executing either arm', async (t) => {
  const fixtureRoot = createPackageFixture(t, ['implement']);
  const definition = testDefinition({ skill: 'implement', scope: 'implement' });
  const manifest = createManifest(definition);
  let executions = 0;

  await assert.rejects(
    runMatchedEvaluation({
      repositoryRoot: fixtureRoot,
      manifest,
      definition,
      caseDefinition: definition.evals[0],
      cell: manifest.cells[0],
      repetition: 1,
      async executeArm() {
        executions += 1;
        throw new Error('must not execute');
      },
    }),
    /Missing internal dependency "engineering-guidance"/,
  );
  assert.equal(executions, 0);
});

test('matched arms retain the same frozen scenario and execution configuration', async (t) => {
  const definition = testDefinition();
  const manifest = createManifest(definition);
  const observed = [];
  const fixtureRoot = createPackageFixture(t, ['incident-investigation']);

  const runs = await runMatchedEvaluation({
    repositoryRoot: fixtureRoot,
    manifest,
    definition,
    caseDefinition: definition.evals[0],
    cell: manifest.cells[0],
    repetition: 1,
    async executeArm(context) {
      observed.push(context);
      return normalizedResult({
        skill: definition.skill_name,
        model: context.cell.model,
        output: context.arm === 'treatment'
          ? 'Frame\nInventory\nMap\nRead-only investigation.'
          : 'Possible cause.',
        loadedSkills: context.arm === 'treatment'
          ? [definition.skill_name]
          : [],
        packageSkills: context.arm === 'treatment'
          ? [definition.skill_name]
          : [],
      });
    },
  });

  assert.deepEqual(observed.map(({ arm }) => arm), ['no-skill', 'treatment']);
  assert.strictEqual(observed[0].caseDefinition, observed[1].caseDefinition);
  assert.strictEqual(
    observed[0].executionConfiguration,
    observed[1].executionConfiguration,
  );
  assert.notStrictEqual(observed[0].provisioning, observed[1].provisioning);
  assert.deepEqual(observed[0].provisioning.installedSkills, []);
  assert.deepEqual(
    observed[1].provisioning.installedSkills,
    ['incident-investigation'],
  );
  assert.deepEqual(observed[0].provisioning.packageDefinition.skills, []);
  assert.deepEqual(
    observed[1].provisioning.packageDefinition.skills.map(({ name }) => name),
    ['incident-investigation'],
  );
  assert.throws(() => observed[0].executionConfiguration.tools.push('write'), TypeError);
  assert.equal(runs.length, 2);
  assert.equal(runs[0].arm.pairing_id, runs[1].arm.pairing_id);
  assert.deepEqual(
    runs.map((run) => run.arm.kind),
    ['no-skill', 'treatment'],
  );
  for (const run of runs) {
    assert.equal(run.host, 'claude-code');
    assert.equal(run.model.requested, 'test-model');
    assert.equal(run.model.resolved, 'test-model-resolved');
    assert.equal(run.package_revision, baseRevision);
    assert.equal(run.execution.status, 'succeeded');
    assert.equal(run.execution.observable_tool_use.length, 0);
    assert.equal(run.execution.attempted_mutations.length, 0);
    assert.match(run.fingerprints.input, /^[a-f0-9]{64}$/);
    assert.match(run.fingerprints.output, /^[a-f0-9]{64}$/);
    assert.match(run.fingerprints.record, /^[a-f0-9]{64}$/);
  }
});

test('No-Skill control construction is independent of treatment activation', async (t) => {
  const definition = testDefinition();
  const manifest = createManifest(definition);
  const fixtureRoot = createPackageFixture(t, ['incident-investigation']);
  const records = await runMatchedEvaluation({
    repositoryRoot: fixtureRoot,
    manifest,
    definition,
    caseDefinition: definition.evals[0],
    cell: manifest.cells[0],
    repetition: 1,
    executeArm({ arm, provisioning }) {
      return normalizedResult({
        skill: definition.skill_name,
        model: 'test-model',
        output: arm === 'treatment'
          ? 'Treatment failed to activate.'
          : 'Clean independently provisioned control.',
        packageSkills: provisioning.installedSkills,
        resolvedSkills: provisioning.installedSkills,
        preExecutionSkills: provisioning.installedSkills,
        loadedSkills: [],
      });
    },
  });

  const control = records.find(({ arm }) => arm.kind === 'no-skill');
  const treatment = records.find(({ arm }) => arm.kind === 'treatment');
  assert.equal(control.execution.control_contamination.clean, true);
  assert.deepEqual(control.execution.pre_execution_inventory.skill_definitions, []);
  assert.throws(
    () => createBlindComparison({
      manifest,
      definition,
      caseDefinition: definition.evals[0],
      repetition: 1,
      control,
      treatment,
      judgeModel: 'judge-model',
    }),
    /treatment activation gate failed/,
  );
});

test('the normalized Incident scenario runs unchanged through both host cells', async (t) => {
  const definition = testDefinition();
  const manifest = createManifest(definition, {
    cells: [
      { host: 'claude-code', model: 'claude-test-model' },
      { host: 'cursor', model: 'cursor-test-model' },
    ],
  });
  const fixtureRoot = createPackageFixture(t, ['incident-investigation']);
  const records = [];

  for (const cell of manifest.cells) {
    records.push(...await runMatchedEvaluation({
      repositoryRoot: fixtureRoot,
      manifest,
      definition,
      caseDefinition: definition.evals[0],
      cell,
      repetition: 1,
      async executeArm({ arm }) {
        return normalizedResult({
          skill: definition.skill_name,
          model: cell.model,
          output: arm === 'treatment'
            ? 'Frame\nInventory\nMap\nRead-only investigation.'
            : 'Possible cause.',
          loadedSkills: arm === 'treatment' ? [definition.skill_name] : [],
          packageSkills: arm === 'treatment' ? [definition.skill_name] : [],
        });
      },
    }));
  }

  assert.deepEqual(
    records.map(({ host, model, arm }) => [
      host,
      model.requested,
      arm.kind,
    ]),
    [
      ['claude-code', 'claude-test-model', 'no-skill'],
      ['claude-code', 'claude-test-model', 'treatment'],
      ['cursor', 'cursor-test-model', 'no-skill'],
      ['cursor', 'cursor-test-model', 'treatment'],
    ],
  );
});

test('component evaluation pairs complete and ablated consumers for offline replay', async (t) => {
  const completeRoot = createPackageFixture(
    t,
    ['agent-writing', 'writing-foundation'],
  );
  const definition = testDefinition({
    skill: 'agent-writing',
    scope: 'agent-writing-to-writing-foundation',
    layer: 'component',
  });
  const manifest = createManifest(definition);
  assert.equal(
    manifest.cases[0].ablated_dependency,
    definition.evals[0].ablated_dependency,
  );
  let adapterExecutions = 0;
  const adapter = defineTestAdapter({
    name: 'component-evaluation',
    async execute(invocation, context) {
      adapterExecutions += 1;
      return normalizedResult({
        skill: invocation.skill,
        model: invocation.model,
        output: 'Frame\nInventory\nMap\nRead-only investigation.',
        loadedSkills: context.resolvedSkills,
        packageSkills: context.packageSkills,
      });
    },
  });

  const evidence = await runComponentEvaluation({
    repositoryRoot: completeRoot,
    manifest,
    definition,
    caseDefinition: definition.evals[0],
    cell: manifest.cells[0],
    repetition: 1,
    adapter,
  });

  assert.equal(adapterExecutions, 2);
  assert.deepEqual(
    evidence.map(({ arm }) => arm.kind),
    ['treatment', 'component-ablation'],
  );
  const complete = evidence[0];
  const ablated = evidence[1];
  assert.equal(complete.arm.pairing_id, ablated.arm.pairing_id);
  assert.deepEqual(ablated.arm, {
    kind: 'component-ablation',
    pairing_id: complete.arm.pairing_id,
    ablated_dependency: 'writing-foundation',
  });
  assert.equal(
    complete.execution.routing.resolved_skills.includes('writing-foundation'),
    true,
  );
  assert.deepEqual(ablated.execution.routing.resolved_skills, ['agent-writing']);

  const comparison = createBlindComparison({
    manifest,
    definition,
    caseDefinition: definition.evals[0],
    repetition: 1,
    control: ablated,
    treatment: complete,
    judgeModel: 'judge-model',
  });
  const judgment = createJudgmentEvidence({
    comparison,
    definition,
    caseDefinition: definition.evals[0],
    judgeModel: 'judge-model',
    judgment: structuredJudgment(comparison),
    durationMs: 5,
    costUsd: 0.02,
  });
  const replay = replayCampaign({
    manifest,
    definition,
    runs: evidence,
    judgments: [judgment],
  });
  assert.equal(replay.passed, true);
  assert.equal(replay.summary.expected_runs, 2);

  const wrongDependency = structuredClone(ablated);
  wrongDependency.arm.ablated_dependency = 'engineering-guidance';
  wrongDependency.fingerprints.input = hash({
    campaign_fingerprint: manifest.fingerprint,
    definition_fingerprint: manifest.definition_fingerprint,
    scope: manifest.scope,
    skill: manifest.skill,
    case: definition.evals[0],
    host: manifest.cells[0].host,
    model: manifest.cells[0].model,
    repetition: 1,
    arm: wrongDependency.arm,
    package_revision: manifest.package_revision,
    execution_configuration: manifest.execution_configuration,
  });
  reseal(wrongDependency);
  assert.throws(
    () => replayCampaign({
      manifest,
      definition,
      runs: [complete, wrongDependency],
      judgments: [judgment],
    }),
    /evaluation arm mismatch/,
  );

  const incompleteRoot = createPackageFixture(t, ['agent-writing']);
  await assert.rejects(
    runComponentEvaluation({
      repositoryRoot: incompleteRoot,
      manifest,
      definition,
      caseDefinition: definition.evals[0],
      cell: manifest.cells[0],
      repetition: 1,
      adapter,
    }),
    /Missing internal dependency "writing-foundation"/,
  );
  assert.equal(adapterExecutions, 2);
});

test('component Adoption report counts the dependency-ablated control', () => {
  const definition = testDefinition({
    skill: 'agent-writing',
    scope: 'agent-writing-to-writing-foundation',
    layer: 'component',
  });
  const manifest = createManifest(definition);
  const caseDefinition = definition.evals[0];
  const cell = manifest.cells[0];
  const completeOutput = 'Frame\nInventory\nMap\nRead-only investigation.';
  const ablatedOutput = `${completeOutput}\nCOMPONENT_RAW_SENTINEL`;
  const complete = createRunEvidence({
    manifest,
    caseDefinition,
    cell,
    repetition: 1,
    arm: 'treatment',
    result: normalizedResult({
      skill: definition.skill_name,
      model: cell.model,
      output: completeOutput,
      loadedSkills: ['writing-foundation', 'agent-writing'],
    }),
    deterministicGrade: gradeDeterministicOutput({
      definition,
      caseDefinition,
      output: completeOutput,
    }),
  });
  const ablated = createRunEvidence({
    manifest,
    caseDefinition,
    cell,
    repetition: 1,
    arm: {
      kind: 'component-ablation',
      ablated_dependency: 'writing-foundation',
    },
    result: normalizedResult({
      skill: definition.skill_name,
      model: cell.model,
      output: ablatedOutput,
      loadedSkills: ['agent-writing'],
    }),
    deterministicGrade: gradeDeterministicOutput({
      definition,
      caseDefinition,
      output: ablatedOutput,
    }),
  });
  const comparison = createBlindComparison({
    manifest,
    definition,
    caseDefinition,
    repetition: 1,
    control: ablated,
    treatment: complete,
    judgeModel: 'judge-model',
  });
  const judgment = createJudgmentEvidence({
    comparison,
    definition,
    caseDefinition,
    judgeModel: 'judge-model',
    judgment: structuredJudgment(comparison),
    durationMs: 5,
    costUsd: 0.02,
  });
  const runs = [complete, ablated];
  const judgments = [judgment];
  const replay = replayCampaign({
    manifest,
    definition,
    runs,
    judgments,
  });
  const report = buildAdoptionReport({
    manifest,
    definition,
    replay,
    runs,
    judgments,
  });

  assert.match(report, /Complete consumer outcomes: 1\/1 succeeded/);
  assert.match(report, /Dependency-ablated control outcomes: 1\/1 succeeded/);
  assert.match(report, /Ablated dependency: writing-foundation/);
  assert.match(report, /Complete consumer cost \(USD\): 0\.01/);
  assert.match(report, /Dependency-ablated control cost \(USD\): 0\.01/);
  assert.match(report, /Total cost \(USD\): 0\.04/);
  assert.match(report, new RegExp(ablated.fingerprints.record));
  assert.doesNotMatch(report, /COMPONENT_RAW_SENTINEL/);
});

test('blind comparison is seeded, untrusted, and blocked by a failed lower gate', async (t) => {
  const campaign = await passingCampaign(t);
  const repeated = createBlindComparison({
    manifest: campaign.manifest,
    definition: campaign.definition,
    caseDefinition: campaign.definition.evals[0],
    repetition: 1,
    control: campaign.runs[0],
    treatment: campaign.runs[1],
    judgeModel: 'judge-model',
  });

  assert.deepEqual(repeated.placement, campaign.comparison.placement);
  assert.equal(repeated.payload.candidates.A.untrusted_data, true);
  assert.equal(repeated.payload.candidates.B.untrusted_data, true);
  assert.deepEqual(
    repeated.payload.rubric.dimensions,
    campaign.definition.judge.dimensions,
  );

  const failedTreatment = createRunEvidence({
    manifest: campaign.manifest,
    caseDefinition: campaign.definition.evals[0],
    cell: campaign.manifest.cells[0],
    repetition: 1,
    arm: 'treatment',
    result: normalizedResult({
      skill: campaign.definition.skill_name,
      model: 'test-model',
      output: 'Incomplete trace.',
      loadedSkills: [campaign.definition.skill_name],
    }),
    deterministicGrade: gradeDeterministicOutput({
      definition: campaign.definition,
      caseDefinition: campaign.definition.evals[0],
      output: 'Incomplete trace.',
    }),
  });
  assert.throws(
    () => createBlindComparison({
      manifest: campaign.manifest,
      definition: campaign.definition,
      caseDefinition: campaign.definition.evals[0],
      repetition: 1,
      control: campaign.runs[0],
      treatment: failedTreatment,
      judgeModel: 'judge-model',
    }),
    /deterministic gate failed/,
  );
});

test('offline replay reconstructs the Incident tracer without host or model calls', async (t) => {
  const campaign = await passingCampaign(t);
  const replay = replayCampaign({
    manifest: campaign.manifest,
    definition: campaign.definition,
    runs: campaign.runs,
    judgments: campaign.judgments,
  });

  assert.equal(replay.passed, true);
  assert.equal(replay.scope, 'incident-investigation');
  assert.equal(replay.summary.expected_runs, 2);
  assert.equal(replay.summary.valid_runs, 2);
  assert.equal(replay.summary.comparisons, 1);
  assert.equal(replay.summary.treatment_win_rate, 1);
  assert.equal(replay.summary.treatment_expectation_pass_rate, 1);
  assert.equal(replay.release_decision, null);
  assert.match(
    replay.coverage,
    /Incident Investigation and shared evaluation machinery only/,
  );
});

test('owner grader evidence remains reusable through lifecycle resolution', async (t) => {
  const definition = declareOwnerGrader(testDefinition());
  definition.signals.ordered_trace = ['^GENERIC-GRADER-CANNOT-MATCH$'];
  const graderRegistry = ownerGraderRegistry();
  const manifest = createManifest(definition);
  const cell = manifest.cells[0];
  const caseDefinition = definition.evals[0];
  const fixtureRoot = createPackageFixture(t, ['incident-investigation']);
  const runs = await runMatchedEvaluation({
    repositoryRoot: fixtureRoot,
    manifest,
    definition,
    caseDefinition,
    cell,
    repetition: 1,
    async executeArm({ arm }) {
      return normalizedResult({
        skill: definition.skill_name,
        model: cell.model,
        output: arm === 'treatment' ? 'OWNER CLAUSE' : 'control',
        loadedSkills: arm === 'treatment' ? [definition.skill_name] : [],
        packageSkills: arm === 'treatment' ? [definition.skill_name] : [],
      });
    },
    graderRegistry,
  });
  const control = runs.find(({ arm }) => arm.kind === 'no-skill');
  const treatment = runs.find(({ arm }) => arm.kind === 'treatment');
  validateRunEvidence({
    manifest,
    caseDefinition,
    cell,
    repetition: 1,
    arm: 'treatment',
    record: treatment,
    graderRegistry,
  });

  assert.deepEqual(
    assessReusableEvidence({
      manifest,
      definition,
      caseDefinition,
      cell,
      repetition: 1,
      arm: 'treatment',
      record: treatment,
      graderRegistry,
    }),
    { reusable: true, reason: 'complete matching evidence' },
  );
  assert.equal(treatment.grader.id, 'fixture.clause-aware');
  assert.equal(treatment.grader.version, '1');
  assert.equal(treatment.grader.fingerprint, treatment.fingerprints.grading);

  const comparison = createBlindComparison({
    manifest,
    definition,
    caseDefinition,
    repetition: 1,
    control,
    treatment,
    judgeModel: 'judge-model',
    graderRegistry,
  });
  const judgment = createJudgmentEvidence({
    comparison,
    definition,
    caseDefinition,
    judgeModel: 'judge-model',
    judgment: structuredJudgment(comparison),
    durationMs: 5,
    costUsd: 0.02,
  });
  const replay = replayCampaign({
    manifest,
    definition,
    runs,
    judgments: [judgment],
    graderRegistry,
  });
  assert.equal(replay.passed, true);
});

test('owner graders retain normalized response boundaries through replay', async (t) => {
  const definition = declareOwnerGrader(testDefinition());
  const manifest = createManifest(definition);
  const cell = manifest.cells[0];
  const caseDefinition = definition.evals[0];
  const fixtureRoot = createPackageFixture(t, ['incident-investigation']);
  const graderRegistry = ownerGraderRegistry({
    implementationDigest: hash('response-boundary grader v1'),
    grade({ arm, result }) {
      const count = result.observations.responses.length;
      const passed = arm.kind !== 'treatment' || count === 2;
      return {
        passed,
        checks: [{
          name: 'response boundaries',
          passed,
          details: `responses=${count}`,
        }],
      };
    },
  });
  const runs = await runMatchedEvaluation({
    repositoryRoot: fixtureRoot,
    manifest,
    definition,
    caseDefinition,
    cell,
    repetition: 1,
    executeArm({ arm }) {
      const treatment = arm === 'treatment';
      return normalizedResult({
        skill: definition.skill_name,
        model: cell.model,
        output: treatment ? 'first\n\nsecond' : 'control',
        responses: treatment
          ? [{ text: 'first' }, { text: 'second' }]
          : [{ text: 'control' }],
        loadedSkills: treatment ? [definition.skill_name] : [],
        packageSkills: treatment ? [definition.skill_name] : [],
      });
    },
    graderRegistry,
  });
  assert.equal(assessReusableEvidence({
    manifest,
    definition,
    caseDefinition,
    cell,
    repetition: 1,
    arm: 'treatment',
    record: runs[1],
    graderRegistry,
  }).reusable, true);
  const comparison = createBlindComparison({
    manifest,
    definition,
    caseDefinition,
    repetition: 1,
    control: runs[0],
    treatment: runs[1],
    judgeModel: 'judge-model',
    graderRegistry,
  });
  const judgment = createJudgmentEvidence({
    comparison,
    definition,
    caseDefinition,
    judgeModel: 'judge-model',
    judgment: structuredJudgment(comparison),
    durationMs: 5,
    costUsd: 0.02,
  });
  assert.equal(replayCampaign({
    manifest,
    definition,
    runs,
    judgments: [judgment],
    graderRegistry,
  }).passed, true);
});

test('grader declarations and trusted registrations reject code-loading inputs', () => {
  assert.doesNotThrow(() => ownerGraderRegistry());
  const registrationWithoutDigest = ownerGraderRegistration();
  delete registrationWithoutDigest.implementationDigest;
  assert.throws(
    () => createGraderRegistry({
      graders: [registrationWithoutDigest],
    }),
    /missing "implementationDigest"/,
  );
  assert.throws(
    () => createGraderRegistry({
      graders: [
        ownerGraderRegistration(),
        ownerGraderRegistration(),
      ],
    }),
    /duplicate deterministic grader/,
  );
  assert.throws(
    () => createGraderRegistry({
      graders: [{
        ...ownerGraderRegistration(),
        implementationFingerprint: hash('caller-claimed-implementation'),
      }],
    }),
    /unsupported field "implementationFingerprint"/,
  );

  for (const grader of [
    {
      id: 'fixture.clause-aware',
      version: '1',
      path: '../../grader.js',
    },
    {
      id: 'fixture.clause-aware',
      version: '1',
      code: 'return { passed: true }',
    },
    {
      id: '../fixture',
      version: '1',
    },
  ]) {
    const definition = testDefinition();
    definition.evaluation.grader = grader;
    assert.throws(
      () => validateEvaluationDefinition(definition),
      /unsupported field|stable grader ID/,
    );
  }

  const injected = testDefinition();
  injected.evaluation.grader_path = '/tmp/grader.js';
  assert.throws(
    () => validateEvaluationDefinition(injected),
    /unsupported field "grader_path"/,
  );
  for (const mutate of [
    (definition) => {
      definition.grader_code = 'return { passed: true }';
    },
    (definition) => {
      definition.evals[0].grader_path = '../../grader.js';
    },
  ]) {
    const embedded = testDefinition();
    mutate(embedded);
    assert.throws(
      () => validateEvaluationDefinition(embedded),
      /unsupported grader control/,
    );
  }
});

test('execution rejects deprecated owner-supplied grader callbacks', async () => {
  const matchedDefinition = testDefinition();
  const matchedManifest = createManifest(matchedDefinition);
  await assert.rejects(
    runMatchedEvaluation({
      repositoryRoot: '/unused',
      manifest: matchedManifest,
      definition: matchedDefinition,
      caseDefinition: matchedDefinition.evals[0],
      cell: matchedManifest.cells[0],
      repetition: 1,
      executeArm() {
        throw new Error('must not execute');
      },
      gradeOutput() {
        return passingGrade();
      },
    }),
    /gradeOutput callbacks are unsupported/,
  );

  const componentDefinition = testDefinition({ layer: 'component' });
  const componentManifest = createManifest(componentDefinition);
  await assert.rejects(
    runComponentEvaluation({
      repositoryRoot: '/unused',
      manifest: componentManifest,
      definition: componentDefinition,
      caseDefinition: componentDefinition.evals[0],
      cell: componentManifest.cells[0],
      repetition: 1,
      adapter: null,
      gradeOutput() {
        return passingGrade();
      },
    }),
    /gradeOutput callbacks are unsupported/,
  );
});

test('campaign manifests reject resealed field injection', () => {
  const manifest = createManifest();
  for (const mutate of [
    (candidate) => { candidate.grader_path = './untrusted-grader.js'; },
    (candidate) => { candidate.grader_code = 'return { passed: true }'; },
    (candidate) => { candidate.arbitrary = true; },
    (candidate) => { candidate.grader.path = './untrusted-grader.js'; },
    (candidate) => { candidate.cases[0].arbitrary = true; },
    (candidate) => { candidate.thresholds.arbitrary = true; },
    (candidate) => { candidate.control_policy.arbitrary = true; },
  ]) {
    const injected = structuredClone(manifest);
    mutate(injected);
    resealManifest(injected);
    assert.throws(
      () => validateCampaignManifest(injected),
      /unsupported field/,
    );
  }
  assert.doesNotThrow(() => validateCampaignManifest(manifest));
});

test('grader resolution fails closed before execution for missing versions and unsupported coordinates', async (t) => {
  const definition = declareOwnerGrader(testDefinition());
  const manifest = createManifest(definition);
  const caseDefinition = definition.evals[0];
  const cell = manifest.cells[0];
  const result = normalizedResult({
    skill: definition.skill_name,
    model: cell.model,
    output: 'OWNER CLAUSE',
    loadedSkills: [definition.skill_name],
  });
  const evidence = {
    manifest,
    caseDefinition,
    cell,
    repetition: 1,
    arm: 'treatment',
    result,
    deterministicGrade: passingGrade(),
  };

  assert.throws(
    () => createRunEvidence(evidence),
    /is not registered/,
  );
  const fixtureRoot = createPackageFixture(t, ['incident-investigation']);
  let executions = 0;
  await assert.rejects(
    runMatchedEvaluation({
      repositoryRoot: fixtureRoot,
      manifest,
      definition,
      caseDefinition,
      cell,
      repetition: 1,
      executeArm() {
        executions += 1;
        return result;
      },
    }),
    /is not registered/,
  );
  assert.equal(executions, 0);
  assert.throws(
    () => createRunEvidence({
      ...evidence,
      graderRegistry: ownerGraderRegistry({ version: '2' }),
    }),
    /version "1" is not registered/,
  );
  assert.throws(
    () => createRunEvidence({
      ...evidence,
      graderRegistry: ownerGraderRegistry({ layers: ['role'] }),
    }),
    /does not support layer "outcome"/,
  );
  assert.throws(
    () => createRunEvidence({
      ...evidence,
      graderRegistry: ownerGraderRegistry({ arms: ['no-skill'] }),
    }),
    /does not support arm "treatment"/,
  );
});

test('grader metadata and resolver errors remain bounded', () => {
  for (const grader of [
    { id: 'a'.repeat(129), version: '1' },
    { id: 'fixture.clause-aware', version: '1'.repeat(33) },
  ]) {
    const definition = testDefinition();
    definition.evaluation.grader = grader;
    assert.throws(
      () => validateEvaluationDefinition(definition),
      (error) => error.message.length < 256,
    );
  }

  const definition = declareOwnerGrader(testDefinition(), {
    id: 'a'.repeat(128),
    version: '1'.repeat(32),
  });
  const manifest = createManifest(definition);
  assert.throws(
    () => createRunEvidence({
      manifest,
      definition,
      caseDefinition: definition.evals[0],
      cell: manifest.cells[0],
      repetition: 1,
      arm: 'treatment',
      result: normalizedResult({
        skill: definition.skill_name,
        model: manifest.cells[0].model,
        output: 'OWNER CLAUSE',
        loadedSkills: [definition.skill_name],
      }),
      deterministicGrade: passingGrade(),
    }),
    (error) => (
      /is not registered/.test(error.message)
      && error.message.length < 256
    ),
  );
});

test('owner grader failures and malformed checks fail closed with bounded errors', async (t) => {
  const definition = declareOwnerGrader(testDefinition());
  const manifest = createManifest(definition);
  const fixtureRoot = createPackageFixture(t, ['incident-investigation']);
  const base = {
    repositoryRoot: fixtureRoot,
    manifest,
    definition,
    caseDefinition: definition.evals[0],
    cell: manifest.cells[0],
    repetition: 1,
    executeArm({ arm }) {
      return normalizedResult({
        skill: definition.skill_name,
        model: manifest.cells[0].model,
        output: arm === 'treatment' ? 'OWNER CLAUSE' : 'control',
        loadedSkills: arm === 'treatment' ? [definition.skill_name] : [],
        packageSkills: arm === 'treatment' ? [definition.skill_name] : [],
      });
    },
  };

  await assert.rejects(
    runMatchedEvaluation({
      ...base,
      graderRegistry: ownerGraderRegistry({
        grade() {
          throw new Error('sensitive'.repeat(1000));
        },
      }),
    }),
    (error) => (
      error.message === 'deterministic grader execution failed'
      && error.message.length < 100
    ),
  );
  await assert.rejects(
    runMatchedEvaluation({
      ...base,
      graderRegistry: ownerGraderRegistry({
        grade({ caseDefinition }) {
          caseDefinition.prompt = 'mutated';
          return passingGrade();
        },
      }),
    }),
    /deterministic grader execution failed|mutated its input/,
  );
  for (const malformed of [
    null,
    { passed: true, checks: [] },
    {
      passed: true,
      checks: [{ name: 'clause', passed: false, details: 'contradiction' }],
    },
    {
      passed: true,
      checks: [{ name: 'clause', passed: true }],
    },
    {
      passed: true,
      checks: [{
        name: 'clause',
        passed: true,
        details: 'evidence',
        command: 'node arbitrary.js',
      }],
    },
  ]) {
    await assert.rejects(
      runMatchedEvaluation({
        ...base,
        graderRegistry: ownerGraderRegistry({
          grade() {
            return malformed;
          },
        }),
      }),
      /deterministic grader returned a malformed result/,
    );
  }
});

test('exported evidence APIs enforce normalized deterministic grades', () => {
  const definition = testDefinition();
  const manifest = createManifest(definition);
  const caseDefinition = definition.evals[0];
  const cell = manifest.cells[0];
  const output = 'Frame\nInventory\nMap';
  const result = normalizedResult({
    skill: definition.skill_name,
    model: cell.model,
    output,
    loadedSkills: [definition.skill_name],
  });
  const validGrade = gradeDeterministicOutput({
    definition,
    caseDefinition,
    output,
  });
  const invalidGrades = [
    { ...validGrade, status: 'extra' },
    {
      passed: true,
      checks: [{
        ...validGrade.checks[0],
        command: 'node arbitrary.js',
      }],
    },
    {
      passed: true,
      checks: [{
        name: 'oversized',
        passed: true,
        details: 'x'.repeat(2049),
      }],
    },
    { passed: true, checks: [] },
    {
      passed: true,
      checks: [{
        name: 'inconsistent',
        passed: false,
        details: 'failed check',
      }],
    },
  ];

  for (const deterministicGrade of invalidGrades) {
    assert.throws(
      () => createRunEvidence({
        manifest,
        caseDefinition,
        cell,
        repetition: 1,
        arm: 'treatment',
        result,
        deterministicGrade,
      }),
      /deterministicGrade/,
    );
  }

  const validRecord = createRunEvidence({
    manifest,
    caseDefinition,
    cell,
    repetition: 1,
    arm: 'treatment',
    result,
    deterministicGrade: validGrade,
  });
  for (const deterministicGrade of invalidGrades) {
    const tampered = structuredClone(validRecord);
    tampered.deterministic = deterministicGrade;
    reseal(tampered);
    assert.throws(
      () => validateRunEvidence({
        manifest,
        caseDefinition,
        cell,
        repetition: 1,
        arm: 'treatment',
        record: tampered,
      }),
      /deterministicGrade/,
    );
  }
});

test('checkless default grading remains replayable only without constraints', async (t) => {
  const definition = testDefinition();
  definition.evaluation.grader = { id: 'json-pattern', version: '1' };
  definition.signals = {};
  definition.global_required_signals = [];
  definition.global_order = [];
  definition.forbidden_patterns = [];
  const manifest = createManifest(definition);
  const caseDefinition = definition.evals[0];
  const cell = manifest.cells[0];
  const fixtureRoot = createPackageFixture(t, ['incident-investigation']);
  const runs = await runMatchedEvaluation({
    repositoryRoot: fixtureRoot,
    manifest,
    definition,
    caseDefinition,
    cell,
    repetition: 1,
    executeArm({ arm }) {
      return normalizedResult({
        skill: definition.skill_name,
        model: cell.model,
        output: arm === 'treatment' ? 'unconstrained treatment' : 'control',
        loadedSkills: arm === 'treatment' ? [definition.skill_name] : [],
        packageSkills: arm === 'treatment' ? [definition.skill_name] : [],
      });
    },
  });
  assert.deepEqual(runs[0].deterministic, { passed: true, checks: [] });
  assert.deepEqual(runs[1].deterministic, { passed: true, checks: [] });
  assert.equal(assessReusableEvidence({
    manifest,
    definition,
    caseDefinition,
    cell,
    repetition: 1,
    arm: 'treatment',
    record: runs[1],
  }).reusable, true);
  const comparison = createBlindComparison({
    manifest,
    definition,
    caseDefinition,
    repetition: 1,
    control: runs[0],
    treatment: runs[1],
    judgeModel: 'judge-model',
  });
  const judgment = createJudgmentEvidence({
    comparison,
    definition,
    caseDefinition,
    judgeModel: 'judge-model',
    judgment: structuredJudgment(comparison),
    durationMs: 5,
    costUsd: 0.02,
  });
  assert.equal(replayCampaign({
    manifest,
    definition,
    runs,
    judgments: [judgment],
  }).passed, true);

  const constrainedDefinition = testDefinition();
  const constrainedManifest = createManifest(constrainedDefinition);
  assert.throws(
    () => createRunEvidence({
      manifest: constrainedManifest,
      definition: constrainedDefinition,
      caseDefinition: constrainedDefinition.evals[0],
      cell: constrainedManifest.cells[0],
      repetition: 1,
      arm: 'treatment',
      result: normalizedResult({
        skill: constrainedDefinition.skill_name,
        model: constrainedManifest.cells[0].model,
        output: 'Frame\nInventory\nMap',
        loadedSkills: [constrainedDefinition.skill_name],
      }),
      deterministicGrade: { passed: true, checks: [] },
    }),
    /must contain clause-level evidence/,
  );
});

test('grader fingerprints reject implementation substitution and tampering', async (t) => {
  const definition = declareOwnerGrader(testDefinition());
  const manifest = createManifest(definition);
  const cell = manifest.cells[0];
  const caseDefinition = definition.evals[0];
  const fixtureRoot = createPackageFixture(t, ['incident-investigation']);
  function runWithRegistry(graderRegistry) {
    return runMatchedEvaluation({
      repositoryRoot: fixtureRoot,
      manifest,
      definition,
      caseDefinition,
      cell,
      repetition: 1,
      executeArm({ arm }) {
        return normalizedResult({
          skill: definition.skill_name,
          model: cell.model,
          output: arm === 'treatment' ? 'OWNER CLAUSE' : 'control',
          loadedSkills: arm === 'treatment' ? [definition.skill_name] : [],
          packageSkills: arm === 'treatment' ? [definition.skill_name] : [],
        });
      },
      graderRegistry,
    });
  }

  const originalRegistry = ownerGraderRegistry();
  const runs = await runWithRegistry(originalRegistry);
  const treatment = runs[1];
  const substitutedRegistry = ownerGraderRegistry({
    grade({ arm, output }) {
      const ownerClausePresent = output.includes('OWNER CLAUSE');
      const passed = arm.kind !== 'treatment' || ownerClausePresent;
      return {
        passed,
        checks: [{
          name: 'owner clause',
          passed,
          details: passed ? 'clause-level fixture evidence' : 'owner clause missing',
        }],
      };
    },
  });

  assert.deepEqual(
    assessReusableEvidence({
      manifest,
      definition,
      caseDefinition,
      cell,
      repetition: 1,
      arm: 'treatment',
      record: treatment,
      graderRegistry: substitutedRegistry,
    }),
    { reusable: false, reason: 'deterministic grader fingerprint mismatch' },
  );
  const substitutedConfigurationRegistry = ownerGraderRegistry({
    configuration: {
      requiredClause: 'SUBSTITUTED CLAUSE',
    },
  });
  assert.deepEqual(
    assessReusableEvidence({
      manifest,
      definition,
      caseDefinition,
      cell,
      repetition: 1,
      arm: 'treatment',
      record: treatment,
      graderRegistry: substitutedConfigurationRegistry,
    }),
    { reusable: false, reason: 'deterministic grader fingerprint mismatch' },
  );
  function capturedGrader(requiredClause) {
    return function grade({ arm, output }) {
      const passed = arm.kind !== 'treatment' || output.includes(requiredClause);
      return {
        passed,
        checks: [{
          name: 'owner clause',
          passed,
          details: passed ? 'clause-level fixture evidence' : 'owner clause missing',
        }],
      };
    };
  }
  const capturedAlphaRegistry = ownerGraderRegistry({
    implementationDigest: hash('fixture grader artifact alpha'),
    grade: capturedGrader('OWNER CLAUSE'),
  });
  const capturedBetaRegistry = ownerGraderRegistry({
    implementationDigest: hash('fixture grader artifact beta'),
    grade: capturedGrader('OWNER CLAUSE'),
  });
  const capturedAlphaRuns = await runWithRegistry(capturedAlphaRegistry);
  const capturedBetaRuns = await runWithRegistry(capturedBetaRegistry);
  assert.notEqual(
    capturedAlphaRuns[1].grader.fingerprint,
    capturedBetaRuns[1].grader.fingerprint,
  );
  assert.deepEqual(
    assessReusableEvidence({
      manifest,
      definition,
      caseDefinition,
      cell,
      repetition: 1,
      arm: 'treatment',
      record: capturedAlphaRuns[1],
      graderRegistry: capturedBetaRegistry,
    }),
    { reusable: false, reason: 'deterministic grader fingerprint mismatch' },
  );
  assert.throws(
    () => createBlindComparison({
      manifest,
      definition,
      caseDefinition,
      repetition: 1,
      control: runs[0],
      treatment,
      judgeModel: 'judge-model',
      graderRegistry: substitutedRegistry,
    }),
    /deterministic grader fingerprint mismatch/,
  );
  assert.throws(
    () => replayCampaign({
      manifest,
      definition,
      runs,
      judgments: [],
      graderRegistry: substitutedRegistry,
    }),
    /deterministic grader fingerprint mismatch/,
  );
  const staleControlGrade = structuredClone(runs[0]);
  staleControlGrade.deterministic.checks[0].details = 'stale owner control grade';
  reseal(staleControlGrade);
  assert.throws(
    () => createBlindComparison({
      manifest,
      definition,
      caseDefinition,
      repetition: 1,
      control: staleControlGrade,
      treatment,
      judgeModel: 'judge-model',
      graderRegistry: originalRegistry,
    }),
    /deterministic grade mismatch/,
  );

  const tampered = structuredClone(treatment);
  tampered.grader.fingerprint = hash('tampered grader');
  tampered.fingerprints.grading = tampered.grader.fingerprint;
  reseal(tampered);
  assert.throws(
    () => validateRunEvidence({
      manifest,
      caseDefinition,
      cell,
      repetition: 1,
      arm: 'treatment',
      record: tampered,
      graderRegistry: originalRegistry,
    }),
    /deterministic grader fingerprint mismatch/,
  );

  const malformed = structuredClone(treatment);
  malformed.deterministic.checks[0]['x'.repeat(10_000)] = true;
  reseal(malformed);
  const malformedAssessment = assessReusableEvidence({
    manifest,
    definition,
    caseDefinition,
    cell,
    repetition: 1,
    arm: 'treatment',
    record: malformed,
    graderRegistry: originalRegistry,
  });
  assert.equal(malformedAssessment.reusable, false);
  assert.ok(malformedAssessment.reason.length < 200);

  const duplicate = structuredClone(treatment);
  const oversizedValue = 'x'.repeat(10_000);
  duplicate.execution.package_skills = [oversizedValue, oversizedValue];
  reseal(duplicate);
  const duplicateAssessment = assessReusableEvidence({
    manifest,
    definition,
    caseDefinition,
    cell,
    repetition: 1,
    arm: 'treatment',
    record: duplicate,
    graderRegistry: originalRegistry,
  });
  assert.equal(duplicateAssessment.reusable, false);
  assert.ok(duplicateAssessment.reason.length <= 256);
});

test('default and owner graders cover role outcome component and trigger arms', async (t) => {
  for (const owner of [false, true]) {
    for (const layer of ['role', 'outcome']) {
      const definition = testDefinition({ layer });
      const graderRegistry = owner ? ownerGraderRegistry() : undefined;
      if (owner) {
        declareOwnerGrader(definition);
        definition.signals.ordered_trace = ['^GENERIC-GRADER-CANNOT-MATCH$'];
      }
      const manifest = createManifest(definition);
      const fixtureRoot = createPackageFixture(t, ['incident-investigation']);
      const records = await runMatchedEvaluation({
        repositoryRoot: fixtureRoot,
        manifest,
        definition,
        caseDefinition: definition.evals[0],
        cell: manifest.cells[0],
        repetition: 1,
        executeArm({ arm }) {
          return normalizedResult({
            skill: definition.skill_name,
            model: manifest.cells[0].model,
            output: arm === 'treatment'
              ? owner
                ? 'OWNER CLAUSE'
                : 'Frame\nInventory\nMap'
              : 'control',
            loadedSkills: arm === 'treatment' ? [definition.skill_name] : [],
            packageSkills: arm === 'treatment' ? [definition.skill_name] : [],
          });
        },
        ...(graderRegistry ? { graderRegistry } : {}),
      });
      assert.deepEqual(
        records.map(({ arm }) => arm.kind),
        ['no-skill', 'treatment'],
      );
      assert.equal(records[1].deterministic.passed, true);
    }
  }

  const componentDefinition = declareOwnerGrader(testDefinition({
    skill: 'agent-writing',
    scope: 'agent-writing-component-owner',
    layer: 'component',
  }));
  componentDefinition.signals.ordered_trace = ['^GENERIC-GRADER-CANNOT-MATCH$'];
  const componentManifest = createManifest(componentDefinition);
  const componentRoot = createPackageFixture(
    t,
    ['agent-writing', 'writing-foundation'],
  );
  const componentRegistry = ownerGraderRegistry();
  const adapter = defineTestAdapter({
    name: 'owner-component-grader',
    execute(invocation, context) {
      return normalizedResult({
        skill: invocation.skill,
        model: invocation.model,
        output: 'OWNER CLAUSE',
        loadedSkills: context.resolvedSkills,
        packageSkills: context.packageSkills,
      });
    },
  });
  const componentRuns = await runComponentEvaluation({
    repositoryRoot: componentRoot,
    manifest: componentManifest,
    definition: componentDefinition,
    caseDefinition: componentDefinition.evals[0],
    cell: componentManifest.cells[0],
    repetition: 1,
    adapter,
    graderRegistry: componentRegistry,
  });
  assert.deepEqual(
    componentRuns.map(({ arm, deterministic }) => [
      arm.kind,
      deterministic.passed,
    ]),
    [
      ['treatment', true],
      ['component-ablation', true],
    ],
  );
  assert.equal(assessReusableEvidence({
    manifest: componentManifest,
    definition: componentDefinition,
    caseDefinition: componentDefinition.evals[0],
    cell: componentManifest.cells[0],
    repetition: 1,
    arm: 'treatment',
    record: componentRuns[0],
    graderRegistry: componentRegistry,
  }).reusable, true);
  const componentComparison = createBlindComparison({
    manifest: componentManifest,
    definition: componentDefinition,
    caseDefinition: componentDefinition.evals[0],
    repetition: 1,
    control: componentRuns[1],
    treatment: componentRuns[0],
    judgeModel: 'judge-model',
    graderRegistry: componentRegistry,
  });
  const componentJudgment = createJudgmentEvidence({
    comparison: componentComparison,
    definition: componentDefinition,
    caseDefinition: componentDefinition.evals[0],
    judgeModel: 'judge-model',
    judgment: structuredJudgment(componentComparison),
    durationMs: 5,
    costUsd: 0.02,
  });
  assert.equal(replayCampaign({
    manifest: componentManifest,
    definition: componentDefinition,
    runs: componentRuns,
    judgments: [componentJudgment],
    graderRegistry: componentRegistry,
  }).passed, true);

  const triggerDefinitionWithOwner = declareOwnerGrader(triggerDefinition());
  const triggerManifest = createManifest(triggerDefinitionWithOwner);
  const triggerRoot = createPackageFixture(
    t,
    ['agent-writing', 'writing-foundation'],
  );
  const triggerRegistry = ownerGraderRegistry({
    grade({ arm, result }) {
      const passed = arm.kind === 'treatment'
        && result.observations.skillEvents.some((event) => (
          event.name === 'agent-writing'
            && event.operation === 'load'
            && event.status === 'succeeded'
        ));
      return {
        passed,
        checks: [{
          name: 'exact trigger lifecycle',
          passed,
          details: passed ? 'exact load observed' : 'exact load missing',
        }],
      };
    },
  });
  const triggerRecord = await runTriggerEvaluation({
    repositoryRoot: triggerRoot,
    manifest: triggerManifest,
    definition: triggerDefinitionWithOwner,
    caseDefinition: triggerDefinitionWithOwner.evals[0],
    cell: triggerManifest.cells[0],
    repetition: 1,
    execute() {
      return normalizedResult({
        skill: 'agent-writing',
        model: triggerManifest.cells[0].model,
        output: 'trigger output',
        loadedSkills: ['agent-writing'],
      });
    },
    graderRegistry: triggerRegistry,
  });
  assert.equal(triggerRecord.deterministic.passed, true);
  assert.equal(assessReusableEvidence({
    manifest: triggerManifest,
    definition: triggerDefinitionWithOwner,
    caseDefinition: triggerDefinitionWithOwner.evals[0],
    cell: triggerManifest.cells[0],
    repetition: 1,
    arm: 'treatment',
    record: triggerRecord,
    graderRegistry: triggerRegistry,
  }).reusable, true);
  assert.equal(replayTriggerCampaign({
    manifest: triggerManifest,
    definition: triggerDefinitionWithOwner,
    runs: [triggerRecord],
    graderRegistry: triggerRegistry,
  }).passed, true);
});

test('critical owner deterministic failure blocks blind judging', async (t) => {
  const definition = declareOwnerGrader(testDefinition());
  const manifest = createManifest(definition);
  const cell = manifest.cells[0];
  const fixtureRoot = createPackageFixture(t, ['incident-investigation']);
  const graderRegistry = ownerGraderRegistry({
    grade({ arm }) {
      const passed = arm.kind !== 'treatment';
      return {
        passed,
        checks: [{
          name: 'critical owner clause',
          passed,
          details: passed ? 'baseline arm' : 'critical clause absent',
        }],
      };
    },
  });
  const records = await runMatchedEvaluation({
    repositoryRoot: fixtureRoot,
    manifest,
    definition,
    caseDefinition: definition.evals[0],
    cell,
    repetition: 1,
    executeArm({ arm }) {
      return normalizedResult({
        skill: definition.skill_name,
        model: cell.model,
        output: arm,
        loadedSkills: arm === 'treatment' ? [definition.skill_name] : [],
        packageSkills: arm === 'treatment' ? [definition.skill_name] : [],
      });
    },
    graderRegistry,
  });

  assert.throws(
    () => createBlindComparison({
      manifest,
      definition,
      caseDefinition: definition.evals[0],
      repetition: 1,
      control: records[0],
      treatment: records[1],
      judgeModel: 'judge-model',
      graderRegistry,
    }),
    /deterministic gate failed before judging/,
  );
});

test('legacy evidence resolves only to a provably equivalent default grader', () => {
  const definition = testDefinition();
  const manifest = structuredClone(createManifest(definition));
  delete manifest.grader;
  delete manifest.fingerprint;
  manifest.fingerprint = hash(manifest);
  const caseDefinition = definition.evals[0];
  const cell = manifest.cells[0];
  const output = 'Frame\nInventory\nMap';
  const record = asLegacyRunEvidence(createRunEvidence({
    manifest,
    definition,
    caseDefinition,
    cell,
    repetition: 1,
    arm: 'treatment',
    result: normalizedResult({
      skill: definition.skill_name,
      model: cell.model,
      output,
      loadedSkills: [definition.skill_name],
    }),
    deterministicGrade: gradeDeterministicOutput({
      definition,
      caseDefinition,
      output,
    }),
  }), {
    manifest,
    caseDefinition,
    cell,
  });
  assert.deepEqual(
    assessReusableEvidence({
      repositoryRoot,
      manifest,
      definition,
      caseDefinition,
      cell,
      repetition: 1,
      arm: 'treatment',
      record,
    }),
    { reusable: true, reason: 'complete matching evidence' },
  );

  const controlOutput = 'Possible cause.';
  const control = asLegacyRunEvidence(createRunEvidence({
    manifest,
    definition,
    caseDefinition,
    cell,
    repetition: 1,
    arm: 'no-skill',
    result: normalizedResult({
      skill: definition.skill_name,
      model: cell.model,
      output: controlOutput,
      loadedSkills: [],
      packageSkills: [],
    }),
    deterministicGrade: gradeDeterministicOutput({
      definition,
      caseDefinition,
      output: controlOutput,
    }),
  }), {
    manifest,
    caseDefinition,
    cell,
    deterministicOverrides: {
      passed: true,
      status: 'baseline',
    },
  });
  assert.deepEqual(
    assessReusableEvidence({
      repositoryRoot,
      manifest,
      definition,
      caseDefinition,
      cell,
      repetition: 1,
      arm: 'no-skill',
      record: control,
    }),
    { reusable: true, reason: 'complete matching evidence' },
  );
  const comparison = createBlindComparison({
    repositoryRoot,
    manifest,
    definition,
    caseDefinition,
    repetition: 1,
    control,
    treatment: record,
    judgeModel: 'judge-model',
  });
  const judgment = createJudgmentEvidence({
    comparison,
    definition,
    caseDefinition,
    judgeModel: 'judge-model',
    judgment: structuredJudgment(comparison),
    durationMs: 5,
    costUsd: 0.02,
  });
  assert.equal(replayCampaign({
    repositoryRoot,
    manifest,
    definition,
    runs: [control, record],
    judgments: [judgment],
  }).passed, true);

  const stale = structuredClone(record);
  stale.deterministic.checks[0].details = 'stale default evidence';
  reseal(stale);
  assert.deepEqual(
    assessReusableEvidence({
      repositoryRoot,
      manifest,
      definition,
      caseDefinition,
      cell,
      repetition: 1,
      arm: 'treatment',
      record: stale,
    }),
    { reusable: false, reason: 'deterministic grade mismatch' },
  );

  const ownerDefinition = declareOwnerGrader(testDefinition());
  const ownerManifest = createManifest(ownerDefinition);
  const ownerRecord = structuredClone(record);
  ownerRecord.campaign_fingerprint = ownerManifest.fingerprint;
  ownerRecord.arm.pairing_id = hash({
    campaign: ownerManifest.fingerprint,
    case_id: String(ownerDefinition.evals[0].id),
    host: ownerManifest.cells[0].host,
    model: ownerManifest.cells[0].model,
    repetition: 1,
  });
  ownerRecord.fingerprints.input = hash('forged owner legacy input');
  reseal(ownerRecord);
  assert.deepEqual(
    assessReusableEvidence({
      manifest: ownerManifest,
      definition: ownerDefinition,
      caseDefinition: ownerDefinition.evals[0],
      cell: ownerManifest.cells[0],
      repetition: 1,
      arm: 'treatment',
      record: ownerRecord,
      graderRegistry: ownerGraderRegistry(),
    }),
    {
      reusable: false,
      reason: 'legacy evidence cannot synthesize owner grader identity',
    },
  );
});

test('offline replay rejects stale, partial, mismatched, and tampered evidence', async (t) => {
  const campaign = await passingCampaign(t);
  const replay = (runs = campaign.runs, judgments = campaign.judgments) => (
    replayCampaign({
      manifest: campaign.manifest,
      definition: campaign.definition,
      runs,
      judgments,
    })
  );

  assert.throws(
    () => replay(campaign.runs.slice(0, 1)),
    /missing treatment evidence/,
  );

  const stale = structuredClone(campaign.runs);
  stale[0].campaign_fingerprint = '0'.repeat(64);
  reseal(stale[0]);
  assert.throws(() => replay(stale), /stale campaign fingerprint/);

  const mismatched = structuredClone(campaign.runs);
  mismatched[1].arm.pairing_id = 'wrong-pair';
  reseal(mismatched[1]);
  assert.throws(() => replay(mismatched), /pairing mismatch/);

  const tampered = structuredClone(campaign.runs);
  tampered[1].execution.output = 'Tampered output.';
  assert.throws(() => replay(tampered), /record fingerprint mismatch/);

  const tamperedJudgment = structuredClone(campaign.judgments);
  tamperedJudgment[0].judgment.reasoning = 'Changed after judging.';
  assert.throws(
    () => replay(campaign.runs, tamperedJudgment),
    /judgment fingerprint mismatch/,
  );

  const changedConfiguration = structuredClone(campaign.runs);
  changedConfiguration[1].execution_configuration.timeout_ms = 2000;
  reseal(changedConfiguration[1]);
  assert.throws(
    () => replay(changedConfiguration),
    /execution configuration mismatch/,
  );

  const changedGrade = structuredClone(campaign.runs);
  changedGrade[1].deterministic.passed = false;
  reseal(changedGrade[1]);
  assert.throws(
    () => replay(changedGrade),
    /deterministicGrade\.passed must match its checks/,
  );

  const changedMetrics = structuredClone(campaign.judgments);
  changedMetrics[0].metrics.treatment_won = false;
  resealJudgment(changedMetrics[0]);
  assert.throws(
    () => replay(campaign.runs, changedMetrics),
    /judgment metrics mismatch/,
  );
});

test('resume reuses only complete successful evidence with matching fingerprints', async (t) => {
  const campaign = await passingCampaign(t);
  const expected = {
    manifest: campaign.manifest,
    definition: campaign.definition,
    caseDefinition: campaign.definition.evals[0],
    cell: campaign.manifest.cells[0],
    repetition: 1,
    arm: 'treatment',
  };
  const treatment = campaign.runs[1];

  assert.deepEqual(
    assessReusableEvidence({ ...expected, record: treatment }),
    { reusable: true, reason: 'complete matching evidence' },
  );
  const withoutActivation = structuredClone(treatment);
  withoutActivation.execution.skill_events = [];
  reseal(withoutActivation);
  assert.deepEqual(
    assessReusableEvidence({ ...expected, record: withoutActivation }),
    { reusable: false, reason: 'activation evidence not successful' },
  );
  assert.deepEqual(
    assessReusableEvidence({ ...expected, record: null }),
    { reusable: false, reason: 'evidence missing' },
  );
  assert.deepEqual(
    assessReusableEvidence({
      ...expected,
      cell: { host: 'cursor', model: 'test-model' },
      record: treatment,
    }),
    { reusable: false, reason: 'input fingerprint mismatch' },
  );

  const failed = createRunEvidence({
    manifest: campaign.manifest,
    caseDefinition: campaign.definition.evals[0],
    cell: campaign.manifest.cells[0],
    repetition: 1,
    arm: 'treatment',
    result: {
      ...normalizedResult({
        skill: campaign.definition.skill_name,
        model: 'test-model',
        output: 'Partial output.',
        loadedSkills: [campaign.definition.skill_name],
      }),
      status: 'failed',
      failure: {
        stage: 'execution',
        code: 'executor-failed',
        message: 'Executor failed.',
      },
    },
    deterministicGrade: failingGrade(),
  });
  assert.deepEqual(
    assessReusableEvidence({ ...expected, record: failed }),
    { reusable: false, reason: 'execution not successful' },
  );

  const incompatible = structuredClone(treatment);
  incompatible.schema_version = 1;
  reseal(incompatible);
  assert.deepEqual(
    assessReusableEvidence({ ...expected, record: incompatible }),
    { reusable: false, reason: 'incompatible schema version' },
  );
});

test('failed deterministic evidence blocks judging and yields a failed tracer verdict', async (t) => {
  const campaign = await passingCampaign(t);
  const failedTreatment = createRunEvidence({
    manifest: campaign.manifest,
    caseDefinition: campaign.definition.evals[0],
    cell: campaign.manifest.cells[0],
    repetition: 1,
    arm: 'treatment',
    result: normalizedResult({
      skill: campaign.definition.skill_name,
      model: 'test-model',
      output: 'Incomplete trace.',
      loadedSkills: [campaign.definition.skill_name],
    }),
    deterministicGrade: gradeDeterministicOutput({
      definition: campaign.definition,
      caseDefinition: campaign.definition.evals[0],
      output: 'Incomplete trace.',
    }),
  });
  const runs = [campaign.runs[0], failedTreatment];

  const replay = replayCampaign({
    manifest: campaign.manifest,
    definition: campaign.definition,
    runs,
    judgments: [],
  });
  assert.equal(replay.passed, false);
  assert.deepEqual(replay.failures, [
    {
      case_id: '1',
      host: 'claude-code',
      model: 'test-model',
      repetition: 1,
      gate: 'deterministic',
    },
  ]);

  assert.throws(
    () => replayCampaign({
      manifest: campaign.manifest,
      definition: campaign.definition,
      runs,
      judgments: campaign.judgments,
    }),
    /judgment exists after failed deterministic gate/,
  );
});

test('offline replay requires every host and model cell to pass thresholds', async (t) => {
  const definition = testDefinition();
  definition.config.minimum_treatment_pass_rate = 0.5;
  definition.config.minimum_treatment_win_rate = 0.5;
  const manifest = createManifest(definition, {
    cells: [
      { host: 'claude-code', model: 'claude-test-model' },
      { host: 'cursor', model: 'cursor-test-model' },
    ],
  });
  const fixtureRoot = createPackageFixture(t, ['incident-investigation']);
  const caseDefinition = definition.evals[0];
  const runs = [];
  const judgments = [];

  for (const cell of manifest.cells) {
    const cellRuns = await runMatchedEvaluation({
      repositoryRoot: fixtureRoot,
      manifest,
      definition,
      caseDefinition,
      cell,
      repetition: 1,
      async executeArm({ arm }) {
        return normalizedResult({
          skill: definition.skill_name,
          model: cell.model,
          output: arm === 'treatment'
            ? 'Frame\nInventory\nMap\nRead-only investigation.'
            : 'Possible cause.',
          loadedSkills: arm === 'treatment' ? [definition.skill_name] : [],
          packageSkills: arm === 'treatment' ? [definition.skill_name] : [],
        });
      },
    });
    runs.push(...cellRuns);
    const comparison = createBlindComparison({
      manifest,
      definition,
      caseDefinition,
      repetition: 1,
      control: cellRuns[0],
      treatment: cellRuns[1],
      judgeModel: 'judge-model',
    });
    const judgment = structuredJudgment(comparison);
    if (cell.host === 'cursor') {
      judgment.winner = comparison.placement.control;
    }
    judgments.push(createJudgmentEvidence({
      comparison,
      definition,
      caseDefinition,
      judgeModel: 'judge-model',
      judgment,
      durationMs: 5,
      costUsd: 0.02,
    }));
  }

  const replay = replayCampaign({
    manifest,
    definition,
    runs,
    judgments,
  });
  assert.equal(replay.summary.treatment_win_rate, 0.5);
  assert.equal(replay.summary.treatment_expectation_pass_rate, 1);
  assert.equal(replay.summary.cells[0].thresholds_passed, true);
  assert.equal(replay.summary.cells[1].thresholds_passed, false);
  assert.equal(replay.summary.thresholds_passed, false);
  assert.equal(replay.passed, false);
});

test('report-only aggregation includes provenance and no suite release claim', async (t) => {
  const campaign = await passingCampaign(t);
  const replay = replayCampaign({
    manifest: campaign.manifest,
    definition: campaign.definition,
    runs: campaign.runs,
    judgments: campaign.judgments,
  });
  const report = buildAdoptionReport({
    manifest: campaign.manifest,
    definition: campaign.definition,
    replay,
    runs: campaign.runs,
    judgments: campaign.judgments,
  });

  assert.match(report, /Incident Investigation Adoption report/);
  assert.match(report, /claude-code/);
  assert.match(report, /test-model-resolved/);
  assert.match(report, /preserved-incident-behavior/);
  assert.match(report, /Repetitions: 1/);
  assert.match(report, /No-Skill/);
  assert.match(report, /Treatment/);
  assert.match(report, /Total cost \(USD\): 0\.04/);
  assert.match(report, /Fixture proves shared machinery/);
  assert.match(report, new RegExp(campaign.manifest.fingerprint));
  for (const run of campaign.runs) {
    assert.match(report, new RegExp(run.fingerprints.record));
  }
  for (const judgment of campaign.judgments) {
    assert.match(report, new RegExp(judgment.fingerprint));
  }
  assert.match(report, /does not make the 19-Skill suite release decision/);
});
