'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const {
  defineProductionAdapter,
  discoverCanonicalPackage,
  executeProduction,
} = require('../suite');
const {
  gradeTakeTicketResult,
  loadDefinitions,
  validateTakeTicketResult,
} = require('../skills/take-ticket/evals');
const {
  defineTestAdapter,
  executeTest,
} = require('../suite/testing');
const {
  createCodeReviewAdapter,
  createImplementAdapter,
} = require('./fixtures/take-ticket/dependency-adapters');
const {
  createOutcomeSandbox,
} = require('./fixtures/take-ticket/outcome-sandbox');

const repositoryRoot = path.resolve(__dirname, '..');
const skillRoot = path.join(repositoryRoot, 'skills', 'take-ticket');
const artifactAllowlist = new Map();
const PHASES = [
  'implementation',
  'full-review',
  'correction',
  'targeted-re-review',
];
const REQUIRED_SKILLS = [
  'agent-writing',
  'code-review',
  'engineering-guidance',
  'implement',
  'review-coordinator',
  'review-worker',
  'take-it-offline',
  'take-ticket',
  'writing-foundation',
];

function writeSkill(root, name, source = null) {
  const destination = path.join(root, 'skills', name, 'SKILL.md');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  if (source) {
    fs.copyFileSync(source, destination);
  } else {
    fs.writeFileSync(
      destination,
      `---\nname: ${name}\ndescription: Test fixture.\n---\n`,
    );
  }
}

function createPackageRoot(t, skillNames) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'take-ticket-package-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'suite'), { recursive: true });
  fs.copyFileSync(
    path.join(repositoryRoot, 'suite', 'canonical-suite.json'),
    path.join(root, 'suite', 'canonical-suite.json'),
  );
  for (const name of skillNames) {
    writeSkill(
      root,
      name,
      name === 'take-ticket' ? path.join(skillRoot, 'SKILL.md') : null,
    );
  }
  return root;
}

function invocation() {
  return {
    requestId: 'take-ticket-issue-43',
    skill: 'take-ticket',
    prompt: 'Carry issue 43 through the complete reviewed-ticket lifecycle.',
    model: 'test-model',
  };
}

function takeTicketDescription() {
  const source = fs.readFileSync(path.join(skillRoot, 'SKILL.md'), 'utf8');
  return source.match(/^description:\s*(.+)$/m)?.[1] || '';
}

