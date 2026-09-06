'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  createCursorCloudAdapter,
} = require('../adapters/cursor-cloud');
const {
  fingerprintValue,
} = require('../evaluation');
const {
  compileRuntimePackage,
} = require('./holdouts');
const {
  validateImplementationBlueprint,
} = require('./blueprint');
const {
  gradeOutcomePair,
} = require('./implementation-outcome-grading');
const {
  createTrustedVerifier,
} = require('./trusted-verification');

class LiveOutcomeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LiveOutcomeError';
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    ...options,
  });
  if (result.error || result.status !== 0) {
    throw new LiveOutcomeError(
      `${command} failed: ${String(result.stderr || result.error?.message)
        .trim().slice(0, 256)}`,
    );
  }
  return result.stdout.trim();
}

function repositoryCoordinates(repositoryUrl) {
  const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/
    .exec(repositoryUrl);
  if (!match) throw new LiveOutcomeError('repository URL is invalid');
  return { owner: match[1], repository: match[2] };
}

function branchName(pair, arm) {
  return `eval/outcome-${fingerprintValue({
    pair: pair.fingerprint,
    arm,
  }).slice(0, 16)}`;
}

function branchHead(repositoryUrl, branch) {
  const { owner, repository } = repositoryCoordinates(repositoryUrl);
  const value = JSON.parse(run('gh', [
    'api',
    `repos/${owner}/${repository}/commits/${encodeURIComponent(branch)}`,
  ]));
  return value.sha;
}

function ensureBranch(repositoryUrl, branch, baseRevision) {
  const { owner, repository } = repositoryCoordinates(repositoryUrl);
  try {
    return branchHead(repositoryUrl, branch);
  } catch {
    run('gh', [
      'api',
      '--method',
      'POST',
      `repos/${owner}/${repository}/git/refs`,
      '-f',
      `ref=refs/heads/${branch}`,
      '-f',
      `sha=${baseRevision}`,
    ]);
    return branchHead(repositoryUrl, branch);
  }
}

function mergePullRequest(prUrl, expectedBase) {
  const details = JSON.parse(run('gh', [
    'pr',
    'view',
    prUrl,
    '--json',
    'baseRefName,headRefName,headRefOid,state',
  ]));
  if (details.baseRefName !== expectedBase || details.state !== 'OPEN') {
    throw new LiveOutcomeError(
      `pull request does not target expected feature branch "${expectedBase}"`,
    );
  }
  run('gh', ['pr', 'merge', prUrl, '--merge', '--delete-branch']);
  return details;
}

function changedPaths(repositoryUrl, baseRevision, headRevision) {
  const { owner, repository } = repositoryCoordinates(repositoryUrl);
  const value = JSON.parse(run('gh', [
    'api',
    `repos/${owner}/${repository}/compare/${baseRevision}...${headRevision}`,
  ]));
  return value.files.map(({ filename }) => filename);
}

function artifactFile(artifactDirectory, relativePath, escapeMessage) {
  const target = path.resolve(artifactDirectory, relativePath);
  const relative = path.relative(artifactDirectory, target);
  if (relative === '..'
    || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)) {
    throw new LiveOutcomeError(escapeMessage);
  }
  return { target, relative };
}

function writeArtifact(artifactDirectory, relativePath, value) {
  const { target, relative } = artifactFile(
    artifactDirectory,
    relativePath,
    'live artifact path escapes artifact directory',
  );
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  });
  return `artifact://${relative.split(path.sep).join('/')}`;
}

function readArtifact(artifactDirectory, pointer) {
  if (typeof pointer !== 'string' || !pointer.startsWith('artifact://')) {
    throw new LiveOutcomeError('live artifact pointer is invalid');
  }
  const relativePath = path.join(
    artifactDirectory,
    ...pointer.slice('artifact://'.length).split('/'),
  );
  const { target } = artifactFile(
    artifactDirectory,
    relativePath,
    'live artifact pointer escapes artifact directory',
  );
  return JSON.parse(fs.readFileSync(target, 'utf8'));
}

function stagePointer(pair, arm, stage, ticketId = 'feature') {
  return path.join(
    'run',
    'stage-evidence',
    pair.fingerprint,
    arm,
    `${stage}-${ticketId}.json`,
  );
}

function completedStage(currentIndex, arm, stage, ticketId = null) {
  return currentIndex.checkpoints.find((checkpoint) => (
    checkpoint.arm === arm
    && checkpoint.stage === stage
    && checkpoint.ticketId === ticketId
  ));
}

function resultForArtifact(input, pointer, value, disposition = 'executed') {
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
  ticketId = 'feature',
  input,
  value,
  disposition = 'executed',
}) {
  const pointer = writeArtifact(
    artifactDirectory,
    stagePointer(pair, arm, stage, ticketId),
    value,
  );
  return resultForArtifact(input, pointer, value, disposition);
}

