# Add CSV order export

## What to build

Add an independently importable `exportOrdersAsCsv(orders)` function that
satisfies the CSV behavior in the feature specification.

## Acceptance criteria

- Output has the required header and rows in input order.
- Commas, quotes, and line breaks are quoted; embedded quotes are doubled.
- Non-array input throws `TypeError`.
- Input orders remain unchanged.

## Blocked by

None.
