---
name: take-ticket
description: Use when a settled ticket must reach a reviewed-ticket result. Used directly or by Dispatch Work. Excludes implementation-only work, review-only work, ticket topology, publication, release, and multi-ticket dispatch.
disable-model-invocation: false
---

# Take Ticket

Carry one settled ticket through implementation and independent review. The owned
outcome is a reviewed-ticket result, not a patch or Review brief alone.

## Require a settled ticket

Require durable ticket requirements, bounded scope, explicit exclusions, an
isolated checkout, and an immutable authorized base. Verify the ticket is open,
assigned as required by the caller, and has no live blocker before mutation.

Stop when the work needs an unmade shared interface, security-sensitive choice,
migration, persistence model, release decision, or cross-ticket owner. Preserve
the stop as lifecycle evidence. Keep tracker, pull-request, and publication
changes with their owning flow.

## Resolve the production closure

Require canonical `implement` and `code-review` by exact name. Resolve both from
the canonical package and runtime graph before execution. A missing dependency
fails before work and reports:

`Missing internal dependency "<canonical-name>"`

Production uses no Adapter, copied instructions, or fallback behavior. Test-only
Implement and Code Review Adapters may provide instrumented outcomes through the
suite test boundary. They remain outside production Skills, package discovery,
installation, and runtime resolution.

## Run Implement

Start one isolated Implement worker with the ticket requirements, bounded scope,
exclusions, checkout, immutable base, repository authority, and artifact
destination. Require `implement-handoff/v2`.

Implementation must complete with an immutable `base..head`, validation evidence,
and a correction-ready handoff. Retain failed or incomplete implementation as
the current lifecycle state and stop. Never present it as reviewed.

## Start one authoritative full Code Review

After implementation completes, start a fresh Code Review context. Give it the
complete Ticket outcome:

- originating requirements;
- immutable implementation range;
- implementation handoff; and
- validation evidence.

The Review resolves its own authority and Engineering Guidance. Treat conclusions
from implementation as evidence to inspect, never inherited authority. Require
one complete ordinary Review brief and its retained artifacts.

This is the only full authoritative review. A failed or incomplete Review stops
the lifecycle without a reviewed result.

## Correct accepted findings

If the full Review is clean, record correction and targeted re-review as
`not-required`, then complete.

Otherwise, decide which findings are accepted using the full Review brief and
the caller's authority. Give the correction worker only the accepted findings,
their Review regions, the immutable implementation range, and the evidence
needed to verify each fix. Record rejected or deferred findings in the retained
Review disposition; never silently drop them.

Correction produces:

- an immutable correction range;
- the accepted finding IDs and Review regions it changes;
- validation evidence for each accepted finding; and
- every region materially affected by the correction.

A failed or incomplete correction remains visible and stops the lifecycle.

## Target the re-review

Start a fresh reviewer after correction. Re-review every corrected Review region
and every region marked materially affected. Give the reviewer the original
Ticket outcome, full Review brief, accepted correction scope, correction range,
and correction evidence.

The targeted reviewer records one disposition for each required region and
accepted finding. It does not repeat the full review. A missing region,
unresolved accepted finding, or failed or incomplete targeted review prevents a
reviewed result.

## Retain the lifecycle

Write one JSON artifact with schema `take-ticket-result/v1`. Retain:

- ticket requirement references and summary;
- ordered phase transitions for implementation, full review, correction, and
  targeted re-review;
- immutable implementation and correction ranges;
- the `implement-handoff/v2` descriptor and validation evidence;
- the full Review brief descriptor, its independent authority record, and
  accepted, rejected, or deferred finding dispositions;
- accepted correction scope and evidence;
- targeted re-review regions and dispositions;
- deterministic descriptors for all retained artifacts;
- final completeness; and
- one failure phase and message when the result is not reviewed.

Use `reviewed`, `failed`, or `incomplete` as the result status. A reviewed result
has one successful implementation, exactly one completed full Review, successful
correction and targeted re-review when findings were accepted, complete retained
artifacts, and no failure. A clean full Review records both later phases as
`not-required`.

Keep the lifecycle sequence contiguous. Preserve prior completed phases when a
later phase fails. Never replace partial progress with a success summary.

## Completion

Complete only when the retained artifact proves every required transition and
marks final completeness as reviewed. Return the artifact reference, immutable
ranges, exact validation results, unresolved risks, and the first recovery action
for a failed or incomplete result.
