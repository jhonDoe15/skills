# Thumbnail worker workspace cleanup

Immutable revision: `3456734567345673456734567345673456734567`

## Ticket THUMB-31

Make the queued thumbnail worker clean temporary workspaces safely.

- Each delivery creates a private workspace under the configured temporary root.
- Successful and failed attempts try to remove their workspace.
- At startup, remove prior session directories older than six hours.
- A successful object write remains successful if workspace removal fails.
- Preserve queue retry and dead-letter behavior.
- Add bounded operational telemetry without changing `enqueueThumbnail`.

## Queue and dependency contracts

- Delivery is at-least-once and preserves `job.id`; resolution acknowledges and rejection retries.
- `PermanentJobError` dead-letters.
- Only `UnsupportedImageError` is documented permanent.
- `objects.put(key, file)` atomically replaces and is repeat-safe for one key.
- One worker process exclusively owns each temporary root.
- Startup cleanup failure does not prevent registration.
- Primary processing error takes precedence over cleanup error.
- Job IDs and paths may appear in logs but not metric labels.

## Repository snapshot

`thumbnail-worker.js` creates `thumb-*`, resizes into it, writes `thumbnails/{assetId}/{revision}.jpg`, removes the workspace, and logs success. Cleanup currently occurs only after object storage succeeds.

`worker-main.js` directly registers the handler.

`package.json` defines `test:thumbnail` and full Node test commands.

## Test seams

Filesystem, processor, object store, logger, metrics, clock, and startup are injectable. Tests can use deferred operations without real time or disk.
