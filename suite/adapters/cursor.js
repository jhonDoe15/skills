'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { defineProductionAdapter } = require('..');

function loadCursorSdk() {
  return require('@cursor/sdk');
}

function copyResolvedSkills(repositoryRoot, projectRoot, resolvedSkills) {
  for (const name of resolvedSkills) {
    const source = path.join(repositoryRoot, 'skills', name);
    const destination = path.join(projectRoot, '.cursor', 'skills', name);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.cpSync(source, destination, { recursive: true });
  }
}

function normalizeToolName(name) {
  const normalized = String(name || '').toLowerCase();
  if (/write|create/.test(normalized)) return 'write';
  if (/edit|replace|patch/.test(normalized)) return 'edit';
  if (/delete|remove/.test(normalized)) return 'delete';
  if (/move|rename/.test(normalized)) return 'move';
  if (/shell|terminal|command/.test(normalized)) return 'shell';
  if (/read|view/.test(normalized)) return 'read';
  if (/search|grep|glob|find/.test(normalized)) return 'search';
  return 'other';
}

function normalizeOutcome(status) {
  if (status === 'completed') return 'succeeded';
  if (status === 'error') return 'failed';
  return 'attempted';
}

function normalizeTarget(args, projectRoot, toolName) {
  if (toolName === 'shell') return 'workspace';
  const candidate = args && typeof args === 'object'
    ? args.path || args.filePath || args.file_path || args.target
    : null;
  if (typeof candidate !== 'string' || candidate.length === 0) return 'workspace';

  const absolute = path.isAbsolute(candidate)
    ? path.resolve(candidate)
    : path.resolve(projectRoot, candidate);
  const relative = path.relative(projectRoot, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return 'outside-workspace';
  }
  return relative.split(path.sep).join('/');
}

function collectStreamEvidence(event, projectRoot, calls, responseTexts) {
  if (event?.type === 'assistant') {
    for (const block of event.message?.content || []) {
      if (block?.type === 'text' && typeof block.text === 'string') {
        responseTexts.push(block.text);
      }
    }
    return;
  }
  if (event?.type !== 'tool_call') return;

  const callId = typeof event.call_id === 'string'
    ? event.call_id
    : `unidentified-${calls.size}`;
  const previous = calls.get(callId);
  const name = normalizeToolName(event.name || previous?.rawName);
  calls.set(callId, {
    rawName: event.name || previous?.rawName,
    name,
    outcome: normalizeOutcome(event.status),
    target: normalizeTarget(event.args || previous?.args, projectRoot, name),
    args: event.args || previous?.args,
  });
}

function mediaTypeFor(filePath) {
  if (filePath.endsWith('.md')) return 'text/markdown';
  if (filePath.endsWith('.json')) return 'application/json';
  return 'text/plain';
}

function listGeneratedFiles(directory, relativeDirectory = '') {
  const absoluteDirectory = path.join(directory, relativeDirectory);
  return fs.readdirSync(absoluteDirectory, { withFileTypes: true })
    .flatMap((entry) => {
      if (relativeDirectory === '' && entry.name === '.cursor') return [];
      const relativePath = path.join(relativeDirectory, entry.name);
      if (entry.isDirectory()) {
        return listGeneratedFiles(directory, relativePath);
      }
      return entry.isFile()
        ? [relativePath.split(path.sep).join('/')]
        : [];
    })
    .sort();
}

function deduplicate(items, key) {
  return [...new Map(items.map((item) => [key(item), item])).values()];
}

function normalizedObservations(
  invocation,
  context,
  calls,
  files,
  responseTexts,
) {
  const toolUses = [...calls.values()].map(({ name, outcome }) => ({
    name,
    outcome,
  }));
  const attemptedMutations = [...calls.values()]
    .filter(({ name }) => ['write', 'edit', 'delete', 'move', 'shell'].includes(name))
    .map(({ name, target, outcome }) => ({
      operation: name,
      target,
      outcome,
    }));
  attemptedMutations.push(...files.map((file) => ({
    operation: 'write',
    target: file,
    outcome: 'succeeded',
  })));

  return {
    discoveredSkills: [...context.discoveredSkills],
    routing: {
      requestedSkill: invocation.skill,
      invokedSkills: [...context.resolvedSkills],
    },
    responses: deduplicate(
      responseTexts.filter((text) => typeof text === 'string' && text.length > 0)
        .map((text) => ({ text })),
      ({ text }) => text,
    ),
    artifacts: files.map((file) => ({
      reference: `workspace://${file}`,
      mediaType: mediaTypeFor(file),
    })),
    toolUses: deduplicate(
      toolUses,
      ({ name, outcome }) => `${name}\0${outcome}`,
    ),
    attemptedMutations: deduplicate(
      attemptedMutations,
      ({ operation, target, outcome }) => `${operation}\0${target}\0${outcome}`,
    ),
  };
}

