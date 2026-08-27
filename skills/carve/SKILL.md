---
name: carve
description: Use only when explicitly invoked by canonical name to turn settled requirements into a complete ready ticket DAG, with optional authorized publication.
disable-model-invocation: true
---

# Carve

Carve owns the public planning outcome. It accepts settled requirements,
obtains a complete plan from Slice Plan, presents the ready plan, and publishes
it only when tracker-write authorization is explicit.

## Accepted context

Require an authoritative requirement source with decided behavior,
boundaries, exclusions, migration strategy, and risk decisions. Existing
tickets may be input evidence, but Carve does not require another public
ticket-generation workflow.

If the input is a raw idea, contains unresolved decisions, or lacks an owner
for a material risk boundary, stop before planning or tracker writes. Name the
missing decision and return no publishable partial plan.

## Required dependency

Load `slice-plan` by its canonical name before planning. If it is unavailable,
stop with `Missing internal dependency "slice-plan"` before Skill execution.
Do not copy decomposition guidance, call Ticket Scope directly, or substitute
a fallback.

## Build the ready plan

1. Pass the settled requirement source to Slice Plan with
   `migration_strategy: normal`.
2. Receive one complete `slice-plan/v1` plan whose status is `ready`.
3. Run Slice Plan's deterministic validator against the generated plan.
4. Check the coverage ledger with the source: every requirement is covered or
   deliberately excluded, and every exclusion preserves the source decision.
5. Inspect the ticket set semantically. Each ticket must fit one fresh
   implementation context and deliver an observable vertical outcome or a
   concrete prerequisite. Reject convenience foundations and skeletal
   layer-only work even when the graph validates.
6. Confirm every blocker names direct consumption of concrete output,
   collisions remain non-blocking metadata, the graph is acyclic and
   transitively minimal, and the initial DAG frontier matches the direct
   edges.

Do not mark the plan ready when any check fails. Keep generated plans outside
the repository and return the failure without tracker writes.

## Publication gate

Treat planning and publication as separate authorities.

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
- **Stopped** — the unresolved decision, validation failure, missing
  dependency, or exact partial-write state; never a ready or published claim.
