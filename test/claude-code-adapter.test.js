'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  discoverCanonicalPackage,
  executeProduction,
} = require('../suite');
const {
  createClaudeCodeAdapter,
} = require('../suite/adapters/claude-code');

const REQUESTED_MODEL = 'requested-test-model';
const RESOLVED_MODEL = 'resolved-test-model-20260825';
const TEST_TIMEOUT_MS = 5_000;
const repositoryRoot = path.resolve(__dirname, '..');
const tracerRoot = path.join(
  __dirname,
  'fixtures',
  'claude-agent-writing-tracer',
);

function createPackageFixture(t, skillNames = [
  'agent-writing',
  'writing-foundation',
]) {
  const fixtureRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'claude-adapter-package-'),
  );
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));

  fs.mkdirSync(path.join(fixtureRoot, 'suite'), { recursive: true });
  fs.copyFileSync(
    path.join(repositoryRoot, 'suite', 'canonical-suite.json'),
    path.join(fixtureRoot, 'suite', 'canonical-suite.json'),
  );

  for (const skillName of skillNames) {
    const skillDirectory = path.join(fixtureRoot, 'skills', skillName);
    fs.mkdirSync(skillDirectory, { recursive: true });
    fs.copyFileSync(
      path.join(tracerRoot, `${skillName}.skill.md`),
      path.join(skillDirectory, 'SKILL.md'),
    );
  }

  return fixtureRoot;
}

function createFakeClaude(t, {
  events,
  exitCode = 0,
  pluginList = [],
  pluginListExitCode = 0,
  pluginListOutput = null,
  pluginListStderr = '',
  observerEvents = null,
  captureObserverProjection = false,
}) {
  const fixtureRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'fake-claude-command-'),
  );
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));

  const commandPath = path.join(fixtureRoot, 'claude');
  const logPath = `${commandPath}.log`;
  const pluginListStdout = pluginListOutput ?? JSON.stringify(pluginList);
  const script = `#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const args = process.argv.slice(2);
const environment = {
  autoMemoryDisabled: process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY,
  claudeAiConnectorsEnabled: process.env.ENABLE_CLAUDEAI_MCP_SERVERS,
  hasClaudeCodeEnvironment: Object.hasOwn(process.env, 'CLAUDECODE'),
};
const isPluginListCommand = args.length === 3
  && args[0] === 'plugin'
  && args[1] === 'list'
  && args[2] === '--json';

function writeLog(record) {
  fs.appendFileSync(
    ${JSON.stringify(logPath)},
    JSON.stringify(record) + '\\n',
  );
}

if (isPluginListCommand) {
  writeLog({
    kind: 'plugin-list',
    args,
    cwd: process.cwd(),
    environment,
  });
  process.stdout.write(${JSON.stringify(pluginListStdout)});
  process.stderr.write(${JSON.stringify(pluginListStderr)});
  process.exitCode = ${pluginListExitCode};
} else {
  const skillsRoot = path.join(process.cwd(), '.claude', 'skills');
  const skills = fs.existsSync(skillsRoot)
    ? fs.readdirSync(skillsRoot).sort()
    : [];
  const definitions = Object.fromEntries(skills.map((name) => [
    name,
    fs.readFileSync(path.join(skillsRoot, name, 'SKILL.md'), 'utf8'),
  ]));
  const stdin = fs.readFileSync(0, 'utf8');
  writeLog({
    kind: 'session',
    args,
    cwd: process.cwd(),
    definitions,
    environment,
    skills,
    stdin,
  });
  if (process.env.SUITE_CLAUDE_SKILL_OBSERVER_LOG) {
    const observerEvents = ${JSON.stringify(observerEvents)};
    if (observerEvents) {
      const settingsIndex = args.indexOf('--settings');
      const settings = JSON.parse(args[settingsIndex + 1]);
      const observerScript = settings.hooks.PreToolUse[0].hooks[0].args[0];
      for (const event of observerEvents) {
        const input = typeof event === 'string' ? event : JSON.stringify(event);
        spawnSync(process.execPath, [observerScript], {
          input,
          env: process.env,
          encoding: 'utf8',
        });
      }
      if (${captureObserverProjection}) {
        writeLog({
          kind: 'observer-projection',
          contents: fs.existsSync(process.env.SUITE_CLAUDE_SKILL_OBSERVER_LOG)
            ? fs.readFileSync(process.env.SUITE_CLAUDE_SKILL_OBSERVER_LOG, 'utf8')
            : '',
        });
      }
    }
  }
  for (const event of ${JSON.stringify(events)}) {
    process.stdout.write(JSON.stringify(event) + '\\n');
  }
  process.exitCode = ${exitCode};
}
`;
  fs.writeFileSync(commandPath, script, { mode: 0o755 });

  return { commandPath, logPath };
}

