'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { executeProduction } = require('../suite');
const { createCursorAdapter } = require('../suite/adapters/cursor');
const {
  AGENT_WRITING_SKILL,
  createTracerPackage,
  tracerCase,
  WRITING_FOUNDATION_MARKER,
} = require('./fixtures/cursor-agent-writing-tracer');

const canonicalRepositoryRoot = path.resolve(__dirname, '..');

function listFiles(directory, root = directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return listFiles(entryPath, root);
      return [path.relative(root, entryPath)];
    })
    .sort();
}

function responsePayload(result, kind) {
  for (const { text } of result.observations.responses) {
    try {
      const payload = JSON.parse(text);
      if (payload?.kind === kind) return payload;
    } catch {
      // Ignore non-JSON model responses.
    }
  }
  assert.fail(`missing ${kind} response`);
}

function resolveArtifact(result, artifact) {
  const match = /^response:\/\/(\d+)$/.exec(artifact.reference);
  assert.ok(match, `unresolvable artifact reference: ${artifact.reference}`);
  const response = result.observations.responses[Number(match[1])];
  assert.ok(response, `missing artifact response: ${artifact.reference}`);
  return JSON.parse(response.text);
}

function resolveArtifacts(result) {
  return result.observations.artifacts.map((artifact) => (
    resolveArtifact(result, artifact)
  ));
}

function skillReadEvents(skill) {
  const callId = `read-skill-${skill}`;
  const args = { path: `.cursor/skills/${skill}/SKILL.md` };
  return ['running', 'completed'].map((status) => ({
    type: 'tool_call',
    call_id: callId,
    name: 'read',
    status,
    args,
  }));
}

function createSuccessfulSdk(
  observation,
  {
    createRunResult,
    disposeError,
    emitSkillReads = true,
    toolEvents = [],
    writeAdditionalArtifacts,
  } = {},
) {
  class JsonlLocalAgentStore {
    constructor(directory) {
      observation.storeDirectory = directory;
    }
  }

  const Agent = {
    async create(options) {
      observation.createOptions = options;
      observation.projectFilesAtCreate = listFiles(options.local.cwd);

      const output = [
        'Activation: When a JSON path is supplied.',
        'Behavior: Parse the file and report whether parsing succeeds.',
        'Completion: Complete when the parse result is returned.',
        'Artifacts: agent-instructions.md, agent-writing-trace.json',
      ].join('\n');
      const run = {
        id: 'cursor-run-1',
        status: 'running',
        supports(operation) {
          return operation === 'cancel';
        },
        async cancel() {
          observation.cancelled = true;
        },
        async *stream() {
          observation.timeline?.push('stream');
          if (emitSkillReads) {
            for (const skill of ['agent-writing', 'writing-foundation']) {
              yield* skillReadEvents(skill);
            }
          }
          for (const event of toolEvents) yield event;
          yield {
            type: 'assistant',
            message: {
              content: [{ type: 'text', text: output }],
            },
          };
          const artifactPath = path.join(
            options.local.cwd,
            'agent-instructions.md',
          );
          yield {
            type: 'tool_call',
            call_id: 'tool-1',
            name: 'Write',
            status: 'running',
            args: { path: artifactPath },
          };
          fs.writeFileSync(artifactPath, `${output}\n`);
          fs.writeFileSync(
            path.join(options.local.cwd, 'agent-writing-trace.json'),
            `${JSON.stringify({
              invokedSkills: ['writing-foundation', 'agent-writing'],
              status: 'complete',
            }, null, 2)}\n`,
          );
          if (writeAdditionalArtifacts) {
            writeAdditionalArtifacts(options.local.cwd);
          }
          yield {
            type: 'tool_call',
            call_id: 'tool-1',
            name: 'Write',
            status: 'completed',
            result: { path: artifactPath },
          };
          this.status = 'finished';
        },
        async wait() {
          observation.waited = true;
          const result = {
            id: this.id,
            status: 'finished',
            result: output,
            model: { id: 'resolved-cursor-model' },
            durationMs: 42,
          };
          return createRunResult ? createRunResult(result) : result;
        },
      };

      return {
        agentId: 'cursor-agent-1',
        async send(prompt) {
          observation.prompt = prompt;
          observation.timeline?.push('send');
          return run;
        },
        async getUsage() {
          return {
            usage: { totalTokens: 100 },
            cost: { rawCostCents: 9, chargedCents: 7 },
            runs: [],
          };
        },
        async [Symbol.asyncDispose]() {
          observation.disposed = true;
          if (disposeError) throw disposeError;
        },
      };
    },
  };

  return { Agent, JsonlLocalAgentStore };
}

