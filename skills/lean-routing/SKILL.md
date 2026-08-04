---
name: lean-routing
description: >-
  Route a task's next phase to the cheapest model that can carry the uncertainty
  left in it. Use when delegating implementation to a subagent, when deciding
  which model should take the next phase, when a subagent reports it is out of
  its depth or that the remaining work has gone mechanical, or when another
  skill needs the tier-ladder vocabulary.
---

# Lean routing

One task. One owner. Three tiers. The main agent owns the request, the
architecture, the task state, and the final result. It delegates *bounded
phases* and takes back a compact checkpoint each time.

This runs one task across models. It is not an orchestration product and it does
not run agents in parallel. It answers one question, repeatedly: **which model
should do the next phase of this same task?**

Requires the `lean` skill — the engine (`route.py`) and config live there. Below,
`route.py` means `${CLAUDE_PLUGIN_ROOT}/skills/lean/scripts/route.py` as a
plugin, `.claude/skills/lean/scripts/route.py` vendored. Run it from the project
root; that is where the ledger is written.

## The one rule

Route on the uncertainty that remains **right now**, not on how big the task
looked when it started. A large task whose approach is settled belongs on the
cheap tier. A one-line change whose correct behaviour is still open does not.

## The tiers

Model ids and reasoning effort live in `lean.config.json`. That file is the only
place to change them — never edit this doctrine to swap a model.

| Tier | Default | Takes work where… |
|---|---|---|
| `cheap` | Luna, medium | Approach, affected area, and validation method are all known. Remaining decisions are mechanical. |
| `mid` | Terra, medium | The outcome is known, but repo-specific investigation, impact analysis, or a choice among existing patterns remains. `cheap` would have to guess. |
| `main` | Opus, medium | The correct behaviour or design is still open, or the area is correctness-sensitive: concurrency, security, persistence, compatibility, data integrity. |

Main keeps routing itself, and any final review that risk actually justifies. Do
not add a review pass by default.

Main's own effort: `low` when the turn is pure dispatch and relay, `medium` when
it is planning, judging, or reviewing. Above medium is not worth the cost per
task.

**Breadth is a tier signal in its own right.** Cheaper models lose items on wide
enumerations regardless of how settled the approach is — measured at 24 items,
the cheap tier held 17. If the deliverable is a long list that must be complete,
that is a reason to route up even when nothing is uncertain.

## The loop

```bash
route.py open --objective "..."
```

Then at every checkpoint:

1. **Classify** the scope — `references/routing.md` defines each signal. You need
   `--uncertainty settled|local|design`, `--remaining <steps>`, and `--risk` if
   it applies.
2. **Ask** — `route.py decide --scope <slug> --uncertainty … --remaining N`.
   ALLOW or DENY, with the reason.
3. **Obey it.** A DENY means finish the current phase where you are. Do not
   re-argue the verdict, and do not invent a new scope slug to get a different
   answer — the ledger counts scopes and the card reports churn.
4. **Commit** — same flags, `commit` instead of `decide`. Records the hop and
   installs the reverse ban.
5. **Write the handoff** to a file (`references/handoff.md` has the contract),
   then `route.py spawn --tier <t> --prompt-file <f>` for the exact invocation.
6. **Read the subagent's final message as its handoff**, then start again at 1.

`route.py status` prints the audit trail. `route.py close` ends the task.

## Checkpoints

Reassess only at a natural seam: exploration finished, the approach became
clear, a coherent patch landed, or validation changed the diagnosis. Never
reroute mid-edit — a half-applied change is worse than a slightly over-priced
one.

## Moving up and down

**Up.** `cheap` stops and returns control when it meets an unresolved design
choice, an unexpected component boundary, or repo behaviour contradicting its
instructions. `mid` returns architectural questions rather than inventing a
design. Returning to main on a design question or a risk flag is *always*
permitted — no ban and no budget blocks it, because getting it wrong costs more
than getting it cheap saves.

**Down.** When the remaining work has gone mechanical, stop at a coherent
checkpoint and hand the remainder down — if enough work is left to repay the
handoff. The ledger enforces the threshold.

**Not back again.** Once a scope has moved `cheap → mid`, it does not move
`mid → cheap`. That call was already made. If the work genuinely changed — main
resolved the design question, or the objective moved — that is a new scope, and
a new slug is correct. Opening one to escape a ban shows up in the audit.

## What the ledger decides, and you don't

`route.py` owns these deterministically, because an agent re-deriving them
mid-task is the failure this skill exists to prevent:

- whether a tier change is allowed at all
- the anti-oscillation bans for the current scope
- whether enough work remains for a handoff to pay for itself
- the hop budget per scope and per task
- the capability floor — a tier is never handed uncertainty it cannot carry

Your job is to classify honestly and write a good handoff. Estimating
`--remaining` low to dodge a switch, or calling a design question `settled` to
keep work cheap, defeats the mechanism.

## Avoid

- Delegating work you will review line by line anyway. The review costs what the
  delegation saved.
- Keeping a capable model on a task because it started it.
- Switching to save a couple of steps.
- Two writing agents in one tree at once. One writer, unless the workstreams are
  genuinely independent and cannot collide.
- Restarting the task at a handoff. Pass the objective, the constraints, the
  handoff, and the workspace — reference files and the current diff instead of
  pasting code blocks or command logs.

## Setup

`references/transports.md` covers all three: the Codex CLI over a shared working
tree (separate Claude and OpenAI accounts), a unified harness where every model
is natively spawnable, and a Claude-only fallback with no external dependencies.

Run `route.py doctor` before routing real work — it verifies the config, the
state directory, and the transport.
