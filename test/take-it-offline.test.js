'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const {
  createCampaignManifest,
  runComponentEvaluation,
  runMatchedEvaluation,
  runTriggerEvaluation,
  validateEvaluationDefinition,
} = require('../suite/evaluation');
const {
  defineProductionAdapter,
  discoverCanonicalPackage,
  executeProduction,
} = require('../suite');
const { defineTestAdapter } = require('../suite/testing');

const repositoryRoot = path.resolve(__dirname, '..');
const skillRoot = path.join(repositoryRoot, 'skills', 'take-it-offline');
const evaluationRoot = path.join(skillRoot, 'evals');
const fixtureRoot = path.join(__dirname, 'fixtures', 'take-it-offline');
const expectedLayers = ['role', 'component', 'outcome', 'trigger'];
const packageRevision = 'db26f9d7410b982995a8f7b5a50ef045238a4fd4';
const routingObservations = Object.freeze({
  'fresh-context-continuation': true,
  'canonical-direct-invocation': true,
  'human-summary': false,
  'archival-specification': false,
  'general-agent-artifact': false,
  'agent-skill-authoring': false,
  'private-dependency-request': false,
});
const fixtureReferenceAllowlist = new Map([
  [
    'fixture://status.json',
    path.join(fixtureRoot, 'artifacts', 'status.json'),
  ],
]);
const continuationArtifactAllowlist = new Map();

function assertFile(filePath) {
  assert.equal(
    fs.existsSync(filePath),
    true,
    `required ticket artifact is missing: ${path.relative(repositoryRoot, filePath)}`,
  );
}

function readJson(filePath) {
  assertFile(filePath);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readFixture(relativePath) {
  const filePath = path.join(fixtureRoot, relativePath);
  assertFile(filePath);
  return fs.readFileSync(filePath, 'utf8');
}

function loadGrader() {
  const graderPath = path.join(evaluationRoot, 'grader.js');
  assertFile(graderPath);
  return require(graderPath);
}

function writeSkillFixture(root, name, sourcePath) {
  const directory = path.join(root, 'skills', name);
  fs.mkdirSync(directory, { recursive: true });
  fs.copyFileSync(sourcePath, path.join(directory, 'SKILL.md'));
}

function createPackageRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'take-it-offline-package-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'suite'), { recursive: true });
  fs.copyFileSync(
    path.join(repositoryRoot, 'suite', 'canonical-suite.json'),
    path.join(root, 'suite', 'canonical-suite.json'),
  );
  return root;
}

function createTakeItOfflinePackage(t) {
  const root = createPackageRoot(t);
  writeSkillFixture(
    root,
    'take-it-offline',
    path.join(skillRoot, 'SKILL.md'),
  );
  return root;
}

function createCompletePackage(t) {
  const root = createTakeItOfflinePackage(t);
  for (const dependency of ['agent-writing', 'writing-foundation']) {
    writeSkillFixture(
      root,
      dependency,
      path.join(fixtureRoot, `${dependency}.skill.md`),
    );
  }
  return root;
}