function tracerInvocation() {
  return {
    requestId: tracerCase.id,
    skill: tracerCase.skill,
    prompt: tracerCase.prompt,
    model: 'requested-cursor-model',
  };
}

test('Cursor Adapter executes the tracer in a pristine project and normalizes evidence', async (t) => {
  const repositoryRoot = createTracerPackage(t, canonicalRepositoryRoot);
  const observation = {};
  const adapter = createCursorAdapter({
    repositoryRoot,
    sdk: createSuccessfulSdk(observation),
  });

  const result = await executeProduction({
    repositoryRoot,
    adapter,
    invocation: tracerInvocation(),
  });

  assert.equal(adapter.name, 'cursor-local');
  assert.equal(observation.prompt, tracerCase.prompt);
  assert.deepEqual(observation.createOptions.model, {
    id: 'requested-cursor-model',
  });
  assert.deepEqual(observation.createOptions.local.settingSources, ['project']);
  assert.deepEqual(observation.createOptions.local.sandboxOptions, {
    enabled: true,
  });
  assert.deepEqual(observation.projectFilesAtCreate, [
    '.cursor/skills/agent-writing/SKILL.md',
    '.cursor/skills/writing-foundation/SKILL.md',
  ]);

  assert.equal(result.status, 'succeeded');
  assert.deepEqual(result.observations.routing, {
    requestedSkill: 'agent-writing',
    invokedSkills: ['writing-foundation', 'agent-writing'],
  });
  assert.deepEqual(
    responsePayload(result, 'cursor-observed-skill-invocations'),
    {
      kind: 'cursor-observed-skill-invocations',
      invokedSkills: ['agent-writing', 'writing-foundation'],
    },
  );
  assert.match(result.observations.responses[0].text, /Activation: When /);
  assert.match(result.observations.responses[0].text, /Behavior: /);
  assert.match(result.observations.responses[0].text, /Completion: Complete when /);
  const snapshots = resolveArtifacts(result);
  assert.deepEqual(snapshots.map(({ path: artifactPath }) => artifactPath), [
    'agent-instructions.md',
    'agent-writing-trace.json',
  ]);
  assert.match(snapshots[0].content, /Activation: When /);
  assert.deepEqual(JSON.parse(snapshots[1].content), {
    invokedSkills: ['writing-foundation', 'agent-writing'],
    status: 'complete',
  });
  assert.deepEqual(result.observations.toolUses, [
    {
      name: 'read',
      outcome: 'succeeded',
    },
    {
      name: 'write',
      outcome: 'succeeded',
    },
  ]);
  assert.ok(result.observations.attemptedMutations.some((mutation) => (
    mutation.operation === 'write'
      && mutation.target === 'agent-instructions.md'
      && mutation.outcome === 'succeeded'
  )));
  assert.deepEqual(result.model, {
    requested: 'requested-cursor-model',
    resolved: 'resolved-cursor-model',
  });
  assert.equal(result.durationMs, 42);
  assert.equal(result.costUsd, 0.07);

  assert.equal(observation.waited, true);
  assert.equal(observation.disposed, true);
  assert.equal(observation.cancelled, undefined);
  assert.equal(fs.existsSync(observation.createOptions.local.cwd), false);
  assert.equal(fs.existsSync(observation.storeDirectory), false);
  assert.equal(tracerCase.control.kind, 'no-skill');
  assert.deepEqual(tracerCase.control.installedSkills, []);
  assert.doesNotMatch(AGENT_WRITING_SKILL, /disable-model-invocation/);
  assert.doesNotMatch(WRITING_FOUNDATION_MARKER, /disable-model-invocation/);
  assert.deepEqual(
    tracerCase.gateOrder,
    ['deterministic', 'qualitative'],
  );
});

