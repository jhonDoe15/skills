# Fenced in-memory leases

The scheduler must prevent a worker whose lease expired from releasing or
renewing a newer worker's lease.

Requirements:

1. `LeaseRegistry.acquire(key, ttlMs)` returns an immutable lease containing a
   monotonically increasing numeric token and absolute `expiresAt`, or `null`
   while an unexpired lease exists.
2. An expired lease does not block acquisition. Reacquisition receives a higher
   token.
3. `renew(key, token, ttlMs)` succeeds only for the current unexpired token and
   returns the renewed immutable lease; otherwise it returns `null`.
4. `release(key, token)` returns `true` and removes only the matching current
   lease. A stale or unknown token returns `false`.
5. `ttlMs` must be a positive integer. Invalid values throw `RangeError` before
   state changes.
6. Time comes from an injected `now()` dependency so tests do not wait.

The implementation remains in memory. Persistence, distributed coordination,
and wall-clock rollback handling are out of scope.
