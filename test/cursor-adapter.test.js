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

function skillReadEvents(skill, terminalStatus = 'completed') {
  const callId = `read-skill-${skill}`;
  const args = { path: `.cursor/skills/${skill}/SKILL.md` };
  return [
    {
      type: 'tool_call',
      call_id: callId,
      name: 'read',
      status: 'running',
      args,
    },
    {
      type: 'tool_call',
      call_id: callId,
      name: 'read',
      status: terminalStatus,
    },
  ];
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
          const emittedToolEvents = typeof toolEvents === 'function'
            ? toolEvents(options.local.cwd)
            : toolEvents;
          for (const event of emittedToolEvents) yield event;
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
              reportedSkills: ['writing-foundation', 'agent-writing'],
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
    resolvedSkills: ['writing-foundation', 'agent-writing'],
  });
  assert.equal(result.observations.hostAvailableSkills, null);
  assert.deepEqual(result.observations.packageSkills, [
    'agent-writing',
    'writing-foundation',
  ]);
  assert.deepEqual(
    result.observations.skillEvents.map(({ name, operation, status }) => (
      [name, operation, status]
    )),
    [
      ['agent-writing', 'load', 'started'],
      ['agent-writing', 'load', 'succeeded'],
      ['writing-foundation', 'load', 'started'],
      ['writing-foundation', 'load', 'succeeded'],
    ],
  );
  assert.equal(
    result.observations.skillEvents.every(({ provenance }) => (
      provenance.observerVersion === '@cursor/sdk@1.0.28'
        && provenance.mechanism === 'sdk-canonical-skill-read'
    )),
    true,
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
    reportedSkills: ['writing-foundation', 'agent-writing'],
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

test('Cursor Adapter preserves root and dot-prefixed in-workspace targets', async (t) => {
  const repositoryRoot = createTracerPackage(t, canonicalRepositoryRoot);
  const adapter = createCursorAdapter({
    repositoryRoot,
    sdk: createSuccessfulSdk({}, {
      toolEvents(projectRoot) {
        function completedToolEvent(callId, name, args) {
          return {
            type: 'tool_call',
            call_id: callId,
            name,
            status: 'completed',
            args,
          };
        }

        return [
          completedToolEvent(
            'root-relative',
            'generateImage',
            { filePath: '.' },
          ),
          completedToolEvent(
            'root-absolute',
            'applyAgentDiff',
            { path: projectRoot },
          ),
          completedToolEvent(
            'dot-prefixed-file',
            'generateImage',
            { filePath: '..notes.md' },
          ),
          completedToolEvent(
            'dot-prefixed-directory',
            'applyAgentDiff',
            { path: '..draft/note.txt' },
          ),
          completedToolEvent(
            'parent-escape',
            'delete',
            { path: '../outside.txt' },
          ),
        ];
      },
      writeAdditionalArtifacts(projectRoot) {
        fs.writeFileSync(path.join(projectRoot, '..notes.md'), 'visible notes\n');
        fs.mkdirSync(path.join(projectRoot, '..draft'));
        fs.writeFileSync(
          path.join(projectRoot, '..draft', 'note.txt'),
          'visible draft\n',
        );
      },
    }),
  });

  const result = await executeProduction({
    repositoryRoot,
    adapter,
    invocation: tracerInvocation(),
  });

  for (const expected of [
    { operation: 'write', target: 'workspace' },
    { operation: 'edit', target: 'workspace' },
    { operation: 'write', target: '..notes.md' },
    { operation: 'edit', target: '..draft/note.txt' },
    { operation: 'delete', target: 'outside-workspace' },
  ]) {
    assert.ok(result.observations.attemptedMutations.some((mutation) => (
      mutation.operation === expected.operation
        && mutation.target === expected.target
        && mutation.outcome === 'succeeded'
    )));
  }
  const snapshots = new Map(
    resolveArtifacts(result).map((snapshot) => [snapshot.path, snapshot]),
  );
  assert.deepEqual(
    snapshots.get('..notes.md'),
    {
      kind: 'cursor-artifact-snapshot',
      path: '..notes.md',
      status: 'captured',
      content: 'visible notes\n',
    },
  );
  assert.deepEqual(
    snapshots.get('..draft/note.txt'),
    {
      kind: 'cursor-artifact-snapshot',
      path: '..draft/note.txt',
      status: 'captured',
      content: 'visible draft\n',
    },
  );
});

test('Cursor Adapter does not present canonical resolution as observed lifecycle', async (t) => {
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

  assert.deepEqual(result.observations.routing.resolvedSkills, [
    'writing-foundation',
    'agent-writing',
  ]);
  assert.deepEqual(result.observations.skillEvents, []);
});

test('Cursor Adapter observes only completed read-class Skill operations', async (t) => {
  const cases = [
    { label: 'read', name: 'read', observed: true },
    { label: 'renamed read tool', name: 'ReadFile', observed: true },
    {
      label: 'agents Skill root',
      name: 'read',
      observed: true,
      args: { path: '.agents/skills/agent-writing/SKILL.md' },
    },
    { label: 'write', name: 'write', observed: false },
    { label: 'edit', name: 'edit', observed: false },
    { label: 'delete', name: 'delete', observed: false },
    { label: 'move', name: 'move', observed: false },
    { label: 'shell', name: 'shell', observed: false },
    { label: 'search', name: 'search', observed: false },
    { label: 'generateImage', name: 'generateImage', observed: false },
    { label: 'applyAgentDiff', name: 'applyAgentDiff', observed: false },
    {
      label: 'read with empty Skill name',
      name: 'read',
      observed: false,
      args: { path: '.cursor/skills//SKILL.md' },
    },
    {
      label: 'read with wrong Skill path',
      name: 'read',
      observed: false,
      args: { path: '.cursor/skills/agent-writing/references/SKILL.md' },
    },
    {
      label: 'read with normalized traversal path',
      name: 'read',
      observed: false,
      args: {
        path: '.cursor/skills/writing-foundation/../agent-writing/SKILL.md',
      },
    },
    {
      label: 'ambiguous raw Skill name',
      name: 'invokeSkill',
      observed: false,
      args: { skillName: 'agent-writing' },
    },
  ];

  for (const {
    args = { path: '.cursor/skills/agent-writing/SKILL.md' },
    label,
    name,
    observed,
  } of cases) {
    await t.test(label, async (caseTest) => {
      const repositoryRoot = createTracerPackage(
        caseTest,
        canonicalRepositoryRoot,
      );
      const callId = `canonical-skill-${name}`;
      const adapter = createCursorAdapter({
        repositoryRoot,
        sdk: createSuccessfulSdk({}, {
          emitSkillReads: false,
          toolEvents: [
            {
              type: 'tool_call',
              call_id: callId,
              name,
              status: 'running',
              args,
            },
            {
              type: 'tool_call',
              call_id: callId,
              name,
              status: 'completed',
            },
          ],
        }),
      });

      const result = await executeProduction({
        repositoryRoot,
        adapter,
        invocation: tracerInvocation(),
      });
      assert.equal(
        result.observations.skillEvents.some(({ status }) => (
          status === 'succeeded'
        )),
        observed,
      );
    });
  }
});

test('Cursor Adapter requires a host call ID for Skill lifecycle evidence', async (t) => {
  const repositoryRoot = createTracerPackage(t, canonicalRepositoryRoot);
  const adapter = createCursorAdapter({
    repositoryRoot,
    sdk: createSuccessfulSdk({}, {
      emitSkillReads: false,
      toolEvents: [
        {
          type: 'tool_call',
          name: 'read',
          status: 'running',
          args: { path: '.cursor/skills/agent-writing/SKILL.md' },
        },
        {
          type: 'tool_call',
          name: 'read',
          status: 'completed',
        },
      ],
    }),
  });

  const result = await executeProduction({
    repositoryRoot,
    adapter,
    invocation: tracerInvocation(),
  });
  assert.deepEqual(result.observations.skillEvents, []);
});

test('Cursor Adapter requires stable per-call Skill read identity', async (t) => {
  const canonicalArgs = {
    path: '.cursor/skills/agent-writing/SKILL.md',
  };
  function event(callId, name, status, args, extra = {}) {
    return {
      type: 'tool_call',
      call_id: callId,
      name,
      status,
      ...(args === undefined ? {} : { args }),
      ...extra,
    };
  }
  const cases = [
    {
      label: 'omitted terminal args use running metadata',
      observed: true,
      events: [
        event('stable-read', 'read', 'running', canonicalArgs),
        event('stable-read', 'read', 'completed'),
      ],
    },
    {
      label: 'terminal non-read rejects running read',
      observed: false,
      events: [
        event('changed-operation', 'read', 'running', canonicalArgs),
        event('changed-operation', 'write', 'completed', canonicalArgs),
      ],
    },
    {
      label: 'terminal changed read tool rejects running identity',
      observed: false,
      events: [
        event('changed-read-tool', 'read', 'running', canonicalArgs),
        event('changed-read-tool', 'ReadFile', 'completed'),
      ],
    },
    {
      label: 'terminal changed target rejects running read',
      observed: false,
      events: [
        event('changed-target', 'read', 'running', canonicalArgs),
        event('changed-target', 'read', 'completed', {
          path: '.agents/skills/agent-writing/SKILL.md',
        }),
      ],
    },
    {
      label: 'terminal invalid target rejects running read',
      observed: false,
      events: [
        event('invalid-target', 'read', 'running', canonicalArgs),
        event('invalid-target', 'read', 'completed', {}),
      ],
    },
    {
      label: 'truncated running arguments cannot establish identity',
      observed: false,
      events: [
        event(
          'truncated-running',
          'read',
          'running',
          canonicalArgs,
          { truncated: { args: true } },
        ),
        event('truncated-running', 'read', 'completed'),
      ],
    },
    {
      label: 'terminal truncation reuses complete running identity',
      observed: true,
      events: [
        event('truncated-terminal', 'read', 'running', canonicalArgs),
        event(
          'truncated-terminal',
          'read',
          'completed',
          { path: '.cursor/skills/agent' },
          { truncated: { args: true } },
        ),
      ],
    },
    {
      label: 'duplicate ID non-read reuse clears completed read',
      observed: false,
      events: [
        event('reused-call', 'read', 'running', canonicalArgs),
        event('reused-call', 'read', 'completed'),
        event('reused-call', 'edit', 'running', canonicalArgs),
        event('reused-call', 'edit', 'completed'),
      ],
    },
    {
      label: 'duplicate ID fresh read still emits once',
      observed: true,
      events: [
        event('reused-read', 'read', 'running', canonicalArgs),
        event('reused-read', 'read', 'completed'),
        event('reused-read', 'read', 'running', canonicalArgs),
        event('reused-read', 'read', 'completed'),
      ],
    },
  ];

  for (const { events, label, observed } of cases) {
    await t.test(label, async (caseTest) => {
      const repositoryRoot = createTracerPackage(
        caseTest,
        canonicalRepositoryRoot,
      );
      const adapter = createCursorAdapter({
        repositoryRoot,
        sdk: createSuccessfulSdk({}, {
          emitSkillReads: false,
          toolEvents: events,
        }),
      });

      const result = await executeProduction({
        repositoryRoot,
        adapter,
        invocation: tracerInvocation(),
      });
      assert.deepEqual(
        result.observations.skillEvents
          .filter(({ status }) => status === 'succeeded')
          .map(({ name }) => name),
        observed
          ? ['agent-writing']
          : [],
      );
    });
  }
});

test('Cursor Adapter deduplicates transport events and preserves repeated loads', async (t) => {
  const repositoryRoot = createTracerPackage(t, canonicalRepositoryRoot);
  const first = skillReadEvents('agent-writing').map((event) => ({
    ...event,
    call_id: 'first-load',
  }));
  const second = skillReadEvents('agent-writing').map((event) => ({
    ...event,
    call_id: 'second-load',
  }));
  const adapter = createCursorAdapter({
    repositoryRoot,
    sdk: createSuccessfulSdk({}, {
      emitSkillReads: false,
      toolEvents: [first[0], first[0], first[1], first[1], ...second],
    }),
  });

  const result = await executeProduction({
    repositoryRoot,
    adapter,
    invocation: tracerInvocation(),
  });

  assert.deepEqual(
    result.observations.skillEvents.map(({ status, callId }) => [status, callId]),
    [
      ['started', 'first-load'],
      ['succeeded', 'first-load'],
      ['started', 'second-load'],
      ['succeeded', 'second-load'],
    ],
  );
});

test('Cursor Adapter preserves interleaved lifecycle event order', async (t) => {
  const repositoryRoot = createTracerPackage(t, canonicalRepositoryRoot);
  const [firstStart, firstEnd] = skillReadEvents('agent-writing')
    .map((event) => ({ ...event, call_id: 'first-load' }));
  const [secondStart, secondEnd] = skillReadEvents('writing-foundation')
    .map((event) => ({ ...event, call_id: 'second-load' }));
  const adapter = createCursorAdapter({
    repositoryRoot,
    sdk: createSuccessfulSdk({}, {
      emitSkillReads: false,
      toolEvents: [firstStart, secondStart, secondEnd, firstEnd],
    }),
  });

  const result = await executeProduction({
    repositoryRoot,
    adapter,
    invocation: tracerInvocation(),
  });

  assert.deepEqual(
    result.observations.skillEvents.map(({ name, status }) => [name, status]),
    [
      ['agent-writing', 'started'],
      ['writing-foundation', 'started'],
      ['writing-foundation', 'succeeded'],
      ['agent-writing', 'succeeded'],
    ],
  );
});

test('Cursor Adapter preserves failed and incomplete Skill reads', async (t) => {
  const repositoryRoot = createTracerPackage(t, canonicalRepositoryRoot);
  const toolEvents = [
    ...skillReadEvents('agent-writing', 'error'),
    ...skillReadEvents('writing-foundation', 'cancelled'),
  ];
  const adapter = createCursorAdapter({
    repositoryRoot,
    sdk: createSuccessfulSdk({}, {
      emitSkillReads: false,
      toolEvents,
    }),
  });

  const result = await executeProduction({
    repositoryRoot,
    adapter,
    invocation: tracerInvocation(),
  });

  assert.deepEqual(
    result.observations.skillEvents.map(({ name, status }) => [name, status]),
    [
      ['agent-writing', 'started'],
      ['agent-writing', 'failed'],
      ['writing-foundation', 'started'],
      ['writing-foundation', 'unknown'],
    ],
  );
});

test('Cursor Adapter does not observe incomplete Skill reads', async (t) => {
  const repositoryRoot = createTracerPackage(t, canonicalRepositoryRoot);
  const adapter = createCursorAdapter({
    repositoryRoot,
    sdk: createSuccessfulSdk({}, {
      emitSkillReads: false,
      toolEvents: [skillReadEvents('agent-writing')[0]],
    }),
  });

  const result = await executeProduction({
    repositoryRoot,
    adapter,
    invocation: tracerInvocation(),
  });

  assert.deepEqual(
    result.observations.skillEvents.map(({ name, status }) => [name, status]),
    [
      ['agent-writing', 'started'],
      ['agent-writing', 'unknown'],
    ],
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
  assert.deepEqual(
    result.observations.skillEvents.map(({ name, status }) => [name, status]),
    [
      ['agent-writing', 'started'],
      ['agent-writing', 'succeeded'],
      ['writing-foundation', 'started'],
      ['writing-foundation', 'succeeded'],
    ],
  );
  assert.equal(observation.disposed, true);
  assert.equal(fs.existsSync(observation.createOptions.local.cwd), false);
  assert.equal(fs.existsSync(observation.storeDirectory), false);
});

test('Cursor Adapter preserves Skill reads when post-run collection fails', async (t) => {
  const repositoryRoot = createTracerPackage(t, canonicalRepositoryRoot);
  const observation = {};
  const originalReaddirSync = fs.readdirSync;
  fs.readdirSync = function failProjectScan(target, options) {
    if (observation.waited && target === observation.createOptions?.local.cwd) {
      throw new Error('artifact scan exploded');
    }
    return originalReaddirSync(target, options);
  };
  t.after(() => {
    fs.readdirSync = originalReaddirSync;
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
  assert.deepEqual(result.failure, {
    stage: 'result-normalization',
    code: 'cursor-result-normalization-failed',
    message: 'artifact scan exploded',
  });
  assert.deepEqual(
    result.observations.skillEvents.map(({ name, status }) => [name, status]),
    [
      ['agent-writing', 'started'],
      ['agent-writing', 'succeeded'],
      ['writing-foundation', 'started'],
      ['writing-foundation', 'succeeded'],
    ],
  );
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
  assert.deepEqual(result.observations.routing.resolvedSkills, [
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
            yield* skillReadEvents('agent-writing');
            yield skillReadEvents('writing-foundation')[0];
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
    result.observations.skillEvents.map(({ name, status }) => [name, status]),
    [
      ['agent-writing', 'started'],
      ['agent-writing', 'succeeded'],
      ['writing-foundation', 'started'],
      ['writing-foundation', 'cancelled'],
    ],
  );
  assert.equal(
    result.observations.skillEvents.at(-1).provenance.statusSource,
    'inferred',
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
      name: 'read',
      outcome: 'attempted',
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
