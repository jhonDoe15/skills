# Queued reindex feature rollback

Immutable revision: `4567845678456784567845678456784567845678`

## Ticket REINDEX-24

Roll out the V2 collection reindexer behind `reindex-v2`.

- Flag rollback affects every delivery that has not started indexing.
- A V2 operation already started may finish.
- A retried delivery re-evaluates the flag.
- Flag-read failure uses V1 and emits `flag_error` telemetry.
- Invalid collections dead-letter; transient backend failures retry.
- Preserve `scheduleReindex(collectionId): Promise<void>`.
- Never invoke both backends for one delivery.

## Capability evidence

The queue is at-least-once; rejection retries and `PermanentJobError` dead-letters. Both backend `replace(collectionId)` operations atomically replace an index generation and are repeat-safe. Backend documentation exposes only generic rejected promises and no stable invalid-collection or permanent/transient classifier. Metrics allow bounded `mode` and `outcome` labels; collection IDs appear only in logs.

## Repository snapshot

`scheduleReindex` currently reads the flag and publishes `{ collectionId, useV2 }`.

`handleReindex` chooses a backend from the queued `useV2`, calls `replace`, and logs completion.

`package.json` defines `test:reindex` and full Node test commands.

## Test seams

The flag client can return enabled, disabled, or rejected. Deferred backend promises establish operation boundaries. The queue harness can redeliver the same message.

The backend owner supplies authoritative failure-classification evidence.