test('Cursor Adapter reports run identifiers before streaming', async (t) => {
  const repositoryRoot = createTracerPackage(t, canonicalRepositoryRoot);
  const observation = { timeline: [] };
  const adapter = createCursorAdapter({
    repositoryRoot,
    sdk: createSuccessfulSdk(observation),
    onRunStarted(ids) {
      observation.ids = ids;
      observation.timeline.push('callback');
    },
  });

  const result = await executeProduction({
    repositoryRoot,
    adapter,
    invocation: tracerInvocation(),
  });

  assert.equal(result.status, 'succeeded');
  assert.deepEqual(observation.ids, {
    agentId: 'cursor-agent-1',
    runId: 'cursor-run-1',
  });
  assert.deepEqual(observation.timeline.slice(0, 3), [
    'send',
    'callback',
    'stream',
  ]);
  assert.equal(
    result.observations.responses.some(({ text }) => (
      text.includes('cursor-agent-1') || text.includes('cursor-run-1')
    )),
    false,
  );
});

test('Cursor Adapter normalizes SDK image and agent diff mutations', async (t) => {
  const repositoryRoot = createTracerPackage(t, canonicalRepositoryRoot);
  const toolEvents = [
    {
      type: 'tool_call',
      call_id: 'image-attempted',
      name: 'generateImage',
      status: 'running',
      args: { filePath: 'images/pending.png' },
    },
    {
      type: 'tool_call',
      call_id: 'image-succeeded',
      name: 'generateImage',
      status: 'running',
      args: { filePath: 'images/done.png' },
    },
    {
      type: 'tool_call',
      call_id: 'image-succeeded',
      name: 'generateImage',
      status: 'completed',
      result: { filePath: 'images/done.png' },
    },
    {
      type: 'tool_call',
      call_id: 'image-failed',
      name: 'generateImage',
      status: 'error',
      args: { filePath: '../outside.png' },
    },
    {
      type: 'tool_call',
      call_id: 'diff-attempted',
      name: 'applyAgentDiff',
      status: 'running',
      args: { path: 'src/pending.js' },
    },
    {
      type: 'tool_call',
      call_id: 'diff-succeeded',
      name: 'applyAgentDiff',
      status: 'running',
      args: { path: 'src/done.js' },
    },
    {
      type: 'tool_call',
      call_id: 'diff-succeeded',
      name: 'applyAgentDiff',
      status: 'completed',
    },
    {
      type: 'tool_call',
      call_id: 'diff-failed',
      name: 'applyAgentDiff',
      status: 'error',
      args: {},
    },
  ];
  const adapter = createCursorAdapter({
    repositoryRoot,
    sdk: createSuccessfulSdk({}, { toolEvents }),
  });

  const result = await executeProduction({
    repositoryRoot,
    adapter,
    invocation: tracerInvocation(),
  });

  for (const expected of [
    { name: 'write', outcome: 'attempted' },
    { name: 'write', outcome: 'succeeded' },
    { name: 'write', outcome: 'failed' },
    { name: 'edit', outcome: 'attempted' },
    { name: 'edit', outcome: 'succeeded' },
    { name: 'edit', outcome: 'failed' },
  ]) {
    assert.ok(result.observations.toolUses.some((toolUse) => (
      toolUse.name === expected.name && toolUse.outcome === expected.outcome
    )));
  }
  for (const expected of [
    { operation: 'write', target: 'images/pending.png', outcome: 'attempted' },
    { operation: 'write', target: 'images/done.png', outcome: 'succeeded' },
    { operation: 'write', target: 'outside-workspace', outcome: 'failed' },
    { operation: 'edit', target: 'src/pending.js', outcome: 'attempted' },
    { operation: 'edit', target: 'src/done.js', outcome: 'succeeded' },
    { operation: 'edit', target: 'workspace', outcome: 'failed' },
  ]) {
    assert.ok(result.observations.attemptedMutations.some((mutation) => (
      mutation.operation === expected.operation
        && mutation.target === expected.target
        && mutation.outcome === expected.outcome
    )));
  }
});

