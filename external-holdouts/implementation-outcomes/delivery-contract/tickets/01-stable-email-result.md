# Introduce the stable delivery result through email

## What to build

Introduce the shared delivery result/error contract and make the existing email
adapter return it while preserving the provider call.

## Acceptance criteria

- Email success returns the immutable stable result.
- Email provider failures become `DeliveryError` with the original cause.
- Provider-specific response fields do not escape.
- The existing provider receives the same recipient, subject, and body.

## Blocked by

None.
