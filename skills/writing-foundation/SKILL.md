---
name: writing-foundation
description: Shared writing behavior consumed by to-humans and agent-writing; not a user-facing outcome.
---

# Writing Foundation

## Interface

Apply writing behavior that remains unchanged across audiences.

Accepted context:

- the requested artifact and its purpose;
- requirements and exclusions;
- supplied evidence, source material, and unresolved claims;
- authoritative terminology;
- existing code, schemas, literals, formats, and other work products;
- constraints supplied by the consuming Skill.

Guarantees:

- every required item is represented or explicitly unresolved;
- claims stay grounded in the available evidence;
- material uncertainty remains visible;
- structure follows the artifact's purpose and relationships;
- authoritative terminology keeps its exact meaning;
- each included part bears on the requested artifact;
- code and other non-prose work products retain their execution semantics;
- writing instructions remain only when they have an observable behavioral
  purpose.

This Skill does not choose an audience, route a public outcome, set
audience-specific voice or depth, define Agent Skill mechanics, or construct a
fresh-context handoff. It has no Skill dependencies.

## Apply the shared contract

1. **Account for the request.** List the required content, exclusions, source
   constraints, terminology authorities, and work-product boundaries. Give
   each requirement one disposition: present, explicitly excluded, or
   unresolved.
2. **Ground the artifact.** Tie factual claims to supplied or verified sources.
   Separate observation, inference, recommendation, and unknown. Preserve
   conflicts instead of selecting an unsupported answer.
3. **Shape for purpose.** Order content by the artifact's actual relationships:
   sequence for procedures, hierarchy for nested concepts, and comparison only
   for genuine alternatives. Preserve requested formats and valid existing
   structure.
4. **Protect terminology and work products.** Reuse authoritative names
   exactly. Keep code, commands, schemas, identifiers, quotations, and
   machine-readable values unchanged unless the request explicitly requires
   their modification.
5. **Prune behaviorally.** For each instruction or passage, identify the
   requirement, decision, or observable behavior it serves. Remove duplication,
   stale or derivable context, irrelevant exposition, and guidance that does
   not change the result. Compression never removes required coverage,
   evidence, uncertainty, or work-product semantics.

## Failure behavior

When required context is absent, mark the affected item unresolved and state
the smallest evidence or decision needed. When authorities conflict, preserve
the conflict and identify which decision blocks completion. Never manufacture
grounding, terminology, certainty, or artifact content to make the result look
complete.

Return control to the consuming Skill with the unresolved items. The consumer
decides its audience-specific failure or continuation branch.

## Completion

Complete only when:

- every requirement and exclusion has a disposition;
- every material claim is grounded or marked as observation, inference,
  recommendation, or unknown;
- uncertainty and authority conflicts are visible;
- structure serves the artifact's purpose;
- authoritative terminology and work-product semantics are preserved; and
- every retained passage has a named relevance or observable behavioral
  purpose.