function fixtureGit(root, arguments_) {
  const result = spawnSync('git', arguments_, {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function regionsForScope(scope) {
  return [...scope.regions, ...scope.materially_affected_regions];
}

function successfulResult({ acceptedFindings = [], ranges = null } = {}) {
  const needsCorrection = acceptedFindings.length > 0;
  const implementationRange = ranges?.implementation || {
    base: 'a'.repeat(40),
    head: 'b'.repeat(40),
  };
  const correctionRange = ranges?.correction || {
    base: implementationRange.head,
    head: 'c'.repeat(40),
  };
  const findingDispositions = acceptedFindings.map((id) => ({
    id,
    disposition: 'accepted',
    regions: [`region:${id}`],
  }));
  const correctionScopes = acceptedFindings.map((id) => ({
    finding_id: id,
    regions: [`region:${id}`],
    materially_affected_regions: [`material:${id}`],
  }));
  const targetedRegions = correctionScopes.flatMap(regionsForScope);
  const targetedDispositions = correctionScopes.flatMap((scope) => (
    regionsForScope(scope).map((region) => ({
      finding_id: scope.finding_id,
      region,
      outcome: 'accepted',
    }))
  ));
  const lifecycle = [
    {
      sequence: 1,
      phase: 'implementation',
      status: 'completed',
      reference: `${implementationRange.base}..${implementationRange.head}`,
    },
    {
      sequence: 2,
      phase: 'full-review',
      status: 'completed',
      reference: 'artifact://review/full.md',
    },
    {
      sequence: 3,
      phase: 'correction',
      status: needsCorrection ? 'completed' : 'not-required',
      reference: needsCorrection
        ? `${correctionRange.base}..${correctionRange.head}`
        : 'clean-review',
    },
    {
      sequence: 4,
      phase: 'targeted-re-review',
      status: needsCorrection ? 'completed' : 'not-required',
      reference: needsCorrection
        ? 'artifact://review/targeted.json'
        : 'clean-review',
    },
  ];
  const completedPhases = PHASES.slice(0, needsCorrection ? PHASES.length : 2);

  return {
    schema: 'take-ticket-result/v1',
    status: 'reviewed',
    requirements: {
      references: ['issue://43'],
      summary: 'Carry one settled ticket through independent review.',
    },
    implementation: {
      range: {
        ...implementationRange,
      },
      handoff: {
        reference: 'artifact://implement/handoff.json',
        mediaType: 'application/json',
        schema: 'implement-handoff/v2',
      },
      validation: [{
        command: 'node --test',
        outcome: 'passed',
        evidence: 'All focused implementation checks passed.',
      }],
    },
    full_review: {
      authority: {
        source: 'fresh-code-review',
        inherited: false,
        references: ['issue://43', 'artifact://implement/handoff.json'],
      },
      kind: 'full',
      outcome: needsCorrection ? 'findings' : 'clean',
      brief: {
        reference: 'artifact://review/full.md',
        mediaType: 'text/markdown',
      },
      finding_dispositions: findingDispositions,
    },
    correction: {
      state: needsCorrection ? 'completed' : 'not-required',
      range: needsCorrection
        ? { ...correctionRange }
        : null,
      scopes: correctionScopes,
      evidence: acceptedFindings.map((findingId) => ({
        finding_id: findingId,
        reference: `artifact://correction/${findingId}.json`,
        mediaType: 'application/json',
      })),
    },
    targeted_re_review: {
      state: needsCorrection ? 'completed' : 'not-required',
      regions: targetedRegions,
      dispositions: targetedDispositions,
      artifact: needsCorrection ? {
        reference: 'artifact://review/targeted.json',
        mediaType: 'application/json',
      } : null,
    },
    lifecycle,
    artifacts: [
      {
        kind: 'implementation-handoff',
        reference: 'artifact://implement/handoff.json',
        mediaType: 'application/json',
      },
      {
        kind: 'full-review-brief',
        reference: 'artifact://review/full.md',
        mediaType: 'text/markdown',
      },
      ...(needsCorrection ? [
        ...acceptedFindings.map((findingId) => ({
          kind: 'correction-evidence',
          reference: `artifact://correction/${findingId}.json`,
          mediaType: 'application/json',
        })),
        {
          kind: 'targeted-re-review',
          reference: 'artifact://review/targeted.json',
          mediaType: 'application/json',
        },
      ] : []),
    ],
    completeness: {
      required_phases: [...completedPhases],
      completed_phases: [...completedPhases],
      reviewed: true,
    },
    failure: null,
  };
}

function nonReviewedResult(phase, status = 'failed', ranges = null) {
  const result = successfulResult({
    acceptedFindings: ['finding-1'],
    ranges,
  });
  const phaseIndex = PHASES.indexOf(phase);
  result.status = status;
  result.failure = {
    phase,
    status,
    message: `${phase} did not complete.`,
    recovery: `Resume the ${phase} phase from retained evidence.`,
  };
  result.lifecycle.forEach((event, index) => {
    if (index === phaseIndex) {
      event.status = status;
      event.reference = `${status}:${phase}`;
    }
    if (index > phaseIndex) {
      event.status = 'incomplete';
      event.reference = 'not-started';
    }
  });
  result.completeness.completed_phases
    = result.completeness.required_phases.slice(0, phaseIndex);
  result.completeness.reviewed = false;

  if (phaseIndex === 0) {
    result.implementation = null;
    result.full_review = null;
    result.correction = null;
    result.targeted_re_review = null;
    result.artifacts = [];
  } else if (phaseIndex === 1) {
    result.full_review = null;
    result.correction = null;
    result.targeted_re_review = null;
    result.artifacts = result.artifacts.slice(0, 1);
  } else if (phaseIndex === 2) {
    result.correction = {
      state: status,
      range: null,
      scopes: result.correction.scopes,
      evidence: [],
    };
    result.targeted_re_review = null;
    result.artifacts = result.artifacts.slice(0, 2);
  } else {
    result.targeted_re_review = {
      state: status,
      regions: result.targeted_re_review.regions,
      dispositions: [],
      artifact: null,
    };
    result.artifacts = result.artifacts.slice(0, 3);
  }
  return result;
}

function createArtifact(t, value) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'take-ticket-artifact-'));
  const filePath = path.join(root, 'result.json');
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
  const reference = pathToFileURL(filePath).href;
  artifactAllowlist.set(reference, filePath);
  t.after(() => {
    artifactAllowlist.delete(reference);
    fs.rmSync(root, { recursive: true, force: true });
  });
  return {
    descriptor: { reference, mediaType: 'application/json' },
    reference,
  };
}

