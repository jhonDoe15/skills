'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  defineProductionAdapter,
  executeProduction,
  loadCanonicalSuite,
} = require('../suite');
const { executeTest } = require('../suite/testing');
const { gradeCodeReviewResult } = require('../skills/code-review/evals/grader');
const reviewArtifact = require('../skills/code-review/evals/review-artifact');
const {
  ReviewArtifactError,
  coordinateReview,
  retainReview,
  sha256,
  validateRetainedArtifacts,
  validateReviewRun,
} = reviewArtifact;

const repositoryRoot = path.resolve(__dirname, '..');
const concernIds = [
  'intent-and-scope',
  'responsibilities-and-seams',
  'dependencies-and-contracts',
  'state-and-invariants',
  'failure-and-boundaries',
  'simplicity-and-reuse',
  'compatibility-and-change',
  'maintainer-legibility',
  'evidence-and-validation',
];
const levels = [
  'Requirements & Expectations',
  'Engineering & Architecture',
  'Code Quality',
];

function readSkill(name) {
  return fs.readFileSync(
    path.join(repositoryRoot, 'skills', name, 'SKILL.md'),
    'utf8',
  );
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8'));
}

test('production Skills define the whole-ticket multi-lens review contract', () => {
  const codeReview = readSkill('code-review');
  const worker = readSkill('review-worker');
  const coordinator = readSkill('review-coordinator');

  assert.match(codeReview, /originating requirements/);
  assert.match(codeReview, /immutable implementation range/);
  assert.match(codeReview, /implementation handoff/);
  assert.match(codeReview, /validation evidence/);
  assert.match(codeReview, /Domain/);
  assert.match(codeReview, /Engineering\/Design/);
  assert.match(codeReview, /separate fresh/);
  assert.match(codeReview, /missing planned lens.*structurally invalid/is);
  assert.match(codeReview, /read-only/i);
  assert.match(codeReview, /run manifest/);
  assert.match(codeReview, /immutable diff package/);
  assert.match(codeReview, /candidate streams/);
  assert.match(codeReview, /concern coverage/);
  assert.match(codeReview, /coordination dispositions/);
  assert.match(codeReview, /completeness state/);
  assert.match(codeReview, /Markdown brief/);
  assert.match(codeReview, /behavior, contracts, state, dependencies, data, and failure handling/);
  assert.match(codeReview, /change signals/i);
  assert.match(codeReview, /specialist.*Context\s+limit/is);

  assert.match(worker, /complete Ticket outcome/);
  assert.match(worker, /engineering-guidance/);
  assert.match(worker, /Requirements & Expectations/);
  assert.match(worker, /Engineering & Architecture/);
  assert.match(worker, /Code Quality/);
  for (const field of [
    'Review level',
    'severity',
    'Finding confidence',
    'Fix-direction confidence',
    'Context limits',
    'evidence',
    'impact',
    'affected scope',
    'highest actionable fix direction',
    'acceptance evidence',
  ]) {
    assert.match(worker, new RegExp(field, 'i'), field);
  }
  assert.match(worker, /confidence inputs/i);
  assert.match(worker, /unaffected.*lower-level coverage/is);
  assert.match(worker, /underlying problem.*conclusion identity/is);
  assert.match(worker, /report.*specialist.*need.*caller/is);
  assert.match(worker, /does not dispatch.*Review worker/is);

  assert.match(coordinator, /validates? structure/i);
  assert.match(coordinator, /groups? compatible duplicates/i);
  assert.match(coordinator, /sorts? findings/i);
  assert.match(coordinator, /unions? coverage/i);
  assert.match(coordinator, /preserves? worker conclusions/i);
  assert.match(coordinator, /does not.*second review/is);
  assert.match(coordinator, /exact duplicate guidance/i);
  assert.match(coordinator, /disagreement/i);
  assert.match(coordinator, /worker-declared supersession/i);
});

function finding(id, workerId) {
  return {
    id,
    region_id: 'review-artifact',
    review_level: 'Engineering & Architecture',
    severity: 'Major',
    finding_confidence: 91,
    fix_direction_confidence: 84,
    context_limits: [],
    evidence: [{
      reference: 'diff://base..head/review-artifact',
      observation: 'The completeness state accepts one worker.',
    }],
    confidence_inputs: {
      evidence_quality: [{
        reference: 'diff://base..head/review-artifact',
        quality: 'direct',
      }],
      finding: {
        context_limits: [],
        rationale: 'Direct artifact evidence supports the finding.',
      },
      fix_direction: {
        context_limits: [],
        rationale: 'The required two-lens contract supports the direction.',
      },
    },
    impact: 'A partial review could be presented as complete.',
    affected_scope: ['skills/code-review'],
    highest_actionable_fix_direction:
      'Require both independent lens results before completion.',
    acceptance_evidence: [
      'A one-lens fixture fails structural validation.',
    ],
    conclusion: `${workerId} concluded that two lenses are required.`,
    duplicate_key: 'requires-two-lenses',
    conclusion_key: 'two-independent-lenses-required',
  };
}

function immutableRange() {
  return {
    base: 'a'.repeat(40),
    head: 'b'.repeat(40),
  };
}

function reviewPlan(mode = 'separate') {
  const unchanged = mode === 'combined';
  return {
    consolidation: {
      mode,
      evidence: [
        'behavior',
        'contracts',
        'state',
        'dependencies',
        'data',
        'failure-handling',
      ].map((dimension) => ({
        dimension,
        unchanged,
        check: `compare-${dimension}`,
        references: [`artifact://consolidation/${dimension}`],
        observation: `${dimension} was compared across the immutable range.`,
      })),
    },
    specialist_routing: [],
  };
}

function worker(id, lens) {
  return {
    id,
    lens,
    status: 'completed',
    failure: null,
    lens_provenance: `issue-42:${lens}`,
    immutable_range: immutableRange(),
    input_artifact_references: [
      'issue://42',
      'artifact://implementation-handoff',
      'artifact://validation',
      'diff://base..head',
    ],
    guidance_coverage: concernIds.map((concern) => ({
      concern,
      disposition: 'applicable-now',
      sources: ['issue://42'],
      reason: `${concern} bears on the review contract.`,
    })),
    regions: [{
      id: 'review-artifact',
      affected_scope: ['skills/code-review'],
      analysis: levels.map((level) => ({
        level,
        status: 'examined',
        evidence: ['diff://base..head/review-artifact'],
      })),
      supersession: null,
    }],
    findings: [finding(`${id}-finding`, id)],
  };
}

