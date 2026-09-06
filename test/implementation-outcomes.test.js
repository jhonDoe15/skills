'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  BlueprintContractError,
  validateImplementationBlueprint,
} = require('../suite/adoption/blueprint');
const {
  createImplementationOutcomePlan,
  createPairManifest,
  createRunIndex,
  validateRunIndex,
} = require('../suite/adoption/implementation-outcomes');
const {
  runPairWorkflow,
} = require('../suite/adoption/implementation-outcome-runner');
const {
  createCursorCloudAdapter,
} = require('../suite/adapters/cursor-cloud');
const {
  createCursorWorkspaceAdapter,
} = require('../suite/adapters/cursor-workspace');
const {
  createTrustedVerifier,
} = require('../suite/adoption/trusted-verification');
const {
  loadImplementationOutcomeHoldouts,
  publicCaseInputs,
} = require('../suite/adoption/implementation-outcome-holdouts');
const {
  gradeOutcomePair,
  replayOutcomeGrades,
} = require('../suite/adoption/implementation-outcome-grading');
const {
  buildPlan,
  replayOutcomeCampaign,
  runOutcomeCampaign,
} = require('../suite/adoption/implementation-outcome-campaign');
const {
  createLocalOutcomeStageExecutor,
  materializeLocalOutcomeRepository,
} = require('../suite/adoption/implementation-outcome-local');
const {
  parseJudgeOutput,
} = require('../suite/adoption/implementation-outcome-live');

const BASE = '0123456789abcdef0123456789abcdef01234567';
const PASSING_DIMENSIONS = Object.freeze({
  requirement_fidelity: 2,
  architecture: 2,
  maintainability: 2,
  test_quality: 2,
  scope_discipline: 2,
  cross_ticket_coherence: 2,
});

test('blind judge parser accepts the first complete JSON object', () => {
  const judgment = {
    findings: [],
    dimensions: PASSING_DIMENSIONS,
  };
  assert.deepEqual(
    parseJudgeOutput(`${JSON.stringify(judgment)}\n${JSON.stringify(judgment)}`),
    judgment,
  );
});
const repositoryRoot = path.resolve(__dirname, '..');

function validBlueprint() {
  return `Before
<!-- implementation-blueprint:v1 -->
# Implementation blueprint

- Status: ready
- Revision: rev-1
- Implementation ticket: TICKET-1
- Source requirements: SPEC-1
- Repository: fixture
- Implementation base: \`${BASE}\`
- Engineering baseline: baseline-1
- Evidence checked at: 2026-09-04T00:00:00Z
- Planning owner: planner-1

## Outcome and scope
### Intended outcome
Users can normalize one value.
### In scope
- Normalize values.
### Out of scope
- Persistence.
### Acceptance and requirement ledger
- R1 — Normalize values
  - Design: D1
  - Proof: T1
### Prerequisites and constraints
- None.

## Evidence and uncertainty
### Authority ledger
- AU1 — SPEC-1
### Repository evidence
- E1 — \`src/value.js:1-5\`
### Search and coverage ledger
- Q1 — normalization path
### Engineering-baseline applicability
- Deep modules: applicable
### Investigation provenance
- Spec
### Assumptions
- A1 — Node is available
  - Class: verified
### Decision envelopes
- None.
### Decisions
- D1 — Normalize at the public function
### Open decisions and rabbit holes
- None.

## Technical design plan
### Current behavior
Values pass through unchanged.
### Proposed behavior
Values are normalized at the public seam.
### Ownership and invariants
- I1 — normalized output: owner value module; enforced at normalize; proof T1
### Modules, interfaces, and seams
- M1 — value module
### State and lifecycle
- Normal: return normalized value.
### Scenario ledger
- SC1 — valid input
### Effects and boundaries
- Persistence/data: not applicable.
### Change map
- Change: \`src/value.js\` — normalize
### Durable provenance
- DP1 — normalization belongs at the public seam
### Implementation slices
1. S1 — normalize one value
   - Design decisions: D1
   - Files/symbols: \`src/value.js\`
   - Proof IDs: T1
### Alternatives considered
- ALT1 — caller normalization
### Diagrams
Not applicable.

## TDD test plan
### Approved test seams
- TS1 — normalize(value)
### Command admission
- CMD1 — \`node --test test/value.test.js\`
### Characterization locks
- C1 — existing pass-through behavior
### Vertical red-green slices
1. T1 — normalizes one value
   - Implements design slice: S1
   - Focused red/green command: CMD1
   - Relevant regression command: CMD1
### Integration and non-unit proof
- P1 — public module import
### Regression and build gates
1. CMD1 — focused and regression gate
### Traceability
- R1 → T1
- I1 → T1

## Review record
### Revision history
- rev-1: integrated and reread
### Initial technical-design review
- Spec: PASS on rev-1 — evidence
- Standards: PASS on rev-1 — evidence
- Architecture dynamic behavior: PASS on rev-1 — evidence
- Architecture static structure: PASS on rev-1 — evidence
- Uncle Bob/Clean Architecture: PASS on rev-1 — evidence
- John Ousterhout/APOSD: PASS on rev-1 — evidence
### Findings and dispositions
- None.
### Final independent review
- Spec: PASS on rev-1 — evidence
- Standards: PASS on rev-1 — evidence
- Architecture dynamic behavior: PASS on rev-1 — evidence
- Architecture static structure: PASS on rev-1 — evidence
- Uncle Bob/Clean Architecture: PASS on rev-1 — evidence
- John Ousterhout/APOSD: PASS on rev-1 — evidence

## Implementation start
- Gate: enabled
- Start from: \`${BASE}\`
- Invoke: \`implement\` with this ticket and both normative plans
- TDD owner: invoke \`tdd\`
- Proof order: C1, T1, P1, CMD1
- Per-slice loop: red → green
- First slice: S1
- Plan freshness check: base and ticket
- Return to planning when: assumptions fail
- Context disposition: fresh isolated implementation session

## Blockers
- None
<!-- /implementation-blueprint -->
After`;
}

