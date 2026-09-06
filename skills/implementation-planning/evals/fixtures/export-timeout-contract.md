# Synthetic fixture: unresolved export timeout contract

This fixture is fictional and contains no company code, systems, or tooling.
Treat the snapshot as repository evidence at immutable revision
`6666666666666666666666666666666666666666`.

## Ticket EXPORT-12

Cancel exports that run longer than five seconds without breaking callers.

- Preserve the exported `runExport(report, dependencies)` function.
- `download.js` expects renderer failures to reject.
- `preview.js` wants a timeout to return the latest partial bytes.
- The ticket does not select rejection, a sentinel result, or partial bytes as
  the timeout contract.
- The renderer currently accepts no cancellation signal and may continue
  writing after its promise loses a timeout race.

## Repository snapshot

```text
src/run-export.js
src/download.js
src/preview.js
test/run-export.test.js
package.json
```

### `src/run-export.js`

```js
async function runExport(report, { renderer }) {
  return renderer.render(report);
}

module.exports = { runExport };
```

### `src/download.js`

```js
async function download(report, dependencies) {
  const bytes = await runExport(report, dependencies);
  return response(bytes);
}
```

### `src/preview.js`

```js
async function preview(report, dependencies) {
  return runExport(report, dependencies);
}
```

### `test/run-export.test.js`

```js
test('returns rendered bytes', async () => {
  const bytes = Buffer.from('complete');
  assert.equal(
    await runExport(report(), { renderer: fakeRenderer(bytes) }),
    bytes,
  );
});
```

### `package.json`

```json
{
  "scripts": {
    "test:export": "node --test test/run-export.test.js",
    "test": "node --test"
  }
}
```

## Repository constraints

There is no clock abstraction, partial-result type, cancellation protocol, or
documented five-second configuration owner.
