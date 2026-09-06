'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  loadCanonicalSuite,
  resolvePackageDependencies,
} = require('../../../suite');
const {
  validateEvaluationDefinition,
} = require('../../../suite/evaluation');

const repositoryRoot = path.resolve(__dirname, '../../..');
const skillRoot = path.resolve(__dirname, '..');
const needsDecisionReviewFragments = [
  'Needs-decision status does not waive mandatory review',
  'authority handling',
  'decision envelopes',
  'decision-independent work',
  'blocker routing',
  'evidence-bearing PASS or concrete findings',
  'INCOMPLETE',
  'cause, owner, and recovery condition',
];

test('discovery reuses architecture evidence and delegates only named gaps', () => {
  const skill = read(path.join(skillRoot, 'SKILL.md'));
  const evidence = read(path.join(skillRoot, 'references', 'evidence-and-authority.md'));
  const review = read(path.join(skillRoot, 'references', 'blueprint-review.md'));
  assert.match(evidence, /Reuse the complete.*immutable.*brief/);
  assert.match(evidence, /only named gaps/);
  assert.match(evidence, /same\s+immutable base/);
  assert.doesNotMatch(evidence, /Dispatch fresh read-only investigations in parallel:/);
  assert.doesNotMatch(evidence + review, /with activity\s+`design`/);
  assert.match(skill, /Invoke `architecture-review` afresh against one numbered design revision/);
  assert.match(skill, /Invoke `architecture-review` and every blueprint review afresh/);
});

test('incomplete review is recoverable evidence but never authorizes readiness', () => {
  const skill = read(path.join(skillRoot, 'SKILL.md'));
  const review = read(path.join(skillRoot, 'references', 'blueprint-review.md'));
  const blueprint = read(path.join(skillRoot, 'references', 'implementation-blueprint.md'));
  assert.match(review, /unavailable|failed/);
  assert.match(blueprint, /INCOMPLETE/);
  assert.match(blueprint, /Cause:/);
  assert.match(blueprint, /Recovery owner:/);
  assert.match(blueprint, /Recovery condition:/);
  assert.match(blueprint, /INCOMPLETE.*blocks `ready`/);
  assert.doesNotMatch(blueprint, /`pending`, `not run`,\s+and `blocked` are invalid results/);
  assert.doesNotMatch(skill, /one revision has complete final review evidence/);
  assert.match(blueprint, /required specialist reviews passed the same final\s+revision/);
});

test('risk baseline details load only for evidenced triggers', () => {
  const baseline = read(path.join(skillRoot, 'references', 'engineering-baseline.md'));
  const index = baseline.split('## Core guidance')[0];
  assert.deepEqual([...index.matchAll(/^(\d+)\. /gm)].map((match) => Number(match[1])),
    Array.from({ length: 12 }, (_, position) => position + 1));
  for (const file of ['security', 'reliability', 'compatibility', 'data-migration']) {
    const reference = `engineering-${file}.md`;
    assert.ok(index.includes(`](${reference})`));
    const details = read(path.join(skillRoot, 'references', reference));
    assert.match(details, /\*\*Source:\*\*/);
    assert.match(details, /\*\*Counterweight:\*\*/);
  }
  assert.match(index, /load only the linked references whose\s+triggers apply/i);
  assert.match(index, /uncertain trigger[\s\S]*blocker/i);
  assert.doesNotMatch(baseline, /Which exact standard\/version requirement|Which SLI\/SLO|What exact behavior remains compatible|writes after cutover/);
});

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function readJson(fileName) {
  return JSON.parse(read(path.join(skillRoot, 'evals', fileName)));
}

function hasNeedsDecisionReview({ expectations }) {
  return expectations.some((expectation) => (
    needsDecisionReviewFragments.every((fragment) => expectation.includes(fragment))
  ));
}

test('Implementation Planning is one public outcome with canonical guidance', () => {
  const suite = loadCanonicalSuite(repositoryRoot);

  assert.deepEqual(
    suite.inventory.find(({ name }) => name === 'implementation-planning'),
    { name: 'implementation-planning', classification: 'primary' },
  );
  assert.deepEqual(
    resolvePackageDependencies(
      suite,
      {
        skills: suite.inventory.map(({ name }) => ({ name })),
      },
      'implementation-planning',
    ).resolved,
    [
      'engineering-guidance',
      'architecture-review',
      'implementation-planning',
    ],
  );
  assert.ok(suite.runtimeEdges.some(({ consumer, dependency }) => (
    consumer === 'implementation-planning'
      && dependency === 'architecture-review'
  )));
  assert.ok(suite.runtimeEdges.some(({ consumer, dependency }) => (
    consumer === 'implementation-planning'
      && dependency === 'engineering-guidance'
  )));
});