test('Cursor Adapter does not present canonical resolution as observed invocation', async (t) => {
  const repositoryRoot = createTracerPackage(t, canonicalRepositoryRoot);
  const adapter = createCursorAdapter({
    repositoryRoot,
    sdk: createSuccessfulSdk({}, { emitSkillReads: false }),
  });

  const result = await executeProduction({
    repositoryRoot,
    adapter,
    invocation: tracerInvocation(),
  });

  assert.deepEqual(result.observations.routing.invokedSkills, [
    'writing-foundation',
    'agent-writing',
  ]);
  assert.equal(
    result.observations.responses.some(({ text }) => (
      text.includes('"kind":"cursor-observed-skill-invocations"')
    )),
    false,
  );
});

test('Cursor Adapter returns bounded safe artifact snapshots', async (t) => {
  const repositoryRoot = createTracerPackage(t, canonicalRepositoryRoot);
  const outsideRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'cursor-adapter-outside-test-'),
  );
  t.after(() => fs.rmSync(outsideRoot, { recursive: true, force: true }));
  const outsideFile = path.join(outsideRoot, 'outside.txt');
  fs.writeFileSync(outsideFile, 'outside content must not be captured\n');
  const observation = {};
  const adapter = createCursorAdapter({
    repositoryRoot,
    sdk: createSuccessfulSdk(observation, {
      writeAdditionalArtifacts(projectRoot) {
        fs.writeFileSync(
          path.join(projectRoot, 'oversized.txt'),
          Buffer.alloc((64 * 1024) + 1, 'x'),
        );
        fs.writeFileSync(
          path.join(projectRoot, 'binary.bin'),
          Buffer.from([0, 255, 1, 254]),
        );
        fs.symlinkSync(outsideFile, path.join(projectRoot, 'outside-link.txt'));
      },
    }),
  });

  const result = await executeProduction({
    repositoryRoot,
    adapter,
    invocation: tracerInvocation(),
  });

  const snapshots = resolveArtifacts(result);
  const byPath = new Map(snapshots.map((snapshot) => [snapshot.path, snapshot]));
  assert.deepEqual(byPath.get('oversized.txt'), {
    kind: 'cursor-artifact-snapshot',
    path: 'oversized.txt',
    status: 'omitted',
    reason: 'oversized',
    sizeBytes: (64 * 1024) + 1,
    limitBytes: 64 * 1024,
  });
  assert.deepEqual(byPath.get('binary.bin'), {
    kind: 'cursor-artifact-snapshot',
    path: 'binary.bin',
    status: 'omitted',
    reason: 'unsupported-media-type',
    sizeBytes: 4,
  });
  assert.equal(byPath.has('outside-link.txt'), false);
  assert.equal(
    result.observations.responses.some(({ text }) => (
      text.includes('outside content must not be captured')
    )),
    false,
  );
  assert.equal(fs.existsSync(observation.createOptions.local.cwd), false);
});

test('Cursor Adapter normalizes post-run exceptions and still disposes resources', async (t) => {
  const repositoryRoot = createTracerPackage(t, canonicalRepositoryRoot);
  const observation = {};
  const adapter = createCursorAdapter({
    repositoryRoot,
    sdk: createSuccessfulSdk(observation, {
      disposeError: new Error('disposal also failed'),
      createRunResult(result) {
        return {
          ...result,
          get model() {
            throw new Error('normalization exploded');
          },
        };
      },
    }),
  });

  const result = await executeProduction({
    repositoryRoot,
    adapter,
    invocation: tracerInvocation(),
  });

  assert.equal(result.status, 'failed');
  assert.deepEqual(result.failure, {
    stage: 'result-normalization',
    code: 'cursor-result-normalization-failed',
    message: 'normalization exploded',
  });
  assert.equal(observation.disposed, true);
  assert.equal(fs.existsSync(observation.createOptions.local.cwd), false);
  assert.equal(fs.existsSync(observation.storeDirectory), false);
});

