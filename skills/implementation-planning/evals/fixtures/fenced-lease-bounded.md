# Synthetic repository snapshot: LEASE-7

This fixture is fictional and contains no company code, systems, or tooling.
Treat the snapshot as repository evidence at immutable revision
`7777777777777777777777777777777777777777`.

## Ticket

Replace the private in-memory `LeaseRegistry` Boolean API with fenced leases.

- `acquire(key, ttlMs)` returns a frozen `{ token, expiresAt }`, or `null` while
  the key has an unexpired lease.
- Expiry permits reacquisition with a higher token for the same key.
- `renew(key, token, ttlMs)` returns a frozen lease only for the current
  unexpired token; otherwise it returns `null`.
- `release(key, token)` deletes only the current matching lease and returns
  whether it did so.
- TTL must be a positive integer. Invalid TTL throws `RangeError` before state
  changes.
- The constructor-injected `now()` controls time. Tests must not sleep.
- Persistence, distributed coordination, rollback handling, numeric exhaustion,
  and behavior outside ordinary synchronous clock callbacks are out of scope.

Acceptance requires deterministic public-seam tests for acquisition, expiry,
renewal, stale-worker safety, release, TTL validation, and immutability.

## Repository snapshot

- The package is private and has one caller: `test/lease-registry.test.js`.
- `src/lease-registry.js` owns an injected clock and an in-memory `Map`.
- There are no asynchronous paths, external callers, schemas, jobs, timers, or
  persistence.
- `npm test` is the verified noninteractive command.
