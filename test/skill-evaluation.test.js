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
  createJudgmentEvidence,
  createRunEvidence,
  gradeDeterministicOutput,
  replayCampaign,
  runComponentEvaluation,
  runMatchedEvaluation,
  replayTriggerCampaign,
  validateEvaluationDefinition,
  validateEvaluationSchemas,
  validateJudgmentEvidence,
  validateRunEvidence,
} = require('../suite/evaluation');
const { defineTestAdapter } = require('../suite/testing');

const repositoryRoot = path.resolve(__dirname, '..');
const baseRevision = '65860269897fb826fed8b66009f293ad28bb4731';

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
      },
    ],
  };
}

function normalizedResult({
  skill,
  model,
  output,
  invokedSkills,
  discoveredSkills = invokedSkills,
  durationMs = 10,
  costUsd = 0.01,
}) {
  return {
    status: 'succeeded',
    observations: {
      discoveredSkills,
      routing: {
        requestedSkill: skill,
        invokedSkills,
      },
      responses: [{ text: output }],
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
        invokedSkills: treatment ? [definition.skill_name] : [],
        discoveredSkills: treatment ? [definition.skill_name] : [],
      });
    },
    gradeOutput({ arm, output }) {
      const grade = gradeDeterministicOutput({
        definition,
        caseDefinition,
        output,
      });
      return arm === 'treatment' ? grade : {
        ...grade,
        passed: true,
        status: 'baseline',
      };
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

  assert.equal(validateEvaluationDefinition(incidentDefinition), incidentDefinition);
  assert.deepEqual(validateEvaluationSchemas(repositoryRoot), {
    definition: true,
    retainedEvidence: true,
  });
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
        type: 'tool_use',
        name: 'Skill',
        input: { skill: 'incident-investigation' },
      }] : []),
      { type: 'text', text: output },
    ],
  },
}));
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

test('matched evaluation checks package closure before executing either arm', async (t) => {
  const fixtureRoot = createPackageFixture(t, ['implement']);
  const definition = testDefinition({ skill: 'implement', scope: 'implement' });
  const manifest = createManifest(definition);
  let executions = 0;

  await assert.rejects(
    runMatchedEvaluation({
      repositoryRoot: fixtureRoot,
      manifest,
      caseDefinition: definition.evals[0],
      cell: manifest.cells[0],
      repetition: 1,
      async executeArm() {
        executions += 1;
        throw new Error('must not execute');
      },
      gradeOutput: passingGrade,
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
        invokedSkills: context.arm === 'treatment'
          ? [definition.skill_name]
          : [],
        discoveredSkills: context.arm === 'treatment'
          ? [definition.skill_name]
          : [],
      });
    },
    gradeOutput({ arm }) {
      return arm === 'treatment' ? passingGrade() : baselineGrade();
    },
  });

  assert.deepEqual(observed.map(({ arm }) => arm), ['no-skill', 'treatment']);
  assert.strictEqual(observed[0].caseDefinition, observed[1].caseDefinition);
  assert.strictEqual(
    observed[0].executionConfiguration,
    observed[1].executionConfiguration,
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
          invokedSkills: arm === 'treatment' ? [definition.skill_name] : [],
          discoveredSkills: arm === 'treatment' ? [definition.skill_name] : [],
        });
      },
      gradeOutput({ arm, output }) {
        const grade = gradeDeterministicOutput({
          definition,
          caseDefinition: definition.evals[0],
          output,
        });
        return arm === 'treatment' ? grade : {
          ...grade,
          passed: true,
          status: 'baseline',
        };
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
  let adapterExecutions = 0;
  const adapter = defineTestAdapter({
    name: 'component-evaluation',
    async execute(invocation, context) {
      adapterExecutions += 1;
      return normalizedResult({
        skill: invocation.skill,
        model: invocation.model,
        output: 'Frame\nInventory\nMap\nRead-only investigation.',
        invokedSkills: context.resolvedSkills,
        discoveredSkills: context.discoveredSkills,
      });
    },
  });

  const evidence = await runComponentEvaluation({
    repositoryRoot: completeRoot,
    manifest,
    caseDefinition: definition.evals[0],
    cell: manifest.cells[0],
    repetition: 1,
    adapter,
    dependencyAblation: {
      consumer: 'agent-writing',
      dependency: 'writing-foundation',
    },
    gradeOutput({ arm, output }) {
      const grade = gradeDeterministicOutput({
        definition,
        caseDefinition: definition.evals[0],
        output,
      });
      return arm === 'treatment' ? grade : {
        ...grade,
        passed: true,
        status: 'baseline',
      };
    },
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
    complete.execution.routing.invoked_skills.includes('writing-foundation'),
    true,
  );
  assert.deepEqual(ablated.execution.routing.invoked_skills, ['agent-writing']);

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

  const incompleteRoot = createPackageFixture(t, ['agent-writing']);
  await assert.rejects(
    runComponentEvaluation({
      repositoryRoot: incompleteRoot,
      manifest,
      caseDefinition: definition.evals[0],
      cell: manifest.cells[0],
      repetition: 1,
      adapter,
      dependencyAblation: {
        consumer: 'agent-writing',
        dependency: 'writing-foundation',
      },
      gradeOutput: passingGrade,
    }),
    /Missing internal dependency "writing-foundation"/,
  );
  assert.equal(adapterExecutions, 2);
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
      invokedSkills: [campaign.definition.skill_name],
    }),
    deterministicGrade: failingGrade(),
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
    /deterministic grade mismatch/,
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
        invokedSkills: [campaign.definition.skill_name],
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
  incompatible.schema_version = 2;
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
      invokedSkills: [campaign.definition.skill_name],
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
          invokedSkills: arm === 'treatment' ? [definition.skill_name] : [],
          discoveredSkills: arm === 'treatment' ? [definition.skill_name] : [],
        });
      },
      gradeOutput({ arm, output }) {
        const grade = gradeDeterministicOutput({
          definition,
          caseDefinition,
          output,
        });
        return arm === 'treatment' ? grade : {
          ...grade,
          passed: true,
          status: 'baseline',
        };
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