function resolveArtifact(reference) {
  const filePath = artifactAllowlist.get(reference);
  return filePath ? fs.readFileSync(filePath, 'utf8') : null;
}

function normalizedResult(invocationValue, context, artifact, value) {
  const succeeded = value.status === 'reviewed';
  return {
    status: succeeded ? 'succeeded' : 'failed',
    observations: {
      packageSkills: context.packageSkills,
      hostAvailableSkills: null,
      preExecutionInventory: {
        skillDefinitions: context.packageSkills.map((name) => ({
          name,
          path: `.fixture/skills/${name}/SKILL.md`,
          digest: '0'.repeat(64),
        })),
        plugins: [],
        ruleSources: [],
        packageDigest: '1'.repeat(64),
        truncated: false,
      },
      skillEvents: context.resolvedSkills.map((name, index) => ({
        name,
        operation: 'load',
        status: 'succeeded',
        trigger: name === 'take-ticket' ? 'model' : 'host',
        callId: `take-ticket-fixture-${index}`,
        provenance: {
          host: 'fixture',
          mechanism: 'test-only-take-ticket-adapter',
          eventType: 'fixture.skill-load',
          observerVersion: '1',
          statusSource: 'observed',
        },
      })),
      routing: {
        requestedSkill: invocationValue.skill,
        resolvedSkills: context.resolvedSkills,
      },
      responses: [{ text: `Take Ticket result: ${artifact.reference}` }],
      artifacts: [artifact.descriptor],
      toolUses: [
        { name: 'implement', outcome: 'succeeded' },
        {
          name: 'code-review',
          outcome: succeeded ? 'succeeded' : 'failed',
        },
      ],
      attemptedMutations: succeeded ? [{
        operation: 'edit',
        target: 'src/ticket-change.js',
        outcome: 'succeeded',
      }] : [],
    },
    failure: succeeded ? null : {
      stage: 'execution',
      code: `${value.failure.phase}-failure`,
      message: value.failure.message,
    },
    durationMs: 3,
    costUsd: 0,
    model: {
      requested: invocationValue.model,
      resolved: 'resolved-test-model',
    },
  };
}

test('canonical package discovers Take Ticket without test fixtures', (t) => {
  const packageRoot = createPackageRoot(t, ['take-ticket']);

  assert.deepEqual(
    discoverCanonicalPackage(packageRoot).skills.map(({ name }) => name),
    ['take-ticket'],
  );
  assert.equal(require('../suite').createImplementAdapter, undefined);
  assert.equal(require('../suite').createCodeReviewAdapter, undefined);
  assert.equal(require('../suite/testing').createImplementAdapter, undefined);
  assert.equal(require('../suite/testing').createCodeReviewAdapter, undefined);
});

test('routing description contains only trigger, consumer, and exclusions', () => {
  const description = takeTicketDescription();

  assert.match(description, /^Use when /);
  assert.match(description, /Used directly or by Dispatch Work\./);
  assert.match(description, /Excludes /);
  for (const phaseSummaryPattern of [
    /\bthrough Implement\b/i,
    /\bfull Code Review\b/i,
    /\bcorrection\b/i,
    /\btargeted re-?review\b/i,
    /\b(?:incomplete|failed) lifecycle\b/i,
  ]) {
    assert.equal(
      phaseSummaryPattern.test(description),
      false,
      `routing description leaked workflow summary: ${phaseSummaryPattern}`,
    );
  }
});

