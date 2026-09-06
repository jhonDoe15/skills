# Mixed-client session API migration

Immutable revision: `1234512345123451234512345123451234512345`

## Ticket SESSION-58

Expose session expiry as an RFC3339 UTC string.

- `/v1/sessions/:id` currently returns `expiresAt` as integer epoch seconds.
- `/v2/sessions/:id` returns the same instant as an RFC3339 UTC string.
- V1 and V2 clients overlap for at least 45 days.
- Preserve V1 success body and error behavior byte-for-byte.
- V2 uses the same authorization, lookup, and not-found semantics.
- Both routes are served by the same deployment before any client migrates.
- V1 removal requires a later ticket and client-owner evidence.
- Existing access logs distinguish paths; no new telemetry platform is needed.
- No persistence or schema change is required.

## Repository snapshot

`session-handler.js` finds a session and returns `{ id, expiresAt: session.expiresAtEpochSeconds }`, or `404 { code: "not_found" }`.

`routes.js` registers only `/v1/sessions/:id`.

API versioning policy requires a new URI major version for response-type changes, distinct coexistence of supported majors, no undocumented negotiation, and separate authorization plus usage evidence for removal.

`expiresAtEpochSeconds` is the stored representation. `package.json` defines focused session API and full Node test commands.

## Authority

The ticket controls V2 behavior, overlap, ordering, and exclusions. API policy controls version selection and retirement. Client owners control later retirement evidence.
