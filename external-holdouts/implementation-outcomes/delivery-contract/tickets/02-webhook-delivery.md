# Add webhook delivery

## What to build

Add `deliverWebhook` as a vertical adapter using the stable delivery
result/error contract produced by ticket `01-stable-email-result`.

## Acceptance criteria

- The injected provider receives `{ event, payload }`.
- Success returns the stable result with channel `webhook`.
- Provider-specific fields remain hidden.
- Provider failures become `DeliveryError` with the original cause.

## Blocked by

- `01-stable-email-result`, whose exported result/error contract this adapter
  consumes.
