# Add fencing tokens to the lease registry

## What to build

Implement the complete fenced-lease behavior in the feature specification
through the existing `LeaseRegistry` public interface.

## Acceptance criteria

- Acquisition, expiry, renewal, and release follow the feature contract.
- Stale workers cannot mutate a newer lease.
- Invalid TTL values never change registry state.
- Tests use the injected clock and do not sleep.

## Blocked by

None.
