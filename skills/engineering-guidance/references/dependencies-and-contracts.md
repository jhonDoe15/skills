# Dependencies and contracts

Use this fallback only when repository authority leaves a dependency or contract
concern uncovered.

- Make external dependencies and side effects explicit at module seams.
- Keep core logic independent of infrastructure construction and lifecycle.
- Compose concrete dependencies at an outer entry point using the repository's
  established mechanism.
- Preserve the same domain types, interfaces, and core execution paths in
  production and tests.
- Substitute test adapters only at explicit effectful seams. Do not recreate
  production behavior with test-only structures.
- Where practical, run the same contract checks against test and production
  adapters.
