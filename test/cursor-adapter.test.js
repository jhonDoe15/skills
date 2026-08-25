'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { executeProduction } = require('../suite');
const { createCursorAdapter } = require('../suite/adapters/cursor');
const {
  createTracerPackage,
  tracerCase,
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

function createSuccessfulSdk(observation) {
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
          return {
            id: this.id,
            status: 'finished',
            result: output,
            model: { id: 'resolved-cursor-model' },
            durationMs: 42,
          };
        },
      };

      return {
        agentId: 'cursor-agent-1',
        async send(prompt) {
          observation.prompt = prompt;
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
  assert.match(result.observations.responses[0].text, /Activation: When /);
  assert.match(result.observations.responses[0].text, /Behavior: /);
  assert.match(result.observations.responses[0].text, /Completion: Complete when /);
  assert.deepEqual(
    result.observations.artifacts.map(({ reference }) => reference),
    [
      'workspace://agent-instructions.md',
      'workspace://agent-writing-trace.json',
    ],
  );
  assert.deepEqual(result.observations.toolUses, [{
    name: 'write',
    outcome: 'succeeded',
  }]);
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
  assert.deepEqual(
    tracerCase.gateOrder,
    ['deterministic', 'qualitative'],
  );
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
  assert.deepEqual(result.observations.responses, [{
    text: 'Activation: When a JSON path is supplied.',
  }]);
  assert.deepEqual(result.observations.artifacts, [{
    reference: 'workspace://agent-instructions.md',
    mediaType: 'text/markdown',
  }]);
  assert.deepEqual(result.observations.toolUses, [{
    name: 'write',
    outcome: 'attempted',
  }]);
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
