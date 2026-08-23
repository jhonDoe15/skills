---
name: ticket-scope
description: Use when evaluating whether a proposed ticket, work item, or PR diff is one cohesive, independently verifiable unit, including vertical slices and dependency-driven layered changes.
disable-model-invocation: false
user-invocable: false
---

# Ticket Scope

Use this as the shared base-unit evaluator for `carve` and PR sizing. Judge the
work that remains after exploration, not the task's original size or its line
count.

## Base-unit contract

A base unit has:

- One cohesive outcome and one natural seam.
- Explicit in-scope and out-of-scope behavior.
- Acceptance criteria and validation that can be checked without an unrelated
  sibling.
- A known approach, change area, and validation plan, or a recorded lookup that
  will settle them.
- No unresolved design decision or unreviewed risk boundary.

Prefer a **vertical** slice: a narrow, complete path through the required
layers. A **layered** horizontal slice is also valid when a real contract or
migration order requires it:

- The layer has its own observable acceptance and validation.
- The dependency is real and ordered, such as foundation → consumer or
  expand → migrate → contract.
- The intermediate state remains compatible or its integration constraint is
  explicit.
- The owning tracker or report records the blocker; layered units are not
  parallel candidates.

When a proposal contains multiple layers that must land independently, assess
the proposal as `split` and return one `layered` candidate per real landing
seam. A single user-visible outcome does not erase a hard dependency chain.

Horizontal convenience is not a seam. Combine it, reshape it into vertical
units, or flag it when safe boundaries are unknown.

## Evaluate in order

1. **Outcome** — State the behavior, capability, or coherent refactor this unit
   delivers. If the proposal is a set of independently landing layers, identify
   each layer's outcome before assessing the candidates.
2. **Boundary** — Name what changes and what deliberately stays unchanged.
3. **Verification** — State acceptance and the narrowest validation that proves
   the outcome.
4. **Uncertainty** — Classify what remains:
   - `settled`: approach, change area, and validation are known.
   - `local`: outcome is known but a repository lookup is missing. Do the
     proportional lookup and record the result.
   - `design`: the correct behavior is genuinely open. Make it a separate
     decision or flag it for a human.
5. **Risk** — Flag security or authorization, concurrency, persistence or
   migration, compatibility or public-contract, and data-integrity boundaries
   regardless of mechanical size.
6. **Breadth** — Count distinct outcomes, decisions, validation surfaces, and
   mutable resources. Split mixed or over-broad work, including a hard
   dependency chain of separately landing layers; combine fragments that one
   implementation and review pass would reconcile anyway.
7. **Relations** — Record output dependencies as blockers. Record shared files or
   mutable state without output dependency as collisions, never as artificial
   blockers.

## Assessment

Return one assessment for every proposed unit or candidate:

- `fit` — meets the base-unit contract.
- `split` — mixes outcomes, crosses a natural seam, or exceeds reasonable
  breadth; name the candidate units.
- `combine` — is fragmented below its natural seam; name the pieces to merge.
- `flag` — requires a human decision or risk review before it can fit.

Every unit assessment must include `Shape: vertical` or `Shape: layered`.
Relation-only collision metadata is not a unit assessment and may use
`Shape: n/a` when included solely to describe that collision.

Every assessment must include:

```text
Assessment: fit | split | combine | flag
Shape: vertical | layered | n/a
Unit:
Outcome:
In scope:
Out of scope:
Acceptance:
Validation:
Uncertainty:
Risk:
Blocked by:
Collisions:
Reason:
Next:
```

For `fit`, all required fields are concrete. For `split` and `combine`, list
the resulting units and reassess each one. For `flag`, state the exact decision
or risk that blocks execution.

## Guardrails

- A large change can fit when its approach and boundary are settled; a tiny
  change can require a flag when its behavior or risk is open.
- Splitting does not clear a risk boundary. Only an explicit human decision or
  review does.
- A layered shape requires a real order and a validation point at every layer.
  If those are absent, do not call the horizontal fragments fit.
- Do not use additions, deletions, file count, or time estimates as the
  definition of a unit. They are signals to inspect, not substitutes for
  outcome, seam, verification, and risk.
- Do not leave a proposal marked merely “complex.” Choose `fit`, `split`,
  `combine`, or `flag` and give the reason.

## Consumers

- `carve` applies this evaluator, then checks whether each resulting unit fits
  one main-tier sub-agent and wires blockers and collisions into its tracker.
- `pr-carver` applies this evaluator to a PR diff, using `Shape: layered` and
  `Blocked by` to distinguish stacked work from parallel work.
- A ticket-generation workflow creates the initial candidates; this evaluator
  scopes and tests them rather than replacing that workflow.
