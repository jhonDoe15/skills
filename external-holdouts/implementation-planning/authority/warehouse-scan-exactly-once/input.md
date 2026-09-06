# Indistinguishable warehouse scans

Immutable revision: `bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb`

## Ticket SCAN-18

Apply every physical warehouse scan exactly once despite receiver retries. Preserve the successful `{ accepted: true }` result.

- The receiver retries the same payload after an acknowledgement is lost.
- A legitimate second scan may have the same SKU, bin, quantity, operator, and second-resolution timestamp.
- Payloads contain no scan ID, delivery ID, sequence, or attempt identity.
- No durable identity, ordering guarantee, uniqueness schema, or transport deduplication guarantee exists.

## Repository snapshot

`src/record-scan.js`

```js
async function recordScan(scan, { inventory, audit }) {
  if (scan.quantity <= 0) throw new RangeError('quantity must be positive');
  await inventory.increment(scan.sku, scan.bin, scan.quantity);
  await audit.append(scan);
  return { accepted: true };
}

module.exports = { recordScan };
```

`test/record-scan.test.js` verifies that non-positive quantities reject before inventory or audit effects.

## Owners

The Warehouse Intake Product Owner owns the delivery guarantee. The Scanner Protocol Owner owns evidence about stable source identity. Existing payloads cannot distinguish a retried delivery from a second byte-identical physical scan.
