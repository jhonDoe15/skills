'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  defineProductionAdapter,
  discoverCanonicalPackage,
  executeProduction,
  loadCanonicalSuite,
  validateCanonicalSuite,
  validateResult,
} = require('../suite');
const {
  defineTestAdapter,
  executeTest,
} = require('../suite/testing');

const repositoryRoot = path.resolve(__dirname, '..');

test('canonical suite contract declares the exact target inventory and runtime graph', () => {
  const suite = loadCanonicalSuite(repositoryRoot);

  assert.deepEqual(
    suite.inventory.map(({ name, classification }) => [name, classification]),
    [
      ['agent-writing', 'primary'],
      ['carve', 'primary'],
      ['code-review', 'primary'],
      ['dispatch-work', 'primary'],
      ['engineering-guidance', 'primary'],
      ['implement', 'primary'],
      ['incident-investigation', 'primary'],
      ['pr-carver', 'primary'],
      ['skill-writing', 'primary'],
      ['take-it-offline', 'primary'],
      ['take-ticket', 'primary'],
      ['to-humans', 'audience'],
      ['review-coordinator', 'private'],
      ['review-worker', 'private'],
      ['skill-evaluation', 'private'],
      ['skill-mechanics', 'private'],
      ['slice-plan', 'private'],
      ['ticket-scope', 'private'],
      ['writing-foundation', 'private'],
    ],
  );
  assert.equal(suite.runtimeEdges.length, 21);
  assert.deepEqual(
    suite.externalPrerequisites.map(({ name }) => name),
    ['autopilot', 'split-to-prs', 'tdd'],
  );
  assert.deepEqual(validateCanonicalSuite(suite), suite);
});

function createPackageFixture(t, skillNames) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'canonical-suite-'));
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

test('package discovery reads only canonical Skill definitions', (t) => {
  const fixtureRoot = createPackageFixture(t, ['agent-writing', 'writing-foundation']);

  assert.deepEqual(
    discoverCanonicalPackage(fixtureRoot).skills.map(({ name }) => name),
    ['agent-writing', 'writing-foundation'],
  );

  const copiedDefinition = path.join(
    fixtureRoot,
    '.claude',
    'skills',
    'agent-writing',
    'SKILL.md',
  );
  fs.mkdirSync(path.dirname(copiedDefinition), { recursive: true });
  fs.copyFileSync(
    path.join(fixtureRoot, 'skills', 'agent-writing', 'SKILL.md'),
    copiedDefinition,
  );

  assert.throws(
    () => discoverCanonicalPackage(fixtureRoot),
    /non-canonical Skill definition.*\.claude\/skills\/agent-writing\/SKILL\.md/,
  );
});

test('package discovery rejects generated copies inside the canonical root', (t) => {
  const fixtureRoot = createPackageFixture(t, ['agent-writing', 'writing-foundation']);
  const generatedCopy = path.join(
    fixtureRoot,
    'skills',
    'agent-writing',
    'generated',
    'SKILL.md',
  );
  fs.mkdirSync(path.dirname(generatedCopy), { recursive: true });
  fs.copyFileSync(
    path.join(fixtureRoot, 'skills', 'agent-writing', 'SKILL.md'),
    generatedCopy,
  );

  assert.throws(
    () => discoverCanonicalPackage(fixtureRoot),
    /generated or nested Skill definition.*skills\/agent-writing\/generated\/SKILL\.md/,
  );
});

test('package discovery rejects aliases, symlinks, and fallback roots', (t) => {
  const aliasRoot = createPackageFixture(t, ['lean']);
  assert.throws(
    () => discoverCanonicalPackage(aliasRoot),
    /unknown or aliased Skill definition "lean"/,
  );

  const symlinkRoot = createPackageFixture(
    t,
    ['agent-writing', 'writing-foundation'],
  );
  const linkedDefinition = path.join(
    symlinkRoot,
    'skills',
    'writing-foundation',
    'SKILL.md',
  );
  fs.rmSync(linkedDefinition);
  fs.symlinkSync(
    path.join(symlinkRoot, 'skills', 'agent-writing', 'SKILL.md'),
    linkedDefinition,
  );
  assert.throws(
    () => discoverCanonicalPackage(symlinkRoot),
    /symlinked Skill definition "writing-foundation"/,
  );

  const fallbackRoot = createPackageFixture(t, ['agent-writing']);
  fs.mkdirSync(path.join(fallbackRoot, '.cursor'), { recursive: true });
  fs.renameSync(
    path.join(fallbackRoot, 'skills'),
    path.join(fallbackRoot, '.cursor', 'skills'),
  );
  assert.throws(() => discoverCanonicalPackage(fallbackRoot));
});

test('canonical validators reject malformed target inventory and graph contracts', () => {
  const canonical = loadCanonicalSuite(repositoryRoot);
  const mutate = (change) => {
    const candidate = structuredClone(canonical);
    change(candidate);
    return () => validateCanonicalSuite(candidate);
  };

  assert.throws(
    mutate((suite) => suite.aliases.push('lean')),
    /aliases are not permitted/,
  );
  assert.throws(
    mutate((suite) => suite.inventory.push({ ...suite.inventory[0] })),
    /duplicate "agent-writing"/,
  );
  assert.throws(
    mutate((suite) => {
      suite.inventory[0].classification = 'public';
    }),
    /unknown classification "public"/,
  );
  assert.throws(
    mutate((suite) => suite.inventory.pop()),
    /exact canonical 19-Skill target/,
  );
  assert.throws(
    mutate((suite) => {
      suite.runtimeEdges[0].dependency = 'unknown-skill';
    }),
    /unknown dependency "unknown-skill"/,
  );
  assert.throws(
    mutate((suite) => suite.runtimeEdges.push({ ...suite.runtimeEdges[0] })),
    /duplicate "agent-writing->writing-foundation"/,
  );
  assert.throws(
    mutate((suite) => {
      suite.runtimeEdges[0].dependency = 'agent-writing';
    }),
    /self-edge "agent-writing"/,
  );
  assert.throws(
    mutate((suite) => {
      suite.runtimeEdges.push({
        consumer: 'writing-foundation',
        dependency: 'agent-writing',
      });
    }),
    /cycle/,
  );
  assert.equal(
    canonical.runtimeEdges.some((edge) => (
      edge.consumer === 'carve' && edge.dependency === 'dispatch-work'
    )),
    false,
  );
});

