---
name: implementation-planning
description: "Plan one bounded implementation ticket before code: produce a reviewed technical design and executable consumer-behavior TDD plan for another agent."
disable-model-invocation: false
---

# Implementation Planning

Produce one **implementation blueprint** on the implementation ticket. The
blueprint's technical design and TDD test plan make implementation mechanical
for the lowest capable model while keeping design and risk decisions in
planning.

The blueprint is agent-primary and human-inspectable. Production artifacts stay
clear to both audiences.

## 1. Admit the planning work

Confirm the request targets one bounded implementation ticket and a pre-code
technical-design-plus-TDD outcome. Route decomposition, implementation,
debugging, one-off advice, broad product planning, and post-implementation
review to their owning flows.

Read [evidence and authority](references/evidence-and-authority.md) before
discovery. Apply its planning boundary and verify every required input or
record a named blocker with its owner and resolution condition.

*Complete when:* the ticket, requirements, repository, immutable base,
authority, prerequisites, constraints, exclusions, and publication
authorization are each verified or represented by a blocker.

## 2. Ground and discover

Preflight `engineering-guidance` and `architecture-review`; either missing
canonical Skill blocks dependent work. Invoke `architecture-review` against the
immutable current architecture and retain its brief as discovery evidence.
Preserve partial or failed results with review-recovery blockers; continue only
work supported by verified evidence. Read and disposition every item in
[the mandatory engineering baseline](references/engineering-baseline.md).
Classify work by residual
uncertainty and dispatch independent investigations only for the named gaps
defined in evidence and authority.

Reconcile returns centrally. Bind repository evidence to the immutable base,
close affected search paths, and record assumptions, contradictions, rabbit
holes, investigator provenance, and meaningful no-hit results.

*Complete when:* every requirement and affected path has authoritative,
base-bound evidence or a recovery blocker; every baseline item has a traceable
disposition or an applicability blocker; every
investigation has closed its scope or recorded a recovery blocker; and every
unresolved fact has an owner and gate.

## 3. Settle design authority

Apply the support boundary and design-authority gate from evidence and
authority. Select only behavior authorized by controlling sources and
capabilities verified by evidence. Keep implementation freedom bounded to the
smallest consistent design.

Represent each unresolved in-scope behavior or required capability with one
unranked decision envelope. Continue only work that is identical under every
option; place differing outcomes in a non-executable decision matrix.

*Complete when:* every implementation-shaping choice is settled with authority
and capability evidence or blocks its dependent design fields, scenarios,
commands, and slices without embedding a preferred option.

## 4. Draft the technical design

Use the retained `architecture-review` brief as the canonical architecture
scan, quality-claim, and persona evidence. Read [blueprint
review](references/blueprint-review.md) and [the blueprint
contract](references/implementation-blueprint.md) before drafting. Fill the
technical-design fields from settled evidence.

Reuse its ticket-bounded current-architecture scan; extend the six quality
claims to the proposed modules and blueprint as a whole. Draft current and
proposed behavior, ownership, interfaces, seams, lifecycle, effects, compatibility,
change map, durable rationale, alternatives, diagrams, and ordered
implementation slices. Link blocked fields to their decision envelopes.

*Complete when:* every applicable technical-design field is evidence-backed,
linked to a blocker, or has a justified `not-applicable`; every consumer
contract, invariant, lifecycle scenario, and changed module has an owner and
proof; and implementation receives no latent design work.

## 5. Review the design

Invoke `architecture-review` afresh against one numbered design revision, then
run blueprint review's Spec, Standards, specialist, and `needs-decision`
extensions against that same revision.

Gate unsettled design findings before comparing alternatives. Integrate
compatible corrections centrally, reread the whole artifact, and issue a new
revision only after verifying each correction landed consistently.

*Complete when:* every mandatory and triggered review on the same revision has
an evidence-bearing zero-finding `PASS`, complete findings, or an `INCOMPLETE`
record with recovery owner and condition; every exposed design choice is
settled or enclosed by a blocker. Any incomplete review keeps `needs-decision`.

## 6. Dispose findings and derive TDD

Apply blueprint review's lossless finding dispositions. Integrate every
credible in-scope correction into design, implementation slices, and proof;
preserve every source finding identity and closure.

Derive characterization locks and ordered vertical red-green slices from
settled consumer contracts, not private structure. Each slice names its
approved seam, setup, deterministic controls, stimulus, independent observable
assertion, smallest production responsibility, exact focused and regression
commands, expected red, green condition, and escalation stop.

Admit each proof command using the blueprint contract. Map every settled
requirement, interface promise, invariant, compatibility promise, and
applicable lifecycle, effect, or failure risk to a discriminating test,
justified non-test proof, evidenced `not-applicable`, or blocker.

*Complete when:* every source finding has one valid disposition and closure,
every settled proof obligation is traceable, every admitted slice has a full
red-green-regression loop, and no executable slice depends on a blocker.

## 7. Re-review and decide readiness

Invoke `architecture-review` and every blueprint review afresh against the same
revision containing both plans. Recalculate specialist triggers after each
integrated revision; a credible finding opens a new integration cycle.

Evaluate every readiness check in the blueprint contract against that revision.
Set status `ready` only when all pass. Otherwise set `needs-decision` and name
the smallest evidence or owner decision that can satisfy each failed check.

*Complete when:* one revision has an honest final review record, lossless
finding accounting, and technical and TDD plans consistent with its status:
`ready` requires every check to pass; `needs-decision` preserves incomplete
evidence and routes each recovery action to its owner.

## 8. Publish or return the blueprint

When authorized, replace the complete marked blueprint block on the
implementation ticket while preserving unrelated content. Re-read the ticket
and verify status, revision, both plans, review record, implementation-start
gate, and immutable base.

When publication is unavailable, return the complete canonical draft, exact
target ticket, and explicit publication status. A `ready` blueprint starts
implementation in a fresh isolated session using `implement` and `tdd`; a
`needs-decision` blueprint returns to its blocker owners and then this skill.

*Complete when:* the durable ticket or returned draft alone gives a fresh agent
the complete next action without treating planning conversation as authority.