function readCommandLog(logPath) {
  return fs.readFileSync(logPath, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
}

function invocation(model = REQUESTED_MODEL) {
  const tracer = JSON.parse(
    fs.readFileSync(path.join(tracerRoot, 'case.json'), 'utf8'),
  );
  return {
    ...tracer.request,
    model,
  };
}

function successEvents() {
  const artifact = [
    '# Deploy status instruction',
    '',
    '## Activation',
    'Inspect deploy-status.json after deployment finishes.',
    '',
    '## Action',
    'Report the status field to the requesting agent.',
    '',
    '## Done when',
    'The report names the observed status.',
  ].join('\n');

  return [
    {
      type: 'system',
      subtype: 'init',
      model: RESOLVED_MODEL,
      skills: ['agent-writing', 'writing-foundation'],
    },
    {
      type: 'assistant',
      message: {
        content: [{
          type: 'tool_use',
          id: 'writing-foundation-use',
          name: 'Skill',
          input: { skill: 'writing-foundation' },
        }],
      },
    },
    {
      type: 'assistant',
      message: {
        content: [{ type: 'text', text: artifact }],
      },
    },
    {
      type: 'result',
      result: artifact,
      is_error: false,
      duration_ms: 17,
      total_cost_usd: 0.012,
    },
  ];
}

function hookSkillEvent(hookEventName, skill, callId, extra = {}) {
  return {
    session_id: 'claude-session-1',
    hook_event_name: hookEventName,
    tool_name: 'Skill',
    tool_input: { skill },
    tool_use_id: callId,
    ...extra,
  };
}

function successfulObserverEvents() {
  return [
    {
      session_id: 'claude-session-1',
      hook_event_name: 'UserPromptExpansion',
      expansion_type: 'slash_command',
      command_name: 'agent-writing',
      command_source: 'skill',
      prompt: '/agent-writing',
    },
    hookSkillEvent(
      'PreToolUse',
      'writing-foundation',
      'writing-foundation-use',
    ),
    hookSkillEvent(
      'PostToolUse',
      'writing-foundation',
      'writing-foundation-use',
    ),
  ];
}

test('Claude Code Adapter executes the host-local Agent Writing tracer', async (t) => {
  const fixtureRoot = createPackageFixture(t);
  const fakeClaude = createFakeClaude(t, {
    events: successEvents(),
    observerEvents: successfulObserverEvents(),
  });
  const adapter = createClaudeCodeAdapter({
    skillsRoot: path.join(fixtureRoot, 'skills'),
    command: fakeClaude.commandPath,
    timeoutMs: TEST_TIMEOUT_MS,
    maxBudgetUsd: 0.25,
  });

  const result = await executeProduction({
    repositoryRoot: fixtureRoot,
    adapter,
    invocation: invocation(),
  });

  assert.equal(result.status, 'succeeded', JSON.stringify(result, null, 2));
  assert.deepEqual(result.model, {
    requested: REQUESTED_MODEL,
    resolved: RESOLVED_MODEL,
  });
  assert.deepEqual(result.observations.packageSkills, [
    'agent-writing',
    'writing-foundation',
  ]);
  assert.deepEqual(result.observations.routing, {
    requestedSkill: 'agent-writing',
    resolvedSkills: ['writing-foundation', 'agent-writing'],
  });
  assert.deepEqual(result.observations.hostAvailableSkills.names, [
    'agent-writing',
    'writing-foundation',
  ]);
  assert.deepEqual(
    result.observations.skillEvents.map((event) => (
      [event.name, event.operation, event.status, event.trigger]
    )),
    [
      ['agent-writing', 'select', 'succeeded', 'user'],
      ['agent-writing', 'load', 'succeeded', 'user'],
      ['writing-foundation', 'select', 'started', 'model'],
      ['writing-foundation', 'load', 'started', 'model'],
      ['writing-foundation', 'load', 'succeeded', 'model'],
    ],
  );
  assert.equal(
    result.observations.skillEvents.every(({ provenance }) => (
      provenance.observerVersion === 'claude-code-hooks-v1'
    )),
    true,
  );
  assert.deepEqual(result.observations.toolUses, [
    { name: 'SlashCommand', outcome: 'submitted /agent-writing' },
    { name: 'Skill', outcome: 'invoked writing-foundation' },
  ]);
  assert.deepEqual(result.observations.artifacts, [{
    reference: 'response://0',
    mediaType: 'text/markdown',
  }]);
  assert.match(result.observations.responses[0].text, /^## Activation$/m);
  assert.match(result.observations.responses[0].text, /^## Action$/m);
  assert.match(result.observations.responses[0].text, /^## Done when$/m);
  assert.equal(result.failure, null);
  assert.equal(result.durationMs, 17);
  assert.equal(result.costUsd, 0.012);

  const execution = readCommandLog(fakeClaude.logPath).at(-1);
  assert.deepEqual(execution.skills, ['agent-writing', 'writing-foundation']);
  assert.match(
    execution.definitions['agent-writing'],
    /Invoke `writing-foundation` by its canonical name/,
  );
  assert.doesNotMatch(
    execution.definitions['agent-writing'],
    /Record that execution reached this canonical dependency/,
  );
  assert.equal(execution.environment.hasClaudeCodeEnvironment, false);
  assert.equal(fs.existsSync(execution.cwd), false);

  assert.equal(
    execution.stdin,
    `/agent-writing\n\n${invocation().prompt}`,
  );
  assert.equal(
    execution.args.some((argument) => argument.includes(invocation().prompt)),
    false,
  );
  assert.deepEqual(
    execution.args.slice(
      execution.args.indexOf('--setting-sources'),
      execution.args.indexOf('--setting-sources') + 2,
    ),
    ['--setting-sources', 'project'],
  );
  assert.ok(execution.args.includes('--no-session-persistence'));
  assert.deepEqual(
    execution.args.slice(
      execution.args.indexOf('--tools'),
      execution.args.indexOf('--tools') + 2,
    ),
    ['--tools', 'Skill'],
  );
  assert.deepEqual(
    execution.args.slice(
      execution.args.indexOf('--output-format'),
      execution.args.indexOf('--output-format') + 2,
    ),
    ['--output-format', 'stream-json'],
  );
  assert.deepEqual(
    execution.args.slice(
      execution.args.indexOf('--max-budget-usd'),
      execution.args.indexOf('--max-budget-usd') + 2,
    ),
    ['--max-budget-usd', '0.25'],
  );
});

test('Claude Code Adapter suppresses controllable ambient host state', async (t) => {
  const fixtureRoot = createPackageFixture(t);
  const hostilePluginId = 'hostile@"},"hooks":{"PreToolUse":true';
  const fakeClaude = createFakeClaude(t, {
    events: successEvents(),
    observerEvents: successfulObserverEvents(),
    pluginList: [
      { id: 'formatter@company-tools' },
      { id: hostilePluginId },
      { id: 'reviewer@company-tools' },
    ],
  });
  const adapter = createClaudeCodeAdapter({
    skillsRoot: path.join(fixtureRoot, 'skills'),
    command: fakeClaude.commandPath,
    timeoutMs: TEST_TIMEOUT_MS,
  });

  await executeProduction({
    repositoryRoot: fixtureRoot,
    adapter,
    invocation: invocation(),
  });

  const invocations = readCommandLog(fakeClaude.logPath);
  assert.deepEqual(invocations.map(({ kind }) => kind), [
    'plugin-list',
    'session',
  ]);
  const [enumeration, execution] = invocations;
  assert.deepEqual(enumeration.args, ['plugin', 'list', '--json']);
  assert.equal(enumeration.cwd, execution.cwd);
  assert.deepEqual(enumeration.environment, execution.environment);
  assert.equal(execution.environment.autoMemoryDisabled, '1');
  assert.equal(execution.environment.claudeAiConnectorsEnabled, 'false');
  assert.ok(execution.args.includes('--no-chrome'));
  assert.ok(execution.args.includes('--strict-mcp-config'));

  const mcpConfigIndex = execution.args.indexOf('--mcp-config');
  assert.deepEqual(JSON.parse(execution.args[mcpConfigIndex + 1]), {
    mcpServers: {},
  });

  const settingsIndex = execution.args.indexOf('--settings');
  const settings = JSON.parse(execution.args[settingsIndex + 1]);
  const observerScript = settings.hooks.PreToolUse[0].hooks[0].args[0];
  assert.equal(path.basename(observerScript), 'skill-observer.js');
  assert.deepEqual(Object.keys(settings.hooks).sort(), [
    'PermissionDenied',
    'PostToolUse',
    'PostToolUseFailure',
    'PreToolUse',
    'UserPromptExpansion',
  ]);
  for (const registrations of Object.values(settings.hooks)) {
    assert.equal(registrations[0].hooks[0].command, process.execPath);
    assert.equal(registrations[0].hooks[0].args[0], observerScript);
  }
  assert.deepEqual({
    ...settings,
    hooks: 'validated-above',
  }, {
    autoMemoryEnabled: false,
    disableClaudeAiConnectors: true,
    enabledPlugins: {
      'formatter@company-tools': false,
      [hostilePluginId]: false,
      'reviewer@company-tools': false,
    },
    hooks: 'validated-above',
  });
  assert.equal(execution.args.includes(hostilePluginId), false);
});

test('Claude Code Adapter fails before execution when plugin enumeration fails', async (t) => {
  const fixtureRoot = createPackageFixture(t);
  const fakeClaude = createFakeClaude(t, {
    events: successEvents(),
    pluginListExitCode: 2,
    pluginListStderr: 'sensitive host detail',
  });
  const adapter = createClaudeCodeAdapter({
    skillsRoot: path.join(fixtureRoot, 'skills'),
    command: fakeClaude.commandPath,
    timeoutMs: TEST_TIMEOUT_MS,
  });

  const result = await executeProduction({
    repositoryRoot: fixtureRoot,
    adapter,
    invocation: invocation(),
  });

  assert.equal(result.status, 'failed');
  assert.deepEqual(result.failure, {
    stage: 'startup',
    code: 'claude-plugin-enumeration-failed',
    message: 'Claude Code plugin enumeration failed before session startup',
  });
  assert.deepEqual(result.observations.toolUses, []);
  assert.equal(result.model.resolved, null);
  assert.deepEqual(
    readCommandLog(fakeClaude.logPath).map(({ kind }) => kind),
    ['plugin-list'],
  );
  assert.doesNotMatch(JSON.stringify(result), /sensitive host detail/);
});

test('Claude Code Adapter rejects invalid plugin enumeration output', async (t) => {
  const invalidOutputs = [
    'not JSON',
    '{}',
    '[{"id":""}]',
    '[{"id":42}]',
  ];

  for (const pluginListOutput of invalidOutputs) {
    const fixtureRoot = createPackageFixture(t);
    const fakeClaude = createFakeClaude(t, {
      events: successEvents(),
      pluginListOutput,
    });
    const adapter = createClaudeCodeAdapter({
      skillsRoot: path.join(fixtureRoot, 'skills'),
      command: fakeClaude.commandPath,
      timeoutMs: TEST_TIMEOUT_MS,
    });

    const result = await executeProduction({
      repositoryRoot: fixtureRoot,
      adapter,
      invocation: invocation(),
    });

    assert.equal(result.status, 'failed');
    assert.deepEqual(result.failure, {
      stage: 'setup',
      code: 'claude-plugin-enumeration-invalid',
      message: 'Claude Code plugin enumeration returned invalid output',
    });
    assert.deepEqual(
      readCommandLog(fakeClaude.logPath).map(({ kind }) => kind),
      ['plugin-list'],
    );
  }
});

test('Claude tracer fixture declares a matched No-Skill control outside package construction', (t) => {
  const fixtureRoot = createPackageFixture(t);
  const copiedTracerRoot = path.join(fixtureRoot, 'test', 'fixtures', 'tracer');
  fs.cpSync(tracerRoot, copiedTracerRoot, { recursive: true });

  const tracer = JSON.parse(
    fs.readFileSync(path.join(copiedTracerRoot, 'case.json'), 'utf8'),
  );
  assert.deepEqual(tracer.treatment.skills, [
    'agent-writing',
    'writing-foundation',
  ]);
  assert.deepEqual(tracer.control.skills, []);
  assert.ok(tracer.request.prompt);
  for (const check of tracer.deterministicChecks) {
    assert.doesNotThrow(() => new RegExp(check.pattern, check.flags));
  }
  assert.equal(
    fs.readdirSync(copiedTracerRoot).some((name) => name === 'SKILL.md'),
    false,
  );
  assert.doesNotMatch(
    fs.readFileSync(
      path.join(copiedTracerRoot, 'writing-foundation.skill.md'),
      'utf8',
    ),
    /^disable-model-invocation:\s*true$/m,
  );
  assert.deepEqual(
    discoverCanonicalPackage(fixtureRoot).skills.map(({ name }) => name),
    ['agent-writing', 'writing-foundation'],
  );
});

test('Claude Code Adapter normalizes tool, mutation, and file artifact evidence', async (t) => {
  const fixtureRoot = createPackageFixture(t);
  const events = successEvents();
  events.splice(
    2,
    0,
    {
      type: 'assistant',
      message: {
        content: [{
          type: 'tool_use',
          id: 'artifact-write',
          name: 'Write',
          input: {
            file_path: 'agent-artifact.md',
            content: '# Agent artifact',
          },
        }],
      },
    },
    {
      type: 'user',
      message: {
        content: [{
          type: 'tool_result',
          tool_use_id: 'artifact-write',
          content: 'File written',
        }],
      },
    },
  );
  const fakeClaude = createFakeClaude(t, {
    events,
    observerEvents: successfulObserverEvents(),
  });
  const adapter = createClaudeCodeAdapter({
    skillsRoot: path.join(fixtureRoot, 'skills'),
    command: fakeClaude.commandPath,
    timeoutMs: TEST_TIMEOUT_MS,
  });

  const result = await executeProduction({
    repositoryRoot: fixtureRoot,
    adapter,
    invocation: invocation(),
  });

  assert.deepEqual(result.observations.toolUses, [
    { name: 'SlashCommand', outcome: 'submitted /agent-writing' },
    { name: 'Skill', outcome: 'invoked writing-foundation' },
    { name: 'Write', outcome: 'succeeded' },
  ]);
  assert.deepEqual(result.observations.attemptedMutations, [{
    operation: 'write',
    target: 'agent-artifact.md',
    outcome: 'succeeded',
  }]);
  assert.deepEqual(result.observations.artifacts, [
    { reference: 'response://0', mediaType: 'text/markdown' },
    { reference: 'project://agent-artifact.md', mediaType: 'text/markdown' },
  ]);
});

test('Claude Code Adapter does not report a failed write as an artifact', async (t) => {
  const fixtureRoot = createPackageFixture(t);
  const events = successEvents();
  events.splice(
    2,
    0,
    {
      type: 'assistant',
      message: {
        content: [{
          type: 'tool_use',
          id: 'failed-artifact-write',
          name: 'Write',
          input: {
            file_path: 'missing-artifact.md',
            content: '# Missing artifact',
          },
        }],
      },
    },
    {
      type: 'user',
      message: {
        content: [{
          type: 'tool_result',
          tool_use_id: 'failed-artifact-write',
          content: 'Write denied',
          is_error: true,
        }],
      },
    },
  );
  const fakeClaude = createFakeClaude(t, {
    events,
    observerEvents: successfulObserverEvents(),
  });
  const adapter = createClaudeCodeAdapter({
    skillsRoot: path.join(fixtureRoot, 'skills'),
    command: fakeClaude.commandPath,
    timeoutMs: TEST_TIMEOUT_MS,
  });

  const result = await executeProduction({
    repositoryRoot: fixtureRoot,
    adapter,
    invocation: invocation(),
  });

  assert.deepEqual(result.observations.attemptedMutations, [{
    operation: 'write',
    target: 'missing-artifact.md',
    outcome: 'failed',
  }]);
  assert.deepEqual(result.observations.artifacts, [{
    reference: 'response://0',
    mediaType: 'text/markdown',
  }]);
});

test('Claude Code Adapter returns setup failure before session startup', async (t) => {
  const fixtureRoot = createPackageFixture(t);
  const fakeClaude = createFakeClaude(t, { events: successEvents() });
  const adapter = createClaudeCodeAdapter({
    skillsRoot: path.join(fixtureRoot, 'missing-skills'),
    command: fakeClaude.commandPath,
    timeoutMs: TEST_TIMEOUT_MS,
  });

  const result = await executeProduction({
    repositoryRoot: fixtureRoot,
    adapter,
    invocation: invocation(),
  });

  assert.equal(result.status, 'failed');
  assert.deepEqual(result.failure, {
    stage: 'setup',
    code: 'project-setup-failed',
    message: 'Failed to prepare Claude Code project: missing Skill source "writing-foundation"',
  });
  assert.deepEqual(result.observations.responses, []);
  assert.deepEqual(result.observations.toolUses, []);
  assert.deepEqual(result.model, {
    requested: REQUESTED_MODEL,
    resolved: null,
  });
  assert.equal(fs.existsSync(fakeClaude.logPath), false);
});

test('Claude Code Adapter returns startup failure when plugin enumeration cannot launch', async (t) => {
  const fixtureRoot = createPackageFixture(t);
  const adapter = createClaudeCodeAdapter({
    skillsRoot: path.join(fixtureRoot, 'skills'),
    command: path.join(fixtureRoot, 'missing-claude'),
    timeoutMs: TEST_TIMEOUT_MS,
  });

  const result = await executeProduction({
    repositoryRoot: fixtureRoot,
    adapter,
    invocation: invocation(),
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.failure.stage, 'startup');
  assert.equal(result.failure.code, 'claude-plugin-enumeration-failed');
  assert.equal(
    result.failure.message,
    'Claude Code plugin enumeration failed before session startup',
  );
  assert.deepEqual(result.observations.responses, []);
  assert.deepEqual(result.observations.toolUses, []);
  assert.equal(result.model.resolved, null);
});

test('Claude Code Adapter preserves partial evidence after execution starts', async (t) => {
  const fixtureRoot = createPackageFixture(t);
  const events = [
    {
      type: 'system',
      subtype: 'init',
      model: RESOLVED_MODEL,
      skills: ['agent-writing', 'writing-foundation'],
    },
    {
      type: 'result',
      result: 'Agent Writing started, then the evaluated session failed.',
      is_error: true,
      duration_ms: 9,
      total_cost_usd: 0.004,
    },
  ];
  const fakeClaude = createFakeClaude(t, { events, exitCode: 1 });
  const adapter = createClaudeCodeAdapter({
    skillsRoot: path.join(fixtureRoot, 'skills'),
    command: fakeClaude.commandPath,
    timeoutMs: TEST_TIMEOUT_MS,
  });

  const result = await executeProduction({
    repositoryRoot: fixtureRoot,
    adapter,
    invocation: invocation(),
  });

  assert.equal(result.status, 'failed');
  assert.deepEqual(result.failure, {
    stage: 'execution',
    code: 'claude-execution-failed',
    message: 'Claude Code session failed after startup',
  });
  assert.equal(
    result.observations.responses[0].text,
    'Agent Writing started, then the evaluated session failed.',
  );
  assert.deepEqual(result.observations.toolUses, [{
    name: 'SlashCommand',
    outcome: 'submitted /agent-writing',
  }]);
  assert.deepEqual(result.observations.skillEvents, []);
  assert.deepEqual(result.model, {
    requested: REQUESTED_MODEL,
    resolved: RESOLVED_MODEL,
  });
  assert.equal(result.durationMs, 9);
  assert.equal(result.costUsd, 0.004);
});

test('Claude Code Adapter reports incomplete successful streams as normalization failures', async (t) => {
  const fixtureRoot = createPackageFixture(t);
  const fakeClaude = createFakeClaude(t, {
    events: [{
      type: 'system',
      subtype: 'init',
      model: RESOLVED_MODEL,
      skills: ['agent-writing', 'writing-foundation'],
    }],
  });
  const adapter = createClaudeCodeAdapter({
    skillsRoot: path.join(fixtureRoot, 'skills'),
    command: fakeClaude.commandPath,
    timeoutMs: TEST_TIMEOUT_MS,
  });

  const result = await executeProduction({
    repositoryRoot: fixtureRoot,
    adapter,
    invocation: invocation(),
  });

  assert.equal(result.status, 'failed');
  assert.deepEqual(result.failure, {
    stage: 'result-normalization',
    code: 'claude-result-missing',
    message: 'Claude Code completed without a result event',
  });
  assert.deepEqual(result.observations.responses, []);
  assert.deepEqual(result.model, {
    requested: REQUESTED_MODEL,
    resolved: RESOLVED_MODEL,
  });
});

test('Claude production execution remains fail-closed on the exact missing dependency', async (t) => {
  const fixtureRoot = createPackageFixture(t, ['agent-writing']);
  const fakeClaude = createFakeClaude(t, { events: successEvents() });
  const adapter = createClaudeCodeAdapter({
    skillsRoot: path.join(fixtureRoot, 'skills'),
    command: fakeClaude.commandPath,
    timeoutMs: TEST_TIMEOUT_MS,
  });

  const result = await executeProduction({
    repositoryRoot: fixtureRoot,
    adapter,
    invocation: invocation(),
  });

  assert.deepEqual(result.failure, {
    stage: 'dependency-resolution',
    code: 'missing-internal-dependency',
    message: 'Missing internal dependency "writing-foundation"',
    missingSkill: 'writing-foundation',
  });
  assert.equal(fs.existsSync(fakeClaude.logPath), false);
});

function successEventsWithoutSkillTool() {
  return successEvents().filter((event) => !event.message?.content?.some((content) => (
    content.type === 'tool_use' && content.name === 'Skill'
  )));
}

async function executeClaudeFixture(t, observerEvents, events = successEventsWithoutSkillTool()) {
  const fixtureRoot = createPackageFixture(t);
  const fakeClaude = createFakeClaude(t, { events, observerEvents });
  const adapter = createClaudeCodeAdapter({
    skillsRoot: path.join(fixtureRoot, 'skills'),
    command: fakeClaude.commandPath,
    timeoutMs: TEST_TIMEOUT_MS,
  });
  return executeProduction({
    repositoryRoot: fixtureRoot,
    adapter,
    invocation: invocation(),
  });
}

test('Claude Code Adapter retains only bounded lifecycle hook projections', async (t) => {
  const fixtureRoot = createPackageFixture(t);
  const secret = 'sensitive-tool-response-value';
  const observerEvents = [
    hookSkillEvent('PreToolUse', 'agent-writing', 'projected-call', {
      prompt: '/agent-writing',
      tool_response: { secret },
    }),
    '{"malformed":',
    JSON.stringify({
      session_id: 'oversized-session',
      hook_event_name: 'UserPromptExpansion',
      expansion_type: 'slash_command',
      command_name: 'writing-foundation',
      prompt: `/${'x'.repeat(2 * 1024 * 1024)}`,
    }),
    hookSkillEvent('PostToolUse', 'agent-writing', 'projected-call', {
      tool_response: { secret },
    }),
  ];
  const fakeClaude = createFakeClaude(t, {
    events: successEventsWithoutSkillTool(),
    observerEvents,
    captureObserverProjection: true,
  });
  const adapter = createClaudeCodeAdapter({
    skillsRoot: path.join(fixtureRoot, 'skills'),
    command: fakeClaude.commandPath,
    timeoutMs: TEST_TIMEOUT_MS,
  });

  const result = await executeProduction({
    repositoryRoot: fixtureRoot,
    adapter,
    invocation: invocation(),
  });

  assert.deepEqual(
    result.observations.skillEvents.map(({ operation, status, callId }) => (
      [operation, status, callId]
    )),
    [
      ['select', 'started', 'projected-call'],
      ['load', 'started', 'projected-call'],
      ['load', 'succeeded', 'projected-call'],
    ],
  );
  const projection = readCommandLog(fakeClaude.logPath)
    .find(({ kind }) => kind === 'observer-projection').contents;
  assert.doesNotMatch(projection, new RegExp(secret));
  const retained = projection.trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(retained, [
    {
      session_id: 'claude-session-1',
      hook_event_name: 'PreToolUse',
      tool_name: 'Skill',
      tool_input: { skill: 'agent-writing' },
      tool_use_id: 'projected-call',
    },
    {
      session_id: 'claude-session-1',
      hook_event_name: 'PostToolUse',
      tool_name: 'Skill',
      tool_input: { skill: 'agent-writing' },
      tool_use_id: 'projected-call',
    },
  ]);
});

test('Claude Code Adapter distinguishes absent, empty, and malformed catalogs', async (t) => {
  const cases = [
    {
      label: 'present',
      init: {
        skills: ['agent-writing'],
        slash_commands: ['/writing-foundation'],
      },
      expected: ['agent-writing', 'writing-foundation'],
    },
    {
      label: 'empty',
      init: { skills: [], slash_commands: [] },
      expected: [],
    },
    {
      label: 'absent',
      init: {},
      expected: null,
    },
    {
      label: 'malformed',
      init: {
        skills: 'agent-writing',
        slash_commands: [{ name: 'writing-foundation' }],
      },
      expected: null,
    },
  ];

  for (const { label, init, expected } of cases) {
    await t.test(label, async (caseTest) => {
      const events = successEventsWithoutSkillTool();
      events[0] = {
        type: 'system',
        subtype: 'init',
        model: RESOLVED_MODEL,
        ...init,
      };
      const result = await executeClaudeFixture(caseTest, null, events);
      assert.deepEqual(
        result.observations.hostAvailableSkills?.names ?? null,
        expected,
      );
    });
  }
});

test('Claude Code Adapter distinguishes slash selection from model selection', async (t) => {
  const slash = await executeClaudeFixture(t, [{
    session_id: 'slash-session',
    hook_event_name: 'UserPromptExpansion',
    expansion_type: 'slash_command',
    command_name: 'agent-writing',
    command_source: 'skill',
    prompt: '/agent-writing',
  }]);
  assert.deepEqual(
    slash.observations.skillEvents.map(({ name, operation, status, trigger }) => (
      [name, operation, status, trigger]
    )),
    [
      ['agent-writing', 'select', 'succeeded', 'user'],
      ['agent-writing', 'load', 'succeeded', 'user'],
    ],
  );

  const model = await executeClaudeFixture(t, [
    hookSkillEvent('PreToolUse', 'agent-writing', 'model-call'),
    hookSkillEvent('PostToolUse', 'agent-writing', 'model-call'),
  ]);
  assert.deepEqual(
    model.observations.skillEvents.map(({ operation, status, trigger }) => (
      [operation, status, trigger]
    )),
    [
      ['select', 'started', 'model'],
      ['load', 'started', 'model'],
      ['load', 'succeeded', 'model'],
    ],
  );
});

test('Claude Code Adapter preserves exact failure lifecycle without cross-Skill inference', async (t) => {
  const result = await executeClaudeFixture(t, [
    hookSkillEvent('PermissionDenied', 'agent-writing', 'rejected-call'),
    hookSkillEvent('PreToolUse', 'writing-foundation', 'failed-call'),
    hookSkillEvent('PostToolUseFailure', 'writing-foundation', 'failed-call'),
    hookSkillEvent('PreToolUse', 'agent-writing', 'cancelled-call'),
    hookSkillEvent(
      'PostToolUseFailure',
      'agent-writing',
      'cancelled-call',
      { is_interrupt: true },
    ),
    {
      session_id: 'claude-session-1',
      hook_event_name: 'PreToolUse',
      tool_name: 'Skill',
      tool_input: { prompt: 'agent-writing appears only as prose' },
      tool_use_id: 'generic-call',
    },
  ]);

  assert.deepEqual(
    result.observations.skillEvents.map(({ name, operation, status, callId }) => (
      [name, operation, status, callId]
    )),
    [
      ['agent-writing', 'select', 'rejected', 'rejected-call'],
      ['writing-foundation', 'select', 'started', 'failed-call'],
      ['writing-foundation', 'load', 'started', 'failed-call'],
      ['writing-foundation', 'load', 'failed', 'failed-call'],
      ['agent-writing', 'select', 'started', 'cancelled-call'],
      ['agent-writing', 'load', 'started', 'cancelled-call'],
      ['agent-writing', 'load', 'cancelled', 'cancelled-call'],
    ],
  );
});

test('Claude Code Adapter merges complementary hook and stream lifecycle phases', async (t) => {
  const events = successEventsWithoutSkillTool();
  events.splice(
    1,
    0,
    {
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'complement-success',
            name: 'Skill',
            input: { skill: 'agent-writing' },
          },
          {
            type: 'tool_use',
            id: 'complement-failure',
            name: 'Skill',
            input: { skill: 'writing-foundation' },
          },
        ],
      },
    },
    {
      type: 'user',
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'complement-success',
            content: 'Skill loaded',
          },
          {
            type: 'tool_result',
            tool_use_id: 'complement-failure',
            content: 'Skill failed',
            is_error: true,
          },
        ],
      },
    },
  );
  const result = await executeClaudeFixture(t, [
    hookSkillEvent('PreToolUse', 'agent-writing', 'complement-success'),
    hookSkillEvent('PreToolUse', 'writing-foundation', 'complement-failure'),
    hookSkillEvent('PermissionDenied', 'agent-writing', 'rejected-call'),
    hookSkillEvent('PreToolUse', 'agent-writing', 'cancelled-call'),
    hookSkillEvent(
      'PostToolUseFailure',
      'agent-writing',
      'cancelled-call',
      { is_interrupt: true },
    ),
  ], events);

  assert.deepEqual(
    result.observations.skillEvents.map(({
      name,
      operation,
      status,
      callId,
    }) => [name, operation, status, callId]),
    [
      ['agent-writing', 'select', 'started', 'complement-success'],
      ['agent-writing', 'load', 'started', 'complement-success'],
      ['writing-foundation', 'select', 'started', 'complement-failure'],
      ['writing-foundation', 'load', 'started', 'complement-failure'],
      ['agent-writing', 'select', 'rejected', 'rejected-call'],
      ['agent-writing', 'select', 'started', 'cancelled-call'],
      ['agent-writing', 'load', 'started', 'cancelled-call'],
      ['agent-writing', 'load', 'cancelled', 'cancelled-call'],
      ['agent-writing', 'load', 'succeeded', 'complement-success'],
      ['writing-foundation', 'load', 'failed', 'complement-failure'],
    ],
  );
  assert.equal(
    result.observations.skillEvents.at(-1).provenance.mechanism,
    'stream-json-fallback',
  );
});

