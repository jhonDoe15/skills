# Implementation blueprint contract

The marked block below is the canonical planning artifact on one implementation
ticket. Preserve ticket content outside the block. Replace the complete block
when issuing a new revision so one ticket never carries competing current plans.
Architecture-quality terms and gates use the required canonical
`architecture-review` result as their source.

```markdown
<!-- implementation-blueprint:v1 -->
# Implementation blueprint

- Status: ready | needs-decision
- Revision: [monotonic revision or content identity]
- Implementation ticket: [durable reference]
- Source requirements: [durable references]
- Repository: [identity and root]
- Implementation base: [immutable revision]
- Engineering baseline: [reference and content identity]
- Evidence checked at: [timestamp and timezone]
- Planning owner: [session or agent identity]

## Outcome and scope

### Intended outcome
[One observable implementation outcome.]

### In scope
- [Behavior or responsibility.]

### Out of scope
- [Explicit exclusion and owner, ticket, or reason.]

### Support boundary
- Supported domain: [source-backed scenarios, callers, and compatibility paths]
- Non-design-bounded freedom or extensions: [item and source-backed reason]
- Smallest consistent design: [choice that stays outside the public contract]

### Acceptance and requirement ledger
- R1 — [source requirement and reference]
  - Normative excerpt or immutable content identity:
  - Retrieved and access-verified at:
  - Interpretation and preserved rationale:
  - Design: [technical-design section or decision ID]
  - Proof: [test or non-test proof ID]

### Prerequisites and constraints
- [Verified status, consumed output, compatibility constraint, or blocker.]

## Evidence and uncertainty

### Authority ledger
- AU1 — [source and content identity]
  - Scope/affected paths:
  - Class: controlling | mechanically constraining | descriptive |
    quality baseline
  - Precedence and conflicts:

### Repository evidence
- E1 — `path:line-range` or immutable reference at [base]: [fact established]

### Search and coverage ledger
- Q1 — [requirement or candidate symbol]
  - Search terms and tools:
  - Declarations/aliases/exports/registrations/callers/effects:
  - Configuration/schemas/jobs/tests/docs/similar copies:
  - Meaningful no-hit results:
  - External boundary or explicit exclusion:

### Architecture scan
[Apply every canonical architecture-quality scan item and claim to each
affected module and the blueprint as a whole.]
- AR1 — [affected module | whole blueprint]
  - Scope-bounded scan results and evidence:
  - Quality-claim dispositions and design/proof IDs:
  - Supporting and contrary evidence:
  - Recommendation strength: strong | worth-exploring | speculative

### Engineering-baseline applicability
[Complete this ledger even when repository authority is absent, weak, or stale.]
- [Guideline]: applicable | not-applicable | conflict
  - Artifact-specific reason:
  - Design, finding, or proof IDs:

### Investigation provenance
- Retained architecture brief: [immutable identity, scope, base, and lens evidence]
- [Spec | Standards | Architecture investigator—dynamic behavior |
  Architecture investigator—static structure | specialist]
  - Named evidence gap and closure condition: [or covered by retained brief]
  - Identity:
  - Requested and resolved model or tier:
  - Context: fresh | resumed
  - Immutable evidence base:

### Assumptions
- A1 — [assumption]
  - Class: verified | non-design-bounded | material-unresolved
  - Falsification check:
  - Affected decisions:
  - Owner and consequence if false:

### Decision envelopes
- DE1 — [implementation-shaping behavior or capability question]
  - Status: blocked
  - Controlling owner for each behavior question:
  - Existing authoritative sources for each behavior question:
  - Evidence owner for each capability question:
  - Verified constraints and invariants:
  - Unranked behavior-level options and tradeoffs:
  - Evidence required from each owner to settle:
  - Non-executable decision matrix:
  - Blocked design fields, scenarios, commands, and slices:
  - Decision-independent characterization or proof identical under every option:

### Decisions
- D1 — [settled question and selected option]
  - Controlling authority:
  - Verified capability evidence:
  - Mechanical constraints:
  - Descriptive repository evidence:
  - Quality lens/default:
  - Conflict resolution and rejected alternatives:

### Open decisions and rabbit holes
- O1 — [question or likely hidden complexity]
  - Status: retired | material-unresolved
  - Evidence and falsification proof:
  - Owner and resolution gate:
  - Affected decisions/slices:

## Technical design plan

### Current behavior
[Current control/data path and ownership, with evidence IDs.]

### Proposed behavior
[Proposed control/data path and externally observable changes.]

### Ownership and invariants
- I1 — [invariant]: owner [module]; enforced at [seam]; proof [test/proof ID]

### Modules, interfaces, and seams
- M1 — [module and responsibility]
  - Consumer, goal, and action:
  - Seam:
  - Interface, including ordering, usage, and error modes:
  - Observable outcomes:
  - Dependencies and direction:
  - Behavior hidden from callers:
  - Callers and compatibility:
  - Reason-for-change owner:
  - Information hidden and locality gained:
  - Deletion-test result:
  - Depth justification:
  - Seam-reality evidence and adapters:
  - Contract proof IDs:

### State and lifecycle
- Normal:
- Failure:
- Timeout:
- Cancellation:
- Retry:
- Late or duplicate settlement:
- Not applicable: [justify omitted paths]

### Scenario ledger
- SC1 — [branch]
  - Trigger/precondition and current state:
  - Owner and transition:
  - Effects started:
  - Observable result and error translation:
  - Retry/cancellation/timeout/late-work behavior:
  - Telemetry:
  - Compatibility consequence:
  - Proof ID:

### Effects and boundaries
- Persistence/data:
- External effects and adapters:
- Authorization/security:
- Concurrency:
- Observability/telemetry:
- Operations/rollout:
- Compatibility/migration:

### Change map
- Add: `path` — [symbols and responsibility]
- Change: `path` — [symbols and responsibility]
- Preserve: `path` — [contract that must remain]
- Remove: `path` — [obsolete responsibility and safe removal condition]

### Durable provenance
- DP1 — [non-obvious ordering, compatibility constraint, workaround, or
  rejected obvious alternative]
  - Destination: code comment | documentation | ADR | durable reference
  - Source/provenance:
  - Revalidate or remove when:

### Implementation slices
1. S1 — [one vertical behavior]
   - Design decisions:
   - Files/symbols:
   - Consumed prerequisite:
   - Explicit exclusions:
   - Proof IDs:
   - Executor class: lowest-capable | standard | strongest
   - Classification: settled | local | design | risk
   - Tier reason:
   - Stop and escalate when:

### Alternatives considered
- ALT1 — [materially different design]
  - Distinct from:
  - Depth and caller leverage:
  - Locality and invariant ownership:
  - Test seam:
  - Compatibility and change cost:
  - Disposition:

### Diagrams
- Current architecture: [Mermaid view using the module IDs above]
- Proposed architecture: [Mermaid view using the module IDs above]
- Behavior: [Mermaid view using scenario and proof IDs above]
- Unchanged topology: [evidence-backed `not-applicable` when no structural
  relation changes]

[Written contracts above remain normative. If stored separately, link the
durable ticket-local appendix here and verify it is retrievable; normative
content never exists only in an appendix.]

## TDD test plan

### Approved test seams
- TS1 — [public or leaf seam, observable behavior, why this level]

### Consumer behavior and effective coverage
- CB1 — [consumer → goal → action → interface/seam → observable outcome]
  - Supported requirement, promise, or risk:
  - Success/failure/lifecycle variants:
  - Proof: [C/T/P ID | justified non-test proof | evidenced not-applicable |
    decision envelope]
  - Independent expected-value source:
  - Duplicate or implementation-mirroring checks excluded:

### Command admission
- CMD1 — [exact command]
  - Authoritative definition/source:
  - Working directory:
  - Setup and environment prerequisites:
  - Required services or credentials:
  - Expected duration and output shape:
  - Headless/noninteractive suitability:
  - Non-mutating evidence:
  - Worktree state before and after:
  - Planning-time smoke check at implementation base:

### Characterization locks
- C1 — [existing compatibility behavior]
  - Test location/title:
  - Setup and deterministic adapters:
  - Stimulus:
  - Observable assertion:
  - Existing green command: [CMD ID]
  - Protects requirements/invariants:

### Vertical red-green slices
1. T1 — [one behavior at one approved seam]
   - Implements design slice:
   - Test location/title:
   - Setup/fixture:
   - Deterministic adapters or time control:
   - Stimulus:
   - Observable assertion and independent expected value:
   - Smallest production responsibility:
   - Focused red/green command: [CMD ID]
   - Relevant regression command: [CMD ID]
   - Expected red reason:
   - Green completion condition:
   - Stop and escalate when:

### Integration and non-unit proof
- P1 — [contract, integration, migration, concurrency, manual, or static proof]
  - Environment and command/action:
  - Observable pass condition:
  - Requirement/invariant covered:

### Regression and build gates
1. [CMD ID] — [surface covered and pass condition]

### Traceability
- R1 → [C/T/P IDs]
- I1 → [C/T/P IDs]

## Review record

Record every required review row for both `ready` and `needs-decision`
revisions. On a `needs-decision` revision, reviewers assess authority handling,
decision envelopes, decision-independent work, and blocker routing. Completed
rows contain an evidence-bearing `PASS` or concrete findings. An unavailable,
failed, partial, or not-yet-run review uses `INCOMPLETE` and preserves any actual
evidence. An `INCOMPLETE` row blocks `ready`; it is valid evidence of missing work
on a `needs-decision` revision, never a completed review or a waiver.

For each `INCOMPLETE` row, include:
- Required lens and target revision:
- Attempted reviewer identity/model/context/base: [actual values or unavailable]
- Cause: [failure, unavailable reviewer/dependency, or missing coverage]
- Evidence retained: [partial return, error, or no result]
- Recovery owner:
- Recovery condition: [action and observable complete-review requirement]

Use the row forms below for completed results; substitute the `INCOMPLETE`
record above when needed. The final rows must all be evidence-bearing PASS
before `ready`; a completed review with findings remains visible during recovery.

### Revision history
- [Revision]: [integrated changes, full-artifact readback, and evidence]

### Initial technical-design review
[Preserve this revision-scoped ledger after TDD derivation and final review.
For every PASS, include coverage IDs, evidence IDs, searches/diagnostics,
contrary evidence, and `unresolved: none`; otherwise list every source finding
ID.]
- Spec: PASS | [finding IDs] on [revision] — [identity; requested and resolved
  model or tier; fresh or resumed; immutable evidence base]
- Standards: PASS | [finding IDs] on [revision] — [identity; requested and
  resolved model or tier; fresh or resumed; immutable evidence base]
- Architecture dynamic behavior: PASS | [finding IDs] on [revision] —
  [identity; requested and resolved model or tier; fresh or resumed; immutable
  evidence base]
- Architecture static structure: PASS | [finding IDs] on [revision] —
  [identity; requested and resolved model or tier; fresh or resumed; immutable
  evidence base]
- Uncle Bob/Clean Architecture: PASS | [finding IDs] on [revision] —
  [identity; requested and resolved model or tier; fresh or resumed; immutable
  evidence base]
- John Ousterhout/APOSD: PASS | [finding IDs] on [revision] — [identity;
  requested and resolved model or tier; fresh or resumed; immutable evidence
  base]
- [Specialty]: PASS | [finding IDs] | not applicable on [revision] —
  [identity/reason; requested and resolved model or tier; fresh or resumed;
  immutable evidence base]

### Findings and dispositions
- F1 — [Spec | Standards | Architecture | Uncle Bob/Clean Architecture |
  John Ousterhout/APOSD | specialist]
  - Source finding IDs:
  - Source reviewer identity and reviewed revision:
  - Original claim:
  - Blueprint quote:
  - Evidence:
  - Authority or engineering-baseline guideline:
  - Severity: blocker | major | minor | note
  - Finding confidence and rationale:
  - Fix-direction confidence and rationale:
  - Context limits:
  - Affected scope:
  - Scope relation: in-scope | out-of-scope with controlling source evidence
  - Consequence:
  - Highest credible correction:
  - Acceptance/proof IDs:
  - Disposition: integrated | disproved | out-of-scope | needs-decision
  - Disposition evidence: [stronger contrary evidence, source scope evidence,
    or the unresolved decision that blocks readiness, when applicable]
  - Closure: [revision and design/slice/proof IDs, blocker ID, or controlling
    exclusion plus owner]

### Final independent review
[For every PASS below, record required coverage IDs, evidence IDs examined,
searches or diagnostics performed, contrary evidence considered, and
`unresolved: none`. PASS means zero findings on this exact revision.]
- Spec: PASS on [revision] — [identity; requested and resolved model or tier;
  fresh or resumed; immutable evidence base]
- Standards: PASS on [revision] — [identity; requested and resolved model or
  tier; fresh or resumed; immutable evidence base]
- Architecture dynamic behavior: PASS on [revision] — [identity; requested and
  resolved model or tier; fresh or resumed; immutable evidence base]
- Architecture static structure: PASS on [revision] — [identity; requested and
  resolved model or tier; fresh or resumed; immutable evidence base]
- Uncle Bob/Clean Architecture: PASS on [revision] — [identity; requested and
  resolved model or tier; fresh or resumed; immutable evidence base]
- John Ousterhout/APOSD: PASS on [revision] — [identity; requested and resolved
  model or tier; fresh or resumed; immutable evidence base]
- [Specialty]: PASS | not applicable on [revision] — [identity/reason; requested
  and resolved model or tier; fresh or resumed; immutable evidence base; one row
  per triggered specialty]

## Implementation start

- Gate: enabled only when status is `ready`; when `needs-decision`, state
  `blocked` and route to blocker owners plus a fresh planning revision
- Start from: [immutable implementation base]
- Invoke: `implement` with this ticket and both normative plans
- TDD owner: invoke the external `tdd` prerequisite for each ordered T slice
- Proof order: execute every ordered C, T, and P proof plus every CMD gate and
  retain each proof ID in the implementation handoff
- Per-slice loop: verify expected red → implement the smallest responsibility →
  verify focused green → run the relevant regression → record evidence; stop on
  any mismatch
- First slice: [ID]
- Plan freshness check: [ticket revision/base/prerequisite checks]
- Return to planning when: [design contradiction, unexpected ownership or risk
  boundary, stale base, unavailable command, or failed seam assumption]
- Context disposition: start a fresh isolated implementation session from this
  ticket; do not carry planning conversation as authority

## Blockers
- None | [decision/evidence, owner, and observable resolution condition]
<!-- /implementation-blueprint -->
```

