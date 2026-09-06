# Invoice event crash recovery

Immutable revision: `5555555555555555555555555555555555555555`

## Ticket BILL-64

Make invoice creation and `invoice.created` publication safe under concurrent requests, publisher retries, late broker settlement, and process crashes.

- Concurrent calls with one `requestKey` create one canonical invoice.
- Preserve `createInvoice(input)` returning `Promise<{ id, total, status: "open" }>`.
- Every committed invoice eventually produces one logical event.
- Callers do not publish or retry events.
- The broker accepts a caller-supplied deduplication key and suppresses repeated keys for 30 days.
- Outbox entries expire or escalate after seven days.
- A publish may succeed and then time out or settle after its worker lease expires.

The database supports transactions, unique constraints, row locks, and conditional updates.

## Repository snapshot

`src/invoice-service.js`

```js
async function createInvoice(input, { invoices, broker }) {
  const invoice = await invoices.insert({
    requestKey: input.requestKey,
    total: input.total,
    status: 'open',
  });
  await broker.publish('invoice.created', invoice);
  return invoice;
}
```

`src/invoice-publisher.js` lists unpublished invoices, publishes each, then marks it published.

`db/001-invoices.sql` defines an identity primary key, non-null `request_key`, `total`, `status`, and nullable `published_at`; `request_key` is not unique.

Existing tests cover one successful create and one successful publication. `package.json` defines `test:billing` as `node --test test/invoice-*.test.js` and `test` as `node --test`.

## Authority and constraints

The ticket controls request identity, event semantics, retry ownership, retention, and public compatibility. Database and broker capabilities are verified. A timeout is an unknown publication outcome.
