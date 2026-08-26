'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  defineProductionAdapter,
  discoverCanonicalPackage,
  executeProduction,
  loadCanonicalSuite,
} = require('../../../suite');
const {
  createCampaignManifest,
  runComponentEvaluation,
  runMatchedEvaluation,
  runTriggerEvaluation,
  validateEvaluationDefinition,
} = require('../../../suite/evaluation');
const { defineTestAdapter } = require('../../../suite/testing');
const {
  gradeHumanWritingResult,
  gradeRoutingEvidence,
  gradeRoutingResult,
  loadDefinitions,
  protectedSegmentsFromPrompt,
} = require('../evals');
const {
  PRIMARY_TRACER_NAMES,
  SUPPORT_TRACER_NAMES,
  routingTraceFor,
  tracerSkillDocument,
} = require('./fixtures/routing-tracers');

const repositoryRoot = path.resolve(__dirname, '..', '..', '..');
const fixtureRoot = path.join(__dirname, 'fixtures');
const foundationFixturePath = path.join(
  fixtureRoot,
  'writing-foundation.skill.md',
);

function normalizedResult({
  output,
  invokedSkills,
  discoveredSkills = invokedSkills,
  model = 'test-model',
  toolUses = [],
}) {
  return {
    status: 'succeeded',
    observations: {
      discoveredSkills,
      routing: {
        requestedSkill: 'to-humans',
        invokedSkills,
      },
      responses: [{ text: output }],
      artifacts: [],
      toolUses,
      attemptedMutations: [],
    },
    failure: null,
    durationMs: 1,
    costUsd: 0,
    model: {
      requested: model,
      resolved: `${model}-resolved`,
    },
  };
}

function copySkillIntoPackage(packageRoot, skillName, sourcePath) {
  const skillDirectory = path.join(packageRoot, 'skills', skillName);
  fs.mkdirSync(skillDirectory, { recursive: true });
  fs.copyFileSync(sourcePath, path.join(skillDirectory, 'SKILL.md'));
}

function writeSkillIntoPackage(packageRoot, skillName, contents) {
  const skillDirectory = path.join(packageRoot, 'skills', skillName);
  fs.mkdirSync(skillDirectory, { recursive: true });
  fs.writeFileSync(path.join(skillDirectory, 'SKILL.md'), contents);
}

function createPackageFixture(
  t,
  { includeFoundation = true, includeRoutingTracers = false } = {},
) {
  const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'to-humans-package-'));
  t.after(() => fs.rmSync(packageRoot, { recursive: true, force: true }));
  fs.mkdirSync(path.join(packageRoot, 'suite'), { recursive: true });
  fs.copyFileSync(
    path.join(repositoryRoot, 'suite', 'canonical-suite.json'),
    path.join(packageRoot, 'suite', 'canonical-suite.json'),
  );

  copySkillIntoPackage(
    packageRoot,
    'to-humans',
    path.join(repositoryRoot, 'skills', 'to-humans', 'SKILL.md'),
  );

  if (includeFoundation) {
    copySkillIntoPackage(
      packageRoot,
      'writing-foundation',
      foundationFixturePath,
    );
  }
  if (includeRoutingTracers) {
    for (const skillName of [
      ...PRIMARY_TRACER_NAMES,
      ...SUPPORT_TRACER_NAMES,
    ]) {
      writeSkillIntoPackage(
        packageRoot,
        skillName,
        tracerSkillDocument(skillName),
      );
    }
  }
  return packageRoot;
}

function definitionFor(definitions, layer) {
  const definition = definitions.find((candidate) => (
    candidate.evaluation.layer === layer
  ));
  assert.ok(definition, `missing ${layer} definition`);
  return definition;
}

function manifestFor(definition, host = 'claude-code') {
  return createCampaignManifest({
    definition,
    packageRevision: 'db26f9d7410b982995a8f7b5a50ef045238a4fd4',
    cells: [{ host, model: 'test-model' }],
    repetitions: 1,
    executionConfiguration: {
      timeout_ms: 1_000,
      tools: ['Skill'],
    },
    limitations: [
      'Test fixtures prove contracts without making an adoption claim.',
    ],
  });
}

