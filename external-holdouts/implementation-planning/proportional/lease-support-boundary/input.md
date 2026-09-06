# Bounded fenced leases

Immutable revision: `2222222222222222222222222222222222222222`

## Ticket LEASE-7

Replace the private in-memory `LeaseRegistry` Boolean API with fenced leases.

- `acquire(key, ttlMs)` returns a frozen `{ token, expiresAt }`, or `null` while
  that key has an unexpired lease.
- Expiry permits reacquisition with a higher token for the same key.
- `renew(key, token, ttlMs)` succeeds only for the current unexpired token.
- `release(key, token)` deletes only the current matching lease.
- TTL is a positive integer; invalid values throw `RangeError` before mutation.
- Constructor-injected `now()` controls deterministic tests.
- Persistence, distributed coordination, clock rollback, numeric exhaustion,
  and behavior outside ordinary synchronous clock callbacks are out of scope.

Acceptance covers acquisition, same-key expiry and succession, renewal,
stale-token safety, release, TTL atomicity, and immutable results.

## Repository snapshot

The private package has one source module and one direct test. `LeaseRegistry`
owns an injected clock and an in-memory `Map`. There are no asynchronous paths,
external callers, schemas, timers, jobs, or persistence.

The repository commands are `node --test test/lease-registry.test.js` and
`npm test`.
