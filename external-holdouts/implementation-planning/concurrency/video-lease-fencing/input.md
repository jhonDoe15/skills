# Lease-fenced rendition jobs

Immutable revision: `4444444444444444444444444444444444444444`

## Ticket VIDEO-27

Make rendition processing safe under duplicate delivery, lease expiry, worker crashes, and cancellation.

- The queue provides at-least-once delivery and owns retry timing.
- Only the current attempt may commit rendition bytes.
- A successful cancellation acknowledgement is terminal.
- A crash after completion commits but before queue acknowledgement must not render or commit again.
- Preserve `getRendition(assetId)` results: `{ status: "pending" | "ready" | "cancelled", bytes?: Buffer }`.
- Rendering accepts an `AbortSignal` but may resolve after abort.

PostgreSQL supports transactions, row locking, conditional updates, and monotonically increasing integer columns.

## Repository snapshot

`src/rendition-worker.js`

```js
async function processRendition(job, { renderer, renditions, queue }) {
  const existing = await renditions.get(job.assetId);
  if (existing?.status === 'ready') {
    await queue.ack(job.id);
    return;
  }
  await renditions.markRunning(job.assetId);
  const bytes = await renderer.render(job.source);
  await renditions.saveReady(job.assetId, bytes);
  await queue.ack(job.id);
}

async function cancelRendition(assetId, { renditions }) {
  await renditions.markCancelled(assetId);
}
```

`src/rendition-store.js` currently stores `asset_id`, `status`, and `bytes`; `markRunning`, `saveReady`, and `markCancelled` are unconditional state updates.

`src/rendition-api.js` maps absent/running to `pending`, ready rows to bytes, and cancelled rows to `cancelled`.

`package.json` defines `test:rendition` as `node --test test/rendition-worker.test.js` and `test` as `node --test`.

## Authority and constraints

The ticket owns lifecycle, cancellation, retry ownership, and public results. PostgreSQL and renderer capabilities above are verified. Queue retry timing remains outside the rendition module.
