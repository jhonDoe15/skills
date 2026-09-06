---
name: take-it-offline
description: Use when carrying current work into a fresh agent context through a continuation handoff. Excludes human summaries, archival specifications, general agent-facing artifacts, and Agent Skill authoring.
disable-model-invocation: false
---

# Take It Offline

Produce one temporary continuation document whose primary reader is a fresh
agent. Direct invocation of `take-it-offline` selects this outcome. Keep
`to-humans` inactive for the document.

## Required dependency

Invoke `agent-writing` by its canonical Skill name before drafting. If it is
unavailable, stop with `Missing internal dependency "agent-writing"` and
produce no continuation document. Dependency behavior has one owner: do not
substitute local writing guidance.

## Build the continuation

1. Establish the objective, in-scope work, and explicit out-of-scope boundary
   from the current task.
2. Inventory task-relevant state. Classify each item as verified, unresolved,
   or unverified; do not turn inference into current state.
3. Locate durable artifacts that carry relevant state. Open or otherwise check
   each reference before including it. Record what each verified artifact
   contributes instead of copying its contents.
4. Inline critical state only when no durable artifact contains it. Label why
   it is inline and keep verified state separate from unresolved or unverified
   claims.
5. Exclude credentials, secrets, and irrelevant sensitive information while
   preserving state required to continue the task.
6. Write one Markdown document in host-provided temporary storage, outside the
   durable project and repository.

Use these sections:

- **Objective and scope** — objective, in scope, and out of scope.
- **Current state — verified** — only state checked in this run.
- **Settled decisions** — decisions already made and their authority.
- **Unresolved decisions** — choices the fresh agent must not invent.
- **Blockers** — blocked work and the condition that clears each blocker.
- **Verified artifact references** — accessible references and the state each
  carries. Use `None verified` when context provides no durable artifact.
- **Critical inline state** — only state with no durable home, or `None`.
- **Unverified claims** — relevant claims not established in this run.
- **Verification limits** — unavailable evidence, stale checks, and host limits.
- **Resume condition** — one line beginning `Resume when:` with an observable
  condition, followed by one line beginning `Next action:` with the first
  in-scope action.

When essential context is missing, preserve the same structure: mark unknowns
as unverified, name the missing input as a blocker, and make obtaining that
input the resume condition and next action. Never manufacture a plausible
history to make the document look complete.

## Completion

Return the temporary document reference. Complete only when the document can
be opened, every listed artifact reference was verified before inclusion, and
a fresh agent can identify the objective, scope, current state, blockers,
resume condition, and next action without the prior transcript.