## Readiness checks

A `ready` blueprint satisfies all of these checks:

- Every source requirement has exactly one ledger entry and at least one design
  destination and proof.
- Every affected path has a complete authority ledger; controlling, mechanical,
  descriptive, and quality-baseline sources remain distinct.
- Every source-observable in-scope ambiguity and required contract or capability
  gap has either an authority-backed decision with verified capability evidence
  or one decision envelope.
- Every unobserved implementation freedom and unsupported or pathological
  extension is recorded against the source-backed support boundary as
  `non-design-bounded`, with the smallest consistent design, and is not promoted
  into a public scenario or blocker.
- Every decision envelope keeps options unranked at behavior level, names the
  controlling and capability-evidence owners plus the evidence required for
  settlement, and links all blocked design fields, scenarios, commands, and
  slices without embedding a selected interface, result type, schema, protocol,
  configuration owner, dependency method, or option-specific test.
- Every detail labeled decision-independent has identical setup, observable
  result, timing, effects, cleanup, and production responsibility under every
  envelope option; differing outcomes appear only in a non-executable decision
  matrix.
- Every decision envelope is settled and converted into an authority-backed
  decision before `ready`.
- Every repository evidence ID is verified at the immutable implementation base,
  and every requirement/candidate-symbol search reaches an external boundary or
  explicit exclusion.
