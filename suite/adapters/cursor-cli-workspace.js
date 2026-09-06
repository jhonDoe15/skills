'use strict';

const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');

const {
  normalizeModelSelection,
} = require('../model-selection');

const TERMINATION_GRACE_MS = 1000;
const DEFAULT_TIMEOUT_MS = 60 * 60 * 1000;

class CursorCliWorkspaceAdapterError extends Error {
  constructor(message, stage = 'execution') {
    super(message);
    this.name = 'CursorCliWorkspaceAdapterError';
    this.stage = stage;
  }
}

function git(workspace, args) {
  const result = spawnSync('git', args, { cwd: workspace, encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    throw new CursorCliWorkspaceAdapterError(
      `cannot inspect local Git workspace: ${String(result.stderr).trim()}`,
      'setup',
    );
  }
  return result.stdout.trim();
}

function snapshot(workspace) {
  return {
    branch: git(workspace, ['branch', '--show-current']),
    headRevision: git(workspace, ['rev-parse', 'HEAD']),
    status: git(workspace, [
      'status',
      '--porcelain=v1',
      '--untracked-files=all',
    ]),
  };
}

function parameterMap(selection) {
  return new Map(selection.params.map(({ id, value }) => [id, value]));
}

function cliModel(selection) {
  const normalized = normalizeModelSelection(selection, 'model');
  const parameters = parameterMap(normalized);
  const reasoning = parameters.get('reasoning');
  const context = parameters.get('context');
  const fast = parameters.get('fast');
  if (/^gpt-5\.6-(?:luna|terra)$/.test(normalized.id)
    && normalized.params.length === 3
    && context === '272k'
    && ['none', 'low', 'medium', 'high', 'xhigh', 'max'].includes(reasoning)
    && ['false', 'true'].includes(fast)) {
    return `${normalized.id}-${reasoning}${fast === 'true' ? '-fast' : ''}`;
  }
  const overrides = normalized.params.map(({ id, value }) => (
    `${id === 'reasoning' ? 'effort' : id}=${value}`
  )).join(',');
  return `${normalized.id}[${overrides}]`;
}

function runCursorCli({
  command,
  args,
  cwd,
  env,
  timeoutMs,
}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env });
    let stdout = '';
    let stderr = '';
    let processError = null;
    let timedOut = false;
    let forceKillTimer = null;
    const timeoutTimer = timeoutMs === null ? null : setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      forceKillTimer = setTimeout(() => {
        child.kill('SIGKILL');
      }, TERMINATION_GRACE_MS);
    }, timeoutMs);

    function clearTimers() {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (forceKillTimer) clearTimeout(forceKillTimer);
    }

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', (error) => {
      processError = error;
    });
    child.once('close', (status, signal) => {
      clearTimers();
      if (timedOut) {
        reject(new CursorCliWorkspaceAdapterError(
          'Cursor CLI execution timed out',
        ));
        return;
      }
      if (processError) {
        reject(processError);
        return;
      }
      resolve({ status, signal, stdout, stderr });
    });
  });
}

function parseEvents(stdout) {
  return stdout.split(/\r?\n/).filter(Boolean).map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      throw new CursorCliWorkspaceAdapterError(
        'Cursor CLI emitted invalid stream JSON',
        'result-normalization',
      );
    }
  });
}

function toolCall(event) {
  if (event?.type !== 'tool_call') return null;
  const entry = Object.entries(event.tool_call || {}).find(
    ([name]) => name.endsWith('ToolCall'),
  );
  if (!entry) return null;
  const [name, value] = entry;
  return {
    name: name.slice(0, -'ToolCall'.length),
    status: event.subtype || 'unknown',
    args: value?.args || {},
  };
}

function strings(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (!value || typeof value !== 'object') return [];
  return Object.values(value).flatMap(strings);
}

function skillName(call) {
  const direct = call.args.skillName || call.args.skill_name;
  if (typeof direct === 'string' && /^[a-z0-9-]+$/.test(direct)) {
    return direct;
  }
  for (const candidate of strings(call.args)) {
    const match = /(?:^|[/\\])\.cursor[/\\]skills[/\\]([a-z0-9-]+)[/\\]SKILL\.md$/
      .exec(candidate);
    if (match) return match[1];
  }
  return null;
}

function evidenceFrom(events) {
  const calls = events.map(toolCall).filter(Boolean);
  const completed = calls.filter(({ status }) => status === 'completed');
  const loadedSkills = completed.map(skillName).filter(Boolean);
  return {
    toolCalls: calls.map(({ name, status }) => ({ name, status })),
    skillLoads: [...new Set(loadedSkills)],
    reviewLoads: loadedSkills.filter((name) => name === 'code-review').length,
    subagentCalls: completed.filter(({ name }) => name === 'task').length,
  };
}