function normalizedResult({
  skill = 'take-it-offline',
  model,
  output,
  invokedSkills,
  discoveredSkills = ['agent-writing', 'take-it-offline', 'writing-foundation'],
  artifacts = [],
  toolUses = [],
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
      artifacts,
      toolUses,
      attemptedMutations: artifacts.map(({ reference }) => ({
        operation: 'write',
        target: reference,
        outcome: 'succeeded',
      })),
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

function manifestFor(definition, cells = [
  { host: 'claude-code', model: 'test-model' },
  { host: 'cursor', model: 'test-model' },
]) {
  return createCampaignManifest({
    definition,
    packageRevision,
    cells,
    repetitions: 1,
    executionConfiguration: {
      timeout_ms: 1000,
      tools: ['read', 'write'],
    },
    limitations: [
      'Deterministic fixtures exercise contracts without claiming model adoption.',
    ],
  });
}

function baselineGrade() {
  return {
    passed: true,
    status: 'baseline',
    checks: [],
  };
}

function isRegularNonSymlinkFile(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const stat = fs.lstatSync(filePath);
  return stat.isFile() && !stat.isSymbolicLink();
}

function referenceResolver(reference) {
  const filePath = fixtureReferenceAllowlist.get(reference);
  return Boolean(filePath) && isRegularNonSymlinkFile(filePath);
}

function createContinuationArtifact(
  t,
  markdown,
  { fileName = 'continuation.md', mediaType = 'text/markdown' } = {},
) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'take-it-offline-artifact-'));
  const filePath = path.join(root, fileName);
  fs.writeFileSync(filePath, markdown);
  const reference = pathToFileURL(filePath).href;
  continuationArtifactAllowlist.set(reference, filePath);
  t.after(() => {
    continuationArtifactAllowlist.delete(reference);
    fs.rmSync(root, { recursive: true, force: true });
  });
  return {
    artifact: { reference, mediaType },
    response: `Continuation document: ${reference}`,
  };
}

function continuationArtifactResolver(reference) {
  const filePath = continuationArtifactAllowlist.get(reference);
  if (!filePath || !isRegularNonSymlinkFile(filePath)) return null;
  return fs.readFileSync(filePath, 'utf8');
}

test('fixture references reject traversal and unrelated files', () => {
  assert.equal(referenceResolver('fixture://status.json'), true);
  assert.equal(referenceResolver('fixture://pressure-state.md'), false);
  assert.equal(
    referenceResolver('fixture://../continuations/complete.md'),
    false,
  );
  assert.equal(referenceResolver('fixture://../../agent-writing.skill.md'), false);
  assert.equal(referenceResolver('fixture://missing.json'), false);
});

test('grader reads one referenced Markdown continuation artifact', (t) => {
  const definition = readJson(path.join(evaluationRoot, 'role.json'));
  const caseDefinition = definition.evals[0];
  const completeOutput = readFixture(caseDefinition.fixture_output);
  const { gradeTakeItOfflineResult } = loadGrader();
  const complete = createContinuationArtifact(t, completeOutput);
  const malformed = createContinuationArtifact(t, '# Session notes\n');
  const second = createContinuationArtifact(t, completeOutput, {
    fileName: 'second.md',
  });
  function grade({
    response = complete.response,
    artifacts = [complete.artifact],
  }) {
    return gradeTakeItOfflineResult({
      definition,
      caseDefinition,
      result: normalizedResult({
        model: 'test-model',
        output: response,
        invokedSkills: ['writing-foundation', 'agent-writing', 'take-it-offline'],
        artifacts,
      }),
      resolveArtifact: continuationArtifactResolver,
      resolveReference: referenceResolver,
    });
  }

  assert.equal(grade({}).passed, true);
  assert.equal(grade({ artifacts: [] }).passed, false);
  assert.equal(
    grade({ artifacts: [complete.artifact, second.artifact] }).passed,
    false,
  );
  assert.equal(
    grade({
      artifacts: [{ ...complete.artifact, mediaType: 'application/json' }],
    }).passed,
    false,
  );
  assert.equal(
    grade({
      artifacts: [{
        reference: 'not-a-valid-test-artifact',
        mediaType: 'text/markdown',
      }],
    }).passed,
    false,
  );
  assert.equal(grade({ response: 'Continuation created.' }).passed, false);
  assert.equal(grade({ artifacts: [malformed.artifact] }).passed, false);
});

test('continuations do not duplicate state owned by the status artifact', () => {
  const status = readJson(path.join(fixtureRoot, 'artifacts', 'status.json'));
  for (const fixture of ['complete.md', 'pressure.md']) {
    const continuation = readFixture(`continuations/${fixture}`);
    assert.match(continuation, /\(fixture:\/\/status\.json\)/);
    assert.equal(continuation.includes(status.branch), false);
    assert.doesNotMatch(continuation, /^Next action:\s+run the focused/im);
    assert.match(continuation, /^Next action:.*status artifact.*nextAction/im);
  }
});