test('production dependency resolution fails before execution with the exact name', async (t) => {
  const fixtureRoot = createPackageFixture(t, ['implement']);
  let executions = 0;
  const adapter = defineProductionAdapter({
    name: 'conformance-host',
    async execute() {
      executions += 1;
      throw new Error('must not execute');
    },
  });

  const result = await executeProduction({
    repositoryRoot: fixtureRoot,
    adapter,
    invocation: {
      requestId: 'missing-dependency',
      skill: 'implement',
      prompt: 'Implement one bounded change.',
      model: 'test-model',
    },
  });

  assert.equal(executions, 0);
  assert.equal(result.status, 'failed');
  assert.deepEqual(result.failure, {
    stage: 'dependency-resolution',
    code: 'missing-internal-dependency',
    message: 'Missing internal dependency "engineering-guidance"',
    missingSkill: 'engineering-guidance',
  });
  assert.deepEqual(result.observations.responses, []);
  assert.deepEqual(result.observations.artifacts, []);
  assert.deepEqual(result.observations.toolUses, []);
  assert.deepEqual(result.observations.attemptedMutations, []);
});

test('host Adapters preserve required observations through one normalized Interface', async (t) => {
  const fixtureRoot = createPackageFixture(
    t,
    ['agent-writing', 'writing-foundation'],
  );
  const adapter = defineProductionAdapter({
    name: 'conformance-host',
    async execute(invocation, context) {
      return {
        status: 'succeeded',
        observations: {
          discoveredSkills: context.discoveredSkills,
          routing: {
            requestedSkill: invocation.skill,
            invokedSkills: context.resolvedSkills,
          },
          responses: [{ text: 'Agent-facing artifact created.' }],
          artifacts: [{
            reference: 'artifact://agent-writing/output.md',
            mediaType: 'text/markdown',
          }],
          toolUses: [{ name: 'artifact-write', outcome: 'succeeded' }],
          attemptedMutations: [{
            operation: 'write',
            target: 'output.md',
            outcome: 'succeeded',
          }],
        },
        failure: null,
        durationMs: 12,
        costUsd: 0.01,
        model: {
          requested: invocation.model,
          resolved: 'resolved-test-model',
        },
      };
    },
  });

  const result = await executeProduction({
    repositoryRoot: fixtureRoot,
    adapter,
    invocation: {
      requestId: 'adapter-conformance',
      skill: 'agent-writing',
      prompt: 'Create one agent-facing artifact.',
      model: 'test-model',
    },
  });

  assert.deepEqual(validateResult(result), result);
  assert.deepEqual(result.observations.discoveredSkills, [
    'agent-writing',
    'writing-foundation',
  ]);
  assert.deepEqual(result.observations.routing.invokedSkills, [
    'writing-foundation',
    'agent-writing',
  ]);
  assert.equal(result.observations.responses[0].text, 'Agent-facing artifact created.');
  assert.equal(
    result.observations.artifacts[0].reference,
    'artifact://agent-writing/output.md',
  );
  assert.equal(result.observations.toolUses[0].name, 'artifact-write');
  assert.equal(result.observations.attemptedMutations[0].operation, 'write');
  assert.deepEqual(result.model, {
    requested: 'test-model',
    resolved: 'resolved-test-model',
  });
  assert.equal(result.durationMs, 12);
  assert.equal(result.costUsd, 0.01);
});

test('dependency ablation is available only through the test Adapter boundary', async (t) => {
  const fixtureRoot = createPackageFixture(
    t,
    ['agent-writing', 'writing-foundation'],
  );
  const testAdapter = defineTestAdapter({
    name: 'component-evaluation',
    async execute(invocation, context) {
      return {
        status: 'succeeded',
        observations: {
          discoveredSkills: context.discoveredSkills,
          routing: {
            requestedSkill: invocation.skill,
            invokedSkills: context.resolvedSkills,
          },
          responses: [{ text: 'Test-only component observation.' }],
          artifacts: [],
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
    },
  });
  const invocation = {
    requestId: 'component-ablation',
    skill: 'agent-writing',
    prompt: 'Exercise the consumer without one dependency invocation.',
    model: 'test-model',
  };

  await assert.rejects(
    executeProduction({
      repositoryRoot: fixtureRoot,
      adapter: testAdapter,
      invocation,
    }),
    /production execution requires a production Adapter/,
  );
  await assert.rejects(
    executeProduction({
      repositoryRoot: fixtureRoot,
      adapter: defineProductionAdapter({
        name: 'production-host',
        async execute() {
          throw new Error('must not execute');
        },
      }),
      invocation: {
        ...invocation,
        dependencyAblation: {
          consumer: 'agent-writing',
          dependency: 'writing-foundation',
        },
      },
    }),
    /unsupported production invocation field "dependencyAblation"/,
  );

  const result = await executeTest({
    repositoryRoot: fixtureRoot,
    adapter: testAdapter,
    invocation,
    dependencyAblation: {
      consumer: 'agent-writing',
      dependency: 'writing-foundation',
    },
  });

  assert.deepEqual(result.observations.routing.invokedSkills, ['agent-writing']);
});