function runRoutingCase({
  packageRoot,
  trigger,
  caseDefinition,
  host,
  changeTrace = (trace) => trace,
}) {
  const manifest = manifestFor(trigger, host);
  return runTriggerEvaluation({
    repositoryRoot: packageRoot,
    manifest,
    definition: trigger,
    caseDefinition,
    cell: manifest.cells[0],
    repetition: 1,
    async execute({ cell, packageDefinition }) {
      const trace = changeTrace(routingTraceFor(caseDefinition.id));
      return normalizedResult({
        invokedSkills: trace.invokedSkills,
        discoveredSkills: packageDefinition.skills.map(({ name }) => name),
        model: cell.model,
        toolUses: trace.invokedSkills.includes('to-humans')
          ? [{ name: 'Skill', outcome: 'invoked to-humans tracer' }]
          : [],
        output: JSON.stringify({
          kind: 'to-humans-routing-observation',
          selected: trace.invokedSkills,
          deliverables: trace.deliverables,
        }),
      });
    },
  });
}

function assertFailedCheck(grade, checkName) {
  assert.equal(
    grade.checks.some(({ name, passed }) => (
      name === checkName && passed === false
    )),
    true,
    `missing failed check "${checkName}"`,
  );
}

test('canonical package discovers To Humans as the Audience outcome', (t) => {
  const suite = loadCanonicalSuite(repositoryRoot);
  const classification = suite.inventory.find(({ name }) => name === 'to-humans');
  const packageRoot = createPackageFixture(t, { includeFoundation: false });
  const packageDefinition = discoverCanonicalPackage(packageRoot);

  assert.deepEqual(classification, {
    name: 'to-humans',
    classification: 'audience',
  });
  assert.equal(
    packageDefinition.skills.some(({ name }) => name === 'to-humans'),
    true,
  );
  assert.equal(
    suite.runtimeEdges.some(({ consumer, dependency }) => (
      consumer === 'to-humans' && dependency === 'writing-foundation'
    )),
    true,
  );
});

test('production execution fails closed on the exact missing Foundation name', async (t) => {
  const packageRoot = createPackageFixture(t, { includeFoundation: false });
  let executions = 0;
  const adapter = defineProductionAdapter({
    name: 'missing-foundation-fixture',
    async execute() {
      executions += 1;
      throw new Error('must not execute');
    },
  });

  const result = await executeProduction({
    repositoryRoot: packageRoot,
    adapter,
    invocation: {
      requestId: 'missing-writing-foundation',
      skill: 'to-humans',
      prompt: 'Write a project status update for the team.',
      model: 'test-model',
    },
  });

  assert.equal(executions, 0);
  assert.deepEqual(result.failure, {
    stage: 'dependency-resolution',
    code: 'missing-internal-dependency',
    message: 'Missing internal dependency "writing-foundation"',
    missingSkill: 'writing-foundation',
  });
  assert.deepEqual(result.observations.responses, []);
  assert.deepEqual(result.observations.artifacts, []);
});

test('complete production closure invokes only To Humans and Foundation', async (t) => {
  const packageRoot = createPackageFixture(t);
  const adapter = defineProductionAdapter({
    name: 'complete-to-humans-fixture',
    async execute(invocation, context) {
      return normalizedResult({
        output: 'Approve option A.\n\nBasis: It meets the stated deadline.',
        invokedSkills: context.resolvedSkills,
        discoveredSkills: context.discoveredSkills,
        model: invocation.model,
      });
    },
  });

  const result = await executeProduction({
    repositoryRoot: packageRoot,
    adapter,
    invocation: {
      requestId: 'complete-to-humans',
      skill: 'to-humans',
      prompt: 'Recommend one option to the project lead.',
      model: 'test-model',
    },
  });

  assert.deepEqual(result.observations.routing.invokedSkills, [
    'writing-foundation',
    'to-humans',
  ]);
});

