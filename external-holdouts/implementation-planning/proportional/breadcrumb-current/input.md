# Mark the current breadcrumb

Immutable revision: `3333333333333333333333333333333333333333`

## Ticket NAV-09

In `renderTrail`, add `aria-current="page"` to the `<span>` at `currentIndex`.

- No other span receives the attribute.
- Preserve labels, separators, ordering, and the function signature.
- Callers guarantee that `currentIndex` is valid; add no invalid-index behavior.
- Add no DOM library, framework, accessibility package, or dependency.
- Change the renderer and its direct test only.

## Repository snapshot

`package.json`

```json
{
  "scripts": { "test": "vitest run" },
  "devDependencies": { "typescript": "5.6.3", "vitest": "2.1.1" }
}
```

`src/breadcrumb.ts`

```typescript
export function renderTrail(
  labels: readonly string[],
  currentIndex: number,
): string {
  return labels.map((label) => `<span>${label}</span>`).join(" / ");
}
```

`test/breadcrumb.test.ts`

```typescript
import { expect, test } from "vitest";
import { renderTrail } from "../src/breadcrumb";

test("renders breadcrumb labels", () => {
  expect(renderTrail(["Home", "Docs", "API"], 1)).toBe(
    "<span>Home</span> / <span>Docs</span> / <span>API</span>",
  );
});
```

## Authority and commands

The ticket controls the exact attribute and exclusions. `package.json` defines the test command. The exact-output test defines preserved serialization. The repository command is `npm test`.
