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
} = require('../suite');
const {
  createCampaignManifest,
  gradeTriggerResult,
  runMatchedEvaluation,
  runTriggerEvaluation,
  validateEvaluationDefinition,
} = require('../suite/evaluation');

const repositoryRoot = path.resolve(__dirname, '..');
const skillRoot = path.join(repositoryRoot, 'skills', 'engineering-guidance');
const evaluationLayers = ['role', 'outcome', 'trigger'];
const engineeringConcerns = [
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

function createPackageFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'engineering-guidance-package-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'suite'), { recursive: true });
  fs.copyFileSync(
    path.join(repositoryRoot, 'suite', 'canonical-suite.json'),
    path.join(root, 'suite', 'canonical-suite.json'),
  );
  fs.mkdirSync(path.join(root, 'skills'), { recursive: true });
  const definitionPath = path.join(skillRoot, 'SKILL.md');
  if (fs.existsSync(definitionPath)) {
    const destination = path.join(root, 'skills', 'engineering-guidance', 'SKILL.md');
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(definitionPath, destination);
  }
  return root;
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function skillEvent(name) {
  return {
    name,
    operation: 'load',
    status: 'succeeded',
    trigger: 'user',
    callId: 'engineering-guidance-fixture',
    provenance: {
      host: 'fixture',
      mechanism: 'canonical-outcome-fixture',
      eventType: 'fixture.skill-load',
      observerVersion: '1',
      statusSource: 'observed',
    },
  };
}

function normalizedResult(invocation, context, overrides = {}) {
  return {
    status: 'succeeded',
    observations: {
      packageSkills: context.packageSkills,
      hostAvailableSkills: null,
      preExecutionInventory: {
        skillDefinitions: context.resolvedSkills.map((name) => ({
          name,
          path: `.fixture/skills/${name}/SKILL.md`,
          digest: digest(name),
        })),
        plugins: [],
        ruleSources: [],
        packageDigest: digest(context.packageSkills.join('\0')),
        truncated: false,
      },
      skillEvents: context.resolvedSkills.map(skillEvent),
      routing: {
        requestedSkill: invocation.skill,
        resolvedSkills: context.resolvedSkills,
      },
      responses: [{ text: 'Canned Engineering concern coverage observation.' }],
      artifacts: [],
      toolUses: [],
      attemptedMutations: [],
      ...overrides,
    },
    failure: null,
    durationMs: 1,
    costUsd: 0,
    model: {
      requested: invocation.model,
      resolved: 'resolved-test-model',
    },
  };
}

test('canonical Engineering Guidance is a dependency-free guidance outcome', async (t) => {
  const suite = loadCanonicalSuite(repositoryRoot);
  const entry = suite.inventory.find(({ name }) => name === 'engineering-guidance');
  const outgoingEdges = suite.runtimeEdges.filter(
    ({ consumer }) => consumer === 'engineering-guidance',
  );
  const packageRoot = createPackageFixture(t);
  const packageDefinition = discoverCanonicalPackage(packageRoot);
  const adapter = defineProductionAdapter({
    name: 'engineering-guidance-boundary-fixture',
    async execute(invocation, context) {
      return normalizedResult(invocation, context);
    },
  });

  const result = await executeProduction({
    repositoryRoot: packageRoot,
    adapter,
    invocation: {
      requestId: 'engineering-guidance-outcome',
      skill: 'engineering-guidance',
      prompt: 'Assess the bounded implementation approach.',
      model: 'test-model',
    },
  });

  assert.deepEqual(entry, {
    name: 'engineering-guidance',
    classification: 'primary',
  });
  assert.deepEqual(outgoingEdges, []);
  assert.equal(
    packageDefinition.skills.some(({ name }) => name === 'engineering-guidance'),
    true,
  );
  assert.equal(
    fs.existsSync(path.join(skillRoot, 'SKILL.md')),
    true,
  );
  assert.equal(result.status, 'succeeded');
  assert.deepEqual(result.observations.routing.resolvedSkills, [
    'engineering-guidance',
  ]);
  assert.deepEqual(result.observations.artifacts, []);
  assert.deepEqual(result.observations.attemptedMutations, []);
  assert.equal(
    result.observations.skillEvents.some(({ name }) => name === 'to-humans'),
    false,
  );
});

test('complete concern index progressively discloses only applicable fallback guidance', () => {
  const skill = fs.readFileSync(path.join(skillRoot, 'SKILL.md'), 'utf8');
  const linkedReferences = [...skill.matchAll(
    /\]\((references\/[a-z-]+\.md)\)/g,
  )].map((match) => match[1]);

  assert.equal(new Set(linkedReferences).size, engineeringConcerns.length);
  assert.deepEqual(
    linkedReferences,
    engineeringConcerns.map((concern) => `references/${concern}.md`),
  );
  for (const concern of engineeringConcerns) {
    assert.match(skill, new RegExp(`\\| \`${concern}\` \\|`));
    const referencePath = path.join(skillRoot, 'references', `${concern}.md`);
    assert.equal(fs.existsSync(referencePath), true, referencePath);
    const reference = fs.readFileSync(referencePath, 'utf8');
    assert.doesNotMatch(reference, /\]\((?:\.\.\/|references\/)/);
  }

  assert.match(
    skill,
    /Load a linked reference only after its concern\s+becomes `applicable-now`/m,
  );
  assert.match(skill, /Do not load deferred\s+or inapplicable references/m);
  assert.match(skill, /record the missing capability.*unresolved gap/is);
  assert.match(skill, /Do not imitate the specialist discipline/);
});

