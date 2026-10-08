---
name: model-routing
description: Use before the first search or edit of work that needs more than two steps, and whenever bounded work might be handed to another model through `pi-dispatch`. Chooses the owner (main session, `pi-dispatch` worker, or fresh session) and the model slot. Not for single-step requests or questions answerable directly.
disable-model-invocation: false
---

# Model Routing

Decide who does each unit of work, and on which model, before doing it. Then
dispatch with `pi-dispatch` or keep the work here.

## Route first

Before the first search or edit on work that needs more than two steps, state a
**route**:

1. Name the intended outcome, done boundary, and overreach boundary.
2. Separate judgment from mechanical execution.
3. Assign each unit to the main session, `pi-dispatch`, or a fresh session.

Keeping work in the main session is a route and needs the same decision.
Default to delegation when it reduces context load, enables parallel progress,
or creates a clearer completion boundary. Keep the work here when handoff
overhead would exceed the bounded work.

## Choose the owner

- **Main session:** work that depends on reasoning already held here. It owns
  decisions, orchestration, integration, and review.
- **`pi-dispatch`:** bounded, self-contained work whose handoff the main session
  will consume.
- **Fresh session:** a new phase, a clean-slate second opinion, or an unrelated
  thread. Load `take-it-offline` by its exact canonical name to create the
  handoff, recommend the slot, then wait for the user to open the session.

Each dispatch owns exactly one bounded task. Its brief supplies the necessary
inputs, one outcome, allowed scope, constraints, and checkable completion
criteria. The task may take several steps; each must advance those criteria.
Meeting them ends the worker's authority, and adjacent work returns to the
parent.

## Choose the slot

Choose the family by the shape of the evidence, not by whether the task
contains judgment:

- **OpenAI** for closed-world work: the contract, rubric, source set, or
  expected validation is explicit and coverage can be enumerated. This includes
  implementation, API and contract research, test planning, static checks, and
  exact spec comparison.
- **Anthropic** for open-world work: the worker must infer intent, expose hidden
  invariants, generate causal hypotheses, reconcile ambiguous evidence, or
  reason about interactions across state, time, or ownership boundaries.
- Wide independent items favor OpenAI. A cohesive problem whose parts share
  implicit behavior favors Anthropic. File count alone selects neither family
  nor tier.

| Work | Slot |
|---|---|
| Deterministic transformation or implementation with exact checks, even across several files | `openai-small` |
| Contract or API research, test mapping, or rubric-driven spec, standards, and static review | `openai-mid` |
| Exhaustive closed-world reconciliation where omissions are hard to detect, or proven mid-tier reasoning insufficiency | `openai-top` |
| Factual summary, eligibility gate, or bounded local semantic check | `anthropic-small` |
| Unknown-cause debugging, implicit-invariant review, ambiguous intent, or interacting-module judgment | `anthropic-mid` |
| Unresolved cross-system behavior or adversarial review where a wrong answer is both hard to detect and costly | `anthropic-top` |

Start at `small` and promote only on evidence:

- `small` when a precise brief and deterministic validation can expose a wrong
  result. Large settled edits may stay small.
- `mid` when local judgment remains, validation is partly interpretive, or the
  worker must discover and connect evidence.
- `top` only when mid-tier reasoning has proved insufficient, multiple
  unresolved uncertainties interact across boundaries and failure would be
  silent or expensive, or required completeness is consequential and omissions
  cannot be checked cheaply. A sensitive domain alone does not require `top`;
  sensitivity plus unresolved judgment does.

Calibration: a multi-file refactor with an exact analyzer and tests is
`openai-small`; a pinned SDK contract audit is `openai-mid`; a stale async-state
race is `anthropic-mid`; an unresolved authorization design spanning systems is
`anthropic-top`.

Promote a wide enumeration only when omissions cannot be checked cheaply.
Escalate after failure only when the failure reveals missing judgment or
insufficient reasoning; fix the brief or tooling at the same tier for execution
failures.

## Dispatch

Run `pi-dispatch --list` for the current slots, models, and effort levels; the
command is their only authority. Dispatch from the working directory the worker
should use:

```bash
pi-dispatch --list
pi-dispatch <slot> <slug> "<bounded brief>"
pi-dispatch <slot> <slug> --context <handoff> "<angle-specific brief>"
pi-dispatch --recursive <slot> <slug> [--context <handoff>] "<bounded parent brief>"
```

The command attaches the family and tier prompting profiles itself, from
`~/.cursor/rules/references/pi-dispatch-prompting.md` unless
`PI_DISPATCH_PROMPTING_GUIDE` names another file. When the command exits with
`Prompting guide must be a readable, nonempty file`, set
`PI_DISPATCH_PROMPTING_GUIDE` to the absolute path of
[`references/pi-dispatch-prompting.md`](references/pi-dispatch-prompting.md)
in this skill and rerun. Keep only task-specific judgment in the brief; do not
copy or weaken those profiles. It
also attaches the optional `--context` handoff without copying it into the
command, and prints only the output handoff path. Output metadata records the
context path and hash when supplied.

When several workers share context, load `take-it-offline` by its exact
canonical name once to create the handoff, and reuse its path with a small brief
for each angle. Without shared context, pass the
complete brief directly or through stdin.

Every ordinary dispatch is a depth-one **bounded worker**. Its authority is the
brief; shared context supplies facts rather than scope. Completion ends the
run.

After a dispatch returns, read its handoff, inspect any diff, and verify the
critical path before accepting the work.

## Opt into recursion

Only the main session may pass `--recursive`; the command rejects it from a
dispatched agent. The resulting bounded parent may route settled child units
through `pi-dispatch`:

- It keeps judgment that depends on its current reasoning.
- It creates one shared handoff for common child context and varies each
  child's brief by angle.
- Each child gets one outcome, a checkable stop condition, and exclusive
  ownership of any files it writes.
- It consumes and verifies child handoffs before consolidating.
- It carries child results and handoff paths upward and keeps their working
  context at the child level.

Opted-in roots are limited to one child level and three children. Child
handoffs nest under the parent's dispatch directory and are listed in the
parent handoff metadata. The main session receives the root handoff and follows
child paths only when verification requires it.

## Re-route and report

Re-route only at a boundary: exploration finished, a coherent patch landed, or
validation changed the diagnosis. Report each dispatched unit with its slot and
record any misroute.

## Failure behavior

- `pi-dispatch` is not found (`command -v pi-dispatch` fails): route every unit
  to the main session or a fresh session, and report that dispatch was
  unavailable.
- A slot's model is unavailable before inference: record an availability
  failure and reroute at the equivalent tier by task shape. Do not treat it as
  a quality result.
- A dispatch exits nonzero or returns no handoff: report the exit status and
  stderr, and do not treat the unit as done.
- `take-it-offline` is unavailable when a shared handoff or fresh session is
  needed: stop that branch with
  `Missing internal dependency "take-it-offline"`. Do not substitute a
  handoff written from local guidance.

## Completion

Complete when:

- a route was stated before the first search or edit, with every unit assigned
  an owner;
- every dispatched unit has a slot chosen by evidence shape and tier, and a
  brief with one outcome, allowed scope, and checkable completion criteria;
- every returned handoff was read, and its diff and critical path were
  verified before acceptance;
- each re-route happened at a boundary and each misroute was recorded.
