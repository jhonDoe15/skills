'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  defineProductionAdapter,
  executeProduction,
} = require('../../../suite');
const {
  createCampaignManifest,
  gradeDeterministicOutput,
  runComponentEvaluation,
  runMatchedEvaluation,
  validateEvaluationDefinition,
} = require('../../../suite/evaluation');
const { defineTestAdapter } = require('../../../suite/testing');

const repositoryRoot = path.resolve(__dirname, '../../..');
const writingRoot = path.resolve(__dirname, '..');
const mechanicsRoot = path.join(repositoryRoot, 'skills', 'skill-mechanics');
const completePackage = [
  'agent-writing',
  'writing-foundation',
  'skill-evaluation',
  'skill-mechanics',
  'skill-writing',
];

function readJson(filePath) {
  assert.equal(fs.existsSync(filePath), true, `${filePath} must exist`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readSkill(skillRoot) {
  const filePath = path.join(skillRoot, 'SKILL.md');
  assert.equal(fs.existsSync(filePath), true, `${filePath} must exist`);
  const markdown = fs.readFileSync(filePath, 'utf8');
  const frontmatter = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  assert.ok(frontmatter, `${filePath} requires YAML frontmatter`);
  const field = (name) => frontmatter[1]
    .match(new RegExp(`^${name}:\\s*(.+)$`, 'm'))?.[1];
  return {
    markdown,
    name: field('name'),
    description: field('description'),
  };
}

function createPackageFixture(t, skillNames) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-writing-'));
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));
  fs.mkdirSync(path.join(fixtureRoot, 'suite'), { recursive: true });
  fs.copyFileSync(
    path.join(repositoryRoot, 'suite', 'canonical-suite.json'),
    path.join(fixtureRoot, 'suite', 'canonical-suite.json'),
  );
  for (const name of skillNames) {
    const destination = path.join(fixtureRoot, 'skills', name, 'SKILL.md');
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const source = path.join(repositoryRoot, 'skills', name, 'SKILL.md');
    if (fs.existsSync(source)) {
      fs.copyFileSync(source, destination);
    } else {
      assert.equal(
        name,
        'skill-evaluation',
        `${name} must be production-owned or an explicit test-only fixture`,
      );
      fs.writeFileSync(
        destination,
        '---\nname: skill-evaluation\ndescription: Test-only dependency fixture.\n---\n',
      );
    }
  }
  return fixtureRoot;
}

function skillEvent(name) {
  return {
    name,
    operation: 'load',
    status: 'succeeded',
    trigger: 'model',
    callId: `contract-${name}`,
    provenance: {
      host: 'fixture',
      mechanism: 'owner-local-contract-fixture',
      eventType: 'fixture.skill-lifecycle',
      observerVersion: '1',
      statusSource: 'observed',
    },
  };
}

