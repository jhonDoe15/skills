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

function normalizedAdapterResult(invocation, context, {
  response,
  artifact,
  durationMs,
  resolvedSkills = context.resolvedSkills,
  skillEvents = [],
}) {
  return {
    status: 'succeeded',
    observations: {
      packageSkills: context.packageSkills,
      hostAvailableSkills: null,
      preExecutionInventory: {
        skillDefinitions: context.resolvedSkills.map((name) => ({
          name,
          path: `.host/skills/${name}/SKILL.md`,
          digest: '0'.repeat(64),
        })),
        plugins: [],
        ruleSources: [],
        packageDigest: '1'.repeat(64),
        truncated: false,
      },
      skillEvents,
      routing: {
        requestedSkill: invocation.skill,
        resolvedSkills,
      },
      responses: [{ text: response }],
      artifacts: artifact ? [{
        reference: artifact,
        mediaType: 'text/markdown',
      }] : [],
      toolUses: [],
      attemptedMutations: [],
    },
    failure: null,
    durationMs,
    costUsd: 0,
    model: {
      requested: invocation.model,
      resolved: 'resolved-test-model',
    },
  };
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

test('package discovery rejects noncanonical directory symlinks for Skills', (t) => {
  const fixtureRoot = createPackageFixture(
    t,
    ['agent-writing', 'writing-foundation'],
  );
  const hostSkillsRoot = path.join(fixtureRoot, '.claude', 'skills');
  fs.mkdirSync(hostSkillsRoot, { recursive: true });
  fs.symlinkSync(
    path.join(fixtureRoot, 'skills', 'agent-writing'),
    path.join(hostSkillsRoot, 'agent-writing'),
  );

  assert.throws(
    () => discoverCanonicalPackage(fixtureRoot),
    /non-canonical symlinked Skill directory.*\.claude\/skills\/agent-writing/,
  );
});

test('package discovery rejects symlinks nested under canonical Skill directories', (t) => {
  const fixtureRoot = createPackageFixture(
    t,
    ['agent-writing', 'writing-foundation'],
  );
  fs.symlinkSync(
    path.join(fixtureRoot, 'skills', 'writing-foundation'),
    path.join(fixtureRoot, 'skills', 'agent-writing', 'dependency-copy'),
  );

  assert.throws(
    () => discoverCanonicalPackage(fixtureRoot),
    /symlinked Skill definition.*skills\/agent-writing\/dependency-copy/,
  );
});

test('package discovery inspects nested symlinks named .git', (t) => {
  const fixtureRoot = createPackageFixture(
    t,
    ['agent-writing', 'writing-foundation'],
  );
  fs.symlinkSync(
    path.join(fixtureRoot, 'skills', 'writing-foundation'),
    path.join(fixtureRoot, 'skills', 'agent-writing', '.git'),
  );

  assert.throws(
    () => discoverCanonicalPackage(fixtureRoot),
    /symlinked Skill definition.*skills\/agent-writing\/\.git/,
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
    /symlinked Skill definition "skills\/writing-foundation\/SKILL\.md"/,
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

test('production and test execution reject Adapter-invented routing', async (t) => {
  const fixtureRoot = createPackageFixture(
    t,
    ['agent-writing', 'writing-foundation'],
  );
  const invocation = {
    requestId: 'routing-integrity',
    skill: 'agent-writing',
    prompt: 'Exercise routing integrity.',
    model: 'test-model',
  };
  const productionAdapter = defineProductionAdapter({
    name: 'invalid-production-routing',
    async execute(invocation, context) {
      return normalizedAdapterResult(invocation, context, {
        response: 'Omitted dependency invocation.',
        durationMs: 1,
        resolvedSkills: ['agent-writing'],
      });
    },
  });
  await assert.rejects(
    executeProduction({
      repositoryRoot: fixtureRoot,
      adapter: productionAdapter,
      invocation,
    }),
    /resolvedSkills must match resolved Skills/,
  );

  const testAdapter = defineTestAdapter({
    name: 'invalid-test-routing',
    async execute(invocation, context) {
      return normalizedAdapterResult(invocation, context, {
        response: 'Invented ablated dependency invocation.',
        durationMs: 1,
        resolvedSkills: ['writing-foundation', 'agent-writing'],
      });
    },
  });
  await assert.rejects(
    executeTest({
      repositoryRoot: fixtureRoot,
      adapter: testAdapter,
      invocation,
      dependencyAblation: {
        consumer: 'agent-writing',
        dependency: 'writing-foundation',
      },
    }),
    /resolvedSkills must match resolved Skills/,
  );
});

test('production Adapters cannot mutate normalized contract inputs', async (t) => {
  const fixtureRoot = createPackageFixture(
    t,
    ['agent-writing', 'writing-foundation'],
  );
  const adapter = defineProductionAdapter({
    name: 'production-input-integrity',
    async execute(invocation, context) {
      assert.throws(() => {
        invocation.skill = 'to-humans';
      }, TypeError);
      assert.throws(() => {
        context.resolvedSkills.pop();
      }, TypeError);
      return normalizedAdapterResult(invocation, context, {
        response: 'Contract inputs remained unchanged.',
        durationMs: 1,
      });
    },
  });

  const result = await executeProduction({
    repositoryRoot: fixtureRoot,
    adapter,
    invocation: {
      requestId: 'production-input-integrity',
      skill: 'agent-writing',
      prompt: 'Exercise immutable production inputs.',
      model: 'test-model',
    },
  });

  assert.deepEqual(result.observations.routing.resolvedSkills, [
    'writing-foundation',
    'agent-writing',
  ]);
});

test('test Adapters cannot mutate normalized contract inputs', async (t) => {
  const fixtureRoot = createPackageFixture(
    t,
    ['agent-writing', 'writing-foundation'],
  );
  const adapter = defineTestAdapter({
    name: 'test-input-integrity',
    async execute(invocation, context) {
      assert.throws(() => {
        invocation.skill = 'to-humans';
      }, TypeError);
      assert.throws(() => {
        context.resolvedSkills.push('writing-foundation');
      }, TypeError);
      return normalizedAdapterResult(invocation, context, {
        response: 'Test contract inputs remained unchanged.',
        durationMs: 1,
      });
    },
  });

  const result = await executeTest({
    repositoryRoot: fixtureRoot,
    adapter,
    invocation: {
      requestId: 'test-input-integrity',
      skill: 'agent-writing',
      prompt: 'Exercise immutable test inputs.',
      model: 'test-model',
    },
    dependencyAblation: {
      consumer: 'agent-writing',
      dependency: 'writing-foundation',
    },
  });

  assert.deepEqual(result.observations.routing.resolvedSkills, ['agent-writing']);
});

test('Claude Code and Cursor fake Adapters share one normalized Interface', async (t) => {
  const fixtureRoot = createPackageFixture(
    t,
    ['agent-writing', 'writing-foundation'],
  );
  const invocation = {
    requestId: 'adapter-conformance',
    skill: 'agent-writing',
    prompt: 'Create one agent-facing artifact.',
    model: 'test-model',
  };
  const claudeCodeAdapter = defineProductionAdapter({
    name: 'claude-code-conformance',
    async execute(invocation, context) {
      return normalizedAdapterResult(invocation, context, {
        response: 'Claude Code normalized artifact.',
        artifact: 'artifact://claude-code/output.md',
        durationMs: 12,
      });
    },
  });
  const cursorAdapter = defineProductionAdapter({
    name: 'cursor-conformance',
    execute(invocation, context) {
      return Promise.resolve(normalizedAdapterResult(invocation, context, {
        response: 'Cursor normalized artifact.',
        artifact: 'artifact://cursor/output.md',
        durationMs: 14,
        resolvedSkills: [...context.resolvedSkills].reverse(),
      }));
    },
  });

  const [claudeCodeResult, cursorResult] = await Promise.all([
    executeProduction({
      repositoryRoot: fixtureRoot,
      adapter: claudeCodeAdapter,
      invocation,
    }),
    executeProduction({
      repositoryRoot: fixtureRoot,
      adapter: cursorAdapter,
      invocation,
    }),
  ]);

  for (const result of [claudeCodeResult, cursorResult]) {
    assert.deepEqual(validateResult(result), result);
    assert.deepEqual(result.observations.packageSkills, [
      'agent-writing',
      'writing-foundation',
    ]);
    assert.deepEqual(result.model, {
      requested: 'test-model',
      resolved: 'resolved-test-model',
    });
  }
  assert.deepEqual(claudeCodeResult.observations.routing.resolvedSkills, [
    'writing-foundation',
    'agent-writing',
  ]);
  assert.deepEqual(cursorResult.observations.routing.resolvedSkills, [
    'agent-writing',
    'writing-foundation',
  ]);
  assert.equal(
    claudeCodeResult.observations.responses[0].text,
    'Claude Code normalized artifact.',
  );
  assert.equal(
    cursorResult.observations.responses[0].text,
    'Cursor normalized artifact.',
  );
  assert.equal(claudeCodeResult.durationMs, 12);
  assert.equal(cursorResult.durationMs, 14);
  assert.equal(claudeCodeResult.observations.toolUses.length, 0);
  assert.equal(cursorResult.observations.attemptedMutations.length, 0);
});

test('host Adapter result preserves normalized artifact observations', async (t) => {
  const fixtureRoot = createPackageFixture(
    t,
    ['agent-writing', 'writing-foundation'],
  );
  const adapter = defineProductionAdapter({
    name: 'artifact-conformance',
    async execute(invocation, context) {
      const result = normalizedAdapterResult(invocation, context, {
        response: 'Agent-facing artifact created.',
        artifact: 'artifact://agent-writing/output.md',
        durationMs: 12,
      });
      result.costUsd = 0.01;
      result.observations.toolUses.push({
        name: 'artifact-write',
        outcome: 'succeeded',
      });
      result.observations.attemptedMutations.push({
        operation: 'write',
        target: 'output.md',
        outcome: 'succeeded',
      });
      return result;
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
  assert.deepEqual(result.observations.packageSkills, [
    'agent-writing',
    'writing-foundation',
  ]);
  assert.deepEqual(result.observations.routing.resolvedSkills, [
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
          packageSkills: context.packageSkills,
          hostAvailableSkills: null,
          preExecutionInventory: {
            skillDefinitions: context.resolvedSkills.map((name) => ({
              name,
              path: `.host/skills/${name}/SKILL.md`,
              digest: '0'.repeat(64),
            })),
            plugins: [],
            ruleSources: [],
            packageDigest: '1'.repeat(64),
            truncated: false,
          },
          skillEvents: [],
          routing: {
            requestedSkill: invocation.skill,
            resolvedSkills: context.resolvedSkills,
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

  assert.deepEqual(result.observations.routing.resolvedSkills, ['agent-writing']);
});

test('normalized result separates inventory, availability, lifecycle, and resolution', () => {
  const result = normalizedAdapterResult(
    { skill: 'agent-writing', model: 'test-model' },
    {
      packageSkills: ['agent-writing', 'writing-foundation'],
      resolvedSkills: ['writing-foundation', 'agent-writing'],
    },
    {
      response: 'Observed exact lifecycle evidence.',
      durationMs: 1,
      skillEvents: [{
        name: 'agent-writing',
        operation: 'load',
        status: 'succeeded',
        trigger: 'user',
        callId: 'skill-call-1',
        provenance: {
          host: 'claude-code',
          mechanism: 'user-prompt-expansion',
          eventType: 'UserPromptExpansion',
          observerVersion: 'claude-code-hooks-v1',
          runId: 'session-1',
          statusSource: 'observed',
        },
      }],
    },
  );

  assert.strictEqual(validateResult(result), result);
  assert.deepEqual(result.observations.packageSkills, [
    'agent-writing',
    'writing-foundation',
  ]);
  assert.equal(result.observations.hostAvailableSkills, null);
  assert.deepEqual(result.observations.routing.resolvedSkills, [
    'writing-foundation',
    'agent-writing',
  ]);
  assert.equal(result.observations.skillEvents[0].name, 'agent-writing');

  const legacy = structuredClone(result);
  legacy.observations.discoveredSkills = legacy.observations.packageSkills;
  delete legacy.observations.packageSkills;
  assert.throws(() => validateResult(legacy), /unsupported field "discoveredSkills"/);

  const invalidProvenance = structuredClone(result);
  delete invalidProvenance.observations.skillEvents[0].provenance.observerVersion;
  assert.throws(
    () => validateResult(invalidProvenance),
    /provenance is missing "observerVersion"/,
  );
});