test('Claude Code Adapter preserves repeated slash expansions without call IDs', async (t) => {
  const slashExpansion = {
    session_id: 'slash-repeat-session',
    hook_event_name: 'UserPromptExpansion',
    expansion_type: 'slash_command',
    command_name: 'agent-writing',
  };
  const result = await executeClaudeFixture(t, [
    slashExpansion,
    slashExpansion,
  ]);

  assert.deepEqual(
    result.observations.skillEvents.map(({ operation, status, callId }) => (
      [operation, status, callId || null]
    )),
    [
      ['select', 'succeeded', null],
      ['load', 'succeeded', null],
      ['select', 'succeeded', null],
      ['load', 'succeeded', null],
    ],
  );
});

test('Claude Code Adapter deduplicates transport delivery but preserves repeated calls', async (t) => {
  const firstStart = hookSkillEvent('PreToolUse', 'agent-writing', 'call-1');
  const firstEnd = hookSkillEvent('PostToolUse', 'agent-writing', 'call-1');
  const result = await executeClaudeFixture(t, [
    firstStart,
    firstStart,
    firstEnd,
    firstEnd,
    hookSkillEvent('PreToolUse', 'agent-writing', 'call-2'),
    hookSkillEvent('PostToolUse', 'agent-writing', 'call-2'),
  ]);

  assert.deepEqual(
    result.observations.skillEvents.map(({ operation, status, callId }) => (
      [operation, status, callId]
    )),
    [
      ['select', 'started', 'call-1'],
      ['load', 'started', 'call-1'],
      ['load', 'succeeded', 'call-1'],
      ['select', 'started', 'call-2'],
      ['load', 'started', 'call-2'],
      ['load', 'succeeded', 'call-2'],
    ],
  );
});