test('Cursor Adapter normalizes cleanup failure after disposing resources', async (t) => {
  const repositoryRoot = createTracerPackage(t, canonicalRepositoryRoot);
  const observation = {};
  const originalRmSync = fs.rmSync;
  fs.rmSync = function removeThenReportFailure(target, options) {
    originalRmSync(target, options);
    if (path.basename(target).startsWith('cursor-suite-execution-')) {
      throw new Error(`cleanup failed for ${target}`);
    }
  };
  t.after(() => {
    fs.rmSync = originalRmSync;
  });
  const adapter = createCursorAdapter({
    repositoryRoot,
    sdk: createSuccessfulSdk(observation),
  });

  const result = await executeProduction({
    repositoryRoot,
    adapter,
    invocation: tracerInvocation(),
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.failure.stage, 'execution');
  assert.equal(result.failure.code, 'cursor-temporary-cleanup-failed');
  assert.equal(result.failure.message.includes('<temporary-project>'), true);
  assert.equal(result.failure.message.includes(observation.createOptions.local.cwd), false);
  assert.equal(observation.disposed, true);
  assert.equal(fs.existsSync(observation.createOptions.local.cwd), false);
  assert.equal(fs.existsSync(observation.storeDirectory), false);
});

test('Cursor Adapter reports project setup failure without executing an agent', async (t) => {
  const repositoryRoot = createTracerPackage(t, canonicalRepositoryRoot);
  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'cursor-adapter-setup-test-'),
  );
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  const adapter = createCursorAdapter({
    repositoryRoot,
    sdk: {},
    temporaryRoot,
  });

  const result = await executeProduction({
    repositoryRoot,
    adapter,
    invocation: tracerInvocation(),
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.failure.stage, 'setup');
  assert.equal(result.failure.code, 'cursor-sdk-unavailable');
  assert.deepEqual(result.observations.responses, []);
  assert.deepEqual(result.observations.artifacts, []);
  assert.deepEqual(result.model, {
    requested: 'requested-cursor-model',
    resolved: null,
  });
  assert.deepEqual(fs.readdirSync(temporaryRoot), []);
});

test('Cursor Adapter reports SDK startup failure and cleans the project', async (t) => {
  const repositoryRoot = createTracerPackage(t, canonicalRepositoryRoot);
  const observation = {};
  class JsonlLocalAgentStore {
    constructor(directory) {
      observation.storeDirectory = directory;
    }
  }
  const startupError = Object.assign(new Error('Invalid API key'), {
    code: 'authentication_failed',
    isRetryable: false,
  });
  const sdk = {
    JsonlLocalAgentStore,
    Agent: {
      async create(options) {
        observation.projectRoot = options.local.cwd;
        throw startupError;
      },
    },
  };
  const adapter = createCursorAdapter({ repositoryRoot, sdk });

  const result = await executeProduction({
    repositoryRoot,
    adapter,
    invocation: tracerInvocation(),
  });

  assert.equal(result.status, 'failed');
  assert.deepEqual(result.failure, {
    stage: 'startup',
    code: 'authentication_failed',
    message: 'Invalid API key',
  });
  assert.deepEqual(result.observations.routing.invokedSkills, [
    'writing-foundation',
    'agent-writing',
  ]);
  assert.equal(result.costUsd, null);
  assert.equal(fs.existsSync(observation.projectRoot), false);
  assert.equal(fs.existsSync(observation.storeDirectory), false);
});

