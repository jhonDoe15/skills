'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  createBlindComparison,
  createCampaignManifest,
  createRunEvidence,
  gradeDeterministicOutput,
  gradeTriggerResult,
  runComponentEvaluation,
  runMatchedEvaluation,
  validateEvaluationDefinition,
} = require('../../../suite/evaluation');
const { defineTestAdapter } = require('../../../suite/testing');

const repositoryRoot = path.resolve(__dirname, '../../..');
const skillRoot = path.resolve(__dirname, '..');
const definitions = new Map();
const expectedCoverage = new Map([
  ['wf-accepted-context', 'writing-foundation'],
  ['wf-coverage', 'writing-foundation'],
  ['wf-grounding', 'writing-foundation'],
  ['wf-uncertainty', 'writing-foundation'],
  ['wf-structure', 'writing-foundation'],
  ['wf-terminology', 'writing-foundation'],
  ['wf-relevance', 'writing-foundation'],
  ['wf-work-product-fidelity', 'writing-foundation'],
  ['wf-behavioral-pruning', 'writing-foundation'],
  ['wf-exclusions', 'writing-foundation'],
  ['wf-failure-behavior', 'writing-foundation'],
  ['wf-completion', 'writing-foundation'],
  ['wf-canonical-private-reach', 'writing-foundation'],
  ['wf-private-routing-exclusion', 'writing-foundation'],
  ['aw-accepted-context', 'agent-writing'],
  ['aw-activation', 'agent-writing'],
  ['aw-intended-outcomes', 'agent-writing'],
  ['aw-branches', 'agent-writing'],
  ['aw-completion', 'agent-writing'],
  ['aw-steps-reference', 'agent-writing'],
  ['aw-branch-disclosure', 'agent-writing'],
  ['aw-co-located-authority', 'agent-writing'],
  ['aw-instruction-form', 'agent-writing'],
  ['aw-context-load', 'agent-writing'],
  ['aw-behavioral-pruning', 'agent-writing'],
  ['aw-terminology', 'agent-writing'],
  ['aw-execution-semantics', 'agent-writing'],
  ['aw-environment-source', 'agent-writing'],
  ['aw-failure-behavior', 'agent-writing'],
  ['aw-routing-positive', 'agent-writing'],
  ['aw-routing-agent-skill-exclusion', 'agent-writing'],
  ['aw-routing-handoff-exclusion', 'agent-writing'],
  ['aw-routing-human-exclusion', 'agent-writing'],
  ['aw-routing-ambiguous', 'agent-writing'],
  ['aw-routing-canonical', 'agent-writing'],
  ['aw-foundation-edge', 'agent-writing'],
  ['aw-missing-dependency', 'agent-writing'],
]);

