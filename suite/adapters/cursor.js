'use strict';

const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { defineProductionAdapter } = require('..');
const {
  buildPreExecutionInventory,
  emptyPreExecutionInventory,
} = require('../pre-execution-inventory');
const { stageCaseFixtures } = require('./fixture-staging');

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

function skillsToStage(context) {
  const dependency = context.dependencyAblation?.dependency;
  return dependency
    ? context.packageSkills.filter((name) => name !== dependency)
    : context.packageSkills;
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

function fixtureMatchesDigest(directory, relativePath, expectedDigest) {
  if (!expectedDigest) return false;
  const currentDigest = createHash('sha256')
    .update(fs.readFileSync(path.join(directory, relativePath)))
    .digest('hex');
  return currentDigest === expectedDigest;
}

function listGeneratedFiles(directory, stagedFixtureDigests = new Map()) {
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
        const normalizedPath = relativePath.split(path.sep).join('/');
        const stagedDigest = stagedFixtureDigests.get(normalizedPath);
        if (fixtureMatchesDigest(directory, relativePath, stagedDigest)) continue;
        files.push(normalizedPath);
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

async function cancelRunIfSupported(run) {
  if (run.status !== 'running') return;
  if (typeof run.supports === 'function' && !run.supports('cancel')) return;
  await run.cancel();
}

function createDeadline(timeoutMs) {
  const expiresAt = timeoutMs === null ? null : Date.now() + timeoutMs;
  function timeoutError(label, code) {
    return Object.assign(
      new Error(`${label} timed out after ${timeoutMs}ms`),
      { code },
    );
  }
  return {
    async run(
      operation,
      label,
      code = 'cursor-execution-timeout',
    ) {
      if (expiresAt === null) return operation();
      let timer;
      const remainingMs = Math.max(0, expiresAt - Date.now());
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(timeoutError(label, code)),
          remainingMs,
        );
      });
      try {
        const result = await Promise.race([
          Promise.resolve().then(operation),
          timeout,
        ]);
        if (Date.now() > expiresAt) throw timeoutError(label, code);
        return result;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

async function settleRun(run, cleanup) {
  await cleanup(
    () => cancelRunIfSupported(run),
    'Cursor run cancellation',
    'cursor-run-cleanup-timeout',
    'cursor-run-cleanup-failed',
  );
  if (typeof run.wait !== 'function') return null;
  return cleanup(
    () => run.wait(),
    'Cursor terminal wait',
    'cursor-run-cleanup-timeout',
    'cursor-run-cleanup-failed',
  );
}

function combinedFailure(primary, cleanupFailures) {
  if (cleanupFailures.length === 0) return primary;
  const active = primary || cleanupFailures[0].error;
  const cleanupMessage = cleanupFailures.map(({ error, fallbackCode }) => (
    `${error.code || fallbackCode}: ${error.message}`
  )).join('; ');
  return Object.assign(
    new Error(
      primary
        ? `${primary.message}; cleanup failures: ${cleanupMessage}`
        : cleanupMessage,
    ),
    { code: active.code },
  );
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
  sdkLoader,
  apiKey,
  temporaryRoot,
  removeTemporary,
  onRunStarted,
  timeoutMs,
}) {
  const startedAt = Date.now();
  const lifecycleDeadline = createDeadline(timeoutMs);
  let cleanupDeadline = null;
  const cleanupFailures = [];
  async function cleanup(
    operation,
    label,
    timeoutCode,
    fallbackCode,
  ) {
    cleanupDeadline ||= createDeadline(timeoutMs);
    try {
      return await cleanupDeadline.run(operation, label, timeoutCode);
    } catch (error) {
      cleanupFailures.push({ error, fallbackCode });
      return null;
    }
  }
  let cursorSdk;
  try {
    cursorSdk = requireCursorSdk(
      sdk || await lifecycleDeadline.run(
        sdkLoader,
        'Cursor SDK loading',
      ),
    );
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
  let runSettlementAttempted = false;
  let artifacts = [];
  let artifactScanTruncated = false;
  let stagedFixtureDigests = new Map();
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
      const stagedSkills = skillsToStage(context);
      copyPackageSkills(repositoryRoot, projectRoot, stagedSkills);
      stagedFixtureDigests = stageCaseFixtures(projectRoot, context.fixtures);
      inventory = buildPreExecutionInventory({
        projectRoot,
        skillNames: stagedSkills,
        relativePathFor: (name) => `.cursor/skills/${name}/SKILL.md`,
      });
      const store = new cursorSdk.JsonlLocalAgentStore(storeRoot);
      await lifecycleDeadline.run(
        () => undefined,
        'Cursor project setup',
      );

      failureStage = 'startup';
      fallbackCode = 'cursor-startup-failed';
      agent = await lifecycleDeadline.run(
        () => cursorSdk.Agent.create({
          apiKey,
          model: { id: invocation.model },
          local: {
            cwd: projectRoot,
            settingSources: ['project'],
            sandboxOptions: { enabled: true },
            store,
          },
        }),
        'Cursor Agent.create',
      );

      run = await lifecycleDeadline.run(
        () => agent.send(invocation.prompt),
        'Cursor agent send',
      );
      if (typeof onRunStarted === 'function') {
        try {
          await lifecycleDeadline.run(
            () => onRunStarted({
              agentId: normalizeSdkId(agent.agentId),
              runId: normalizeSdkId(run.id),
            }),
            'Cursor run-start observer',
          );
        } catch (error) {
          if (error.code === 'cursor-execution-timeout') throw error;
        }
      }
      failureStage = 'execution';
      fallbackCode = 'cursor-execution-failed';
      runResult = await lifecycleDeadline.run(
        async () => {
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
          return run.wait();
        },
        'Cursor execution',
      );
    } catch (error) {
      failureError = error;
      if (run) {
        runSettlementAttempted = true;
        runResult = await settleRun(run, cleanup);
      }
    }

    if (agent) {
      try {
        const usage = await lifecycleDeadline.run(
          () => agent.getUsage(),
          'Cursor usage collection',
        );
        costUsd = Number.isFinite(usage.cost?.chargedCents)
          ? usage.cost.chargedCents / 100
          : null;
      } catch (error) {
        costUsd = null;
        if (!failureError && error.code === 'cursor-execution-timeout') {
          failureError = error;
          failureStage = 'result-normalization';
          fallbackCode = 'cursor-result-normalization-failed';
        }
      }
    }

    if (projectRoot && fs.existsSync(projectRoot)) {
      const generatedFiles = listGeneratedFiles(
        projectRoot,
        stagedFixtureDigests,
      );
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
    if (run && !runResult && !runSettlementAttempted) {
      runResult = await settleRun(run, cleanup);
    }
    if (agent) {
      await cleanup(
        () => agent[Symbol.asyncDispose](),
        'Cursor agent disposal',
        'cursor-agent-disposal-timeout',
        'cursor-agent-disposal-failed',
      );
    }
    if (executionRoot) {
      await cleanup(
        () => removeTemporary(executionRoot),
        'Cursor temporary cleanup',
        'cursor-temporary-cleanup-timeout',
        'cursor-temporary-cleanup-failed',
      );
    }
  }

  durationMs ??= Date.now() - startedAt;
  skillEvents = skillEventsFromReads(
    skillReads,
    runResult?.status === 'cancelled',
  );
  if (!normalized || cleanupFailures.length > 0) {
    const activeFailure = combinedFailure(failureError, cleanupFailures);
    normalized = failedResult({
      invocation,
      context,
      stage: failureError ? failureStage : 'execution',
      error: activeFailure,
      fallbackCode: failureError
        ? fallbackCode
        : cleanupFailures[0].fallbackCode,
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
  sdkLoader = loadCursorSdk,
  apiKey = process.env.CURSOR_API_KEY,
  temporaryRoot = os.tmpdir(),
  removeTemporary = (directory) => fs.promises.rm(
    directory,
    { recursive: true, force: true },
  ),
  onRunStarted = null,
  timeoutMs = null,
} = {}) {
  if (typeof repositoryRoot !== 'string' || repositoryRoot.length === 0) {
    throw new TypeError('Cursor Adapter requires repositoryRoot');
  }
  if (timeoutMs !== null
    && (!Number.isInteger(timeoutMs) || timeoutMs <= 0)) {
    throw new TypeError('Cursor Adapter timeoutMs must be null or a positive integer');
  }
  if (typeof sdkLoader !== 'function' || typeof removeTemporary !== 'function') {
    throw new TypeError(
      'Cursor Adapter sdkLoader and removeTemporary must be functions',
    );
  }

  return defineProductionAdapter({
    name: 'cursor-local',
    execute(invocation, context) {
      return executeCursor({
        invocation,
        context,
        repositoryRoot,
        sdk,
        sdkLoader,
        apiKey,
        temporaryRoot,
        removeTemporary,
        onRunStarted,
        timeoutMs,
      });
    },
  });
}

module.exports = {
  createCursorAdapter,
};
