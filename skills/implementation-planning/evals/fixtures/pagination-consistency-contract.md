# Synthetic fixture: unresolved pagination consistency

This fixture is fictional and contains no company code, systems, or tooling.
Treat the snapshot as repository evidence at immutable revision
`7777777777777777777777777777777777777777`.

## Ticket LIST-21

Make paginated entry listing stable when rows are inserted between page
requests, without changing `{ items, nextCursor }`.

- `audit-export.js` expects all pages to represent one stable collection.
- `live-feed.js` expects rows inserted after page one to appear on later pages.
- The ticket does not choose snapshot or live pagination semantics.
- The database adapter documents ordinary queries only; no cross-request
  snapshot capability is established.
- Cursor encoding and retention are not specified.

## Repository snapshot

```text
src/list-entries.js
src/audit-export.js
src/live-feed.js
test/list-entries.test.js
package.json
```

### `src/list-entries.js`

```js
async function listEntries({ after, limit }, { db }) {
  const items = await db.any(
    'select id, name from entries where id > $1 order by id limit $2',
    [after ?? 0, limit],
  );
  return {
    items,
    nextCursor: items.at(-1)?.id ?? null,
  };
}

module.exports = { listEntries };
```

### `src/audit-export.js`

```js
async function exportAll(dependencies) {
  return collectPages(listEntries, dependencies);
}
```

### `src/live-feed.js`

```js
async function loadMore(cursor, dependencies) {
  return listEntries({ after: cursor, limit: 20 }, dependencies);
}
```

### `test/list-entries.test.js`

```js
test('returns the next cursor', async () => {
  const result = await listEntries({ after: null, limit: 2 }, fixture());
  assert.equal(result.nextCursor, 2);
});
```

### `package.json`

```json
{
  "scripts": {
    "test:list": "node --test test/list-entries.test.js",
    "test": "node --test"
  }
}
```

## Repository constraints

No collection version, snapshot token, cursor schema, or retention policy exists.
