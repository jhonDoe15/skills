# Deploy plan validation procedure

When a path to `deploy-plan.json` is supplied, keep the input read-only.
Report the observed validation result, selected valid or invalid branch, and exact `DAG frontier`.

1. Obtain the current schema command from the environment.
2. Validate the supplied file without changing it.

If validation is valid, report the `DAG frontier` with `{"maxAttempts":3}`.
If validation is invalid, report the failure and only then consult the remediation reference.

If the command, file, or result is unavailable, name the missing input and stop without inventing a result.
Complete only after the observed result and selected branch have been reported.
