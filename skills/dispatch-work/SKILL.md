---
name: dispatch-work
description: Use only when explicitly authorized to run a published ready ticket DAG through moving parallel Take Ticket frontiers and aggregate synthesis. Excludes planning, per-ticket implementation or review, tracker and PR topology changes, and release work.
disable-model-invocation: true
---

# Dispatch Work

Run one authorized published ticket DAG through concurrent Take Ticket
lifecycles. Compute and advance the DAG frontier whenever an authoritative
ticket completion arrives; never impose a fixed stage barrier.

## Required authority and inputs

Require all of:

- explicit dispatch authorization whose source can be retained;
- one published ready DAG with a stable source identity, tickets, and direct
  dependency edges;
- repository and tracker boundaries for each ticket; and
- canonical `take-ticket` and `take-it-offline` dependencies.

A plan, ready-plan artifact, issue list, or publication request does not grant
dispatch authority. If authorization is absent or ambiguous, stop before any
ticket lifecycle starts. If the DAG is unpublished, not ready, internally
inconsistent, cyclic, or lacks a stable identity, stop before execution.

Load `take-ticket` and `take-it-offline` by their exact canonical Skill names
before dispatch. If either is absent or unavailable, stop before ticket work
with the applicable exact message:

- `Missing internal dependency "take-ticket"`
- `Missing internal dependency "take-it-offline"`

Never select a test Adapter, copied fallback, direct Implement path, or direct
Code Review path in production.

## Establish dispatch state

Retain the source DAG identity, explicit authorization source, and initial
state of every ticket and direct dependency, including dependency edges
already satisfied before this run. A ticket is:

- `blocked` while any direct dependency remains open;
- `eligible` when it is open, inactive, and every direct dependency is
  satisfied;
- `active` only after its Take Ticket lifecycle starts;
- `completed` only after Take Ticket returns a complete authoritative
  reviewed-ticket result; or
- `held` when its lifecycle returns incomplete authority or reaches a
  user-owned decision; or
- `failed` when its lifecycle terminates unsuccessfully.

Ordinary success, an implementation handoff alone, a passing check, a commit,
or a Review brief alone is not completion. Never bypass Implement, full Code
Review, correction when required, or targeted re-review; those stages remain
owned by Take Ticket.

## Run the moving frontier

1. Calculate the current DAG frontier from retained ticket and direct
   dependency state.
2. Give each calculation a retained identity. Start every independent eligible
   ticket concurrently through one canonical Take Ticket lifecycle per ticket.
   Every start references exactly that one prior calculation and its explicit
   selection.
3. Observe each lifecycle independently. Process a completion as soon as it
   arrives, without waiting for unrelated active tickets.
4. Verify that the returned reviewed-ticket result is complete and
   authoritative. Retain its implementation handoff and Review brief.
5. Mark only that ticket complete, satisfy only dependency edges that consume
   that ticket, and record the completion and dependency transitions.
6. Recalculate the frontier immediately. Start every newly unblocked eligible
   ticket without waiting for unrelated active tickets.
7. Continue until every ticket reaches a terminal state or no ticket can
   advance.

Do not use frontier-wide joins, fixed waves, fixed batches, or completion
barriers. Concurrency is limited only by explicit invocation limits and
published collision or shared-state constraints. Such a constraint can delay a
ticket's eligibility, but it does not turn the DAG into stages.

When a lifecycle fails or returns an incomplete or non-authoritative result,
retain the observed failed or held state. Do not satisfy its outgoing
dependencies. If the remaining graph has no eligible or active ticket, retain
which tickets are open, blocked, held, or failed and name the first recovery or
human decision.

## Synthesize completed frontiers

Synthesis is aggregate-only. Bind each synthesis to one unique frontier
calculation. After every ticket selected by that calculation has a retained
completion event, consume exactly those tickets' compact implementation
handoffs and Review briefs. Retain the synthesis sequence after those events.
Record cross-ticket or systematic concerns and recommend one or more of:

- acceptance;
- fixes;
- a ticket split; or
- a human decision.

Frontier synthesis does not repeat per-ticket Code Review, alter a reviewed
finding, or invent missing ticket authority. It may complete after later work
has already started; synthesis never becomes a barrier to a newly runnable
ticket unless its output identifies an explicit held decision.

Use canonical Take It Offline only when a context boundary requires a compact
continuation of current dispatch state. The continuation references retained
dispatch artifacts and does not replace them.

## Retain an inspectable dispatch artifact

Retain enough structured state for deterministic inspection and offline replay:

- source DAG identity and published-ready state;
- explicit authorization and its source;
- every frontier calculation, including eligible, selected, and active tickets;
- every ticket lifecycle state, its selecting frontier calculation, and its
  canonical Take Ticket invocation;
- completion events and complete authoritative reviewed-ticket identities;
- dependency transitions tied to the completion that authorized each one;
- synthesis inputs, including implementation handoffs and Review briefs;
- aggregate concerns and acceptance, fix, split, or human-decision
  recommendations; and
- initial and pre-satisfied ticket and edge state; and
- final open, active, completed, held, blocked, and failed ticket state plus
  the first recovery action when the dispatch is incomplete.

Keep event ordering explicit. Preserve artifact references rather than copying
their full contents. Do not include credentials, secrets, unrelated sensitive
data, or unbounded model transcripts.

## Boundaries

Dispatch Work owns frontier calculation, Take Ticket invocation, event-driven
advancement, aggregate synthesis, and retained dispatch state. It does not own:

- plan creation, sizing, or DAG publication;
- per-ticket implementation, Code Review, correction, or re-review;
- issue dependency, assignment, or closure changes;
- branch, pull-request, CI, merge, or release topology;
- migration or persistence decisions; or
- a new shared Interface.

Deterministic evaluation Adapters run only through the canonical test Adapter
and test execution boundaries. They return normalized artifact references and
observed Skill, tool, and attempted-mutation evidence. A fixture-local reviewed
ticket artifact may prove the complete implementation, full-review, required
correction, and targeted re-review phases with their ranges and artifacts; it
does not define a shared Take Ticket schema or a production fallback.

Stop for a shared-interface, security-sensitive, migration, persistence,
release, or cross-ticket ownership decision. Do not start an unrelated ticket
or mutate tracker or PR topology as a side effect of dispatch.

## Completion

Claim a completed dispatch only when every published ticket has a complete
authoritative reviewed-ticket result, every in-run direct dependency transition
is backed by such a completion, all completed frontiers have compact synthesis,
and the retained artifact exposes the final dispatch state. A partial replay is
still valid when it faithfully retains pre-satisfied edges and completed, open,
held, blocked, or failed ticket states. Return its first recovery action without
claiming dispatch completion.
