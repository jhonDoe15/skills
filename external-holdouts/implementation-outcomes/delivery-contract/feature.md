# Stable notification delivery results

Notification callers need one stable result contract across delivery adapters.

Requirements:

1. A successful delivery result is an immutable object with
   `{ channel, destination, providerId }`.
2. Provider failures are translated to `DeliveryError` with stable `channel`,
   `destination`, and `cause` properties.
3. Existing email delivery adopts the stable result without changing how its
   provider is called.
4. A webhook adapter sends `{ event, payload }` through an injected provider and
   uses the same result/error contract.
5. Adapter-specific provider response shapes and errors remain hidden from
   callers.

Retries, persistence, batching, authentication, and provider selection are out
of scope.
