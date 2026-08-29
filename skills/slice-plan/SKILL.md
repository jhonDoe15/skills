---
name: slice-plan
description: Private set-level decomposition consumed by Carve; not a user-facing planning outcome.
---

# Slice Plan

## Interface

Accept authoritative source requirements, a migration strategy when decided,
and the previous plan when regenerating. Return one complete `slice-plan/v2`
plan with status `ready` or `needs-decision`. Own candidate decomposition,
requirement coverage, stable identity and replacement lineage, direct
dependencies, collision metadata, migration representation, and the initial
DAG frontier. Do not publish tickets or authorize later workflows.

If any requirement, Ticket Scope flag, migration decision, risk boundary, or
planning pressure requires a human choice, return `needs-decision`. State each
choice, its source requirements, and its owner. Such a plan contains no tickets,
frontier, lineage, or invented migration strategy and cannot be published.

## Required dependencies

Load `ticket-scope` and `take-it-offline` by their canonical names before
planning. If either is unavailable, stop before decomposition with
`Missing internal dependency "ticket-scope"` or
`Missing internal dependency "take-it-offline"` as applicable. Do not copy
their guidance or approximate their behavior.

Use Ticket Scope for one candidate at a time. Slice Plan owns the set-level
loop that reconciles those judgments. Use Take It Offline when decomposition
must cross a fresh context boundary; the continuation is temporary state, not
a replacement for the final plan.

## Decompose the set

1. Give every source requirement a stable ID and preserve its source meaning.
2. Propose the smallest set of candidates that covers the requirements. Prefer
   independently verifiable vertical slices. Introduce a prerequisite only
   when another ticket must consume its concrete output.
3. Ask Ticket Scope for one `fit`, `split`, `combine`, or `flag` judgment per
   candidate. Reconcile all splits and combinations at set level, then
   reassess the resulting candidates. Stop on every flag.
4. Preserve a candidate ID when its outcome and seam remain the same. Changed
   work never reuses an ID. Record one plan-level lineage entry for every
   replacement: one predecessor to multiple successors for a split, multiple
   predecessors to one successor for a combination, or one-to-one replacement.
   Preserve existing lineage so every removed candidate still reaches a current
   successor, and add every removed prior candidate to exactly one new entry.
5. Reject framework shells, convenience foundations, skeletal layer-only
   tickets, and prerequisites without an independently verifiable concrete
   result. Each ticket must fit one fresh implementation context.

## Cover every requirement

Build a coverage ledger with exactly one entry per source requirement:

- `covered` names every ticket that delivers or enables the requirement and
  explains the mapping.
- `excluded` names no ticket and records the deliberate source-backed reason.

There is no ready plan while a requirement is missing, duplicated, silently
dropped, or attached to no concrete ticket. Every ticket must trace back to at
least one covered requirement.

## Wire the DAG

A blocker means the blocked ticket directly consumes a concrete output from
the blocking ticket. Record the same direct ticket in `blockers` and in
`consumes`, with the consumed output named. Do not add a blocker for chronology,
shared files, team preference, or a transitive ancestor.

Reject missing targets, self-edges, cycles, and transitively redundant
blockers. Record shared files or mutable state without output consumption in
`collisions`; collisions never change the DAG. Derive `initial_frontier`
exactly as the tickets with no blockers.

## Keep shape and migration distinct

Each ticket has `shape: vertical` or `shape: prerequisite`. Record rollout
separately as `migration_strategy: normal | prefactor | expand-contract`; do not
encode migration strategy in ticket shape, lineage, collisions, or blocker
metadata.

- **Normal** has no migration phases.
- **Prefactor** names only genuine shared prerequisite tickets. Each prefactor
  has an independently verifiable concrete output consumed directly by
  multiple later tickets. Reject a convenience foundation.
- **Expand-contract** names one expansion prerequisite, one or more
  independently mergeable migration groups, and one contraction ticket. Every
  migration-group ticket directly consumes expansion output. Contraction
  depends directly on every migration-group ticket that must finish first, not
  transitively on expansion. Record the required integration point for a group
  that cannot keep the system green independently.

## Produce and validate the plan

Write the plan as JSON conforming to `schemas/plan.schema.json`. Keep generated
plans outside the repository. Before returning it, run:

```bash
node skills/slice-plan/scripts/validate-plan.js <plan.json>
```

For regeneration, also supply the immutable previous plan:

```bash
node skills/slice-plan/scripts/validate-plan.js <plan.json> <previous-plan.json>
```

The validator proves schema, coverage-ledger completeness, replacement-lineage
structure, identity stability against a supplied prior plan, prerequisite
consumption, migration ordering, blocker/output agreement, missing-target
rejection, acyclicity, transitive minimality, and frontier correctness.
Semantic independence and natural seams still require evidence-bearing
judgment; a valid graph alone does not prove them.

Return the validated plan reference and its status, requirement, ticket,
blocker, collision, decision, and frontier counts. The output remains a plan
only: it grants no tracker-write, dispatch, branch, PR, or implementation
authority.
