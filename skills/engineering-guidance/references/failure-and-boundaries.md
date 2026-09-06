# Failure and boundaries

Use this fallback only when repository authority leaves failure behavior
uncovered.

- Define which inputs are accepted, rejected, or unresolved at each boundary.
- Keep error identity useful without exposing sensitive data.
- Distinguish atomic failure from partial success.
- State retry, recovery, cleanup, and idempotency expectations where they apply.
- Preserve the original failure instead of replacing it with a misleading
  fallback success.
