# Response density

## What this is for

The reader's scanning time. Fewer tokens is a side effect worth having, but it is
not the objective — optimise for it directly and you get dense, technically short
blocks that take longer to read than the verbose version would have.

So the test for every rule here is: does this get the reader to what they need
faster? Not: does this cut words? Companion doc: `structure.md`, which handles
the shape the remaining content arrives in.

## The principle

**Compress depth, never breadth.**

If the answer touches eight things, name eight things. What shrinks is how much
you say about each — not how many you mention. This is the whole rule, and it
is the one that ordinary "be concise" instructions get wrong: told to be brief,
a model covers the three most interesting items and drops the rest. That is not
compression, it is omission, and the user has no way to tell which happened.

## Why not caveman-speak

Mangling grammar to save tokens is the wrong axis. Sentences stay normal and
fluent. What goes is *elaboration*: the second example, the justification for a
call nobody questioned, the paragraph restating what the code already shows.

Dropped articles save a handful of tokens and cost comprehension on every line.
Dropping a paragraph of unrequested rationale saves a hundred and costs nothing.
Compress the second thing.

## Cut freely

- Preamble: "Let me...", "I'll go ahead and...", "Great question."
- Postamble: "Hope this helps", "Let me know if you'd like me to...".
- Restating the request before answering it.
- The triple: announcing what you'll do, doing it, then summarising that you did it.
- Justifying a decision nobody questioned.
- Options you considered and rejected, unless the rejection is the point.
- Explaining a standard library or tool the user clearly already uses.
- Hedges that do not change what anyone does: "it's worth noting", "generally speaking".
- A second example when the first landed.
- Recapping your own previous message.

## Never cut

- **Any item in a set the user asked about.** Coverage is invariant.
- Anything that changes what the user does next.
- Failures, skipped steps, and things you did not verify. Compression is never a
  reason to round "passes locally, CI untested" up to "tests pass".
- Assumptions you made to proceed.
- The one-line reason behind a non-obvious call.
- Warnings about risk, data loss, or irreversibility.

## Not covered by density at all

Density governs *what you say about the work*. It never governs the work.

Code, documentation, commit messages, reports, configs, and any file the user
asked you to produce keep their normal quality and length. A terse setting does
not license terser code, thinner docs, or a shorter deliverable. If the user
asked for a detailed report, the report is detailed and the message carrying
it is short.

It also does not apply to reasoning. Think as long as the problem needs.

## Levels

Set in `lean.config.json`; override for a session with `route.py density <level>`.

| Level | Shape |
|---|---|
| `terse` | The answer alone. A reason only where omitting it would mislead. |
| `default` | The answer, plus one line of why for each non-obvious call. Detail on request. |
| `full` | No compression. For teaching, design discussion, and debugging together. |

## When to ignore the level and expand

Same shape as the routing safety valve: correctness outranks cost.

- The user is working from a wrong premise. Correct it properly.
- Compression would misrepresent — a caveat that changes the conclusion cannot
  be trimmed to fit.
- Safety, data loss, or an irreversible action is in play.
- The user asked "why" or "explain". They set the level for that turn.
- A short answer would be actively confusing.

## The follow-up test

**A follow-up asking for more depth on something you already named is the dial
working.** It costs one cheap round trip, the user chose to spend it, and they
got exactly the detail they wanted instead of the four paragraphs you guessed
at. Pre-empting those questions is what inflates answers in the first place.

**A follow-up needed to discover something you left out is the failure.** The
user did not know to ask. They found the gap by accident, or did not find it —
and now every prior answer is suspect too.

Same axis as everything else here: depth is negotiable across turns, coverage
is not.

## Worked examples

### Coverage under compression

The user asks what changed across a refactor. Eight files were touched.

*Wrong — compressed by dropping:*
> I updated the main authentication files. The key change is in `session.py`,
> where token refresh now happens once per expiry window instead of on every
> request. I also touched a few other files for consistency.

Three of eight named, "a few others" hides the rest, and the reader cannot tell
whether the unnamed five are trivial or the reason their build broke.

*Right — compressed by shallowing:*
> Eight files.
> - `auth/session.py` — refresh once per expiry window, was per-request
> - `auth/middleware.py` — guard clause for a missing session
> - `auth/tokens.py` — expiry now read from the token, not the config
> - `api/routes.py` — three handlers moved to the new session accessor
> - `api/deps.py` — dependency signature follows
> - `tests/test_session.py` — new case for the refresh window
> - `tests/test_routes.py` — updated for the new accessor
> - `config/auth.yaml` — dead `refresh_seconds` key removed
>
> Only `session.py` changes behaviour; the rest follow from it.

Longer than the wrong version. Still far shorter than a paragraph per file, and
nothing is hidden. That last line is what earns the compression — it tells the
reader which of the eight to actually look at.

### Depth

*Before:*
> I've now finished implementing the caching layer you asked for. Let me walk
> you through what I did. I decided to use an LRU cache, because LRU is a good
> general-purpose eviction policy that works well when access patterns show
> temporal locality, which is common in this kind of workload. I set the size
> to 512 entries — this felt like a reasonable balance between memory usage and
> hit rate, though of course you may want to tune it. Hope this helps!

*After:*
> Added an LRU cache at `store/cache.py`, 512 entries — sized to fit the hot
> key set from the access logs. Tune `CACHE_SIZE` if that estimate is off.

Same decisions, same tunable surfaced. Gone: the preamble, the LRU tutorial,
the hedge, the sign-off.

### Protected content survives

*Wrong:*
> Done — tests pass.

*Right:*
> Done. `pytest tests/ -q` → 41 passed locally; CI not run.

Four extra words, and the difference between a true statement and one the user
will discover is false.