test('validates a complete ready implementation blueprint', () => {
  const blueprint = validateImplementationBlueprint(validBlueprint());
  assert.equal(blueprint.status, 'ready');
  assert.equal(blueprint.revision, 'rev-1');
  assert.equal(blueprint.implementationBase, BASE);
  assert.deepEqual(blueprint.designSlices, ['S1']);
  assert.deepEqual(blueprint.testSlices, ['T1']);
  assert.deepEqual(blueprint.commands, ['CMD1']);
});

test('leaves semantic quality to the evaluator', () => {
  const blueprint = validBlueprint().replace(
    'Users can normalize one value.',
    'Semantically ungraded prose.',
  );
  assert.doesNotThrow(() => validateImplementationBlueprint(blueprint));
});

test('accepts concrete initial findings before final PASS reviews', () => {
  const blueprint = validBlueprint().replace(
    '- Spec: PASS on rev-1 — evidence',
    '- Spec: F1 on rev-1 — missing explicit RangeError behavior',
  );
  assert.doesNotThrow(() => validateImplementationBlueprint(blueprint));
});

test('accepts reviewer links as evidence rather than placeholders', () => {
  const blueprint = validBlueprint()
    .replace(
      '- Spec: PASS on rev-1 — evidence',
      '- Spec: PASS on rev-1 — [reviewer](review-id); evidence',
    )
    .replace(
      '### Final independent review\n- Spec: PASS on rev-1 — evidence',
      '### Final independent review\n'
        + '- Spec: PASS on rev-1 — [reviewer](review-id); evidence',
    );
  assert.doesNotThrow(() => validateImplementationBlueprint(blueprint));
});

test('rejects bracketed evidence that is not a complete Markdown link', () => {
  const invalidEvidence = ['[evidence]', '[]', '[reviewer](', 'reviewer]'];
  for (const evidence of invalidEvidence) {
    const blueprint = validBlueprint().replace(
      '- Spec: PASS on rev-1 — evidence',
      `- Spec: PASS on rev-1 — ${evidence}`,
    );
    assert.throws(
      () => validateImplementationBlueprint(blueprint),
      /Initial technical-design review.*Spec/,
    );
  }
});

test('allows bounded publication-only notes on a ready draft', () => {
  const notes = [
    'Ticket publication requires explicit write authorization.',
    'Ticket publication was unavailable.',
    'Ticket publication write is prohibited.',
    'Publication is intentionally unavailable: this block was not written '
      + 'to `TICKET-1` because repository edits were prohibited.',
  ];
  for (const note of notes) {
    const blueprint = validBlueprint().replace(
      '- None\n<!-- /implementation-blueprint -->',
      `- None for technical planning.\n- ${note}\n`
        + '<!-- /implementation-blueprint -->',
    );
    assert.equal(validateImplementationBlueprint(blueprint).status, 'ready');
  }
});

test('accepts no blockers declared for technical design', () => {
  const blueprint = validBlueprint().replace(
    '- None\n<!-- /implementation-blueprint -->',
    '- None for technical design.\n<!-- /implementation-blueprint -->',
  );
  assert.doesNotThrow(() => validateImplementationBlueprint(blueprint));
});

test('allows a ready gate explanation and first TDD slice', () => {
  const blueprint = validBlueprint()
    .replace(
      '- Gate: enabled',
      '- Gate: enabled for a future session carrying this blueprint.',
    )
    .replace('- First slice: S1', '- First slice: T1.');
  assert.doesNotThrow(() => validateImplementationBlueprint(blueprint));
});

test('rejects a conditionally enabled implementation gate', () => {
  const conditionalGates = [
    'enabled once the owner settles DE1.',
    'enabled if the owner settles DE1.',
    'enabled unless the owner objects.',
    'enabled subject to owner approval.',
  ];
  for (const gate of conditionalGates) {
    const blueprint = validBlueprint().replace(
      '- Gate: enabled',
      `- Gate: ${gate}`,
    );
    assert.throws(
      () => validateImplementationBlueprint(blueprint),
      /implementation gate must be enabled/,
    );
  }
});

test('rejects a first slice embedded in arbitrary prose', () => {
  const blueprint = validBlueprint().replace(
    '- First slice: S1',
    '- First slice: begin with declared slice S1 after approval.',
  );
  assert.throws(
    () => validateImplementationBlueprint(blueprint),
    /unknown first slice/,
  );
});

test('rejects a ready draft with an implementation blocker', () => {
  const blueprint = validBlueprint().replace(
    '- None\n<!-- /implementation-blueprint -->',
    '- None for technical planning.\n'
      + '- Database capability remains unavailable.\n'
      + '<!-- /implementation-blueprint -->',
  );
  assert.throws(
    () => validateImplementationBlueprint(blueprint),
    /no implementation blockers/,
  );
});

