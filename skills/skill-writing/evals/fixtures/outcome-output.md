Created `skills/deployment-triage/SKILL.md` and
`skills/deployment-triage/scripts/normalize-health-check`.

```markdown
---
name: deployment-triage
description: Deployment triage for failed health checks; used after a failed result and excluded from deployment mutation or remediation authorization.
---

# Deployment Triage

1. Confirm the deployment health check reports failed.
2. Read the health-check command, service owner, and rollback authorization from the deployment manifest.
3. Execute `scripts/normalize-health-check <health-check.json>` and read its stable boundary summary. Stop and report its declared failure when normalization fails.
4. If the failing boundary is localized, report the boundary and supporting observation, then invoke `incident-investigation`.
5. If the boundary is not localized, report the missing evidence and smallest next check.
6. Complete after reporting the applicable branch and result.
```

Justification: the sequence recurs across three repositories, no existing Skill owns the deployment-specific trigger, and environment facts remain in the deployment manifest. `incident-investigation` owns the investigation itself.

Representation: deployment judgment stays in `SKILL.md`; deterministic,
fixed-order JSON normalization with explicit input, output, and failures lives
in the directly invoked script.

Mechanics: canonical frontmatter, `name: deployment-triage`, ordered steps,
the `incident-investigation` dependency, script pointer, and script execution
fixtures passed structural checks.

Behavioral evidence: unverified. Matched fresh-session Skill and No-Skill cases are defined, but no model campaign was run.

Limits: no installation, publication, deployment mutation, host-support claim, or model-support claim was made.