test('production fails closed on each exact Take Ticket dependency', async (t) => {
  const codeReviewClosure = [
    'agent-writing',
    'code-review',
    'engineering-guidance',
    'review-coordinator',
    'review-worker',
    'take-it-offline',
    'take-ticket',
    'writing-foundation',
  ];
  const cases = [
    {
      skills: ['take-ticket'],
      missing: 'code-review',
    },
    {
      skills: codeReviewClosure,
      missing: 'implement',
    },
  ];

  for (const { skills, missing } of cases) {
    const packageRoot = createPackageRoot(t, skills);
    let executions = 0;
    const adapter = defineProductionAdapter({
      name: `missing-${missing}`,
      async execute() {
        executions += 1;
        throw new Error('must not execute');
      },
    });

    const result = await executeProduction({
      repositoryRoot: packageRoot,
      adapter,
      invocation: invocation(),
    });

    assert.equal(executions, 0);
    assert.deepEqual(result.failure, {
      stage: 'dependency-resolution',
      code: 'missing-internal-dependency',
      message: `Missing internal dependency "${missing}"`,
      missingSkill: missing,
    });
    assert.deepEqual(result.observations.attemptedMutations, []);
    assert.deepEqual(result.observations.artifacts, []);
  }
});

test('clean and corrected lifecycles produce reviewed-ticket results', () => {
  const clean = successfulResult();
  const corrected = successfulResult({ acceptedFindings: ['finding-1'] });

  assert.strictEqual(validateTakeTicketResult(clean), clean);
  assert.strictEqual(validateTakeTicketResult(corrected), corrected);
});

test('review authority, full-review count, and targeted regions are invariant', () => {
  const inherited = successfulResult();
  inherited.full_review.authority.inherited = true;
  assert.throws(
    () => validateTakeTicketResult(inherited),
    /full Review authority must be resolved independently/,
  );

  const repeatedFullReview = successfulResult();
  repeatedFullReview.lifecycle.push({
    sequence: 5,
    phase: 'full-review',
    status: 'completed',
    reference: 'artifact://review/second-full.md',
  });
  assert.throws(
    () => validateTakeTicketResult(repeatedFullReview),
    /exactly one full authoritative Review/,
  );

  for (const missingRegion of ['region:finding-1', 'material:finding-1']) {
    const incomplete = successfulResult({ acceptedFindings: ['finding-1'] });
    incomplete.targeted_re_review.regions
      = incomplete.targeted_re_review.regions.filter((region) => region !== missingRegion);
    assert.throws(
      () => validateTakeTicketResult(incomplete),
      /targeted re-review must cover every corrected and materially affected region/,
      missingRegion,
    );
  }
});

test('immutable ranges and retained artifact references stay cross-consistent', () => {
  const wrongImplementationRange = successfulResult();
  wrongImplementationRange.lifecycle[0].reference
    = `${'a'.repeat(40)}..${'c'.repeat(40)}`;
  assert.throws(
    () => validateTakeTicketResult(wrongImplementationRange),
    /implementation lifecycle range must match the retained range/,
  );

  const wrongCorrectionBase = successfulResult({ acceptedFindings: ['finding-1'] });
  wrongCorrectionBase.correction.range.base = 'd'.repeat(40);
  assert.throws(
    () => validateTakeTicketResult(wrongCorrectionBase),
    /correction range must start at the implementation head/,
  );

  const wrongEvidence = successfulResult({ acceptedFindings: ['finding-1'] });
  wrongEvidence.correction.evidence[0].finding_id = 'unrelated-finding';
  assert.throws(
    () => validateTakeTicketResult(wrongEvidence),
    /correction evidence must cover every accepted finding/,
  );

  const unrelatedTarget = successfulResult({ acceptedFindings: ['finding-1'] });
  unrelatedTarget.targeted_re_review.regions.push('region:unrelated');
  assert.throws(
    () => validateTakeTicketResult(unrelatedTarget),
    /targeted re-review regions must exactly match correction effects/,
  );
});

