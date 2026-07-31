---
name: lean
description: >-
  Efficiency discipline for this harness, in two parts. (1) Response density:
  full coverage at low depth — mention every item the answer needs, say less
  about each, never compress away failures, assumptions, or the work product.
  (2) Model routing: move a single evolving task across a cheap/mid/main tier
  ladder so expensive reasoning is spent only where uncertainty actually is.
  Use when deciding how much to say, when a task has bounded phases worth
  delegating, or when a subagent reports it is out of its depth or that the
  remaining work has become mechanical. Both halves are governed by
  scripts/route.py, which holds the settings and gates the tier changes — never
  decided from memory.
---

# Lean

Two ways this harness burns money for nothing: paying a top-tier model to do
mechanical work, and paying any model to elaborate where a sentence would do.
One skill, because both are the same judgement — spend where the difficulty
actually is.

**The shared rule: correctness outranks cost.** Each half has an override that
ignores its own economics when getting it right is at stake, and neither
override is negotiable.

Settings live in `lean.config.json`. That file is the only place to change a
model id, a transport, or the default density.

**Running the engine.** Commands below are written as `route.py <cmd>`. The real
path depends on how the skill is installed:

```bash
# installed as a plugin
python "${CLAUDE_PLUGIN_ROOT}/skills/lean/scripts/route.py" status
# vendored into a project
python .claude/skills/lean/scripts/route.py status
```

Run it from the project root either way — that is where the ledger is written.

---

# Part 1 — Response density and shape

**The goal is the reader's scanning time, not the token count.** Fewer tokens is
a side effect worth having, but it is not the objective, and treating it as the
objective produces dense unreadable blocks that are technically short. A
slightly longer answer that can be skimmed beats a shorter one that must be read
in full.

Two dials serve that goal: how much you say, and what shape it arrives in.

## How much — compress depth, never breadth

If the answer touches eight things, name eight things; what shrinks is how much
you say about each. Told merely to "be brief", a model covers the three most
interesting items and silently drops five — that is omission, not compression,
and the reader cannot tell which happened.

Sentences stay normal. Grammar is not the axis; elaboration is. Cut the
preamble, the recap of your own message, the justification nobody asked for,
the second example, the tutorial on a library the user already uses.

Never cut: any item in a set the user asked about, anything that changes what
they do next, failures, skipped steps, unverified claims, or the assumptions
you made to proceed.

**Density governs talk, not output.** Code, docs, commit messages, and any file
you were asked to produce keep their normal quality and length. A terse setting
never licenses a thinner deliverable — and it never applies to reasoning.

Expand past the level when the user is working from a wrong premise, when a
caveat would change the conclusion, when safety or irreversibility is in play,
or when they asked "why". **A follow-up asking for more depth is the dial
working** — pre-empting those questions is what inflates answers. A follow-up
needed to discover something you omitted is the failure.

Levels: `terse` (answer alone), `default` (answer plus one line of why per
non-obvious call), `full` (no compression). Change for a session:

```bash
route.py density terse
```

## What shape — structure for skimming

The reader is not asking "what did you find". They are asking **"what do I act
on, and what can wait?"** Shape the answer around that question:

- **Answer in the first line.** Someone who stops there should still have the
  answer; everything after is support. This is what makes "read the detail
  later" actually possible.
- **One idea per paragraph, two to four sentences.** A paragraph covering three
  things cannot be skipped selectively — that inability to tell where one point
  ends is what makes responses feel like a wall, more than length does.
- **Sets render as lists, identifier first.** `` `file.py` — what's wrong ``, so
  the reader can scan the left edge. Lists also make omissions visible in a way
  prose does not, which is why they reinforce the coverage rule.
- **Group by required action, not by topic.** "Blocking / this week / backlog"
  beats "security / performance / style" — a taxonomy mirroring your analysis
  makes the reader do the sorting you skipped.
- **Headers carry information.** "Three tests fail, one file won't import", not
  "Findings".
- **Never structure what has no structure.** A two-sentence answer takes no
  header, no bullet, no bold. Ceremony on a short answer is the likeliest way
  these rules backfire.
- **Prose stays prose.** No JSON or YAML as a way of talking to a person, and no
  table unless there are genuinely items × attributes to compare.

Full treatment with worked examples: `references/density.md` for how much,
`references/structure.md` for what shape.

---

# Part 2 — Model routing

One task. One owner. Three tiers. The main agent (Opus) owns the request, the
architecture, the task state, and the final result. It delegates *bounded
phases* of execution and takes back a compact checkpoint each time.

