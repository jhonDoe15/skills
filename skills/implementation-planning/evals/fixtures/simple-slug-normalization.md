# Synthetic fixture: bounded slug normalization

This fixture is fictional and contains no company code, systems, or tooling.
Treat the snapshot as repository evidence at immutable revision
`4444444444444444444444444444444444444444`.

## Ticket SLUG-4

Normalize product slugs consistently.

- Inputs are always ASCII strings.
- Trim surrounding whitespace.
- Lowercase letters.
- Collapse each run of whitespace or hyphens into one hyphen.
- Preserve the exported `normalizeSlug(value)` function and string result.
- No configuration or new dependency is needed.

## Repository snapshot

```text
src/normalize-slug.js
test/normalize-slug.test.js
package.json
```

### `src/normalize-slug.js`

```js
function normalizeSlug(value) {
  return value.replace(/\s+/g, '-');
}

module.exports = { normalizeSlug };
```

### `test/normalize-slug.test.js`

```js
test('replaces spaces with hyphens', () => {
  assert.equal(normalizeSlug('two words'), 'two-words');
});
```

### `package.json`

```json
{
  "scripts": {
    "test:slug": "node --test test/normalize-slug.test.js",
    "test": "node --test"
  }
}
```

## Repository constraints

`normalizeSlug` has one caller, which passes a validated string. No other file
contains slug policy.