test('canonical package discovers Take It Offline without test fixtures', (t) => {
  assertFile(path.join(skillRoot, 'SKILL.md'));
  const packageRoot = createTakeItOfflinePackage(t);
  const packageDefinition = discoverCanonicalPackage(packageRoot);
  const takeItOffline = packageDefinition.skills.find(
    ({ name }) => name === 'take-it-offline',
  );

  assert.ok(takeItOffline);
  assert.equal(
    takeItOffline.definitionPath,
    path.join(packageRoot, 'skills', 'take-it-offline', 'SKILL.md'),
  );
  assert.equal(
    packageDefinition.skills.some(({ definitionPath }) => (
      definitionPath.startsWith(fixtureRoot)
    )),
    false,
  );
});

test('production resolution fails closed on the exact Agent Writing name', async (t) => {
  let executions = 0;
  const packageRoot = createTakeItOfflinePackage(t);
  const adapter = defineProductionAdapter({
    name: 'take-it-offline-missing-dependency',
    async execute() {
      executions += 1;
      throw new Error('must not execute');
    },
  });

  const result = await executeProduction({
    repositoryRoot: packageRoot,
    adapter,
    invocation: {
      requestId: 'take-it-offline-missing-dependency',
      skill: 'take-it-offline',
      prompt: 'Carry this work into a fresh agent context.',
      model: 'test-model',
    },
  });

  assert.equal(executions, 0);
  assert.deepEqual(result.failure, {
    stage: 'dependency-resolution',
    code: 'missing-internal-dependency',
    message: 'Missing internal dependency "agent-writing"',
    missingSkill: 'agent-writing',
  });
  assert.deepEqual(result.observations.responses, []);
  assert.deepEqual(result.observations.artifacts, []);
});

test('owner-local definitions cover every required evaluation layer', () => {
  const definitions = expectedLayers.map((layer) => (
    readJson(path.join(evaluationRoot, `${layer}.json`))
  ));

  for (const [index, definition] of definitions.entries()) {
    assert.equal(validateEvaluationDefinition(definition), definition);
    assert.equal(definition.evaluation.layer, expectedLayers[index]);
    assert.deepEqual(definition.evaluation.hosts, ['claude-code', 'cursor']);
    assert.equal(definition.evaluation.skill, 'take-it-offline');
  }

  assert.deepEqual(
    definitions[0].evals.map(({ id }) => id),
    ['verified-state', 'missing-context', 'pressure-and-sensitive-data'],
  );
  assert.deepEqual(
    Object.fromEntries(
      definitions[3].evals.map(({ id, should_trigger: shouldTrigger }) => (
        [id, shouldTrigger]
      )),
    ),
    routingObservations,
  );
});

test('owner-local routing grading requires exact Skill membership', () => {
  const definition = readJson(path.join(evaluationRoot, 'trigger.json'));
  const { gradeTakeItOfflineRouting } = loadGrader();
  const caseById = new Map(definition.evals.map((entry) => [entry.id, entry]));
  function grade(caseId, invokedSkills, toolUses = []) {
    return gradeTakeItOfflineRouting({
      caseDefinition: caseById.get(caseId),
      result: normalizedResult({
        model: 'test-model',
        output: 'Routing observation.',
        invokedSkills,
        artifacts: [],
        toolUses,
      }),
    });
  }

  assert.equal(
    grade(
      'fresh-context-continuation',
      ['agent-writing', 'take-it-offline'],
    ).passed,
    true,
  );
  assert.equal(
    grade(
      'fresh-context-continuation',
      ['agent-writing'],
      [{ name: 'Skill', outcome: 'invoked another-skill' }],
    ).passed,
    false,
  );
  assert.equal(grade('human-summary', ['to-humans']).passed, true);
  assert.equal(grade('human-summary', ['another-skill']).passed, true);
  assert.equal(grade('human-summary', ['take-it-offline']).passed, false);
  assert.equal(
    grade(
      'canonical-direct-invocation',
      ['take-it-offline', 'to-humans'],
    ).passed,
    false,
  );
});