test('Implementation Planning exposes the two-plan readiness workflow', () => {
  const skill = [
    read(path.join(skillRoot, 'SKILL.md')),
    read(path.join(skillRoot, 'references', 'evidence-and-authority.md')),
    read(path.join(
      repositoryRoot,
      'skills',
      'architecture-review',
      'references',
      'architecture-quality.md',
    )),
    read(path.join(skillRoot, 'references', 'blueprint-review.md')),
    read(path.join(skillRoot, 'references', 'implementation-blueprint.md')),
  ].join('\n');

  assert.match(skill, /^name: implementation-planning$/m);
  assert.match(skill, /\breviewed technical design and executable consumer-behavior TDD plan\b/i);
  assert.match(skill, /blueprint is agent-primary and human-inspectable/);
  assert.match(skill, /Production artifacts stay[\s\S]*clear to both audiences/);
  for (const heading of [
    '1. Admit the planning work',
    '2. Ground and discover',
    '3. Settle design authority',
    '4. Draft the technical design',
    '5. Review the design',
    '6. Dispose findings and derive TDD',
    '7. Re-review and decide readiness',
    '8. Publish or return the blueprint',
  ]) {
    assert.match(skill, new RegExp(`^## ${heading}$`, 'm'));
  }
  assert.match(skill, /references\/implementation-blueprint\.md/);
  assert.match(skill, /references\/engineering-baseline\.md/);
  assert.match(skill, /Build an authority ledger for every affected path/);
  assert.match(skill, /Verified\s+requirements and repository decisions retain their ledger class/);
  assert.match(skill, /Seed every guideline[\s\S]*finalize every disposition[\s\S]*before drafting/);
  assert.match(skill, /Every repository evidence record names the\s+immutable base/);
  assert.match(skill, /proposed public name or path for unrelated lexical collisions/);
  assert.match(skill, /Apply a \*\*support boundary\*\*/);
  assert.match(
    skill,
    /Never manufacture a scenario to create an authority question/,
  );
  assert.match(skill, /unsupported or pathological\s+extensions as `non-design-bounded`/);
  assert.match(skill, /Numeric\s+exhaustion, reentrant injected collaborators, and cross-entity ordering/);
  assert.match(skill, /non-executable decision matrix/);
  assert.match(skill, /Settled design authorizes drafting, not `ready` status/);
  assert.match(skill, /Supported consumer contract/);
  assert.match(skill, /Effective behavioral coverage/);
  assert.match(skill, /Coherent ownership and locality/);
  assert.match(skill, /Earned depth/);
  assert.match(skill, /Real seam and justified dependency direction/);
  assert.match(skill, /Proportional change/);
  assert.match(skill, /requested and resolved model or tier/);
  assert.match(skill, /Architecture dynamic-behavior[\s\S]*Architecture static-structure/);
  assert.match(skill, /Blueprint status never\s+suppresses review/);
  assert.match(
    skill,
    /On a `needs-decision` revision,[\s\S]*authority handling,[\s\S]*decision envelopes,[\s\S]*decision-independent work,[\s\S]*blocker\s+routing/,
  );
  assert.match(skill, /Both persona lenses are mandatory and\s+separate/);
  assert.match(
    skill,
    /Every credible in-scope\s+finding is integrated regardless of size, severity/,
  );
  assert.match(skill, /`disproved`:[\s\S]*stronger contrary evidence/);
  assert.match(skill, /`out-of-scope`:[\s\S]*controlling requirement or explicit exclusion/);
  assert.match(skill, /`needs-decision`:[\s\S]*block `ready`/);
  assert.match(skill, /worktree state\s+before and after/i);
  assert.match(skill, /^## Readiness checks$/m);
});

test('Implementation Planning follows the writing-great-skills hierarchy', () => {
  const skill = read(path.join(skillRoot, 'SKILL.md'));
  const description = skill.match(/^description:\s*"([^"]+)"$/m)?.[1];

  assert.equal(
    description,
    'Plan one bounded implementation ticket before code: produce a reviewed '
      + 'technical design and executable consumer-behavior TDD plan for another agent.',
  );
  assert.match(skill, /^## 1\. Admit the planning work$/m);
  assert.match(skill, /^## 8\. Publish or return the blueprint$/m);
  assert.match(
    skill,
    /Read \[evidence and authority\]\(references\/evidence-and-authority\.md\) before\s+discovery/,
  );
  assert.match(
    skill,
    /Invoke `architecture-review` against the\s+immutable current architecture/,
  );
  assert.match(
    skill,
    /Use the retained `architecture-review` brief[\s\S]*Read \[blueprint\s+review\]\(references\/blueprint-review\.md\) and \[the blueprint\s+contract\]\(references\/implementation-blueprint\.md\) before drafting/,
  );
  assert.match(
    skill,
    /Invoke `architecture-review` afresh against one numbered design revision/,
  );
  assert.doesNotMatch(skill, /\.\.\/architecture-review\//);
  assert.equal((skill.match(/\*Complete when:\*/g) || []).length, 8);
  assert.doesNotMatch(skill, /including its explicit complexity, deep-module/);
  assert.doesNotMatch(skill, /Severity: blocker \| major \| minor \| note/);

  const evidence = read(path.join(
    skillRoot,
    'references',
    'evidence-and-authority.md',
  ));
  assert.match(evidence, /^# Evidence and authority$/m);
  assert.match(evidence, /support boundary/i);
  assert.match(evidence, /decision envelope/i);
  assert.match(evidence, /residual uncertainty/i);

  const architecture = read(path.join(
    repositoryRoot,
    'skills',
    'architecture-review',
    'references',
    'architecture-quality.md',
  ));
  for (const phrase of [
    'caller bouncing',
    'deletion test',
    'interface[\\s\\S]*consumer\\s+and\\s+test\\s+surface',
    'seam reality',
    'Supported consumer contract',
    'Effective behavioral coverage',
    'Coherent ownership and locality',
    'Earned depth',
    'Real seam and justified dependency direction',
    'Proportional change',
  ]) {
    assert.match(architecture, new RegExp(phrase, 'i'));
  }
});

test('blueprint contract binds plans, provenance, appendices, and handoff', () => {
  const blueprint = read(path.join(
    skillRoot,
    'references',
    'implementation-blueprint.md',
  ));

  assert.match(blueprint, /<!-- implementation-blueprint:v1 -->/);
  assert.match(blueprint, /<!-- \/implementation-blueprint -->/);
  for (const exactHeading of [
    '### Authority ledger',
    '### Search and coverage ledger',
    '### Architecture scan',
    '### Support boundary',
    '### Decision envelopes',
    '## Technical design plan',
    '### Scenario ledger',
    '### Durable provenance',
    '## TDD test plan',
    '### Consumer behavior and effective coverage',
    '### Command admission',
    '### Investigation provenance',
    '### Initial technical-design review',
    '### Final independent review',
    '## Implementation start',
    '## Readiness checks',
  ]) {
    assert.match(blueprint, new RegExp(`^${exactHeading}$`, 'm'));
  }
  assert.match(blueprint, /normative\s+content never exists only in an appendix/);
  assert.match(blueprint, /Engineering-baseline applicability/);
  assert.match(blueprint, /Apply every canonical architecture-quality scan item and claim/);
  assert.match(blueprint, /Scope-bounded scan results and evidence/);
  assert.match(blueprint, /Quality-claim dispositions and design\/proof IDs/);
  assert.match(blueprint, /Supporting and contrary evidence/);
  assert.match(blueprint, /Consumer, goal, and action/);
  assert.match(blueprint, /Reason-for-change owner/);
  assert.match(blueprint, /Information hidden and locality gained/);
  assert.match(blueprint, /Independent expected-value source/);
  assert.match(blueprint, /Current architecture: \[Mermaid view using the module IDs above\]/);
  assert.match(blueprint, /Behavior: \[Mermaid view using scenario and proof IDs above\]/);
  assert.match(blueprint, /Every implementation slice is `settled`/);
  assert.match(blueprint, /Requested and resolved model or tier/);
  assert.match(blueprint, /Architecture dynamic behavior: PASS/);
  assert.match(blueprint, /Architecture static structure: PASS/);
  assert.match(blueprint, /Uncle Bob\/Clean Architecture: PASS/);
  assert.match(blueprint, /John Ousterhout\/APOSD: PASS/);
  assert.match(blueprint, /Record every required review row for both `ready` and `needs-decision`/);
  assert.match(
    blueprint,
    /On a `needs-decision` revision,[\s\S]*authority handling,[\s\S]*decision envelopes,[\s\S]*decision-independent work,[\s\S]*blocker\s+routing/,
  );
  assert.match(blueprint, /An `INCOMPLETE` row blocks `ready`/);
  assert.match(blueprint, /Source finding IDs:/);
  assert.match(blueprint, /Severity: blocker \| major \| minor \| note/);
  assert.match(blueprint, /Finding confidence and rationale:/);
  assert.match(blueprint, /Context limits:/);
  assert.match(blueprint, /Highest credible correction:/);
  assert.match(blueprint, /Every `PASS` records zero findings/);
  assert.match(blueprint, /Every source finding identity and original conclusion is preserved/);
  assert.match(blueprint, /Every assumption is `verified` or `non-design-bounded`/);
  assert.match(
    blueprint,
    /Every affected module and the blueprint as a whole satisfies all six canonical\s+architecture-quality claims/,
  );
  assert.match(
    blueprint,
    /required canonical\s+`architecture-review` result/,
  );
  assert.doesNotMatch(blueprint, /\]\(\.\.\/|architecture-quality\.md/);
  assert.doesNotMatch(
    blueprint,
    /Every supported behavior traces a consumer, goal, action, interface or seam/,
  );
  assert.match(blueprint, /Every source-observable in-scope ambiguity and required contract or capability\s+gap has either an authority-backed decision/);
  assert.match(
    blueprint,
    /Every unobserved implementation freedom and unsupported or pathological\s+extension is recorded against the source-backed support boundary as\s+`non-design-bounded`/,
  );
  assert.match(blueprint, /Every decision envelope keeps options unranked at behavior level/);
  assert.match(blueprint, /Controlling owner for each behavior question/);
  assert.match(blueprint, /Evidence owner for each capability question/);
  assert.match(blueprint, /Every detail labeled decision-independent has identical setup/);
  assert.match(blueprint, /No admitted red-green slice depends on a blocked decision envelope/);
  assert.match(blueprint, /Gate: enabled only when status is `ready`/);
  assert.match(blueprint, /Hidden human setup,[\s\S]*unverified command\s+blocks `ready`/);
  assert.match(blueprint, /worktree state before and\s+after/i);
  assert.match(blueprint, /Status: retired \| material-unresolved/);
  assert.match(blueprint, /Every rabbit hole is `retired`/);
  assert.match(blueprint, /Initial technical-design review[\s\S]*Architecture dynamic behavior/);
  assert.match(blueprint, /every triggered specialty has one separate final evidence-bearing PASS/);
  assert.match(blueprint, /Per-slice loop: verify expected red/);
  assert.match(blueprint, /regardless of size, severity, or pre-existing\s+status/);
  assert.match(blueprint, /No superseded,\s+deferred, nice-to-have, optional, or won't-fix disposition exists/);
});

test('mandatory baseline supplies specific external engineering authority', () => {
  const localBaseline = read(path.join(
    skillRoot,
    'references',
    'engineering-baseline.md',
  ));
  const baseline = [
    localBaseline,
    ...['security', 'reliability', 'compatibility', 'data-migration'].map((name) =>
      read(path.join(skillRoot, 'references', `engineering-${name}.md`))),
    read(path.join(
      repositoryRoot,
      'skills',
      'architecture-review',
      'references',
      'architecture-quality.md',
    )),
  ].join('\n');

  assert.match(baseline, /Use this baseline on every implementation-planning run/);
  assert.match(localBaseline, /required `architecture-review` result/);
  assert.doesNotMatch(localBaseline, /\]\(\.\.\/|architecture-quality\.md/);
  assert.match(baseline, /repository authority is absent, weak, or stale/);
  assert.match(baseline, /existing\s+code, repetition, and nearby patterns as descriptive/);
  assert.match(baseline, /Uncle Bob\/SOLID\/Clean Architecture/);
  assert.match(baseline, /John Ousterhout\/APOSD/);
  assert.match(baseline, /dependencies and obscurity create complexity/);
  assert.match(
    baseline,
    /shallow\s+or pass-through\s+modules, temporal decomposition/,
  );
  assert.match(baseline, /errors can be defined/);
  assert.match(baseline, /names, consistency, and durable design\s+comments/);
  assert.match(baseline, /Ports and Adapters/);
  assert.match(baseline, /Inject effectful and variable dependencies at a deliberate seam/);
  assert.match(baseline, /separates configuration from use/);
  assert.match(baseline, /Keep each piece of knowledge DRY under one authoritative owner/);
  assert.match(baseline, /DRY concerns duplicated knowledge,\s+not merely identical text/);
  assert.match(baseline, /Make the repository navigable to agents and humans/);
  assert.match(baseline, /bounded cohesive artifacts/);
  assert.match(baseline, /distinctive, searchable domain names/);
  assert.match(baseline, /explicit\s+contracts and types/);
  assert.match(baseline, /predictable paths/);
  assert.match(baseline, /contextual diagnostics/);
  assert.match(baseline, /agent-runnable, noninteractive, and\s+idempotent/);
  assert.match(baseline, /Clean Code for AI\s+Agents/);
  assert.match(baseline, /supplementary quality evidence, not controlling\s+authority/);
  assert.match(baseline, /no fixed file, function, line, coverage, or grep-result\s+threshold/);
  assert.match(baseline, /behavior-first, vertical TDD/);
  assert.match(baseline, /architectural fitness-function/);
  assert.match(baseline, /NIST.*SP 800-218 SSDF/s);
  assert.match(baseline, /Google SRE/);
  assert.match(baseline, /Semantic Versioning/);
  assert.match(baseline, /Evolutionary Database\s+Design/);
  assert.match(baseline, /Admit another industry movement only when all four are shown/);
});

test('portable evaluations follow the skill eval contract', () => {
  const definition = readJson('evals.json');

  assert.deepEqual(Object.keys(definition).sort(), ['evals', 'skill_name']);
  assert.equal(definition.skill_name, 'implementation-planning');
  assert.deepEqual(
    definition.evals.map(({ id }) => id),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21],
  );

  const ids = new Set();
  for (const evaluation of definition.evals) {
    const expectedFields = ['expectations', 'expected_output', 'id', 'prompt'];
    if (evaluation.files !== undefined) expectedFields.push('files');
    assert.deepEqual(
      Object.keys(evaluation).sort(),
      expectedFields.sort(),
    );
    assert.equal(Number.isInteger(evaluation.id), true);
    assert.equal(ids.has(evaluation.id), false);
    ids.add(evaluation.id);
    assert.equal(typeof evaluation.prompt, 'string');
    assert.ok(evaluation.prompt.length > 0);
    assert.equal(typeof evaluation.expected_output, 'string');
    assert.ok(evaluation.expected_output.length > 0);
    assert.ok(Array.isArray(evaluation.expectations));
    assert.ok(evaluation.expectations.length > 0);
    assert.ok(evaluation.expectations.every((expectation) => (
      typeof expectation === 'string' && expectation.length > 0
    )));
    if (evaluation.files !== undefined) {
      assert.ok(Array.isArray(evaluation.files));
      assert.ok(evaluation.files.length > 0);
      assert.ok(evaluation.files.every((file) => (
        typeof file === 'string' && file.startsWith('evals/fixtures/')
      )));
    }
  }
  const portableById = new Map(definition.evals.map((evaluation) => (
    [evaluation.id, evaluation]
  )));
  for (const [id, expectationText] of [
    [12, 'finding-closure evidence'],
    [14, 'unranked in a needs-decision envelope owned by the requirement owner'],
    [14, 'capability question for the renderer owner'],
    [14, 'non-executable decision matrix'],
    [15, 'named requirement owner'],
    [15, 'database owner'],
    [15, 'non-executable decision matrix'],
    [16, 'named requirement owner'],
    [16, 'storage owner'],
    [16, 'non-executable decision matrix'],
    [17, 'non-design-bounded support-boundary entries'],
    [17, 'withholds ready status'],
  ]) {
    assert.ok(portableById.get(id).expectations.some((expectation) => (
      expectation.includes(expectationText)
    )));
  }
  for (const id of [13, 14, 15, 16]) {
    assert.ok(hasNeedsDecisionReview(portableById.get(id)));
  }
  for (const [id, fragments] of [
    [19, ['INCOMPLETE', 'cause, owner, and recovery condition', 'partial Ousterhout evidence', 'same final revision']],
    [20, ['all 12', 'does not load engineering-security.md', 'engineering-data-migration.md', 'uncertain applicability']],
    [21, ['immutable base', 'only the named PRE-8', 'preserves unresolved findings', 'final technical-plus-TDD blueprint revision']],
  ]) {
    const expectations = portableById.get(id).expectations.join('\n');
    for (const fragment of fragments) assert.ok(expectations.includes(fragment));
  }
});

test('synthetic fixtures force concrete implementation decisions safely', () => {
  const fixtures = {
    payment: read(path.join(skillRoot, 'evals', 'fixtures', 'payment-retry.md')),
    cache: read(path.join(skillRoot, 'evals', 'fixtures', 'cache-refresh.md')),
    migration: read(path.join(
      skillRoot,
      'evals',
      'fixtures',
      'profile-column-migration.md',
    )),
    simple: read(path.join(
      skillRoot,
      'evals',
      'fixtures',
      'simple-slug-normalization.md',
    )),
    impossible: read(path.join(
      skillRoot,
      'evals',
      'fixtures',
      'webhook-exactly-once.md',
    )),
    ambiguous: read(path.join(
      skillRoot,
      'evals',
      'fixtures',
      'export-timeout-contract.md',
    )),
    pagination: read(path.join(
      skillRoot,
      'evals',
      'fixtures',
      'pagination-consistency-contract.md',
    )),
    upload: read(path.join(
      skillRoot,
      'evals',
      'fixtures',
      'upload-cancellation-contract.md',
    )),
    lease: read(path.join(
      skillRoot,
      'evals',
      'fixtures',
      'fenced-lease-bounded.md',
    )),
  };

  for (const fixture of Object.values(fixtures)) {
    assert.match(fixture, /fictional and contains no company code, systems, or tooling/);
    assert.doesNotMatch(fixture, /\/(?:Users|home)\/[^\s/]+|https?:\/\/[^\s/]+\.(?:internal|corp)\b/i);
    assert.match(fixture, /immutable revision\s+`[0-9]{40}`/);
    assert.match(fixture, /## Repository snapshot/);
  }

  assert.match(fixtures.payment, /concurrent retries and a process crash/);
  assert.match(fixtures.payment, /gateway supports an idempotency key/);
  assert.match(fixtures.payment, /SQL store supports transactions and unique constraints/);

  assert.match(fixtures.cache, /one background refresh per key/);
  assert.match(fixtures.cache, /Older entries block on one shared refresh/);
  assert.match(fixtures.cache, /cross-process coordination is outside this\s+ticket/);

  assert.match(fixtures.migration, /Old and new application versions overlap/);
  assert.match(fixtures.migration, /Backfill can be restarted safely/);
  assert.match(fixtures.migration, /Destructive cleanup may occur only after old versions are gone/);

  assert.match(fixtures.simple, /No configuration or new dependency is needed/);
  assert.match(fixtures.impossible, /Two legitimate events can have byte-identical bodies/);
  assert.match(fixtures.impossible, /no stored field can distinguish a\s+retry/);
  assert.match(fixtures.ambiguous, /wants a timeout to return the latest partial bytes/);
  assert.match(fixtures.ambiguous, /accepts no cancellation signal/);
  assert.match(fixtures.pagination, /does not choose snapshot or live pagination semantics/);
  assert.match(fixtures.pagination, /no cross-request\s+snapshot capability/);
  assert.match(fixtures.upload, /expects cancellation to remove partial data/);
  assert.match(fixtures.upload, /expects cancellation to preserve resumable progress/);
  assert.match(fixtures.lease, /numeric exhaustion/);
  assert.match(fixtures.lease, /Expiry permits reacquisition with a higher token for the same key/);
});

test('owner-local evaluations cover role, edge, outcome, and routing', () => {
  const fileNames = [
    'role.json',
    'component.json',
    'outcome.json',
    'trigger.json',
  ];
  const definitions = fileNames.map((fileName) => readJson(fileName));

  for (const definition of definitions) {
    assert.equal(
      validateEvaluationDefinition(definition, repositoryRoot),
      definition,
    );
    assert.equal(definition.skill_name, 'implementation-planning');
    assert.equal(definition.evaluation.skill, 'implementation-planning');
  }
  assert.deepEqual(
    definitions.map(({ evaluation }) => evaluation.layer).sort(),
    ['component', 'outcome', 'role', 'trigger'],
  );
  const expectedIds = {
    role: [
      'reviewed-blueprint-role',
      'minor-finding-must-integrate',
      'credible-claim-uncertain-correction',
      'lossless-finding-accounting',
      'low-tier-readiness-gates',
      'unavailable-ticket-publication',
      'zero-downtime-column-migration',
      'payment-retry-design-path',
      'cache-refresh-design-path',
      'proportional-simple-change',
      'unimplementable-exactly-once',
      'ambiguous-timeout-contract',
      'ambiguous-pagination-contract',
      'ambiguous-upload-contract',
      'consumer-contract-depth-and-coverage',
      'incomplete-review-recovery',
      'conditional-baseline-loading',
      'retained-architecture-discovery',
    ],
    component: [
      'architecture-review-guidance-ablation',
      'shared-architecture-quality-ablation',
    ],
    outcome: ['complete-ready-blueprint'],
    trigger: [
      'canonical-implementation-planning',
      'ambient-ticket-blueprint',
      'ticket-decomposition-exclusion',
      'implementation-exclusion',
      'review-exclusion',
      'ambiguous-product-planning',
      'debugging-exclusion',
      'one-off-advice-exclusion',
    ],
  };
  for (const definition of definitions) {
    assert.deepEqual(
      definition.evals.map(({ id }) => id),
      expectedIds[definition.evaluation.layer],
    );
  }
  const role = definitions.find(({ evaluation }) => evaluation.layer === 'role');
  const authorityControl = role.judge.dimensions.find(
    ({ id }) => id === 'authority_control',
  );
  assert.match(
    authorityControl.description,
    /Every source-observable in-scope ambiguity and required contract or capability gap names its owner/,
  );
  assert.match(authorityControl.description, /unranked decision envelope/);
  assert.match(authorityControl.description, /source-backed support boundary/);
  assert.match(authorityControl.description, /non-executable decision matrix/);
  const architectureQuality = role.judge.dimensions.find(
    ({ id }) => id === 'architecture_quality',
  );
  assert.match(architectureQuality.description, /supported consumer contract/);
  assert.match(architectureQuality.description, /earned depth/);
  const behavioralCoverage = role.judge.dimensions.find(
    ({ id }) => id === 'effective_behavioral_coverage',
  );
  assert.match(behavioralCoverage.description, /Every supported consumer action/);
  assert.match(behavioralCoverage.description, /independently derived expected values/);
  const reviewedBlueprint = role.evals.find(
    ({ id }) => id === 'reviewed-blueprint-role',
  );
  assert.deepEqual(reviewedBlueprint.files, [
    'evals/fixtures/payment-retry.md',
  ]);
  assert.ok(reviewedBlueprint.expectations.some((expectation) => (
    expectation.includes('gateway idempotency key')
  )));
  const profileMigration = role.evals.find(({ id }) => (
    id === 'zero-downtime-column-migration'
  ));
  assert.deepEqual(profileMigration.files, [
    'evals/fixtures/profile-column-migration.md',
  ]);
  assert.ok(profileMigration.expectations.some((expectation) => (
    expectation.includes('reads display_name with full_name fallback')
  )));
  const paymentRetry = role.evals.find(({ id }) => (
    id === 'payment-retry-design-path'
  ));
  assert.deepEqual(paymentRetry.files, ['evals/fixtures/payment-retry.md']);
  assert.ok(paymentRetry.expectations.some((expectation) => (
    expectation.includes('crash-after-gateway-acceptance ambiguity')
  )));
  const cacheRefresh = role.evals.find(({ id }) => (
    id === 'cache-refresh-design-path'
  ));
  assert.deepEqual(cacheRefresh.files, ['evals/fixtures/cache-refresh.md']);
  assert.ok(cacheRefresh.expectations.some((expectation) => (
    expectation.includes('process-local per-key in-flight state')
  )));
  const architectureCoverage = role.evals.find(({ id }) => (
    id === 'consumer-contract-depth-and-coverage'
  ));
  assert.deepEqual(architectureCoverage.files, [
    'evals/fixtures/cache-refresh.md',
  ]);
  assert.ok(architectureCoverage.expectations.some((expectation) => (
    expectation.includes('deletion-test results')
  )));
  assert.ok(architectureCoverage.expectations.some((expectation) => (
    expectation.includes('manufactured fake alone does not establish a seam')
  )));
  for (const [id, file, expectationText] of [
    [
      'proportional-simple-change',
      'evals/fixtures/simple-slug-normalization.md',
      'No module, class, interface',
    ],
    [
      'unimplementable-exactly-once',
      'evals/fixtures/webhook-exactly-once.md',
      'no supplied value distinguishes a retry',
    ],
    [
      'ambiguous-timeout-contract',
      'evals/fixtures/export-timeout-contract.md',
      'capability remains a separate evidence question for the renderer owner',
    ],
    [
      'ambiguous-pagination-contract',
      'evals/fixtures/pagination-consistency-contract.md',
      'option-varying outcomes stay in a non-executable decision matrix',
    ],
    [
      'ambiguous-upload-contract',
      'evals/fixtures/upload-cancellation-contract.md',
      'option-varying outcomes stay in a non-executable decision matrix',
    ],
  ]) {
    const evaluation = role.evals.find((candidate) => candidate.id === id);
    assert.deepEqual(evaluation.files, [file]);
    assert.ok(evaluation.expectations.some((expectation) => (
      expectation.includes(expectationText)
    )));
  }
  for (const [id, expectationText] of [
    ['proportional-simple-change', 'finding-closure evidence'],
    [
      'ambiguous-timeout-contract',
      'unranked needs-decision owned by the requirement owner',
    ],
    ['ambiguous-timeout-contract', 'non-executable decision matrix'],
    ['ambiguous-pagination-contract', 'names the requirement owner'],
    ['ambiguous-pagination-contract', 'database owner'],
    ['ambiguous-upload-contract', 'name the requirement owner'],
    ['ambiguous-upload-contract', 'storage owner'],
  ]) {
    const evaluation = role.evals.find((candidate) => candidate.id === id);
    assert.ok(evaluation.expectations.some((expectation) => (
      expectation.includes(expectationText)
    )));
  }
  for (const id of [
    'ambiguous-pagination-contract',
    'ambiguous-upload-contract',
  ]) {
    const evaluation = role.evals.find((candidate) => candidate.id === id);
    assert.ok(evaluation.expectations.some((expectation) => (
      expectation.includes('identical under every option')
    )));
  }
  for (const id of [
    'credible-claim-uncertain-correction',
    'low-tier-readiness-gates',
    'unimplementable-exactly-once',
    'ambiguous-timeout-contract',
    'ambiguous-pagination-contract',
    'ambiguous-upload-contract',
  ]) {
    const evaluation = role.evals.find((candidate) => candidate.id === id);
    assert.ok(hasNeedsDecisionReview(evaluation));
  }

  const outcome = definitions.find(({ evaluation }) => (
    evaluation.layer === 'outcome'
  ));
  assert.deepEqual(outcome.evals[0].files, [
    'evals/fixtures/cache-refresh.md',
  ]);
  assert.ok(outcome.evals[0].expectations.some((expectation) => (
    expectation.includes('same-key single-flight')
  )));

  const component = definitions.find(({ evaluation }) => (
    evaluation.layer === 'component'
  ));
  assert.deepEqual(
    component.evals.map(({ ablated_dependency: dependency }) => dependency),
    ['engineering-guidance', 'architecture-review'],
  );
  assert.ok(component.evals[0].expectations.some((expectation) => (
    expectation.includes('activity design')
  )));

  const closure = readJson('package-closure.json');
  assert.deepEqual(closure, {
    version: 1,
    scope: 'implementation-planning-package-closure',
    owner: 'implementation-planning',
    cases: [
      {
        id: 'missing-engineering-guidance',
        consumer: 'implementation-planning',
        missing_dependency: 'engineering-guidance',
        expected_failure: {
          stage: 'dependency-resolution',
          code: 'missing-internal-dependency',
          message: 'Missing internal dependency "engineering-guidance"',
          missingSkill: 'engineering-guidance',
        },
        covered_clauses: ['ip-missing-engineering-guidance'],
      },
      {
        id: 'missing-architecture-review',
        consumer: 'implementation-planning',
        missing_dependency: 'architecture-review',
        expected_failure: {
          stage: 'dependency-resolution',
          code: 'missing-internal-dependency',
          message: 'Missing internal dependency "architecture-review"',
          missingSkill: 'architecture-review',
        },
        covered_clauses: ['ip-missing-architecture-review'],
      },
    ],
  });
  const suite = loadCanonicalSuite(repositoryRoot);
  const missingGuidance = resolvePackageDependencies(
    suite,
    {
      skills: suite.inventory
        .filter(({ name }) => name !== 'engineering-guidance'),
    },
    'implementation-planning',
  );
  assert.deepEqual(missingGuidance, {
    missingSkill: 'engineering-guidance',
    code: 'missing-internal-dependency',
  });
  const missingArchitectureReview = resolvePackageDependencies(
    suite,
    {
      skills: suite.inventory
        .filter(({ name }) => name !== 'architecture-review'),
    },
    'implementation-planning',
  );
  assert.deepEqual(missingArchitectureReview, {
    missingSkill: 'architecture-review',
    code: 'missing-internal-dependency',
  });
});

test('Implement consumes a ready blueprint without owning its revision', () => {
  const implement = read(path.join(
    repositoryRoot,
    'skills',
    'implement',
    'SKILL.md',
  ));

  assert.match(implement, /durable `ready` implementation blueprint/);
  assert.match(implement, /both normative blueprint plans/);
  assert.match(implement, /Before mutation, verify that:/);
  assert.match(implement, /Uncle Bob\/Clean Architecture[\s\S]*same final\s+revision/);
  assert.match(implement, /John Ousterhout\/APOSD[\s\S]*same final\s+revision/);
  assert.match(implement, /every engineering-baseline guideline has an artifact-specific/);
  assert.match(implement, /every repository evidence record is bound to the implementation base/);
  assert.match(implement, /every proof command has complete\s+command-admission evidence/);
  assert.match(implement, /every ordered C, T, and P proof plus every CMD\s+gate/i);
  assert.match(implement, /proof-ID coverage/);
  assert.match(implement, /every credible in-scope finding was integrated/);
  assert.match(implement, /every source finding identity has one disposition and closure/);
  assert.match(implement, /no finding is `needs-decision`, superseded, deferred, nice-to-have, optional/);
  assert.match(implement, /resume\s+`implementation-planning`/);
  assert.match(implement, /stop before widening or redesigning the patch/);
});