test('test-only Foundation fixture stays outside package construction', (t) => {
  const packageRoot = createPackageFixture(t, { includeFoundation: false });
  const copiedFixtureDirectory = path.join(
    packageRoot,
    'skills',
    'to-humans',
    'test',
    'fixtures',
  );
  fs.mkdirSync(copiedFixtureDirectory, { recursive: true });
  fs.copyFileSync(
    foundationFixturePath,
    path.join(copiedFixtureDirectory, 'writing-foundation.skill.md'),
  );

  assert.equal(fs.existsSync(foundationFixturePath), true);
  assert.equal(
    fs.readdirSync(fixtureRoot).some((name) => name === 'SKILL.md'),
    false,
  );
  assert.equal(
    discoverCanonicalPackage(packageRoot).skills
      .some(({ name }) => name === 'writing-foundation'),
    false,
  );
});

test('owner-local definitions cover every To Humans contract layer', () => {
  const definitions = loadDefinitions();
  assert.deepEqual(
    definitions.map(({ evaluation }) => evaluation.layer).sort(),
    ['component', 'outcome', 'role', 'trigger'],
  );
  definitions.forEach((definition) => {
    assert.strictEqual(validateEvaluationDefinition(definition), definition);
    assert.deepEqual(definition.evaluation.hosts, ['claude-code', 'cursor']);
  });

  const trigger = definitionFor(definitions, 'trigger');
  const exactTriggerCoverage = {
    'non-prose-false-activation': ['non-prose-fidelity'],
    'private-dependency-false-activation': [
      'private-dependency-false-activation',
    ],
  };
  for (const [caseId, expectedClauses] of Object.entries(exactTriggerCoverage)) {
    const caseDefinition = trigger.evals.find(({ id }) => id === caseId);
    assert.deepEqual(
      caseDefinition.covers,
      expectedClauses,
      `${caseId} must not satisfy an unrelated exclusion clause`,
    );
  }

  const covered = new Set(definitions.flatMap(({ evals }) => (
    evals.flatMap(({ covers = [] }) => covers)
  )));
  for (const clause of [
    'answer-first',
    'requested-breadth',
    'reader-calibration',
    'scan-structure',
    'action-grouping',
    'plain-wording',
    'concrete-attribution',
    'decision-support',
    'neutral-record',
    'contextual-voice',
    'no-em-dash',
    'non-prose-fidelity',
    'private-dependency-false-activation',
    'audience-routing',
    'primary-co-selection',
    'agent-facing-exclusion',
    'mixed-reader-routing',
    'writing-foundation-edge',
    'matched-no-skill-control',
  ]) {
    assert.equal(covered.has(clause), true, `missing contract clause ${clause}`);
  }
});

test('deterministic writing grader accepts alternate wording and keeps hard gates', () => {
  const role = definitionFor(loadDefinitions(), 'role');
  const caseDefinition = role.evals.find(({ id }) => id === 'human-status');
  const result = normalizedResult({
    invokedSkills: ['writing-foundation', 'to-humans'],
    output: [
      'A limited rollout is the safest move today.',
      '',
      '- Release engineering starts with the internal group.',
      '- Customer support confirms the customer notice.',
      '- Security verifies that the exception expires Friday.',
      '',
      'This keeps the rollback window open while peak demand remains untested.',
    ].join('\n'),
  });

  const grade = gradeHumanWritingResult({
    evaluationDefinition: role,
    caseDefinition,
    result,
  });
  assert.equal(grade.passed, true, JSON.stringify(grade, null, 2));

  const incomplete = structuredClone(result);
  incomplete.observations.responses[0].text = [
    'The staged rollout could proceed today \u2014 details follow.',
    '',
    'Release owner: start with the internal group.',
  ].join('\n');
  const failed = gradeHumanWritingResult({
    evaluationDefinition: role,
    caseDefinition,
    result: incomplete,
  });
  assert.equal(failed.passed, false);
  assertFailedCheck(failed, 'requested item security');
  assertFailedCheck(failed, 'no em dash in prose');
});

