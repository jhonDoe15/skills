---
name: admino
description: >-
  Route a task's next phase to the cheapest model that can carry the uncertainty
  left in it. Use when delegating implementation to a subagent, when deciding
  which model should take the next phase, when a subagent reports it is out of
  its depth or that the remaining work has gone mechanical, or when another
  skill needs the tier-ladder vocabulary.
---

# Admino

Administering agents. One task, one owner, a ladder of models. The main agent
owns the request, the architecture, the task state and the final result; it
delegates *bounded phases* and takes back a compact checkpoint each time.

Not an orchestration product, and not parallel agents. It answers one question,
repeatedly: **which model should do the next phase of this same task?**

The working rules are injected on every prompt by the `lean` plugin's hook, so
they apply whether or not this file is loaded. This file is the reasoning behind
them — read it when a rule needs interpreting, or when a case is genuinely hard.

## The one rule

Route on the uncertainty that remains **right now**, not on how big the task
looked when it started. A large task whose approach is settled belongs on the
cheap tier. A one-line change whose correct behaviour is still open does not.

Size is not the signal. Residual uncertainty is.

## The three signals

**`settled`** — the approach is chosen, the affected files are known, and you can
state the validation before the work starts. Remaining decisions are mechanical.
Not settled if the brief would contain "figure out where X lives".

**`local`** — the outcome is known but the repo has not told you how yet. Which of
two patterns is house style, what else calls this function, whether the change
spans one module or four. Answerable by reading code rather than by deciding
anything. The test: *would the cheap tier have to guess?*

**`design`** — the correct behaviour is genuinely open. Requirements conflict, the
implementation exposed an invariant the plan did not cover, two readings of the
request produce different code. The test: *is the question "how do I finish this"
or "what is correct here"?* The second is always design.

**Risk** overrides all three. Concurrency, security or authorisation,
persistence and migrations, backwards compatibility, data integrity — these stay
on the top tier however mechanical the edit looks. It is a property of the area,
not of your confidence.

**Breadth is its own signal.** Cheaper models lose items on wide enumerations
regardless of how settled the approach is — measured on a 24-item list, the cheap
tier held 17. If the deliverable is a long list that must be complete, route up
even when nothing is uncertain.

## Which models

Set in `lean.config.json` — see the `lean` skill for where that file lives and
how to change it. Two or three tiers both work; on a two-tier ladder `local` work
rides the top rung, because there is nothing in between to hand it to.

The top tier also keeps routing itself, and any final review that risk actually
justifies. Do not add a review pass by default.

The top tier's own reasoning effort: low when the turn is pure dispatch and
relay, medium when it is planning, judging or reviewing. Above medium is not
worth the cost per task.

## Moving up and down

**Up.** A cheap tier stops and returns control when it meets an unresolved design
choice, an unexpected component boundary, or repo behaviour that contradicts its
instructions. A middle tier returns architectural questions rather than inventing
a design.

Escalating on a design question or a risk flag is **never** blocked — not by the
hold rule below, not by how little work is left. Getting it wrong costs more than
getting it cheap saves.

**Down.** When the remaining work has gone mechanical, stop at a coherent
checkpoint and hand the remainder down — but only if enough work is left to repay
the handoff. Under a couple of steps, let the current tier finish.

**Hold.** Once a scope has moved up, it does not move back down. That call is
already made, and bouncing back re-pays the handoff for a decision you have
already taken. A genuinely new scope — the design question got resolved, or the
objective moved — may decide afresh. Renaming the same work to escape the rule is
the failure this is guarding against.

## Checkpoints

Reassess only at a seam: exploration finished, the approach became clear, a
coherent patch landed, or validation changed the diagnosis. Never reroute
mid-edit — a half-applied change is worse than a slightly over-priced one.

## The handoff

Every switch carries one, and it is the only thing that survives. Same seven
fields in both directions:

- **Objective** — the original request, verbatim enough that the next agent
  cannot drift. Not the phase; the whole point. An agent given only its phase
  will optimise the phase and break the task.
- **Constraints** — house style, invariants, what must not change, validation
  that must keep passing.
- **Completed so far** — reference files and the diff. The workspace is shared;
  do not paste code blocks or command logs.
- **Decisions and assumptions** — with reasons. This is what stops the next tier
  re-litigating settled ground.
- **Files inspected or changed** — paths, one clause each.
- **Validation performed** — exact commands, exact results. "tests pass" is not a
  result; `pytest tests/test_export.py -q -> 14 passed` is.
- **Remaining work and open risks** — concrete steps, and anything unresolved. If
  a question belongs to the top tier, say so rather than answering it yourself.

Then a recommended next tier — a recommendation, not a decision. The owner
re-reads the situation and may disagree.

State the **boundary** as clearly as the task. An agent that does not know where
its authority ends will either stop too early or redesign something it was not
asked to touch. Say which files are in scope and what to do on hitting something
outside them: stop, report, return.

Put the return contract in the brief explicitly:

> When you finish, stop and reply with the handoff. Do not start work beyond
> Remaining work. If you hit an unresolved design choice, an unexpected component
> boundary, or repo behaviour that contradicts these instructions, stop
> immediately, report what you found, and recommend the top tier.

That last sentence is what makes escalation happen at all. Without it, a cheap
tier out of its depth guesses instead of returning.

## Reading a report before re-routing

In order: does the validation demonstrate what it claims; did it stay inside the
boundary; do its assumptions contradict anything you know but did not tell it; is
the remaining-work estimate credible against the diff. Routing on an unread
report is how a bad assumption gets three tiers deep before anyone notices.

## Avoid

- Delegating work you will review line by line anyway. The review costs what the
  delegation saved.
- Keeping a capable model on a task merely because it started it.
- Switching to save a couple of steps.
- Two writing agents in one tree at once, unless the workstreams genuinely cannot
  collide.
- Restarting the task at a handoff.

## Spawning

`references/transports.md` covers the three shapes: the Codex CLI over a shared
working tree (separate Claude and OpenAI accounts), a unified harness where every
model is natively spawnable, and a Claude-only fallback with no external
dependencies.

Whatever the shape, **pin the model explicitly on every spawn**. A subagent that
inherits the parent model silently defeats the entire ladder — the work looks
routed and costs top-tier prices.