function reviewInput() {
  return {
    schema: 'code-review-input/v1',
    run_id: 'issue-42-review',
    review_plan: reviewPlan(),
    ticket_outcome: {
      requirement_references: ['issue://42'],
      immutable_range: immutableRange(),
      implementation_handoff: 'artifact://implementation-handoff',
      validation_evidence: ['artifact://validation'],
      diff_package: 'diff://base..head',
    },
    workers: [
      worker('domain-worker', 'Domain'),
      worker('engineering-worker', 'Engineering/Design'),
    ],
    artifacts: {
      run_manifest: 'artifact://run-manifest.json',
      immutable_diff_package: 'artifact://diff-package.json',
      worker_candidate_streams: [
        'artifact://domain/findings.jsonl',
        'artifact://engineering/findings.jsonl',
      ],
      worker_concern_coverage: [
        'artifact://domain/coverage.json',
        'artifact://engineering/coverage.json',
      ],
      coordination_dispositions: 'artifact://coordination.json',
      completeness_state: 'artifact://completeness.json',
      markdown_brief: 'artifact://review-brief.md',
    },
  };
}

test('structural coordinator completes two lenses and rejects one lens', () => {
  const input = reviewInput();
  const coordinated = coordinateReview(input);

  assert.strictEqual(validateReviewRun(coordinated), coordinated);
  assert.equal(coordinated.status, 'completed');
  assert.equal(coordinated.completeness.state, 'complete');
  assert.equal(coordinated.coordination.groups.length, 1);
  assert.deepEqual(
    coordinated.coordination.groups[0].source_finding_ids,
    ['domain-worker-finding', 'engineering-worker-finding'],
  );
  assert.deepEqual(
    coordinated.workers.map(({ findings }) => findings[0].conclusion),
    [
      'domain-worker concluded that two lenses are required.',
      'engineering-worker concluded that two lenses are required.',
    ],
  );
  assert.deepEqual(
    coordinated.coordination.coverage_union.lenses,
    ['Domain', 'Engineering/Design'],
  );
  assert.equal(coordinated.coordination.second_review_performed, false);

  const oneLens = reviewInput();
  oneLens.workers.pop();
  assert.throws(
    () => coordinateReview(oneLens),
    /exactly one Domain and one Engineering\/Design worker/,
  );
});

test('artifact module names only its fixed base lenses', () => {
  assert.deepEqual(
    reviewArtifact.BASE_LENSES,
    ['Domain', 'Engineering/Design'],
  );
  assert.equal(reviewArtifact.LENSES, undefined);
});

test('mechanical evidence permits one combined worker without weakening review structure', () => {
  const input = reviewInput();
  input.review_plan = reviewPlan('combined');
  input.workers = [worker('combined-worker', 'Combined')];
  input.artifacts.worker_candidate_streams = [
    'artifact://combined/findings.jsonl',
  ];
  input.artifacts.worker_concern_coverage = [
    'artifact://combined/coverage.json',
  ];

  const coordinated = coordinateReview(input);
  assert.equal(coordinated.status, 'completed');
  assert.deepEqual(coordinated.coordination.coverage_union.lenses, ['Combined']);
  assert.equal(
    coordinated.completeness.checks.some(
      ({ id }) => id === 'planned-review-lenses',
    ),
    true,
  );
  assert.deepEqual(
    coordinated.review_plan.consolidation.evidence.map(
      ({ dimension, unchanged }) => [dimension, unchanged],
    ),
    [
      ['behavior', true],
      ['contracts', true],
      ['state', true],
      ['dependencies', true],
      ['data', true],
      ['failure-handling', true],
    ],
  );

  const changedBehavior = structuredClone(input);
  changedBehavior.review_plan.consolidation.evidence[0].unchanged = false;
  assert.throws(
    () => coordinateReview(changedBehavior),
    /combined worker requires unchanged consolidation evidence/,
  );

  for (const field of ['check', 'observation', 'references']) {
    const incompleteEvidence = structuredClone(input);
    delete incompleteEvidence.review_plan.consolidation.evidence[0][field];
    assert.throws(
      () => coordinateReview(incompleteEvidence),
      new RegExp(`consolidation\\.evidence.*${field}`),
    );
  }
});

test('change signals route available specialists and retain unavailable capability gaps', () => {
  const available = reviewInput();
  available.review_plan.specialist_routing.push({
    lens: 'Node Runtime',
    category: 'technology',
    signal_references: ['diff://base..head/package-json'],
    capability: 'available',
    worker_id: 'node-worker',
    context_limit: null,
  });
  available.workers.push(worker('node-worker', 'Node Runtime'));
  available.artifacts.worker_candidate_streams.push(
    'artifact://node/findings.jsonl',
  );
  available.artifacts.worker_concern_coverage.push(
    'artifact://node/coverage.json',
  );

  const routed = coordinateReview(available);
  assert.equal(routed.status, 'completed');
  assert.deepEqual(
    routed.coordination.coverage_union.lenses,
    ['Domain', 'Engineering/Design', 'Node Runtime'],
  );
  assert.deepEqual(
    routed.review_plan.specialist_routing,
    available.review_plan.specialist_routing,
  );

  const unavailable = reviewInput();
  unavailable.review_plan.specialist_routing.push({
    lens: 'Security',
    category: 'specialist',
    signal_references: ['issue://47/security-sensitive-change'],
    capability: 'unavailable',
    worker_id: null,
    context_limit: 'No security specialist capability is installed.',
  });
  const incompleteCapability = coordinateReview(unavailable);
  assert.equal(incompleteCapability.status, 'completed');
  assert.deepEqual(
    incompleteCapability.review_plan.specialist_routing,
    unavailable.review_plan.specialist_routing,
  );

  const imitated = structuredClone(unavailable);
  imitated.workers.push(worker('generalist-security', 'Security'));
  imitated.artifacts.worker_candidate_streams.push(
    'artifact://generalist-security/findings.jsonl',
  );
  imitated.artifacts.worker_concern_coverage.push(
    'artifact://generalist-security/coverage.json',
  );
  assert.throws(
    () => coordinateReview(imitated),
    /unavailable specialist must not have a Review worker/,
  );
});

test('malformed review-plan records retain ReviewArtifactError identity', () => {
  for (const mutate of [
    (input) => {
      input.review_plan.consolidation.evidence[0] = null;
    },
    (input) => {
      input.review_plan.specialist_routing.push(null);
    },
  ]) {
    const input = reviewInput();
    mutate(input);
    assert.throws(
      () => coordinateReview(input),
      (error) => (
        error instanceof ReviewArtifactError
        && /must be an object/.test(error.message)
      ),
    );
  }
});

function createPackageRoot(t, skillNames) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'code-review-package-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'suite'), { recursive: true });
  fs.copyFileSync(
    path.join(repositoryRoot, 'suite', 'canonical-suite.json'),
    path.join(root, 'suite', 'canonical-suite.json'),
  );
  for (const name of skillNames) {
    const source = path.join(repositoryRoot, 'skills', name, 'SKILL.md');
    const destination = path.join(root, 'skills', name, 'SKILL.md');
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }
  return root;
}

