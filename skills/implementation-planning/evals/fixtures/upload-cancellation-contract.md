# Synthetic fixture: unresolved upload cancellation

This fixture is fictional and contains no company code, systems, or tooling.
Treat the snapshot as repository evidence at immutable revision
`8888888888888888888888888888888888888888`.

## Ticket UPLOAD-15

Allow callers to cancel an upload after five seconds without losing resumable
progress or leaving abandoned storage.

- `editor.js` expects cancellation to remove partial data.
- `offline-sync.js` expects cancellation to preserve resumable progress.
- The ticket does not define caller-selectable modes or one controlling policy.
- The storage client exposes only `put(key, stream)` and returns a location.
- No abort, multipart, resume token, cleanup, or partial-retention capability is
  documented.
- Preserve the successful `{ location }` result.

## Repository snapshot

```text
src/upload-file.js
src/editor.js
src/offline-sync.js
test/upload-file.test.js
package.json
```

### `src/upload-file.js`

```js
async function uploadFile(file, { storage }) {
  const location = await storage.put(file.name, file.stream);
  return { location };
}

module.exports = { uploadFile };
```

### `src/editor.js`

```js
async function attach(file, dependencies) {
  return uploadFile(file, dependencies);
}
```

### `src/offline-sync.js`

```js
async function sync(file, dependencies) {
  return uploadFile(file, dependencies);
}
```

### `test/upload-file.test.js`

```js
test('returns the stored location', async () => {
  assert.deepEqual(
    await uploadFile(file(), { storage: fakeStorage('/files/a') }),
    { location: '/files/a' },
  );
});
```

### `package.json`

```json
{
  "scripts": {
    "test:upload": "node --test test/upload-file.test.js",
    "test": "node --test"
  }
}
```

## Repository constraints

There is no timeout owner, cancellation result, storage lifecycle state, cleanup
job, or retention authority in the snapshot.