function normalizedResult({
  invocation,
  packageSkills,
  resolvedSkills,
  output = 'Fixture outcome.',
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
      skillEvents: resolvedSkills.map(skillEvent),
      routing: {
        requestedSkill: invocation.skill,
        resolvedSkills,
      },
      responses: [{ text: output }],
      artifacts: [{
        reference: 'artifact://fixture/SKILL.md',
        mediaType: 'text/markdown',
      }],
      toolUses: [],
      attemptedMutations: [],
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

function readEvaluationDefinition(owner, fileName) {
  const value = readJson(path.join(
    repositoryRoot,
    'skills',
    owner,
    'evals',
    fileName,
  ));
  assert.equal(validateEvaluationDefinition(value, repositoryRoot), value);
  return value;
}

test('Skill Mechanics exposes only its private representation contract', () => {
  const skill = readSkill(mechanicsRoot);

  assert.equal(skill.name, 'skill-mechanics');
  assert.match(skill.description, /\bskill-writing\b/);
  assert.match(skill.description, /\bconsumers?\b/i);
  assert.match(skill.description, /\bnot\b.*\buser\b.*\bgoal\b/i);
  assert.doesNotMatch(skill.description, /^Use when\b/i);
  for (const heading of [
    'Interface',
    'Represent the decided contract',
    'Validate mechanics',
    'Failure behavior',
    'Completion',
  ]) {
    assert.match(skill.markdown, new RegExp(`^## ${heading}$`, 'm'));
  }
});

test('Skill Writing routes only Skill creation and revision', () => {
  const skill = readSkill(writingRoot);

  assert.equal(skill.name, 'skill-writing');
  assert.match(skill.description, /\bcreating\b.*\brevising\b/i);
  assert.match(skill.description, /\bAgent Skills?\b/);
  for (const excluded of [
    'agent-facing artifacts',
    'fresh-context handoffs',
    'installation',
    'publication',
    'marketplace',
  ]) {
    assert.match(skill.description, new RegExp(excluded, 'i'));
  }
  assert.doesNotMatch(skill.description, /\b(?:invoke|draft|step|complete when)\b/i);
  for (const heading of [
    'Interface',
    'Routing',
    'Justify the Skill',
    'Decide the behavior contract',
    'Compose by canonical name',
    'Author and verify',
    'Failure behavior',
    'Completion',
  ]) {
    assert.match(skill.markdown, new RegExp(`^## ${heading}$`, 'm'));
  }
});

test('Skill Writing resolves every canonical dependency and fails closed by exact name', async (t) => {
  const invocation = {
    requestId: 'skill-writing-contract',
    skill: 'skill-writing',
    prompt: 'Create a deployment-triage Agent Skill.',
    model: 'test-model',
  };
  const adapter = defineProductionAdapter({
    name: 'skill-writing-contract',
    execute(invoked, context) {
      return Promise.resolve(normalizedResult({
        invocation: invoked,
        ...context,
      }));
    },
  });
  const complete = await executeProduction({
    repositoryRoot: createPackageFixture(t, completePackage),
    adapter,
    invocation,
  });

  assert.deepEqual(complete.observations.routing.resolvedSkills, [
    'writing-foundation',
    'agent-writing',
    'skill-evaluation',
    'skill-mechanics',
    'skill-writing',
  ]);

  const packageClosure = readJson(path.join(
    writingRoot,
    'evals',
    'package-closure.json',
  ));
  for (const {
    missing_dependency: missingSkill,
    expected_failure: expectedFailure,
  } of packageClosure.cases) {
    let executions = 0;
    const mustNotExecute = defineProductionAdapter({
      name: `missing-${missingSkill}`,
      async execute() {
        executions += 1;
        throw new Error('must not execute');
      },
    });
    const result = await executeProduction({
      repositoryRoot: createPackageFixture(
        t,
        completePackage.filter((name) => name !== missingSkill),
      ),
      adapter: mustNotExecute,
      invocation,
    });

    assert.equal(executions, 0);
    assert.deepEqual(result.failure, expectedFailure);
    assert.deepEqual(result.observations.responses, []);
    assert.deepEqual(result.observations.artifacts, []);
  }
});

test('owner-local definitions cover both roles, three edges, routing, and outcome', () => {
  const mechanicsRole = readEvaluationDefinition('skill-mechanics', 'role.json');
  const mechanicsTrigger = readEvaluationDefinition('skill-mechanics', 'trigger.json');
  const writingRole = readEvaluationDefinition('skill-writing', 'role.json');
  const writingComponents = readEvaluationDefinition('skill-writing', 'component.json');
  const writingTrigger = readEvaluationDefinition('skill-writing', 'trigger.json');
  const writingOutcome = readEvaluationDefinition('skill-writing', 'outcome.json');

  assert.equal(mechanicsRole.evaluation.layer, 'role');
  assert.equal(mechanicsTrigger.evaluation.layer, 'trigger');
  assert.deepEqual(
    mechanicsTrigger.evals.map(({ should_trigger }) => should_trigger),
    [true, false],
  );
  assert.equal(writingRole.evaluation.layer, 'role');
  assert.equal(writingComponents.evaluation.layer, 'component');
  assert.deepEqual(
    writingComponents.evals.map(({ ablated_dependency }) => ablated_dependency),
    ['agent-writing', 'skill-mechanics', 'skill-evaluation'],
  );
  assert.equal(writingTrigger.evaluation.layer, 'trigger');
  assert.equal(writingOutcome.evaluation.layer, 'outcome');
  assert.deepEqual(writingOutcome.evals[0].required_skill_loads, [
    'skill-writing',
    'agent-writing',
    'writing-foundation',
    'skill-mechanics',
    'skill-evaluation',
  ]);
  for (const value of [
    mechanicsRole,
    mechanicsTrigger,
    writingRole,
    writingComponents,
    writingTrigger,
    writingOutcome,
  ]) {
    assert.deepEqual(value.evaluation.hosts, ['claude-code', 'cursor']);
  }
});

test('all three component cases use the test-only ablation seam on either host', async (t) => {
  const component = readEvaluationDefinition('skill-writing', 'component.json');
  const fixtureRoot = createPackageFixture(t, completePackage);
  const observations = [];
  const adapter = defineTestAdapter({
    name: 'skill-writing-component',
    async execute(invocation, context) {
      observations.push({
        prompt: invocation.prompt,
        model: invocation.model,
        resolvedSkills: [...context.resolvedSkills],
        dependencyAblation: context.dependencyAblation,
      });
      return normalizedResult({
        invocation,
        ...context,
      });
    },
  });
  const manifest = createCampaignManifest({
    repositoryRoot,
    definition: component,
    packageRevision: 'issue-19-component-fixture',
    cells: component.evaluation.hosts.map((host) => ({
      host,
      model: `${host}-test-model`,
    })),
    repetitions: 1,
    executionConfiguration: { timeout_ms: 1000, tools: [] },
    limitations: ['Test-only Adapter fixture; no model behavior claim.'],
  });

  for (const caseDefinition of component.evals) {
    for (const cell of manifest.cells) {
      const records = await runComponentEvaluation({
        repositoryRoot: fixtureRoot,
        manifest,
        caseDefinition,
        cell,
        repetition: 1,
        adapter,
        gradeOutput({ arm }) {
          return {
            passed: true,
            checks: [],
            ...(arm === 'component-ablation' ? { status: 'baseline' } : {}),
          };
        },
      });
      assert.deepEqual(
        records.map(({ arm }) => arm.kind),
        ['treatment', 'component-ablation'],
      );
      const [treatment, ablated] = observations.slice(-2);
      assert.equal(treatment.prompt, ablated.prompt);
      assert.equal(treatment.model, ablated.model);
      assert.equal(treatment.dependencyAblation, null);
      assert.deepEqual(ablated.dependencyAblation, {
        consumer: 'skill-writing',
        dependency: caseDefinition.ablated_dependency,
      });
    }
  }

  assert.equal(observations.length, 12);
});

test('complete outcome uses matched fresh-session Skill and No-Skill arms', async (t) => {
  const outcome = readEvaluationDefinition('skill-writing', 'outcome.json');
  const caseDefinition = outcome.evals[0];
  const manifest = createCampaignManifest({
    repositoryRoot,
    definition: outcome,
    packageRevision: 'issue-19-outcome-fixture',
    cells: [{ host: 'cursor', model: 'test-model' }],
    repetitions: 1,
    executionConfiguration: { timeout_ms: 1000, tools: [] },
    limitations: ['Static fixture only; semantic adoption remains unverified.'],
    controlPolicy: {
      target: 'skill-writing',
      dependencies: [
        'agent-writing',
        'writing-foundation',
        'skill-mechanics',
        'skill-evaluation',
      ],
      aliases: [],
      conflictingOwners: [],
    },
  });
  const observed = [];
  const records = await runMatchedEvaluation({
    repositoryRoot: createPackageFixture(t, completePackage),
    manifest,
    caseDefinition,
    cell: manifest.cells[0],
    repetition: 1,
    async executeArm(context) {
      observed.push(context);
      const treatment = context.arm === 'treatment';
      return normalizedResult({
        invocation: {
          skill: 'skill-writing',
          model: context.cell.model,
        },
        packageSkills: treatment ? completePackage : [],
        resolvedSkills: treatment
          ? [
            'writing-foundation',
            'agent-writing',
            'skill-evaluation',
            'skill-mechanics',
            'skill-writing',
          ]
          : [],
        output: treatment
          ? fs.readFileSync(
            path.join(writingRoot, 'evals', 'fixtures', 'outcome-output.md'),
            'utf8',
          )
          : 'Independent No-Skill response.',
      });
    },
    gradeOutput({ arm, output }) {
      const grade = gradeDeterministicOutput({
        definition: outcome,
        caseDefinition,
        output,
      });
      return arm === 'treatment'
        ? grade
        : { ...grade, passed: true, status: 'baseline' };
    },
  });

  assert.deepEqual(observed.map(({ arm }) => arm), ['no-skill', 'treatment']);
  assert.strictEqual(observed[0].caseDefinition, observed[1].caseDefinition);
  assert.strictEqual(
    observed[0].executionConfiguration,
    observed[1].executionConfiguration,
  );
  assert.deepEqual(records.map(({ arm }) => arm.kind), [
    'no-skill',
    'treatment',
  ]);
  assert.equal(records[0].execution.control_contamination.clean, true);
  assert.equal(records[1].deterministic.passed, true);
});

test('deterministic gates prove mechanics only and leave semantics to evidence', () => {
  for (const [owner, fileName, fixtureName] of [
    ['skill-mechanics', 'role.json', 'mechanics-output.md'],
    ['skill-writing', 'role.json', 'role-output.md'],
    ['skill-writing', 'outcome.json', 'outcome-output.md'],
  ]) {
    const value = readEvaluationDefinition(owner, fileName);
    const caseDefinition = value.evals[0];
    const output = fs.readFileSync(
      path.join(repositoryRoot, 'skills', owner, 'evals', 'fixtures', fixtureName),
      'utf8',
    );
    assert.equal(gradeDeterministicOutput({
      definition: value,
      caseDefinition,
      output,
    }).passed, true);
    assert.equal(gradeDeterministicOutput({
      definition: value,
      caseDefinition,
      output: `${output}\nThe represented behavior is ineffective in every host.`,
    }).passed, true, 'semantic claims must not be parsed as mechanical facts');
    assert.equal(
      value.judge.dimensions.every(({ description }) => (
        /(?:quote|cite|reference).*output evidence/i.test(description)
      )),
      true,
    );
  }
});

test('Contract coverage maps every owned clause to a versioned case', () => {
  const definitions = [
    readEvaluationDefinition('skill-mechanics', 'role.json'),
    readEvaluationDefinition('skill-mechanics', 'trigger.json'),
    readEvaluationDefinition('skill-writing', 'role.json'),
    readEvaluationDefinition('skill-writing', 'component.json'),
    readEvaluationDefinition('skill-writing', 'trigger.json'),
    readEvaluationDefinition('skill-writing', 'outcome.json'),
  ];
  const packageClosure = readJson(path.join(
    writingRoot,
    'evals',
    'package-closure.json',
  ));
  const byScope = new Map(definitions.map((value) => [
    value.evaluation.scope,
    value,
  ]));
  byScope.set(packageClosure.scope, {
    skill_name: packageClosure.owner,
    evals: packageClosure.cases,
  });
  const coverage = readJson(path.join(
    writingRoot,
    'evals',
    'contract-coverage.json',
  ));
  const clauseIds = coverage.clauses.map(({ id }) => id);

  assert.equal(new Set(clauseIds).size, clauseIds.length);
  assert.equal(clauseIds.some((id) => id.startsWith('sm-')), true);
  assert.equal(clauseIds.some((id) => id.startsWith('sw-')), true);
  for (const entry of coverage.clauses) {
    assert.ok(entry.cases.length > 0, entry.id);
    for (const reference of entry.cases) {
      const scoped = byScope.get(reference.scope);
      assert.ok(scoped, reference.scope);
      assert.equal(scoped.skill_name, entry.owner, entry.id);
      const caseDefinition = scoped.evals.find(
        ({ id }) => String(id) === String(reference.id),
      );
      assert.ok(caseDefinition, `${reference.scope}:${reference.id}`);
      assert.equal(caseDefinition.covered_clauses.includes(entry.id), true);
    }
  }
});
