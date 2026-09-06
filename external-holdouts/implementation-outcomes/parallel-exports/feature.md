# Order exports

Operations users need two independently deliverable order export formats.

Requirements:

1. JSON export returns a JSON array containing only `id`, `totalCents`, and
   `status`, preserving input order.
2. CSV export returns the header `id,total_cents,status` and RFC 4180-compatible
   rows, including quotes escaped by doubling.
3. Both exporters reject non-array input with `TypeError`.
4. Neither exporter mutates input orders.
5. Each format is independently importable and testable. A shared framework or
   registry is not required.

Database access, file writing, streaming, and additional formats are out of
scope.
