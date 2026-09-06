# Architecture quality

Use this shared reference to evaluate existing or proposed architecture. The
caller owns its artifact, authority, finding dispositions, and mutation
boundary.

## Scope-bounded architecture scan

Ground names in the domain glossary and applicable ADRs. Use target evidence
and change history to prioritize relevant hot spots without widening scope.
Scan the affected area for:

- **caller bouncing** needed to understand one concept;
- shallow or pass-through modules;
- knowledge, policy, or sequencing leaked across modules;
- changes and proofs scattered without locality;
- behavior that is hard to test through its current interface;
- inputs whose meaning changes with ambient filesystem, working-directory,
  process, environment, or registry state; and
- consumers that bypass an established public entry point, adapter, or
  capability interface to reach its underlying files or representation.

Treat deterministic interpretation and explicit source or mode selection as
architecture value: reducing hidden preconditions improves navigability for
humans, tests, and AI agents. A test-only or override path may lower runtime
severity; ambient interpretation remains architecturally relevant.

When an official entry point or adapter exposes the needed operation, a changed
consumer's direct access to its underlying module is a boundary violation. In a
pre-merge review, report it as merge-blocking unless controlling authority
explicitly permits the bypass. Apply the repository's legacy ratchet to
untouched consumers.

Apply the **deletion test** under Earned depth to every added, retained, removed,
or materially changed module. Treat the **interface as the consumer and test
surface**; it includes every fact a caller must know, not only a type signature.

Establish **seam reality** from present substitution, effect control,
compatibility, or independently changing policy and detail. Two meaningful
adapters strengthen the evidence; a manufactured fake does not. Compare
materially different interfaces when consequential ownership or interface
choices are genuinely open.

Record current and proposed Mermaid views when architecture changes, using the
artifact's module and scenario terms. For existing code, record the current
view. If topology is unchanged or a diagram adds no explanatory value, record
that fact and its evidence. Written contracts remain normative.

## Quality claims

Evaluate these claims for every affected module and for the target as a whole:

1. **Supported consumer contract.** Trace each supported behavior as
   `consumer → goal → action → interface/seam → observable outcome`, including
   applicable usage, ordering, and failure promises.
2. **Effective behavioral coverage.** Every supported action, requirement,
   interface promise, invariant, compatibility promise, and applicable
   lifecycle, effect, or failure risk has a discriminating test, justified
   non-test proof, evidenced `not-applicable`, or explicit gap. Derive expected
   values independently; duplicate scenarios and tests that mirror the
   implementation add no coverage.
3. **Coherent ownership and locality.** Every policy, invariant, transition,
   effect, schedule, and hidden design decision has one enforcement owner.
   Keep Martin's reason-for-change evidence distinct from Ousterhout's
   information-hiding evidence when they disagree.
4. **Earned depth.** Each module's interface cost is justified by meaningful
   behavior, decisions, sequencing, or variation hidden for current consumers.
   The deletion test asks whether deleting the module redistributes supported
   complexity to consumers or removes only empty indirection.
5. **Real seam and justified dependency direction.** Each seam has a semantic
   contract, owner, composition path, present variation or effect need,
   adapters where applicable, failure translation, and contract proof.
   Policy/detail direction follows source-backed responsibility rather than
   interface ceremony.
6. **Proportional change.** Prefer the smallest design that satisfies supported
   behavior and consumer-observable vertical slices. A non-behavioral slice
   needs a mechanical ordering constraint, first consuming behavioral slice,
   independent proof, rollback or cleanup consequence, and evidence that
   folding it into that slice is unsafe.

Naming a doctrine, drawing a preferred topology, maximizing test count, or
quoting a coverage percentage is not evidence for a claim.

## Mandatory independent lenses

Give the same immutable target to fresh, independent Architecture
dynamic-behavior, Architecture static-structure, Uncle Bob/Clean Architecture,
and John Ousterhout/APOSD reviewers. Both persona lenses are mandatory and
separate. Target status and pre-existing code never suppress a lens.

- **Architecture dynamic behavior** examines consumer paths, state,
  concurrency, effects, failure translation, lifecycle, compatibility, and
  observable proof.
- **Architecture static structure** examines ownership, dependency direction,
  interfaces, locality, module depth, composition, and change propagation.
- **Uncle Bob/Clean Architecture** applies Robert C. Martin's
  [SOLID relevance](https://blog.cleancoder.com/uncle-bob/2020/10/18/Solid-Relevance.html)
  and [Clean
  Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
  as a reasoning lens. Ask what changes for the same reason, which policy must
  remain independent of details, whether dependencies cross boundaries toward
  policy-owned abstractions, and whether interfaces are cohesive,
  substitutable, and no wider than callers need. SOLID does not require
  classes, layers, inheritance, or one interface per dependency.
- **John Ousterhout/APOSD** applies John Ousterhout's
  [Modular
  Design](https://web.stanford.edu/~ouster/cgi-bin/cs190-winter18/lecture.php?topic=modularDesign)
  and [*A Philosophy of Software
  Design*](https://web.stanford.edu/~ouster/cgi-bin/aposd.php). Ask where
  dependencies and obscurity create complexity, how much useful behavior each
  interface hides, which knowledge leaks between modules, and whether
  complexity can move into one coherent owner. Examine shallow or pass-through
  modules, temporal decomposition, configuration leakage, repeated adjacent
  abstractions, avoidable exceptions, whether errors can be defined out of
  existence, obvious common paths, names, consistency, and durable design
  comments. Depth is not file size; generality serves known needs; complexity
  moved downward must not create a god module.

Resolve conflicts between lenses against controlling requirements and
mechanical constraints, never persona preference. Popularity is not authority:
quality guidance supplies fallback and challenge evidence only where stronger
scoped authority is silent.

Each reviewer returns an evidence-bearing zero-finding `PASS` or concrete
findings. A valid `PASS` names examined scope, quality claims, source evidence,
contrary evidence, context limits, and `unresolved: none`. `PASS with nits`,
`pending`, `not run`, `blocked`, and evidence-free `PASS` are invalid. Keep
lens conclusions separate until the caller reconciles them.

## Specialist coverage

For every concrete risk identified by the scan and Engineering Guidance, record
the target evidence, expertise needed, and one coverage disposition:

- `covered-by-existing-lenses`: cite a mandatory reviewer's relevant expertise
  and evidence that its returned review covers the risk;
- `separately-reviewed`: obtain an independent specialist result under the same
  target and reviewer-result rules, and cite its coverage; or
- `unavailable`: record the missing capability or unresolved expertise need,
  its effect on the review, and the evidence needed to resolve it.

Dispatch a separate specialist when the mandatory reviewers cannot establish
the needed coverage. Unknown coverage remains a context limit, never a covered
disposition. If no additional expertise is needed, record the assessed risks
and evidence supporting coverage by the mandatory lenses. Any unavailable
required coverage makes the caller's review incomplete.

## Finding credibility and identity

A credible finding cites controlling requirements, mechanical diagnostics,
direct source or test behavior, or an applicable quality guideline; quotes
target evidence; states scope and consequence; and considers contrary evidence
and context limits. A supported correction direction names affected artifacts,
preserves controlling constraints, states acceptance evidence, and exposes any
remaining design choice.

Apply the decision ladder and falsification evidence before reconciliation.
When controlling design intentionally deploys a seam before its named consumer,
classify it as intentional staging and report its staging cost or proof gap.

Preserve every source finding identity and original conclusion. Group findings
only when claim, severity, confidence inputs, context limits, evidence, scope,
consequence, and correction direction are compatible. Retain every grouped
source identity and keep disagreements separate.
