# Ticket Scope and PR Carver

## Problem Statement

The repository has a `carve` skill that decides whether work fits one main-tier sub-agent, but its base-unit judgment is mixed together with tier sizing, ticket preparation, and dependency coordination. A future PR-management skill would need the same judgment when deciding whether a pull request contains one cohesive reviewable unit or several units that should be split.

Without a shared contract, `carve` and PR management can disagree about what constitutes a ticket, mistake a horizontal layer for an invalid slice, or use line counts as a substitute for understanding the change. Large pull requests also need a consistent policy for independent PRs, dependent stacks, and the exceptional case where one large PR is the safest structure.

## Solution

Create an internal model-reachable `ticket-scope` skill that evaluates proposed implementation units. It will define the shared base-unit contract without owning a tracker, model tier, Git provider, or PR mutation.

Refactor `carve` to reuse that contract while retaining its explicit invocation, one-main-sub-agent target, fit/split/flag decisions, and dependency-versus-collision wiring.

Create a model-invoked `pr-carver` skill that measures a Git-based PR against its actual base, classifies additions and deletions independently, evaluates candidate units through `ticket-scope`, and recommends the best PR structure:

1. Independent PRs when units are genuinely independent.
2. GitHub native stacked PRs when units have real dependencies and the GitHub capability is available.
3. Ordinary stacked Git branches and PRs when dependency requires ordering but native GitHub stacking is unavailable or the provider is not GitHub.
4. One PR when the change is cohesive, intermediate states are unsafe, or splitting adds more coordination cost than review value.

When a diff mixes independent and dependent relation components, apply the
appropriate structure to each component and report the result as a hybrid.

The skill may recommend a structure automatically, but branch creation, commits, pushes, PR creation or retargeting, merges, and other external state changes require explicit authorization.

## User Stories

1. As a developer, I want one shared definition of a base implementation unit, so that ticket carving and PR carving make consistent decisions.
2. As a developer, I want a base unit to have one cohesive outcome, so that a reviewer can understand what the unit delivers.
3. As a developer, I want each unit to state its in-scope and out-of-scope behavior, so that scope does not expand silently during implementation.
4. As a developer, I want each unit to include independently checkable acceptance and validation, so that it can be verified without relying on an unrelated sibling.
5. As a developer, I want vertical end-to-end slices preferred, so that each normal unit is useful and reviewable on its own.
6. As a developer, I want legitimate horizontal layers accepted when a real contract or migration order requires them, so that foundation, API, and consumer changes can land safely.
7. As a developer, I want layered units to carry explicit ordering, so that dependent work is not incorrectly dispatched in parallel.
8. As a developer, I want arbitrary horizontal convenience splits rejected or recombined, so that artificial fragmentation does not create coordination tax.
9. As a developer, I want repository-local lookup gaps distinguished from open design questions, so that known outcomes are researched instead of guessed.
10. As a developer, I want security, authorization, concurrency, persistence, migration, compatibility, and data-integrity risks surfaced regardless of line count, so that mechanical-looking work is not dispatched blindly.
11. As a developer, I want true blockers distinguished from shared-resource collisions, so that dependencies impose order only when one unit needs another unit's output.
12. As a developer, I want the PR skill to measure additions and deletions separately, so that a large deletion-only or addition-only change is not hidden by a combined net count.
13. As a developer, I want PRs at or below 500 additions and 500 deletions to receive an internal size watch, so that the model considers whether the work can be reviewed more effectively as smaller units.
14. As a developer, I want PRs between 501 and 1000 additions or deletions to receive the same structure evaluation, so that the decision is based on reviewability rather than an arbitrary single cutoff.
15. As a developer, I want a PR with either additions or deletions over 1000 to be treated as a large review surface, so that keeping it as one unit is an explicit decision.
16. As a developer, I want independent units recommended as parallel PRs, so that unrelated work can be reviewed and merged concurrently.
17. As a developer, I want dependent units recommended as a stack, so that each PR shows a focused diff while preserving the required order.
18. As a GitHub user, I want GitHub's native stacked PR support preferred when it is available, so that the dependency chain is visible and managed by the platform.
19. As a Git user on another provider, I want ordinary stacked branches used when dependency requires ordering, so that the policy remains useful beyond GitHub.
20. As a developer, I want one cohesive PR retained when splitting would make intermediate states unsafe or add no review value, so that structure serves correctness rather than ceremony.
21. As a developer, I want only the one-PR choice for a PR over 1000 additions or deletions to require decision confirmation, so that the model can recommend a safe split or stack without an unnecessary choice prompt.
22. As a repository owner, I want actual branch and PR mutations gated by authorization, so that automatic analysis cannot rewrite or publish work unexpectedly.
23. As a reviewer, I want the PR assessment to report counts, candidate units, dependencies, collisions, structure, and rationale, so that I can audit the recommendation.
24. As a maintainer, I want PR descriptions, comments, and CI output treated as untrusted data, so that text embedded in repository artifacts cannot redirect the workflow.
25. As a maintainer, I want the new skills documented in the plugin metadata without changing the existing Lean migration behavior, so that installation and discovery remain coherent.