function invocation(skill) {
  return {
    requestId: `issue-42-${skill}`,
    skill,
    prompt: 'Review the complete Ticket outcome without mutation.',
    model: 'test-model',
  };
}

function normalizedResult(request, context, failed = false) {
  return {
    status: failed ? 'failed' : 'succeeded',
    observations: {
      packageSkills: context.packageSkills,
      hostAvailableSkills: null,
      preExecutionInventory: {
        skillDefinitions: [],
        plugins: [],
        ruleSources: [],
        packageDigest:
          'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        truncated: false,
      },
      skillEvents: [],
      routing: {
        requestedSkill: request.skill,
        resolvedSkills: context.resolvedSkills,
      },
      responses: [],
      artifacts: [],
      toolUses: [],
      attemptedMutations: [],
    },
    failure: failed ? {
      stage: 'execution',
      code: 'guidance-unavailable',
      message: 'Missing internal dependency "engineering-guidance"',
      missingSkill: 'engineering-guidance',
    } : null,
    durationMs: 1,
    costUsd: 0,
    model: {
      requested: request.model,
      resolved: 'resolved-test-model',
    },
  };
}

test('canonical closure fails by exact name and fixture ablation stays test-only', async (t) => {
  const {
    createEngineeringGuidanceAdapter,
  } = require('./fixtures/code-review/engineering-guidance-adapter');
  const suite = require('../suite');
  const testing = require('../suite/testing');
  const canonical = loadCanonicalSuite(repositoryRoot)
    .inventory.map(({ name }) => name);
  for (const name of ['code-review', 'review-worker', 'review-coordinator']) {
    assert.equal(canonical.includes(name), true, name);
  }
  assert.equal(suite.createEngineeringGuidanceAdapter, undefined);
  assert.equal(testing.createEngineeringGuidanceAdapter, undefined);

  const missingCases = [
    {
      skill: 'code-review',
      installed: ['code-review'],
      expected: 'review-coordinator',
    },
    {
      skill: 'code-review',
      installed: [
        'code-review',
        'review-coordinator',
        'take-it-offline',
        'agent-writing',
        'writing-foundation',
      ],
      expected: 'review-worker',
    },
    {
      skill: 'code-review',
      installed: [
        'code-review',
        'review-coordinator',
        'review-worker',
        'engineering-guidance',
      ],
      expected: 'take-it-offline',
    },
    {
      skill: 'review-worker',
      installed: [
        'review-worker',
        'take-it-offline',
        'agent-writing',
        'writing-foundation',
      ],
      expected: 'engineering-guidance',
    },
    {
      skill: 'review-worker',
      installed: ['review-worker', 'engineering-guidance'],
      expected: 'take-it-offline',
    },
    {
      skill: 'review-coordinator',
      installed: ['review-coordinator'],
      expected: 'take-it-offline',
    },
  ];
  for (const { skill, installed, expected } of missingCases) {
    const root = createPackageRoot(t, installed);
    let executions = 0;
    const adapter = defineProductionAdapter({
      name: `missing-${expected}`,
      async execute() {
        executions += 1;
        throw new Error('must not execute');
      },
    });
    const result = await executeProduction({
      repositoryRoot: root,
      adapter,
      invocation: invocation(skill),
    });
    assert.equal(executions, 0);
    assert.equal(
      result.failure.message,
      `Missing internal dependency "${expected}"`,
    );
    assert.deepEqual(result.observations.attemptedMutations, []);
  }

  const completeRoot = createPackageRoot(t, [
    'review-worker',
    'engineering-guidance',
    'take-it-offline',
    'agent-writing',
    'writing-foundation',
  ]);
  const fixture = createEngineeringGuidanceAdapter(
    (request, context) => normalizedResult(
      request,
      context,
      context.dependencyAblation !== null,
    ),
  );
  const complete = await executeTest({
    repositoryRoot: completeRoot,
    adapter: fixture.adapter,
    invocation: invocation('review-worker'),
  });
  const ablated = await executeTest({
    repositoryRoot: completeRoot,
    adapter: fixture.adapter,
    invocation: invocation('review-worker'),
    dependencyAblation: {
      consumer: 'review-worker',
      dependency: 'engineering-guidance',
    },
  });
  assert.equal(complete.status, 'succeeded');
  assert.equal(ablated.status, 'failed');
  assert.equal(fixture.calls.length, 2);
  assert.deepEqual(ablated.observations.attemptedMutations, []);
  await assert.rejects(
    executeProduction({
      repositoryRoot: completeRoot,
      adapter: fixture.adapter,
      invocation: invocation('review-worker'),
    }),
    /production execution requires a production Adapter/,
  );
});

test('owner-local evaluations cover role component outcome and activation boundaries', () => {
  const codeReview = require('../skills/code-review/evals');
  const reviewWorker = require('../skills/review-worker/evals');
  const reviewCoordinator = require('../skills/review-coordinator/evals');
  const definitions = {
    'code-review': codeReview.loadDefinitions(repositoryRoot),
    'review-worker': reviewWorker.loadDefinitions(repositoryRoot),
    'review-coordinator': reviewCoordinator.loadDefinitions(repositoryRoot),
  };

  assert.deepEqual(
    definitions['code-review'].map(({ evaluation }) => evaluation.layer),
    ['role', 'component', 'outcome', 'trigger'],
  );
  assert.deepEqual(
    definitions['review-worker'].map(({ evaluation }) => evaluation.layer),
    ['role', 'component'],
  );
  assert.deepEqual(
    definitions['review-coordinator'].map(({ evaluation }) => evaluation.layer),
    ['role', 'component'],
  );
  assert.deepEqual(
    definitions['code-review'][1].evals
      .map(({ ablated_dependency: dependency }) => dependency),
    ['review-worker', 'review-coordinator', 'take-it-offline'],
  );
  assert.deepEqual(
    definitions['review-worker'][1].evals
      .map(({ ablated_dependency: dependency }) => dependency),
    ['engineering-guidance', 'take-it-offline'],
  );
  assert.deepEqual(
    definitions['review-coordinator'][1].evals
      .map(({ ablated_dependency: dependency }) => dependency),
    ['take-it-offline'],
  );

  const outcome = definitions['code-review'][2];
  assert.deepEqual(outcome.evaluation.arms, ['no-skill', 'treatment']);
  assert.deepEqual(outcome.evals[0].required_skill_loads, [
    'code-review',
    'review-worker',
    'review-coordinator',
    'engineering-guidance',
    'take-it-offline',
    'agent-writing',
    'writing-foundation',
  ]);
  const trigger = definitions['code-review'][3];
  assert.equal(trigger.evaluation.arms.length, 1);
  assert.equal(trigger.evals.some(({ canonical_invocation: direct }) => direct), true);
  assert.equal(trigger.evals.some(({ should_trigger: selected }) => selected), true);
  assert.equal(trigger.evals.some(({ should_trigger: selected }) => !selected), true);

  const closureExpectations = {
    'code-review': ['review-worker', 'review-coordinator', 'take-it-offline'],
    'review-worker': ['engineering-guidance', 'take-it-offline'],
    'review-coordinator': ['take-it-offline'],
  };
  for (const [owner, expected] of Object.entries(closureExpectations)) {
    const closure = readJson(`skills/${owner}/evals/package-closure.json`);
    assert.deepEqual(
      closure.cases.map(({ missing_dependency: dependency }) => dependency),
      expected,
    );
    for (const caseDefinition of closure.cases) {
      assert.equal(
        caseDefinition.expected_failure.message,
        `Missing internal dependency "${caseDefinition.missing_dependency}"`,
      );
    }
  }

  const coverage = readJson('skills/code-review/evals/contract-coverage.json');
  assert.equal(coverage.clauses.every(({ cases }) => cases.length > 0), true);
  assert.deepEqual(
    new Set(coverage.clauses.map(({ owner }) => owner)),
    new Set(['code-review', 'review-worker', 'review-coordinator']),
  );
});

