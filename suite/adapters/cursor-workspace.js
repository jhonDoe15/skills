'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  modelSelectionsEqual,
  normalizeModelSelection,
} = require('../model-selection');

class CursorWorkspaceAdapterError extends Error {
  constructor(message, stage = 'execution') {
    super(message);
    this.name = 'CursorWorkspaceAdapterError';
    this.stage = stage;
  }
}

function loadCursorSdk() {
  return require('@cursor/sdk');
}

function git(workspace, args) {
  const result = spawnSync('git', args, { cwd: workspace, encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    throw new CursorWorkspaceAdapterError(
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

function catalogParametersMatch(selection, definitions) {
  if (!Array.isArray(definitions)
    || definitions.length !== selection.params.length) {
    return false;
  }
  return definitions.every((definition) => (
    selection.params.some(({ id, value }) => (
      definition.id === id
      && definition.values?.some((candidate) => candidate.value === value)
    ))
  ));
}

function validateCatalogSelection(selection, catalog) {
  const entry = Array.isArray(catalog)
    ? catalog.find(({ id }) => id === selection.id)
    : null;
  if (!entry) {
    throw new CursorWorkspaceAdapterError(
      `Cursor model "${selection.id}" is unavailable`,
      'setup',
    );
  }
  if (!catalogParametersMatch(selection, entry.parameters || [])) {
    throw new CursorWorkspaceAdapterError(
      `Cursor model "${selection.id}" parameters are unavailable`,
      'setup',
    );
  }
}

function withTimeout(operation, timeoutMs, label) {
  if (timeoutMs === null) return operation();
  let timer;
  return Promise.race([
    Promise.resolve().then(operation),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(
        new CursorWorkspaceAdapterError(`${label} timed out`),
      ), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

function skillNameFromEvent(event) {
  if (event?.type !== 'tool_call'
    || event.status !== 'completed'
    || !/read/i.test(event.name || '')) {
    return null;
  }
  const target = event.args?.path
    || event.args?.filePath
    || event.args?.file_path;
  if (typeof target !== 'string' || target.split(/[\\/]/).includes('..')) {
    return null;
  }
  return /^(?:\.cursor|\.agents)\/skills\/([a-z0-9-]+)\/SKILL\.md$/
    .exec(target)?.[1] || null;
}

function reviewLoadCount(skillLoads) {
  return skillLoads.filter((name) => name === 'code-review').length;
}

async function collectRunResult(run, evidence) {
  for await (const event of run.stream()) {
    if (event?.type === 'tool_call') {
      evidence.toolCalls.push({
        name: String(event.name || 'unknown'),
        status: String(event.status || 'unknown'),
      });
    }
    const skill = skillNameFromEvent(event);
    if (skill) evidence.skillLoads.push(skill);
  }
  return run.wait();
}

function failureResult(error, startedAt, evidence) {
  return {
    status: 'failed',
    failure: {
      stage: error.stage || 'execution',
      message: String(error.message || 'Cursor workspace execution failed')
        .slice(0, 256),
    },
    durationMs: Date.now() - startedAt,
    costUsd: evidence.costUsd ?? null,
    agentId: evidence.agentId ?? null,
    runId: evidence.runId ?? null,
    requestId: evidence.requestId ?? null,
    output: evidence.output ?? null,
    model: evidence.model ?? null,
    git: null,
    skillLoads: evidence.skillLoads,
    reviewLoads: reviewLoadCount(evidence.skillLoads),
    toolCalls: evidence.toolCalls,
  };
}

function createCursorWorkspaceAdapter({
  apiKey = process.env.CURSOR_API_KEY,
  sdkLoader = loadCursorSdk,
  timeoutMs = 30 * 60 * 1000,
  temporaryRoot = os.tmpdir(),
} = {}) {
  if (typeof apiKey !== 'string' || apiKey.length === 0) {
    throw new TypeError('Cursor workspace adapter requires apiKey');
  }
  return Object.freeze({
    async execute(request) {
      const startedAt = Date.now();
      const evidence = { skillLoads: [], toolCalls: [] };
      let agent;
      let storeRoot;
      try {
        const workspace = fs.realpathSync(request.workspace);
        const before = snapshot(workspace);
        const model = normalizeModelSelection(request.model, 'model');
        const sdk = await withTimeout(sdkLoader, timeoutMs, 'Cursor SDK loading');
        if (typeof sdk?.Agent?.create !== 'function'
          || typeof sdk?.JsonlLocalAgentStore !== 'function'
          || typeof sdk?.Cursor?.models?.list !== 'function') {
          throw new CursorWorkspaceAdapterError(
            'Cursor SDK is unavailable',
            'setup',
          );
        }
        validateCatalogSelection(
          model,
          await withTimeout(
            () => sdk.Cursor.models.list({ apiKey }),
            timeoutMs,
            'Cursor model catalog',
          ),
        );
        storeRoot = fs.mkdtempSync(
          path.join(temporaryRoot, 'cursor-outcome-store-'),
        );
        agent = await withTimeout(
          () => sdk.Agent.create({
            apiKey,
            model,
            mode: request.mode || 'agent',
            local: {
              cwd: workspace,
              settingSources: ['project'],
              store: new sdk.JsonlLocalAgentStore(storeRoot),
            },
          }),
          timeoutMs,
          'Cursor Agent.create',
        );
        evidence.agentId = agent.agentId;
        const run = await withTimeout(
          () => agent.send(request.prompt),
          timeoutMs,
          'Cursor agent send',
        );
        evidence.runId = run.id;
        evidence.requestId = run.requestId || null;
        const result = await withTimeout(
          () => collectRunResult(run, evidence),
          timeoutMs,
          'Cursor workspace execution',
        );
        evidence.output = result.result || null;
        evidence.model = result.model || null;
        if (result.status !== 'finished') {
          throw new CursorWorkspaceAdapterError(
            result.error?.message || `Cursor run ${result.status}`,
          );
        }
        const resolvedModel = normalizeModelSelection(
          result.model,
          'resolved model',
        );
        if (!modelSelectionsEqual(model, resolvedModel)) {
          throw new CursorWorkspaceAdapterError(
            'Cursor resolved a different model selection',
            'result-normalization',
          );
        }
        const usage = await withTimeout(
          () => agent.getUsage(),
          timeoutMs,
          'Cursor usage collection',
        );
        evidence.costUsd = Number.isFinite(usage.cost?.chargedCents)
          ? usage.cost.chargedCents / 100
          : null;
        const after = snapshot(workspace);
        if (request.requireCommit !== false
          && after.headRevision === before.headRevision) {
          throw new CursorWorkspaceAdapterError(
            'Cursor implementation did not create a commit',
            'result-normalization',
          );
        }
        return {
          status: 'succeeded',
          failure: null,
          durationMs: Number.isFinite(result.durationMs)
            ? result.durationMs
            : Date.now() - startedAt,
          costUsd: evidence.costUsd,
          agentId: evidence.agentId,
          runId: result.id || evidence.runId,
          requestId: result.requestId || evidence.requestId,
          output: evidence.output,
          model: resolvedModel,
          git: {
            branch: after.branch,
            baseRevision: before.headRevision,
            headRevision: after.headRevision,
            status: after.status,
          },
          skillLoads: [...new Set(evidence.skillLoads)],
          reviewLoads: reviewLoadCount(evidence.skillLoads),
          toolCalls: evidence.toolCalls,
        };
      } catch (error) {
        return failureResult(error, startedAt, evidence);
      } finally {
        if (agent && typeof agent[Symbol.asyncDispose] === 'function') {
          await agent[Symbol.asyncDispose]().catch(() => {});
        }
        if (storeRoot) {
          fs.rmSync(storeRoot, { recursive: true, force: true });
        }
      }
    },
  });
}

module.exports = {
  CursorWorkspaceAdapterError,
  createCursorWorkspaceAdapter,
};