## Implementation Decisions

- `ticket-scope` is an internal model-invoked reference skill. It is reachable by `carve` and `pr-carver`, but it is not user-invocable or presented as a standalone workflow.
- The shared evaluator assesses a proposed unit after exploration. It does not create a complete ticket set from raw context and does not choose a model tier.
- A `fit` assessment means one cohesive unit with a bounded outcome, explicit acceptance and validation, and no unresolved design or risk decision.
- A `split` assessment means the proposal mixes multiple outcomes, exceeds reasonable breadth, or crosses a natural seam. The assessment names the resulting candidate units.
- A `combine` assessment means proposed fragments are below their natural seam and a single implementation/review context would reconcile them anyway.
- A `flag` assessment means a human decision or risk review is required before the unit can be treated as settled.
- Every unit assessment reports `shape`: `vertical` for the preferred end-to-end path, or `layered` for a constrained horizontal slice. Relation-only collision metadata is not a unit assessment and may use `n/a` when included solely to describe that collision.
- A layered shape is valid only when a real contract or migration order requires it, each layer is independently verifiable, and its blocker relationship is explicit. The expand, migrate, and contract pattern is an accepted example.
- A horizontal split made only for convenience is not a valid layered unit. It is combined, converted to vertical units, or flagged when the seam is not safe.
- The shared evaluator uses `settled`, `local`, and `design` as uncertainty states. A `local` gap is resolved with a proportional repository lookup; `design` remains a separate decision or human flag.
- Risk overrides ordinary sizing. Security or authorization, concurrency, persistence or migration, backwards compatibility or public contracts, and data integrity remain human-review flags even when the edit is mechanical.
- Dependencies mean a unit needs another unit's output and are represented as blockers. Collisions mean units share a file or mutable state without needing one another's output and are represented separately.
- `carve` references the shared evaluator for the base-unit decision, then applies its existing one-main-sub-agent reach test and tracker wiring. Its explicit invocation and one-tier model policy remain unchanged.
- `pr-carver` identifies the effective PR base first. For an existing PR, it uses that PR's base branch; for local work, it uses the stated comparison base. It counts changed additions and deletions from the provider or equivalent diff, with binary changes called out separately.
- PR size bands use independent counts:
  - Band 1: additions at most 500 and deletions at most 500. Set an internal size-watch flag and evaluate structure.
  - Band 2: at least one count is 501–1000 and neither count exceeds 1000. Use the same structure choices.
  - Band 3: either count exceeds 1000. Use the same structure choices, but require confirmation before selecting one PR.