test('deterministic writing grader preserves protected non-prose exactly', () => {
  const role = definitionFor(loadDefinitions(), 'role');
  const caseDefinition = role.evals.find(({ id }) => id === 'protected-content');
  const protectedSegments = protectedSegmentsFromPrompt(caseDefinition.prompt);
  assert.equal(Object.hasOwn(caseDefinition, 'protected_segments'), false);
  assert.equal(protectedSegments.length, 2);
  protectedSegments.forEach((segment) => {
    assert.equal(caseDefinition.prompt.includes(segment), true);
  });
  const output = [
    'Use the payload unchanged.',
    '',
    ...protectedSegments,
    '',
    'Owner: API maintainers verify the sample before publication.',
  ].join('\n');
  const result = normalizedResult({
    invokedSkills: ['writing-foundation', 'to-humans'],
    output,
  });

  const grade = gradeHumanWritingResult({
    evaluationDefinition: role,
    caseDefinition,
    result,
  });
  assert.equal(grade.passed, true, JSON.stringify(grade, null, 2));

  const changed = structuredClone(result);
  changed.observations.responses[0].text = output.replace(
    '"retry-count": 3',
    '"retryCount": 3',
  );
  const failed = gradeHumanWritingResult({
    evaluationDefinition: role,
    caseDefinition,
    result: changed,
  });
  assert.equal(failed.passed, false);
  assertFailedCheck(failed, 'protected segment 1 unchanged');
});

test('routing cases use the trigger seam and grade exact observed routing', async (t) => {
  const trigger = definitionFor(loadDefinitions(), 'trigger');
  const packageRoot = createPackageFixture(t, { includeRoutingTracers: true });

  for (const host of ['claude-code', 'cursor']) {
    for (const caseDefinition of trigger.evals) {
      const evidence = await runRoutingCase({
        packageRoot,
        trigger,
        caseDefinition,
        host,
      });
      const grade = gradeRoutingEvidence({
        trigger,
        caseDefinition,
        evidence,
      });
      assert.equal(
        evidence.deterministic.passed,
        true,
        `${host}/${caseDefinition.id}: shared trigger seam failed`,
      );
      assert.equal(
        grade.passed,
        true,
        `${host}/${caseDefinition.id}: ${JSON.stringify(grade, null, 2)}`,
      );
    }
  }

  const suite = loadCanonicalSuite(repositoryRoot);
  assert.equal(
    suite.runtimeEdges.some(({ consumer, dependency }) => (
      (consumer === 'to-humans' && dependency === 'engineering-guidance')
      || (consumer === 'engineering-guidance' && dependency === 'to-humans')
    )),
    false,
  );
});

test('routing evidence rejects overactivation and missing Primary co-selection', async (t) => {
  const trigger = definitionFor(loadDefinitions(), 'trigger');
  const packageRoot = createPackageFixture(t, { includeRoutingTracers: true });
  const positive = trigger.evals.find(({ id }) => id === 'ordinary-human-reply');
  const overactivated = await runRoutingCase({
    packageRoot,
    trigger,
    caseDefinition: positive,
    host: 'cursor',
    changeTrace(trace) {
      trace.invokedSkills.push('agent-writing');
      return trace;
    },
  });
  const overactivationGrade = gradeRoutingEvidence({
    trigger,
    caseDefinition: positive,
    evidence: overactivated,
  });
  assert.equal(overactivationGrade.passed, false);
  assertFailedCheck(overactivationGrade, 'selected routes exactly');

  const coSelection = trigger.evals.find(({ id }) => (
    id === 'human-engineering-guidance'
  ));
  const missingPrimary = await runRoutingCase({
    packageRoot,
    trigger,
    caseDefinition: coSelection,
    host: 'claude-code',
    changeTrace(trace) {
      trace.invokedSkills = trace.invokedSkills.filter(
        (skill) => skill !== 'engineering-guidance',
      );
      trace.deliverables[0].outcomes = ['to-humans'];
      return trace;
    },
  });
  const coSelectionGrade = gradeRoutingEvidence({
    trigger,
    caseDefinition: coSelection,
    evidence: missingPrimary,
  });
  assert.equal(coSelectionGrade.passed, false);
  assertFailedCheck(coSelectionGrade, 'selected routes exactly');
  assertFailedCheck(coSelectionGrade, 'deliverables routed independently');
});

