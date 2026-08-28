---
name: maintaining-agent-guidance
description: Use when finishing or merging a substantial project change that may require durable updates to agent guidance.
disable-model-invocation: false
user-invocable: false
---

# Maintaining Agent Guidance

Catch durable agent-facing knowledge at the final change boundary without turning every commit or
pull request into a documentation pass.

## Enter once

Enter when a substantial feature or project change has a stable outcome and is finishing or
approaching merge. Require the effective implementation diff and validation evidence.

Treat the completed change, not its Git operation, as the boundary. Mid-feature work, ordinary
commits, PR creation, and routine changes do not qualify. Guidance edits from this run belong to the
same change and do not retrigger the gate.

## Test significance

Guidance needs inspection only when both are true:

1. Without the candidate knowledge, a future agent could make a materially worse project decision.
2. The knowledge is not cheaply and reliably derivable from current source or configuration.

Likely candidates include:

- a new or changed service scope, owner, or architectural boundary;
- a non-obvious build, test, deployment, or environment procedure;
- a compatibility, security, operational, or data-integrity invariant;
- a recurring failure mode with an observable completion check;
- a new instruction load path or conditional reference branch.

Usually reject implementation summaries, changed-file lists, code-visible APIs, one-off debugging
details, ticket status, release notes, and routine fixes or refactors. A fact already canonical in
an ADR or maintainer document still passes when loaded guidance lacks the triggered route agents
need to find it.

When the test fails, return exactly:

```text
Guidance: no change
Reason: <one sentence>
```

Continue the finishing flow without loading or invoking `agents-file-writer`.

## Build the change-context packet

When the test passes, collect a compact packet from the stable change:

- feature or change outcome and why it matters;
- originating requirements, issue, spec, or handoff references;
- stable implementation diff or immutable commit range, plus available implementation and review
  handoffs;
- validation evidence and affected service or project scope;
- candidate durable knowledge, supporting evidence, and representative future task triggers;
- unchanged and out-of-scope areas;
- current Git and worktree state, including authorization limits.

Reference durable artifacts and exact diff ranges instead of pasting broad repository context. The
packet is complete when a worker can verify the candidate without reconstructing this session.

## Dispatch one isolated worker

Dispatch exactly one isolated subagent. It may share the checkout, but not the main conversation
context. Never run another writer concurrently in the same checkout.

Give the worker the complete packet and this mandate:

1. Verify the candidate against repository authority; dispatch alone does not prove guidance must
   change.
2. If no durable gap exists, return the two-line no-change result and make no edits.
3. If a durable gap exists, invoke the required sub-skill `agents-file-writer` in **Improve** mode
   and follow its complete workflow. That skill owns file discovery, hierarchy, in-place edits,
   reference pointers, verification, and the artifact map.
4. Preserve the index and unrelated worktree changes. Leave staging, committing, pushing,
   publishing, PR mutation, and merging to the finishing flow unless separately authorized.
5. Return only the checkpoint below. Stop rather than guess at a collision or destructive-operation
   authorization boundary.

The worker must improve durable guidance, not copy the feature summary into an agent file.

If isolated subagents are unavailable, run only the significance test inline first. Load
`agents-file-writer` inline only after it passes, then follow that skill in Improve mode.

## Resume the finishing flow

Accept one of two checkpoints.

For no change, use the exact result under **Test significance**.

Changed or blocked:

```text
Guidance: changed | blocked
Changed paths:
Guidance graph:
Keep/Move/Delete:
Validation:
Untested gaps:
Authorization blockers:
```

Verify the checkpoint against the checkout. When guidance changed, include those paths in the
effective diff and rerun affected verification and review. Then resume the original finish or merge
flow. This skill does not stage, commit, push, publish, mutate a PR, or merge.