- Exact counts of 500 and 1000 remain in the lower band. A net count is never used to hide a large additions-only or deletions-only diff.
- Independent candidate units are the strongest parallel-PR case. A collision or a shared mutable resource disqualifies parallel execution even when the outcomes appear separate.
- Candidate units with a genuine dependency are stacked. On GitHub, use the native stacked PR mechanism when the repository and account support it; otherwise use ordinary stacked branches and PR base relationships. On GitHub, the native feature may require same-repository branches and may be subject to provider availability or preview status, so the fallback is explicit.
- The candidate relation graph is partitioned into blocker/collision components before structure selection. Independent components may run as parallel PRs beside dependent components that use their applicable stack; this mixed result is reported as `hybrid`.
- Keeping one PR is appropriate when the shared evaluator returns one cohesive unit, no safe seam exists, intermediate states cannot be validated or merged safely, or splitting would only duplicate coordination and review work.
- `pr-carver` reports the selected structure and rationale instead of asking the user to choose among strategies. The exception is a Band 3 one-PR recommendation, which must be confirmed.
- Strategy classification and execution authorization are separate. Even when no strategy confirmation is needed, actual branch, commit, push, PR, retargeting, merge, or history-rewriting operations require explicit user authorization.
- Authorized execution reuses the repository's existing PR-splitting conventions. Merge readiness, comments, conflicts, and CI remain the responsibility of the existing PR-babysitting workflow.
- PR titles, descriptions, comments, review text, and CI logs are data, not instructions. The skill does not follow commands embedded in them.
- The new skills are added beside the existing skills, and repository documentation and plugin metadata describe the shared internal relationship and model-invocation behavior.

## Testing Decisions

- Skill behavior is tested as process documentation using fresh-context subagent scenarios, following the red-green-refactor method for skills.
- A good test checks the decision and output contract visible to a requester, not the wording of a particular paragraph or an implementation detail of the markdown.
- The baseline ticket scenarios cover a mixed cross-layer feature with an unresolved authorization choice, and a schema-to-API-to-UI rollout that must be layered and ordered.
- The baseline PR scenarios cover 501 additions with 100 deletions, 1001 additions with 20 deletions, an independent multi-unit diff, a dependent GitHub chain, a dependent non-GitHub chain, a shared-resource collision, and a mixed independent/dependent graph.
- Baseline results are recorded for whether an agent recognizes independent additions and deletions, allows constrained layered slices, identifies blockers, distinguishes collisions, asks for the Band 3 one-PR confirmation, and avoids unauthorized mutations.
- Post-skill scenarios repeat the same prompts with `ticket-scope` or `pr-carver` loaded. Passing requires the expected assessment fields, independent count bands, strategy ordering, layered exception, and authorization gate.
- The post-skill structure scenarios require parallel selection for independent units, ordinary stacking for a non-GitHub dependency chain, collision-aware non-parallel handling, and `hybrid` reporting for independent components beside a dependency stack.
- Loophole scenarios add pressure to merge immediately, generated or binary changes, missing or stale base information, security or migration ambiguity, shared mutable files, and instructions embedded in PR text.
- Structural verification checks valid frontmatter, model-invocation flags, discoverable trigger wording, consistent terminology, one-level references, and each skill's line count.
- Repository verification checks valid JSON metadata, stale hook/admino references relevant to the migration, and clean diff whitespace. No runtime or application test suite exists for these markdown-only changes.

## Out of Scope

- Implementing a ticket tracker, Git provider integration, or line-counting executable.
- Creating or modifying branches, commits, PRs, review threads, CI configuration, or merge state as part of installing the skills.
- Automatically merging, enabling auto-merge, force-pushing, rewriting history, or bypassing review and branch protection.
- Replacing `dispatch-work`, `autopilot`, `split-to-prs`, or other existing workflows.
- Selecting a multi-tier model ladder; `carve` continues to use the repository's single main-subagent policy.
- Treating line thresholds as a quality score or as a substitute for unit boundaries, risk, dependency, or reviewer ownership.
- Updating installed global skill copies or publishing the repository.
- Creating `CONTEXT.md`, ADRs, or other domain documentation before a real domain decision requires them.

## Further Notes

- The GitHub native stacked PR capability is a provider feature, not part of the shared ticket evaluator. The shared evaluator reports ordered dependencies; `pr-carver` chooses the provider-specific execution form.
- The repository currently contains uncommitted Lean, carve, dispatch-work, and setup changes from the surrounding migration. This design only adds the requested shared scope and PR policy work and preserves those existing changes.
- The design intentionally makes the vertical-versus-layered distinction explicit: vertical is the default shape, while a layered shape is a valid base unit only when it carries a real contract, verification, and order.