function successfulResult(
  invocation,
  context,
  runResult,
  costUsd,
  calls,
  files,
) {
  return {
    status: 'succeeded',
    observations: normalizedObservations(
      invocation,
      context,
      calls,
      files,
      [runResult.result],
    ),
    failure: null,
    durationMs: runResult.durationMs,
    costUsd,
    model: {
      requested: invocation.model,
      resolved: runResult.model.id,
    },
  };
}

function errorDetails(error, fallbackCode, executionRoot = null) {
  const code = typeof error?.code === 'string' && error.code.length > 0
    ? error.code
    : fallbackCode;
  let message = typeof error?.message === 'string' && error.message.length > 0
    ? error.message
    : 'Cursor execution failed';
  if (executionRoot) message = message.split(executionRoot).join('<temporary-project>');
  return { code, message };
}

function failedResult({
  invocation,
  context,
  stage,
  error,
  fallbackCode,
  executionRoot,
  durationMs,
  costUsd,
  resolvedModel,
  calls = new Map(),
  files = [],
  responseTexts = [],
}) {
  const failure = errorDetails(error, fallbackCode, executionRoot);
  return {
    status: 'failed',
    observations: normalizedObservations(
      invocation,
      context,
      calls,
      files,
      responseTexts,
    ),
    failure: {
      stage,
      ...failure,
    },
    durationMs,
    costUsd,
    model: {
      requested: invocation.model,
      resolved: resolvedModel,
    },
  };
}

function requireCursorSdk(sdk) {
  if (typeof sdk?.Agent?.create !== 'function'
    || typeof sdk.JsonlLocalAgentStore !== 'function') {
    throw Object.assign(new Error('Cursor SDK is unavailable'), {
      code: 'cursor-sdk-unavailable',
    });
  }
  return sdk;
}

async function cancelAndWait(run) {
  if (!run) return null;
  if (run.status === 'running'
    && (typeof run.supports !== 'function' || run.supports('cancel'))) {
    await run.cancel();
  }
  if (typeof run.wait === 'function') return run.wait();
  return null;
}

