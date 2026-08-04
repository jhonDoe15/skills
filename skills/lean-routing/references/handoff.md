# The handoff contract

Every tier change carries a handoff. It is the only thing that survives the
switch — the next model does not see the previous model's reasoning, only this.

Two directions, same seven fields:

- **Down/across** (main writes it, subagent receives it): the brief.
- **Up/back** (subagent writes it, main receives it): the report.

Write it to a file and pass that file to `route.py spawn --prompt-file`.
Convention: `.claude/.lean/handoff.md`, overwritten each hop — the ledger
keeps the audit trail, this file only needs to hold the current one.

## The seven fields

```markdown
## Objective
<the original user request, verbatim enough that the subagent cannot drift.
 Not the phase — the whole point. A subagent given only its phase will
 optimise the phase and break the task.>

## Constraints
<house style, invariants, what must not change, validation that must keep
 passing, anything the user said explicitly.>

## Completed so far
<what already works. Reference files and the current diff. Do not paste
 large code blocks or full command logs — the workspace is shared.>

## Decisions and assumptions
<choices already made and not up for renegotiation, each with its reason.
 This is what stops the next tier from re-litigating settled ground.>

## Files inspected or changed
<paths, with one clause each on what changed and why.>

## Validation performed
<exact commands and exact results. "tests pass" is not a result;
 "pytest tests/test_export.py -q -> 14 passed" is.>

## Remaining work
<the concrete steps left, and the definition of done for this phase.>

## Open risks and questions
<anything unresolved. If a question belongs to main, say so explicitly
 rather than answering it yourself.>

## Recommended next tier
<cheap | mid | main, with one line of justification.>
```

## Rules for the brief (main → subagent)

State the **boundary** as clearly as the task. A subagent that does not know
where its authority ends will either stop too early or redesign something it
was not asked to touch. Say which files are in scope, and say what to do when
it hits something outside them: stop, write the report, return.

Include the return contract explicitly in the prompt:

> When you finish, stop and reply with the seven-field handoff. Do not start
> work beyond the Remaining work section. If you hit an unresolved design
> choice, an unexpected component boundary, or repo behaviour that contradicts
> these instructions, stop immediately, report what you found, and recommend
> `main`.

That last sentence is what makes upshifts happen at all. Without it, a cheap
tier that is out of its depth guesses instead of returning.

## Rules for the report (subagent → main)

**Recommended next tier is a recommendation, not a decision.** Main runs
`route.py decide` and the ledger may deny it — a report recommending `cheap`
right after a `cheap → mid` hop will be refused, correctly.

Be exact about validation. A report that overstates what was verified is worse
than one that admits nothing was run: main routes the next phase on it, and an
unearned "tests pass" propagates through every subsequent hop.

State remaining work in steps, not prose. Main feeds that count straight into
`--remaining`, and it decides whether the next handoff is worth paying for.

## Reading a report before re-routing

Check, in order:

1. Does the validation actually demonstrate what it claims?
2. Did it stay inside the boundary?
3. Do its assumptions contradict anything you know but did not tell it?
4. Is the remaining-work estimate credible against the diff?

Only then classify the next scope and call `route.py decide`. Routing on an
unread report is how a bad assumption gets three tiers deep before anyone
notices.
