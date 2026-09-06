'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const {
  createCursorCliWorkspaceAdapter,
  recognizedReviewLoads,
} = require('../adapters/cursor-cli-workspace');
const {
  fingerprintValue,
} = require('../evaluation');
const {
  modelSelectionsEqual,
} = require('../model-selection');
const {
  BlueprintContractError,
  validateImplementationBlueprint,
} = require('./blueprint');
const {
  gradeOutcomePair,
} = require('./implementation-outcome-grading');
const {
  implementationPrompt,
  judgePrompt,
  parseJudgeOutput,
  planningPrompt,
  planningRuntimeText,
} = require('./implementation-outcome-live');
const {
  createTrustedVerifier,
} = require('./trusted-verification');

const MIN_PLANNING_SUBAGENT_CALLS = 9;
const MIN_IMPLEMENTATION_SUBAGENT_CALLS = 2;
const REQUIRED_IMPLEMENTATION_REVIEW_LOADS = 1;

class LocalOutcomeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LocalOutcomeError';
  }
}

function git(workspace, args, allowFailure = false) {
  const result = spawnSync('git', args, { cwd: workspace, encoding: 'utf8' });
  if (!allowFailure && (result.error || result.status !== 0)) {
    throw new LocalOutcomeError(
      `git ${args[0]} failed: ${String(result.stderr || result.error?.message)
        .trim().slice(0, 256)}`,
    );
  }
  return result;
}