test('live Claude Code executes the host-local Agent Writing tracer', {
  skip: !process.env.CLAUDE_ADAPTER_LIVE_MODEL,
  timeout: 180_000,
}, async (t) => {
  const fixtureRoot = createPackageFixture(t);
  const tracer = JSON.parse(
    fs.readFileSync(path.join(tracerRoot, 'case.json'), 'utf8'),
  );
  const adapter = createClaudeCodeAdapter({
    skillsRoot: path.join(fixtureRoot, 'skills'),
    command: process.env.CLAUDE_ADAPTER_LIVE_COMMAND || 'claude',
    timeoutMs: 120_000,
    maxBudgetUsd: Number(process.env.CLAUDE_ADAPTER_LIVE_BUDGET_USD || 5),
  });

  const result = await executeProduction({
    repositoryRoot: fixtureRoot,
    adapter,
    invocation: invocation(process.env.CLAUDE_ADAPTER_LIVE_MODEL),
  });

  assert.equal(result.status, 'succeeded', JSON.stringify(result, null, 2));
  assert.equal(result.model.requested, process.env.CLAUDE_ADAPTER_LIVE_MODEL);
  assert.ok(result.model.resolved);
  assert.deepEqual(
    result.observations.toolUses
      .map(({ name, outcome }) => [name, outcome]),
    [
      ['SlashCommand', 'submitted /agent-writing'],
      ['Skill', 'invoked writing-foundation'],
    ],
  );
  const output = result.observations.responses[0]?.text || '';
  for (const check of tracer.deterministicChecks) {
    assert.match(output, new RegExp(check.pattern, check.flags), check.name);
  }
});