function planningRuntimeText(repositoryRoot) {
  const runtime = compileRuntimePackage(
    repositoryRoot,
    'implementation-planning',
  );
  const bodies = runtime.entries.map((entry) => {
    const source = path.join(
      repositoryRoot,
      'skills',
      entry.skill,
      ...entry.path.split('/'),
    );
    return [
      `===== ${entry.skill}/${entry.path} =====`,
      fs.readFileSync(source, 'utf8'),
    ].join('\n');
  });
  return {
    fingerprint: runtime.fingerprint,
    text: bodies.join('\n\n'),
  };
}

function planningPrompt({ holdoutCase, ticket, implementationBase, runtime }) {
  return [
    'Follow the complete implementation-planning Skill package below.',
    'Produce the canonical marked blueprint in your final response.',
    'Do not edit or commit repository files.',
    `The immutable implementation base is ${implementationBase}.`,
    `The target code is under cases/${holdoutCase.id}.`,
    '',
    'FEATURE REQUIREMENTS',
    holdoutCase.feature.content,
    '',
    'IMPLEMENTATION TICKET',
    ticket.content,
    '',
    'SKILL PACKAGE',
    runtime.text,
  ].join('\n');
}

function implementationPrompt({ holdoutCase, ticket, blueprint }) {
  return [
    '/implement',
    '',
    `Work only under cases/${holdoutCase.id}.`,
    'Implement exactly one supplied ticket using the pinned upstream workflow.',
    'Use /tdd at the planned seams, invoke /code-review at most once, correct',
    'credible findings in this same session, and commit the completed ticket.',
    '',
    'FEATURE REQUIREMENTS',
    holdoutCase.feature.content,
    '',
    'TICKET',
    ticket.content,
    ...(blueprint
      ? ['', 'IMPLEMENTATION BLUEPRINT', blueprint]
      : []),
  ].join('\n');
}

function firstJsonObject(source) {
  for (let start = source.indexOf('{'); start !== -1;
    start = source.indexOf('{', start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < source.length; index += 1) {
      const character = source[index];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (character === '\\') {
          escaped = true;
        } else if (character === '"') {
          inString = false;
        }
        continue;
      }
      if (character === '"') {
        inString = true;
      } else if (character === '{') {
        depth += 1;
      } else if (character === '}') {
        depth -= 1;
        if (depth === 0) {
          try {
            return JSON.parse(source.slice(start, index + 1));
          } catch {
            break;
          }
        }
      }
    }
  }
  throw new LiveOutcomeError('blind judge did not return JSON');
}

function parseJudgeOutput(output) {
  const source = String(output || '').replace(/^```(?:json)?|```$/gm, '').trim();
  const value = firstJsonObject(source);
  if (!Array.isArray(value.findings)
    || !value.dimensions
    || typeof value.dimensions !== 'object') {
    throw new LiveOutcomeError('blind judge JSON contract is invalid');
  }
  for (const finding of value.findings) {
    if (typeof finding.id !== 'string'
      || !['blocker', 'major', 'minor', 'note'].includes(finding.severity)
      || typeof finding.evidence !== 'string') {
      throw new LiveOutcomeError('blind judge finding contract is invalid');
    }
  }
  return value;
}

function judgePrompt(holdoutCase, baseRevision) {
  return [
    'Act as a blind evaluator. Do not change code or provide remediation.',
    `Review git diff ${baseRevision}...HEAD under cases/${holdoutCase.id}.`,
    'Assess the complete feature requirements below. Return only JSON:',
    '{"findings":[{"id":"F1","severity":"blocker|major|minor|note",',
    '"evidence":"specific file/line and consequence"}],"dimensions":{',
    '"requirement_fidelity":0,"architecture":0,"maintainability":0,',
    '"test_quality":0,"scope_discipline":0,"cross_ticket_coherence":0}}',
    'Every dimension is an integer from 0 to 2.',
    '',
    holdoutCase.feature.content,
  ].join('\n');
}

function checkpointArtifact({
  currentIndex,
  artifactDirectory,
  arm,
  stage,
  ticketId = null,
}) {
  const checkpoint = completedStage(currentIndex, arm, stage, ticketId);
  if (!checkpoint) {
    throw new LiveOutcomeError(
      `missing ${arm}/${stage}/${ticketId || 'feature'} checkpoint`,
    );
  }
  return readArtifact(artifactDirectory, checkpoint.evidencePointer);
}

