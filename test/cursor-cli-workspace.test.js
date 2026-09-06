'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  cliModel,
  createCursorCliWorkspaceAdapter,
  evidenceFrom,
  hasReviewReport,
  recognizedReviewLoads,
  runCursorCli,
} = require('../suite/adapters/cursor-cli-workspace');

function model(id, reasoning) {
  return {
    id,
    params: [
      { id: 'context', value: '272k' },
      { id: 'reasoning', value: reasoning },
      { id: 'fast', value: 'false' },
    ],
  };
}

function git(workspace, ...args) {
  const result = spawnSync('git', args, { cwd: workspace, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}

function event(value) {
  return JSON.stringify(value);
}

test('maps exact Luna and Terra selections to local CLI variants', () => {
  assert.equal(cliModel(model('gpt-5.6-luna', 'max')), 'gpt-5.6-luna-max');
  assert.equal(cliModel(model('gpt-5.6-terra', 'high')), 'gpt-5.6-terra-high');
});

test('extracts skill and completed subagent telemetry from CLI events', () => {
  const events = [
    {
      type: 'tool_call',
      subtype: 'completed',
      tool_call: {
        readToolCall: {
          args: { path: '.cursor/skills/code-review/SKILL.md' },
        },
      },
    },
    {
      type: 'tool_call',
      subtype: 'started',
      tool_call: { taskToolCall: { args: {} } },
    },
    {
      type: 'tool_call',
      subtype: 'completed',
      tool_call: { taskToolCall: { args: {} } },
    },
  ];
  assert.deepEqual(evidenceFrom(events), {
    toolCalls: [
      { name: 'read', status: 'completed' },
      { name: 'task', status: 'started' },
      { name: 'task', status: 'completed' },
    ],
    skillLoads: ['code-review'],
    reviewLoads: 1,
    subagentCalls: 1,
  });
});

test('recognizes the two-axis review report emitted by the pinned workflow', () => {
  const report = '## Standards\nPASS\n\n## Spec\nPASS';
  const toolCalls = [
    { name: 'task', status: 'started' },
    { name: 'task', status: 'started' },
    { name: 'task', status: 'completed' },
    { name: 'task', status: 'completed' },
  ];
  assert.equal(hasReviewReport(report), true);
  assert.equal(hasReviewReport('## Standards\nPASS'), false);
  assert.equal(recognizedReviewLoads({
    reviewLoads: 0,
    subagentCalls: 2,
    toolCalls,
    output: report,
  }), 1);
  assert.equal(recognizedReviewLoads({
    reviewLoads: 2,
    subagentCalls: 2,
    toolCalls,
    output: report,
  }), 2);
});

test('waits for a timed-out CLI process to close', async (t) => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-timeout-test-'));
  const marker = path.join(workspace, 'closed.txt');
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }));

  const script = [
    "const fs = require('node:fs');",
    'const marker = process.argv[1];',
    "process.on('SIGTERM', () => {",
    '  setTimeout(() => {',
    "    fs.writeFileSync(marker, 'closed\\n');",
    '    process.exit(0);',
    '  }, 75);',
    '});',
    "process.stdout.write('ready\\n');",
    'setInterval(() => {}, 1000);',
  ].join('\n');

  await assert.rejects(
    runCursorCli({
      command: process.execPath,
      args: ['-e', script, marker],
      cwd: workspace,
      env: { ...process.env },
      timeoutMs: 250,
    }),
    /Cursor CLI execution timed out/,
  );

  assert.equal(fs.readFileSync(marker, 'utf8'), 'closed\n');
});

test('CLI workspace adapter preserves committed work and telemetry', async (t) => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-cli-test-'));
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }));
  git(workspace, 'init', '-b', 'feature');
  git(workspace, 'config', 'user.name', 'Fixture');
  git(workspace, 'config', 'user.email', 'fixture@example.invalid');
  fs.writeFileSync(path.join(workspace, 'file.txt'), 'before\n');
  git(workspace, 'add', '.');
  git(workspace, 'commit', '-m', 'base');

  let invocation;
  const adapter = createCursorCliWorkspaceAdapter({
    apiKey: 'fixture-key',
    async execute(options) {
      invocation = options;
      fs.writeFileSync(path.join(options.cwd, 'file.txt'), 'after\n');
      git(options.cwd, 'add', '.');
      git(options.cwd, 'commit', '-m', 'test: implement');
      return {
        status: 0,
        signal: null,
        stderr: '',
        stdout: [
          event({
            type: 'system',
            subtype: 'init',
            session_id: 'session-1',
          }),
          event({
            type: 'tool_call',
            subtype: 'started',
            tool_call: { taskToolCall: { args: {} } },
          }),
          event({
            type: 'tool_call',
            subtype: 'started',
            tool_call: { taskToolCall: { args: {} } },
          }),
          event({
            type: 'tool_call',
            subtype: 'completed',
            tool_call: { taskToolCall: { args: {} } },
          }),
          event({
            type: 'tool_call',
            subtype: 'completed',
            tool_call: { taskToolCall: { args: {} } },
          }),
          event({
            type: 'result',
            subtype: 'success',
            is_error: false,
            duration_ms: 10,
            result: '## Standards\nPASS\n\n## Spec\nPASS',
            request_id: 'request-1',
          }),
        ].join('\n'),
      };
    },
  });

  const result = await adapter.execute({
    workspace,
    prompt: 'Implement.',
    model: model('gpt-5.6-terra', 'high'),
  });

  assert.equal(result.status, 'succeeded');
  assert.equal(result.reviewLoads, 1);
  assert.equal(result.subagentCalls, 2);
  assert.notEqual(result.git.baseRevision, result.git.headRevision);
  assert.ok(invocation.args.includes('gpt-5.6-terra-high'));
  assert.equal(invocation.env.CURSOR_API_KEY, 'fixture-key');
});