test('rejects arbitrary blockers disguised as publication notes', () => {
  const blockerEntries = [
    '- Publication is blocked because the database is unavailable.',
    '- Ticket publication write is unavailable because database capability is missing.',
    '- Ticket publication is blocked by a prohibited schema write.',
    '- Publication is intentionally unavailable: this block was not written '
      + 'to `other.md` because repository edits were prohibited.',
    '- Publication is intentionally unavailable: this block was not written '
      + 'to `TICKET` because repository edits were prohibited.',
    'Database capability remains unavailable.',
  ];
  for (const blockerEntry of blockerEntries) {
    const blueprint = validBlueprint().replace(
      '- None\n<!-- /implementation-blueprint -->',
      `- None for technical planning.\n${blockerEntry}\n`
        + '<!-- /implementation-blueprint -->',
    );
    assert.throws(
      () => validateImplementationBlueprint(blueprint),
      /no implementation blockers/,
    );
  }
});

const invalidBlueprints = [
  {
    name: 'requires one canonical marked block',
    mutate(source) {
      return source.replace('<!-- /implementation-blueprint -->', '');
    },
    pattern: /closing marker/,
  },
  {
    name: 'requires ready status',
    mutate(source) {
      return source.replace('- Status: ready', '- Status: needs-decision');
    },
    pattern: /status must be ready/,
  },
  {
    name: 'rejects duplicate declared IDs',
    mutate(source) {
      return source.replace('- P1 — public module import', '- T1 — duplicate');
    },
    pattern: /duplicate declared ID "T1"/,
  },
  {
    name: 'rejects dangling command references',
    mutate(source) {
      return source.replace(
        '- Focused red/green command: CMD1',
        '- Focused red/green command: CMD9',
      );
    },
    pattern: /unknown command "CMD9"/,
  },
  {
    name: 'rejects placeholder initial review findings',
    mutate(source) {
      return source.replace(
        '- Spec: PASS on rev-1 — evidence',
        '- Spec: [finding IDs] on [revision] — [evidence]',
      );
    },
    pattern: /Initial technical-design review.*Spec/,
  },
  {
    name: 'rejects non-concrete initial review results',
    mutate(source) {
      return source.replace(
        '- Spec: PASS on rev-1 — evidence',
        '- Spec: future review result',
      );
    },
    pattern: /Initial technical-design review.*Spec/,
  },
  {
    name: 'requires all mandatory final reviewers',
    mutate(source) {
      return source.replace(
        '- John Ousterhout/APOSD: PASS on rev-1 — evidence\n\n## Implementation start',
        '## Implementation start',
      );
    },
    pattern: /Final independent review.*John Ousterhout\/APOSD/s,
  },
  {
    name: 'requires PASS from every final reviewer',
    mutate(source) {
      return source.replace(
        '### Final independent review\n- Spec: PASS on rev-1 — evidence',
        '### Final independent review\n'
          + '- Spec: F1 on rev-1 — unresolved RangeError behavior',
      );
    },
    pattern: /Final independent review.*Spec/,
  },
  {
    name: 'requires evidence on every final PASS',
    mutate(source) {
      return source.replace(
        '### Final independent review\n- Spec: PASS on rev-1 — evidence',
        '### Final independent review\n- Spec: PASS',
      );
    },
    pattern: /Final independent review.*Spec/,
  },
  {
    name: 'requires enabled implementation start',
    mutate(source) {
      return source.replace('- Gate: enabled', '- Gate: blocked');
    },
    pattern: /implementation gate must be enabled/,
  },
];

for (const { name, mutate, pattern } of invalidBlueprints) {
  test(name, () => {
    assert.throws(
      () => validateImplementationBlueprint(mutate(validBlueprint())),
      (error) => (
        error instanceof BlueprintContractError && pattern.test(error.message)
      ),
    );
  });
}

function outcomePlan() {
  return createImplementationOutcomePlan({
    candidateRevision: BASE,
    repetitions: 2,
    randomizationSeed: 'outcome-test-v1',
    models: {
      planner: {
        id: 'cursor-luna',
        params: [{ id: 'reasoning_effort', value: 'high' }],
      },
      implementer: {
        id: 'cursor-terra',
        params: [{ id: 'reasoning_effort', value: 'high' }],
      },
      judge: {
        id: 'cursor-luna',
        params: [{ id: 'reasoning_effort', value: 'max' }],
      },
    },
    cases: [{
      id: 'feature-case',
      repositoryUrl: 'https://github.com/example/outcome-fixture',
      baseRevision: BASE,
      fixtureDigest: 'a'.repeat(64),
      sourceDigest: 'b'.repeat(64),
      oracleDigest: 'c'.repeat(64),
      tickets: [
        {
          id: 'shared-contract',
          blockers: [],
          collisions: [],
          ticketDigest: 'd'.repeat(64),
        },
        {
          id: 'independent-path',
          blockers: [],
          collisions: ['shared-file-path'],
          ticketDigest: 'e'.repeat(64),
        },
        {
          id: 'colliding-path',
          blockers: [],
          collisions: ['shared-file-path'],
          ticketDigest: 'f'.repeat(64),
        },
        {
          id: 'consumer',
          blockers: ['shared-contract'],
          collisions: [],
          ticketDigest: '1'.repeat(64),
        },
      ],
    }],
  });
}