- Every assumption is `verified` or `non-design-bounded`; no assumption that can
  alter behavior, scope, seams, paths, commands, or proof remains unresolved.
- Every rabbit hole is `retired` with falsifying evidence or proof; any
  `material-unresolved` rabbit hole blocks `ready`.
- Every written invariant names one owner, enforcement seam, and proof.
- Every affected module and the blueprint as a whole satisfies all six canonical
  architecture-quality claims. The architecture ledger traces every scan item
  and claim to supporting and contrary evidence, design and proof IDs, or an
  evidence-backed `not-applicable`.
- Every applicable lifecycle and effect boundary has defined behavior.
- Every lifecycle and effect category maps to a complete scenario or an
  evidence-backed `not-applicable`.
- Every change-map path is supported by repository evidence.
- Every non-obvious constraint that implementation must preserve has a durable
  rationale destination, provenance source, and revalidation/removal condition.
- Every implementation slice is `settled`; no `local`, `design`, or `risk`
  classification remains for the implementation agent.
- No admitted red-green slice depends on a blocked decision envelope.
- Every TDD slice tests through an approved seam and states an independently
  observable red and green condition.
- Every distinct focused, regression, and build command has command-admission
  evidence: authoritative source, working directory, prerequisites, services or
  credentials, expected duration/output, headless suitability, and a safe
  planning-time smoke check at the immutable base whose non-mutating,
  noninteractive behavior is verified by comparing worktree state before and
  after. Hidden human setup, mutation, interaction, or an unverified command
  blocks `ready`.
