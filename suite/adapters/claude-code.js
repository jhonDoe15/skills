'use strict';

const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  SuiteContractError,
  defineProductionAdapter,
} = require('..');

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1_000;
const MAX_OUTPUT_BYTES = 20 * 1024 * 1024;
const MAX_PLUGIN_LIST_BYTES = 1024 * 1024;
const MAX_OBSERVER_LOG_BYTES = 1024 * 1024;
const PLUGIN_LIST_TIMEOUT_MS = 30_000;
const HOOK_OBSERVER_VERSION = 'claude-code-hooks-v1';
const STREAM_OBSERVER_VERSION = 'claude-code-stream-json-v1';
const OBSERVER_LOG_ENV = 'SUITE_CLAUDE_SKILL_OBSERVER_LOG';
const EMPTY_MCP_CONFIG = JSON.stringify({ mcpServers: {} });
const BASE_SESSION_SETTINGS = Object.freeze({
  autoMemoryEnabled: false,
  disableClaudeAiConnectors: true,
});
const PLUGIN_ENUMERATION_TIMEOUT = {
  stage: 'startup',
  code: 'claude-plugin-enumeration-timeout',
  message: 'Claude Code plugin enumeration timed out before session startup',
};
const PLUGIN_ENUMERATION_FAILED = {
  stage: 'startup',
  code: 'claude-plugin-enumeration-failed',
  message: 'Claude Code plugin enumeration failed before session startup',
};
const PLUGIN_ENUMERATION_INVALID = {
  stage: 'setup',
  code: 'claude-plugin-enumeration-invalid',
  message: 'Claude Code plugin enumeration returned invalid output',
};
const MUTATION_OPERATIONS = new Map([
  ['Write', 'write'],
  ['Edit', 'edit'],
  ['MultiEdit', 'edit'],
  ['NotebookEdit', 'edit'],
]);

class ClaudeProjectSetupError extends Error {
  constructor(skillName) {
    super(`missing Skill source "${skillName}"`);
    this.name = 'ClaudeProjectSetupError';
  }
}

class ClaudePluginEnumerationError extends Error {
  constructor({ stage, code, message }) {
    super(message);
    this.name = 'ClaudePluginEnumerationError';
    this.stage = stage;
    this.code = code;
  }
}

function validateOptions({
  skillsRoot,
  command,
  timeoutMs,
  maxBudgetUsd,
}) {
  if (typeof skillsRoot !== 'string' || skillsRoot.length === 0) {
    throw new SuiteContractError('Claude Code Adapter requires skillsRoot');
  }
  if (typeof command !== 'string' || command.length === 0) {
    throw new SuiteContractError('Claude Code Adapter command must be a non-empty string');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new SuiteContractError('Claude Code Adapter timeoutMs must be a positive integer');
  }
  if (maxBudgetUsd !== null
    && (!Number.isFinite(maxBudgetUsd) || maxBudgetUsd <= 0)) {
    throw new SuiteContractError(
      'Claude Code Adapter maxBudgetUsd must be null or a positive number',
    );
  }
}

function createIsolatedProject(skillsRoot, resolvedSkills) {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-code-adapter-'));
  const projectSkillsRoot = path.join(project, '.claude', 'skills');
  fs.mkdirSync(projectSkillsRoot, { recursive: true });

  try {
    for (const skillName of resolvedSkills) {
      const source = path.join(skillsRoot, skillName);
      const definition = path.join(source, 'SKILL.md');
      if (!fs.existsSync(definition)
        || !fs.lstatSync(source).isDirectory()
        || !fs.lstatSync(definition).isFile()) {
        throw new ClaudeProjectSetupError(skillName);
      }
      fs.cpSync(source, path.join(projectSkillsRoot, skillName), {
        recursive: true,
      });
    }
  } catch (error) {
    fs.rmSync(project, { recursive: true, force: true });
    throw error;
  }

  return project;
}

function cleanupProject(project) {
  if (project) fs.rmSync(project, { recursive: true, force: true });
}

