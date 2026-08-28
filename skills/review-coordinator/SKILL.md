---
name: review-coordinator
description: Private Code Review dependency that structurally validates and aggregates independent worker findings into an inspectable Review brief without re-reviewing or changing conclusions. Use only when invoked by the Code Review lifecycle.
disable-model-invocation: false
---

# Review Coordinator

Assemble one Review brief from unchanged worker outputs. Structural aggregation
is the only owned behavior.

## Required input

Require the run manifest, immutable diff package, complete Domain worker output,
complete Engineering/Design worker output, both concern coverage artifacts, and
the destination for retained artifacts. Each worker must name the same Ticket
outcome references and immutable range.

## Required dependency

Invoke `take-it-offline` by its exact canonical Skill name. If unavailable, stop
with:

`Missing internal dependency "take-it-offline"`

Do not copy its behavior or use a test Adapter in production.

## Validate structure

Before aggregation, validate:

- exactly one Domain and one Engineering/Design worker with distinct identities
  and lens provenance;
- complete and matching Ticket outcome references and immutable range identity;
- all nine Engineering Guidance concern dispositions from each worker, stored
  separately from findings;
- ordered Review-region coverage and explicit worker-declared supersession whose
  source is an examined higher-level finding from the same worker and region;
- every required finding field, confidence range, evidence reference, and
  acceptance-evidence statement; and
- every required retained artifact reference.

Any structural failure makes the run incomplete. Preserve valid partial worker
artifacts and structured failure evidence, record every required completeness
check by its canonical identity, and do not produce a Markdown Review brief.

## Group compatible duplicates

Group findings only when workers identify the same underlying problem and their
affected scopes, impacts, and highest actionable fix directions are compatible.
Keep every source finding identity and conclusion unchanged. Record why the
findings were grouped. Keep disagreements separate and visible.

Apply only worker-declared supersession. Record each superseded finding or
region, its declaring worker, and its higher-level source. The coordinator does
not invent supersession.

## Sort and union

Sort findings by:

1. Review level in Requirements & Expectations, Engineering & Architecture,
   then Code Quality order;
2. severity from highest to lowest; and
3. stable finding identity.

Union coverage by worker, lens, Review region, Review level, and Engineering
Guidance concern. Union means retaining all source coverage and disagreements,
not reconciling them.

Record a coordination disposition for every source finding. Allowed
dispositions are retained, grouped with named compatible findings, or
superseded by a worker-declared higher-level conclusion.

## Assemble the Review brief

Write a concise Review summary followed by sorted findings, disagreements,
coverage, Context limits, and acceptance evidence. Link the run manifest,
immutable diff package, per-worker candidate streams, per-worker concern
coverage, coordination dispositions, and completeness state.

Use `take-it-offline` to return the final Markdown brief and artifact references
to the caller. Preserve worker conclusions in the retained records and brief.

## Boundary

The coordinator does not perform a second review, make findings, change
severity or confidence, rewrite fix directions, inspect the change for new
issues, edit code, publish comments, decompose remediation, or mutate ticket,
pull-request, branch, dependency, or release state.

## Completion

Complete only when both worker outputs pass every structural check, every source
finding has one coordination disposition, coverage is unioned without loss, and
the final Markdown brief and completeness state reference all retained
artifacts.
