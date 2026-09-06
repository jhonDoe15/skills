# Compatibility and change

Use this fallback only when repository authority leaves compatibility
uncovered.

- Identify affected consumers, persisted data, protocols, and operational
  procedures.
- Preserve existing behavior unless the requirement authorizes its change.
- Make versioning, rollout, rollback, and migration steps explicit when needed.
- Prefer staged expand-and-contract changes across independently deployed
  boundaries.
- Record an unapproved migration or release decision and its effect as an
  unresolved gap; continue assessing concerns supported by the available context.