This is not an orchestration product and it does not run agents in parallel.
It answers one question, repeatedly: **which model should do the next phase of
this same task?**

## The one rule

Route on the uncertainty that remains **right now**, not on how big the task
looked when it started. A large task whose approach is settled belongs on the
cheap tier. A one-line change whose correct behaviour is still open belongs on
main. Size is not the signal; residual uncertainty is.

## The tiers

| Tier | Default | Takes work where… |
|---|---|---|
| `cheap` | Luna, medium | The approach, the affected area, and the validation method are all known. Remaining decisions are mechanical. |
| `mid` | Terra, medium | The intended outcome is known, but repo-specific investigation, impact analysis, or a choice among existing patterns remains. `cheap` would have to guess. |
| `main` | Opus, medium | The correct behaviour or design is still open, or the area is correctness-sensitive: concurrency, security, persistence, compatibility, data integrity. |

Main also keeps routing itself and any final review that risk actually
justifies. Do not add a review pass by default.

Main's own effort: `low` when the turn is pure dispatch and relay, `medium`
when it is planning, judging, or reviewing. Above medium is not worth the cost
per task.

## The loop

```bash
route.py open --objective "..."
```

Then, at every checkpoint:

1. **Classify** the scope — see `references/routing.md` for what each signal
   means. You need `--uncertainty settled|local|design`, `--remaining <steps>`,
   and `--risk` if it applies.
2. **Ask** — `route.py decide --scope <slug> --uncertainty … --remaining N`.
   It answers ALLOW or DENY and says why.
3. **Obey it.** A DENY means finish the current phase where you are. Do not
   re-argue the verdict, and do not invent a new scope slug to get a different
   answer — the ledger counts scopes and the card reports churn.
4. **Commit** — same flags, `commit` instead of `decide`. This records the hop
   and installs the reverse ban.
5. **Write the handoff** to a file (`references/handoff.md` has the contract),
   then `route.py spawn --tier <t> --prompt-file <f>` for the exact invocation.
6. **Read the subagent's final message as its handoff**, then start again at 1.

`route.py status` prints the full audit trail. `route.py close` ends the task.

## Checkpoints

Reassess only at a natural seam: exploration finished, the approach became
clear, a coherent patch landed, or validation changed the diagnosis. Never
reroute in the middle of an atomic change — a half-applied edit is worse than
a slightly over-priced one.

## Moving up and down

**Up.** `cheap` must stop and return control when it meets an unresolved design
choice, an unexpected component boundary, or repo behaviour that contradicts
its instructions. `mid` must return architectural questions to `main` rather
than inventing a design. Returning to main on a design question or a risk flag
is *always* permitted — no ban and no budget ever blocks it. Getting it wrong
costs more than getting it cheap saves.

**Down.** When a tier finds the remaining work has become mechanical, it stops
at a coherent checkpoint and hands the remainder down. Only if enough work is
left to repay the handoff; the ledger enforces the threshold.

**Not back again.** Once a scope has moved `cheap → mid`, it does not move
`mid → cheap`. That call was already made. If the work genuinely changed —
main resolved the design question, or the objective moved — that is a new
scope, and a new scope slug is correct. Opening one merely to escape a ban is
not, and it shows up in the audit.

## What the ledger decides, and you don't

`route.py` owns these, deterministically, because an agent that re-derives
them mid-task is the failure this skill exists to prevent:

- whether a tier change is allowed at all;
- the anti-oscillation bans for the current scope;
- whether enough work remains for a handoff to pay for itself;
- the hop budget per scope and per task;
- the capability floor — a tier is never handed work whose uncertainty it
  cannot carry.

Your job is to classify honestly and write a good handoff. Estimating
`--remaining` low to dodge a switch, or calling a design question `settled` to
keep work cheap, defeats the whole mechanism.

## Anti-patterns

- Delegating work you will have to review line by line anyway. The review costs
  what the delegation saved.
- Keeping a capable model on a task merely because it started it.
- Switching to save a couple of steps.
- Two writing agents in one tree at once. One writer, unless the workstreams
  are genuinely independent and cannot collide.
- Restarting the task at a handoff. Pass the objective, the constraints, the
  handoff, and the workspace — reference files and the current diff instead of
  pasting large code blocks or full command logs.

## Setup and transports

`references/transports.md` covers both modes: separate Claude and Codex
accounts (main shells out to the Codex CLI over a shared working tree), and a
unified harness where every model is natively spawnable. Run
`route.py doctor` before routing real work — it verifies the config, the state
directory, and the transport.