- Characterization, vertical slices, and broader gates form one executable
  order without requiring all tests to be written before production work.
- Technical design and test plan use the same terms, seams, responsibilities,
  and behavior ordering.
- The complete integrated artifact was reread after its last correction and
  before its final revision identity was assigned.
- Every engineering-baseline guideline has an artifact-specific applicability
  disposition and traceable design, finding, or proof IDs, even when repository
  authority is absent, weak, or stale.
- Spec, Standards, Architecture, Uncle Bob/Clean Architecture, John
  Ousterhout/APOSD, and required specialist reviews passed the same final
  revision; Architecture covered dynamic behavior and static structure. Each
  result includes reviewer identity, requested and resolved model or tier, fresh
  or resumed context, and immutable evidence base.
- The initial technical-design review ledger remains revision-scoped and
  records each mandatory lens's evidence-bearing PASS or every source finding
  ID; final review never overwrites it.
- Specialist triggers were recalculated after the last integrated revision;
  every triggered specialty has one separate final evidence-bearing PASS, and
  no trigger applicability remains uncertain.
- Every `PASS` records zero findings on its exact revision plus coverage
  evidence sufficient to detect drift in authority, search closure,
  assumptions, evidence base, and command admission.
- Every source finding identity and original conclusion is preserved and has
  exactly one disposition and closure. Compatible groups retain every source ID;
  severity, confidence, Context-limit, scope, evidence, consequence, or
  correction disagreements remain separate.
- Every credible in-scope finding, regardless of size, severity, or pre-existing
  status, is integrated and mapped to implementation and proof work.
- Every other finding is disproved with stronger evidence, source-backed
  `out-of-scope`, or readiness-blocking `needs-decision`. Cost, severity,
  priority, or optional labeling cannot establish scope. No superseded,
  deferred, nice-to-have, optional, or won't-fix disposition exists.
- Every separate explanatory appendix is linked from the canonical block and
  contains no uniquely normative requirement.
- The implementation base and prerequisite statuses were rechecked immediately
  before publication.

If any check fails, use `needs-decision`, preserve the partial evidence, and
name the smallest action that can satisfy the failed check.