function skillEvent(name, index) {
  return {
    name,
    operation: 'load',
    status: 'succeeded',
    trigger: 'host',
    callId: `review-load-${index}`,
    provenance: {
      host: 'fixture',
      mechanism: 'code-review-contract-fixture',
      eventType: 'fixture.skill-load',
      observerVersion: '1',
      statusSource: 'observed',
    },
  };
}

function artifactDescriptor(reference, mediaType = 'application/json') {
  return { reference, mediaType };
}

function reviewArtifactDescriptors(artifacts) {
  return [
    artifactDescriptor(artifacts.run_manifest),
    artifactDescriptor(artifacts.immutable_diff_package),
    ...artifacts.worker_candidate_streams.map((reference) => (
      artifactDescriptor(reference, 'application/x-ndjson')
    )),
    ...artifacts.worker_concern_coverage.map((reference) => (
      artifactDescriptor(reference)
    )),
    artifactDescriptor(artifacts.coordination_dispositions),
    artifactDescriptor(artifacts.completeness_state),
    artifactDescriptor(artifacts.markdown_brief, 'text/markdown'),
  ];
}

function reviewResult(run, requiredLoads) {
  return {
    status: 'succeeded',
    observations: {
      packageSkills: [...requiredLoads],
      hostAvailableSkills: null,
      preExecutionInventory: {
        skillDefinitions: [],
        plugins: [],
        ruleSources: [],
        packageDigest:
          'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        truncated: false,
      },
      skillEvents: requiredLoads.map(skillEvent),
      routing: {
        requestedSkill: 'code-review',
        resolvedSkills: [...requiredLoads],
      },
      responses: [{
        text: `Review brief: ${run.artifacts.markdown_brief}`,
      }],
      artifacts: reviewArtifactDescriptors(run.artifacts),
      toolUses: [],
      attemptedMutations: [],
    },
    failure: null,
    durationMs: 3,
    costUsd: 0,
    model: {
      requested: 'test-model',
      resolved: 'resolved-test-model',
    },
  };
}

test('outcome grader accepts complete artifacts and rejects unsafe or malformed runs', () => {
  const outcome = require('../skills/code-review/evals')
    .loadDefinitions(repositoryRoot)[2];
  const caseDefinition = outcome.evals[0];
  const retained = retainReview(coordinateReview(reviewInput()));
  const { run } = retained;
  const result = reviewResult(run, caseDefinition.required_skill_loads);
  const resolvedReferences = [];
  const grade = gradeCodeReviewResult({
    definition: outcome,
    caseDefinition,
    result,
    resolveArtifact(reference) {
      resolvedReferences.push(reference);
      return retained.bodies.get(reference);
    },
  });
  assert.equal(grade.passed, true);
  assert.deepEqual(
    new Set(resolvedReferences),
    new Set([
      run.artifacts.run_manifest,
      ...run.retained_artifacts.map(({ reference }) => reference),
    ]),
  );

  const withMutation = structuredClone(result);
  withMutation.observations.attemptedMutations.push({
    operation: 'issue-comment',
    target: 'issue://42',
    outcome: 'succeeded',
  });
  assert.equal(gradeCodeReviewResult({
    definition: outcome,
    caseDefinition,
    result: withMutation,
    resolveArtifact: (reference) => retained.bodies.get(reference),
  }).passed, false);

  const staleBodies = new Map(retained.bodies);
  staleBodies.set(
    run.artifacts.completeness_state,
    `${staleBodies.get(run.artifacts.completeness_state)}\n`,
  );
  assert.equal(gradeCodeReviewResult({
    definition: outcome,
    caseDefinition,
    result,
    resolveArtifact: (reference) => staleBodies.get(reference),
  }).passed, false);

  const missingConcern = reviewInput();
  missingConcern.workers[0].guidance_coverage.pop();
  assert.throws(
    () => coordinateReview(missingConcern),
    /all nine Engineering Guidance concerns/,
  );
  const wrongOrder = reviewInput();
  wrongOrder.workers[0].regions[0].analysis.reverse();
  assert.throws(
    () => coordinateReview(wrongOrder),
    /required Review level order/,
  );
  const incompleteFinding = reviewInput();
  incompleteFinding.workers[0].findings[0].evidence = [];
  assert.throws(
    () => coordinateReview(incompleteFinding),
    /evidence must not be empty/,
  );
});

test('coordination records only worker-declared region supersession', () => {
  const input = reviewInput();
  const domain = input.workers[0];
  domain.findings[0].review_level = 'Requirements & Expectations';
  domain.regions[0].analysis[1].status = 'superseded';
  domain.regions[0].analysis[2].status = 'superseded';
  domain.regions[0].supersession = {
    source_finding_id: domain.findings[0].id,
    suppressed_finding_ids: [],
    reason: 'The requirement mismatch makes lower-level review irrelevant.',
  };

  const run = coordinateReview(input);
  assert.strictEqual(validateReviewRun(run), run);
  assert.deepEqual(run.coordination.supersessions, [{
    worker_id: 'domain-worker',
    region_id: 'review-artifact',
    source_finding_id: 'domain-worker-finding',
    suppressed_finding_ids: [],
    superseded_levels: [
      'Engineering & Architecture',
      'Code Quality',
    ],
    reason: 'The requirement mismatch makes lower-level review irrelevant.',
  }]);
});