test('correction and targeted re-review preserve authoritative finding regions', () => {
  const changedCorrectionRegion = successfulResult({
    acceptedFindings: ['finding-1'],
  });
  changedCorrectionRegion.correction.scopes[0].regions = ['region:fabricated'];
  changedCorrectionRegion.targeted_re_review.regions[0] = 'region:fabricated';
  changedCorrectionRegion.targeted_re_review.dispositions[0].region
    = 'region:fabricated';
  assert.throws(
    () => validateTakeTicketResult(changedCorrectionRegion),
    /corrected regions must exactly match the full Review finding regions/,
  );

  const omittedAuthoritativeRegion = successfulResult({
    acceptedFindings: ['finding-1'],
  });
  omittedAuthoritativeRegion.full_review.finding_dispositions[0].regions.push(
    'region:finding-1-secondary',
  );
  assert.throws(
    () => validateTakeTicketResult(omittedAuthoritativeRegion),
    /corrected regions must exactly match the full Review finding regions/,
  );

  for (const mutate of [
    (result) => result.targeted_re_review.dispositions.push({
      finding_id: 'finding-1',
      region: 'region:fabricated',
      outcome: 'accepted',
    }),
    (result) => result.targeted_re_review.dispositions.push({
      ...result.targeted_re_review.dispositions[0],
    }),
    (result) => result.targeted_re_review.dispositions.push({
      finding_id: 'finding-2',
      region: 'region:finding-1',
      outcome: 'accepted',
    }),
  ]) {
    const result = successfulResult({
      acceptedFindings: ['finding-1', 'finding-2'],
    });
    mutate(result);
    assert.throws(
      () => validateTakeTicketResult(result),
      /targeted re-review dispositions must exactly match correction effects/,
    );
  }
});

test('failed and incomplete phases remain visible and never become reviewed', () => {
  for (const phase of PHASES) {
    const result = nonReviewedResult(
      phase,
      phase === 'targeted-re-review' ? 'incomplete' : 'failed',
    );
    assert.strictEqual(validateTakeTicketResult(result), result, phase);
    assert.equal(result.completeness.reviewed, false, phase);
    assert.equal(
      result.lifecycle.find((event) => event.phase === phase).status,
      result.failure.status,
      phase,
    );
  }

  const falseSuccess = nonReviewedResult('correction');
  falseSuccess.completeness.reviewed = true;
  assert.throws(
    () => validateTakeTicketResult(falseSuccess),
    /non-reviewed result cannot claim reviewed completeness/,
  );
});

test('partial correction and targeted review retain only authoritative progress', () => {
  for (const mutate of [
    (result) => {
      result.correction.scopes[0].regions = ['region:fabricated'];
    },
    (result) => {
      result.correction.scopes.push({
        finding_id: 'finding-fabricated',
        regions: ['region:fabricated'],
        materially_affected_regions: [],
      });
    },
  ]) {
    const result = nonReviewedResult('correction');
    mutate(result);
    assert.throws(
      () => validateTakeTicketResult(result),
      /partial correction scope must match accepted Review findings/,
    );
  }

  for (const mutate of [
    (result) => {
      result.targeted_re_review.regions.pop();
    },
    (result) => {
      result.targeted_re_review.regions.push('region:fabricated');
    },
    (result) => {
      result.targeted_re_review.dispositions.push({
        finding_id: 'finding-fabricated',
        region: 'region:fabricated',
        outcome: 'accepted',
      });
    },
    (result) => {
      const disposition = {
        finding_id: 'finding-1',
        region: 'region:finding-1',
        outcome: 'accepted',
      };
      result.targeted_re_review.dispositions.push(disposition, {
        ...disposition,
      });
    },
  ]) {
    const result = nonReviewedResult('targeted-re-review', 'incomplete');
    mutate(result);
    assert.throws(
      () => validateTakeTicketResult(result),
      /partial targeted re-review progress contradicts correction effects/,
    );
  }

  const validPartialProgress = nonReviewedResult(
    'targeted-re-review',
    'incomplete',
  );
  validPartialProgress.targeted_re_review.dispositions.push({
    finding_id: 'finding-1',
    region: 'region:finding-1',
    outcome: 'accepted',
  });
  assert.strictEqual(
    validateTakeTicketResult(validPartialProgress),
    validPartialProgress,
  );
});

