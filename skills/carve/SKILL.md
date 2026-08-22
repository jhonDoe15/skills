---
name: carve
description: Size a spec or ticket set so one main-tier sub-agent can finish each piece alone — splitting what's too big, combining what's fragmented below its natural seam, flagging what needs a human decision — layered on top of /to-tickets, ready for /dispatch-work. Invoke explicitly.
disable-model-invocation: true
---

# Carve

Carve is a thin layer over **`/to-tickets`**: it inherits the ticket-splitting and sizes each piece to **one main-tier sub-agent's reach** — the primary model this machine runs — splitting what's too big, combining what's fragmented, flagging what needs a human decision, and recording the **collision coordination** `/dispatch-work` needs to run pieces in parallel safely. It reuses; it doesn't reinvent.

Like `/to-tickets`, it runs only when you invoke it.

## Start from a spec, not raw context

Carve sizes a **ticket set**, and good tickets come from a spec. If the work only lives in this thread and no `/to-spec` has collapsed it into a plan, run **`/to-spec`** first — reach it via `/grill-with-docs` → `/to-spec`, or `/wayfinder` → `/to-spec` for a foggy effort. Carving raw context skips that collapse and loses the linked detail.

## The one rule

Judge each piece on the uncertainty that remains **right now**, not the size it started at. A large change whose approach is settled fits one sub-agent; a one-line change whose correct behaviour is still open does not. Size is not the signal — residual uncertainty is.

## The one tier

There is a single tier: the **main sub-agent** this machine defines (`lean.config.json`, or the repo's `subagent-model-tiers` rule), cheap enough to spend freely. Carve doesn't rank a piece up or down a ladder; it asks one thing of every piece: **can one main-tier sub-agent finish this alone?** When the answer is no, there are exactly two exits — never a higher tier:

- **split** — the piece is too big or mixes concerns; carve breaks it into pieces that each fit (reuse `/to-tickets`).
- **flag** — the piece turns on a decision the main tier shouldn't guess (open design, or a risk boundary); mark it for a **human** to settle before or instead of dispatch.

Everything runs on the one cheap tier, so carve spends its effort making pieces *fit* it rather than sorting them across rungs.

## Steps

### 1. Get a ticket set — reuse `/to-tickets`
- A spec or context that needs splitting → run **`/to-tickets`**; it produces tracer-bullet tickets, each declaring its blocking edges.
- Tickets already exist and are broken down enough → take them as they are.
*Done when:* you hold a ticket set with its blocking edges.

### 2. Mark every piece — fit, split, or flag
The layer carve adds. Triage each ticket against the signals: does one main-tier sub-agent finish it alone? Mark each **fit**, **split**, or **flag** (human decision) with a one-line reason.
*Done when (exhaustive):* every ticket is marked fit / split / flag with a reason; nothing is left as "feels complex".

### 3. Size each piece to fit — split *or* combine
A piece must sit at its **natural seam**: one cohesive change a single main-tier sub-agent finishes alone. Move it there from either side:
- **Too big or mixed to fit** → split it (reuse `/to-tickets`), or convert `local` → `settled` by doing the lookup and writing it in. Where an unknown can't be settled up front, split it into its own upstream **research** piece — or a **flag** for a human — that blocks the impl piece.
- **Fragmented below the seam** → combine, in whichever form keeps the tracking worth its cost. Pieces that share one file or decision, or that a single sub-agent would reconcile anyway, either **merge** into one ticket (when tracking them apart buys nothing) or **group** — keep the separate tickets but mark them (`group:<name>` label or note) to run as one sub-agent on one stacked branch (when the separate tickets/PRs still earn their review granularity). Fragmenting past the seam pays coordination tax (a brief, a spawn, a review per piece) without buying autonomy.
- **Re-check the combined piece fits** — a merged or grouped piece still has to finish in one sub-agent. If its breadth or a decision that now spans it overruns that reach, split or flag it.
*Done when:* each piece is one cohesive change one main-tier sub-agent can finish — neither mixing settled work with an open decision nor sliced so fine that siblings must be re-stitched.

### 4. Wire the relations
Write the relationships `/dispatch-work` orchestrates on, each in the tracker mechanism that matches its meaning:
- **Dependency** (a ticket needs another's output) → the native **blocking** link (`Blocks` / depends-on). `/to-tickets` already created these; add any it missed.
- **Collision** (tickets share a file or mutable state — the same migration, fixture, config key, or port — but neither needs the other's output) → a non-directional **`Relates`** link, or a **shared-resource label** (e.g. `collides:config.ts`), plus a one-line note of what they share. A pure collision stays off the blocking link — a block asserts an order that isn't real and over-serialises.
*Done when:* every dependency and every collision is on the tracker in its own mechanism. Hand the tracker to `/dispatch-work`.

## Avoid

- Leaving a decision buried in a piece marked to fit — it comes back confident and wrong. Split it out or flag it.

## Reuse

- `/to-tickets` — inherited: the ticket-splitting carve sizes on top of, and the split target when a piece is too big to fit.
- `/to-spec` — run first when the work is only in context; carve sizes a spec-derived ticket set.
- `/wayfinder` — upstream for a foggy effort: chart it, `/to-spec` collapses the map, then carve.
- `/dispatch-work` — downstream: runs the sized tracker, a batch of sub-agents in parallel.

## Supersedes admino

Carve is the triage half of admino's ladder — collapsed to a single tier. The one rule and the signals stay; the cheap/mid/top rungs go, because everything runs on the one cheap main tier and the only answers to "too much for it" are **split** (carve does it) or **flag** (a human decides). Paired with `/dispatch-work`, the two retire admino's auto-loaded card.