test('only a worker declaration suppresses lower-level findings in its own region', () => {
  const input = reviewInput();
  const domain = input.workers[0];
  domain.findings[0].review_level = 'Requirements & Expectations';
  const lowerFinding = {
    ...structuredClone(domain.findings[0]),
    id: 'domain-worker-lower-finding',
    review_level: 'Code Quality',
    severity: 'Minor',
    duplicate_key: 'lower-level-style',
    conclusion_key: 'lower-level-style-problem',
  };
  domain.findings.push(lowerFinding);
  domain.regions[0].analysis[1].status = 'superseded';
  domain.regions[0].analysis[2].status = 'superseded';
  domain.regions[0].supersession = {
    source_finding_id: domain.findings[0].id,
    suppressed_finding_ids: [lowerFinding.id],
    reason: 'The requirement fix materially replaces this Review region.',
  };
  domain.regions.push({
    id: 'unaffected-region',
    affected_scope: ['skills/review-worker'],
    analysis: levels.map((level) => ({
      level,
      status: 'examined',
      evidence: ['diff://base..head/unaffected-region'],
    })),
    supersession: null,
  });

  const coordinated = coordinateReview(input);
  assert.deepEqual(
    coordinated.coordination.dispositions.find(
      ({ finding_id: findingId }) => findingId === lowerFinding.id,
    ),
    {
      worker_id: 'domain-worker',
      finding_id: lowerFinding.id,
      disposition: 'superseded',
      source_finding_id: 'domain-worker-finding',
      region_id: 'review-artifact',
    },
  );
  assert.equal(
    coordinated.coordination.ordered_finding_ids.includes(lowerFinding.id),
    false,
  );
  assert.deepEqual(
    coordinated.workers[0].regions[1].analysis.map(({ status }) => status),
    ['examined', 'examined', 'examined'],
  );

  const crossWorker = structuredClone(input);
  crossWorker.workers[0].regions[0].supersession.suppressed_finding_ids = [
    'engineering-worker-finding',
  ];
  assert.throws(
    () => coordinateReview(crossWorker),
    /suppressed finding from the same worker and Review region/,
  );
});

test('coordination groups exact guidance and preserves finding and authority disagreements', () => {
  const compatible = coordinateReview(reviewInput());
  assert.equal(compatible.coordination.guidance_groups.length, concernIds.length);
  assert.deepEqual(compatible.coordination.guidance_disagreements, []);

  const input = reviewInput();
  input.workers[1].findings[0].severity = 'Minor';
  input.workers[1].guidance_coverage[0].sources = ['repository://conflicting-rule'];
  const coordinated = coordinateReview(input);

  assert.deepEqual(coordinated.coordination.groups, []);
  assert.deepEqual(
    coordinated.coordination.dispositions.map(
      ({ finding_id: findingId, disposition }) => [findingId, disposition],
    ),
    [
      ['domain-worker-finding', 'retained'],
      ['engineering-worker-finding', 'retained'],
    ],
  );
  assert.deepEqual(coordinated.coordination.disagreements, [{
    duplicate_key: 'requires-two-lenses',
    finding_ids: ['domain-worker-finding', 'engineering-worker-finding'],
    worker_ids: ['domain-worker', 'engineering-worker'],
    incompatible_fields: ['severity'],
  }]);
  assert.equal(coordinated.coordination.guidance_groups.length, concernIds.length - 1);
  assert.deepEqual(
    coordinated.coordination.guidance_disagreements.map(({ concern }) => concern),
    ['intent-and-scope'],
  );
  assert.deepEqual(
    coordinated.workers[1].guidance_coverage[0].sources,
    ['repository://conflicting-rule'],
  );

  const retained = retainReview(coordinated);
  const brief = retained.bodies.get(retained.run.artifacts.markdown_brief);
  assert.match(
    brief,
    /Finding disagreements: requires-two-lenses \(severity\)/,
  );
  assert.match(brief, /domain-worker-finding severity="Major"/);
  assert.match(brief, /engineering-worker-finding severity="Minor"/);
  assert.match(
    brief,
    /Conclusion: domain-worker concluded that two lenses are required\./,
  );
  assert.match(
    brief,
    /Evidence: .*The completeness state accepts one worker\./,
  );
  assert.match(
    brief,
    /Impact: A partial review could be presented as complete\./,
  );
  assert.match(
    brief,
    /Fix direction: Require both independent lens results before completion\./,
  );
  assert.match(
    brief,
    /Acceptance evidence: A one-lens fixture fails structural validation\./,
  );
  assert.match(brief, /Coverage: domain-worker \(Domain\)/);
  assert.match(brief, /intent-and-scope.*applicable-now/);
  assert.match(brief, /review-artifact.*Code Quality.*examined/);
  assert.match(brief, /Guidance disagreements: intent-and-scope/);
  assert.match(brief, /repository:\/\/conflicting-rule/);
});

test('compatible subgroups for one problem retain distinct coordination identities', () => {
  const input = reviewInput();
  for (const [workerId, lens, category] of [
    ['node-worker', 'Node Runtime', 'technology'],
    ['security-worker', 'Security', 'specialist'],
  ]) {
    input.review_plan.specialist_routing.push({
      lens,
      category,
      signal_references: [`diff://base..head/${workerId}`],
      capability: 'available',
      worker_id: workerId,
      context_limit: null,
    });
    const specialist = worker(workerId, lens);
    specialist.findings[0].conclusion_key = 'specialist-conclusion';
    specialist.findings[0].severity = 'Minor';
    input.workers.push(specialist);
    input.artifacts.worker_candidate_streams.push(
      `artifact://${workerId}/findings.jsonl`,
    );
    input.artifacts.worker_concern_coverage.push(
      `artifact://${workerId}/coverage.json`,
    );
  }

  const coordinated = coordinateReview(input);
  assert.equal(coordinated.coordination.groups.length, 2);
  assert.equal(
    new Set(coordinated.coordination.groups.map(({ id }) => id)).size,
    2,
  );
  assert.equal(
    new Set(coordinated.coordination.ordered_finding_ids).size,
    coordinated.coordination.ordered_finding_ids.length,
  );
});

test('finding identity and compatibility preserve confidence and evidence differences', () => {
  const input = reviewInput();
  const engineeringFinding = input.workers[1].findings[0];
  engineeringFinding.confidence_inputs.finding.rationale =
    'A different authority limits the finding.';
  engineeringFinding.evidence[0].observation =
    'Repository authority conflicts with the requirement.';

  const coordinated = coordinateReview(input);
  assert.deepEqual(coordinated.coordination.groups, []);
  assert.deepEqual(
    coordinated.coordination.disagreements[0].incompatible_fields,
    ['confidence_inputs', 'evidence'],
  );

  for (const field of ['duplicate_key', 'conclusion_key']) {
    const missingIdentity = reviewInput();
    delete missingIdentity.workers[0].findings[0][field];
    assert.throws(
      () => coordinateReview(missingIdentity),
      new RegExp(field),
    );
  }
});

