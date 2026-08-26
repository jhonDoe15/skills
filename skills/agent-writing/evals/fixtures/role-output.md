# Deployment status procedure

When `deploy-status.json` appears, keep it read-only.
Report the observed status, selected success or failure branch, and exact `DAG frontier`.

1. Obtain the retry limit from the environment.
2. Inspect `deploy-status.json` without changing it.

If deployment succeeded, report the observed status and frontier.
If deployment failed, report the failure and only then consult the troubleshooting reference.

If the file, retry limit, or result is unavailable, name the missing input and stop without inventing a result.
Complete only after the observed status and selected branch have been reported.
