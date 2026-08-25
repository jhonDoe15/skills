'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  SuiteContractError,
  defineProductionAdapter,
} = require('..');

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1_000;
const MAX_OUTPUT_BYTES = 20 * 1024 * 1024;
const EMPTY_MCP_CONFIG = JSON.stringify({ mcpServers: {} });
const ISOLATED_SESSION_SETTINGS = JSON.stringify({
  autoMemoryEnabled: false,
  disableAllHooks: true,
  disableClaudeAiConnectors: true,
});
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

function readSkillInvocation(input, resolvedSkills) {
  const serialized = JSON.stringify(input || {});
  return resolvedSkills.find((skillName) => (
    serialized.includes(`"${skillName}"`)
  )) || null;
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

function parseClaudeStream(stdout, requestedSkill, resolvedSkills, project) {
  const evidence = {
    initialized: false,
    resultEventSeen: false,
    resultIsError: false,
    resultText: '',
    resolvedModel: null,
    costUsd: null,
    durationMs: null,
    availableSkills: new Set(),
    observedSkillInvocations: new Set(),
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
        ...(event.skills || []),
        ...(event.slash_commands || []),
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
          ? readSkillInvocation(content.input, resolvedSkills)
          : null;
        if (skillName) evidence.observedSkillInvocations.add(skillName);

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
        if (typeof content.id === 'string') {
          toolIndexes.set(content.id, { artifact, toolIndex, mutationIndex });
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
        if (!indexes || evidence.toolUses[indexes.toolIndex].name === 'Skill') {
          continue;
        }
        const outcome = content.is_error
          ? 'failed'
          : 'succeeded';
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

function observations(context, invocation, evidence = {}) {
  const responses = evidence.resultText
    ? [{ text: evidence.resultText }]
    : [];
  return {
    discoveredSkills: context.discoveredSkills,
    routing: {
      requestedSkill: invocation.skill,
      invokedSkills: context.resolvedSkills,
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

function claudeArguments(invocation, maxBudgetUsd) {
  const arguments_ = [
    '-p',
    '--setting-sources',
    'project',
    '--settings',
    ISOLATED_SESSION_SETTINGS,
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

        const environment = { ...process.env };
        delete environment.CLAUDECODE;
        environment.CLAUDE_CODE_DISABLE_AUTO_MEMORY = '1';
        environment.ENABLE_CLAUDEAI_MCP_SERVERS = 'false';
        const processResult = spawnSync(
          command,
          claudeArguments(invocation, maxBudgetUsd),
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
          context.resolvedSkills,
          project,
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

        const unobservedSkill = context.resolvedSkills.find((skillName) => (
          skillName !== invocation.skill
          && !evidence.observedSkillInvocations.has(skillName)
        ));
        if (unobservedSkill) {
          return fail(
            'execution',
            'claude-invocation-unobserved',
            `Claude Code did not record invocation of Skill "${unobservedSkill}"`,
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