test('Cursor Adapter preserves partial evidence and cancels an interrupted run', async (t) => {
  const repositoryRoot = createTracerPackage(t, canonicalRepositoryRoot);
  const observation = {};
  class JsonlLocalAgentStore {
    constructor(directory) {
      observation.storeDirectory = directory;
    }
  }
  const sdk = {
    JsonlLocalAgentStore,
    Agent: {
      async create(options) {
        observation.projectRoot = options.local.cwd;
        const run = {
          id: 'cursor-run-interrupted',
          status: 'running',
          supports(operation) {
            return operation === 'cancel';
          },
          async cancel() {
            observation.cancelled = true;
            this.status = 'cancelled';
          },
          async *stream() {
            for (const skill of ['agent-writing', 'writing-foundation']) {
              yield* skillReadEvents(skill);
            }
            yield {
              type: 'assistant',
              message: {
                content: [{
                  type: 'text',
                  text: 'Activation: When a JSON path is supplied.',
                }],
              },
            };
            const partialArtifact = path.join(
              options.local.cwd,
              'agent-instructions.md',
            );
            yield {
              type: 'tool_call',
              call_id: 'tool-interrupted',
              name: 'Write',
              status: 'running',
              args: { path: partialArtifact },
            };
            fs.writeFileSync(
              partialArtifact,
              'Activation: When a JSON path is supplied.\n',
            );
            throw Object.assign(new Error('stream interrupted'), {
              code: 'stream_interrupted',
            });
          },
          async wait() {
            observation.waitedAfterCancel = true;
            return {
              id: this.id,
              status: 'cancelled',
              error: {
                code: 'cancelled',
                message: 'Run cancelled after stream interruption',
              },
              model: { id: 'resolved-cursor-model' },
              durationMs: 25,
            };
          },
        };
        return {
          async send() {
            return run;
          },
          async getUsage() {
            return {
              usage: { totalTokens: 20 },
              cost: { rawCostCents: 2, chargedCents: 2 },
              runs: [],
            };
          },
          async [Symbol.asyncDispose]() {
            observation.disposed = true;
          },
        };
      },
    },
  };
  const adapter = createCursorAdapter({ repositoryRoot, sdk });

  const result = await executeProduction({
    repositoryRoot,
    adapter,
    invocation: tracerInvocation(),
  });

  assert.equal(result.status, 'failed');
  assert.deepEqual(result.failure, {
    stage: 'execution',
    code: 'stream_interrupted',
    message: 'stream interrupted',
  });
  assert.equal(
    result.observations.responses[0].text,
    'Activation: When a JSON path is supplied.',
  );
  assert.deepEqual(
    responsePayload(result, 'cursor-observed-skill-invocations'),
    {
      kind: 'cursor-observed-skill-invocations',
      invokedSkills: ['agent-writing', 'writing-foundation'],
    },
  );
  const partialSnapshot = resolveArtifact(
    result,
    result.observations.artifacts[0],
  );
  assert.deepEqual(partialSnapshot, {
    kind: 'cursor-artifact-snapshot',
    path: 'agent-instructions.md',
    status: 'captured',
    content: 'Activation: When a JSON path is supplied.\n',
  });
  assert.deepEqual(result.observations.toolUses, [
    {
      name: 'read',
      outcome: 'succeeded',
    },
    {
      name: 'write',
      outcome: 'attempted',
    },
  ]);
  assert.ok(result.observations.attemptedMutations.some((mutation) => (
    mutation.operation === 'write'
      && mutation.target === 'agent-instructions.md'
      && mutation.outcome === 'attempted'
  )));
  assert.deepEqual(result.model, {
    requested: 'requested-cursor-model',
    resolved: 'resolved-cursor-model',
  });
  assert.equal(result.durationMs, 25);
  assert.equal(result.costUsd, 0.02);
  assert.equal(observation.cancelled, true);
  assert.equal(observation.waitedAfterCancel, true);
  assert.equal(observation.disposed, true);
  assert.equal(fs.existsSync(observation.projectRoot), false);
  assert.equal(fs.existsSync(observation.storeDirectory), false);
});
