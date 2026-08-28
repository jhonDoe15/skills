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
const {
  coordinateReview,
  validateReviewRun,
} = require('../skills/code-review/evals/review-artifact');

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
  assert.match(codeReview, /one-lens result.*structurally invalid/is);
  assert.match(codeReview, /read-only/i);
  assert.match(codeReview, /run manifest/);
  assert.match(codeReview, /immutable diff package/);
  assert.match(codeReview, /candidate streams/);
  assert.match(codeReview, /concern coverage/);
  assert.match(codeReview, /coordination dispositions/);
  assert.match(codeReview, /completeness state/);
  assert.match(codeReview, /Markdown brief/);

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

  assert.match(coordinator, /validates? structure/i);
  assert.match(coordinator, /groups? compatible duplicates/i);
  assert.match(coordinator, /sorts? findings/i);
  assert.match(coordinator, /unions? coverage/i);
  assert.match(coordinator, /preserves? worker conclusions/i);
  assert.match(coordinator, /does not.*second review/is);
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
    impact: 'A partial review could be presented as complete.',
    affected_scope: ['skills/code-review'],
    highest_actionable_fix_direction:
      'Require both independent lens results before completion.',
    acceptance_evidence: [
      'A one-lens fixture fails structural validation.',
    ],
    conclusion: `${workerId} concluded that two lenses are required.`,
    duplicate_key: 'requires-two-lenses',
  };
}

function immutableRange() {
  return {
    base: 'a'.repeat(40),
    head: 'b'.repeat(40),
  };
}

function worker(id, lens) {
  return {
    id,
    lens,
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
  const run = coordinateReview(reviewInput());
  const result = reviewResult(run, caseDefinition.required_skill_loads);
  const grade = gradeCodeReviewResult({
    definition: outcome,
    caseDefinition,
    result,
    resolveReviewRun(reference) {
      return reference === run.artifacts.run_manifest ? run : null;
    },
  });
  assert.equal(grade.passed, true);

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
    resolveReviewRun: () => run,
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
    reason: 'The requirement mismatch makes lower-level review irrelevant.',
  };

  const run = coordinateReview(input);
  assert.strictEqual(validateReviewRun(run), run);
  assert.deepEqual(run.coordination.supersessions, [{
    worker_id: 'domain-worker',
    region_id: 'review-artifact',
    source_finding_id: 'domain-worker-finding',
    superseded_levels: [
      'Engineering & Architecture',
      'Code Quality',
    ],
    reason: 'The requirement mismatch makes lower-level review irrelevant.',
  }]);
});
