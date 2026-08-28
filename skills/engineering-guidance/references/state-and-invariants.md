# State and invariants

Use this fallback only when repository authority leaves state behavior
uncovered.

- Name valid states and the transitions between them.
- Keep the owner of each transition and invariant explicit.
- Reject or represent impossible combinations instead of relying on convention.
- Account for retries, interruption, concurrency, and partial progress only when
  the artifact can encounter them.
- Route specialist concurrency questions when general state reasoning is not
  enough.