function ticketStageArtifacts({
  currentIndex,
  artifactDirectory,
  arm,
  stage,
  ticketIds,
}) {
  return ticketIds.map((ticketId) => checkpointArtifact({
    currentIndex,
    artifactDirectory,
    arm,
    stage,
    ticketId,
  }));
}

function ticketRunEvidence(ticketIds, implementations, reviews) {
  return ticketIds.map((id, index) => ({
    id,
    reviewLoads: reviews[index].reviewLoads,
    correctionCount: reviews[index].correctionCount,
    clarifications: 0,
    costUsd: implementations[index].costUsd || 0,
    durationMs: implementations[index].durationMs || 0,
  }));
}

function cloneFeature(repositoryUrl, featureBranch) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'outcome-feature-'));
  const checkout = path.join(root, 'repository');
  run('gh', [
    'repo',
    'clone',
    repositoryUrl,
    checkout,
    '--',
    '--branch',
    featureBranch,
    '--single-branch',
    '--depth',
    '1',
  ]);
  return { root, checkout };
}

async function verifyFeature({
  repositoryUrl,
  featureBranch,
  holdoutCase,
  verifier,
  commands,
}) {
  const clone = cloneFeature(repositoryUrl, featureBranch);
  try {
    return await verifier.verify({
      workspace: path.join(clone.checkout, 'cases', holdoutCase.id),
      hiddenTests: path.dirname(holdoutCase.hiddenTestsPath),
      commands,
    });
  } finally {
    fs.rmSync(clone.root, { recursive: true, force: true });
  }
}

function normalizeChangedPaths(paths, caseId) {
  const prefix = `cases/${caseId}/`;
  return paths.map((changedPath) => (
    changedPath.startsWith(prefix)
      ? changedPath.slice(prefix.length)
      : changedPath
  ));
}

