'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
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
  gradeTriggerResult,
  runComponentEvaluation,
  runMatchedEvaluation,
  runTriggerEvaluation,
  validateEvaluationDefinition,
} = require('../../../suite/evaluation');
const {
  defineTestAdapter,
  executeTest,
} = require('../../../suite/testing');
const {
  gradeMechanicalOutput,
  loadDefinitions,
  protectedSegmentsFromPrompt,
} = require('../evals');

const repositoryRoot = path.resolve(__dirname, '..', '..', '..');
const fixtureRoot = path.join(__dirname, 'fixtures');
const foundationFixturePath = path.join(
  fixtureRoot,
  'writing-foundation.skill.md',
);

function normalizedResult({
  output,
  packageSkills = ['to-humans', 'writing-foundation'],
  resolvedSkills = ['writing-foundation', 'to-humans'],
  skillEvents = [],
  model = 'test-model',
  toolUses = [],
}) {
  const digest = (value) => createHash('sha256').update(value).digest('hex');
  return {
    status: 'succeeded',
    observations: {
      packageSkills,
      hostAvailableSkills: null,
      preExecutionInventory: {
        skillDefinitions: resolvedSkills.map((name) => ({
          name,
          path: `.fixture/skills/${name}/SKILL.md`,
          digest: digest(`fixture:${name}`),
        })),
        plugins: [],
        ruleSources: [],
        packageDigest: digest(packageSkills.join('\0')),
        truncated: false,
      },
      skillEvents,
      routing: {
        requestedSkill: 'to-humans',
        resolvedSkills,
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

function fixtureSkillEvent(name, {
  operation = 'load',
  status = 'succeeded',
  trigger = 'model',
  callId = `fixture-${name}`,
  host = 'fixture',
} = {}) {
  return {
    name,
    operation,
    status,
    trigger,
    callId,
    provenance: {
      host,
      mechanism: 'explicit-contract-fixture',
      eventType: 'fixture.skill-lifecycle',
      observerVersion: 'fixture-v2',
      runId: 'fixture-run',
      statusSource: 'observed',
    },
  };
}

function copySkillIntoPackage(packageRoot, skillName, sourcePath) {
  const skillDirectory = path.join(packageRoot, 'skills', skillName);
  fs.mkdirSync(skillDirectory, { recursive: true });
  fs.copyFileSync(sourcePath, path.join(skillDirectory, 'SKILL.md'));
}

function createPackageFixture(
  t,
  { includeFoundation = true } = {},
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
        packageSkills: [...context.packageSkills],
        resolvedSkills: [...context.resolvedSkills],
        skillEvents: context.resolvedSkills.map((name) => (
          fixtureSkillEvent(name)
        )),
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

  assert.deepEqual(result.observations.routing.resolvedSkills, [
    'writing-foundation',
    'to-humans',
  ]);
  assert.deepEqual(
    result.observations.skillEvents.map(({ name }) => name),
    ['writing-foundation', 'to-humans'],
  );
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
  const expectedRoutingCases = {
    'ordinary-human-reply': 'positive',
    'requested-prose': 'positive',
    'canonical-direct': 'canonical',
    'human-engineering-guidance': 'audience-primary',
    'agent-handoff': 'negative',
    'agent-skill-package': 'negative',
    'mixed-reader-deliverables': 'mixed',
    'ambiguous-reader': 'ambiguous',
    'non-prose-false-activation': 'negative',
    'private-dependency-false-activation': 'negative',
  };
  assert.deepEqual(
    Object.fromEntries(trigger.evals.map(({ id, case_category: category }) => (
      [id, category]
    ))),
    expectedRoutingCases,
  );
  trigger.evals.forEach((caseDefinition) => {
    assert.equal(
      Object.hasOwn(caseDefinition, 'routing_expectation'),
      false,
      `${caseDefinition.id} must not encode a synthetic expected route`,
    );
  });
  assert.equal(
    trigger.evals.find(({ id }) => id === 'canonical-direct')
      .canonical_invocation,
    true,
  );
  assert.deepEqual(
    trigger.evals.find(({ id }) => id === 'human-engineering-guidance')
      .required_skill_loads,
    ['writing-foundation', 'engineering-guidance'],
  );
  assert.deepEqual(
    trigger.evals.find(({ id }) => id === 'mixed-reader-deliverables')
      .required_skill_loads,
    ['writing-foundation', 'agent-writing', 'take-it-offline'],
  );

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
    'code-fidelity',
    'schema-fidelity',
    'data-fidelity',
    'quoted-source-fidelity',
  ]) {
    assert.equal(covered.has(clause), true, `missing contract clause ${clause}`);
  }
});

test('shared mechanical grading does not judge semantic prose', () => {
  const definitions = loadDefinitions();
  for (const layer of ['role', 'outcome']) {
    const definition = definitionFor(definitions, layer);
    const semanticCases = definition.evals.filter(({ id }) => id !== 'protected-content');
    for (const caseDefinition of semanticCases) {
      for (const output of [
        'Concise valid prose with freely chosen wording.',
        'Recommendation. Basis. Material uncertainty. Change condition.',
      ]) {
        const grade = gradeMechanicalOutput({
          evaluationDefinition: definition,
          caseDefinition,
          output,
        });
        assert.equal(
          grade.passed,
          true,
          `${layer}/${caseDefinition.id} should defer semantics`,
        );
      }
    }
  }
});

test('semantic cases define evidence-bearing blind-judge assertions', () => {
  const definitions = loadDefinitions();
  for (const definition of definitions) {
    assert.match(definition.judge.evidence_requirement, /quote|reference/i);
    assert.match(definition.judge.evidence_requirement, /output|lifecycle/i);
  }

  const role = definitionFor(definitions, 'role');
  const semanticContract = [
    ...role.judge.dimensions.map(({ description }) => description),
    ...role.evals.flatMap(({ expectations }) => expectations),
  ].join(' ').toLocaleLowerCase('en');
  for (const requiredMeaning of [
    'answer first',
    'accountable owner',
    'recommendation',
    'basis',
    'material uncertainty',
    'change condition',
    'source-grounded',
    'clarity',
    'contextual voice',
    'neutral record',
    'non-hollow',
  ]) {
    assert.equal(
      semanticContract.includes(requiredMeaning),
      true,
      `missing semantic judge coverage for ${requiredMeaning}`,
    );
  }

  const status = role.evals.find(({ id }) => id === 'human-status');
  for (const sourceFact of [
    '14:00',
    'internal cohort',
    'customer notice',
    'before rollout',
    'exception expires Friday',
    'before approval',
  ]) {
    assert.equal(status.prompt.includes(sourceFact), true, sourceFact);
  }

  const decision = role.evals.find(({ id }) => id === 'decision-support');
  for (const sourceFact of [
    'verified rollback',
    'small first cohort, which contains exposure',
    'Peak traffic remains untested',
    'p95 latency stays under 200 ms',
    'passing result supports moving to full deployment',
    'miss means keeping the limited release',
  ]) {
    assert.equal(decision.prompt.includes(sourceFact), true, sourceFact);
  }
});

test('shared mechanical grader preserves protected non-prose exactly', () => {
  const role = definitionFor(loadDefinitions(), 'role');
  const caseDefinition = role.evals.find(({ id }) => id === 'protected-content');
  const protectedSegments = protectedSegmentsFromPrompt(caseDefinition.prompt);
  assert.deepEqual(
    caseDefinition.protected_segments,
    protectedSegments.map((segment) => ({
      ...segment,
      occurrence_count: 1,
    })),
  );
  const output = [
    'Use the supplied artifacts unchanged.',
    '',
    ...protectedSegments.map(({ content }) => content),
    '',
    'Owner: API maintainers verify the sample before publication.',
  ].join('\n');
  const grade = gradeMechanicalOutput({
    evaluationDefinition: role,
    caseDefinition,
    output,
  });
  assert.equal(grade.passed, true, JSON.stringify(grade, null, 2));

  const code = protectedSegments.find(({ category }) => category === 'code').content;
  const corruptions = [
    ['reversed lines', code, code.split('\n').reverse().join('\n'), 'code'],
    ['case mutation', 'function retryCount', 'Function retryCount', 'code'],
    ['whitespace mutation', '  return payload.retry_count;', ' return payload.retry_count;', 'code'],
    ['missing segment', protectedSegments[1].content, '', 'schema'],
    ['truncated segment', protectedSegments[2].content, '{"retry-count": 3}', 'data'],
    ['quote mutation', 'preserve this punctuation.', 'change this punctuation!', 'quote'],
  ];
  for (const [probe, before, after, category] of corruptions) {
    const failed = gradeMechanicalOutput({
      evaluationDefinition: role,
      caseDefinition,
      output: output.replace(before, after),
    });
    assert.equal(failed.passed, false, probe);
    assertFailedCheck(failed, `protected ${category} byte fidelity`);
  }

  const duplicated = gradeMechanicalOutput({
    evaluationDefinition: role,
    caseDefinition,
    output: `${output}\n${protectedSegments[0].content}`,
  });
  assert.equal(duplicated.passed, false);
  assertFailedCheck(duplicated, 'protected code byte fidelity');

  const reordered = gradeMechanicalOutput({
    evaluationDefinition: role,
    caseDefinition,
    output: output.replace(
      `${protectedSegments[0].content}\n${protectedSegments[1].content}`,
      `${protectedSegments[1].content}\n${protectedSegments[0].content}`,
    ),
  });
  assert.equal(reordered.passed, false);
  assertFailedCheck(reordered, 'protected segment order');

  const proseEmDash = gradeMechanicalOutput({
    evaluationDefinition: role,
    caseDefinition,
    output: output.replace(
      'Use the supplied artifacts unchanged.',
      'Use the supplied artifacts — unchanged.',
    ),
  });
  assert.equal(proseEmDash.passed, false);
  assertFailedCheck(proseEmDash, 'no em dash in prose');

  assert.equal(
    output.includes('keep—exact') && output.includes('Quoted source — preserve'),
    true,
  );
  assert.equal(grade.passed, true, 'protected em dashes must remain accepted');
});

test('exact v2 trigger grader uses explicit lifecycle contract fixtures', () => {
  const trigger = definitionFor(loadDefinitions(), 'trigger');
  const positive = trigger.evals.find(({ id }) => id === 'ordinary-human-reply');
  const grade = (caseDefinition, skillEvents) => gradeTriggerResult({
    definition: trigger,
    caseDefinition,
    result: normalizedResult({
      output: 'Lifecycle contract fixture.',
      skillEvents,
    }),
  });

  const exactTargetAndDependency = [
    fixtureSkillEvent('to-humans'),
    fixtureSkillEvent('writing-foundation'),
  ];
  assert.equal(grade(positive, exactTargetAndDependency).passed, true);
  assert.equal(
    grade(positive, [fixtureSkillEvent('writing-foundation')]).passed,
    false,
    'a wrong Skill cannot substitute for the target',
  );
  assert.equal(
    grade(positive, [fixtureSkillEvent('to-humans')]).passed,
    false,
    'an omitted required dependency must fail',
  );
  assert.equal(
    grade(positive, []).passed,
    false,
    'omitted lifecycle evidence must fail',
  );

  const negative = trigger.evals.find(({ id }) => (
    id === 'non-prose-false-activation'
  ));
  assert.equal(
    grade(negative, [fixtureSkillEvent('writing-foundation')]).passed,
    true,
    'sibling lifecycle remains visible on a negative case',
  );
  assert.equal(
    grade(negative, [fixtureSkillEvent('to-humans', {
      operation: 'select',
      status: 'rejected',
    })]).passed,
    false,
    'any target attempt is overactivation on a negative case',
  );

  const coLoading = trigger.evals.find(({ id }) => (
    id === 'human-engineering-guidance'
  ));
  assert.equal(grade(coLoading, [
    fixtureSkillEvent('engineering-guidance'),
    fixtureSkillEvent('writing-foundation'),
    fixtureSkillEvent('to-humans'),
  ]).passed, true);
  assert.equal(grade(coLoading, exactTargetAndDependency).passed, false);

  const invalidEvidence = normalizedResult({
    output: 'Invalid lifecycle fixture.',
    skillEvents: [{
      ...fixtureSkillEvent('to-humans'),
      status: 'completed',
    }],
  });
  assert.throws(
    () => gradeTriggerResult({
      definition: trigger,
      caseDefinition: positive,
      result: invalidEvidence,
    }),
    /skillEvents\[0\]\.status is invalid/,
  );
});

test('contract fixtures validate v2 campaigns through either Adapter', async (t) => {
  const trigger = definitionFor(loadDefinitions(), 'trigger');
  const caseDefinition = trigger.evals.find(({ id }) => (
    id === 'ordinary-human-reply'
  ));
  const packageRoot = createPackageFixture(t);

  for (const host of ['claude-code', 'cursor']) {
    const manifest = manifestFor(trigger, host);
    const adapter = defineTestAdapter({
      name: `${host}-lifecycle-contract-fixture`,
      async execute(invocation, context) {
        return normalizedResult({
          output: 'Explicit lifecycle contract fixture.',
          packageSkills: [...context.packageSkills],
          resolvedSkills: [...context.resolvedSkills],
          model: invocation.model,
          skillEvents: [
            fixtureSkillEvent('writing-foundation', { host }),
            fixtureSkillEvent('to-humans', { host }),
          ],
        });
      },
    });
    const result = await executeTest({
      repositoryRoot: packageRoot,
      adapter,
      invocation: {
        requestId: `${host}-contract-fixture`,
        skill: 'to-humans',
        prompt: caseDefinition.prompt,
        model: manifest.cells[0].model,
      },
    });
    const evidence = await runTriggerEvaluation({
      repositoryRoot: packageRoot,
      manifest,
      definition: trigger,
      caseDefinition,
      cell: manifest.cells[0],
      repetition: 1,
      execute: async () => result,
    });

    assert.equal(evidence.schema_version, 2);
    assert.equal(evidence.deterministic.passed, true);
    assert.deepEqual(
      evidence.execution.skill_events.map(({ name }) => name),
      ['writing-foundation', 'to-humans'],
    );
  }
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
          packageSkills: [...context.packageSkills],
          resolvedSkills: [...context.resolvedSkills],
          skillEvents: context.resolvedSkills.map((name) => (
            fixtureSkillEvent(name, { host })
          )),
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
      evidence[0].execution.routing.resolved_skills,
      ['writing-foundation', 'to-humans'],
    );
    assert.deepEqual(
      evidence[1].execution.routing.resolved_skills,
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
        packageSkills: arm === 'treatment'
          ? ['to-humans', 'writing-foundation']
          : [],
        resolvedSkills: arm === 'treatment'
          ? ['writing-foundation', 'to-humans']
          : [],
        skillEvents: arm === 'treatment'
          ? [
            fixtureSkillEvent('writing-foundation'),
            fixtureSkillEvent('to-humans'),
          ]
          : [],
        output: arm === 'treatment'
          ? [
            'Use a staged rollout today.',
            '',
            'Rollback is verified, and the limited first cohort caps exposure.',
            '',
            'Peak traffic remains untested.',
            '',
            'Switch to a full deployment when the noon load test meets its latency target.',
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
      return gradeMechanicalOutput({
        evaluationDefinition: outcome,
        caseDefinition,
        output: result.observations.responses.map(({ text }) => text).join('\n\n'),
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