test('creates stable paired manifests with randomized arm order', () => {
  const plan = outcomePlan();
  const first = createPairManifest(plan, 'feature-case', 1);
  const repeated = createPairManifest(plan, 'feature-case', 1);
  const second = createPairManifest(plan, 'feature-case', 2);
  assert.deepEqual(first, repeated);
  assert.deepEqual([...first.armOrder].sort(), ['baseline', 'treatment']);
  assert.notEqual(first.fingerprint, second.fingerprint);
});

test('runs ticket frontiers, serializes collisions, and checkpoints stages', async () => {
  const plan = outcomePlan();
  const pair = createPairManifest(plan, 'feature-case', 1);
  let index = createRunIndex(plan, pair);
  const events = [];
  const active = new Set();

  index = await runPairWorkflow({
    plan,
    pair,
    index,
    async executeStage(coordinates) {
      const identity = [
        coordinates.arm,
        coordinates.stage,
        coordinates.ticketId,
      ].filter(Boolean).join(':');
      if (coordinates.stage === 'implementation') {
        for (const running of active) {
          assert.notDeepEqual(
            [coordinates.ticketId, running].sort(),
            ['colliding-path', 'independent-path'],
          );
        }
        active.add(coordinates.ticketId);
        await new Promise((resolve) => setImmediate(resolve));
        active.delete(coordinates.ticketId);
      }
      events.push(identity);
      return {
        disposition: coordinates.arm === 'baseline'
          && coordinates.stage === 'planning'
          ? 'not-required'
          : 'executed',
        inputFingerprint: '2'.repeat(64),
        outputFingerprint: '3'.repeat(64),
        evidencePointer: `artifact://${identity}`,
      };
    },
    persist(next) {
      index = next;
    },
  });

  assert.equal(index.complete, true);
  assert.doesNotThrow(() => validateRunIndex(index, plan, pair));
  for (const arm of ['baseline', 'treatment']) {
    assert.ok(
      events.indexOf(`${arm}:merge:shared-contract`)
        < events.indexOf(`${arm}:implementation:consumer`),
    );
  }
});

test('resume skips complete immutable stage checkpoints', async () => {
  const plan = outcomePlan();
  const pair = createPairManifest(plan, 'feature-case', 1);
  let index = createRunIndex(plan, pair);
  let calls = 0;
  const executeStage = async (coordinates) => {
    calls += 1;
    return {
      disposition: 'executed',
      inputFingerprint: '4'.repeat(64),
      outputFingerprint: '5'.repeat(64),
      evidencePointer: `artifact://${coordinates.stage}-${calls}`,
    };
  };
  index = await runPairWorkflow({
    plan,
    pair,
    index,
    executeStage,
  });
  const completedCalls = calls;
  index = await runPairWorkflow({
    plan,
    pair,
    index,
    executeStage,
  });
  assert.equal(calls, completedCalls);
  assert.equal(index.complete, true);

  const tampered = structuredClone(index);
  tampered.checkpoints[0].outputFingerprint = '6'.repeat(64);
  assert.throws(
    () => validateRunIndex(tampered, plan, pair),
    /fingerprint mismatch/,
  );
});

test('Cursor Cloud adapter pins repository, model, branch, and run evidence', async () => {
  const created = [];
  const archived = [];
  let disposed = false;
  const adapter = createCursorCloudAdapter({
    apiKey: 'fixture-key',
    async sdkLoader() {
      return {
        Cursor: {
          models: {
            async list() {
              return [{
                id: 'cursor-terra',
                parameters: [{
                  id: 'reasoning_effort',
                  values: [{ value: 'high' }],
                }],
              }];
            },
          },
        },
        Agent: {
          async create(options) {
            created.push(options);
            return {
              agentId: 'bc-fixture',
              async send() {
                return {
                  id: 'run-fixture',
                  requestId: 'request-fixture',
                  async *stream() {
                    yield {
                      type: 'tool_call',
                      name: 'ReadFile',
                      status: 'completed',
                      args: {
                        path: '.cursor/skills/code-review/SKILL.md',
                      },
                    };
                  },
                  async wait() {
                    return {
                      id: 'run-fixture',
                      requestId: 'request-fixture',
                      status: 'finished',
                      result: 'Implementation complete.',
                      model: {
                        id: 'cursor-terra',
                        params: [{
                          id: 'reasoning_effort',
                          value: 'high',
                        }],
                      },
                      durationMs: 120,
                      git: {
                        branches: [{
                          repoUrl: 'https://github.com/example/outcome-fixture',
                          branch: 'cursor/feature-case',
                          prUrl: 'https://github.com/example/outcome-fixture/pull/1',
                        }],
                      },
                    };
                  },
                };
              },
              async getUsage() {
                return { cost: { chargedCents: 12 } };
              },
              async [Symbol.asyncDispose]() {
                disposed = true;
              },
            };
          },
          async archive(agentId) {
            archived.push(agentId);
          },
        },
      };
    },
    async resolveGitHead() {
      return {
        headRevision: '7'.repeat(40),
        baseBranch: 'eval/feature-case/treatment',
      };
    },
  });

  const result = await adapter.execute({
    prompt: 'Implement the ticket.',
    model: {
      id: 'cursor-terra',
      params: [{ id: 'reasoning_effort', value: 'high' }],
    },
    repositoryUrl: 'https://github.com/example/outcome-fixture',
    startingRef: 'eval/feature-case/treatment',
    autoCreatePR: true,
    metadata: { case_id: 'feature-case' },
  });

  assert.equal(result.status, 'succeeded');
  assert.equal(result.costUsd, 0.12);
  assert.equal(result.git.headRevision, '7'.repeat(40));
  assert.deepEqual(result.skillLoads, ['code-review']);
  assert.equal(result.reviewLoads, 1);
  assert.equal(created[0].cloud.repos[0].startingRef,
    'eval/feature-case/treatment');
  assert.equal(created[0].cloud.skipReviewerRequest, true);
  assert.equal(disposed, true);
  assert.deepEqual(archived, ['bc-fixture']);
});

