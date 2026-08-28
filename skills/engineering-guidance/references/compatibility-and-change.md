# Compatibility and change

Use this fallback only when repository authority leaves compatibility
uncovered.

- Identify affected consumers, persisted data, protocols, and operational
  procedures.
- Preserve existing behavior unless the requirement authorizes its change.
- Make versioning, rollout, rollback, and migration steps explicit when needed.
- Prefer staged expand-and-contract changes across independently deployed
  boundaries.
- Stop when the work needs an unapproved migration or release decision.
