Created `skills/deployment-triage/SKILL.md` and
`skills/deployment-triage/scripts/normalize-health-check`.

The Skill is justified: the sequence recurs across three repositories, no existing Skill owns the deployment-specific routing boundary, and cheap facts remain lookups in the deployment manifest. `incident-investigation` remains the owner of investigation behavior.

The contract activates after a failed deployment health check, invokes the
normalization script for deterministic parsing, reports the observed boundary
and next authorized investigation, branches on whether the boundary is
localized, and completes only after reporting the applicable branch. Sequence
freedom is low, evidence selection is medium, and wording freedom is high.
Deployment judgment remains in `SKILL.md`; fixed-order normalization is in the
script with explicit input, output, and failure behavior.

Authoring used `agent-writing`, `skill-mechanics`, and `skill-evaluation`; `writing-foundation` was reached through Agent Writing. No dependency behavior was copied.

Mechanics: canonical frontmatter, named dependency, ordered steps, executable
script pointer, and direct reference pointers passed structural checks. Script
input, output, and failure fixtures passed.

Behavioral evidence: unverified. Fresh matched Skill and No-Skill cases are defined, but no model runs were performed.