test('confidence records evidence quality and explicit Context-limit effects', () => {
  const input = reviewInput();
  const findingRecord = input.workers[0].findings[0];
  findingRecord.context_limits = ['The external API contract is unavailable.'];
  findingRecord.finding_confidence = 78;
  findingRecord.fix_direction_confidence = 63;
  findingRecord.confidence_inputs.finding.context_limits = [
    'The external API contract is unavailable.',
  ];
  findingRecord.confidence_inputs.fix_direction.context_limits = [
    'The external API contract is unavailable.',
  ];
  assert.equal(coordinateReview(input).status, 'completed');

  const omittedLimit = structuredClone(input);
  omittedLimit.workers[0].findings[0]
    .confidence_inputs.fix_direction.context_limits = [];
  omittedLimit.workers[0].findings[0]
    .confidence_inputs.finding.context_limits = [];
  assert.throws(
    () => coordinateReview(omittedLimit),
    /confidence inputs must account for every Context limit/,
  );

  const unaffectedScore = structuredClone(input);
  unaffectedScore.workers[0].findings[0].fix_direction_confidence = 100;
  assert.throws(
    () => coordinateReview(unaffectedScore),
    /Context limit must reduce Fix-direction confidence/,
  );

  for (const quality of ['limited', 'conflicting']) {
    const weakDirection = reviewInput();
    const weakFinding = weakDirection.workers[0].findings[0];
    weakFinding.confidence_inputs.evidence_quality[0].quality = quality;
    weakFinding.finding_confidence = 99;
    weakFinding.fix_direction_confidence = 100;
    assert.throws(
      () => coordinateReview(weakDirection),
      /evidence quality must reduce Fix-direction confidence/,
    );
  }
});

test('contract coverage uses reciprocal scoped clause and case references', () => {
  const {
    loadContractModel,
    validateContractCoverage,
  } = require('../skills/code-review/evals/contract-coverage');
  const model = loadContractModel(repositoryRoot);
  const result = validateContractCoverage(model);

  assert.equal(result.clauses, model.coverage.clauses.length);
  assert.equal(result.cases, 20);
  for (const clause of model.coverage.clauses) {
    assert.equal(
      clause.cases.every(({ scope, id }) => (
        typeof scope === 'string' && typeof id === 'string'
      )),
      true,
    );
  }
  for (const definition of model.definitions) {
    for (const caseDefinition of definition.cases) {
      assert.equal(
        caseDefinition.covered_clauses.every(({ scope, id }) => (
          typeof scope === 'string' && typeof id === 'string'
        )),
        true,
      );
    }
  }

  const missingBackReference = structuredClone(model);
  missingBackReference.definitions[0].cases[0].covered_clauses.pop();
  assert.throws(
    () => validateContractCoverage(missingBackReference),
    /missing reciprocal clause back-reference/,
  );
  const wrongOwner = structuredClone(model);
  wrongOwner.definitions[0].owner = 'review-worker';
  assert.throws(
    () => validateContractCoverage(wrongOwner),
    /definition owner does not match case scope/,
  );
});

test('retained artifacts are resolved, content-validated, and manifest-bound', () => {
  const retained = retainReview(coordinateReview(reviewInput()));
  const resolveArtifact = (reference) => retained.bodies.get(reference);

  assert.strictEqual(
    validateRetainedArtifacts(retained.run, resolveArtifact),
    retained.run,
  );
  assert.equal(retained.run.retained_artifacts.length, 8);
  for (const descriptor of retained.run.retained_artifacts) {
    assert.equal(descriptor.run_id, retained.run.run_id);
    assert.deepEqual(
      descriptor.immutable_range,
      retained.run.ticket_outcome.immutable_range,
    );
    assert.match(descriptor.ticket_outcome_fingerprint, /^[a-f0-9]{64}$/);
    assert.match(descriptor.sha256, /^[a-f0-9]{64}$/);
  }

  const missingReference = retained.run.artifacts.completeness_state;
  assert.throws(
    () => validateRetainedArtifacts(
      retained.run,
      (reference) => (
        reference === missingReference ? null : resolveArtifact(reference)
      ),
    ),
    /retained artifact body is missing/,
  );

  const staleBodies = new Map(retained.bodies);
  const staleReference = retained.run.artifacts.coordination_dispositions;
  staleBodies.set(staleReference, `${staleBodies.get(staleReference)}\n`);
  assert.throws(
    () => validateRetainedArtifacts(
      retained.run,
      (reference) => staleBodies.get(reference),
    ),
    /retained artifact digest mismatch/,
  );

  const swappedBodies = new Map(retained.bodies);
  const [domainStream, engineeringStream] =
    retained.run.artifacts.worker_candidate_streams;
  swappedBodies.set(domainStream, retained.bodies.get(engineeringStream));
  swappedBodies.set(engineeringStream, retained.bodies.get(domainStream));
  assert.throws(
    () => validateRetainedArtifacts(
      retained.run,
      (reference) => swappedBodies.get(reference),
    ),
    /retained artifact digest mismatch/,
  );

  const inconsistentRun = structuredClone(retained.run);
  const inconsistentBodies = new Map(retained.bodies);
  const diffReference = inconsistentRun.artifacts.immutable_diff_package;
  const diffBody = JSON.parse(inconsistentBodies.get(diffReference));
  diffBody.run_id = 'different-run';
  const serialized = JSON.stringify(diffBody);
  inconsistentBodies.set(diffReference, serialized);
  inconsistentRun.retained_artifacts.find(
    ({ reference }) => reference === diffReference,
  ).sha256 = sha256(serialized);
  assert.throws(
    () => validateRetainedArtifacts(
      inconsistentRun,
      (reference) => inconsistentBodies.get(reference),
    ),
    /retained diff body does not match its run binding/,
  );
});

