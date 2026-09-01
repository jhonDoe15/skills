---
name: skill-mechanics
description: Private Agent Skill representation dependency; consumers are skill-writing; not a user-goal Skill and has no direct user-goal triggers.
---

# Skill Mechanics

## Interface

Accept an already-decided behavior contract containing:

- canonical name, purpose, activation boundary, and intended outcome;
- branch predicates, branch-only material, and terminal criteria;
- named dependencies and their invocation points;
- degrees of freedom for sequence, judgment, wording, scripts, and tools;
- routing conditions, exclusions, artifact location, and requested resources.

Return one portable Agent Skill representation plus an observable mechanics
result. The result reports passed checks, failed checks, and unresolved
mechanics separately from any behavioral evidence.

This Skill owns representation and structural validation. It does not decide
whether a Skill should exist, redesign behavior, choose adoption evidence, or
claim that valid structure proves routing or runtime effectiveness.

## Represent the decided contract

1. Create one directory named for the canonical Skill with `SKILL.md` as its
   entrypoint.
2. Put the exact canonical name and a trigger-first routing description in YAML
   frontmatter. The description identifies the Skill, selection conditions,
   consumers where relevant, and exclusions; it does not summarize the
   workflow.
3. Keep activation, ordered actions, branch predicates, and completion
   criteria on the execution path. Preserve the supplied order and degrees of
   freedom.
4. Name each dependency canonically and invoke it at the contract's decided
   point. Represent a missing dependency as
   `Missing internal dependency "<canonical-name>"`; include no substitute or
   fallback copy.
5. Keep branch-specific detail in a directly linked resource only when the
   contract makes loading conditional. State the observable predicate beside
   the pointer. Required decisions remain in `SKILL.md`.
6. Keep resource pointers relative, direct, and inside the Skill directory.
   Every pointer must resolve to a real file with an unambiguous read or
   execute instruction.

Do not add host-only flags, paths, or invocation syntax unless the accepted
contract names that host requirement. Portability describes the common Agent
Skill representation, not equivalent behavior on untested hosts.

## Validate mechanics

Run deterministic checks for:

- parseable YAML frontmatter with exact `name` and non-empty `description`;
- canonical directory, entrypoint, and dependency names;
- routing-description identity, conditions or consumers, and exclusions;
- ordered steps and explicit terminal criteria;
- direct conditional pointers whose targets resolve inside the Skill;
- referenced scripts or resources existing at the named path;
- no copied dependency guidance or undeclared fallback behavior.

Report each check as passed, failed, or unresolved with the artifact location
or structural observation that supports it. Label the conclusion `Mechanics`.
Do not score prose meaning, trigger effectiveness, contextual appropriateness,
or runtime compliance with structural checks.

## Failure behavior

If activation, outcome, a branch predicate, completion, a dependency, or a
degree-of-freedom decision is absent, stop representation and return the exact
missing contract items to `skill-writing`. Do not choose the behavior.

If frontmatter, names, paths, pointers, or resources fail validation, return the
failed check and affected path. Do not convert partial mechanics into success
or claim behavioral validity.

## Completion

Complete only when:

- the input behavior contract was already decided;
- one canonical `SKILL.md` represents every contract item;
- dependencies are named without fallback copies;
- ordered steps, branch predicates, and terminal criteria remain observable;
- conditional resources have direct, resolvable pointers;
- every mechanics check has an observable result;
- the result explicitly limits its conclusion to mechanics.