test('Cursor workspace adapter preserves a committed local implementation', async (t) => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-workspace-'));
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }));
  const git = (...args) => spawnSync('git', args, {
    cwd: workspace,
    encoding: 'utf8',
  });
  git('init', '-b', 'feature');
  git('config', 'user.name', 'Fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  fs.writeFileSync(path.join(workspace, 'file.txt'), 'before\n');
  git('add', '.');
  git('commit', '-m', 'base');
  let createOptions;
  const adapter = createCursorWorkspaceAdapter({
    apiKey: 'fixture-key',
    async sdkLoader() {
      return {
        JsonlLocalAgentStore: class {},
        Cursor: {
          models: {
            async list() {
              return [{
                id: 'cursor-terra',
                parameters: [{
                  id: 'reasoning_effort',
                  values: [{ value: 'high' }],
                }],
              }];
            },
          },
        },
        Agent: {
          async create(options) {
            createOptions = options;
            return {
              agentId: 'local-fixture',
              async send() {
                fs.writeFileSync(path.join(workspace, 'file.txt'), 'after\n');
                git('add', '.');
                git('commit', '-m', 'implementation');
                return {
                  id: 'run-local',
                  async *stream() {
                    yield {
                      type: 'tool_call',
                      name: 'ReadFile',
                      status: 'completed',
                      args: {
                        path: '.cursor/skills/code-review/SKILL.md',
                      },
                    };
                  },
                  async wait() {
                    return {
                      id: 'run-local',
                      status: 'finished',
                      result: 'done',
                      durationMs: 10,
                      model: {
                        id: 'cursor-terra',
                        params: [{
                          id: 'reasoning_effort',
                          value: 'high',
                        }],
                      },
                    };
                  },
                };
              },
              async getUsage() {
                return { cost: { chargedCents: 4 } };
              },
              async [Symbol.asyncDispose]() {},
            };
          },
        },
      };
    },
  });
  const result = await adapter.execute({
    workspace,
    prompt: 'Implement.',
    model: {
      id: 'cursor-terra',
      params: [{ id: 'reasoning_effort', value: 'high' }],
    },
  });
  assert.equal(result.status, 'succeeded');
  assert.equal(result.reviewLoads, 1);
  assert.notEqual(result.git.baseRevision, result.git.headRevision);
  assert.equal(createOptions.local.cwd, fs.realpathSync(workspace));
  assert.deepEqual(createOptions.model, {
    id: 'cursor-terra',
    params: [{ id: 'reasoning_effort', value: 'high' }],
  });
  assert.equal(Object.hasOwn(createOptions.local, 'sandboxOptions'), false);
  assert.equal(Object.hasOwn(createOptions, 'cloud'), false);
});

test('trusted verifier delegates to a bounded no-network sandbox', async (t) => {
  const calls = [];
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trusted-verifier-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const workspace = path.join(root, 'workspace');
  const hiddenTests = path.join(root, 'oracle');
  fs.mkdirSync(workspace);
  fs.mkdirSync(hiddenTests);
  fs.writeFileSync(path.join(workspace, 'package.json'), '{}\n');
  fs.writeFileSync(path.join(hiddenTests, 'hidden.test.js'), '// hidden\n');
  const verifier = createTrustedVerifier({
    async executeSandbox(request) {
      calls.push(request);
      return {
        exitCode: 0,
        stdout: 'tests passed',
        stderr: '',
        durationMs: 25,
      };
    },
  });
  const result = await verifier.verify({
    workspace,
    hiddenTests,
    commands: ['node --test test/*.test.js', 'node --test /hidden/*.test.js'],
  });
  assert.equal(result.passed, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].network, 'none');
  assert.equal(calls[0].readOnlyRoot, true);
  assert.equal(calls[0].workspaceMode, 'read-only');
  assert.equal(calls[0].memoryMb, 512);
});

test('loads runnable holdouts while keeping hidden oracles out of public inputs', () => {
  const catalog = loadImplementationOutcomeHoldouts({ repositoryRoot });
  assert.deepEqual(catalog.cases.map(({ id }) => id), [
    'delivery-contract',
    'lease-fencing',
    'parallel-exports',
  ]);
  assert.equal(catalog.runtime.files.length, 10);
  for (const holdoutCase of catalog.cases) {
    assert.match(holdoutCase.fixtureDigest, /^[a-f0-9]{64}$/);
    assert.match(holdoutCase.oracleDigest, /^[a-f0-9]{64}$/);
    const publicInputs = publicCaseInputs(holdoutCase);
    const serialized = JSON.stringify(publicInputs);
    assert.equal(serialized.includes('hidden.oracle.cjs'), false);
    assert.equal(serialized.includes('maximum_review_findings'), false);
    assert.equal(publicInputs.tickets.length,
      holdoutCase.oracle.expected_tickets.length);
  }
});

