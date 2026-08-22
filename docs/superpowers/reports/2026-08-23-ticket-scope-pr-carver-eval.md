# Ticket Scope and PR Carver Evaluation

## Method

Each scenario ran in a fresh subagent context. The RED runs did not load the
new skills. The GREEN runs loaded the relevant skill and used the same
scenario. No scenario was allowed to edit files, mutate Git state, or call
external write operations.

## RED baseline

- A mixed database/API/UI feature with an unresolved authorization decision was
  treated as a parent or a set of child tickets, but the boundary between a
  cohesive vertical unit and a human-blocking decision varied.
- A schema → API → UI rollout was recognized as a horizontally sliced,
  dependency-ordered stack, but the dependency and validation contract was not
  consistently made explicit.
- A `+501/-100` diff was treated as 601 combined changes and as a generic
  medium-sized PR; the independent additions/deletions band was not applied.
- A `+1001/-20` diff was recognized as large, but an instruction to keep one PR
  was liable to suppress the separate confirmation requirement.
- A dependent foundation → API → UI chain was correctly recognized as stacked
  in one run, but the structure and authorization boundary were not guaranteed
  by a shared contract.

## GREEN results

- `ticket-scope` returned the required assessment fields and flagged unresolved
  authorization behavior instead of guessing.
- `ticket-scope` classified a separately landing schema → API → UI proposal as
  `split`, produced three `layered` candidates, and preserved their blockers.
- `pr-carver` classified `+501/-100` as Band 2, not a combined 601-line count,
  and kept the recommendation provisional when the base or diff structure was
  missing.
- `pr-carver` classified `+1001/-20` as Band 3 and stopped at the required
  one-PR confirmation gate.
- `pr-carver` selected GitHub stacked PRs for a real dependency chain, kept
  parallel PRs out of the recommendation, and required authorization before
  branch or PR mutation.
- Missing bases, binary files, generated files, and instructions embedded in
  PR descriptions remained explicitly reported or ignored as appropriate.

## Refactor pass

The layered-slice wording was tightened after one GREEN run kept a hard
schema → API → UI chain as a single vertical ticket. A proposal containing
separately landing layers now becomes `split`; an individual layer can still
be a valid `layered` candidate when it has its own contract, validation, and
blocker.

## Repository checks

- `ReadLints` reported no errors for the changed skill and documentation files.
- `jq empty` passed for the plugin manifests and Lean configuration.
- `git diff --check` passed.
- All repository skill files remained below 500 lines.

## Limits

The repository contains markdown skills and configuration, not an application
runtime or conventional test suite. These scenarios validate observable agent
decisions and output shape; they do not prove provider-specific GitHub behavior
or replace human review of a real PR.
