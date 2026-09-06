# Synthetic fixture: bounded stale-while-revalidate cache

This fixture is fictional and contains no company code, systems, or tooling.
Treat the snapshot as repository evidence at immutable revision
`2222222222222222222222222222222222222222`.

## Ticket CACHE-17

Add bounded stale-while-revalidate behavior to `MemoryCache#get`.

- Fresh entries return immediately.
- Entries up to 30 seconds past freshness return stale immediately and trigger
  one background refresh per key.
- Older entries block on one shared refresh.
- A failed background refresh keeps the stale value and is observable through
  the existing logger.
- Preserve the public `Promise<Value>` result and `get(key, loader)` signature.

## Repository snapshot

```text
src/memory-cache.js
test/memory-cache.test.js
package.json
```

### `src/memory-cache.js`

```js
class MemoryCache {
  constructor({ ttlMs, logger }) {
    this.ttlMs = ttlMs;
    this.logger = logger;
    this.entries = new Map();
  }

  async get(key, loader) {
    const entry = this.entries.get(key);
    if (entry && Date.now() < entry.expiresAt) return entry.value;

    const value = await loader();
    this.entries.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });
    return value;
  }
}

module.exports = { MemoryCache };
```

### `test/memory-cache.test.js`

```js
test('reuses a fresh value', async () => {
  const loader = countingLoader('new-value');
  const cache = new MemoryCache({ ttlMs: 1000, logger: fakeLogger() });

  assert.equal(await cache.get('a', loader), 'new-value');
  assert.equal(await cache.get('a', loader), 'new-value');
  assert.equal(loader.calls(), 1);
});
```

### `package.json`

```json
{
  "scripts": {
    "test:cache": "node --test test/memory-cache.test.js",
    "test": "node --test"
  }
}
```

## Repository constraints

- There is no shared scheduler abstraction.
- Tests currently use the real clock.
- `MemoryCache` is process-local; cross-process coordination is outside this
  ticket.
