# Job pause policy

Immutable revision: `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`

## Ticket BATCH-24

Add `pauseJob(jobId, dependencies)` without changing its successful `{ accepted: true }` result.

- `operations-dashboard.js` expects the active item to finish and pending items to remain queued.
- `safety-console.js` expects the active item to stop immediately and pending items to be discarded.
- The ticket does not choose a policy or define caller-selectable modes.

Both callers invoke `pauseJob(jobId, dependencies)` without a mode argument. The queue adapter supports both drain-and-retain and abort-and-purge.

## Repository snapshot

`src/pause-job.js`

```js
async function pauseJob(jobId, { queue }) {
  if (!jobId) throw new TypeError('jobId is required');
  await queue.pause(jobId);
  return { accepted: true };
}

module.exports = { pauseJob };
```

`test/pause-job.test.js` verifies that an empty job ID rejects before calling the queue.

`package.json` defines `test:pause` as `node --test test/pause-job.test.js`.

## Owners

The Batch Control Product Owner owns externally observable pause behavior. The Queue Adapter Owner owns capability evidence. Existing code does not establish precedence between caller expectations.