function createSanitizedEnvironment(observerLog = null) {
  const environment = { ...process.env };
  delete environment.CLAUDECODE;
  environment.CLAUDE_CODE_DISABLE_AUTO_MEMORY = '1';
  environment.ENABLE_CLAUDEAI_MCP_SERVERS = 'false';
  if (observerLog) environment[OBSERVER_LOG_ENV] = observerLog;
  return environment;
}

function fingerprint(value) {
  return createHash('sha256').update(value).digest('hex');
}

function emptyPreExecutionInventory() {
  return {
    skillDefinitions: [],
    plugins: [],
    ruleSources: [],
    packageDigest: fingerprint(''),
    truncated: false,
  };
}

function preExecutionInventory(project, resolvedSkills) {
  const skillDefinitions = resolvedSkills.map((name) => {
    const relativePath = path.join('.claude', 'skills', name, 'SKILL.md')
      .split(path.sep)
      .join('/');
    return {
      name,
      path: relativePath,
      digest: fingerprint(fs.readFileSync(path.join(project, relativePath))),
    };
  });
  return {
    skillDefinitions,
    plugins: [],
    ruleSources: [],
    packageDigest: fingerprint(JSON.stringify(
      skillDefinitions.map(({ name, digest }) => ({ name, digest })),
    )),
    truncated: false,
  };
}

function createSkillObserver(project) {
  const observerDirectory = path.join(project, '.claude', 'hooks');
  const scriptPath = path.join(observerDirectory, 'skill-observer.js');
  const logPath = path.join(observerDirectory, 'skill-events.jsonl');
  fs.mkdirSync(observerDirectory, { recursive: true });
  fs.writeFileSync(scriptPath, `#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const input = fs.readFileSync(0, 'utf8');
const event = JSON.parse(input);
const target = process.env.${OBSERVER_LOG_ENV};
if (target) {
  const size = fs.existsSync(target) ? fs.statSync(target).size : 0;
  const payload = Buffer.from(JSON.stringify(event) + '\\n');
  if (payload.length <= ${MAX_OBSERVER_LOG_BYTES} - size) {
    fs.appendFileSync(target, payload);
  }
}
`);
  return { logPath, scriptPath };
}

function observerHooks(scriptPath) {
  const hook = {
    type: 'command',
    command: process.execPath,
    args: [scriptPath],
  };
  const skillHook = () => [{
    matcher: 'Skill',
    hooks: [{ ...hook, args: [...hook.args] }],
  }];
  return {
    PermissionDenied: skillHook(),
    PostToolUse: skillHook(),
    PostToolUseFailure: skillHook(),
    PreToolUse: skillHook(),
    UserPromptExpansion: [{
      hooks: [{ ...hook, args: [...hook.args] }],
    }],
  };
}

