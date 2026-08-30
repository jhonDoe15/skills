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
  dependency edges plus any collision metadata;
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

## Fingerprint and resume

Before starting work, retain SHA-256 source-DAG and execution fingerprints.
Canonicalize object keys before hashing so offline replay is deterministic. The
source fingerprint covers the published identity, ticket state, direct
dependency edges, and collision metadata. The execution fingerprint covers
immutable bases, repository and tracker boundaries, resolved canonical
dependencies, and executor configuration inputs. Retain direct pointers to the
current inputs, the current digest, and, for resume, the retained input snapshot
and digest so offline replay can recompute both sides of the decision.

Start fresh when no retained state was supplied. Resume only when retained
evidence is complete and both retained fingerprints match the current inputs.
Reject stale, partial, corrupt, or mismatched evidence before starting a ticket,
and retain the mismatch and required recovery.

For a compatible resume:

- skip only a ticket whose retained result reference resolves to a complete
  authoritative reviewed-ticket result bound to that exact ticket; when the
  canonical Take Ticket result lacks ticket identity, require a Dispatch
  Work-owned binding that retains the ticket-specific invocation, completion,
  and canonical result reference;
- restart incomplete lifecycle work unless a retained retry point and owned
  worktree explicitly support continuation;
- preserve failed, retryable, and human-decision states; and
- recalculate the current frontier from verified retained transitions.

An interrupted `active` state is partial work, not completion. Never infer a
completed phase from a commit, Review brief, or implementation handoff.

## Select executor capacity

Resolve the first valid positive executor limit in this order:

1. repository configuration;
2. project configuration;
3. user configuration;
4. bundled default.

Retain every consulted source and value, plus the selected source. Executor
capacity is owned by Dispatch Work. It does not change planning semantics,
ticket eligibility, dependency edges, or the published DAG.

## Establish dispatch state

Retain the source DAG identity, explicit authorization source, and initial
state of every ticket and direct dependency, including dependency edges
already satisfied before this run. A ticket is:

- `blocked` while any direct dependency remains open;
- `eligible` when it is open, inactive, and every direct dependency is
  satisfied;
- `active` only after its Take Ticket lifecycle starts;
- `completed` only after Take Ticket returns a complete authoritative
  reviewed-ticket result;
- `retryable` when retained evidence names a bounded automatic recovery;
- `human-decision` when progress requires user-owned authority or a decision;
  or
- `failed` when its lifecycle terminates unsuccessfully.

Ordinary success, an implementation handoff alone, a passing check, a commit,
or a Review brief alone is not completion. Never bypass Implement, full Code
Review, correction when required, or targeted re-review; those stages remain
owned by Take Ticket.

An initially failed ticket retains its actionable recovery and ordering
sequence. An initially completed dependency has every outgoing retained edge
marked pre-satisfied; no other edge may be pre-satisfied. In-run completions
produce exactly the outgoing open-to-satisfied transitions they authorize.

## Schedule collisions

Keep collision constraints separate from the source DAG. A collision delays a
start but never creates or satisfies a dependency edge. At each calculation:

1. compute every DAG-eligible ticket without considering collisions or capacity;
2. keep active tickets in their owned slots;
3. select up to the remaining executor capacity, excluding only tickets that
   conflict with an active or already selected ticket; and
4. retain each deferred ticket, its exact conflicting tickets or capacity
   reason, and the source collision record.

Collision is pairwise unless the published metadata names a larger conflict
set. A chain `A-B-C` does not imply an `A-C` collision. Unrelated eligible
tickets still start together.

## Own isolated worktrees

Before a ticket becomes active, allocate one isolated worktree at its immutable
base. Retain the ticket, owner, canonical path, base, creation result, and
lifecycle state. Reject reused ownership, a dirty or mismatched base, and any
path already owned by another ticket.

Give Take Ticket only that worktree. A ticket cannot read or write another
ticket's worktree. Record a passing isolation check and its evidence before the
lifecycle starts; creation and lifecycle start must have distinct ordered
events. On complete reviewed work, record cleanup and remove the worktree when
repository policy permits. On creation, lifecycle, or cleanup failure, retain
the worktree or failed allocation record plus diagnostic artifacts and the next
recovery action. Cleanup must preserve the evidence needed to explain partial
work.

## Run the moving frontier

1. Calculate the current DAG frontier from retained ticket and direct
   dependency state.
2. Apply executor capacity and collision constraints. Give the calculation a
   retained identity with eligible, selected, deferred, and active tickets.
3. Create and record one owned worktree for each selected ticket, then start one
   canonical Take Ticket lifecycle in that worktree. Every start references
   exactly that one prior calculation and selection.
4. Observe each lifecycle independently. Process a completion as soon as it
   arrives, without waiting for unrelated active tickets.
5. Verify that the returned reviewed-ticket result is complete and
   authoritative. Retain its implementation handoff and Review brief.
6. Mark only that ticket complete, satisfy only dependency edges that consume
   that ticket, and record the completion and dependency transitions.
7. Recalculate the frontier immediately. Start every newly unblocked eligible
   ticket without waiting for unrelated active tickets.
8. Continue until every ticket reaches a terminal state or no ticket can
   advance.

Do not use frontier-wide joins, fixed waves, fixed batches, or completion
barriers. Concurrency is limited only by explicit invocation limits and
published collision or shared-state constraints. Such a constraint can delay a
ticket's start, but it does not turn the DAG into stages.

