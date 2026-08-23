---
name: dispatch-work
description: Run an already-sized tracker — a few tickets in parallel (default 3), each on the configured main-tier sub-agent that builds with /implement, gets an independent /code-review, then babysits its PR to approval; resumable, so re-invoking picks each ticket up at its current checkpoint. The main session never implements. Invoke explicitly.
disable-model-invocation: true
---

# Dispatch-work

You have a **sized tracker** — tickets each cut to fit one main-tier sub-agent, with files, acceptance, blocking edges, and collision coordination (shared file or state, from `/carve`). Dispatch-work runs the crew: it keeps a few independent tickets in flight at once, each on a main-tier sub-agent that builds with **`/implement`**, gives the diff an **independent review**, and **babysits** the resulting PR to approval. It dispatches and verifies; it never builds.

Like `/carve`, it runs only when you invoke it.

## How many at once

Keep up to **3 pieces in flight** by default; the invoking prompt overrides the number ("dispatch 5", "one at a time"). Spawn the batch's sub-agents in one turn so they run concurrently. The pieces in flight must be **mutually independent** — no shared file, and no shared mutable state (the same migration, fixture, config key, or port; or one piece's change altering another's outcome) — so parallel sub-agents can't collide.

## Pin the model

Every spawn names its model explicitly — the **main tier** this machine defines (`lean.config.json` / the repo's `subagent-model-tiers` rule). A sub-agent that inherits the parent model looks routed and can cost far more. **Never run a Claude model at `max`.** The main tier is cheap by design, so spend it freely — a separate sub-agent per implementation, per review, per PR keeps each one's context small and its scope tight.

## Staying in the smart zone

Every stage runs inside its own sub-agent's window — `/implement` drives `/tdd` and closes with `/code-review`, the review pass reads the diff fresh, the babysitter watches the PR — none of it in yours. Stay low-effort: vet each report and let it go. Your state lives in the tracker (which tickets are open) plus the live PRs, not in this window — so if your window ever fills, re-seed a fresh dispatch-work and it recovers from that state (see *Read the state first*).

## One tier, two exits

Every piece rides the same main tier — there is no cheaper or higher rung. When a sub-agent hits something beyond one main-tier's reach, the answer is never an escalation; it is one of carve's two exits:
- **split** — the piece outgrew a single sub-agent; send it back to `/carve` to break down.
- **flag** — it turns on an open design choice or a risk boundary; surface it to a **human** to decide.

## Read the state first — every invocation

Dispatch-work is **resumable**: a first run finds every ticket not-started, but a re-trigger (a filled window, a new session, an interrupted run) finds them scattered across stages. Before filling the batch, reconcile the tracker against **live PR state** (`gh pr list`, `gh pr view`, `gh pr checks`) and the branches already pushed, and place every ready piece at the checkpoint it actually reached — never restart a piece that has progress. Each state enters the loop at its matching stage:

- **not started** (ticket open, no branch, no PR) → step 2: spawn `/implement` fresh.
- **in progress** (branch or commits pushed, or a returned handoff, but no PR) → step 2: resume from its Remaining work, don't restart.
- **diff ready, unreviewed** (implementation returned, or a PR is open but had no independent review) → step 3: review the diff.
- **PR open with unresolved comments or red CI** → step 4: babysit to approval.
- **PR approved, not yet merged** → step 5: merge + integration.
- **merged or closed** → done; skip it and pull the next ready piece.

A piece whose blocking links are still open stays parked whatever partial state it shows.

## The run loop

### 1. Fill the batch
Count pieces already in flight first — on a resume, anything mid-implementation, under review, or being babysat (steps 2–4) already holds a slot. Then fill the free slots up to the batch size (default 3) with **ready** pieces: unblocked (its blocking links all closed) and independent of every piece in flight — no `Relates`/collision link or shared-resource label ties it to one already running. A carve `group` counts as one piece; colliding pieces serialize.
*Done when:* the batch is full or no more pieces are ready.

### 2. Start or resume the implementation
Hand each **not-started** piece the ticket plus the brief; a set carve marked as a **`group`** goes to one sub-agent as a single stacked unit. The sub-agent runs **`/implement`**, which drives `/tdd` red-green and closes with `/code-review` on the diff. An **in-progress** piece resumes from its handoff's Remaining work — hand the sub-agent the pushed branch and that handoff, not a blank start. A piece carve **flagged** (a research or human-decision piece) isn't dispatched blind — resolve its open decision or endpoint question with the human, record the answer on the ticket, then unblock the impl piece.
*Done when:* every piece in the batch is dispatched, resumed, or resolved.

### 3. Verify what returned
First vet the report in the main session, lightly: does the validation demonstrate what it claims; did it stay inside the stated boundary; do its assumptions contradict anything you know but didn't tell it; is the remaining-work estimate credible against the diff. Then, for real correctness, always spawn a **second** main-tier sub-agent to `/code-review` the diff with **fresh context** — the implementer reviews what it meant, not what it wrote. Across the batch, watch for a **systematic error** — the same tier repeating one mistake on every piece it touched. Fixes go back to a main-tier sub-agent; a finding it can't settle returns for a **split** or a **flag**.
*Done when:* the report is vetted, the diff independently reviewed, and every finding fixed or bounced back.

### 4. Babysit the PR to approval
Once a piece's PR is open, hand it to **`/autopilot`** in its own main-tier sub-agent. Autopilot refreshes live PR state each pass and works blockers in order — merge conflicts, then unresolved **bot and human** comments, then failing CI — fixing what's in this PR's scope and surfacing what isn't. Run it on a **5-minute cadence** between passes (watch running checks to completion rather than tight-looping), and keep going until the **PR is approved** — mergeable, required CI green, every thread triaged — or you are **explicitly stopped**. A comment on security, auth, data, migration, or concurrency is a **flag**: surface it to the human, don't guess.
*Done when:* the PR is approved and merge-ready, or the run is explicitly stopped, or a comment is flagged for a human.

### 5. Merge and refill
Merge respecting collision order (autopilot leaves the merge to you), then pull the next ready piece into the freed slot. Once a batch has landed, verify **integration** — run the full build/suite; pieces that each passed alone can still break together.
*Done when (exhaustive):* every ticket is implemented, independently reviewed, and its PR approved, and the integrated whole builds green — or a ticket is explicitly parked naming what unblocks it (a split or a human decision).

## The brief every spawn carries

Reuse the workspace's `/handoff` skill for what to carry, redact, and reference. Two things it must always state:
- the **boundary** — which files are in scope, and what to do on hitting something outside them (stop, report, return); and
- the **return contract**, verbatim:
> When you finish, stop and reply with the handoff. Do not start work beyond Remaining work. If you hit an unresolved design choice, an unexpected boundary, or repo behaviour that contradicts these instructions, stop, report, and recommend a split (back to /carve) or a human decision.

That last sentence is what makes a sub-agent out of its depth return instead of guess.

## Checkpoints and holds

Reassess a piece only at a **seam** — exploration finished, approach clear, a coherent patch landed, or validation changed the diagnosis. With one tier there's no rung to climb: a piece that outgrows a single sub-agent goes back to `/carve` for a **split**, or to a human for a **decision**. Surfacing a design question or a risk flag is never blocked, however little work is left.

## Avoid

- Delegating work you'll re-read line by line anyway — the review costs what the delegation saved.
- Restarting a piece from scratch at a handoff instead of resuming from its Remaining work.

## Reuse

- `/implement` — the sub-agent's build; drives `/tdd` and closes with `/code-review`.
- `/autopilot` — the PR babysitter: triages bot and human comments, resolves conflicts, fixes CI to merge-ready.
- `/handoff` — the brief for every spawn, and the seed to resume a run.
- `/carve` — upstream: produces the sized, related tickets this loop consumes, and the split target when a piece outgrows one sub-agent.

## Supersedes admino

Dispatch-work is the delegate-and-verify half of admino's ladder — collapsed to a single main tier: the handoff, the report-vetting, an independent review, and the PR babysit, run on a sized batch. When a piece outgrows the tier the answer is a **split** or a **human**, not a rung up. Paired with `/carve`, the two retire admino's auto-loaded card.
