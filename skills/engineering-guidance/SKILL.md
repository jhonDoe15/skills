---
name: engineering-guidance
description: Assesses an existing technical proposal, implementation approach, or change against applicable repository authority and general engineering concerns. Use for direct requests about engineering approach, maintainability, technical-design quality, coding methodology, or applicable standards. Declared callers may load it inside implementation or review. Excludes design authoring, implementation, Code Review findings, generic writing, product planning, and ticket decomposition.
disable-model-invocation: false
---

# Engineering Guidance

Assess an existing artifact and return compact Engineering concern coverage.
Advice is the only owned outcome. The caller keeps ownership of design,
implementation, review, validation, artifacts, and handoffs.

A declared caller runs Engineering Guidance in its existing context without
adding a subagent layer.

## Required context

Accept:

- **Change intent**: the requirement or decision source and the change's purpose.
- **Bounded scope**: repository root plus concrete paths or components.
- **Current artifact**: the proposal, approach, worktree state, or immutable range.
- **Ordered authority**: applicable sources with source, scope, and host-resolved
  precedence.
- **Current activity**: `design`, `implementation`, or `review`.

Keep an absent or ambiguous input as an unresolved gap. Continue only where the
remaining context supports bounded advice. Never fill a gap with invented
repository facts.

## Resolve authority

Build one authority index in this order:

1. Preserve system, organization, and explicit user policy already resolved by
   the host. Apply it without reinterpreting its precedence.
2. Use the requirement source for intended behavior and scope.
3. Apply repository instructions with the scope and precedence resolved by the
   host. Do not invent a cross-host instruction filename or algorithm.
4. Use formatter, linter, compiler, test, and build configuration as evidence of
   mechanically enforced conventions. Point to the configuration or diagnostic
   instead of restating it as a prose standard.
5. Use nearby established practice as descriptive evidence where stronger
   authority is silent. Repetition does not make a pattern correct or mandatory.
6. Use suite guidance only for an uncovered concern and label it `fallback`.
7. Keep contradictions, weak authority, and ambiguity visible as conflicts or
   unresolved gaps.

For each conflict, record the sources, their precedence, the higher source when
resolved, and any effect that remains unresolved. A lower source never silently
overrides a higher one. Cite stable rules or locations rather than copying full
instruction files.

## Dispose the complete concern index

Give every concern exactly one current disposition:

- `applicable-now`: it bears on the current artifact and activity;
- `applicable-later`: it belongs to a later activity or artifact state; or
- `not-applicable`: it does not bear on this bounded artifact, with a reason.

Activity changes timing, not authority. Revisit deferred concerns when the
artifact, activity, or bounded scope changes.

| Concern | Compact question | Deeper fallback |
| --- | --- | --- |
| `intent-and-scope` | Does the artifact meet the stated need without unrelated work? | [Intent and scope](references/intent-and-scope.md) |
| `responsibilities-and-seams` | Is behavior placed with its owner behind stable interfaces? | [Responsibilities and seams](references/responsibilities-and-seams.md) |
| `dependencies-and-contracts` | Are dependencies, side effects, and production contracts explicit and preserved in tests? | [Dependencies and contracts](references/dependencies-and-contracts.md) |
| `state-and-invariants` | Are valid states, transitions, and ownership explicit? | [State and invariants](references/state-and-invariants.md) |
| `failure-and-boundaries` | Are validation, errors, recovery, and partial failure bounded? | [Failure and boundaries](references/failure-and-boundaries.md) |
| `simplicity-and-reuse` | Is this the simplest present solution with reuse at stable responsibilities? | [Simplicity and reuse](references/simplicity-and-reuse.md) |
| `compatibility-and-change` | Are consumers, data, and staged change paths preserved where needed? | [Compatibility and change](references/compatibility-and-change.md) |
| `maintainer-legibility` | Can maintainers reason locally using domain names and visible behavior? | [Maintainer legibility](references/maintainer-legibility.md) |
| `evidence-and-validation` | What evidence would prove the artifact works? | [Evidence and validation](references/evidence-and-validation.md) |

Start with the compact questions. Load a linked reference only after its concern
becomes `applicable-now` and stronger authority leaves part of it uncovered.
Record the loaded file as fallback for that uncovered part. Do not load deferred
or inapplicable references.

When a concern needs security, performance, concurrency, accessibility, privacy,
or operations expertise, route to an available specialist capability. If none is
available, record the missing capability and its effect as an unresolved gap.
Do not imitate the specialist discipline.

## Return Engineering concern coverage

Return one compact record containing:

- bounded scope and current artifact revision;
- change intent and current activity;
- authority sources with scope, precedence, and stable rule references;
- all nine concerns, each with one disposition and reason;
- selected fallback sources, each tied to its uncovered concern;
- authority conflicts and their resolved or unresolved effect;
- unresolved input, authority, evidence, and specialist gaps; and
- specialist routes.

Keep a small result inline. For a large, multi-scope, or conflicted assessment,
offer the same record to the caller for storage. The caller owns any artifact.
Engineering Guidance does not write or mutate it.

## Keep the guidance boundary

Identify advice and proof conditions without executing the work. Leave these
operations with their owning outcome:

- technical design choices and design artifacts;
- code or document mutation, refactoring, and validation execution;
- Review lenses, findings, severity, confidence, and Review briefs;
- implementation or continuation handoffs;
- repository, commit, worktree, pull-request, tracker, release, and dispatch
  operations.

`engineering-guidance` has no suite-owned runtime dependency. `to-humans` may be
selected independently for a human-facing response. Neither outcome invokes,
owns, or depends on the other.

## Completion

Complete when applicable authority is cited, all nine concerns have exactly one
disposition, every needed fallback reference was considered, deferred concerns
were revisited against the current artifact state, and conflicts, gaps, and
specialist routes remain visible.