test('owner-local evaluations cover role, outcome, and routing contracts', () => {
  const evaluationRoot = path.join(skillRoot, 'evals');
  const definitions = evaluationLayers.map((layer) => (
    readJson(path.join(evaluationRoot, `${layer}.json`))
  ));

  for (const [index, definition] of definitions.entries()) {
    assert.strictEqual(
      validateEvaluationDefinition(definition, repositoryRoot),
      definition,
    );
    assert.equal(definition.skill_name, 'engineering-guidance');
    assert.equal(definition.evaluation.layer, evaluationLayers[index]);
    assert.deepEqual(definition.evaluation.hosts, ['claude-code', 'cursor']);
    assert.match(definition.judge.evidence_requirement, /quote|reference/i);
    assert.deepEqual(definition.signals || {}, {});
    assert.deepEqual(definition.global_required_signals || [], []);
  }

  for (const definition of definitions.slice(0, 2)) {
    assert.deepEqual(definition.evaluation.arms, ['no-skill', 'treatment']);
    for (const caseDefinition of definition.evals) {
      assert.deepEqual(caseDefinition.required_skill_loads, [
        'engineering-guidance',
      ]);
      assert.deepEqual(caseDefinition.required_concerns, engineeringConcerns);
      assert.equal(
        caseDefinition.expectations.some((item) => /sampled human review/i.test(item)),
        true,
      );
    }
  }

  const coveredSituations = new Set(
    definitions.flatMap(({ evals }) => (
      evals.flatMap(({ covers = [] }) => covers)
    )),
  );
  for (const situation of [
    'sparse-authority',
    'weak-authority',
    'strong-authority',
    'conflicting-authority',
    'nested-authority',
    'tiny-change',
    'architectural-change',
    'language-diverse-change',
    'non-code-change',
    'pre-existing-bad-pattern',
    'specialist-routing',
    'independent-review-disagreement',
    'prompt-cost',
    'matched-no-skill-control',
  ]) {
    assert.equal(coveredSituations.has(situation), true, situation);
  }

  const trigger = definitions[2];
  assert.deepEqual(trigger.evaluation.arms, ['treatment']);
  assert.equal(trigger.evals.some(({ canonical_invocation: direct }) => direct), true);
  assert.equal(trigger.evals.some(({ should_trigger: selected }) => selected), true);
  assert.equal(trigger.evals.some(({ should_trigger: selected }) => !selected), true);
});

