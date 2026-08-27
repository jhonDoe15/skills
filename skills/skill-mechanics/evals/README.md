# Skill Mechanics evaluation boundary

Role cases begin with an already-decided behavior contract. Deterministic
checks cover only mechanical facts such as canonical frontmatter values,
ordered representation, named dependencies, and resolvable pointers.
Reference targets mirror the represented Skill root under `evals/fixtures/`;
`grader.js` requires each contract pointer to be both declared in the case
inputs and backed by a regular file there.

Blind judgment with quoted output evidence assesses faithful representation and
the boundary between mechanics validity and behavioral effectiveness. Sampled
human review checks contextual appropriateness. Trigger cases separately prove
canonical reach from a consumer and reject direct user-goal activation.

Generated runs, judge payloads, reports, and workspaces remain uncommitted.
