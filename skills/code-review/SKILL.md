---
name: code-review
description: Reviews a complete Ticket outcome through fresh Domain and Engineering/Design lenses, then returns an evidence-backed read-only Review brief. Use for code review of a ticket, branch, pull request, or immutable implementation range. Excludes implementation, remediation planning, tracker or pull-request mutation, and reviewed-ticket lifecycle ownership.
disable-model-invocation: false
---

# Code Review

Review one complete Ticket outcome without changing it.

## Required input

Require:

- originating requirements and durable references;
- an immutable implementation range with base and head revisions;
- the implementation handoff; and
- validation evidence.

Resolve the range to an immutable diff package before dispatch. Record every
input artifact reference in the run manifest. Stop as incomplete if an input is
missing, unreadable, mutable, or inconsistent with the range.

## Required dependencies

Invoke `review-worker`, `review-coordinator`, and `take-it-offline` by their exact
canonical Skill names. Stop before review execution with the first applicable
failure:

- `Missing internal dependency "review-worker"`
- `Missing internal dependency "review-coordinator"`
- `Missing internal dependency "take-it-offline"`

Use no copied fallback behavior and never select a test Adapter in production.

## Run two fresh lenses

Start separate fresh Review workers with these change-specific lenses:

1. **Domain** focuses on requirement meaning, user-visible behavior, domain
   invariants, and acceptance evidence.
2. **Engineering/Design** focuses on responsibilities, architecture, technology,
   compatibility, failure behavior, maintainability, and validation.

Give each worker the complete Ticket outcome and the same immutable diff
package. A worker receives the complete requirements, range, implementation
handoff, validation evidence, repository authority, and input artifact
references. Neither worker receives the other worker's output or conclusions.

Each worker must resolve Engineering Guidance independently. Do not inherit the
implementation handoff's concern dispositions. A one-lens result is
structurally invalid and cannot become a complete Review brief.

## Retain the review run

Keep generated review artifacts outside the repository. Retain:

- `run-manifest.json`, with run identity, complete Ticket outcome references,
  worker identities, lens provenance, immutable range, and artifact index;
- `diff-package.json`, the immutable diff package and its base and head;
- per-worker candidate streams containing complete finding records;
- one per-worker concern coverage artifact, separate from findings;
- `coordination.json`, containing coordination dispositions for every grouping,
  supersession, ordering, and retention decision;
- `completeness.json`, containing the completeness state and structural checks;
  and
- `review-brief.md`, the final Markdown brief and concise Review summary.

Use `take-it-offline` to preserve the fresh-context handoffs and final artifact
references. The owning Review role still defines and validates each review
artifact contract.

## Coordinate structurally

Give the coordinator the two unchanged worker outputs and retained references.
The coordinator validates structure, groups compatible duplicates, sorts
findings, unions coverage, preserves worker conclusions, and assembles the
Review brief. It performs no second review and makes no new finding.

Return an incomplete result when a required worker fails, a required artifact is
missing, a worker input identity differs, or any structural check fails. Retain
partial evidence, but do not present it as a complete Review brief.

## Read-only boundary

Review may read repository, requirement, handoff, validation, and history
evidence. It may write only generated review artifacts to temporary artifact
storage. It does not:

- edit source, tests, configuration, or requirements;
- publish review comments;
- change issue, branch, pull-request, dependency, or release topology;
- decompose or dispatch remediation; or
- claim a reviewed-ticket result.

## Completion

Complete only when both required lenses examined the same complete Ticket
outcome, each independently resolved all Engineering Guidance concerns, all
worker and coordinator structures validate, retained artifacts are inspectable,
and the concise Review summary links the immutable range and final Review brief.