test('evaluation gates use boundary observations without grading exact prose', () => {
  const {
    gradeEngineeringGuidanceResult,
  } = require('../skills/engineering-guidance/evals/grader');
  const invocation = {
    skill: 'engineering-guidance',
    model: 'test-model',
  };
  const context = {
    packageSkills: ['engineering-guidance'],
    resolvedSkills: ['engineering-guidance'],
  };
  const result = normalizedResult(invocation, context);
  const role = readJson(path.join(skillRoot, 'evals', 'role.json'));
  const roleCase = role.evals[0];

  const concise = structuredClone(result);
  concise.observations.responses = [{ text: 'Any semantically judged wording.' }];
  assert.equal(
    gradeEngineeringGuidanceResult({
      definition: role,
      caseDefinition: roleCase,
      result: concise,
    }).passed,
    true,
  );

  const withArtifact = structuredClone(result);
  withArtifact.observations.artifacts.push({
    reference: 'artifact://guidance-owned.md',
    mediaType: 'text/markdown',
  });
  assert.equal(
    gradeEngineeringGuidanceResult({
      definition: role,
      caseDefinition: roleCase,
      result: withArtifact,
    }).passed,
    false,
  );

  const withMutation = structuredClone(result);
  withMutation.observations.attemptedMutations.push({
    operation: 'write',
    target: 'src/change.js',
    outcome: 'succeeded',
  });
  assert.equal(
    gradeEngineeringGuidanceResult({
      definition: role,
      caseDefinition: roleCase,
      result: withMutation,
    }).passed,
    false,
  );

  const withAudienceDependency = structuredClone(result);
  withAudienceDependency.observations.routing.resolvedSkills.push('to-humans');
  assert.equal(
    gradeEngineeringGuidanceResult({
      definition: role,
      caseDefinition: roleCase,
      result: withAudienceDependency,
    }).passed,
    false,
  );

  const trigger = readJson(path.join(skillRoot, 'evals', 'trigger.json'));
  const positive = trigger.evals.find(({ id }) => id === 'ambient-assessment');
  const negative = trigger.evals.find(({ id }) => id === 'generic-writing');
  assert.equal(
    gradeTriggerResult({
      definition: trigger,
      caseDefinition: positive,
      result,
    }).passed,
    true,
  );
  const negativeResult = normalizedResult(invocation, context, {
    skillEvents: [skillEvent('to-humans')],
  });
  assert.equal(
    gradeTriggerResult({
      definition: trigger,
      caseDefinition: negative,
      result: negativeResult,
    }).passed,
    true,
  );
  const overactivated = normalizedResult(invocation, context);
  assert.equal(
    gradeTriggerResult({
      definition: trigger,
      caseDefinition: negative,
      result: overactivated,
    }).passed,
    false,
  );
});

test('role, outcome, and trigger evaluations retain exact observable lifecycle evidence', async (t) => {
  const {
    gradeEngineeringGuidanceResult,
    loadDefinitions,
  } = require('../skills/engineering-guidance/evals');
  const packageRoot = createPackageFixture(t);
  const definitions = loadDefinitions(packageRoot);
  const cell = { host: 'cursor', model: 'test-model' };
  const manifestFor = (definition) => createCampaignManifest({
    repositoryRoot: packageRoot,
    definition,
    packageRevision: 'issue-46-contract-fixture',
    cells: [cell],
    repetitions: 1,
    executionConfiguration: {
      timeout_ms: 1000,
      tools: ['read'],
    },
    limitations: [
      'Canned boundary observations prove contracts, not model adoption.',
    ],
  });

  for (const layer of ['role', 'outcome']) {
    const definition = definitions.find(
      ({ evaluation }) => evaluation.layer === layer,
    );
    const caseDefinition = definition.evals[0];
    const manifest = manifestFor(definition);
    const records = await runMatchedEvaluation({
      repositoryRoot: packageRoot,
      manifest,
      caseDefinition,
      cell,
      repetition: 1,
      async executeArm({ arm, provisioning }) {
        const treatment = arm === 'treatment';
        return normalizedResult(
          { skill: 'engineering-guidance', model: cell.model },
          {
            packageSkills: provisioning.packageDefinition.skills.map(
              ({ name }) => name,
            ),
            resolvedSkills: treatment ? ['engineering-guidance'] : [],
          },
          {
            skillEvents: treatment ? [skillEvent('engineering-guidance')] : [],
          },
        );
      },
      gradeOutput({ arm, result }) {
        if (arm === 'no-skill') {
          return { passed: true, status: 'baseline', checks: [] };
        }
        return gradeEngineeringGuidanceResult({
          definition,
          caseDefinition,
          result,
        });
      },
    });

    assert.deepEqual(
      records.map(({ arm }) => arm.kind),
      ['no-skill', 'treatment'],
    );
    assert.equal(records[0].execution.control_contamination.clean, true);
    assert.equal(records[1].deterministic.passed, true);
    assert.deepEqual(records[1].execution.artifacts, []);
    assert.deepEqual(records[1].execution.attempted_mutations, []);
  }

  const trigger = definitions.find(
    ({ evaluation }) => evaluation.layer === 'trigger',
  );
  const caseDefinition = trigger.evals.find(({ id }) => id === 'canonical-direct');
  const triggerEvidence = await runTriggerEvaluation({
    repositoryRoot: packageRoot,
    manifest: manifestFor(trigger),
    definition: trigger,
    caseDefinition,
    cell,
    repetition: 1,
    async execute() {
      return normalizedResult(
        { skill: 'engineering-guidance', model: cell.model },
        {
          packageSkills: ['engineering-guidance'],
          resolvedSkills: ['engineering-guidance'],
        },
      );
    },
  });

  assert.equal(triggerEvidence.deterministic.passed, true);
  assert.deepEqual(
    triggerEvidence.execution.skill_events.map(({ name }) => name),
    ['engineering-guidance'],
  );
});
