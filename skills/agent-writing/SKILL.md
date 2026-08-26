---
name: agent-writing
description: Agent-facing artifact outcome for deliverables whose primary reader is an agent; includes instructions, prompts, rules, and operating documents; excludes Agent Skill packages, fresh-context handoffs, and human-facing expression.
---

# Agent Writing

## Interface

Create or revise an artifact whose primary reader will execute, retrieve, or
reason from it as an agent.

Accepted context:

- the artifact's purpose and intended agent consumer;
- required behavior, authority, and exclusions;
- observable inputs, environment, branches, and outputs;
- exact domain terminology and execution semantics;
- requested format, location, and validation evidence.

The outcome is an executable agent-facing artifact plus a compact verification
result. This Skill owns activation, branching, execution order, disclosure,
completion, and agent-specific context management. `writing-foundation` owns
the audience-independent writing contract.

## Routing

Select `agent-writing` when the deliverable's primary reader is an agent: for
example, agent instructions, prompts, rules, operating playbooks, or
agent-consumed reference.

Select the specialized public outcome instead for:

- an Agent Skill package: `skill-writing`;
- a continuation artifact for a fresh context: `take-it-offline`;
- human-facing expression: `to-humans`.

Use one public writing outcome per deliverable. Separate deliverables may use
different outcomes. Direct invocation of `agent-writing` wins for its
deliverable. If the primary reader remains ambiguous, identify the unresolved
reader instead of silently applying competing outcomes.

## Compose with Writing Foundation

Invoke `writing-foundation` by that canonical Skill name before authoring.
Pass it the requirements, exclusions, evidence, uncertainty, terminology
authority, work-product boundaries, and artifact constraints.

If the dependency is unavailable, stop before authoring and return:
`Missing internal dependency "writing-foundation"`. The missing-dependency
branch has no substitute or locally copied Foundation behavior.

## Author the behavior contract

Define the contract before writing instructions:

1. **Activation:** the observable condition that makes the agent act.
2. **Outcome:** the result or state the behavior must produce.
3. **Branches:** each observable predicate, its path, and the material required
   only on that path.
4. **Execution:** ordered actions and the authority or input each consumes.
5. **Completion:** the checkable condition that distinguishes done from
   incomplete for every terminal branch.

Attach each instruction to one contract item. Use positive output contracts
for required shape, conditionals for branches, required slots for omissions,
and deterministic tooling for fragile mechanical work. Reserve prohibitions
for observed discipline failures and pair them with the required alternative.

Keep each concept's definition, rules, and caveats under one authority. A
reader reaching the concept must not assemble its meaning from scattered or
competing passages.

## Manage the information hierarchy

Keep ordered actions and their completion criteria on the execution path.
Keep reference material beside the action only when every branch needs it.
Place branch-specific reference behind a direct pointer that names the
observable predicate for loading it. Disclose that material only after the
predicate applies.

Required decisions, safety constraints, and branch predicates stay with the
action they govern. Do not hide material whose absence would change execution
behind an optional or ambiguous pointer.

Treat the environment as authority for cheap facts such as commands, scripts,
configuration, schemas, and directory layout. Point the agent to the lookup.
Cache an environment-derived fact in prose only when repeated lookup is
materially expensive; record the source, freshness condition, and reason the
cache earns its context load.

## Preserve terminology and execution semantics

Use repository and domain terms exactly, including capitalization and
canonical Skill names. Preserve distinctions carried by those terms rather
than replacing them with a familiar synonym.

Keep code, commands, schemas, literals, identifiers, ordering constraints,
authorization checks, failure modes, and stop conditions semantically intact.
Writing changes may clarify their use; they do not weaken, broaden, reorder, or
silently reinterpret execution.

## Prune context load

For every retained instruction, name the activation, outcome, branch,
decision, failure, or completion behavior it changes. Remove:

- duplicate authorities and fallback copies;
- background that cannot affect a decision;
- stale caches of facts cheaply available in the environment;
- branch material from paths that do not apply;
- instructions whose removal produces no measurable behavioral difference.

Treat an unmeasured instruction as a hypothesis, not automatically as a
no-op. Use the smallest host-neutral scenario that can compare behavior before
and after removal; preserve required coverage while the evidence is
unresolved.

## Failure behavior

When activation, authority, branch predicates, terminology, or completion
criteria are missing, list the unresolved contract items and the smallest
decision or evidence needed. Do not invent a branch or claim the artifact is
executable.

When authorities conflict, co-locate the conflict, preserve each source's
semantics, and stop the affected branch at the decision point. Leave
environment-derived facts in the environment when their current value cannot
be verified.

## Completion

Complete only when:

- activation and intended outcome are observable;
- every branch has a predicate, required material, and terminal condition;
- ordered actions are distinct from reference material;
- branch-specific material is reachable only on its branch;
- each concept has one co-located authority;
- instruction form matches the behavior it controls;
- exact terminology and execution semantics are preserved;
- the invoked `writing-foundation` reports its completion condition satisfied;
- every retained instruction has a measurable purpose or an explicitly
  unresolved evaluation hypothesis.