test('non-reviewed results keep every completed prefix cross-consistent', () => {
  const wrongImplementationRange = nonReviewedResult('full-review');
  wrongImplementationRange.lifecycle[0].reference
    = `${'a'.repeat(40)}..${'c'.repeat(40)}`;
  assert.throws(
    () => validateTakeTicketResult(wrongImplementationRange),
    /completed implementation lifecycle reference is inconsistent/,
  );

  const wrongReviewBrief = nonReviewedResult('correction');
  wrongReviewBrief.lifecycle[1].reference = 'artifact://review/other.md';
  assert.throws(
    () => validateTakeTicketResult(wrongReviewBrief),
    /completed full Review lifecycle reference is inconsistent/,
  );

  const missingDescriptor = nonReviewedResult('correction');
  missingDescriptor.artifacts = missingDescriptor.artifacts.slice(0, 1);
  assert.throws(
    () => validateTakeTicketResult(missingDescriptor),
    /completed prefix artifacts are inconsistent/,
  );

  const contradictoryDescriptor = nonReviewedResult('full-review');
  contradictoryDescriptor.artifacts[0].reference
    = 'artifact://implement/contradictory.json';
  assert.throws(
    () => validateTakeTicketResult(contradictoryDescriptor),
    /completed prefix artifacts are inconsistent/,
  );

  const impossibleFutureArtifact = nonReviewedResult('full-review');
  impossibleFutureArtifact.artifacts.push({
    kind: 'full-review-brief',
    reference: 'artifact://review/uncompleted.md',
    mediaType: 'text/markdown',
  });
  assert.throws(
    () => validateTakeTicketResult(impossibleFutureArtifact),
    /completed prefix artifacts are inconsistent/,
  );
});

test('outcome sandbox derives immutable ranges from real changed commits', (t) => {
  const sandbox = createOutcomeSandbox(t, { includeCorrection: true });
  const { implementation, correction } = sandbox.repository.ranges;

  fixtureGit(sandbox.repository.root, [
    'merge-base',
    '--is-ancestor',
    implementation.base,
    implementation.head,
  ]);
  assert.equal(correction.base, implementation.head);
  fixtureGit(sandbox.repository.root, [
    'merge-base',
    '--is-ancestor',
    correction.base,
    correction.head,
  ]);
  for (const range of [implementation, correction]) {
    const changedPaths = fixtureGit(sandbox.repository.root, [
      'diff',
      '--name-only',
      `${range.base}..${range.head}`,
    ]).split('\n');
    assert.deepEqual(changedPaths, ['src/ticket-change.js']);
  }
  assert.equal(sandbox.repository.head, correction.head);
});

test('full-review failure retains no synthetic future correction evidence', (t) => {
  const sandbox = createOutcomeSandbox(t);
  const result = nonReviewedResult(
    'full-review',
    'failed',
    sandbox.repository.ranges,
  );

  assert.strictEqual(validateTakeTicketResult(result), result);
  assert.equal(
    result.lifecycle[0].reference,
    `${sandbox.repository.ranges.implementation.base}`
      + `..${sandbox.repository.ranges.implementation.head}`,
  );
  assert.equal(result.lifecycle[1].reference, 'failed:full-review');
  assert.equal(result.lifecycle[2].reference, 'not-started');
  assert.equal(result.lifecycle[3].reference, 'not-started');
  assert.equal(result.correction, null);
  assert.equal(result.targeted_re_review, null);
  assert.deepEqual(Object.keys(sandbox.repository.ranges), ['implementation']);
  assert.equal(
    fixtureGit(sandbox.repository.root, ['rev-list', '--count', 'HEAD']),
    '2',
  );
  assert.deepEqual(
    result.artifacts.map(({ kind }) => kind),
    ['implementation-handoff'],
  );

  const fabricatedFuture = structuredClone(result);
  fabricatedFuture.lifecycle[2].reference
    = `${'b'.repeat(40)}..${'c'.repeat(40)}`;
  assert.throws(
    () => validateTakeTicketResult(fabricatedFuture),
    /failed and future lifecycle references must be explicit/,
  );
});

