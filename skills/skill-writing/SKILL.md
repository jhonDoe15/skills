---
name: skill-writing
description: Agent Skill outcome for creating or revising Agent Skills; excludes general agent-facing artifacts, fresh-context handoffs, installation, publication, and marketplace operations unless separately requested.
---

# Skill Writing

## Interface

Create or revise an Agent Skill from:

- the requested user outcome, intended consumers, and current artifact;
- repository authority, existing Skills, recurring failures, and prior evidence;
- the environment and its cheap authoritative lookups;
- constraints on behavior, dependencies, files, tools, safety, and validation;
- the target location and any separately authorized installation or publication.

Return the created or revised Skill plus a concise verification result. The
result identifies the artifact, justification, mechanics checks, behavioral
evidence, unresolved decisions, and limits. Mechanics validity and behavioral
evidence are separate conclusions.

## Routing

Select `skill-writing` when the deliverable is creation or revision of an Agent
Skill, including its behavior contract, `SKILL.md`, resources, or owner-local
evaluation cases.

Select another outcome for:

- a general agent-facing artifact: `agent-writing`;
- a continuation for a fresh context: `take-it-offline`;
- installation of an existing Skill;
- publication, release, or marketplace operations.

Installation and publication remain separate actions even when requested with
authoring; do not infer their authorization. Direct invocation of
`skill-writing` wins for its authoring deliverable.

## Justify the Skill

Before drafting production instructions:

1. Inspect existing Skills for the same outcome or trigger boundary. Prefer
   revising the existing owner over creating a competing authority.
2. Establish the recurring behavior or costly rediscovery that earns reusable
   guidance. A one-off solution belongs in the current task artifact.
3. Check whether the needed facts or mechanics are cheaply discoverable from
   the environment. Keep cheap facts in their authoritative source and teach
   the lookup only when the lookup changes behavior.
4. Record the justification, overlap decision, and any unresolved ownership.

If no distinct recurring behavior remains, stop before authoring and return the
existing owner or environment lookup that satisfies the request.

## Decide the behavior contract

Decide these items before production prose:

1. **Outcome and consumer:** the result the Skill owns and the agent that uses
   it.
2. **Trigger boundaries:** positive selection conditions, false-activation
   exclusions, ambiguity behavior, and canonical direct invocation.
3. **Branches:** observable predicates, branch-only material, and failure paths.
4. **Completion:** a checkable terminal condition for every branch.
5. **Dependencies:** canonical owners of behavior the Skill invokes, with no
   copied fallback guidance.
6. **Degrees of freedom:** low for fragile sequence or mechanics, medium for
   bounded judgment, and high where wording or approach may vary safely.
7. **Evidence needs:** the claims being made and the smallest evidence that
   could support or falsify each claim.

List unresolved contract decisions and the smallest user decision or evidence
needed. Do not hide an undecided behavior behind polished instructions.

## Compose by canonical name

After the contract is decided:

1. Invoke `agent-writing` to preserve observable activation, branches,
   execution order, completion, terminology, and information hierarchy.
2. Invoke `skill-mechanics` with the decided contract to create the portable
   representation and mechanics result.
3. Invoke `skill-evaluation` to choose and report evidence proportionate to the
   Skill's behavioral claims.

Use those exact canonical names. Do not copy their guidance into this Skill or
approximate a missing dependency. Stop before authoring with the applicable
exact failure:

- `Missing internal dependency "agent-writing"`
- `Missing internal dependency "skill-mechanics"`
- `Missing internal dependency "skill-evaluation"`

## Author and verify

Write production instructions only after justification and contract decisions
are complete. Keep one owner for each behavior, place branch-only resources
behind direct conditional pointers, and preserve the decided degrees of
freedom.

Ask `skill-mechanics` to validate representation. Ask `skill-evaluation` for
evidence proportionate to the claims:

- use deterministic checks only for mechanical facts such as schema validity,
  exact required literals, counts, artifact existence, byte preservation, and
  resolvable pointers;
- evaluate trigger selection separately from output quality;
- use matched fresh-session Skill and No-Skill runs for public outcome claims;
- use blind model judgment with quoted or referenced output evidence for
  semantics, followed by sampled human review;
- report behavior as unverified when proportionate evidence was not run.

Do not replace semantic judgment with natural-language regexes or handcrafted
parsers. Do not run paid or credentialed evaluations without authorization.
Keep generated runs, judge payloads, reports, viewers, and workspaces
uncommitted.

Return:

- `Artifact:` created or revised paths;
- `Justification:` distinct recurring behavior and overlap decision;
- `Mechanics:` passed, failed, and unresolved structural checks;
- `Behavioral evidence:` verified scope or explicit unverified status;
- `Unresolved decisions and limits:` claims, hosts, models, and actions not
  established.

## Failure behavior

When justification or a contract item is missing, stop before production prose
and return the exact gap and smallest decision or evidence needed.

When repository authorities or Skill owners conflict, preserve the conflict and
stop the affected branch. Do not create a competing Skill silently.

When mechanics fail, return the partial artifact only when useful for
correction and mark completion failed. When behavioral evidence is absent,
report `unverified`; do not turn structural success into a behavioral claim.

## Completion

Complete only when:

- the Skill is justified against existing Skills, recurrence, and cheap
  environment lookup;
- an observable behavior contract covers triggers, branches, completion,
  dependencies, degrees of freedom, and evidence needs;
- `agent-writing`, `skill-mechanics`, and `skill-evaluation` were invoked by
  canonical name;
- the created or revised Skill preserves the decided contract;
- mechanics checks succeeded;
- proportionate behavioral evidence is reported, or its status is explicitly
  unverified;
- unresolved decisions, unsupported claims, and operational limits are
  reported;
- no installation, publication, release, marketplace, or suite-wide evaluation
  work occurred without separate scope and authorization.
