# Failure audit

Use this audit when creating or materially revising agent guidance. The source is the user's own
work, not another person's configuration.

## Gather evidence

Inspect representative conversations, corrections, tool calls, reviews, and failed runs across the
models and harnesses the user actually employs. Sample enough history to distinguish a recurring
failure from one difficult task.

Classify observed failures:

- request misreading or unasked work
- overbuilding, scope creep, or unnecessary ceremony
- destructive process or environment actions
- tool misuse and shell failures
- broad checks that waste time
- missing verification, regression, or premature completion
- stale branches, ignored CI, or poor PR hygiene
- weak explanations, titles, reports, or human handoffs
- changes that miss a client, entry point, adapter, contract, inverse operation, or documentation

Quantify where useful: corrections per 100 user messages, frequency by model and harness, failed
tool calls, process kills, unasked edits, draft PRs, or elapsed time spent on unnecessary work.
Record workload and task-complexity confounds. Model rankings are evidence for the current setup,
not permanent truths.

## Diagnose each pattern

For a surprising decision, ask:

- What evidence or instruction made this look correct?
- Was an earlier assumption wrong and then reinforced by context?
- Is an existing instruction stale, ambiguous, or overbroad?
- Did the agent lack a project fact, user preference, stop point, or completion criterion?

When a small task takes much longer than expected, classify its tool calls by purpose and identify
which work changed the result. Do not encode a rule until the failure and likely cause are clear.

## Codify minimally

For each confirmed recurring failure:

1. Choose the narrowest scope where the rule applies.
2. Write the smallest positive, checkable instruction that changes behavior.
3. Add a hard prohibition only for destructive, irreversible, security, or repeatedly skipped
   constraints; pair it with the safe action.
4. For subjective output, include one real rejected/accepted pair from the user's history.
5. Record why the rule exists so a later audit can retire it.

Use generated drafts as raw material. The user or maintainer curates the final guidance.

## Verify and maintain

Run representative tasks with the draft guidance. Check behavior, communication quality, tool use,
scope, and completion rather than only Markdown structure. Keep the rule only if it changes the
observed failure without causing broader regressions.

Revisit model-specific and workaround rules as models, harnesses, and workflows change. Remove
rules whose failure no longer reproduces. Add new guidance from observed friction, then retest.