test('routing boundaries execute unchanged through both host cells', async (t) => {
  const definition = readJson(path.join(evaluationRoot, 'trigger.json'));
  const manifest = manifestFor(definition);
  const packageRoot = createCompletePackage(t);
  const { gradeTakeItOfflineRouting } = loadGrader();

  for (const cell of manifest.cells) {
    for (const caseDefinition of definition.evals) {
      const observed = routingObservations[caseDefinition.id];
      const invokedSkills = [];
      if (caseDefinition.id === 'human-summary') {
        invokedSkills.push('to-humans');
      } else if (observed) {
        invokedSkills.push(
          'writing-foundation',
          'agent-writing',
          'take-it-offline',
        );
      }
      const normalized = normalizedResult({
        model: cell.model,
        output: observed ? 'Continuation route selected.' : 'No continuation route.',
        invokedSkills,
        toolUses: observed
          ? [{ name: 'Skill', outcome: 'invoked take-it-offline' }]
          : [],
        artifacts: [],
      });
      const record = await runTriggerEvaluation({
        repositoryRoot: packageRoot,
        manifest,
        definition,
        caseDefinition,
        cell,
        repetition: 1,
        async execute() {
          return normalized;
        },
      });

      assert.equal(record.host, cell.host);
      assert.equal(record.deterministic.passed, true);
      assert.equal(
        gradeTakeItOfflineRouting({
          caseDefinition,
          result: normalized,
        }).passed,
        true,
      );
    }
  }
});

test('component evaluation observes Agent Writing and its test-only ablation', async (t) => {
  const definition = readJson(path.join(evaluationRoot, 'component.json'));
  const manifest = manifestFor(definition, [
    { host: 'claude-code', model: 'test-model' },
  ]);
  const packageRoot = createCompletePackage(t);
  const completeOutput = readFixture('continuations/complete.md');
  const ablatedOutput = readFixture('continuations/dependency-ablated.md');
  const complete = createContinuationArtifact(t, completeOutput);
  const { gradeTakeItOfflineResult } = loadGrader();
  const adapter = defineTestAdapter({
    name: 'take-it-offline-agent-writing-ablation',
    async execute(invocation, context) {
      return normalizedResult({
        model: invocation.model,
        output: context.dependencyAblation ? ablatedOutput : complete.response,
        invokedSkills: context.resolvedSkills,
        discoveredSkills: context.discoveredSkills,
        artifacts: context.dependencyAblation ? [] : [complete.artifact],
      });
    },
  });

  const records = await runComponentEvaluation({
    repositoryRoot: packageRoot,
    manifest,
    caseDefinition: definition.evals[0],
    cell: manifest.cells[0],
    repetition: 1,
    adapter,
    gradeOutput({ arm, result }) {
      return arm === 'treatment'
        ? gradeTakeItOfflineResult({
          definition,
          caseDefinition: definition.evals[0],
          result,
          resolveArtifact: continuationArtifactResolver,
          resolveReference: referenceResolver,
        })
        : baselineGrade();
    },
  });

  assert.deepEqual(
    records.map(({ arm }) => arm.kind),
    ['treatment', 'component-ablation'],
  );
  assert.equal(
    records[0].execution.routing.invoked_skills.includes('agent-writing'),
    true,
  );
  assert.equal(
    records[1].execution.routing.invoked_skills.includes('agent-writing'),
    false,
  );
  assert.equal(records[0].deterministic.passed, true);
  assert.equal(records[1].arm.ablated_dependency, 'agent-writing');
});