When a lifecycle fails or returns an incomplete or non-authoritative result,
classify it as retryable, failed, or human-decision from retained evidence. Do
not satisfy its outgoing dependencies. Continue independent work when its
worktree, collision set, and remaining graph make that safe. Retain the first
recovery or human decision when no ticket can advance.

## Gate PR maintenance

Dispatch authorization does not authorize PR mutation. When a ticket needs PR
maintenance, require a separate explicit authorization whose scope and source
cover the requested actions.

Without that authorization, record the needed action and return it with zero
attempted PR mutations. With authorization, invoke external `autopilot` only
for an exact authorized repository/action/target tuple; independently
authorized values do not combine into additional tuples. Retain each attempt
and completion with that tuple, outcome, and evidence reference. A missing or
failed prerequisite leaves the ticket retryable or human-decision; it never
grants mutation authority. Tests observe this branch only through bounded test
Adapters and sandboxed fixtures.

## Synthesize completed frontiers

Synthesis is aggregate-only. Bind each synthesis to one unique frontier
calculation. Consume exactly the completed subset of that calculation's
selected tickets after their retained completion events, even when another
selected member is retryable, failed, or awaiting a human decision. Use only
those completed tickets' compact implementation handoffs and Review briefs.
Retain the synthesis sequence after those events.
Detect concerns that emerge only across those inputs. Each concern retains its
identity, cited implementation handoffs and Review briefs, status, and one
disposition. Preserve unresolved concerns across later frontier calculations.
Every cross-ticket concern cites retained synthesis evidence associated with at
least two distinct ticket identities. A later synthesis may cite its own inputs
and earlier ordered synthesis inputs, but never unsynthesized or future
evidence.
Recommend one or more of:

- acceptance;
- fixes;
- a ticket split; or
- a human decision.

Frontier synthesis does not repeat per-ticket Code Review, alter a reviewed
finding, or invent missing ticket authority. It may complete after later work
has already started; synthesis never becomes a barrier to a newly runnable
ticket unless its output identifies an explicit human decision.

Use canonical Take It Offline only when a context boundary requires a compact
continuation of current dispatch state. The continuation references retained
dispatch artifacts and does not replace them.

## Retain an inspectable dispatch artifact

Retain enough structured state for deterministic inspection and offline replay:

- source DAG identity and published-ready state;
- fresh or resume decision, fingerprint inputs and digests, compatibility
  checks, skipped work, and rejected evidence;
- explicit authorization and its source;
- executor candidates, precedence, selected capacity, and source;
- collision records and every eligible, selected, deferred, and active ticket;
- worktree ownership, base, path, creation, lifecycle, cleanup, and diagnostic
  state;
- every ticket lifecycle state, its selecting frontier calculation, and its
  canonical Take Ticket invocation;
- PR maintenance authorization, needed actions, and attempted and completed
  mutations;
- completion events and complete authoritative reviewed-ticket identities;
- dependency transitions tied to the completion that authorized each one;
- synthesis inputs, including implementation handoffs and Review briefs;
- aggregate concern evidence, dispositions, unresolved systematic concerns,
  and acceptance, fix, split, or human-decision recommendations;
- initial and pre-satisfied ticket and edge state; and
- final open, active, completed, retryable, human-decision, blocked, and failed
  ticket state plus the first recovery action when dispatch is incomplete.

Keep event ordering explicit. Preserve artifact references rather than copying
their full contents. Do not include credentials, secrets, unrelated sensitive
data, or unbounded model transcripts.

## Boundaries

Dispatch Work owns frontier calculation, Take Ticket invocation, event-driven
advancement, executor selection, collision scheduling, worktree lifecycle, the
PR-maintenance authorization gate, aggregate synthesis, and retained dispatch
state. It does not own:

- plan creation, planning semantics, or DAG publication;
- per-ticket implementation, Code Review, correction, or re-review;
- issue dependency, assignment, or closure changes;
- branch, pull-request, CI, merge, or release topology outside an explicitly
  authorized maintenance action;
- migration or persistence decisions; or
- a new shared Interface.

Deterministic evaluation Adapters run only through the canonical test Adapter
and test execution boundaries. They return normalized artifact references,
observed successful Skill loads, and observed tool and attempted-mutation
evidence. Every selected ticket has exactly one fixture-local Take Ticket
invocation/completion artifact proving ticket identity and the complete
implementation, full-review, required correction, and targeted re-review
phases with their ranges and artifacts. Owner-local grading executes the
declared artifact checks against those bodies and observations; matching
response prose is not evidence. These fixtures do not define a shared Take
Ticket schema or a production fallback.

Stop for a shared-interface, security-sensitive, migration, persistence,
release, or cross-ticket ownership decision. Do not start an unrelated ticket
or mutate tracker or PR topology as a side effect of dispatch.

## Completion

Claim a completed dispatch only when every published ticket has a complete
authoritative reviewed-ticket result, every in-run direct dependency transition
is backed by such a completion, all completed frontiers have compact synthesis,
and the retained artifact exposes the final dispatch state. A partial replay is
still valid when it faithfully retains pre-satisfied edges and completed, open,
retryable, human-decision, blocked, or failed ticket states. Its final status
must match those categories, and its first recovery action must be the earliest
retained actionable recovery by sequence. Return that state without claiming
dispatch completion.