function hasReviewReport(output) {
  return typeof output === 'string'
    && /^## Standards\s*$/m.test(output)
    && /^## Spec\s*$/m.test(output);
}

function maxConcurrentSubagents(toolCalls) {
  let active = 0;
  let maximum = 0;
  for (const call of toolCalls || []) {
    if (call.name !== 'task') continue;
    if (call.status === 'started') {
      active += 1;
      maximum = Math.max(maximum, active);
    } else if (call.status === 'completed') {
      active = Math.max(0, active - 1);
    }
  }
  return maximum;
}

function recognizedReviewLoads({
  reviewLoads,
  subagentCalls,
  toolCalls,
  output,
}) {
  const reportsReview = hasReviewReport(output)
    || (typeof output === 'string' && /\bcode review\b/i.test(output));
  if (reviewLoads === 0
    && subagentCalls >= 2
    && maxConcurrentSubagents(toolCalls) >= 2
    && reportsReview) {
    return 1;
  }
  return reviewLoads;
}

function failureResult(error, startedAt, evidence = {}) {
  return {
    status: 'failed',
    failure: {
      stage: error.stage || 'execution',
      message: String(error.message || 'Cursor CLI execution failed').slice(0, 256),
    },
    durationMs: Date.now() - startedAt,
    costUsd: null,
    agentId: evidence.agentId || null,
    runId: evidence.runId || null,
    requestId: evidence.requestId || null,
    output: evidence.output || null,
    model: evidence.model || null,
    git: null,
    skillLoads: evidence.skillLoads || [],
    reviewLoads: evidence.reviewLoads || 0,
    subagentCalls: evidence.subagentCalls || 0,
    toolCalls: evidence.toolCalls || [],
  };
}

function createCursorCliWorkspaceAdapter({
  apiKey = process.env.CURSOR_API_KEY,
  command = 'agent',
  timeoutMs = DEFAULT_TIMEOUT_MS,
  execute = runCursorCli,
} = {}) {
  if (typeof apiKey !== 'string' || apiKey.length === 0) {
    throw new TypeError('Cursor CLI workspace adapter requires apiKey');
  }
  return Object.freeze({
    async execute(request) {
      const startedAt = Date.now();
      let evidence = {};
      try {
        const workspace = fs.realpathSync(request.workspace);
        const before = snapshot(workspace);
        const model = normalizeModelSelection(request.model, 'model');
        const args = [
          '--print',
          '--output-format', 'stream-json',
          '--model', cliModel(model),
          '--workspace', workspace,
          '--trust',
          '--sandbox', 'disabled',
          '--force',
        ];
        if (['plan', 'ask'].includes(request.mode)) {
          args.push('--mode', request.mode);
        }
        args.push(request.prompt);
        const result = await execute({
          command,
          args,
          cwd: workspace,
          env: { ...process.env, CURSOR_API_KEY: apiKey },
          timeoutMs,
        });
        const events = parseEvents(result.stdout);
        const terminal = events.findLast(({ type }) => type === 'result');
        const initialized = events.find(({ type, subtype }) => (
          type === 'system' && subtype === 'init'
        ));
        evidence = {
          ...evidenceFrom(events),
          agentId: initialized?.session_id || null,
          runId: terminal?.request_id || null,
          requestId: terminal?.request_id || null,
          output: terminal?.result || null,
          model,
        };
        evidence.reviewLoads = recognizedReviewLoads(evidence);
        if (result.status !== 0 || terminal?.is_error || terminal?.subtype !== 'success') {
          throw new CursorCliWorkspaceAdapterError(
            String(result.stderr || terminal?.result || 'Cursor CLI run failed')
              .trim()
              .slice(0, 256),
          );
        }
        const after = snapshot(workspace);
        if (request.requireCommit !== false
          && after.headRevision === before.headRevision) {
          throw new CursorCliWorkspaceAdapterError(
            'Cursor implementation did not create a commit',
            'result-normalization',
          );
        }
        return {
          status: 'succeeded',
          failure: null,
          durationMs: terminal.duration_ms || Date.now() - startedAt,
          costUsd: null,
          agentId: evidence.agentId,
          runId: evidence.runId,
          requestId: evidence.requestId,
          output: evidence.output,
          model,
          git: {
            branch: after.branch,
            baseRevision: before.headRevision,
            headRevision: after.headRevision,
            status: after.status,
          },
          skillLoads: evidence.skillLoads,
          reviewLoads: evidence.reviewLoads,
          subagentCalls: evidence.subagentCalls,
          toolCalls: evidence.toolCalls,
        };
      } catch (error) {
        return failureResult(error, startedAt, evidence);
      }
    },
  });
}

module.exports = {
  CursorCliWorkspaceAdapterError,
  cliModel,
  createCursorCliWorkspaceAdapter,
  evidenceFrom,
  hasReviewReport,
  maxConcurrentSubagents,
  parseEvents,
  recognizedReviewLoads,
  runCursorCli,
};