function createLiveOutcomeStageExecutor({
  repositoryRoot,
  apiKey = process.env.CURSOR_API_KEY,
  cloudAdapter = createCursorCloudAdapter({ apiKey }),
  verifier = createTrustedVerifier(),
} = {}) {
  const planningRuntime = planningRuntimeText(repositoryRoot);
  return async function executeLiveStage(context) {
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
    const repositoryUrl = caseDefinition.repositoryUrl;
    const featureBranch = ['baseline', 'treatment'].includes(arm)
      ? branchName(pair, arm)
      : null;
    const ticket = ticketId
      ? holdoutCase.tickets.find(({ id }) => id === ticketId)
      : null;
    const input = {
      pair: pair.fingerprint,
      arm,
      stage,
      ticketId,
      source: holdoutCase.sourceDigest,
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
        input,
        value,
      });
    }

    if (stage === 'planning') {
      ensureBranch(repositoryUrl, featureBranch, caseDefinition.baseRevision);
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
      const result = await cloudAdapter.execute({
        prompt: planningPrompt({
          holdoutCase,
          ticket,
          implementationBase: branchHead(repositoryUrl, featureBranch),
          runtime: planningRuntime,
        }),
        model: plan.models.planner,
        repositoryUrl,
        startingRef: featureBranch,
        autoCreatePR: false,
        requireGitEvidence: false,
        mode: 'agent',
        metadata: {
          campaign: plan.fingerprint.slice(0, 16),
          case_id: holdoutCase.id,
          stage: 'planning',
        },
      });
      const value = { ...result, runtimeFingerprint: planningRuntime.fingerprint };
      const stageResult = recordStageResult({
        artifactDirectory,
        pair,
        arm,
        stage,
        ticketId,
        input,
        value,
      });
      if (result.status !== 'succeeded') {
        throw new LiveOutcomeError(`planning failed: ${result.failure?.message}`);
      }
      validateImplementationBlueprint(result.output);
      return stageResult;
    }

    if (stage === 'implementation') {
      const planning = checkpointArtifact({
        currentIndex,
        artifactDirectory,
        arm,
        stage: 'planning',
        ticketId,
      });
      const result = await cloudAdapter.execute({
        prompt: implementationPrompt({
          holdoutCase,
          ticket,
          blueprint: arm === 'treatment' ? planning.output : null,
        }),
        model: plan.models.implementer,
        repositoryUrl,
        startingRef: featureBranch,
        autoCreatePR: true,
        metadata: {
          campaign: plan.fingerprint.slice(0, 16),
          case_id: holdoutCase.id,
          ticket_id: ticketId,
          stage: 'implementation',
        },
      });
      const stageResult = recordStageResult({
        artifactDirectory,
        pair,
        arm,
        stage,
        ticketId,
        input,
        value: result,
      });
      if (result.status !== 'succeeded') {
        throw new LiveOutcomeError(
          `implementation failed: ${result.failure?.message}`,
        );
      }
      return stageResult;
    }

    if (stage === 'review-correction') {
      const implementation = checkpointArtifact({
        currentIndex,
        artifactDirectory,
        arm,
        stage: 'implementation',
        ticketId,
      });
      if (implementation.reviewLoads > 1) {
        throw new LiveOutcomeError('implementation exceeded one code review');
      }
      const value = {
        reviewLoads: implementation.reviewLoads,
        correctionCount: implementation.reviewLoads === 0 ? 0 : 1,
        implementation: completedStage(
          currentIndex,
          arm,
          'implementation',
          ticketId,
        ).evidencePointer,
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
      const implementation = checkpointArtifact({
        currentIndex,
        artifactDirectory,
        arm,
        stage: 'implementation',
        ticketId,
      });
      if (!implementation.git?.prUrl) {
        throw new LiveOutcomeError('implementation did not create a pull request');
      }
      const pullRequest = mergePullRequest(
        implementation.git.prUrl,
        featureBranch,
      );
      const headRevision = branchHead(repositoryUrl, featureBranch);
      const verification = await verifyFeature({
        repositoryUrl,
        featureBranch,
        holdoutCase,
        verifier,
        commands: [holdoutCase.oracle.commands[0]],
      });
      const value = {
        ticketId,
        pullRequest,
        headRevision,
        conflict: false,
        verificationPassed: verification.passed,
        verification,
      };
      const stageResult = recordStageResult({
        artifactDirectory,
        pair,
        arm,
        stage,
        ticketId,
        input,
        value,
      });
      if (!verification.passed) {
        throw new LiveOutcomeError('feature branch regressed after merge');
      }
      return stageResult;
    }

    if (stage === 'verification') {
      const headRevision = branchHead(repositoryUrl, featureBranch);
      const trustedVerification = await verifyFeature({
        repositoryUrl,
        featureBranch,
        holdoutCase,
        verifier,
        commands: holdoutCase.oracle.commands,
      });
      const judge = await cloudAdapter.execute({
        prompt: judgePrompt(holdoutCase, caseDefinition.baseRevision),
        model: plan.models.judge,
        repositoryUrl,
        startingRef: featureBranch,
        autoCreatePR: false,
        requireGitEvidence: false,
        metadata: {
          campaign: plan.fingerprint.slice(0, 16),
          case_id: holdoutCase.id,
          stage: 'blind-grading',
        },
      });
      if (judge.status !== 'succeeded') {
        throw new LiveOutcomeError(`blind judge failed: ${judge.failure?.message}`);
      }
      const finalReview = {
        ...parseJudgeOutput(judge.output),
        feedbackExposed: false,
        model: judge.model,
        costUsd: judge.costUsd,
      };
      const rawChangedPaths = changedPaths(
        repositoryUrl,
        caseDefinition.baseRevision,
        headRevision,
      );
      const ticketIds = holdoutCase.oracle.expected_tickets;
      function stageArtifacts(ticketStage) {
        return ticketStageArtifacts({
          currentIndex,
          artifactDirectory,
          arm,
          stage: ticketStage,
          ticketIds,
        });
      }
      const merges = stageArtifacts('merge');
      const tickets = ticketRunEvidence(
        ticketIds,
        stageArtifacts('implementation'),
        stageArtifacts('review-correction'),
      );
      const planning = arm === 'treatment'
        ? stageArtifacts('planning').map(({ output }) => output)
        : null;
      const value = {
        arm,
        inputIdentity: {
          baseRevision: caseDefinition.baseRevision,
          sourceDigest: holdoutCase.sourceDigest,
          ticketDigests: holdoutCase.tickets.map(({ digest }) => digest),
        },
        blueprint: planning,
        tickets,
        feature: {
          baseRevision: caseDefinition.baseRevision,
          headRevision,
          changedPaths: normalizeChangedPaths(
            rawChangedPaths,
            holdoutCase.id,
          ),
          merges,
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
        finalReview,
      };
      return recordStageResult({
        artifactDirectory,
        pair,
        arm,
        stage,
        input,
        value,
      });
    }

    if (stage === 'grading') {
      const baseline = checkpointArtifact({
        currentIndex,
        artifactDirectory,
        arm: 'baseline',
        stage: 'verification',
      });
      const treatment = checkpointArtifact({
        currentIndex,
        artifactDirectory,
        arm: 'treatment',
        stage: 'verification',
      });
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
        input,
        value: grade,
      });
    }

    throw new LiveOutcomeError(`unsupported live stage "${stage}"`);
  };
}

module.exports = {
  LiveOutcomeError,
  branchName,
  createLiveOutcomeStageExecutor,
  implementationPrompt,
  judgePrompt,
  parseJudgeOutput,
  planningPrompt,
  planningRuntimeText,
};
