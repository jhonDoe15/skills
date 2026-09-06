# Opt-in product-search pagination

Immutable revision: `0123456789abcdef0123456789abcdef01234567`

## Ticket PRODUCT-31

Extend `ProductClient.search(term, options?)` with opt-in cursor pagination.

- Calls without `options.pagination` still request `GET /v1/products` with only `q` and return an object whose only own property is `items`.
- New callers may pass `{ pagination: { limit, cursor? } }`.
- `limit` is an integer from 1 through 100; invalid values reject with `TypeError` before I/O.
- Cursor values are opaque and passed unchanged.
- Paginated calls return `{ items, nextCursor? }`.
- Include `nextCursor` only for a non-empty response `next_cursor` string.
- Preserve the exported class and existing error propagation.
- Release metadata is managed elsewhere.

## Repository snapshot

`src/product-client.js`

```js
class ProductClient {
  constructor(transport) {
    this.transport = transport;
  }

  async search(term) {
    const payload = await this.transport.get('/v1/products', { q: term });
    return { items: payload.items };
  }
}
```

The TypeScript declaration exposes `search(term: string): Promise<SearchResult>` where `SearchResult` contains only `items`.

Public API policy permits explicit opt-in optional parameters on the current major when old calls are unchanged, classifies them as SemVer minor, and reserves major routes for incompatible behavior. Package versions are release-owned.

`package.json` defines `test:product-client` and `test` with Node's test runner.

## Authority

The ticket controls behavior and validation. Public API policy controls compatibility classification. Declarations constrain the published API. The transport accepts arbitrary query objects.
