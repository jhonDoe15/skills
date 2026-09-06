---
name: carve
description: Use only when explicitly invoked by canonical name to turn authoritative requirements into a ready ticket DAG or needs-decision plan, with optional authorized publication of ready plans.
disable-model-invocation: true
---

# Carve

Carve owns the public planning outcome. It accepts an authoritative requirement
source, obtains a complete plan from Slice Plan, presents its result, and
publishes only a validated ready plan when tracker-write authorization is
explicit.

## Accepted context

Require an authoritative requirement source that identifies behavior,
boundaries, exclusions, migration constraints, risk decisions, and any
remaining uncertainty. Existing tickets and a previous generated plan may be
input evidence, but Carve does not require another public ticket-generation
workflow.

If the input is a raw idea without authoritative requirements, stop before
planning or tracker writes. If requirements, Ticket Scope flags, migration
constraints, or planning pressure leave a human choice, preserve that
uncertainty for Slice Plan's `needs-decision` result rather than inventing a
decision or returning a publishable partial plan.

## Required dependency

Load `slice-plan` by its canonical name before planning. If it is unavailable,
stop with `Missing internal dependency "slice-plan"` before Skill execution.
Do not copy decomposition guidance, call Ticket Scope directly, or substitute
a fallback.

## Build the ready plan

1. Pass the requirement source, the decided `normal`, `prefactor`, or
   `expand-contract` strategy when available, and the previous plan when
   regenerating to Slice Plan.
2. Receive one complete `slice-plan/v2` plan whose status is `ready` or
   `needs-decision`.
3. Run Slice Plan's deterministic validator against the generated plan.
   For regeneration, validate against the immutable previous plan too.
4. If status is `needs-decision`, return the plan reference and every stated
   choice with zero tracker writes. Do not continue ready-plan checks or
   publication even when publication was conditionally authorized.
5. For a ready plan, check the coverage ledger with the source: every
   requirement is covered or deliberately excluded, and every exclusion
   preserves the source decision.
6. Inspect the ticket set semantically. Each ticket must fit one fresh
   implementation context and deliver an observable vertical outcome or a
   concrete prerequisite. Reject convenience foundations and skeletal
   layer-only work even when the graph validates.
7. Confirm every blocker names direct consumption of concrete output,
   collisions remain non-blocking metadata, the graph is acyclic and
   transitively minimal, and the initial DAG frontier matches the direct
   edges.

Do not mark the plan ready when any check fails. Keep generated plans outside
the repository and return the failure without tracker writes.

## Publication gate

Treat planning and publication as separate authorities. Only `status: ready`
reaches this gate; `needs-decision` always refuses publication.

- Without explicit publication authorization, return the ready plan reference,
  coverage summary, ticket list, direct blockers, collisions, and initial
  frontier. Perform no tracker mutation.
- With explicit authorization for the named tracker and requirement source,
  preflight tracker access and native blocker support, then create every
  planned ticket from the validated plan. Preserve ticket IDs in the body or
  tracker metadata so regeneration lineage remains visible.
- After all tickets exist, create only the plan's direct native blocker edges.
  Record collisions separately using the tracker's non-blocking relation or
  metadata mechanism.
- Read back every ticket and relation. Return the published references and
  derive the published initial frontier from the observed direct blockers.

If a write or read-back fails, stop further writes where safe and report the
exact created tickets, relations, and remaining operations. Do not claim
partial success as a published plan and do not invent compensating deletes
without separate authorization.

## Authority boundary

Publication authorizes only creation of the validated tickets, their direct
blockers, and recorded collision metadata in the named tracker. It does not
authorize dispatch, implementation, branches, pull requests, issue closure, or
any later workflow. Never invoke Dispatch Work as part of Carve.

## Completion

Complete with one of:

- **Ready, not published** — validated plan reference and zero tracker writes.
- **Published** — validated plan reference, every ticket reference, direct
  blocker references, collision records, and observed initial DAG frontier.
- **Needs decision** — validated plan reference, every unresolved choice and
  owner, and zero tracker writes.
- **Stopped** — the validation failure, missing dependency, invalid requirement
  source, or exact partial-write state; never a ready or published claim.