test('materializes a local Git fixture without evaluator-only oracles', (t) => {
  const catalog = loadImplementationOutcomeHoldouts({ repositoryRoot });
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'local-fixture-test-'));
  const target = path.join(parent, 'repository');
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const materialized = materializeLocalOutcomeRepository({ catalog, target });
  assert.equal(materialized.repository, fs.realpathSync(target));
  assert.match(materialized.baseRevision, /^[a-f0-9]{40}$/);
  assert.equal(fs.existsSync(path.join(
    target,
    '.cursor',
    'skills',
    'implement',
    'SKILL.md',
  )), true);
  for (const file of catalog.runtime.files) {
    const stagedPath = file.path
      .replace(/^skills\//, '')
      .replace(/definition\.md$/, 'SKILL.md');
    assert.equal(fs.existsSync(path.join(
      target,
      '.cursor',
      'skills',
      stagedPath,
    )), true);
  }
  assert.equal(JSON.stringify(
    fs.readdirSync(path.join(target, 'cases')),
  ).includes('oracle'), false);
  assert.equal(spawnSync('git', ['remote'], {
    cwd: target,
    encoding: 'utf8',
  }).stdout, '');
  assert.equal(spawnSync('git', ['status', '--porcelain'], {
    cwd: target,
    encoding: 'utf8',
  }).stdout, '');
});

test('retains successful canonical stage evidence across failed attempts', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'local-evidence-test-'));
  const catalog = loadImplementationOutcomeHoldouts({ repositoryRoot });
  const holdoutCase = catalog.cases[0];
  const ticket = holdoutCase.tickets[0];
  const repository = materializeLocalOutcomeRepository({
    catalog,
    target: path.join(root, 'repository'),
  });
  const artifactDirectory = path.join(root, 'artifacts');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(artifactDirectory);

  function successfulAttempt(attempt) {
    return {
      status: 'succeeded',
      attempt,
      subagentCalls: 9,
      output: validBlueprint(),
    };
  }
  const failedAttempt = {
    status: 'failed',
    attempt: 'failed',
    subagentCalls: 0,
    output: '',
    failure: { message: 'simulated failure' },
  };
  const invalidSuccessfulAttempt = {
    status: 'succeeded',
    attempt: 'invalid-success',
    subagentCalls: 9,
    output: 'not an implementation blueprint',
  };
  const attempts = [
    successfulAttempt('initial'),
    failedAttempt,
    failedAttempt,
    invalidSuccessfulAttempt,
    successfulAttempt('replacement'),
  ];
  const executeStage = createLocalOutcomeStageExecutor({
    repositoryRoot,
    workspaceAdapter: {
      async execute() {
        return attempts.shift();
      },
    },
  });
  const pair = {
    caseId: holdoutCase.id,
    fingerprint: 'a'.repeat(64),
  };
  const context = {
    coordinates: {
      arm: 'treatment',
      stage: 'planning',
      ticketId: ticket.id,
    },
    currentIndex: { checkpoints: [] },
    pair,
    plan: {
      cases: [{
        id: pair.caseId,
        repositoryUrl: repository.repositoryUrl,
        baseRevision: repository.baseRevision,
      }],
      models: { planner: outcomePlan().models.planner },
    },
    holdoutCase,
    runtimeFingerprint: 'test-runtime',
    artifactDirectory,
  };
  const evidenceDirectory = path.join(
    artifactDirectory,
    'run',
    'stage-evidence',
    pair.fingerprint,
    'treatment',
  );
  const canonicalName = `planning-${ticket.id}.json`;
  const canonical = path.join(evidenceDirectory, canonicalName);

  await executeStage(context);
  assert.equal(JSON.parse(fs.readFileSync(canonical, 'utf8')).attempt, 'initial');

  await assert.rejects(() => executeStage(context), /simulated failure/);
  await assert.rejects(() => executeStage(context), /simulated failure/);
  assert.equal(JSON.parse(fs.readFileSync(canonical, 'utf8')).attempt, 'initial');
  const failedFiles = fs.readdirSync(evidenceDirectory)
    .filter((name) => name.includes('.failed-'));
  assert.equal(failedFiles.length, 1);
  assert.equal(
    failedFiles[0].startsWith(`${path.parse(canonicalName).name}.failed-`),
    true,
  );
  assert.match(failedFiles[0], /\.failed-[a-f0-9]{12}\.json$/);
  assert.equal(failedFiles[0].length, canonicalName.length + 20);
  assert.equal(
    JSON.parse(fs.readFileSync(
      path.join(evidenceDirectory, failedFiles[0]),
      'utf8',
    )).attempt,
    'failed',
  );

  await assert.rejects(
    () => executeStage(context),
    /blueprint must contain exactly one opening marker/,
  );
  assert.equal(JSON.parse(fs.readFileSync(canonical, 'utf8')).attempt, 'initial');
  const diagnosticEvidence = fs.readdirSync(evidenceDirectory)
    .filter((name) => name.includes('.failed-'))
    .map((name) => JSON.parse(fs.readFileSync(
      path.join(evidenceDirectory, name),
      'utf8',
    )));
  const invalidEvidence = diagnosticEvidence.find(
    ({ attempt }) => attempt === 'invalid-success',
  );
  assert.equal(invalidEvidence.status, 'failed');
  assert.equal(invalidEvidence.failure.stage, 'validation');

  await executeStage(context);
  assert.equal(
    JSON.parse(fs.readFileSync(canonical, 'utf8')).attempt,
    'replacement',
  );
});