function copyRuntime(catalog, target) {
  for (const file of catalog.runtime.files) {
    const relative = file.path
      .replace(/^skills\//, '')
      .replace(/definition\.md$/, 'SKILL.md');
    const destination = path.join(target, '.cursor', 'skills', relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(file.absolute, destination);
  }
}

function materializeLocalOutcomeRepository({ catalog, target }) {
  const absolute = path.resolve(target);
  if (fs.existsSync(absolute) && fs.readdirSync(absolute).length > 0) {
    throw new LocalOutcomeError('local fixture repository must be absent or empty');
  }
  fs.mkdirSync(absolute, { recursive: true });
  copyRuntime(catalog, absolute);
  for (const holdoutCase of catalog.cases) {
    fs.cpSync(
      holdoutCase.fixturePath,
      path.join(absolute, 'cases', holdoutCase.id),
      { recursive: true },
    );
    const docs = path.join(absolute, 'docs', 'cases', holdoutCase.id);
    fs.mkdirSync(path.join(docs, 'tickets'), { recursive: true });
    fs.writeFileSync(path.join(docs, 'feature.md'), holdoutCase.feature.content);
    for (const ticket of holdoutCase.tickets) {
      fs.writeFileSync(
        path.join(docs, 'tickets', `${ticket.id}.md`),
        ticket.content,
      );
    }
  }
  fs.writeFileSync(path.join(absolute, 'AGENTS.md'), [
    '# Synthetic outcome fixtures',
    '',
    'Change only the case directory named by the active ticket.',
    'Treat its feature and ticket documents as controlling requirements.',
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(absolute, '.gitignore'), '.DS_Store\n');
  git(absolute, ['init', '-b', 'master']);
  git(absolute, ['config', 'user.name', 'Outcome Fixture']);
  git(absolute, ['config', 'user.email', 'outcome@example.invalid']);
  git(absolute, ['add', '.']);
  git(absolute, ['commit', '-m', 'chore: initialize outcome fixtures']);
  return Object.freeze({
    repository: fs.realpathSync(absolute),
    repositoryUrl: `file://${fs.realpathSync(absolute)}`,
    baseRevision: git(absolute, ['rev-parse', 'HEAD']).stdout.trim(),
    branch: 'master',
    catalogFingerprint: catalog.fingerprint,
  });
}

function localRepositoryPath(repositoryUrl) {
  if (typeof repositoryUrl !== 'string' || !repositoryUrl.startsWith('file://')) {
    throw new LocalOutcomeError('local outcome plan requires a file:// repository');
  }
  return fs.realpathSync(repositoryUrl.slice('file://'.length));
}

function branchIdentity(pair, arm, suffix = 'feature') {
  return `eval/${fingerprintValue({
    pair: pair.fingerprint,
    arm,
    suffix,
  }).slice(0, 20)}`;
}

function featureWorkspace(workspaceRoot, pair, arm) {
  return path.join(
    workspaceRoot,
    pair.fingerprint,
    arm,
    'feature',
  );
}

function ensureFeatureWorkspace({
  workspaceRoot,
  pair,
  arm,
  repository,
  baseRevision,
}) {
  const workspace = featureWorkspace(workspaceRoot, pair, arm);
  const branch = branchIdentity(pair, arm);
  if (!fs.existsSync(workspace)) {
    fs.mkdirSync(path.dirname(workspace), { recursive: true });
    git(path.dirname(workspace), ['clone', repository, workspace]);
    git(workspace, ['checkout', '-b', branch, baseRevision]);
    git(workspace, ['config', 'user.name', 'Outcome Evaluator']);
    git(workspace, ['config', 'user.email', 'outcome@example.invalid']);
  }
  const current = git(workspace, ['branch', '--show-current']).stdout.trim();
  if (current !== branch) {
    throw new LocalOutcomeError('feature workspace branch identity drifted');
  }
  return { workspace, branch };
}

function ticketWorkspace(feature, pair, arm, ticketId) {
  const workspace = path.join(
    path.dirname(feature.workspace),
    'tickets',
    ticketId,
  );
  const branch = branchIdentity(pair, arm, ticketId);
  if (!fs.existsSync(workspace)) {
    fs.mkdirSync(path.dirname(workspace), { recursive: true });
    git(feature.workspace, [
      'worktree',
      'add',
      '-b',
      branch,
      workspace,
      feature.branch,
    ]);
  }
  return { workspace, branch };
}

function temporaryReadWorkspace(feature, name) {
  const workspace = path.join(path.dirname(feature.workspace), name);
  if (fs.existsSync(workspace)) {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
  git(path.dirname(workspace), [
    'clone',
    '--branch',
    feature.branch,
    '--single-branch',
    feature.workspace,
    workspace,
  ]);
  return workspace;
}

function writeArtifact(root, pair, arm, stage, ticketId, value) {
  const canonical = stageEvidencePath(pair, arm, stage, ticketId);
  const canonicalTarget = path.join(root, canonical);
  let relative = canonical;
  if (fs.existsSync(canonicalTarget)) {
    const retained = JSON.parse(fs.readFileSync(canonicalTarget, 'utf8'));
    if (retained.status === 'succeeded' && value.status === 'failed') {
      const parsed = path.parse(canonical);
      relative = path.join(
        parsed.dir,
        `${parsed.name}.failed-${fingerprintValue(value).slice(0, 12)}${parsed.ext}`,
      );
    }
  }
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  });
  return `artifact://${relative.split(path.sep).join('/')}`;
}

function stageEvidencePath(pair, arm, stage, ticketId) {
  return path.join(
    'run',
    'stage-evidence',
    pair.fingerprint,
    arm,
    `${stage}-${ticketId || 'feature'}.json`,
  );
}

function completedStage(currentIndex, arm, stage, ticketId = null) {
  const checkpoint = currentIndex.checkpoints.find((candidate) => (
    candidate.arm === arm
    && candidate.stage === stage
    && candidate.ticketId === ticketId
  ));
  if (!checkpoint) {
    throw new LocalOutcomeError(
      `missing ${arm}/${stage}/${ticketId || 'feature'} checkpoint`,
    );
  }
  return checkpoint;
}

function checkpointArtifact(
  artifactDirectory,
  currentIndex,
  arm,
  stage,
  ticketId = null,
) {
  const pointer = completedStage(
    currentIndex,
    arm,
    stage,
    ticketId,
  ).evidencePointer;
  return JSON.parse(fs.readFileSync(path.join(
    artifactDirectory,
    ...pointer.slice('artifact://'.length).split('/'),
  ), 'utf8'));
}

function stageResult(input, pointer, value, disposition = 'executed') {
  return {
    disposition,
    inputFingerprint: fingerprintValue(input),
    outputFingerprint: fingerprintValue(value),
    evidencePointer: pointer,
  };
}

function recordStageResult({
  artifactDirectory,
  pair,
  arm,
  stage,
  ticketId,
  input,
  value,
  disposition = 'executed',
}) {
  const pointer = writeArtifact(
    artifactDirectory,
    pair,
    arm,
    stage,
    ticketId,
    value,
  );
  return stageResult(input, pointer, value, disposition);
}

function ticketStageArtifacts({
  artifactDirectory,
  currentIndex,
  arm,
  stage,
  ticketIds,
}) {
  return ticketIds.map((ticketId) => checkpointArtifact(
    artifactDirectory,
    currentIndex,
    arm,
    stage,
    ticketId,
  ));
}

function ticketRunEvidence(ticketIds, implementations, reviews) {
  return ticketIds.map((id, index) => ({
    id,
    reviewLoads: reviews[index].reviewLoads,
    subagentCalls: implementations[index].subagentCalls,
    correctionCount: reviews[index].correctionCount,
    clarifications: 0,
    costUsd: implementations[index].costUsd || 0,
    durationMs: implementations[index].durationMs || 0,
  }));
}

function hasRequiredImplementationReview(result) {
  return result.subagentCalls >= MIN_IMPLEMENTATION_SUBAGENT_CALLS
    && result.reviewLoads === REQUIRED_IMPLEMENTATION_REVIEW_LOADS;
}

function hasCurrentBlueprint(output, implementationBase) {
  try {
    const blueprint = validateImplementationBlueprint(output);
    return blueprint.implementationBase === implementationBase;
  } catch (error) {
    if (error instanceof BlueprintContractError) return false;
    throw error;
  }
}

function reusablePlanning({
  artifactDirectory,
  pair,
  ticketId,
  implementationBase,
  model,
  runtimeFingerprint,
}) {
  const file = path.join(
    artifactDirectory,
    stageEvidencePath(pair, 'treatment', 'planning', ticketId),
  );
  if (!fs.existsSync(file)) return null;
  const result = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (result.status !== 'succeeded'
    || result.runtimeFingerprint !== runtimeFingerprint
    || result.subagentCalls < MIN_PLANNING_SUBAGENT_CALLS
    || result.git?.baseRevision !== implementationBase
    || result.git?.headRevision !== implementationBase
    || result.git?.status !== ''
    || !modelSelectionsEqual(result.model, model)
    || !hasCurrentBlueprint(result.output, implementationBase)) {
    return null;
  }
  return result;
}

function validatePlanningAttempt(result) {
  if (result.status !== 'succeeded') {
    throw new LocalOutcomeError(`planning failed: ${result.failure?.message}`);
  }
  if (result.subagentCalls < MIN_PLANNING_SUBAGENT_CALLS) {
    throw new LocalOutcomeError(
      'planning did not run every required independent investigation and review',
    );
  }
  validateImplementationBlueprint(result.output);
}

function failedPlanningEvidence(value, error) {
  if (value.status === 'failed') return value;
  return {
    ...value,
    status: 'failed',
    failure: {
      stage: 'validation',
      message: String(error.message).slice(0, 256),
    },
  };
}

function recognizeImplementationReview(result) {
  const reviewLoads = recognizedReviewLoads(result);
  return reviewLoads === result.reviewLoads
    ? result
    : { ...result, reviewLoads };
}

function reusableImplementation({
  artifactDirectory,
  pair,
  arm,
  ticketId,
  workspace,
}) {
  const file = path.join(
    artifactDirectory,
    stageEvidencePath(pair, arm, 'implementation', ticketId),
  );
  if (!fs.existsSync(file)) return null;
  const result = recognizeImplementationReview(
    JSON.parse(fs.readFileSync(file, 'utf8')),
  );
  const headRevision = git(
    workspace.workspace,
    ['rev-parse', 'HEAD'],
  ).stdout.trim();
  if (result.status !== 'succeeded'
    || result.branch !== workspace.branch
    || result.git?.headRevision !== headRevision
    || !hasRequiredImplementationReview(result)) {
    return null;
  }
  return result;
}

async function verifyWorkspace(feature, holdoutCase, verifier, commands) {
  return verifier.verify({
    workspace: path.join(feature.workspace, 'cases', holdoutCase.id),
    hiddenTests: path.dirname(holdoutCase.hiddenTestsPath),
    commands,
  });
}

function localChangedPaths(feature, baseRevision, caseId) {
  const output = git(feature.workspace, [
    'diff',
    '--name-only',
    `${baseRevision}...HEAD`,
  ]).stdout.trim();
  const prefix = `cases/${caseId}/`;
  return output ? output.split('\n').map((file) => (
    file.startsWith(prefix) ? file.slice(prefix.length) : file
  )) : [];
}

function createLocalOutcomeStageExecutor({
  repositoryRoot,
  apiKey = process.env.CURSOR_API_KEY,
  workspaceAdapter = createCursorCliWorkspaceAdapter({ apiKey }),
  verifier = createTrustedVerifier(),
} = {}) {
  const runtime = planningRuntimeText(repositoryRoot);
  return async function executeLocalStage(context) {
    const {
      coordinates,
      currentIndex,
      pair,
      plan,
      holdoutCase,
      runtimeFingerprint,
      artifactDirectory,
    } = context;
    const {
      arm,
      stage,
      ticketId,
    } = coordinates;
    const caseDefinition = plan.cases.find(({ id }) => id === pair.caseId);
    const repository = localRepositoryPath(caseDefinition.repositoryUrl);
    const workspaceRoot = path.join(
      path.dirname(repository),
      'outcome-workspaces',
    );
    const feature = ['baseline', 'treatment'].includes(arm)
      ? ensureFeatureWorkspace({
        workspaceRoot,
        pair,
        arm,
        repository,
        baseRevision: caseDefinition.baseRevision,
      })
      : null;
    const ticket = ticketId
      ? holdoutCase.tickets.find(({ id }) => id === ticketId)
      : null;
    const input = {
      pair: pair.fingerprint,
      arm,
      stage,
      ticketId,
      sourceDigest: holdoutCase.sourceDigest,
    };

    if (stage === 'ticketing') {
      const value = {
        feature: holdoutCase.feature,
        tickets: holdoutCase.tickets,
        runtimeFingerprint,
      };
      return recordStageResult({
        artifactDirectory,
        pair,
        arm,
        stage,
        ticketId,
        input,
        value,
      });
    }

    if (stage === 'planning') {
      if (arm === 'baseline') {
        const value = { status: 'not-required', ticketId };
        return recordStageResult({
          artifactDirectory,
          pair,
          arm,
          stage,
          ticketId,
          input,
          value,
          disposition: 'not-required',
        });
      }
      const implementationBase = git(
        feature.workspace,
        ['rev-parse', 'HEAD'],
      ).stdout.trim();
      const reusable = reusablePlanning({
        artifactDirectory,
        pair,
        ticketId,
        implementationBase,
        model: plan.models.planner,
        runtimeFingerprint: runtime.fingerprint,
      });
      if (reusable) {
        return recordStageResult({
          artifactDirectory,
          pair,
          arm,
          stage,
          ticketId,
          input,
          value: reusable,
        });
      }
      const planningWorkspace = temporaryReadWorkspace(
        feature,
        `planning-${ticketId}`,
      );
      try {
        const result = await workspaceAdapter.execute({
          workspace: planningWorkspace,
          prompt: planningPrompt({
            holdoutCase,
            ticket,
            implementationBase,
            runtime,
          }),
          model: plan.models.planner,
          requireCommit: false,
          mode: 'agent',
        });
        const value = { ...result, runtimeFingerprint: runtime.fingerprint };
        try {
          validatePlanningAttempt(result);
        } catch (error) {
          recordStageResult({
            artifactDirectory,
            pair,
            arm,
            stage,
            ticketId,
            input,
            value: failedPlanningEvidence(value, error),
          });
          throw error;
        }
        return recordStageResult({
          artifactDirectory,
          pair,
          arm,
          stage,
          ticketId,
          input,
          value,
        });
      } finally {
        fs.rmSync(planningWorkspace, { recursive: true, force: true });
      }
    }

    if (stage === 'implementation') {
      const planning = checkpointArtifact(
        artifactDirectory,
        currentIndex,
        arm,
        'planning',
        ticketId,
      );
      const workspace = ticketWorkspace(feature, pair, arm, ticketId);
      const reusable = reusableImplementation({
        artifactDirectory,
        pair,
        arm,
        ticketId,
        workspace,
      });
      if (reusable) {
        return recordStageResult({
          artifactDirectory,
          pair,
          arm,
          stage,
          ticketId,
          input,
          value: reusable,
        });
      }
      const result = recognizeImplementationReview(
        await workspaceAdapter.execute({
          workspace: workspace.workspace,
          prompt: implementationPrompt({
            holdoutCase,
            ticket,
            blueprint: arm === 'treatment' ? planning.output : null,
          }),
          model: plan.models.implementer,
          requireCommit: true,
          mode: 'agent',
        }),
      );
      const value = { ...result, branch: workspace.branch };
      const recorded = recordStageResult({
        artifactDirectory,
        pair,
        arm,
        stage,
        ticketId,
        input,
        value,
      });
      if (result.status !== 'succeeded') {
        throw new LocalOutcomeError(
          `implementation failed: ${result.failure?.message}`,
        );
      }
      if (!hasRequiredImplementationReview(result)) {
        throw new LocalOutcomeError(
          'implementation did not run the required parallel code review',
        );
      }
      return recorded;
    }

    if (stage === 'review-correction') {
      const implementation = checkpointArtifact(
        artifactDirectory,
        currentIndex,
        arm,
        'implementation',
        ticketId,
      );
      if (implementation.reviewLoads > 1) {
        throw new LocalOutcomeError('implementation exceeded one code review');
      }
      const value = {
        reviewLoads: implementation.reviewLoads,
        correctionCount: implementation.reviewLoads === 0 ? 0 : 1,
      };
      return recordStageResult({
        artifactDirectory,
        pair,
        arm,
        stage,
        ticketId,
        input,
        value,
      });
    }

    if (stage === 'merge') {
      const implementation = checkpointArtifact(
        artifactDirectory,
        currentIndex,
        arm,
        'implementation',
        ticketId,
      );
      const merge = git(feature.workspace, [
        'merge',
        '--no-ff',
        implementation.branch,
        '-m',
        `merge: ${ticketId}`,
      ], true);
      const conflict = merge.status !== 0;
      if (conflict) git(feature.workspace, ['merge', '--abort'], true);
      const verification = conflict
        ? { passed: false, results: [] }
        : await verifyWorkspace(
          feature,
          holdoutCase,
          verifier,
          [holdoutCase.oracle.commands[0]],
        );
      const value = {
        ticketId,
        branch: implementation.branch,
        headRevision: git(
          feature.workspace,
          ['rev-parse', 'HEAD'],
        ).stdout.trim(),
        conflict,
        verificationPassed: verification.passed,
        verification,
      };
      const recorded = recordStageResult({
        artifactDirectory,
        pair,
        arm,
        stage,
        ticketId,
        input,
        value,
      });
      if (conflict || !verification.passed) {
        throw new LocalOutcomeError(
          conflict ? 'ticket merge conflicted' : 'feature regressed after merge',
        );
      }
      return recorded;
    }

    if (stage === 'verification') {
      const trustedVerification = await verifyWorkspace(
        feature,
        holdoutCase,
        verifier,
        holdoutCase.oracle.commands,
      );
      const judgeWorkspace = temporaryReadWorkspace(feature, 'blind-judge');
      let judge;
      try {
        judge = await workspaceAdapter.execute({
          workspace: judgeWorkspace,
          prompt: judgePrompt(holdoutCase, caseDefinition.baseRevision),
          model: plan.models.judge,
          requireCommit: false,
          mode: 'agent',
        });
      } finally {
        fs.rmSync(judgeWorkspace, { recursive: true, force: true });
      }
      if (judge.status !== 'succeeded') {
        throw new LocalOutcomeError(`blind judge failed: ${judge.failure?.message}`);
      }
      const ticketIds = holdoutCase.oracle.expected_tickets;
      function stageArtifacts(ticketStage) {
        return ticketStageArtifacts({
          artifactDirectory,
          currentIndex,
          arm,
          stage: ticketStage,
          ticketIds,
        });
      }
      const tickets = ticketRunEvidence(
        ticketIds,
        stageArtifacts('implementation'),
        stageArtifacts('review-correction'),
      );
      const value = {
        arm,
        inputIdentity: {
          baseRevision: caseDefinition.baseRevision,
          sourceDigest: holdoutCase.sourceDigest,
          ticketDigests: holdoutCase.tickets.map(({ digest }) => digest),
        },
        blueprint: arm === 'treatment'
          ? stageArtifacts('planning').map(({ output }) => output)
          : null,
        tickets,
        feature: {
          baseRevision: caseDefinition.baseRevision,
          headRevision: git(
            feature.workspace,
            ['rev-parse', 'HEAD'],
          ).stdout.trim(),
          changedPaths: localChangedPaths(
            feature,
            caseDefinition.baseRevision,
            holdoutCase.id,
          ),
          merges: stageArtifacts('merge'),
        },
        trustedVerification,
        requirementCoverage: holdoutCase.oracle.requirements.map(
          (requirement) => ({
            requirement,
            passed: trustedVerification.passed,
            evidence: 'trusted hidden-test command',
          }),
        ),
        mutationChecks: [],
        finalReview: {
          ...parseJudgeOutput(judge.output),
          feedbackExposed: false,
          model: judge.model,
          costUsd: judge.costUsd,
        },
      };
      return recordStageResult({
        artifactDirectory,
        pair,
        arm,
        stage,
        ticketId,
        input,
        value,
      });
    }

    if (stage === 'grading') {
      const baseline = checkpointArtifact(
        artifactDirectory,
        currentIndex,
        'baseline',
        'verification',
      );
      const treatment = checkpointArtifact(
        artifactDirectory,
        currentIndex,
        'treatment',
        'verification',
      );
      const grade = gradeOutcomePair({
        pairFingerprint: pair.fingerprint,
        oracle: holdoutCase.oracle,
        baseline,
        treatment,
      });
      return recordStageResult({
        artifactDirectory,
        pair,
        arm,
        stage,
        ticketId,
        input,
        value: grade,
      });
    }

    throw new LocalOutcomeError(`unsupported local stage "${stage}"`);
  };
}

module.exports = {
  LocalOutcomeError,
  createLocalOutcomeStageExecutor,
  materializeLocalOutcomeRepository,
};
