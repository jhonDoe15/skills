---
name: deployment-triage
description: Deployment triage for a failed health check; used after the failed result is observed and excluded from mutation or remediation requests.
---

# Deployment Triage

1. Confirm that the deployment health check reports failed.
2. If the failing boundary is localized, report the boundary and supporting observation, then invoke `incident-investigation`.
3. If the boundary is not localized, read `references/failure-path.md` and report the missing evidence and smallest next check.
4. Complete after reporting the applicable branch and its result.

Mechanics: frontmatter fields, ordered steps, `incident-investigation`, and the conditional `references/failure-path.md` pointer are structurally valid and resolvable.

Behavioral evidence: not evaluated by Skill Mechanics.
