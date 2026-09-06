# Add JSON order export

## What to build

Add an independently importable `exportOrdersAsJson(orders)` function that
satisfies the JSON behavior in the feature specification.

## Acceptance criteria

- Output contains only the specified fields in input order.
- Non-array input throws `TypeError`.
- Input orders remain unchanged.

## Blocked by

None.