function readJson(filePath) {
  assert.equal(fs.existsSync(filePath), true, `${filePath} must exist`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadDefinition(owner, fileName) {
  const definition = readJson(path.join(
    repositoryRoot,
    'skills',
    owner,
    'evals',
    fileName,
  ));
  assert.equal(
    validateEvaluationDefinition(definition, repositoryRoot),
    definition,
  );
  definitions.set(definition.evaluation.scope, definition);
  return definition;
}

function caseKey(scope, id) {
  return `${scope}:${id}`;
}

function skillEvent(name, {
  operation = 'load',
  status = 'succeeded',
  trigger = 'model',
  callId = `${name}-${operation}-${status}`,
} = {}) {
  return {
    name,
    operation,
    status,
    trigger,
    callId,
    provenance: {
      host: 'fixture',
      mechanism: 'owner-local-lifecycle-fixture',
      observerVersion: '1',
      eventType: 'fixture.skill-lifecycle',
      runId: 'trigger-regression',
      statusSource: 'observed',
    },
  };
}

function triggerResult(skillEvents) {
  return {
    status: 'succeeded',
    observations: {
      packageSkills: ['agent-writing', 'writing-foundation'],
      hostAvailableSkills: null,
      preExecutionInventory: {
        skillDefinitions: [],
        plugins: [],
        ruleSources: [],
        packageDigest: '0'.repeat(64),
        truncated: false,
      },
      skillEvents,
      routing: {
        requestedSkill: 'agent-writing',
        resolvedSkills: ['writing-foundation', 'agent-writing'],
      },
      responses: [{ text: 'Activation is not inferred from this response.' }],
      artifacts: [],
      toolUses: [{ name: 'Skill', outcome: 'succeeded' }],
      attemptedMutations: [],
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

function loadPackageClosureCases() {
  const definition = readJson(path.join(
    skillRoot,
    'evals',
    'package-closure.json',
  ));
  assert.deepEqual(definition, {
    version: 1,
    scope: 'agent-writing-package-closure',
    owner: 'agent-writing',
    cases: [{
      id: 'missing-writing-foundation',
      consumer: 'agent-writing',
      missing_dependency: 'writing-foundation',
      expected_failure: {
        stage: 'dependency-resolution',
        code: 'missing-internal-dependency',
        message: 'Missing internal dependency "writing-foundation"',
        missingSkill: 'writing-foundation',
      },
      covered_clauses: ['aw-missing-dependency'],
    }],
  });
  definitions.set(definition.scope, {
    skill_name: definition.owner,
    evals: definition.cases,
  });
  return definition;
}

function normalizedResult({
  output,
  invokedSkills,
  packageSkills = invokedSkills,
  observedSkillEvents = invokedSkills.map((name) => skillEvent(name)),
}) {
  return {
    status: 'succeeded',
    observations: {
      packageSkills,
      hostAvailableSkills: null,
      preExecutionInventory: {
        skillDefinitions: packageSkills.map((name) => ({
          name,
          path: `.fixture/skills/${name}/SKILL.md`,
          digest: '0'.repeat(64),
        })),
        plugins: [],
        ruleSources: [],
        packageDigest: '0'.repeat(64),
        truncated: false,
      },
      skillEvents: observedSkillEvents,
      routing: {
        requestedSkill: 'agent-writing',
        resolvedSkills: invokedSkills,
      },
      responses: [{ text: output }],
      artifacts: [{
        reference: 'response://0',
        mediaType: 'text/markdown',
      }],
      toolUses: [],
      attemptedMutations: [],
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

function createPackageFixture(t) {
  const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'issue-16-evals-'));
  t.after(() => fs.rmSync(packageRoot, { recursive: true, force: true }));
  fs.mkdirSync(path.join(packageRoot, 'suite'), { recursive: true });
  fs.copyFileSync(
    path.join(repositoryRoot, 'suite', 'canonical-suite.json'),
    path.join(packageRoot, 'suite', 'canonical-suite.json'),
  );
  for (const name of ['agent-writing', 'writing-foundation']) {
    const destination = path.join(packageRoot, 'skills', name, 'SKILL.md');
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(
      path.join(repositoryRoot, 'skills', name, 'SKILL.md'),
      destination,
    );
  }
  return packageRoot;
}

test('owner-local definitions isolate roles, the dependency edge, and the public outcome', () => {
  const foundationRole = loadDefinition('writing-foundation', 'role.json');
  const agentRole = loadDefinition('agent-writing', 'role.json');
  const component = loadDefinition('agent-writing', 'component.json');
  const outcome = loadDefinition('agent-writing', 'outcome.json');

  assert.equal(foundationRole.evaluation.layer, 'role');
  assert.equal(agentRole.evaluation.layer, 'role');
  assert.deepEqual(
    agentRole.evals[0].covered_clauses.filter((clause) => clause.startsWith('wf-')),
    [],
  );
  assert.equal(component.evaluation.layer, 'component');
  assert.deepEqual(component.evaluation.arms, ['treatment', 'component-ablation']);
  assert.equal(component.evals[0].ablated_dependency, 'writing-foundation');
  assert.deepEqual(component.evals[0].covered_clauses, ['aw-foundation-edge']);
  assert.equal(outcome.evaluation.layer, 'outcome');
  assert.deepEqual(outcome.evaluation.arms, ['no-skill', 'treatment']);
  for (const definition of [foundationRole, agentRole, component, outcome]) {
    assert.deepEqual(definition.evaluation.hosts, ['claude-code', 'cursor']);
  }
});

test('outcome load declaration gates matched judging on exact successful events', async (t) => {
  const definition = loadDefinition('agent-writing', 'outcome.json');
  const caseDefinition = definition.evals[0];
  assert.deepEqual(caseDefinition.required_skill_loads, [
    'agent-writing',
    'writing-foundation',
  ]);
  assert.equal(
    validateEvaluationDefinition(definition, repositoryRoot),
    definition,
  );
  const manifest = createCampaignManifest({
    repositoryRoot,
    definition,
    packageRevision: 'issue-16-required-loads',
    cells: [{ host: 'claude-code', model: 'test-model' }],
    repetitions: 1,
    executionConfiguration: { timeout_ms: 1000, tools: [] },
    limitations: ['Owner-local lifecycle gate regression; no model execution.'],
    controlPolicy: {
      target: 'agent-writing',
      dependencies: ['writing-foundation'],
      aliases: [],
      conflictingOwners: [],
    },
  });
  assert.deepEqual(manifest.cases[0].required_skill_loads, [
    'agent-writing',
    'writing-foundation',
  ]);
  assert.deepEqual(manifest.skill_load_authority.resolved_skills, [
    'writing-foundation',
    'agent-writing',
  ]);

  const fixtureRoot = createPackageFixture(t);
  const output = fs.readFileSync(
    path.join(skillRoot, 'evals', 'fixtures', 'outcome-output.md'),
    'utf8',
  );
  async function runWith(skillEvents) {
    let treatmentGrades = 0;
    const records = await runMatchedEvaluation({
      repositoryRoot: fixtureRoot,
      manifest,
      caseDefinition,
      cell: manifest.cells[0],
      repetition: 1,
      async executeArm({ arm }) {
        const treatment = arm === 'treatment';
        return normalizedResult({
          output: treatment ? output : 'Independent control.',
          invokedSkills: treatment
            ? ['writing-foundation', 'agent-writing']
            : [],
          packageSkills: treatment
            ? ['agent-writing', 'writing-foundation']
            : [],
          observedSkillEvents: treatment ? skillEvents : [],
        });
      },
      gradeOutput({ arm, output: resultOutput }) {
        const grade = gradeDeterministicOutput({
          definition,
          caseDefinition,
          output: resultOutput,
        });
        if (arm === 'treatment') treatmentGrades += 1;
        return arm === 'treatment'
          ? grade
          : { ...grade, passed: true, status: 'baseline' };
      },
    });
    return {
      treatmentGrades,
      control: records.find(({ arm }) => arm.kind === 'no-skill'),
      treatment: records.find(({ arm }) => arm.kind === 'treatment'),
    };
  }

  for (const [label, events] of [
    ['target only', [skillEvent('agent-writing')]],
    ['wrong dependency', [
      skillEvent('agent-writing'),
      skillEvent('skill-mechanics'),
    ]],
    ['failed dependency', [
      skillEvent('agent-writing'),
      skillEvent('writing-foundation', { status: 'failed' }),
    ]],
  ]) {
    const run = await runWith(events);
    assert.equal(run.treatmentGrades, 0, label);
    assert.equal(run.treatment.deterministic.passed, false, label);
    assert.throws(
      () => createBlindComparison({
        manifest,
        definition,
        caseDefinition,
        repetition: 1,
        control: run.control,
        treatment: run.treatment,
        judgeModel: 'judge-model',
      }),
      /required Skill load gate failed/,
      label,
    );
  }

  const complete = await runWith([
    skillEvent('agent-writing'),
    skillEvent('writing-foundation'),
  ]);
  assert.equal(complete.treatmentGrades, 1);
  assert.equal(complete.treatment.deterministic.passed, true);
  assert.doesNotThrow(() => createBlindComparison({
    manifest,
    definition,
    caseDefinition,
    repetition: 1,
    control: complete.control,
    treatment: complete.treatment,
    judgeModel: 'judge-model',
  }));
});

test('component orchestration sends one neutral task and owns Foundation ablation', async (t) => {
  const definition = loadDefinition('agent-writing', 'component.json');
  const caseDefinition = definition.evals[0];
  assert.deepEqual(definition.global_required_signals, [
    'aw-foundation-edge-terminology',
    'aw-foundation-edge-work-product',
  ]);
  assert.equal(
    definition.judge.dimensions.every(({ description }) => (
      /(?:quote|cite|reference).*output evidence/i.test(description)
    )),
    true,
  );
  assert.doesNotMatch(
    caseDefinition.prompt,
    /\b(?:ablat(?:e|ed|ion)|control|both arms|same host-neutral scenario)\b/i,
  );

  const manifest = createCampaignManifest({
    repositoryRoot,
    definition,
    packageRevision: 'issue-16-component-regression',
    cells: [{ host: 'claude-code', model: 'test-model' }],
    repetitions: 1,
    executionConfiguration: { timeout_ms: 1000, tools: [] },
    limitations: ['Owner-local orchestration regression; no model execution.'],
  });
  const executions = [];
  const adapter = defineTestAdapter({
    name: 'issue-16-component-ablation',
    async execute(invocation, context) {
      executions.push({
        prompt: invocation.prompt,
        resolvedSkills: [...context.resolvedSkills],
        dependencyAblation: context.dependencyAblation,
      });
      return normalizedResult({
        output: 'Static component fixture.',
        invokedSkills: [...context.resolvedSkills],
        packageSkills: [...context.packageSkills],
      });
    },
  });

  const records = await runComponentEvaluation({
    repositoryRoot: createPackageFixture(t),
    manifest,
    definition,
    caseDefinition,
    cell: manifest.cells[0],
    repetition: 1,
    adapter,
    gradeOutput({ arm }) {
      return {
        passed: true,
        checks: [],
        status: arm === 'treatment' ? 'passed' : 'baseline',
      };
    },
  });

  assert.equal(executions.length, 2);
  assert.deepEqual(
    executions.map(({ prompt }) => prompt),
    [caseDefinition.prompt, caseDefinition.prompt],
  );
  assert.deepEqual(executions[0], {
    prompt: caseDefinition.prompt,
    resolvedSkills: ['writing-foundation', 'agent-writing'],
    dependencyAblation: null,
  });
  assert.deepEqual(executions[1], {
    prompt: caseDefinition.prompt,
    resolvedSkills: ['agent-writing'],
    dependencyAblation: {
      consumer: 'agent-writing',
      dependency: 'writing-foundation',
    },
  });
  assert.deepEqual(
    records.map(({ arm }) => arm.kind),
    ['treatment', 'component-ablation'],
  );
});

test('Agent Writing trigger cases cover every positive and exclusion boundary', () => {
  const definition = loadDefinition('agent-writing', 'trigger.json');

  assert.equal(definition.evaluation.layer, 'trigger');
  assert.deepEqual(
    definition.evals.map(({ name, should_trigger }) => [name, should_trigger]),
    [
      ['agent-consumed-artifact', true],
      ['agent-skill-package-exclusion', false],
      ['fresh-context-handoff-exclusion', false],
      ['human-facing-expression-exclusion', false],
      ['ambiguous-primary-reader', false],
      ['canonical-direct-invocation', true],
    ],
  );
  assert.match(definition.evals.at(-1).prompt, /^\/agent-writing\b/);
  assert.deepEqual(definition.evals[0].required_skill_loads, [
    'writing-foundation',
  ]);
  assert.equal(definition.evals.at(-1).canonical_invocation, true);
  assert.deepEqual(definition.evals.at(-1).required_skill_loads, [
    'writing-foundation',
  ]);
});

test('Agent Writing trigger grading consumes exact ordered lifecycle evidence', () => {
  const definition = loadDefinition('agent-writing', 'trigger.json');
  const positive = definition.evals[0];
  const canonical = definition.evals.at(-1);
  const grade = (caseDefinition, skillEvents) => gradeTriggerResult({
    definition,
    caseDefinition,
    result: triggerResult(skillEvents),
  });
  const completeLifecycle = [
    skillEvent('agent-writing', { status: 'started' }),
    skillEvent('agent-writing'),
    skillEvent('writing-foundation'),
  ];

  assert.equal(grade(positive, completeLifecycle).passed, true);
  assert.equal(
    grade(positive, [skillEvent('writing-foundation')]).passed,
    false,
    'dependency-only activation must not satisfy Agent Writing',
  );
  assert.equal(
    grade(positive, [skillEvent('skill-writing')]).passed,
    false,
    'a wrong Skill must not satisfy Agent Writing',
  );
  assert.equal(
    grade(positive, [skillEvent('agent-writing')]).passed,
    false,
    'the declared Foundation edge must be observed',
  );
  assert.equal(grade(canonical, completeLifecycle).passed, true);

  for (const negative of definition.evals.filter(({ should_trigger }) => (
    !should_trigger
  ))) {
    assert.equal(
      grade(negative, [skillEvent('skill-writing')]).passed,
      true,
      negative.id,
    );
    assert.equal(
      grade(negative, [skillEvent('agent-writing', {
        operation: 'select',
        status: 'rejected',
      })]).passed,
      false,
      `${negative.id} must reject any exact target attempt`,
    );
  }
});

test('Contract coverage maps every clause to a case owned by the highest Skill', () => {
  loadDefinition('writing-foundation', 'role.json');
  loadDefinition('writing-foundation', 'trigger.json');
  loadDefinition('agent-writing', 'role.json');
  loadDefinition('agent-writing', 'trigger.json');
  loadDefinition('agent-writing', 'component.json');
  loadDefinition('agent-writing', 'outcome.json');
  loadPackageClosureCases();
  const coverage = readJson(path.join(skillRoot, 'evals', 'contract-coverage.json'));
  const entries = new Map(coverage.clauses.map((entry) => [entry.id, entry]));

  assert.deepEqual(
    [...entries.keys()].sort(),
    [...expectedCoverage.keys()].sort(),
  );
  for (const [clause, owner] of expectedCoverage) {
    const entry = entries.get(clause);
    assert.equal(entry.owner, owner, clause);
    assert.ok(entry.cases.length > 0, `${clause} must have a case`);
    for (const reference of entry.cases) {
      const definition = definitions.get(reference.scope);
      assert.ok(definition, `${reference.scope} must identify a definition`);
      assert.equal(definition.skill_name, owner, `${clause} has the wrong owner`);
      const caseDefinition = definition.evals.find(
        ({ id }) => String(id) === String(reference.id),
      );
      assert.ok(caseDefinition, caseKey(reference.scope, reference.id));
      assert.equal(
        caseDefinition.covered_clauses.includes(clause),
        true,
        `${caseKey(reference.scope, reference.id)} must cover ${clause}`,
      );
    }
  }
});

test('Agent Writing role separates mechanical gates from semantic judgment', () => {
  const definition = loadDefinition('agent-writing', 'role.json');
  const caseDefinition = definition.evals[0];
  const conciseAlternate = [
    '`deploy-status.json` is `read-only`.',
    'Use the exact `DAG frontier` term.',
    'The retry source is the `environment`.',
  ].join('\n');
  const grade = (output) => gradeDeterministicOutput({
    definition,
    caseDefinition,
    output,
  });

  assert.equal(grade(conciseAlternate).passed, true);
  assert.deepEqual(definition.global_required_signals, [
    'aw-artifact-name',
    'aw-terminology',
    'aw-input-mode',
    'aw-environment-source',
  ]);
  for (const [literal, replacement] of [
    ['deploy-status.json', 'status-input.json'],
    ['DAG frontier', 'deployment frontier'],
    ['read-only', 'immutable'],
    ['environment', 'runtime source'],
  ]) {
    assert.equal(
      grade(conciseAlternate.replace(literal, replacement)).passed,
      false,
      literal,
    );
  }

  const semanticRequirements = [
    ...caseDefinition.expectations,
    ...definition.judge.dimensions.map(({ description }) => description),
  ].join(' ');
  assert.match(semanticRequirements, /success.*failure|failure.*success/i);
  assert.match(semanticRequirements, /failure-only/i);
  assert.match(semanticRequirements, /environment.*(?:cache|persist)|(?:cache|persist).*environment/i);
  assert.equal(
    definition.judge.dimensions.every(({ description }) => (
      /(?:quote|cite|reference).*output evidence/i.test(description)
    )),
    true,
  );
  assert.deepEqual(caseDefinition.files, [
    'evals/fixtures/deploy-status-source.json',
  ]);
});

test('Agent Writing outcome keeps only unambiguous deterministic gates', () => {
  const definition = loadDefinition('agent-writing', 'outcome.json');
  const caseDefinition = definition.evals[0];
  const fixtureOutput = fs.readFileSync(
    path.join(skillRoot, 'evals', 'fixtures', 'outcome-output.md'),
    'utf8',
  );
  const semanticCounterexample = [
    fixtureOutput,
    'On success, disclose the recovery guide.',
    'The environment command is kept in local state.',
    'An alternative object is {"maxAttempts":4,"backoff":"linear"}.',
  ].join('\n');
  const grade = (output) => gradeDeterministicOutput({
    definition,
    caseDefinition,
    output,
  });

  assert.equal(grade(fixtureOutput).passed, true);
  assert.equal(
    grade(semanticCounterexample).passed,
    true,
    'semantic defects are adoption evidence, not regex facts',
  );
  assert.deepEqual(definition.global_required_signals, [
    'aw-artifact-name',
    'aw-terminology',
    'aw-execution-semantics',
    'aw-input-mode',
    'aw-environment-source',
  ]);
  const corrupted = fixtureOutput.replace(
    '`{"maxAttempts":3}`',
    '`{"maxAttempts":4}`',
  );
  const failing = grade(corrupted);
  assert.equal(failing.passed, false);
  assert.equal(
    failing.checks.find(({ name }) => (
      name === 'signal aw-execution-semantics'
    )).passed,
    false,
  );

  const semanticRequirements = [
    ...caseDefinition.expectations,
    ...definition.judge.dimensions.map(({ description }) => description),
  ].join(' ');
  assert.match(semanticRequirements, /failure-only/i);
  assert.match(semanticRequirements, /environment.*(?:cache|persist|local state)/i);
  assert.match(semanticRequirements, /contradict/i);
  assert.equal(
    definition.judge.dimensions.every(({ description }) => (
      /(?:quote|cite|reference).*output evidence/i.test(description)
    )),
    true,
  );

  const manifest = createCampaignManifest({
    repositoryRoot,
    definition,
    packageRevision: 'db26f9d7410b982995a8f7b5a50ef045238a4fd4',
    cells: [{ host: 'claude-code', model: 'test-model' }],
    repetitions: 1,
    executionConfiguration: { timeout_ms: 1000, tools: [] },
    limitations: ['Static fixture only; no model behavior claim.'],
    controlPolicy: {
      target: 'agent-writing',
      dependencies: ['writing-foundation'],
      aliases: [],
      conflictingOwners: [],
    },
  });
  const cell = manifest.cells[0];
  const control = createRunEvidence({
    manifest,
    caseDefinition,
    cell,
    repetition: 1,
    arm: 'no-skill',
    result: normalizedResult({ output: 'Baseline response.', invokedSkills: [] }),
    deterministicGrade: { passed: true, checks: [], status: 'baseline' },
  });
  const treatment = createRunEvidence({
    manifest,
    caseDefinition,
    cell,
    repetition: 1,
    arm: 'treatment',
    result: normalizedResult({
      output: corrupted,
      invokedSkills: ['writing-foundation', 'agent-writing'],
    }),
    deterministicGrade: failing,
  });
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
    /deterministic gate failed before judging/,
  );

  const boundary = fs.readFileSync(
    path.join(skillRoot, 'evals', 'README.md'),
    'utf8',
  );
  assert.match(boundary, /deterministic.*mechanical/i);
  assert.match(boundary, /blind.*judg/i);
  assert.match(boundary, /sampled human review/i);
  assert.match(boundary, /non-overridable/i);
});
