---
name: ticket-scope
description: Private per-candidate scope judgment consumed by Slice Plan and PR Carver; not a user-facing planning outcome.
---

# Ticket Scope

## Interface

Accept exactly one candidate plus the settled source requirements it claims to
serve. The caller provides the candidate's intended outcome, boundary,
acceptance, validation, known dependencies, collisions, migration constraints,
and current uncertainty. Return one bounded judgment. Do not inspect or
re-plan sibling candidates.

## Judge one candidate

Evaluate the candidate in this order:

1. **Outcome and seam** — require one cohesive observable outcome at one natural
   ownership seam.
2. **Boundary** — require concrete in-scope and out-of-scope behavior.
3. **Independent verification** — acceptance and validation must be executable
   without an unrelated sibling. A true prerequisite may be verified through
   its concrete contract, migration, or compatibility result.
4. **Uncertainty and risk** — classify the approach, change area, and validation
   as settled, local lookup, or unresolved decision. Flag unresolved design,
   authorization, security, data-integrity, persistence, migration,
   concurrency, or compatibility boundaries rather than guessing.
5. **Breadth** — check whether one fresh implementation context can complete
   the unit. Judge conceptual outcomes and mutable resources, not line or file
   counts.
6. **Relations** — a blocker is valid only when this candidate directly
   consumes a named concrete output. Shared files or mutable state without
   output consumption are collisions, not blockers.

## Shape

Return `Shape: vertical` for a narrow end-to-end behavior slice. Return
`Shape: prerequisite` only for a concrete contract or migration result that a
later ticket must consume. A framework shell, empty abstraction, shared model
without an independently verified result, or layer created only for
organizational convenience is not a prerequisite.

Ticket shape does not encode rollout. Record migration strategy separately as
`normal`, `prefactor`, or `expand-contract`; do not infer one from the other.

## Judgment

- `fit` — the candidate satisfies the complete local contract.
- `split` — the candidate mixes outcomes, seams, or separately landing
  prerequisites; name each replacement candidate.
- `combine` — the candidate is below its natural seam and needs named sibling
  fragments to become independently useful.
- `flag` — a named human decision or specialist risk judgment is required.

Return:

```text
Assessment: fit | split | combine | flag
Shape: vertical | prerequisite
Candidate:
Outcome:
In scope:
Out of scope:
Acceptance:
Validation:
Uncertainty:
Risk:
Migration strategy:
Blocked by:
Collisions:
Reason:
Next:
```

For `fit`, every field is concrete. For `split`, name replacement candidates;
for `combine`, name the fragments to join; for `flag`, name the exact decision
or risk owner. The caller owns reassessment and set-level reconciliation.

## Boundaries

Ticket Scope does not decompose the full requirement set, build a coverage
ledger, assign stable identities across candidates, calculate graph
minimality or a DAG frontier, publish tickets, or authorize later work. Those
are set-level or public-outcome responsibilities.
