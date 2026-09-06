'use strict';

const { spawnSync } = require('node:child_process');

const {
  modelSelectionsEqual,
  normalizeModelSelection,
} = require('../model-selection');

const GITHUB_REPOSITORY = /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/;

class CursorCloudAdapterError extends Error {
  constructor(message, stage = 'execution') {
    super(message);
    this.name = 'CursorCloudAdapterError';
    this.stage = stage;
  }
}

function loadCursorSdk() {
  return require('@cursor/sdk');
}

function requireString(value, field) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new CursorCloudAdapterError(`${field} must be a non-empty string`, 'setup');
  }
  return value;
}

function validateRepositoryUrl(value) {
  requireString(value, 'repositoryUrl');
  if (!GITHUB_REPOSITORY.test(value)) {
    throw new CursorCloudAdapterError(
      'repositoryUrl must be one HTTPS GitHub repository URL',
      'setup',
    );
  }
  return value;
}

function validateStartingRef(value) {
  requireString(value, 'startingRef');
  if (value.startsWith('-') || /[\s~^:?*[\]\\]/.test(value)) {
    throw new CursorCloudAdapterError('startingRef is invalid', 'setup');
  }
  return value;
}

function catalogParametersMatch(selection, definitions) {
  if (!Array.isArray(definitions)) return false;
  const requested = new Map(
    selection.params.map(({ id, value }) => [id, value]),
  );
  const everyDefinitionMatches = definitions.every((definition) => (
    requested.has(definition.id)
      && Array.isArray(definition.values)
      && definition.values.some(({ value }) => (
        value === requested.get(definition.id)
      ))
  ));
  const everyRequestMatches = selection.params.every(({ id }) => (
    definitions.some((definition) => definition.id === id)
  ));
  return everyDefinitionMatches && everyRequestMatches;
}