test('planning reuse compares the implementation-planning fingerprint', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'planning-reuse-test-'));
  const catalog = loadImplementationOutcomeHoldouts({ repositoryRoot });
  const holdoutCase = catalog.cases[0];
  const ticket = holdoutCase.tickets[0];
  const repository = materializeLocalOutcomeRepository({
    catalog,
    target: path.join(root, 'repository'),
  });
  const artifactDirectory = path.join(root, 'artifacts');
  fs.mkdirSync(artifactDirectory);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const planner = outcomePlan().models.planner;
  let executionCount = 0;
  const executeStage = createLocalOutcomeStageExecutor({
    repositoryRoot,
    workspaceAdapter: {
      async execute() {
        executionCount += 1;
        return {
          status: 'succeeded',
          attempt: executionCount,
          subagentCalls: 9,
          output: validBlueprint().replaceAll(BASE, repository.baseRevision),
          model: planner,
          git: {
            baseRevision: repository.baseRevision,
            headRevision: repository.baseRevision,
            status: '',
          },
        };
      },
    },
  });
  const pair = {
    caseId: holdoutCase.id,
    fingerprint: 'b'.repeat(64),
  };
  const context = {
    coordinates: {
      arm: 'treatment',
      stage: 'planning',
      ticketId: ticket.id,
    },
    currentIndex: { checkpoints: [] },
    pair,
    plan: {
      cases: [{
        id: pair.caseId,
        repositoryUrl: repository.repositoryUrl,
        baseRevision: repository.baseRevision,
      }],
      models: { planner },
    },
    holdoutCase,
    runtimeFingerprint: 'matt-runtime-fingerprint',
    artifactDirectory,
  };
  const canonical = path.join(
    artifactDirectory,
    'run',
    'stage-evidence',
    pair.fingerprint,
    'treatment',
    `planning-${ticket.id}.json`,
  );

  await executeStage(context);
  const packageFingerprint = JSON.parse(
    fs.readFileSync(canonical, 'utf8'),
  ).runtimeFingerprint;
  assert.notEqual(packageFingerprint, context.runtimeFingerprint);

  const staleEvidence = JSON.parse(fs.readFileSync(canonical, 'utf8'));
  staleEvidence.runtimeFingerprint = context.runtimeFingerprint;
  fs.writeFileSync(canonical, `${JSON.stringify(staleEvidence, null, 2)}\n`);

  await executeStage(context);
  assert.equal(executionCount, 2);
  assert.equal(
    JSON.parse(fs.readFileSync(canonical, 'utf8')).runtimeFingerprint,
    packageFingerprint,
  );
});

function reviewEvidence(overrides = {}) {
  return {
    feedbackExposed: false,
    findings: [],
    dimensions: { ...PASSING_DIMENSIONS },
    ...overrides,
  };
}

function armEvidence(arm, overrides = {}) {
  return {
    arm,
    inputIdentity: {
      baseRevision: BASE,
      sourceDigest: 'b'.repeat(64),
      ticketDigests: ['d'.repeat(64)],
    },
    blueprint: arm === 'treatment' ? validBlueprint() : null,
    tickets: [{
      id: '01-fenced-leases',
      reviewLoads: 1,
      correctionCount: 1,
      clarifications: 0,
      costUsd: arm === 'treatment' ? 0.4 : 0.5,
      durationMs: 100,
    }],
    feature: {
      baseRevision: BASE,
      headRevision: '8'.repeat(40),
      changedPaths: [
        'src/lease-registry.js',
        'test/fenced-leases.test.js',
      ],
      merges: [{
        ticketId: '01-fenced-leases',
        conflict: false,
        verificationPassed: true,
      }],
    },
    trustedVerification: {
      passed: true,
      workspaceDigest: '9'.repeat(64),
      results: [{ command: 'node --test', passed: true }],
    },
    requirementCoverage: [
      {
        requirement: 'monotonic fencing tokens',
        passed: true,
        evidence: 'hidden test',
      },
    ],
    mutationChecks: [{ id: 'stale-release', killed: true }],
    finalReview: reviewEvidence(),
    ...overrides,
  };
}

function gradingOracle() {
  return {
    expected_tickets: ['01-fenced-leases'],
    ticket_graph: [{
      id: '01-fenced-leases',
      blockers: [],
      collisions: [],
    }],
    commands: ['node --test'],
    allowed_paths: [
      'src/lease-registry.js',
      'test/fenced-leases.test.js',
    ],
    requirements: ['monotonic fencing tokens'],
    maximum_review_findings: { blocker: 0, major: 0 },
  };
}

test('grades matched code outcomes and improvement after one review', () => {
  const baseline = armEvidence('baseline', {
    finalReview: reviewEvidence({
      findings: [{
        id: 'F1',
        severity: 'major',
        evidence: 'stale releases can delete a new lease',
      }],
      dimensions: {
        ...PASSING_DIMENSIONS,
        requirement_fidelity: 0,
        architecture: 1,
        maintainability: 1,
        test_quality: 1,
      },
    }),
  });
  const treatment = armEvidence('treatment');
  const result = gradeOutcomePair({
    pairFingerprint: 'a'.repeat(64),
    oracle: gradingOracle(),
    baseline,
    treatment,
  });
  assert.equal(result.arms.baseline.mergeReady, false);
  assert.equal(result.arms.treatment.mergeReady, true);
  assert.equal(result.treatmentImproved, true);
  assert.equal(result.criticalRegression, false);
  assert.equal(result.passed, true);
});

