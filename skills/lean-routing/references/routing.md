# Classifying a scope

The router is only as good as the three signals you feed it. All three describe
the scope **as it stands now**, after everything already learned.

## `--uncertainty`

Pick the *highest* one that still applies.

### `settled`
The approach is chosen, the affected files are known, and you can state the
validation before the work starts ("`pytest tests/test_export.py` passes",
"the CLI prints the new column"). Remaining decisions are mechanical:
applying a known pattern, threading a parameter, updating call sites.

Not settled if you would write "figure out where X lives" in the handoff.

### `local`
The intended outcome is known but the repo has not told you how yet. Typical:
which of two existing patterns is the house style; what else calls this
function; whether the change spans one module or four; which helper already
does this. Bounded to a subsystem, and answerable by reading the code rather
than by making a design decision.

The test: **would the cheap tier have to guess?** If yes, it is `local`.

### `design`
The correct behaviour is genuinely open. Requirements conflict, the plan does
not cover an invariant the implementation just exposed, a new architectural
choice is needed, or two reasonable readings of the request lead to different
code. This is main's work and delegating it produces confident, wrong output.

The test: **is the question "how do I finish this" or "what is correct here"?**
The second is always `design`.

## `--remaining`

Estimated discrete steps left **in this scope**: distinct edits, files to
touch, checks to run. Not minutes, not tokens, not the whole task.

Estimate before you look at the verdict, not after. This number is the entire
basis for "is a handoff worth it", and quietly shading it is how the mechanism
stops working. If you truly cannot tell, say so in `--note` and estimate high —
an over-estimate risks one extra handoff; an under-estimate strands work on the
wrong tier for the rest of the scope.

Defaults in `lean.config.json`: an upshift needs ≥2 steps left, a downshift
≥5. A downshift has to clear a higher bar because it is a pure optimisation,
while an upshift is usually a capability need.

## Breadth is a tier signal too

Uncertainty picks the tier, but sheer item count sets a ceiling independently.
Measured on the `cheap` tier: asked to account for 24 scan findings, it held 17
with the full response card and 14 without. Opus held 24 of 24 either way.

So a task can be perfectly `settled` — approach known, area known, validation
known — and still be wrong for `cheap` because it has thirty things to keep
straight. Coverage collapse does not announce itself: the answer reads complete
and the missing items are invisible to the reader.

When a scope requires holding more than roughly fifteen distinct items in one
pass, either raise the tier or split the scope so each pass carries fewer. A
split is usually better: it keeps the work cheap and makes the coverage
checkable per chunk.

## `--risk`

Set it when the scope touches concurrency, security or authorisation,
persistence and migrations, backwards compatibility or a public interface, or
data integrity. It forces `main` regardless of how settled the approach looks,
and it opens the escalation safety valve.

It is a property of the *area*, not of your confidence. A mechanical-looking
edit to a migration is still `--risk`.

## `--scope`

A short stable slug for the phase being routed. Keep it identical across
`decide`/`commit` calls for the same body of work — that is what makes the bans
and hop budget mean anything.

A new slug is correct when the work genuinely changed: main resolved the design
question that defined the old scope, validation reframed the problem, or the
objective moved. A new slug is *not* a way to clear a ban. The card warns once
a task has more than four scopes, and `route.py status` shows every one of
them with timestamps.

## Worked examples

| Situation | uncertainty | remaining | risk | Tier |
|---|---|---|---|---|
| Add a column to an existing export, pattern already used twice in the repo | settled | 6 | no | cheap |
| Same, but two serializers exist and it is unclear which is current | local | 6 | no | mid |
| "Make the sync idempotent" — retry semantics not specified | design | 12 | yes | main |
| Rename a helper across the repo, mechanical, wide | settled | 20 | no | cheap |
| Fix a failing test; cause unknown, could be anywhere | local | 8 | no | mid |
| Cheap tier reports "two components disagree about ownership of this field" | design | 9 | no | main |
| Main resolved that ownership question; the patch is now spelled out | settled | 9 | no | cheap (new scope) |
| Three lines left and a test to run, currently on mid | settled | 2 | no | stay on mid |
