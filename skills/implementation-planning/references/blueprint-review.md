# Blueprint architecture review

Use this reference with the canonical `architecture-review` result when
drafting, reviewing, and revising an implementation blueprint.

## Draft the technical design

Fill every applicable technical-design field in [the blueprint
contract](implementation-blueprint.md). A blocked field links to its decision
envelope and contains only decision-independent facts.

Build the scenario ledger from consumer actions. Classify every assumption as
`verified`, `non-design-bounded`, or `material-unresolved`, with a falsification
check and affected decisions. Retire every rabbit hole with evidence or convert
it into a blocking envelope. Plan a durable rationale destination, provenance,
and revalidation or removal condition for each non-obvious ordering rule,
compatibility constraint, workaround, or rejected obvious alternative.

## Extend the mandatory review

Add fresh, independent Spec and Standards reviewers to the mandatory
Architecture dynamic-behavior, Architecture static-structure, Uncle Bob/Clean
Architecture, and John Ousterhout/APOSD lenses run by `architecture-review`.
Blueprint status never suppresses review: request every lens for both `ready`
and `needs-decision`. `architecture-review` owns its Engineering Guidance
invocation and concern-coverage validation.

On a `needs-decision` revision, reviewers assess authority handling, decision
envelopes, decision-independent work, and blocker routing. Each reviewer
returns an evidence-bearing zero-finding `PASS` or concrete findings using the
blueprint contract. Keep each lens's findings separate until central
integration. If a required reviewer is unavailable, fails, or returns incomplete
coverage, preserve the actual result in an `INCOMPLETE` row using the blueprint
contract: cause, owner, and recovery condition. Continue available independent
reviews and decision-independent planning; return `needs-decision` while any
required review remains incomplete. Never invent a PASS or findings to fill a
missing result; `ready` still requires every mandatory and triggered review.

When a finding exposes an unsettled interface, ownership seam, state machine,
or dependency direction, gate design authority first. If selection is
authorized and capabilities are verified, run **Design It Twice** with at least
three materially different interfaces or ownership models: a minimal
interface, a common-consumer optimized interface, and an explicit-state or
ports-and-adapters alternative when applicable. Compare depth, locality,
invariant ownership, test seams, compatibility, and change cost. Count
materially equivalent proposals once. Otherwise retain unranked behavior-level
options in a decision envelope.

## Dispose findings losslessly

Give every source finding identity exactly one disposition:

- `integrated`: apply its credible in-scope correction to design, slices, and
  proof;
- `disproved`: reject it with stronger contrary evidence;
- `out-of-scope`: cite the controlling requirement or explicit exclusion; or
- `needs-decision`: name the unresolved authority, risk, or correction choice
  and block `ready`.

Preserve source identity and original conclusion. Every credible in-scope
finding is integrated regardless of size, severity, priority, or pre-existing
status. Planning has no deferred, nice-to-have, optional, superseded, or
won't-fix disposition. Cost and severity may order work but cannot establish
scope.

After integration, reread the complete blueprint, verify every correction
landed consistently, then assign a new revision and dispatch every required
review afresh against that same revision.
