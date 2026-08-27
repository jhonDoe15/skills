'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  defineProductionAdapter,
  executeProduction,
  loadCanonicalSuite,
  resolvePackageDependencies,
} = require('../../../suite');
const {
  createCampaignManifest,
  gradeDeterministicOutput,
  validateEvaluationDefinition,
} = require('../../../suite/evaluation');

const repositoryRoot = path.resolve(__dirname, '../../..');
const writingRoot = path.resolve(__dirname, '..');
const canonicalSkillClosure = [
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
    assert.equal(
      fs.existsSync(source),
      true,
      `production Skill "${name}" does not exist`,
    );
    fs.copyFileSync(source, destination);
  }
  return fixtureRoot;
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

test('package fixtures never synthesize absent production Skills', (t) => {
  assert.throws(
    () => createPackageFixture(t, ['skill-evaluation']),
    /production Skill "skill-evaluation" does not exist/,
  );
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
  const suite = loadCanonicalSuite(repositoryRoot);
  const resolved = resolvePackageDependencies(
    suite,
    { skills: canonicalSkillClosure.map((name) => ({ name })) },
    'skill-writing',
  );
  assert.deepEqual(resolved.resolved, [
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
  let executions = 0;
  const mustNotExecute = defineProductionAdapter({
    name: 'missing-skill-evaluation',
    async execute() {
      executions += 1;
      throw new Error('must not execute');
    },
  });
  const productionResult = await executeProduction({
    repositoryRoot: createPackageFixture(
      t,
      canonicalSkillClosure.filter((name) => name !== 'skill-evaluation'),
    ),
    adapter: mustNotExecute,
    invocation,
  });
  const absentProductionSkill = packageClosure.cases.find(
    ({ missing_dependency: missingSkill }) => missingSkill === 'skill-evaluation',
  );

  assert.equal(executions, 0);
  assert.deepEqual(productionResult.failure, absentProductionSkill.expected_failure);
  assert.deepEqual(productionResult.observations.responses, []);
  assert.deepEqual(productionResult.observations.artifacts, []);

  for (const {
    missing_dependency: missingSkill,
    expected_failure: expectedFailure,
  } of packageClosure.cases) {
    const result = resolvePackageDependencies(
      suite,
      {
        skills: canonicalSkillClosure
          .filter((name) => name !== missingSkill)
          .map((name) => ({ name })),
      },
      'skill-writing',
    );
    assert.deepEqual(result, {
      missingSkill: expectedFailure.missingSkill,
      code: expectedFailure.code,
    });
  }
});

test('owner-local definitions cover the Writing role, three edges, routing, and outcome', () => {
  const writingRole = readEvaluationDefinition('skill-writing', 'role.json');
  const writingComponents = readEvaluationDefinition('skill-writing', 'component.json');
  const writingTrigger = readEvaluationDefinition('skill-writing', 'trigger.json');
  const writingOutcome = readEvaluationDefinition('skill-writing', 'outcome.json');

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
    writingRole,
    writingComponents,
    writingTrigger,
    writingOutcome,
  ]) {
    assert.deepEqual(value.evaluation.hosts, ['claude-code', 'cursor']);
  }
});

test('all three component cases declare the test-only ablation seam for both hosts', () => {
  const component = readEvaluationDefinition('skill-writing', 'component.json');
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

  assert.deepEqual(manifest.arms, ['treatment', 'component-ablation']);
  assert.deepEqual(
    manifest.cells.map(({ host }) => host),
    ['claude-code', 'cursor'],
  );
  assert.deepEqual(
    manifest.cases.map(({ ablated_dependency: dependency }) => dependency),
    ['agent-writing', 'skill-mechanics', 'skill-evaluation'],
  );
});

test('complete outcome declares matched fresh-session Skill and No-Skill arms', () => {
  const outcome = readEvaluationDefinition('skill-writing', 'outcome.json');
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

  assert.deepEqual(manifest.arms, ['no-skill', 'treatment']);
  assert.deepEqual(manifest.cells, [{ host: 'cursor', model: 'test-model' }]);
  assert.equal(manifest.cases.length, 1);
  assert.deepEqual(manifest.cases[0].required_skill_loads, [
    'skill-writing',
    'agent-writing',
    'writing-foundation',
    'skill-mechanics',
    'skill-evaluation',
  ]);
  assert.equal(
    manifest.limitations.includes(
      'Static fixture only; semantic adoption remains unverified.',
    ),
    true,
  );
});

test('deterministic gates prove mechanics only and leave semantics to evidence', () => {
  for (const [owner, fileName, fixtureName] of [
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
