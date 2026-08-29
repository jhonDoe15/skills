---
name: review-worker
description: Private Code Review dependency that examines a complete Ticket outcome through one change-specific Review lens and returns evidence-backed findings plus separate Engineering concern coverage. Use only when invoked by the Code Review lifecycle.
disable-model-invocation: false
---

# Review Worker

Inspect one complete Ticket outcome through one assigned Review lens. Produce
candidate findings and concern coverage. Do not coordinate other workers.

## Required input

Require:

- worker identity and lens provenance;
- originating requirements and their artifact references;
- immutable implementation range and diff package;
- implementation handoff;
- validation evidence;
- applicable repository authority; and
- the output artifact destination.

Record the worker identity, lens, immutable range identity, and every input
artifact reference examined. Stop with an incomplete worker result if any
required input is missing or inconsistent.

## Required dependencies

Invoke `engineering-guidance` and `take-it-offline` by their exact canonical
Skill names. Stop before analysis with the first applicable failure:

- `Missing internal dependency "engineering-guidance"`
- `Missing internal dependency "take-it-offline"`

Resolve Engineering Guidance in this fresh worker context against the complete
Ticket outcome. Record all nine concerns with exactly one `applicable-now`,
`applicable-later`, or justified `not-applicable` disposition. Keep concern
coverage separate from findings. Preserve authority conflicts, gaps, and
specialist routes.

## Analyze Review regions in order

Partition the change into coherent Review regions. A Review region is the
smallest part whose implementation would be materially rewritten or removed by
one fix.

For every region, examine Review levels in this order:

1. Requirements & Expectations
2. Engineering & Architecture
3. Code Quality

Record the levels examined, evidence inspected, and any worker-declared
supersession. When a finding at a higher level supersedes lower-level analysis
for that same region, the source finding must be at an examined level preceding
one contiguous superseded suffix. Name each finding suppressed by that
declaration, the skipped levels, and the reason. Unaffected Review regions retain
complete lower-level coverage. Do not silently omit a region or level, and never
use a finding from another region or worker as the source.

Use the assigned lens to focus the work, not to narrow the input. Follow relevant
evidence into repository history or surrounding code when needed. Route a
specialist concern when an available specialist capability is required; keep a
missing capability as a Context limit.

## Write complete findings

Each finding records:

- stable finding and region identities;
- Review level and severity;
- Finding confidence from 0 through 100;
- Fix-direction confidence from 0 through 100;
- Context limits;
- confidence inputs that identify evidence quality, the limits affecting each
  value, and a rationale for each value;
- evidence with source references;
- impact;
- affected scope;
- stable underlying problem and conclusion identity for structural duplicate
  comparison;
- highest actionable fix direction; and
- acceptance evidence that would show the fix is complete.

Finding confidence measures support for the claim, scope, impact, and severity.
Fix-direction confidence measures support for the proposed direction. Neither is
a probability, severity, or remediation priority. Each explicit Context limit
must affect at least one confidence value, and limited or conflicting evidence
cannot support an unaffected maximum value. Report no finding when evidence does
not support one. A clean region still receives coverage.

## Return worker artifacts

Retain an append-only candidate stream, separate concern coverage, and a worker
manifest through the temporary artifact boundary. Preserve source evidence and
conclusions verbatim for structural coordination. Use `take-it-offline` to
return the artifact references to the caller without relying on prior context.
If the worker fails, return its identity, lens, stage, code, message, evidence,
and any valid partial stream or coverage instead of representing it as complete.

## Boundary

The worker is read-only. It does not change code, publish comments, coordinate
findings, adjudicate another lens, plan remediation, or alter ticket,
pull-request, branch, dependency, or release state.

## Completion

Complete when the worker examined the full Ticket outcome, independently
resolved all nine concerns, accounted for every Review region in level order,
and returned structurally complete findings and separate coverage with
inspectable references.
