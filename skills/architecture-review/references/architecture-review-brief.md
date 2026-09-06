# Architecture-review brief contract

Return one marked block. `complete` means the target identity is verified and
every required lens and coverage check finished; findings can remain. Missing
target identity or required specialist coverage makes the brief `incomplete`.

```markdown
<!-- architecture-review-brief:v1 -->
# Architecture review

- Status: complete | incomplete
- Target type: existing-code | technical-design | change-range
- Repository and bounded scope:
- Code target, when applicable: [existing-code revision | change-range base and head]
- Design target, when applicable: [artifact identity and numbered design revision]
- Design repository base, when applicable: [immutable repository revision]
- Review intent and requirements:
- Repository authority:
- Evidence checked at:
- Publication status: returned-draft | published-with-authorization
- Publication authorization, destination, and result: [evidence | not-applicable]

## Current architecture

- Consumers and supported contracts:
- Runtime and data paths:
- Ownership and invariants:
- Interfaces, seams, and dependency direction:
- State, lifecycle, effects, and failures:
- Compatibility promises:
- Tests and other proof:
- Current Mermaid view | evidence-backed not-applicable:
- Architecture change: [base-to-head | base-to-proposed design | not-applicable]

## Proposed architecture (technical-design targets)

- Proposed consumers, contracts, ownership, interfaces, and behavior:
- Differences from the existing architecture at the bound repository base:
- Planned validation and acceptance evidence:
- Existing executed proof versus proposed proof and remaining gaps:

## Evidence and scope

- E1 — [immutable source, test, history, requirement, or diagnostic reference]:
  [fact established]
- Decision ladder: [broad feature intent and controlling spec through narrower
  scoped decisions; include deliberate MVP cuts, staged consumers,
  compatibility bridges, and superseding decisions]
- Falsification evidence: [wider searches and resulting changes to candidate
  conclusions]
- Excluded boundary:
- Context limits:
- Engineering Guidance concern coverage:

## Quality-claim ledger

- [Affected module | whole target]
  - Supported consumer contract:
  - Effective behavioral coverage:
  - Coherent ownership and locality:
  - Earned depth and deletion-test result:
  - Seam reality and dependency direction:
  - Proportional change:
  - Supporting and contrary evidence:

## Review coverage

- Architecture dynamic behavior: PASS | [source finding IDs] | INCOMPLETE — [reviewer,
  immutable target, claims and evidence examined, contrary evidence, context
  limits]
- Architecture static structure: PASS | [source finding IDs] | INCOMPLETE — [reviewer,
  immutable target, claims and evidence examined, contrary evidence, context
  limits]
- Uncle Bob/Clean Architecture: PASS | [source finding IDs] | INCOMPLETE — [reviewer,
  immutable target, claims and evidence examined, contrary evidence, context
  limits]
- John Ousterhout/APOSD: PASS | [source finding IDs] | INCOMPLETE — [reviewer, immutable
  target, claims and evidence examined, contrary evidence, context limits]
- [Required specialist]: PASS | [source finding IDs] | INCOMPLETE — [reviewer,
  immutable target, claims and evidence examined, context limits]
- Each INCOMPLETE result: [reason, retained evidence, and recovery condition]

## Specialist coverage

- [Concrete risk and target evidence]: [needed expertise]
  - Disposition: covered-by-existing-lenses | separately-reviewed | unavailable
  - Reviewer and returned coverage evidence:
  - Unresolved need, effect, and resolution evidence:

## Findings and dispositions

- F1 — [stable finding identity]
  - Source finding IDs and reviewers:
  - Original conclusions:
  - Quality claims:
  - Evidence and authority:
  - Contrary evidence:
  - Severity and confidence:
  - Context limits:
  - Affected scope and consequence:
  - Highest supported correction direction:
  - Acceptance evidence:
  - Disposition: reported | disproved | out-of-scope | needs-decision
  - Disposition evidence:
  - Decision owner and resolution condition:

## Conclusion

- Material strengths:
- Reported architecture risks:
- Incomplete-review causes:
- Next owner and concrete action:
- Suggested owning flow:
<!-- /architecture-review-brief -->
```