test('complete outcome beats its matched No-Skill control on both hosts', async (t) => {
  const definition = readJson(path.join(evaluationRoot, 'outcome.json'));
  const manifest = manifestFor(definition);
  const packageRoot = createCompletePackage(t);
  const completeOutput = readFixture('continuations/complete.md');
  const controlOutput = readFixture('continuations/no-skill.md');
  const complete = createContinuationArtifact(t, completeOutput);
  const { gradeTakeItOfflineResult } = loadGrader();

  for (const cell of manifest.cells) {
    const records = await runMatchedEvaluation({
      repositoryRoot: packageRoot,
      manifest,
      caseDefinition: definition.evals[0],
      cell,
      repetition: 1,
      async executeArm({ arm }) {
        return normalizedResult({
          model: cell.model,
          output: arm === 'treatment' ? complete.response : controlOutput,
          invokedSkills: arm === 'treatment'
            ? ['writing-foundation', 'agent-writing', 'take-it-offline']
            : [],
          discoveredSkills: arm === 'treatment'
            ? ['agent-writing', 'take-it-offline', 'writing-foundation']
            : [],
          artifacts: arm === 'treatment'
            ? [complete.artifact]
            : [],
        });
      },
      gradeOutput({ arm, result }) {
        const grade = gradeTakeItOfflineResult({
          definition,
          caseDefinition: definition.evals[0],
          result,
          resolveArtifact: continuationArtifactResolver,
          resolveReference: referenceResolver,
        });
        return arm === 'treatment' ? grade : {
          ...grade,
          passed: true,
          status: 'baseline',
        };
      },
    });

    const control = records.find(({ arm }) => arm.kind === 'no-skill');
    const treatment = records.find(({ arm }) => arm.kind === 'treatment');
    assert.equal(control.deterministic.checks.some(({ passed }) => !passed), true);
    assert.equal(treatment.deterministic.passed, true);
    assert.equal(
      treatment.execution.routing.invoked_skills.includes('to-humans'),
      false,
    );
  }
});

test('role fixtures cover verified, missing-context, and pressure behavior', (t) => {
  const definition = readJson(path.join(evaluationRoot, 'role.json'));
  const { gradeTakeItOfflineResult } = loadGrader();

  for (const caseDefinition of definition.evals) {
    const output = readFixture(caseDefinition.fixture_output);
    const continuation = createContinuationArtifact(t, output, {
      fileName: `${caseDefinition.id}.md`,
    });
    const result = normalizedResult({
      model: 'test-model',
      output: continuation.response,
      invokedSkills: ['writing-foundation', 'agent-writing', 'take-it-offline'],
      artifacts: [continuation.artifact],
    });
    const grade = gradeTakeItOfflineResult({
      definition,
      caseDefinition,
      result,
      resolveArtifact: continuationArtifactResolver,
      resolveReference: referenceResolver,
    });
    assert.equal(
      grade.passed,
      true,
      `${caseDefinition.id}: ${JSON.stringify(grade.checks, null, 2)}`,
    );
  }
});

test('deterministic grading rejects unsafe, unverifiable, and unresumable artifact', (t) => {
  const definition = readJson(path.join(evaluationRoot, 'role.json'));
  const caseDefinition = definition.evals[0];
  const completeOutput = readFixture(caseDefinition.fixture_output);
  const { gradeTakeItOfflineResult } = loadGrader();
  function grade(output, resolveReference = referenceResolver) {
    const continuation = createContinuationArtifact(t, output);
    return gradeTakeItOfflineResult({
      definition,
      caseDefinition,
      result: normalizedResult({
        model: 'test-model',
        output: continuation.response,
        invokedSkills: ['writing-foundation', 'agent-writing', 'take-it-offline'],
        artifacts: [continuation.artifact],
      }),
      resolveArtifact: continuationArtifactResolver,
      resolveReference,
    });
  }

  assert.equal(grade(`${completeOutput}\nOFFLINE_SECRET_CANARY_91A7\n`).passed, false);
  assert.equal(
    grade(completeOutput.replace(/^Resume when:.*$/m, '')).passed,
    false,
  );
  assert.equal(grade(completeOutput, () => false).passed, false);
});
