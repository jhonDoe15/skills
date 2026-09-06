# Scratch janitor policy conflict

Immutable revision: `5678956789567895678956789567895678956789`

## Ticket SCRATCH-18

Make the periodic scratch-directory janitor safe to operate.

- Run every 60 seconds while `scratch-janitor` is enabled.
- Disabling the flag prevents new sweeps; an active sweep may finish.
- Sweeps do not overlap.
- One entry failure does not abort remaining entries.
- A root scan failure is reported and recovered on the next tick.
- `stop()` cancels future ticks but not an active sweep.
- Never traverse symbolic links.
- Emit one bounded sweep summary and contextual entry-failure logs.

## Conflicting requirements

Ticket requirement R7 says to delete matching `scratch-*` directories whose ownership marker is missing or malformed.

Linked `docs/scratch-format.md` requirement F4 says to retain those directories and emit `scratch_marker_invalid`.

Both agree that a valid marker with `expiresAt <= now` is deleted and an unexpired valid marker is retained. No precedence is declared.

## Repository snapshot

`scratch-janitor.js` uses an async `setInterval`, reads the flag, loops through `scratch-*`, parses `.scratch-owner.json`, and recursively removes expired entries. One scan, read, or parse failure currently rejects the callback.

`package.json` defines `test:janitor` and full Node test commands.

## Owners and seams

The SCRATCH-18 requirement owner controls marker policy or source precedence. Filesystem, clock, scheduler, flags, logs, and metrics are injectable; deferred operations can prove overlap and stop behavior.