async function executeCursor({
  invocation,
  context,
  repositoryRoot,
  sdk,
  apiKey,
  temporaryRoot,
}) {
  const startedAt = Date.now();
  let cursorSdk;
  try {
    cursorSdk = requireCursorSdk(sdk || loadCursorSdk());
  } catch (error) {
    return failedResult({
      invocation,
      context,
      stage: 'setup',
      error,
      fallbackCode: 'cursor-sdk-unavailable',
      durationMs: Date.now() - startedAt,
      costUsd: null,
      resolvedModel: null,
    });
  }

  let executionRoot = null;
  let projectRoot = null;
  let storeRoot = null;
  let agent;
  let run;
  let runResult;
  let failureError = null;
  let failureStage = 'setup';
  let fallbackCode = 'cursor-setup-failed';
  let costUsd = null;
  const calls = new Map();
  const responseTexts = [];

  try {
    executionRoot = fs.mkdtempSync(
      path.join(temporaryRoot, 'cursor-suite-execution-'),
    );
    projectRoot = path.join(executionRoot, 'project');
    storeRoot = path.join(executionRoot, 'store');
    fs.mkdirSync(projectRoot);
    copyResolvedSkills(repositoryRoot, projectRoot, context.resolvedSkills);
    const store = new cursorSdk.JsonlLocalAgentStore(storeRoot);

    failureStage = 'startup';
    fallbackCode = 'cursor-startup-failed';
    agent = await cursorSdk.Agent.create({
      apiKey,
      model: { id: invocation.model },
      local: {
        cwd: projectRoot,
        settingSources: ['project'],
        sandboxOptions: { enabled: true },
        store,
      },
    });

    run = await agent.send(invocation.prompt);
    failureStage = 'execution';
    fallbackCode = 'cursor-execution-failed';
    for await (const event of run.stream()) {
      collectStreamEvidence(event, projectRoot, calls, responseTexts);
    }
    runResult = await run.wait();
  } catch (error) {
    failureError = error;
    if (run) {
      try {
        runResult = await cancelAndWait(run);
      } catch {
        // The original run failure remains the actionable error.
      }
    }
  }

  if (agent) {
    try {
      const usage = await agent.getUsage();
      costUsd = Number.isFinite(usage.cost?.chargedCents)
        ? usage.cost.chargedCents / 100
        : null;
    } catch {
      costUsd = null;
    }
  }

  let files = [];
  if (projectRoot && fs.existsSync(projectRoot)) {
    try {
      files = listGeneratedFiles(projectRoot);
    } catch (error) {
      if (!failureError) {
        failureError = error;
        failureStage = 'result-normalization';
        fallbackCode = 'cursor-result-normalization-failed';
      }
    }
  }

  if (!failureError && runResult?.status !== 'finished') {
    failureError = Object.assign(
      new Error(runResult?.error?.message || `Cursor run ${runResult?.status || 'failed'}`),
      { code: runResult?.error?.code || `cursor-run-${runResult?.status || 'failed'}` },
    );
    failureStage = 'execution';
    fallbackCode = 'cursor-execution-failed';
  }

  if (!failureError
    && (typeof runResult?.result !== 'string'
      || runResult.result.length === 0
      || typeof runResult?.model?.id !== 'string'
      || runResult.model.id.length === 0
      || !Number.isFinite(runResult.durationMs)
      || runResult.durationMs < 0)) {
    failureError = Object.assign(
      new Error('Cursor run returned incomplete normalized evidence'),
      { code: 'cursor-result-incomplete' },
    );
    failureStage = 'result-normalization';
    fallbackCode = 'cursor-result-normalization-failed';
  }

  const resolvedModel = typeof runResult?.model?.id === 'string'
    ? runResult.model.id
    : typeof agent?.model?.id === 'string'
      ? agent.model.id
      : null;
  const durationMs = Number.isFinite(runResult?.durationMs)
    ? runResult.durationMs
    : Date.now() - startedAt;
  let normalized = failureError
    ? failedResult({
      invocation,
      context,
      stage: failureStage,
      error: failureError,
      fallbackCode,
      executionRoot,
      durationMs,
      costUsd,
      resolvedModel,
      calls,
      files,
      responseTexts: [
        ...responseTexts,
        ...(typeof runResult?.result === 'string' ? [runResult.result] : []),
      ],
    })
    : successfulResult(
      invocation,
      context,
      runResult,
      costUsd,
      calls,
      files,
    );

  try {
    if (agent) await agent[Symbol.asyncDispose]();
  } catch (error) {
    if (normalized.status === 'succeeded') {
      normalized = failedResult({
        invocation,
        context,
        stage: 'execution',
        error,
        fallbackCode: 'cursor-agent-disposal-failed',
        executionRoot,
        durationMs,
        costUsd,
        resolvedModel,
        calls,
        files,
        responseTexts: [runResult.result],
      });
    }
  } finally {
    if (executionRoot) {
      fs.rmSync(executionRoot, { recursive: true, force: true });
    }
  }
  return normalized;
}

function createCursorAdapter({
  repositoryRoot,
  sdk = null,
  apiKey = process.env.CURSOR_API_KEY,
  temporaryRoot = os.tmpdir(),
} = {}) {
  if (typeof repositoryRoot !== 'string' || repositoryRoot.length === 0) {
    throw new TypeError('Cursor Adapter requires repositoryRoot');
  }

  return defineProductionAdapter({
    name: 'cursor-local',
    execute(invocation, context) {
      return executeCursor({
        invocation,
        context,
        repositoryRoot,
        sdk,
        apiKey,
        temporaryRoot,
      });
    },
  });
}

module.exports = {
  createCursorAdapter,
};
