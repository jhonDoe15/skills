# Synthetic fixture: retry-safe payment capture

This fixture is fictional and contains no company code, systems, or tooling.
Treat the snapshot as repository evidence at immutable revision
`1111111111111111111111111111111111111111`.

## Ticket PAY-42

Make `capturePayment` safe when callers retry the same `requestId`.

- One logical request must create at most one external charge, including
  concurrent retries and a process crash after the gateway accepts a charge.
- Preserve the public `Promise<{ chargeId, status }>` result.
- The gateway supports an idempotency key.
- The SQL store supports transactions and unique constraints.
- Do not change retry policy in callers.

## Repository snapshot

```text
src/payment-service.js
src/sql-payment-store.js
db/001-payments.sql
test/payment-service.test.js
package.json
```

### `src/payment-service.js`

```js
async function capturePayment(request, { gateway, payments }) {
  const prior = await payments.findByRequestId(request.requestId);
  if (prior) return prior.result;

  const result = await gateway.capture({ amount: request.amount });
  await payments.insert({ requestId: request.requestId, result });
  return result;
}

module.exports = { capturePayment };
```

### `src/sql-payment-store.js`

```js
class SqlPaymentStore {
  constructor(db) {
    this.db = db;
  }

  async findByRequestId(requestId) {
    return this.db.oneOrNone(
      'select request_id, result from payments where request_id = $1',
      [requestId],
    );
  }

  async insert(payment) {
    return this.db.none(
      'insert into payments(request_id, result) values ($1, $2)',
      [payment.requestId, payment.result],
    );
  }
}

module.exports = { SqlPaymentStore };
```

### `db/001-payments.sql`

```sql
create table payments (
  id bigint generated always as identity primary key,
  request_id text not null,
  result jsonb not null
);
```

### `test/payment-service.test.js`

```js
test('returns the gateway result', async () => {
  const result = await capturePayment(
    { requestId: 'req-1', amount: 1250 },
    fixtureDependencies(),
  );

  assert.deepEqual(result, { chargeId: 'ch-1', status: 'captured' });
});
```

### `package.json`

```json
{
  "scripts": {
    "test:payment": "node --test test/payment-service.test.js",
    "test": "node --test"
  }
}
```

## Known caller behavior

`checkout.js` retries transient failures with the same `requestId`. No other
caller invokes `capturePayment`.