test('partial worker failure retains evidence but cannot produce a final brief', () => {
  const input = reviewInput();
  const failedWorker = input.workers[1];
  failedWorker.status = 'failed';
  failedWorker.failure = {
    stage: 'region-analysis',
    code: 'worker-interrupted',
    message: 'Engineering/Design worker stopped after the first region.',
    evidence: ['artifact://engineering/partial-worker.json'],
  };
  failedWorker.guidance_coverage = failedWorker.guidance_coverage.slice(0, 3);
  failedWorker.findings = [];
  input.artifacts.markdown_brief = null;

  const run = coordinateReview(input);
  assert.equal(run.status, 'incomplete');
  assert.equal(run.completeness.state, 'incomplete');
  assert.deepEqual(
    run.completeness.checks.map(({ id }) => id),
    [
      'complete-ticket-outcome',
      'planned-review-lenses',
      'independent-guidance-coverage',
      'ordered-region-analysis',
      'complete-finding-records',
      'inspectable-artifacts',
    ],
  );
  assert.equal(
    run.completeness.checks.find(
      ({ id }) => id === 'planned-review-lenses',
    ).state,
    'failed',
  );
  assert.deepEqual(run.failures, [{
    worker_id: 'engineering-worker',
    lens: 'Engineering/Design',
    ...failedWorker.failure,
  }]);
  assert.equal(run.artifacts.markdown_brief, null);
  assert.equal(run.workers[1].guidance_coverage.length, 3);

  const retained = retainReview(run);
  assert.strictEqual(validateReviewRun(retained.run), retained.run);
  assert.strictEqual(
    validateRetainedArtifacts(
      retained.run,
      (reference) => retained.bodies.get(reference),
    ),
    retained.run,
  );
  assert.equal(
    retained.run.retained_artifacts.some(
      ({ kind }) => kind === 'markdown-brief',
    ),
    false,
  );
  assert.equal(retained.run.retained_artifacts.length, 7);

  const arbitraryCheck = structuredClone(run);
  arbitraryCheck.completeness.checks[0].id = 'some-check-ran';
  assert.throws(
    () => validateReviewRun(arbitraryCheck),
    /exact required members/,
  );
  const incompleteWithBrief = structuredClone(run);
  incompleteWithBrief.artifacts.markdown_brief = 'artifact://unsafe-brief.md';
  assert.throws(
    () => validateReviewRun(incompleteWithBrief),
    /must not declare a Markdown brief/,
  );

  const failedBeforeAnalysis = reviewInput();
  const earlyWorker = failedBeforeAnalysis.workers[0];
  earlyWorker.status = 'failed';
  earlyWorker.failure = {
    stage: 'guidance',
    code: 'guidance-unavailable',
    message: 'Domain worker could not complete Engineering Guidance.',
    evidence: ['artifact://domain/guidance-failure.json'],
  };
  earlyWorker.guidance_coverage = [];
  earlyWorker.regions = [];
  earlyWorker.findings = [];
  failedBeforeAnalysis.artifacts.markdown_brief = null;
  const earlyRun = coordinateReview(failedBeforeAnalysis);
  assert.equal(earlyRun.status, 'incomplete');
  assert.equal(earlyRun.workers[0].regions.length, 0);
  assert.equal(earlyRun.failures[0].stage, 'guidance');
});

test('supersession source is an examined higher-level finding in the same region', () => {
  const crossRegion = reviewInput();
  const crossRegionWorker = crossRegion.workers[0];
  crossRegionWorker.regions.push({
    id: 'second-region',
    affected_scope: ['skills/review-worker'],
    analysis: levels.map((level, index) => ({
      level,
      status: index === 0 ? 'examined' : 'superseded',
      evidence: ['diff://base..head/second-region'],
    })),
    supersession: {
      source_finding_id: crossRegionWorker.findings[0].id,
      suppressed_finding_ids: [],
      reason: 'A different region cannot supply this supersession.',
    },
  });
  crossRegionWorker.findings[0].review_level = 'Requirements & Expectations';
  assert.throws(
    () => coordinateReview(crossRegion),
    /supersession source must belong to the same Review region/,
  );

  const invalidLevel = reviewInput();
  const invalidLevelWorker = invalidLevel.workers[0];
  invalidLevelWorker.regions[0].analysis[1].status = 'superseded';
  invalidLevelWorker.regions[0].analysis[2].status = 'superseded';
  invalidLevelWorker.regions[0].supersession = {
    source_finding_id: invalidLevelWorker.findings[0].id,
    suppressed_finding_ids: [],
    reason: 'The source finding is not at a preceding higher level.',
  };
  invalidLevelWorker.findings[0].review_level = 'Code Quality';
  assert.throws(
    () => coordinateReview(invalidLevel),
    /supersession source must be an examined higher Review level/,
  );
});

test('role and outcome cases reference one committed nontrivial review scenario', () => {
  const caseFiles = [
    readJson('skills/code-review/evals/role.json').evals[0].files,
    readJson('skills/code-review/evals/outcome.json').evals[0].files,
    readJson('skills/review-worker/evals/role.json').evals[0].files,
    readJson('skills/review-coordinator/evals/role.json').evals[0].files,
  ];
  for (const files of caseFiles) {
    assert.equal(files.length >= 6, true);
    for (const relativePath of files) {
      assert.equal(
        fs.existsSync(path.join(repositoryRoot, relativePath)),
        true,
        relativePath,
      );
    }
  }

  const scenarioRoot = 'test/fixtures/code-review/scenario';
  const ticket = readJson(`${scenarioRoot}/ticket-outcome.json`);
  const defects = readJson(`${scenarioRoot}/seeded-defects.json`);
  const diff = fs.readFileSync(
    path.join(repositoryRoot, scenarioRoot, 'diff.patch'),
    'utf8',
  );
  assert.deepEqual(ticket.requirements, ['requirements.md']);
  assert.deepEqual(ticket.validation_evidence, ['validation.json']);
  assert.equal(defects.defects.length, 2);
  assert.match(diff, /calculateDiscount/);
  assert.match(diff, /subtotal >= 100/);
});