test('rejects extra review cycles, scope growth, and evaluator feedback', () => {
  const treatment = armEvidence('treatment');
  treatment.tickets[0].reviewLoads = 2;
  treatment.feature.changedPaths.push('src/unrelated.js');
  treatment.finalReview.feedbackExposed = true;
  const result = gradeOutcomePair({
    pairFingerprint: 'b'.repeat(64),
    oracle: gradingOracle(),
    baseline: armEvidence('baseline'),
    treatment,
  });
  assert.equal(result.arms.treatment.mergeReady, false);
  assert.ok(result.arms.treatment.failures.includes('review-cycle-limit'));
  assert.ok(result.arms.treatment.failures.includes('scope-discipline'));
  assert.ok(result.arms.treatment.failures.includes('blind-review-feedback'));
});

test('replays sealed outcome grades and rejects tampering', () => {
  const pairFingerprint = 'c'.repeat(64);
  const grade = gradeOutcomePair({
    pairFingerprint,
    oracle: gradingOracle(),
    baseline: armEvidence('baseline'),
    treatment: armEvidence('treatment'),
  });
  const replay = replayOutcomeGrades({
    planFingerprint: 'd'.repeat(64),
    expectedPairFingerprints: [pairFingerprint],
    grades: [grade],
  });
  assert.equal(replay.complete, true);
  assert.equal(replay.passed, true);
  const tampered = structuredClone(grade);
  tampered.arms.treatment.mergeReady = false;
  assert.throws(() => replayOutcomeGrades({
    planFingerprint: 'd'.repeat(64),
    expectedPairFingerprints: [pairFingerprint],
    grades: [tampered],
  }), /fingerprint mismatch/);
});

test('runs and replays a checkpointed outcome campaign offline', async (t) => {
  const catalog = loadImplementationOutcomeHoldouts({ repositoryRoot });
  const leaseCase = catalog.cases.find(({ id }) => id === 'lease-fencing');
  const configuration = {
    schema_version: 1,
    kind: 'implementation-outcome-configuration',
    candidate_revision: BASE,
    repository_url: 'https://github.com/example/outcome-fixture',
    base_revision: BASE,
    selected_cases: ['lease-fencing'],
    repetitions: 1,
    randomization_seed: 'campaign-test-v1',
    models: outcomePlan().models,
  };
  const { plan } = buildPlan({ repositoryRoot, configuration });
  const artifactsRoot = path.join(repositoryRoot, '.artifacts');
  fs.mkdirSync(artifactsRoot, { recursive: true });
  const artifactDirectory = fs.mkdtempSync(
    path.join(artifactsRoot, 'outcome-campaign-test-'),
  );
  t.after(() => fs.rmSync(artifactDirectory, {
    recursive: true,
    force: true,
  }));

  const results = await runOutcomeCampaign({
    repositoryRoot,
    plan,
    artifactDirectory,
    async executeStage({ coordinates, pair, holdoutCase }) {
      let pointer = `artifact://stages/${coordinates.arm}-${coordinates.stage}-${
        coordinates.ticketId || 'feature'
      }.json`;
      let outputFingerprint = '3'.repeat(64);
      if (coordinates.stage === 'grading') {
        const evidence = (arm) => armEvidence(arm, {
          inputIdentity: {
            baseRevision: BASE,
            sourceDigest: leaseCase.sourceDigest,
            ticketDigests: leaseCase.tickets.map(({ digest }) => digest),
          },
          requirementCoverage: holdoutCase.oracle.requirements.map(
            (requirement) => ({
              requirement,
              passed: true,
              evidence: 'trusted hidden test',
            }),
          ),
          feature: {
            baseRevision: BASE,
            headRevision: '8'.repeat(40),
            changedPaths: [
              'src/lease-registry.js',
              'test/fenced-leases.test.js',
            ],
            merges: [{
              ticketId: '01-fenced-leases',
              conflict: false,
              verificationPassed: true,
            }],
          },
        });
        const grade = gradeOutcomePair({
          pairFingerprint: pair.fingerprint,
          oracle: holdoutCase.oracle,
          baseline: evidence('baseline'),
          treatment: evidence('treatment'),
        });
        const relative = `grades/${pair.fingerprint}.json`;
        const target = path.join(artifactDirectory, relative);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, `${JSON.stringify(grade, null, 2)}\n`);
        pointer = `artifact://${relative}`;
        outputFingerprint = grade.fingerprint;
      }
      return {
        disposition: coordinates.arm === 'baseline'
          && coordinates.stage === 'planning'
          ? 'not-required'
          : 'executed',
        inputFingerprint: '2'.repeat(64),
        outputFingerprint,
        evidencePointer: pointer,
      };
    },
  });
  assert.equal(results.length, 1);
  assert.equal(results[0].index.complete, true);

  const replay = replayOutcomeCampaign({
    repositoryRoot,
    plan,
    artifactDirectory,
  });
  assert.equal(replay.complete, true);
  assert.equal(replay.passed, true);
});