test('outcome sandbox ignores hostile inherited Git configuration', (t) => {
  const hostileRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'take-ticket-hostile-git-'));
  t.after(() => fs.rmSync(hostileRoot, { recursive: true, force: true }));
  const hooksRoot = path.join(hostileRoot, 'hooks');
  const templateRoot = path.join(hostileRoot, 'template');
  const hookMarker = path.join(hostileRoot, 'hook-ran');
  const signingMarker = path.join(hostileRoot, 'signing-ran');
  fs.mkdirSync(hooksRoot, { recursive: true });
  fs.mkdirSync(path.join(templateRoot, 'hooks'), { recursive: true });
  for (const [filePath, marker] of [
    [path.join(hooksRoot, 'pre-commit'), hookMarker],
    [path.join(templateRoot, 'hooks', 'pre-commit'), hookMarker],
    [path.join(hostileRoot, 'signing-program'), signingMarker],
  ]) {
    fs.writeFileSync(
      filePath,
      `#!/bin/sh\nprintf ran > "${marker}"\nexit 1\n`,
      { mode: 0o755 },
    );
  }
  const globalConfig = path.join(hostileRoot, 'global.gitconfig');
  fs.writeFileSync(
    globalConfig,
    [
      '[core]',
      `\thooksPath = ${hooksRoot}`,
      '[commit]',
      '\tgpgSign = true',
      '[gpg]',
      `\tprogram = ${path.join(hostileRoot, 'signing-program')}`,
      '[init]',
      `\ttemplateDir = ${templateRoot}`,
      '[user]',
      '\tsigningKey = hostile-fixture-key',
      '',
    ].join('\n'),
  );

  const inheritedKeys = {
    GIT_CONFIG_GLOBAL: globalConfig,
    GIT_CONFIG_SYSTEM: globalConfig,
    GIT_TEMPLATE_DIR: templateRoot,
  };
  const previousValues = new Map(
    Object.keys(inheritedKeys).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, inheritedKeys);
  let sandbox;
  try {
    sandbox = createOutcomeSandbox(t, { includeCorrection: true });
  } finally {
    for (const [key, value] of previousValues) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  assert.equal(fs.existsSync(hookMarker), false);
  assert.equal(fs.existsSync(signingMarker), false);
  assert.equal(
    fixtureGit(sandbox.repository.root, ['rev-list', '--count', 'HEAD']),
    '3',
  );
});