function readObserverEvents(logPath) {
  if (!fs.existsSync(logPath)) return [];
  const stats = fs.statSync(logPath);
  if (!stats.isFile() || stats.size > MAX_OBSERVER_LOG_BYTES) return [];
  return fs.readFileSync(logPath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}

function isValidPlugin(plugin) {
  return plugin !== null
    && typeof plugin === 'object'
    && !Array.isArray(plugin)
    && typeof plugin.id === 'string'
    && plugin.id.length > 0;
}

function parsePluginIds(output) {
  let plugins;
  try {
    plugins = JSON.parse(output);
  } catch {
    throw new ClaudePluginEnumerationError(PLUGIN_ENUMERATION_INVALID);
  }

  if (!Array.isArray(plugins) || !plugins.every(isValidPlugin)) {
    throw new ClaudePluginEnumerationError(PLUGIN_ENUMERATION_INVALID);
  }

  return plugins.map(({ id }) => id);
}

function enumeratePluginIds(command, project, environment, timeoutMs) {
  const result = spawnSync(command, ['plugin', 'list', '--json'], {
    cwd: project,
    env: environment,
    encoding: 'utf8',
    timeout: Math.min(timeoutMs, PLUGIN_LIST_TIMEOUT_MS),
    killSignal: 'SIGKILL',
    maxBuffer: MAX_PLUGIN_LIST_BYTES,
    shell: false,
  });

  if (result.error?.code === 'ETIMEDOUT') {
    throw new ClaudePluginEnumerationError(PLUGIN_ENUMERATION_TIMEOUT);
  }
  if (result.error || result.status !== 0) {
    throw new ClaudePluginEnumerationError(PLUGIN_ENUMERATION_FAILED);
  }

  return parsePluginIds(result.stdout);
}

function readSkillInvocation(input) {
  const skill = input && typeof input === 'object' ? input.skill : null;
  return typeof skill === 'string' && /^[a-z0-9-]+$/.test(skill)
    ? skill
    : null;
}

function mutationFromTool(content, project) {
  const operation = MUTATION_OPERATIONS.get(content.name);
  if (!operation) return null;

  const input = content.input || {};
  const target = input.file_path || input.path || input.notebook_path;
  if (typeof target !== 'string' || target.length === 0) return null;
  const relativeTarget = path.relative(project, path.resolve(project, target));
  return {
    operation,
    target: relativeTarget.startsWith('..') ? target : relativeTarget,
    outcome: 'attempted',
  };
}

function eventProvenance({
  mechanism,
  eventType,
  observerVersion,
  runId,
  statusSource = 'observed',
}) {
  return {
    host: 'claude-code',
    mechanism,
    eventType,
    observerVersion,
    ...(runId ? { runId } : {}),
    statusSource,
  };
}

function lifecycleEvent({
  name,
  operation,
  status,
  trigger,
  callId,
  provenance,
}) {
  return {
    name,
    operation,
    status,
    ...(trigger ? { trigger } : {}),
    ...(callId ? { callId } : {}),
    provenance,
  };
}

function lifecycleEventIdentity(event) {
  return [
    event.provenance.host,
    event.provenance.runId || '',
    event.callId || '',
    event.provenance.eventType,
    event.name,
    event.operation,
    event.status,
  ].join('\0');
}

function deduplicateLifecycleEvents(events) {
  const seen = new Set();
  return events.filter((event) => {
    const identity = lifecycleEventIdentity(event);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function exactTelemetrySkill(event) {
  const attributes = event.attributes && typeof event.attributes === 'object'
    ? event.attributes
    : event;
  if (attributes.tool_name !== 'Skill') return null;
  if (typeof attributes.skill_name === 'string') {
    return /^[a-z0-9-]+$/.test(attributes.skill_name)
      ? attributes.skill_name
      : null;
  }
  if (typeof attributes.tool_parameters !== 'string') return null;
  try {
    const parameters = JSON.parse(attributes.tool_parameters);
    return typeof parameters.skill_name === 'string'
      && /^[a-z0-9-]+$/.test(parameters.skill_name)
      ? parameters.skill_name
      : null;
  } catch {
    return null;
  }
}

function observerSkillEvents(events, requestId) {
  const normalized = [];
  for (const event of events) {
    const hookEvent = event.hook_event_name;
    const runId = event.session_id || requestId;
    if (hookEvent === 'UserPromptExpansion') {
      const name = event.command_name;
      if (event.expansion_type !== 'slash_command'
        || typeof name !== 'string'
        || !/^[a-z0-9-]+$/.test(name)) {
        continue;
      }
      const provenance = eventProvenance({
        mechanism: 'user-prompt-expansion',
        eventType: hookEvent,
        observerVersion: HOOK_OBSERVER_VERSION,
        runId,
      });
      normalized.push(
        lifecycleEvent({
          name,
          operation: 'select',
          status: 'succeeded',
          trigger: 'user',
          provenance,
        }),
        lifecycleEvent({
          name,
          operation: 'load',
          status: 'succeeded',
          trigger: 'user',
          provenance,
        }),
      );
      continue;
    }

    if (['PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionDenied']
      .includes(hookEvent)) {
      if (event.tool_name !== 'Skill') continue;
      const name = readSkillInvocation(event.tool_input);
      if (!name) continue;
      const callId = typeof event.tool_use_id === 'string'
        ? event.tool_use_id
        : null;
      const provenance = eventProvenance({
        mechanism: 'skill-tool-hook',
        eventType: hookEvent,
        observerVersion: HOOK_OBSERVER_VERSION,
        runId,
      });
      if (hookEvent === 'PermissionDenied') {
        normalized.push(lifecycleEvent({
          name,
          operation: 'select',
          status: 'rejected',
          trigger: 'model',
          callId,
          provenance,
        }));
      } else if (hookEvent === 'PreToolUse') {
        normalized.push(
          lifecycleEvent({
            name,
            operation: 'select',
            status: 'started',
            trigger: 'model',
            callId,
            provenance,
          }),
          lifecycleEvent({
            name,
            operation: 'load',
            status: 'started',
            trigger: 'model',
            callId,
            provenance,
          }),
        );
      } else {
        normalized.push(lifecycleEvent({
          name,
          operation: 'load',
          status: hookEvent === 'PostToolUse'
            ? 'succeeded'
            : event.is_interrupt
              ? 'cancelled'
              : 'failed',
          trigger: 'model',
          callId,
          provenance,
        }));
      }
      continue;
    }

    const eventName = event.event_name || event.name || event.type;
    if (!['claude_code.tool_decision', 'claude_code.tool_result']
      .includes(eventName)) {
      continue;
    }
    const attributes = event.attributes && typeof event.attributes === 'object'
      ? event.attributes
      : event;
    const name = exactTelemetrySkill(event);
    if (!name) continue;
    const callId = typeof attributes.tool_use_id === 'string'
      ? attributes.tool_use_id
      : null;
    const provenance = eventProvenance({
      mechanism: 'otel-tool-lifecycle',
      eventType: eventName,
      observerVersion: HOOK_OBSERVER_VERSION,
      runId: attributes.session_id || runId,
    });
    if (eventName === 'claude_code.tool_decision') {
      normalized.push(lifecycleEvent({
        name,
        operation: 'select',
        status: attributes.decision === 'reject' ? 'rejected' : 'started',
        trigger: 'model',
        callId,
        provenance,
      }));
      if (attributes.decision !== 'reject') {
        normalized.push(lifecycleEvent({
          name,
          operation: 'load',
          status: 'started',
          trigger: 'model',
          callId,
          provenance,
        }));
      }
    } else {
      normalized.push(lifecycleEvent({
        name,
        operation: 'load',
        status: String(attributes.success) === 'true' ? 'succeeded' : 'failed',
        trigger: 'model',
        callId,
        provenance,
      }));
    }
  }
  return deduplicateLifecycleEvents(normalized);
}

function parseClaudeStream(stdout, requestedSkill, project, requestId) {
  const evidence = {
    initialized: false,
    resultEventSeen: false,
    resultIsError: false,
    resultText: '',
    resolvedModel: null,
    costUsd: null,
    durationMs: null,
    availableSkills: new Set(),
    skillEvents: [],
    toolUses: [],
    attemptedMutations: [],
    artifacts: [],
  };
  const toolIndexes = new Map();

  for (const rawLine of stdout.split(/\r?\n/)) {
    if (!rawLine.trim()) continue;

    let event;
    try {
      event = JSON.parse(rawLine);
    } catch {
      continue;
    }

    if (event.type === 'system' && event.subtype === 'init') {
      evidence.initialized = true;
      if (typeof event.model === 'string' && event.model.length > 0) {
        evidence.resolvedModel = event.model;
      }
      evidence.toolUses.push({
        name: 'SlashCommand',
        outcome: `submitted /${requestedSkill}`,
      });
      for (const skillName of [
        ...(Array.isArray(event.skills) ? event.skills : []),
        ...(Array.isArray(event.slash_commands) ? event.slash_commands : []),
      ]) {
        evidence.availableSkills.add(String(skillName).replace(/^\//, ''));
      }
    }

    if (event.type === 'assistant') {
      for (const content of event.message?.content || []) {
        if (content.type === 'text' && typeof content.text === 'string') {
          evidence.resultText = content.text;
        }
        if (content.type !== 'tool_use' || typeof content.name !== 'string') {
          continue;
        }

        const skillName = content.name === 'Skill'
          ? readSkillInvocation(content.input)
          : null;

        const toolUse = {
          name: content.name,
          outcome: skillName ? `invoked ${skillName}` : 'attempted',
        };
        const toolIndex = evidence.toolUses.push(toolUse) - 1;

        const mutation = mutationFromTool(content, project);
        const mutationIndex = mutation
          ? evidence.attemptedMutations.push(mutation) - 1
          : null;
        const artifact = mutation && {
          reference: `project://${mutation.target}`,
          mediaType: path.extname(mutation.target).toLowerCase() === '.md'
            ? 'text/markdown'
            : 'application/octet-stream',
        };
        if (skillName) {
          const callId = typeof content.id === 'string' ? content.id : null;
          const provenance = eventProvenance({
            mechanism: 'stream-json-fallback',
            eventType: 'assistant.tool_use',
            observerVersion: STREAM_OBSERVER_VERSION,
            runId: requestId,
          });
          evidence.skillEvents.push(
            lifecycleEvent({
              name: skillName,
              operation: 'select',
              status: 'started',
              trigger: 'model',
              callId,
              provenance,
            }),
            lifecycleEvent({
              name: skillName,
              operation: 'load',
              status: 'started',
              trigger: 'model',
              callId,
              provenance,
            }),
          );
        }
        if (typeof content.id === 'string') {
          toolIndexes.set(content.id, {
            artifact,
            mutationIndex,
            skillName,
            toolIndex,
          });
        }
      }
    }

    if (event.type === 'user') {
      for (const content of event.message?.content || []) {
        if (content.type !== 'tool_result'
          || typeof content.tool_use_id !== 'string') {
          continue;
        }
        const indexes = toolIndexes.get(content.tool_use_id);
        if (!indexes) continue;
        const outcome = content.is_error ? 'failed' : 'succeeded';
        if (indexes.skillName) {
          evidence.skillEvents.push(lifecycleEvent({
            name: indexes.skillName,
            operation: 'load',
            status: outcome,
            trigger: 'model',
            callId: content.tool_use_id,
            provenance: eventProvenance({
              mechanism: 'stream-json-fallback',
              eventType: 'user.tool_result',
              observerVersion: STREAM_OBSERVER_VERSION,
              runId: requestId,
            }),
          }));
          evidence.toolUses[indexes.toolIndex].outcome = outcome;
          continue;
        }
        evidence.toolUses[indexes.toolIndex].outcome = outcome;
        if (indexes.mutationIndex !== null) {
          evidence.attemptedMutations[indexes.mutationIndex].outcome = outcome;
        }
        if (outcome === 'succeeded' && indexes.artifact) {
          evidence.artifacts.push(indexes.artifact);
        }
      }
    }

    if (event.type === 'result') {
      evidence.resultEventSeen = true;
      evidence.resultIsError = Boolean(event.is_error);
      if (typeof event.result === 'string') evidence.resultText = event.result;
      if (typeof event.model === 'string' && event.model.length > 0) {
        evidence.resolvedModel = event.model;
      }
      if (Number.isFinite(event.total_cost_usd) && event.total_cost_usd >= 0) {
        evidence.costUsd = event.total_cost_usd;
      }
      if (Number.isFinite(event.duration_ms) && event.duration_ms >= 0) {
        evidence.durationMs = event.duration_ms;
      }
    }
  }

  return evidence;
}

function mergeSkillEvents(streamEvents, observedEvents) {
  const observedCallIds = new Set(
    observedEvents.map(({ callId }) => callId).filter(Boolean),
  );
  return deduplicateLifecycleEvents([
    ...observedEvents,
    ...streamEvents.filter(({ callId }) => (
      !callId || !observedCallIds.has(callId)
    )),
  ]);
}

function finalizeOpenSkillLoads(events, cancelled) {
  const terminal = new Set(
    events
      .filter(({ operation, status, callId }) => (
        operation === 'load'
          && callId
          && !['started', 'unknown'].includes(status)
      ))
      .map(({ name, callId }) => `${name}\0${callId}`),
  );
  const inferred = [];
  for (const event of events) {
    if (event.operation !== 'load' || event.status !== 'started' || !event.callId) {
      continue;
    }
    const key = `${event.name}\0${event.callId}`;
    if (terminal.has(key)) continue;
    terminal.add(key);
    inferred.push(lifecycleEvent({
      name: event.name,
      operation: 'load',
      status: cancelled ? 'cancelled' : 'unknown',
      trigger: event.trigger,
      callId: event.callId,
      provenance: eventProvenance({
        mechanism: 'run-finalization',
        eventType: cancelled ? 'run.cancelled' : 'run.ended',
        observerVersion: event.provenance.observerVersion,
        runId: event.provenance.runId,
        statusSource: 'inferred',
      }),
    }));
  }
  return deduplicateLifecycleEvents([...events, ...inferred]);
}

function observations(context, invocation, evidence = {}) {
  const responses = evidence.resultText
    ? [{ text: evidence.resultText }]
    : [];
  return {
    packageSkills: context.packageSkills,
    hostAvailableSkills: evidence.initialized
      ? {
        names: [...(evidence.availableSkills || [])],
        provenance: eventProvenance({
          mechanism: 'stream-json-init',
          eventType: 'system.init',
          observerVersion: STREAM_OBSERVER_VERSION,
          runId: invocation.requestId,
        }),
      }
      : null,
    preExecutionInventory:
      evidence.preExecutionInventory || emptyPreExecutionInventory(),
    skillEvents: evidence.skillEvents || [],
    routing: {
      requestedSkill: invocation.skill,
      resolvedSkills: context.resolvedSkills,
    },
    responses,
    artifacts: [
      ...(responses.length > 0
        ? [{ reference: 'response://0', mediaType: 'text/markdown' }]
        : []),
      ...(evidence.artifacts || []),
    ],
    toolUses: evidence.toolUses || [],
    attemptedMutations: evidence.attemptedMutations || [],
  };
}

function failedResult({
  invocation,
  context,
  stage,
  code,
  message,
  elapsedMs,
  evidence,
}) {
  return {
    status: 'failed',
    observations: observations(context, invocation, evidence),
    failure: { stage, code, message },
    durationMs: evidence?.durationMs ?? elapsedMs,
    costUsd: evidence?.costUsd ?? null,
    model: {
      requested: invocation.model,
      resolved: evidence?.resolvedModel ?? null,
    },
  };
}

function claudeArguments(
  invocation,
  maxBudgetUsd,
  pluginIds,
  observerScript,
) {
  const sessionSettings = JSON.stringify({
    ...BASE_SESSION_SETTINGS,
    enabledPlugins: Object.fromEntries(pluginIds.map((id) => [id, false])),
    hooks: observerHooks(observerScript),
  });
  const arguments_ = [
    '-p',
    '--setting-sources',
    'project',
    '--settings',
    sessionSettings,
    '--strict-mcp-config',
    '--mcp-config',
    EMPTY_MCP_CONFIG,
    '--no-chrome',
    '--no-session-persistence',
    '--tools',
    'Skill',
    '--permission-mode',
    'dontAsk',
    '--model',
    invocation.model,
    '--output-format',
    'stream-json',
    '--verbose',
  ];
  if (maxBudgetUsd !== null) {
    arguments_.push('--max-budget-usd', String(maxBudgetUsd));
  }
  return arguments_;
}

function successfulResult(invocation, context, evidence, elapsedMs) {
  return {
    status: 'succeeded',
    observations: observations(context, invocation, evidence),
    failure: null,
    durationMs: evidence.durationMs ?? elapsedMs,
    costUsd: evidence.costUsd,
    model: {
      requested: invocation.model,
      resolved: evidence.resolvedModel,
    },
  };
}

function createClaudeCodeAdapter({
  skillsRoot,
  command = 'claude',
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxBudgetUsd = null,
}) {
  validateOptions({
    skillsRoot,
    command,
    timeoutMs,
    maxBudgetUsd,
  });

  return defineProductionAdapter({
    name: 'claude-code',
    execute(invocation, context) {
      const startedAt = Date.now();
      let project = null;

      try {
        try {
          project = createIsolatedProject(skillsRoot, context.resolvedSkills);
        } catch (error) {
          const detail = error instanceof ClaudeProjectSetupError
            ? error.message
            : 'isolated project creation failed';
          return failedResult({
            invocation,
            context,
            stage: 'setup',
            code: 'project-setup-failed',
            message: `Failed to prepare Claude Code project: ${detail}`,
            elapsedMs: Date.now() - startedAt,
          });
        }

        const observer = createSkillObserver(project);
        const inventory = preExecutionInventory(project, context.resolvedSkills);
        const environment = createSanitizedEnvironment(observer.logPath);
        let pluginIds;
        try {
          pluginIds = enumeratePluginIds(
            command,
            project,
            environment,
            timeoutMs,
          );
        } catch (error) {
          const enumerationError = error instanceof ClaudePluginEnumerationError
            ? error
            : new ClaudePluginEnumerationError(PLUGIN_ENUMERATION_FAILED);
          return failedResult({
            invocation,
            context,
            stage: enumerationError.stage,
            code: enumerationError.code,
            message: enumerationError.message,
            elapsedMs: Date.now() - startedAt,
            evidence: { preExecutionInventory: inventory },
          });
        }
        const processResult = spawnSync(
          command,
          claudeArguments(
            invocation,
            maxBudgetUsd,
            pluginIds,
            observer.scriptPath,
          ),
          {
            cwd: project,
            env: environment,
            encoding: 'utf8',
            input: `/${invocation.skill}\n\n${invocation.prompt}`,
            timeout: timeoutMs,
            killSignal: 'SIGKILL',
            maxBuffer: MAX_OUTPUT_BYTES,
          },
        );
        const elapsedMs = Date.now() - startedAt;
        const evidence = parseClaudeStream(
          processResult.stdout || '',
          invocation.skill,
          project,
          invocation.requestId,
        );
        evidence.preExecutionInventory = inventory;
        evidence.skillEvents = mergeSkillEvents(
          evidence.skillEvents,
          observerSkillEvents(
            readObserverEvents(observer.logPath),
            invocation.requestId,
          ),
        );
        evidence.skillEvents = finalizeOpenSkillLoads(
          evidence.skillEvents,
          processResult.error?.code === 'ETIMEDOUT',
        );
        function fail(stage, code, message) {
          return failedResult({
            invocation,
            context,
            stage,
            code,
            message,
            elapsedMs,
            evidence,
          });
        }

        if (processResult.error && !evidence.initialized) {
          return fail(
            'startup',
            'claude-not-started',
            `Claude Code failed to start: ${processResult.error.code || 'process error'}`,
          );
        }

        if (!evidence.initialized && processResult.status !== 0) {
          return fail(
            'startup',
            'claude-not-started',
            'Claude Code exited before session initialization',
          );
        }

        if (processResult.error
          || processResult.status !== 0
          || evidence.resultIsError) {
          const timedOut = processResult.error?.code === 'ETIMEDOUT';
          return fail(
            'execution',
            timedOut
              ? 'claude-execution-timeout'
              : 'claude-execution-failed',
            timedOut
              ? 'Claude Code session timed out after startup'
              : 'Claude Code session failed after startup',
          );
        }

        if (!evidence.resultEventSeen) {
          return fail(
            'result-normalization',
            'claude-result-missing',
            'Claude Code completed without a result event',
          );
        }

        if (!evidence.resolvedModel) {
          return fail(
            'result-normalization',
            'claude-model-missing',
            'Claude Code result did not identify the resolved model',
          );
        }

        const unavailableSkill = context.resolvedSkills.find((skillName) => (
          !evidence.availableSkills.has(skillName)
        ));
        if (unavailableSkill) {
          return fail(
            'execution',
            'claude-skill-unavailable',
            `Claude Code did not discover Skill "${unavailableSkill}"`,
          );
        }

        return successfulResult(invocation, context, evidence, elapsedMs);
      } catch {
        return failedResult({
          invocation,
          context,
          stage: 'result-normalization',
          code: 'claude-result-invalid',
          message: 'Claude Code output could not be normalized',
          elapsedMs: Date.now() - startedAt,
        });
      } finally {
        cleanupProject(project);
      }
    },
  });
}

module.exports = {
  createClaudeCodeAdapter,
};
