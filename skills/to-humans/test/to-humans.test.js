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
  gradeHumanWritingResult,
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

test('deterministic writing grader accepts alternate wording and keeps hard gates', () => {
  const role = definitionFor(loadDefinitions(), 'role');
  const caseDefinition = role.evals.find(({ id }) => id === 'human-status');
  const result = normalizedResult({
    output: [
      'A limited rollout is the safest move today.',
      '',
      '- At 14:00, release engineering starts with the internal group.',
      '- Customer support prepares the customer notice before rollout.',
      '- Security verifies before approval that the exception expires Friday.',
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

test('deterministic writing grader requires distinct accountable actions', () => {
  const role = definitionFor(loadDefinitions(), 'role');
  const caseDefinition = role.evals.find(({ id }) => id === 'human-status');
  const grade = (lines) => gradeHumanWritingResult({
    evaluationDefinition: role,
    caseDefinition,
    result: normalizedResult({ output: lines.join('\n') }),
  });
  for (const sourceFact of [
    '14:00',
    'internal cohort',
    'customer notice',
    'before rollout',
    'exception expires Friday',
    'before approval',
  ]) {
    assert.equal(
      caseDefinition.prompt.includes(sourceFact),
      true,
      `scenario must supply ${sourceFact}`,
    );
  }
  const concise = grade([
    'Start a staged rollout.',
    'At 14:00, the release lead stages the internal cohort.',
    'Support prepares the customer notice before rollout.',
    'Security verifies before approval that the exception expires Friday.',
  ]);
  assert.equal(concise.passed, true, JSON.stringify(concise, null, 2));
  const unrelatedNegation = grade([
    'Start a staged rollout.',
    'Although the deadline is not flexible, at 14:00 the release lead stages the internal cohort.',
    'Support prepares the customer notice before rollout, not the incident report.',
    'Security verifies before approval that the exception expires Friday, without delay.',
  ]);
  assert.equal(
    unrelatedNegation.passed,
    true,
    JSON.stringify(unrelatedNegation, null, 2),
  );
  const paraphrase = grade([
    'Start a staged rollout.',
    'Release engineering will stage the first cohort at 2 p.m.',
    'Ahead of rollout, customer support will publish the customer message.',
    'Prior to approval, security will confirm the exception expiration Friday.',
  ]);
  assert.equal(paraphrase.passed, true, JSON.stringify(paraphrase, null, 2));
  const qualifierPlacements = [
    [
      'At 14:00, the release lead stages the internal cohort.',
      'Before rollout, support prepares the customer notice.',
      'Before approval, security verifies that the exception expires Friday.',
    ],
    [
      'The release lead, at 14:00, stages the internal cohort.',
      'Support, before rollout, prepares the customer notice.',
      'Security, before approval, verifies that the exception expires Friday.',
    ],
    [
      'The release lead stages at 14:00 the internal cohort.',
      'Support prepares before rollout the customer notice.',
      'Security verifies before approval that the exception expires Friday.',
    ],
    [
      'The release lead stages the internal cohort at 14:00.',
      'Support prepares the customer notice before rollout.',
      'Security verifies that the exception expires Friday before approval.',
    ],
    [
      'The release lead, scheduled for 14:00, stages the internal cohort.',
      'Support, prior to rollout, prepares the customer notice.',
      'Security, prior to approval, verifies that the exception expires Friday.',
    ],
    [
      'The release lead stages the internal cohort at 2:00 PM.',
      'Support prepares the customer notice ahead of rollout.',
      'Security verifies that the exception expires Friday prior to approval.',
    ],
  ];
  for (const [index, actions] of qualifierPlacements.entries()) {
    const placement = grade(['Start a staged rollout.', ...actions]);
    assert.equal(
      placement.passed,
      true,
      `qualifier placement ${index + 1}: ${JSON.stringify(placement, null, 2)}`,
    );
  }

  const probes = [
    [
      'Start a staged rollout today.',
      'Release.',
      'Support.',
      'Security.',
      'Rollback is verified. Peak traffic is untested.',
    ],
    [
      'Start a staged rollout today.',
      'Release owner starts starts.',
      'Support owner confirms confirms.',
      'Security owner verifies verifies.',
    ],
    [
      'Start a staged rollout today.',
      'Release owner starts the internal group and starts the internal group.',
      'Support owner prepares the customer notice and prepares the customer notice.',
      'Security owner reviews the exception expiry and reviews the exception expiry.',
    ],
    [
      'Start a staged rollout today.',
      'Release owner starts internal group release owner starts internal group.',
      'Support owner prepares customer notice support owner prepares customer notice.',
      'Security owner reviews exception expiry security owner reviews exception expiry.',
    ],
    [
      'Start a staged rollout today.',
      'Release support security starts confirms verifies internal group customer notice exception expiry.',
      'Release support security starts confirms verifies internal group customer notice exception expiry.',
      'Release support security starts confirms verifies internal group customer notice exception expiry.',
    ],
    [
      'Start a staged rollout today.',
      'At 14:00 internal cohort release lead stages.',
      'Before rollout customer notice support prepares.',
      'Before approval exception expires Friday security verifies.',
    ],
    [
      'Start a staged rollout today.',
      'At 14:00 the release lead starts the customer notice and mentions the internal cohort.',
      'Before rollout support prepares the exception and mentions the customer notice.',
      'Before approval security reviews the internal cohort and mentions the exception expiry Friday.',
    ],
    [
      'Start a staged rollout today.',
      'At 14:00 the release lead stages the agenda, noting the internal cohort.',
      'Support prepares no customer notice before rollout.',
      'Before approval security verifies the checklist, noting the exception expires Friday.',
    ],
    [
      'Start a staged rollout today.',
      'At 14:00 the release lead never stages the internal cohort.',
      'Support does not prepare the customer notice before rollout.',
      'Security never verifies before approval that the exception expires Friday.',
    ],
    [
      'Start a staged rollout today.',
      'At 14:00 the release lead watches while the project manager stages the internal cohort.',
      'Before rollout the support owner watches as the project manager prepares the customer notice.',
      'Before approval the security owner watches as the project manager verifies the exception expires Friday.',
    ],
    [
      'Start a staged rollout today.',
      'At 14:00 the project manager updates the agenda, and the release lead stages the internal cohort.',
      'Support prepares the customer notice before rollout.',
      'Security verifies before approval that the exception expires Friday.',
    ],
    [
      'Start a staged rollout today.',
      'At 14:00 the release lead stages the internal cohort.',
      'Support prepares the customer notice before rollout.',
      'Before approval security verifies the exception expires Monday, with Friday reserved for review.',
    ],
    [
      'Start a staged rollout today.',
      'At 14:00 the release lead stages the internal cohort.',
      'Support prepares the customer notice before rollout.',
      'Security verifies that the exception expires Friday.',
    ],
    [
      'Start a staged rollout today.',
      'At 14:00 the release lead stages the internal cohort.',
      'Support prepares the customer notice before rollout.',
      'Before approval the project manager updates the agenda, and security verifies the exception expires Friday.',
    ],
    [
      'Start a staged rollout today.',
      'At 14:00 the project manager updates the agenda, then at 15:00 the release lead stages the internal cohort.',
      'Support prepares the customer notice before rollout.',
      'Security verifies before approval that the exception expires Friday.',
    ],
    [
      'Start a staged rollout today.',
      'At 14:00, before the release lead stages the internal cohort, the project manager updates the agenda.',
      'Support prepares the customer notice before rollout.',
      'Security verifies before approval that the exception expires Friday.',
    ],
    [
      'Start a staged rollout today.',
      'Not at 14:00, the release lead stages the internal cohort.',
      'Support prepares the customer notice before rollout.',
      'Security verifies before approval that the exception expires Friday.',
    ],
    [
      'Start a staged rollout today.',
      'After 14:00, the release lead stages the internal cohort.',
      'Support prepares the customer notice before rollout.',
      'Security verifies before approval that the exception expires Friday.',
    ],
    [
      'Start a staged rollout today.',
      'The release lead, no longer at 14:00, stages the internal cohort.',
      'Support prepares the customer notice before rollout.',
      'Security verifies before approval that the exception expires Friday.',
    ],
  ];
  for (const [index, probe] of probes.entries()) {
    const result = grade(probe);
    assert.equal(result.passed, false, `hollow action probe ${index + 1}`);
    assert.equal(
      result.checks.some(({ name, passed }) => (
        name.startsWith('accountable action ') && !passed
      )),
      true,
      `hollow action probe ${index + 1} needs an action failure`,
    );
  }
});

test('decision gates accept unlabeled alternate prose and reject hollow probes', () => {
  const role = definitionFor(loadDefinitions(), 'role');
  const caseDefinition = role.evals.find(({ id }) => id === 'decision-support');
  for (const sourceFact of [
    'verified rollback',
    'small first cohort, which contains exposure',
    'p95 latency stays under 200 ms',
    'passing result supports moving to full deployment',
    'miss means keeping the limited release',
  ]) {
    assert.equal(
      caseDefinition.prompt.includes(sourceFact),
      true,
      `decision scenario must supply ${sourceFact}`,
    );
  }
  const alternate = normalizedResult({
    output: [
      'Use a limited release today.',
      '',
      'Rollback has been verified, and a small first cohort contains exposure.',
      '',
      'We have not yet exercised peak traffic.',
      '',
      'Move to a full deployment only when the noon load test meets its latency target.',
    ].join('\n'),
  });

  const passing = gradeHumanWritingResult({
    evaluationDefinition: role,
    caseDefinition,
    result: alternate,
  });
  assert.equal(passing.passed, true, JSON.stringify(passing, null, 2));

  const concise = structuredClone(alternate);
  concise.observations.responses[0].text = [
    'Use a staged rollout; a small first cohort limits exposure and rollback is verified; '
      + 'peak traffic is untested; switch to full if the load test passes.',
  ].join('');
  const conciseGrade = gradeHumanWritingResult({
    evaluationDefinition: role,
    caseDefinition,
    result: concise,
  });
  assert.equal(conciseGrade.passed, true, JSON.stringify(conciseGrade, null, 2));

  const detailFirst = structuredClone(alternate);
  detailFirst.observations.responses[0].text = [
    'Rollback has been verified, and a small first cohort contains exposure.',
    '',
    'Use a limited release today.',
    '',
    'We have not yet exercised peak traffic.',
    '',
    'Move to a full deployment only when the noon load test meets its latency target.',
  ].join('\n');
  const detailFirstGrade = gradeHumanWritingResult({
    evaluationDefinition: role,
    caseDefinition,
    result: detailFirst,
  });
  assert.equal(detailFirstGrade.passed, false);
  assertFailedCheck(detailFirstGrade, 'answer first');

  const validParaphrases = [
    [
      'Prefer a staged rollout.',
      'A limited first cohort caps exposure, and rollback was verified.',
      'Peak demand remains untested.',
      'Proceed with full deployment if the noon load test keeps p95 latency below 200 ms.',
    ],
    [
      'Use a limited release.',
      'Exposure stays contained through the small first cohort, and verified rollback is available.',
      'We have not yet exercised peak traffic.',
      'Keep the limited release when the noon load test exceeds 200 ms.',
    ],
  ];
  for (const [index, lines] of validParaphrases.entries()) {
    const paraphrase = structuredClone(alternate);
    paraphrase.observations.responses[0].text = lines.join('\n');
    const paraphraseGrade = gradeHumanWritingResult({
      evaluationDefinition: role,
      caseDefinition,
      result: paraphrase,
    });
    assert.equal(
      paraphraseGrade.passed,
      true,
      `valid decision paraphrase ${index + 1}: ${JSON.stringify(paraphraseGrade, null, 2)}`,
    );
  }

  const contradictionProbes = [
    [
      'Use a limited release today.',
      'Verified rollback limits exposure.',
      'Peak traffic remains untested.',
      'Move to full deployment when the noon load test passes.',
    ],
    [
      'Use a limited release today.',
      'A small first cohort contains exposure, and rollback is verified.',
      'Peak traffic remains untested.',
      'Move to full deployment when the noon load test fails.',
    ],
    [
      'Use a limited release today.',
      'A small first cohort contains exposure, and rollback is verified.',
      'Peak traffic remains untested.',
      'Deploy to everyone if the noon load test exceeds 200 ms.',
    ],
    [
      'Use a full deployment today.',
      'A small first cohort contains exposure, and rollback is verified.',
      'Peak traffic remains untested.',
      'Keep the limited release when the noon load test exceeds 200 ms.',
    ],
    [
      'Use a limited release today.',
      'An unverified rollback and a small first cohort contain exposure.',
      'Peak traffic remains untested.',
      'Move to full deployment when the noon load test passes.',
    ],
    [
      'Use a limited release today.',
      'A small first cohort contains exposure, and rollback is verified.',
      'Peak traffic remains untested.',
      'Do not move to full deployment if the load test passes.',
    ],
    [
      'Use a limited release today.',
      'A small first cohort contains exposure, and rollback is verified.',
      'Peak traffic remains untested.',
      'Move away from full deployment when the load test passes.',
    ],
    [
      'Use a limited release today.',
      'A small first cohort contains exposure, and rollback is verified.',
      'Peak traffic remains untested.',
      'Never switch to full deployment when the load test passes.',
    ],
    [
      'Use a limited release today.',
      'A small first cohort contains exposure, and rollback is verified.',
      'Peak traffic remains untested.',
      'Stop and move to full deployment if the load test passes.',
    ],
  ];
  for (const [index, lines] of contradictionProbes.entries()) {
    const contradiction = structuredClone(alternate);
    contradiction.observations.responses[0].text = lines.join('\n');
    const contradictionGrade = gradeHumanWritingResult({
      evaluationDefinition: role,
      caseDefinition,
      result: contradiction,
    });
    assert.equal(
      contradictionGrade.passed,
      false,
      `source contradiction ${index + 1}`,
    );
  }

  const hollowProbes = [
    [
      'Recommendation.',
      'Basis.',
      'Material uncertainty.',
      'Change condition.',
    ],
    [
      'Recommendation limited release use.',
      'Basis exposure verified rollback contains.',
      'Material uncertainty untested peak traffic.',
      'Change condition load test move when latency target.',
    ],
    [
      'Limited release today use.',
      'Contains exposure verified rollback.',
      'Peak traffic unknown untested remains.',
      'Load test move only when latency target.',
    ],
    [
      'Use limited release use use.',
      'Verified rollback contain contain contain exposure.',
      'Peak traffic untested untested untested now.',
      'When load test move move move to deployment.',
    ],
    [
      'Use limited release today use limited release today.',
      'Verified rollback limits exposure verified rollback limits exposure.',
      'Peak traffic remains untested peak traffic remains untested.',
      'Switch when load test reports latency switch when load test reports latency.',
    ],
    Array(4).fill(
      'Use a limited release because verified rollback contains exposure '
      + 'while peak traffic remains untested and when the load test reports '
      + 'latency move to a full deployment.',
    ),
  ];
  for (const [index, lines] of hollowProbes.entries()) {
    const hollow = structuredClone(alternate);
    hollow.observations.responses[0].text = lines.join('\n');
    const hollowGrade = gradeHumanWritingResult({
      evaluationDefinition: role,
      caseDefinition,
      result: hollow,
    });
    assert.equal(hollowGrade.passed, false, `hollow decision probe ${index + 1}`);
    assert.equal(
      hollowGrade.checks.some(({ name, passed }) => (
        name.startsWith('decision ') && !passed
      )),
      true,
      `hollow decision probe ${index + 1} needs a decision-field failure`,
    );
  }
});

test('neutral records remain factual without a manufactured decision', () => {
  const role = definitionFor(loadDefinitions(), 'role');
  const caseDefinition = role.evals.find(({ id }) => id === 'neutral-record');
  const result = normalizedResult({
    output: [
      '09:10: The release lead paused deployment.',
      '09:14: The security owner confirmed the signing key was unchanged.',
      '09:18: The support owner opened incident INC-42.',
    ].join('\n'),
  });
  const grade = gradeHumanWritingResult({
    evaluationDefinition: role,
    caseDefinition,
    result,
  });
  assert.equal(grade.passed, true, JSON.stringify(grade, null, 2));
});

test('deterministic writing grader preserves protected non-prose exactly', () => {
  const role = definitionFor(loadDefinitions(), 'role');
  const caseDefinition = role.evals.find(({ id }) => id === 'protected-content');
  const protectedSegments = protectedSegmentsFromPrompt(caseDefinition.prompt);
  assert.equal(Object.hasOwn(caseDefinition, 'protected_segments'), false);
  assert.deepEqual(
    protectedSegments.map(({ category }) => category),
    ['code', 'schema', 'data', 'quote'],
  );
  protectedSegments.forEach(({ content }) => {
    assert.equal(caseDefinition.prompt.includes(content), true);
  });
  const output = [
    'Use the supplied artifacts unchanged.',
    '',
    ...protectedSegments.map(({ content }) => content),
    '',
    'Owner: API maintainers verify the sample before publication.',
  ].join('\n');
  const result = normalizedResult({
    output,
  });

  const grade = gradeHumanWritingResult({
    evaluationDefinition: role,
    caseDefinition,
    result,
  });
  assert.equal(grade.passed, true, JSON.stringify(grade, null, 2));

  const corruptions = {
    code: ['return payload.retry_count;', 'return payload.retryCount;'],
    schema: ['"minimum":1', '"minimum":0'],
    data: ['"retry-count": 3', '"retryCount": 3'],
    quote: ['preserve this punctuation.', 'change this punctuation!'],
  };
  for (const [category, [before, after]] of Object.entries(corruptions)) {
    const changed = structuredClone(result);
    changed.observations.responses[0].text = output.replace(before, after);
    const failed = gradeHumanWritingResult({
      evaluationDefinition: role,
      caseDefinition,
      result: changed,
    });
    assert.equal(failed.passed, false, category);
    assertFailedCheck(failed, `protected ${category} unchanged`);
  }
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
