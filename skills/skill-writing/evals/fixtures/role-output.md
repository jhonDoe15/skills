Created `skills/deployment-triage/SKILL.md`.

The Skill is justified: the sequence recurs across three repositories, no existing Skill owns the deployment-specific routing boundary, and cheap facts remain lookups in the deployment manifest. `incident-investigation` remains the owner of investigation behavior.

The contract activates after a failed deployment health check, reports the observed boundary and next authorized investigation, branches on whether the boundary is localized, and completes only after reporting the applicable branch. Sequence freedom is low, evidence selection is medium, and wording freedom is high.

Authoring used `agent-writing`, `skill-mechanics`, and `skill-evaluation`; `writing-foundation` was reached through Agent Writing. No dependency behavior was copied.

Mechanics: canonical frontmatter, named dependency, ordered steps, and direct reference pointers passed structural checks.

Behavioral evidence: unverified. Fresh matched Skill and No-Skill cases are defined, but no model runs were performed.