function runHardeningCase({ input: caseInput, expected }) {
  const { scenario } = caseInput;

  if (scenario === 'combined') {
    const input = reviewInput();
    input.review_plan = reviewPlan('combined');
    for (const dimension of caseInput.changed_dimensions) {
      input.review_plan.consolidation.evidence.find(
        (record) => record.dimension === dimension,
      ).unchanged = false;
    }
    input.workers = [worker('combined-worker', 'Combined')];
    input.artifacts.worker_candidate_streams = [
      'artifact://combined/findings.jsonl',
    ];
    input.artifacts.worker_concern_coverage = [
      'artifact://combined/coverage.json',
    ];
    assert.throws(() => coordinateReview(input), new RegExp(expected.error));
    return;
  }

  if (scenario === 'unavailable-specialist') {
    const input = reviewInput();
    input.review_plan.specialist_routing.push({
      lens: caseInput.lens,
      category: caseInput.category,
      signal_references: [caseInput.signal_reference],
      capability: 'unavailable',
      worker_id: null,
      context_limit: caseInput.context_limit,
    });
    const retained = retainReview(coordinateReview(input));
    assert.equal(retained.run.status, expected.status);
    assert.deepEqual(
      retained.run.coordination.coverage_union.lenses,
      expected.lenses,
    );
    assert.deepEqual(
      retained.run.review_plan.specialist_routing.map(
        ({ context_limit: contextLimit }) => contextLimit,
      ),
      expected.context_limits,
    );
    assert.equal(
      retained.run.retained_artifacts.length,
      expected.retained_artifact_count,
    );
    return;
  }

  if (scenario === 'disagreement') {
    const input = reviewInput();
    input.workers[1].findings[0].severity = caseInput.engineering_severity;
    input.workers[1].guidance_coverage[0].sources = [
      caseInput.engineering_guidance_source,
    ];
    const retained = retainReview(coordinateReview(input));
    assert.equal(retained.run.coordination.groups.length, expected.group_count);
    assert.deepEqual(
      retained.run.coordination.disagreements[0].incompatible_fields,
      expected.finding_fields,
    );
    assert.deepEqual(
      retained.run.coordination.guidance_disagreements.map(
        ({ concern }) => concern,
      ),
      expected.guidance_concerns,
    );
    const brief = retained.bodies.get(retained.run.artifacts.markdown_brief);
    for (const text of expected.brief_includes) assert.ok(brief.includes(text));
    return;
  }

  if (scenario === 'supersession') {
    const input = reviewInput();
    const domainWorker = input.workers[0];
    domainWorker.findings[0].review_level = caseInput.source_level;
    const suppressedFinding = {
      ...structuredClone(domainWorker.findings[0]),
      id: 'matrix-lower-finding',
      review_level: caseInput.suppressed_level,
      severity: 'Minor',
      duplicate_key: 'matrix-lower-problem',
      conclusion_key: 'matrix-lower-conclusion',
    };
    domainWorker.findings.push(suppressedFinding);
    domainWorker.regions[0].analysis[1].status = 'superseded';
    domainWorker.regions[0].analysis[2].status = 'superseded';
    domainWorker.regions[0].supersession = {
      source_finding_id: domainWorker.findings[0].id,
      suppressed_finding_ids: [suppressedFinding.id],
      reason: 'The source finding materially replaces this Review region.',
    };
    domainWorker.regions.push({
      id: caseInput.unaffected_region,
      affected_scope: ['skills/review-worker'],
      analysis: levels.map((level) => ({
        level,
        status: 'examined',
        evidence: ['diff://base..head/unaffected-region'],
      })),
      supersession: null,
    });
    const run = coordinateReview(input);
    assert.equal(
      run.coordination.dispositions.find(
        ({ finding_id: findingId }) => findingId === suppressedFinding.id,
      ).disposition,
      expected.suppressed_disposition,
    );
    assert.deepEqual(
      run.workers[0].regions.find(
        ({ id }) => id === caseInput.unaffected_region,
      ).analysis.map(({ status }) => status),
      expected.unaffected_statuses,
    );
    return;
  }

  if (scenario === 'confidence') {
    const input = reviewInput();
    const finding = input.workers[0].findings[0];
    finding.confidence_inputs.evidence_quality[0].quality =
      caseInput.evidence_quality;
    finding.finding_confidence = caseInput.finding_confidence;
    finding.fix_direction_confidence =
      caseInput.fix_direction_confidence;
    assert.throws(() => coordinateReview(input), new RegExp(expected.error));
    return;
  }

  if (scenario === 'worker-failure') {
    const input = reviewInput();
    const failedWorker = input.workers.find(
      ({ id }) => id === caseInput.worker_id,
    );
    failedWorker.status = 'failed';
    failedWorker.failure = {
      stage: 'region-analysis',
      code: 'worker-interrupted',
      message: 'Worker stopped after partial analysis.',
      evidence: ['artifact://worker/partial.json'],
    };
    failedWorker.guidance_coverage = failedWorker.guidance_coverage.slice(
      0,
      caseInput.retained_guidance_records,
    );
    failedWorker.findings = [];
    input.artifacts.markdown_brief = null;
    const retained = retainReview(coordinateReview(input));
    assert.equal(retained.run.status, expected.status);
    assert.equal(retained.run.artifacts.markdown_brief, expected.markdown_brief);
    assert.equal(
      retained.run.retained_artifacts.length,
      expected.retained_artifact_count,
    );
    return;
  }

  if (scenario === 'ordinary') {
    const run = coordinateReview(reviewInput());
    assert.equal(run.status, expected.status);
    assert.deepEqual(run.coordination.coverage_union.lenses, expected.lenses);
    assert.deepEqual(
      run.workers[0].regions[0].analysis.map(({ level }) => level),
      expected.review_levels,
    );
    return;
  }

  if (scenario === 'package-closure') {
    const missingDependencies = new Set();
    for (const relativePath of caseInput.closure_files) {
      for (const closureCase of readJson(relativePath).cases) {
        missingDependencies.add(closureCase.missing_dependency);
        assert.equal(
          closureCase.expected_failure.message,
          `Missing internal dependency "${closureCase.missing_dependency}"`,
        );
      }
    }
    assert.deepEqual([...missingDependencies], expected.missing_dependencies);
    return;
  }

  assert.fail(`unknown hardening scenario ${scenario}`);
}

test('committed seeded and clean-negative cases replay every hardening branch', () => {
  const relativePath = 'test/fixtures/code-review/hardening-cases.json';
  const fixture = readJson(relativePath);
  const expectedBranches = [
    'mechanical-consolidation',
    'dynamic-specialist-routing',
    'worker-disagreement',
    'worker-supersession',
    'review-region-suppression',
    'confidence-context-limits',
    'partial-worker-failure',
    'artifact-exposure',
    'ordinary-nontrivial-preservation',
    'production-dependency-boundary',
  ];
  assert.equal(fixture.schema, 'code-review-hardening-cases/v2');
  assert.deepEqual(
    new Set(fixture.cases.flatMap(({ branches }) => branches)),
    new Set(expectedBranches),
  );
  assert.equal(fixture.cases.some(({ kind }) => kind === 'seeded'), true);
  assert.equal(fixture.cases.some(({ kind }) => kind === 'clean-negative'), true);
  assert.equal(
    fixture.cases.every(({ input, expected }) => input && expected),
    true,
  );
  for (const caseDefinition of fixture.cases) runHardeningCase(caseDefinition);

  const definitions = [
    require('../skills/code-review/evals').loadDefinitions(repositoryRoot)[0],
    require('../skills/code-review/evals').loadDefinitions(repositoryRoot)[2],
    require('../skills/review-worker/evals').loadDefinitions(repositoryRoot)[0],
    require('../skills/review-coordinator/evals').loadDefinitions(repositoryRoot)[0],
  ];
  assert.equal(
    definitions.every(({ evals }) => (
      evals[0].files.includes(relativePath)
    )),
    true,
  );
});
