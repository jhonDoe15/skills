# Seat reservation atomicity

Immutable revision: `cccccccccccccccccccccccccccccccccccccccc`

## Ticket SEAT-27

Prevent concurrent reservations from confirming more seats than remain. Preserve `reserveSeats(showId, count, dependencies)` and its successful `{ reservationId, status: "confirmed" }` result.

The documented seat-store adapter exposes only `getRemaining(showId)` and `setRemaining(showId, count)`. No transaction, conditional update, compare-and-set, lock, or atomic decrement capability is documented.

## Repository snapshot

`src/reserve-seats.js`

```js
async function reserveSeats(showId, count, { seatStore, ids }) {
  if (count <= 0) throw new RangeError('count must be positive');

  const remaining = await seatStore.getRemaining(showId);
  if (remaining < count) throw new Error('sold out');

  await seatStore.setRemaining(showId, remaining - count);
  return {
    reservationId: ids.next(),
    status: 'confirmed',
  };
}

module.exports = { reserveSeats };
```

`test/reserve-seats.test.js` covers invalid counts, one successful reservation, and an already-sold-out show. It has no concurrent test.

`package.json` defines `test:seats` as `node --test test/reserve-seats.test.js`.

## Owners

The Reservation Product Owner owns the no-overselling requirement. The Seat Store Adapter Owner owns datastore capability evidence. Two callers can currently read the same remaining count before either writes.