test('routing grader fails malformed deliverable evidence without throwing', () => {
  const trigger = definitionFor(loadDefinitions(), 'trigger');
  const mixed = trigger.evals.find(({ id }) => id === 'mixed-reader-deliverables');
  const result = normalizedResult({
    invokedSkills: mixed.routing_expectation.selected,
    output: JSON.stringify({
      kind: 'to-humans-routing-observation',
      deliverables: 'not-an-array',
    }),
  });

  const grade = gradeRoutingResult({
    trigger,
    caseDefinition: mixed,
    result,
  });
  assert.equal(grade.passed, false);
  assertFailedCheck(grade, 'deliverables routed independently');
});

test('Foundation component ablation runs through either test Adapter', async (t) => {
  const component = definitionFor(loadDefinitions(), 'component');
  const packageRoot = createPackageFixture(t);

  for (const host of ['claude-code', 'cursor']) {
    const manifest = manifestFor(component, host);
    const adapter = defineTestAdapter({
      name: `${host}-foundation-ablation`,
      async execute(invocation, context) {
        return normalizedResult({
          invokedSkills: context.resolvedSkills,
          discoveredSkills: context.discoveredSkills,
          model: invocation.model,
          output: context.dependencyAblation
            ? 'Test-only ablation trace.'
            : 'Test-only complete trace.',
        });
      },
    });
    const evidence = await runComponentEvaluation({
      repositoryRoot: packageRoot,
      manifest,
      caseDefinition: component.evals[0],
      cell: manifest.cells[0],
      repetition: 1,
      adapter,
      gradeOutput({ arm }) {
        return {
          passed: true,
          status: arm === 'component-ablation' ? 'baseline' : 'treatment',
          checks: [{
            name: 'test-only Adapter completed',
            passed: true,
            details: host,
          }],
        };
      },
    });

    assert.deepEqual(
      evidence.map(({ arm }) => arm.kind),
      ['treatment', 'component-ablation'],
    );
    assert.deepEqual(
      evidence[0].execution.routing.invoked_skills,
      ['writing-foundation', 'to-humans'],
    );
    assert.deepEqual(
      evidence[1].execution.routing.invoked_skills,
      ['to-humans'],
    );
  }
});

test('complete outcome retains a matched No-Skill control', async (t) => {
  const outcome = definitionFor(loadDefinitions(), 'outcome');
  const caseDefinition = outcome.evals[0];
  const manifest = manifestFor(outcome);
  const packageRoot = createPackageFixture(t);
  const evidence = await runMatchedEvaluation({
    repositoryRoot: packageRoot,
    manifest,
    caseDefinition,
    cell: manifest.cells[0],
    repetition: 1,
    async executeArm({ arm, cell }) {
      return normalizedResult({
        model: cell.model,
        invokedSkills: arm === 'treatment'
          ? ['writing-foundation', 'to-humans']
          : [],
        discoveredSkills: arm === 'treatment'
          ? ['to-humans', 'writing-foundation']
          : [],
        output: arm === 'treatment'
          ? [
            'A staged rollout is the safer approach.',
            'Limiting the first cohort caps exposure.',
            'Peak traffic remains untested.',
            'Pause the rollout if load testing fails.',
          ].join('\n')
          : 'There are several options to consider.',
      });
    },
    gradeOutput({ arm, result }) {
      if (arm === 'no-skill') {
        return {
          passed: true,
          status: 'baseline',
          checks: [],
        };
      }
      return gradeHumanWritingResult({
        evaluationDefinition: outcome,
        caseDefinition,
        result,
      });
    },
  });

  assert.deepEqual(
    evidence.map(({ arm }) => arm.kind),
    ['no-skill', 'treatment'],
  );
  assert.equal(
    evidence[1].deterministic.passed,
    true,
    JSON.stringify(evidence[1].deterministic, null, 2),
  );
  assert.equal(evidence[0].arm.pairing_id, evidence[1].arm.pairing_id);
});