test('test-only dependency Adapters drive clean, correction, and failure outcomes', async (t) => {
  const packageRoot = createPackageRoot(t, REQUIRED_SKILLS);
  const scenarios = [
    {
      name: 'clean',
      acceptedFindings: [],
    },
    {
      name: 'correction',
      acceptedFindings: ['finding-1'],
      includeCorrection: true,
    },
    {
      name: 'failure',
      failedPhase: 'full-review',
    },
  ];

  for (const scenario of scenarios) {
    const includeCorrection = scenario.includeCorrection === true;
    const reviewCalls = includeCorrection ? 2 : 1;
    const sandbox = createOutcomeSandbox(t, {
      includeCorrection,
    });
    const scenarioResult = scenario.failedPhase
      ? nonReviewedResult(
        scenario.failedPhase,
        'failed',
        sandbox.repository.ranges,
      )
      : successfulResult({
        acceptedFindings: scenario.acceptedFindings,
        ranges: sandbox.repository.ranges,
      });
    const artifact = createArtifact(t, scenarioResult);
    const implement = createImplementAdapter(async (input) => {
      assert.equal(input.repository.root, sandbox.repository.root);
      await sandbox.tracker.readTicket('43');
      await sandbox.ci.validate('node --test');
      return {
        activity: input.activity,
        implementation: scenarioResult.implementation,
      };
    });
    const codeReview = createCodeReviewAdapter(async (input) => {
      assert.equal(input.repository.root, sandbox.repository.root);
      return {
        mode: input.mode,
        review: input.mode === 'full'
          ? scenarioResult.full_review
          : scenarioResult.targeted_re_review,
      };
    });
    const adapter = defineTestAdapter({
      name: `take-ticket-${scenario.name}`,
      async execute(invocationValue, context) {
        const implementation = await implement.execute({
          activity: 'implementation',
          requirements: scenarioResult.requirements,
          repository: sandbox.repository,
        });
        const ticketOutcome = {
          requirements: scenarioResult.requirements,
          implementation_range: implementation.implementation?.range || null,
          implementation_handoff: implementation.implementation?.handoff || null,
          validation_evidence: implementation.implementation?.validation || [],
        };
        await codeReview.execute({
          mode: 'full',
          ticket_outcome: ticketOutcome,
          repository: sandbox.repository,
        });
        if (includeCorrection) {
          await implement.execute({
            activity: 'correction',
            accepted_scope: scenarioResult.correction.scopes,
            repository: sandbox.repository,
          });
          await codeReview.execute({
            mode: 'targeted',
            ticket_outcome: ticketOutcome,
            correction: scenarioResult.correction,
            repository: sandbox.repository,
          });
        }
        return normalizedResult(
          invocationValue,
          context,
          artifact,
          scenarioResult,
        );
      },
    });

    const result = await executeTest({
      repositoryRoot: packageRoot,
      adapter,
      invocation: invocation(),
    });
    const grade = gradeTakeTicketResult({ result, resolveArtifact });

    assert.equal(grade.passed, true, scenario.name);
    assert.match(sandbox.repository.head, /^[a-f0-9]{40}$/);
    assert.equal(fs.existsSync(path.join(sandbox.repository.root, '.git')), true);
    assert.equal(implement.calls.length, reviewCalls, scenario.name);
    assert.equal(codeReview.calls.length, reviewCalls, scenario.name);
    assert.equal(sandbox.pr.calls.length, 0, scenario.name);
    assert.equal(sandbox.tracker.calls.length, reviewCalls, scenario.name);
    assert.equal(sandbox.ci.calls.length, reviewCalls, scenario.name);
    assert.deepEqual(
      codeReview.calls[0].ticket_outcome,
      {
        requirements: scenarioResult.requirements,
        implementation_range: scenarioResult.implementation?.range || null,
        implementation_handoff: scenarioResult.implementation?.handoff || null,
        validation_evidence: scenarioResult.implementation?.validation || [],
      },
      scenario.name,
    );
    assert.deepEqual(
      scenarioResult.implementation?.range,
      sandbox.repository.ranges.implementation,
      scenario.name,
    );
    if (includeCorrection) {
      assert.deepEqual(
        scenarioResult.correction.range,
        sandbox.repository.ranges.correction,
        scenario.name,
      );
    } else if (scenario.failedPhase === 'full-review') {
      assert.deepEqual(
        Object.keys(sandbox.repository.ranges),
        ['implementation'],
        scenario.name,
      );
      assert.deepEqual(
        scenarioResult.lifecycle.slice(1).map(({ reference }) => reference),
        ['failed:full-review', 'not-started', 'not-started'],
        scenario.name,
      );
    }
  }
});

test('evaluation catalog covers role, both components, outcome, and activation', () => {
  const definitions = loadDefinitions(repositoryRoot);
  assert.deepEqual(
    definitions.map(({ evaluation }) => evaluation.layer),
    ['role', 'component', 'outcome', 'trigger'],
  );
  assert.deepEqual(
    definitions.find(({ evaluation }) => evaluation.layer === 'component')
      .evals.map(({ ablated_dependency: dependency }) => dependency),
    ['implement', 'code-review'],
  );
  for (const layer of ['role', 'outcome']) {
    const definition = definitions.find(
      ({ evaluation }) => evaluation.layer === layer,
    );
    assert.deepEqual(
      new Set(definition.evals[0].required_skill_loads),
      new Set(REQUIRED_SKILLS),
      layer,
    );
  }
  assert.equal(
    definitions.flatMap(({ evals }) => evals)
      .every(({ expectations }) => expectations.length > 0),
    true,
  );
});

test('package-closure cases name both direct dependencies exactly', () => {
  const closure = JSON.parse(fs.readFileSync(
    path.join(skillRoot, 'evals', 'package-closure.json'),
    'utf8',
  ));
  assert.deepEqual(
    closure.cases.map(({ missing_dependency: dependency }) => dependency),
    ['implement', 'code-review'],
  );
  for (const { missing_dependency: dependency, expected_failure: failure } of (
    closure.cases
  )) {
    assert.deepEqual(failure, {
      stage: 'dependency-resolution',
      code: 'missing-internal-dependency',
      message: `Missing internal dependency "${dependency}"`,
      missingSkill: dependency,
    });
  }
});
