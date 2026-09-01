'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { defineProductionAdapter } = require('..');
const {
  buildPreExecutionInventory,
  emptyPreExecutionInventory,
} = require('../pre-execution-inventory');

const MAX_ARTIFACT_BYTES = 64 * 1024;
const MAX_ARTIFACT_FILES = 64;
const CURSOR_OBSERVER_VERSION = '@cursor/sdk@1.0.28';

function loadCursorSdk() {
  return require('@cursor/sdk');
}

function copyPackageSkills(repositoryRoot, projectRoot, packageSkills) {
  for (const name of packageSkills) {
    const source = path.join(repositoryRoot, 'skills', name);
    const destination = path.join(projectRoot, '.cursor', 'skills', name);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.cpSync(source, destination, { recursive: true });
  }
}

function normalizeToolName(name) {
  const normalized = String(name || '').toLowerCase();
  if (normalized === 'generateimage') return 'write';
  if (normalized === 'applyagentdiff') return 'edit';
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

function isOutsideWorkspace(relativePath) {
  return relativePath === '..'
    || relativePath.startsWith(`..${path.sep}`)
    || path.isAbsolute(relativePath);
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
  if (isOutsideWorkspace(relative)) return 'outside-workspace';
  if (relative === '') return 'workspace';
  return relative.split(path.sep).join('/');
}

function canonicalSkillRead(args, projectRoot) {
  if (!args || typeof args !== 'object') return null;
  const candidate = args.path || args.filePath || args.file_path || args.target;
  if (typeof candidate !== 'string'
    || candidate.split(/[\\/]/).includes('..')) {
    return null;
  }
  const target = normalizeTarget(args, projectRoot, 'read');
  const match = /^(?:\.cursor|\.agents)\/skills\/([^/]+)\/SKILL\.md$/.exec(target);
  return match && /^[a-z0-9-]+$/.test(match[1])
    ? { name: match[1], target }
    : null;
}

function sameSkillReadIdentity(left, right) {
  return Boolean(left && right)
    && left.name === right.name
    && left.target === right.target;
}

function updateSkillReadState(
  event,
  callId,
  runId,
  order,
  projectRoot,
  skillReads,
) {
  const eventToolName = normalizeToolName(event.name);
  if (event.status === 'running') {
    const previous = skillReads.get(callId);
    if (eventToolName !== 'read' || event.truncated?.args) {
      if (previous) previous.invalid = true;
      return;
    }
    const identity = canonicalSkillRead(event.args, projectRoot);
    if (!identity) {
      if (previous) previous.invalid = true;
      return;
    }
    const rawName = String(event.name);
    if (previous) {
      if (previous.rawName !== rawName
        || !sameSkillReadIdentity(previous, identity)) {
        previous.invalid = true;
      }
      return;
    }
    skillReads.set(callId, {
      ...identity,
      rawName,
      runId: event.run_id || runId,
      invalid: false,
      startOrder: order,
      terminalStatus: null,
      terminalOrder: null,
    });
    return;
  }

  const activeRead = skillReads.get(callId);
  if (!activeRead) return;
  if (eventToolName !== 'read' || String(event.name) !== activeRead.rawName) {
    activeRead.invalid = true;
    return;
  }
  const terminalIdentity = event.args === undefined || event.truncated?.args
    ? activeRead
    : canonicalSkillRead(event.args, projectRoot);
  if (!sameSkillReadIdentity(activeRead, terminalIdentity)) {
    activeRead.invalid = true;
    return;
  }
  const terminalStatus = event.status === 'completed'
    ? 'succeeded'
    : event.status === 'error'
      ? 'failed'
      : null;
  if (terminalStatus && activeRead.terminalStatus === null) {
    activeRead.terminalStatus = terminalStatus;
    activeRead.terminalOrder = order;
  } else if (terminalStatus && activeRead.terminalStatus !== terminalStatus) {
    activeRead.invalid = true;
  }
}

function collectStreamEvidence(
  event,
  projectRoot,
  calls,
  responseTexts,
  skillReads,
  runId,
  order,
) {
  if (event?.type === 'assistant') {
    for (const block of event.message?.content || []) {
      if (block?.type === 'text' && typeof block.text === 'string') {
        responseTexts.push(block.text);
      }
    }
    return;
  }
  if (event?.type !== 'tool_call') return;

  const nativeCallId = typeof event.call_id === 'string' && event.call_id.length > 0
    ? event.call_id
    : null;
  const callId = nativeCallId
    ? nativeCallId
    : `unidentified-${calls.size}`;
  const previous = calls.get(callId);
  const name = normalizeToolName(event.name || previous?.rawName);
  if (nativeCallId) {
    updateSkillReadState(
      event,
      callId,
      runId,
      order,
      projectRoot,
      skillReads,
    );
  }
  calls.set(callId, {
    rawName: event.name || previous?.rawName,
    name,
    outcome: normalizeOutcome(event.status),
    target: normalizeTarget(event.args || previous?.args, projectRoot, name),
    args: event.args || previous?.args,
  });
}

function cursorSkillProvenance(runId, statusSource = 'observed') {
  return {
    host: 'cursor',
    mechanism: 'sdk-canonical-skill-read',
    eventType: 'tool_call',
    observerVersion: CURSOR_OBSERVER_VERSION,
    ...(runId ? { runId } : {}),
    statusSource,
  };
}

function skillEventsFromReads(skillReads, cancelled) {
  const orderedEvents = [];
  let inferredOrder = Number.MAX_SAFE_INTEGER;
  for (const [callId, read] of skillReads) {
    orderedEvents.push({
      order: read.startOrder,
      event: {
        name: read.name,
        operation: 'load',
        status: 'started',
        trigger: 'unknown',
        callId,
        provenance: cursorSkillProvenance(read.runId),
      },
    });
    const terminalStatus = read.invalid
      ? 'unknown'
      : read.terminalStatus || (cancelled ? 'cancelled' : 'unknown');
    orderedEvents.push({
      order: read.invalid || read.terminalOrder === null
        ? inferredOrder++
        : read.terminalOrder,
      event: {
        name: read.name,
        operation: 'load',
        status: terminalStatus,
        trigger: 'unknown',
        callId,
        provenance: cursorSkillProvenance(
          read.runId,
          read.invalid || !read.terminalStatus ? 'inferred' : 'observed',
        ),
      },
    });
  }
  return orderedEvents
    .sort((left, right) => left.order - right.order)
    .map(({ event }) => event);
}

function mediaTypeFor(filePath) {
  if (filePath.endsWith('.md')) return 'text/markdown';
  if (filePath.endsWith('.json')) return 'application/json';
  if (filePath.endsWith('.txt')) return 'text/plain';
  return 'application/octet-stream';
}

function listGeneratedFiles(directory) {
  const files = [];
  let truncated = false;

  function visit(relativeDirectory = '') {
    const absoluteDirectory = path.join(directory, relativeDirectory);
    const entries = fs.readdirSync(absoluteDirectory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (relativeDirectory === '' && entry.name === '.cursor') continue;
      if (files.length >= MAX_ARTIFACT_FILES) {
        truncated = true;
        return;
      }
      const relativePath = path.join(relativeDirectory, entry.name);
      if (entry.isDirectory()) {
        visit(relativePath);
        if (truncated) return;
      } else if (entry.isFile()) {
        files.push(relativePath.split(path.sep).join('/'));
      }
    }
  }

  visit();
  return { files, truncated };
}

function omittedArtifact(mediaType, payload, reason, details = {}) {
  return {
    mediaType,
    payload: {
      ...payload,
      status: 'omitted',
      reason,
      ...details,
    },
  };
}

function snapshotArtifact(projectRoot, file) {
  const mediaType = mediaTypeFor(file);
  const payload = {
    kind: 'cursor-artifact-snapshot',
    path: file,
  };
  const absolutePath = path.resolve(projectRoot, file);
  const relativePath = path.relative(projectRoot, absolutePath);
  if (isOutsideWorkspace(relativePath)) {
    return omittedArtifact(mediaType, payload, 'outside-workspace');
  }

  let descriptor;
  try {
    descriptor = fs.openSync(
      absolutePath,
      fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0),
    );
    const stats = fs.fstatSync(descriptor);
    if (!stats.isFile()) {
      return omittedArtifact(mediaType, payload, 'not-regular-file');
    }
    if (mediaType === 'application/octet-stream') {
      return omittedArtifact(
        mediaType,
        payload,
        'unsupported-media-type',
        { sizeBytes: stats.size },
      );
    }
    if (stats.size > MAX_ARTIFACT_BYTES) {
      return omittedArtifact(mediaType, payload, 'oversized', {
        sizeBytes: stats.size,
        limitBytes: MAX_ARTIFACT_BYTES,
      });
    }

    const buffer = Buffer.alloc(stats.size + 1);
    const bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, 0);
    if (bytesRead > MAX_ARTIFACT_BYTES) {
      return omittedArtifact(mediaType, payload, 'oversized', {
        sizeBytes: bytesRead,
        limitBytes: MAX_ARTIFACT_BYTES,
      });
    }
    let content;
    try {
      content = new TextDecoder('utf-8', { fatal: true })
        .decode(buffer.subarray(0, bytesRead));
    } catch {
      return omittedArtifact(
        mediaType,
        payload,
        'invalid-utf8',
        { sizeBytes: bytesRead },
      );
    }
    return {
      mediaType,
      payload: {
        ...payload,
        status: 'captured',
        content,
      },
    };
  } catch {
    return omittedArtifact(mediaType, payload, 'unreadable');
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function deduplicate(items, key) {
  return [...new Map(items.map((item) => [key(item), item])).values()];
}

function normalizedObservations(
  invocation,
  context,
  calls,
  artifacts,
  responseTexts,
  skillEvents,
  inventory,
  artifactScanTruncated,
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
  attemptedMutations.push(...artifacts.map(({ payload }) => ({
    operation: 'write',
    target: payload.path,
    outcome: 'succeeded',
  })));

  const responses = deduplicate(
    responseTexts.filter((text) => typeof text === 'string' && text.length > 0)
      .map((text) => ({ text })),
    ({ text }) => text,
  );
  if (artifactScanTruncated) {
    responses.push({
      text: JSON.stringify({
        kind: 'cursor-artifact-scan',
        status: 'truncated',
        limitFiles: MAX_ARTIFACT_FILES,
      }),
    });
  }
  const normalizedArtifacts = artifacts.map(({ mediaType, payload }) => {
    const responseIndex = responses.length;
    responses.push({ text: JSON.stringify(payload) });
    return {
      reference: `response://${responseIndex}`,
      mediaType,
    };
  });

  return {
    packageSkills: [...context.packageSkills],
    hostAvailableSkills: null,
    preExecutionInventory: inventory,
    skillEvents,
    routing: {
      requestedSkill: invocation.skill,
      resolvedSkills: [...context.resolvedSkills],
    },
    responses,
    artifacts: normalizedArtifacts,
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
  artifacts,
  skillEvents,
  inventory,
  artifactScanTruncated,
) {
  return {
    status: 'succeeded',
    observations: normalizedObservations(
      invocation,
      context,
      calls,
      artifacts,
      [runResult.result],
      skillEvents,
      inventory,
      artifactScanTruncated,
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
  artifacts = [],
  responseTexts = [],
  skillEvents = [],
  inventory = emptyPreExecutionInventory(),
  artifactScanTruncated = false,
}) {
  const failure = errorDetails(error, fallbackCode, executionRoot);
  return {
    status: 'failed',
    observations: normalizedObservations(
      invocation,
      context,
      calls,
      artifacts,
      responseTexts,
      skillEvents,
      inventory,
      artifactScanTruncated,
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

function normalizeSdkId(value) {
  if (typeof value !== 'string'
    || value.length === 0
    || value.length > 256
    || !/^[A-Za-z0-9._:-]+$/.test(value)) {
    return null;
  }
  return value;
}

async function executeCursor({
  invocation,
  context,
  repositoryRoot,
  sdk,
  apiKey,
  temporaryRoot,
  onRunStarted,
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
  let resolvedModel = null;
  let durationMs = null;
  let normalized = null;
  let cleanupFailure = null;
  let artifacts = [];
  let artifactScanTruncated = false;
  let inventory = emptyPreExecutionInventory();
  const calls = new Map();
  const responseTexts = [];
  const skillReads = new Map();
  let skillEvents = [];
  let streamEventOrder = 0;

  try {
    try {
      executionRoot = fs.mkdtempSync(
        path.join(temporaryRoot, 'cursor-suite-execution-'),
      );
      projectRoot = path.join(executionRoot, 'project');
      storeRoot = path.join(executionRoot, 'store');
      fs.mkdirSync(projectRoot);
      copyPackageSkills(repositoryRoot, projectRoot, context.packageSkills);
      inventory = buildPreExecutionInventory({
        projectRoot,
        skillNames: context.packageSkills,
        relativePathFor: (name) => `.cursor/skills/${name}/SKILL.md`,
      });
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
      if (typeof onRunStarted === 'function') {
        try {
          await onRunStarted({
            agentId: normalizeSdkId(agent.agentId),
            runId: normalizeSdkId(run.id),
          });
        } catch {
          // Observability must not change execution semantics.
        }
      }
      failureStage = 'execution';
      fallbackCode = 'cursor-execution-failed';
      for await (const event of run.stream()) {
        collectStreamEvidence(
          event,
          projectRoot,
          calls,
          responseTexts,
          skillReads,
          run.id,
          streamEventOrder,
        );
        streamEventOrder += 1;
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

    if (projectRoot && fs.existsSync(projectRoot)) {
      const generatedFiles = listGeneratedFiles(projectRoot);
      artifacts = generatedFiles.files.map((file) => (
        snapshotArtifact(projectRoot, file)
      ));
      artifactScanTruncated = generatedFiles.truncated;
    }
    if (!failureError && runResult?.status !== 'finished') {
      failureError = Object.assign(
        new Error(
          runResult?.error?.message
            || `Cursor run ${runResult?.status || 'failed'}`,
        ),
        {
          code: runResult?.error?.code
            || `cursor-run-${runResult?.status || 'failed'}`,
        },
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

    if (typeof runResult?.model?.id === 'string') {
      resolvedModel = runResult.model.id;
    } else if (typeof agent?.model?.id === 'string') {
      resolvedModel = agent.model.id;
    }
    durationMs = Number.isFinite(runResult?.durationMs)
      ? runResult.durationMs
      : Date.now() - startedAt;
    skillEvents = skillEventsFromReads(
      skillReads,
      runResult?.status === 'cancelled',
    );
    normalized = failureError
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
        artifacts,
        responseTexts: [
          ...responseTexts,
          ...(typeof runResult?.result === 'string' ? [runResult.result] : []),
        ],
        skillEvents,
        inventory,
        artifactScanTruncated,
      })
      : successfulResult(
        invocation,
        context,
        runResult,
        costUsd,
        calls,
        artifacts,
        skillEvents,
        inventory,
        artifactScanTruncated,
      );
  } catch (error) {
    if (!failureError) {
      failureError = error;
      failureStage = 'result-normalization';
      fallbackCode = 'cursor-result-normalization-failed';
    }
  } finally {
    if (run && !runResult) {
      try {
        runResult = await cancelAndWait(run);
      } catch (error) {
        cleanupFailure = {
          error,
          fallbackCode: 'cursor-run-cleanup-failed',
        };
      }
    }
    if (agent) {
      try {
        await agent[Symbol.asyncDispose]();
      } catch (error) {
        cleanupFailure ||= {
          error,
          fallbackCode: 'cursor-agent-disposal-failed',
        };
      }
    }
    if (executionRoot) {
      try {
        fs.rmSync(executionRoot, { recursive: true, force: true });
      } catch (error) {
        cleanupFailure ||= {
          error,
          fallbackCode: 'cursor-temporary-cleanup-failed',
        };
      }
    }
  }

  durationMs ??= Date.now() - startedAt;
  skillEvents = skillEventsFromReads(
    skillReads,
    runResult?.status === 'cancelled',
  );
  if (!normalized || (cleanupFailure && !failureError)) {
    const activeFailure = failureError || cleanupFailure.error;
    normalized = failedResult({
      invocation,
      context,
      stage: failureError ? failureStage : 'execution',
      error: activeFailure,
      fallbackCode: failureError ? fallbackCode : cleanupFailure.fallbackCode,
      executionRoot,
      durationMs,
      costUsd,
      resolvedModel,
      calls,
      artifacts,
      responseTexts,
      skillEvents,
      inventory,
      artifactScanTruncated,
    });
  }
  return normalized;
}

function createCursorAdapter({
  repositoryRoot,
  sdk = null,
  apiKey = process.env.CURSOR_API_KEY,
  temporaryRoot = os.tmpdir(),
  onRunStarted = null,
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
        onRunStarted,
      });
    },
  });
}

module.exports = {
  createCursorAdapter,
};
