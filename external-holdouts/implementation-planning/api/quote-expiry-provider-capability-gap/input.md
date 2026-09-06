# Provider quote-expiry capability

Immutable revision: `2345623456234562345623456234562345623456`

## Ticket QUOTE-74

Add `expiresAt` to every successful shipping quote.

- Preserve exported `getQuote(parcel, dependencies)`.
- Preserve `amount` and `currency`.
- The desired value is an RFC3339 UTC timestamp after which the provider no longer honors the rate.
- The ticket does not define behavior when expiry is absent, invalid, or not guaranteed.
- No local lifetime or fallback duration is authorized.
- ParcelFlux remains the provider.

## Repository snapshot

`get-quote.js` maps provider `amount` and `currency` to the public result.

`parcel-flux-adapter.js` maps HTTP response `total` and `currency`.

Sandbox examples sometimes include `"valid_until": "2026-09-04T11:30:00Z"` and sometimes omit it. A provider overview says it "may be returned for selected services" but defines no presence guarantee, timezone, format, inclusivity, or booking semantics.

Public API policy classifies an optional additive property without semantic changes as minor. A mandatory property or new failure requires compatibility-owner review and may require a new major.

`package.json` defines `test:quote` and full Node test commands.

## Authority

The API product owner controls public behavior when guaranteed expiry is unavailable. The integration owner controls provider capability evidence. Sandbox observations are descriptive, not normative.