function validateCatalogSelection(selection, catalog) {
  if (!Array.isArray(catalog)) {
    throw new CursorCloudAdapterError('Cursor model catalog is invalid', 'setup');
  }
  const matches = catalog.filter(({ id }) => id === selection.id);
  if (matches.length !== 1) {
    throw new CursorCloudAdapterError(
      `Cursor model "${selection.id}" is unavailable`,
      'setup',
    );
  }
  const definitions = matches[0].parameters || [];
  if (!catalogParametersMatch(selection, definitions)) {
    throw new CursorCloudAdapterError(
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
        new CursorCloudAdapterError(`${label} timed out`, 'execution'),
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
  const path = event.args?.path
    || event.args?.filePath
    || event.args?.file_path;
  if (typeof path !== 'string' || path.split(/[\\/]/).includes('..')) return null;
  return /^(?:\.cursor|\.agents)\/skills\/([a-z0-9-]+)\/SKILL\.md$/
    .exec(path)?.[1] || null;
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

function reviewLoadCount(skillLoads) {
  return skillLoads.filter((name) => name === 'code-review').length;
}

function runGh(args) {
  const result = spawnSync('gh', args, { encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    throw new CursorCloudAdapterError(
      'cannot resolve cloud Git head through GitHub',
      'result-normalization',
    );
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new CursorCloudAdapterError(
      'GitHub returned invalid Git head evidence',
      'result-normalization',
    );
  }
}

async function defaultResolveGitHead({ repositoryUrl, branch, prUrl }) {
  if (prUrl) {
    const value = runGh([
      'pr',
      'view',
      prUrl,
      '--json',
      'headRefOid,headRefName,baseRefName',
    ]);
    return {
      headRevision: value.headRefOid,
      headBranch: value.headRefName,
      baseBranch: value.baseRefName,
    };
  }
  const [, owner, repository] = GITHUB_REPOSITORY.exec(repositoryUrl);
  const value = runGh([
    'api',
    `repos/${owner}/${repository}/commits/${encodeURIComponent(branch)}`,
  ]);
  return {
    headRevision: value.sha,
    headBranch: branch,
    baseBranch: null,
  };
}

function normalizedGit(runResult, repositoryUrl, resolved) {
  const branches = runResult.git?.branches;
  if (!Array.isArray(branches)) {
    throw new CursorCloudAdapterError(
      'Cursor Cloud result is missing Git branch evidence',
      'result-normalization',
    );
  }
  const matches = branches.filter((branch) => branch.repoUrl === repositoryUrl);
  if (matches.length !== 1 || !matches[0].branch) {
    throw new CursorCloudAdapterError(
      'Cursor Cloud result has ambiguous Git branch evidence',
      'result-normalization',
    );
  }
  if (!resolved || !/^[a-f0-9]{40}$/.test(resolved.headRevision)) {
    throw new CursorCloudAdapterError(
      'resolved cloud Git head is not immutable',
      'result-normalization',
    );
  }
  return {
    repositoryUrl,
    branch: matches[0].branch,
    prUrl: matches[0].prUrl || null,
    headRevision: resolved.headRevision,
    headBranch: resolved.headBranch || matches[0].branch,
    baseBranch: resolved.baseBranch || null,
  };
}

function failureResult(error, startedAt, evidence = {}) {
  return {
    status: 'failed',
    failure: {
      stage: error.stage || 'execution',
      message: String(error.message || 'Cursor Cloud execution failed').slice(0, 256),
    },
    durationMs: Date.now() - startedAt,
    costUsd: evidence.costUsd ?? null,
    agentId: evidence.agentId ?? null,
    runId: evidence.runId ?? null,
    requestId: evidence.requestId ?? null,
    output: evidence.output ?? null,
    model: evidence.model ?? null,
    git: null,
    skillLoads: evidence.skillLoads || [],
    reviewLoads: reviewLoadCount(evidence.skillLoads || []),
    toolCalls: evidence.toolCalls || [],
  };
}

async function cleanupAgent({ agent, sdk, apiKey, agentId, archive }) {
  if (agent && typeof agent[Symbol.asyncDispose] === 'function') {
    await agent[Symbol.asyncDispose]().catch(() => {});
  }
  if (archive && agentId && typeof sdk?.Agent?.archive === 'function') {
    await sdk.Agent.archive(agentId, { apiKey }).catch(() => {});
  }
}

function createCursorCloudAdapter({
  apiKey = process.env.CURSOR_API_KEY,
  sdkLoader = loadCursorSdk,
  timeoutMs = 30 * 60 * 1000,
  resolveGitHead = defaultResolveGitHead,
  archiveCompletedAgents = true,
} = {}) {
  requireString(apiKey, 'Cursor apiKey');
  if (typeof sdkLoader !== 'function' || typeof resolveGitHead !== 'function') {
    throw new TypeError('Cursor Cloud adapter dependencies must be functions');
  }
  if (timeoutMs !== null && (!Number.isInteger(timeoutMs) || timeoutMs <= 0)) {
    throw new TypeError('Cursor Cloud adapter timeoutMs must be positive or null');
  }

  return Object.freeze({
    async execute(request) {
      const startedAt = Date.now();
      const evidence = { skillLoads: [], toolCalls: [] };
      let sdk;
      let agent;
      try {
        const repositoryUrl = validateRepositoryUrl(request.repositoryUrl);
        const startingRef = validateStartingRef(request.startingRef);
        const prompt = requireString(request.prompt, 'prompt');
        const model = normalizeModelSelection(request.model, 'model');
        sdk = await withTimeout(sdkLoader, timeoutMs, 'Cursor SDK loading');
        if (typeof sdk?.Agent?.create !== 'function'
          || typeof sdk?.Cursor?.models?.list !== 'function') {
          throw new CursorCloudAdapterError('Cursor SDK is unavailable', 'setup');
        }
        const catalog = await withTimeout(
          () => sdk.Cursor.models.list({ apiKey }),
          timeoutMs,
          'Cursor model catalog',
        );
        validateCatalogSelection(model, catalog);
        agent = await withTimeout(
          () => sdk.Agent.create({
            apiKey,
            model,
            mode: request.mode || 'agent',
            cloud: {
              repos: [{ url: repositoryUrl, startingRef }],
              autoCreatePR: Boolean(request.autoCreatePR),
              workOnCurrentBranch: Boolean(request.workOnCurrentBranch),
              skipReviewerRequest: true,
              metadata: request.metadata || {},
            },
          }),
          timeoutMs,
          'Cursor Agent.create',
        );
        evidence.agentId = agent.agentId;
        const run = await withTimeout(
          () => agent.send(prompt),
          timeoutMs,
          'Cursor agent send',
        );
        evidence.runId = run.id;
        evidence.requestId = run.requestId || null;
        const runResult = await withTimeout(
          () => collectRunResult(run, evidence),
          timeoutMs,
          'Cursor Cloud execution',
        );
        evidence.runId = runResult.id || evidence.runId;
        evidence.requestId = runResult.requestId || evidence.requestId;
        evidence.output = runResult.result || null;
        evidence.model = runResult.model || null;
        if (runResult.status !== 'finished') {
          throw new CursorCloudAdapterError(
            runResult.error?.message || `Cursor run ${runResult.status}`,
          );
        }
        const resolvedModel = normalizeModelSelection(
          runResult.model,
          'resolved model',
        );
        if (!modelSelectionsEqual(model, resolvedModel)) {
          throw new CursorCloudAdapterError(
            'Cursor Cloud resolved a different model selection',
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
        let git = null;
        if (request.requireGitEvidence !== false) {
          const branch = runResult.git?.branches?.find(
            (candidate) => candidate.repoUrl === repositoryUrl,
          );
          const resolved = await withTimeout(
            () => resolveGitHead({
              repositoryUrl,
              branch: branch?.branch,
              prUrl: branch?.prUrl,
            }),
            timeoutMs,
            'cloud Git head resolution',
          );
          git = normalizedGit(runResult, repositoryUrl, resolved);
        }
        return {
          status: 'succeeded',
          failure: null,
          durationMs: Number.isFinite(runResult.durationMs)
            ? runResult.durationMs
            : Date.now() - startedAt,
          costUsd: evidence.costUsd,
          agentId: evidence.agentId,
          runId: evidence.runId,
          requestId: evidence.requestId,
          output: evidence.output,
          model: resolvedModel,
          git,
          skillLoads: [...new Set(evidence.skillLoads)],
          reviewLoads: reviewLoadCount(evidence.skillLoads),
          toolCalls: evidence.toolCalls,
        };
      } catch (error) {
        return failureResult(error, startedAt, evidence);
      } finally {
        await cleanupAgent({
          agent,
          sdk,
          apiKey,
          agentId: evidence.agentId,
          archive: archiveCompletedAgents,
        });
      }
    },
  });
}

module.exports = {
  CursorCloudAdapterError,
  createCursorCloudAdapter,
};
