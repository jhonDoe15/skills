# Callback authentication contract

Immutable revision: `ffffffffffffffffffffffffffffffffffffffff`

## Ticket CALLBACK-18

Authenticate partner callbacks before parsing or applying them. Preserve the successful `202 { accepted: true }` response.

Partner documentation says only, "Requests are signed." It does not define the authenticating boundary, credential type, signature fields, canonical representation, algorithm, signer selection, failure response, replay identity, time tolerance, credential reference, or rotation overlap.

## Security requirements

- No parsing or business effect occurs before authenticated identity is established.
- Verification follows an authoritative partner contract.
- Selected credential material is resolved by reference through the approved provider and never enters source, config values, diagnostics, errors, fixtures, or responses.
- Replay behavior requires an explicit requirement-owner decision.
- Authenticated valid callbacks retain the existing success response and business behavior.

## Repository snapshot

`callback-route.js` parses `request.body`, calls `callbacks.apply`, and returns the success response.

`composition.js` creates a secret provider exposing `resolve(reference)`, but no evidence states credential kind, versions, or rotation behavior.

It is unknown whether the HTTP adapter preserves exact raw bytes and all authentication metadata.

`package.json` defines `test:callbacks` as `node --test test/callback-route.test.js` and `test` as `node --test`.

## Owners

The partner-integration owner controls authentication and replay behavior. The HTTP-platform owner controls ingress capability evidence. Partner-integration and secret-platform owners control credential and rotation evidence.
