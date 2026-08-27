# Private agent files

Private or user-scoped guidance belongs to one person and applies across their projects. It is not
the same as private-network guidance.

## Resolve the real load path

Identify how each active harness loads user-level instructions. Do not assume one home-directory
`AGENTS.md` reaches Claude Code, Cursor, Codex, or every machine. Inspect existing user rules,
`AGENTS.md`, `CLAUDE.md`, skills, symlinks, and synchronization before choosing a canonical file.

Use one source of truth. Add the thinnest supported compatibility pointer for each harness. Separate:

- universal guidance used everywhere
- harness-specific guidance
- machine- or capability-specific guidance

If several machines need the same files, use a versioned canonical repository and explicit scope
metadata or simple links. Do not build a custom synchronization system unless the existing
mechanisms cannot meet a verified requirement.

## Derive personal guidance

Run the failure-audit branch selected by the main skill and inspect the user's own histories. Do not
copy another developer's file. A private file has broad blast radius, so every rule needs evidence
or an explicit preference from the user.

Ask or infer from corrections:

- desired tone, brevity, and explanation style
- whether questions, reviews, and diagnosis requests are read-only
- how much initiative and scope expansion is welcome
- what requires approval: edits, commits, pushes, external writes, production actions, or process
  termination
- proportional verification and testing preferences, including targeted checks before broad suites
- delegation thresholds and file ownership for parallel work
- safeguards for running servers, user data, credentials, and the environment hosting the agent
- recurring language or framework failures

Technology and library preferences are fallbacks only. Repository and service choices win.
Model-specific rules require measured evidence and a review date or condition for removal.

## Shape the file

A useful private file may contain:

1. **About the user:** a short first-person note about goals, taste, and collaboration style. Models
   tone-match, so write it in the voice the user wants returned.
2. **Working agreement:** read-only request types, initiative, scope, questions, and stop points.
3. **Safety and blast radius:** production, destructive commands, process ownership, secrets, and
   external writes.
4. **Engineering preferences:** simplicity, type safety, comments, testing, and verification, but
   only where they apply across projects.
5. **Delegation:** when ceremony earns its cost and how parallel workers avoid file collisions.
6. **Pointers:** conditional workflows such as PR filing, PR monitoring, UI verification, or
   artifact sharing belong in skills or focused references.

Do not weaken hard guardrails with a blanket "everything is a default" sentence. Label personal
taste as overridable defaults. Keep security, irreversible-action, and authorization boundaries
explicit.

For an existing private file, show the draft and migration map before replacing it unless the user
already approved that exact rewrite.

## Verify broad behavior

Test the private guidance on representative tasks from different repositories and harnesses:

- an informational question
- a small one-file change
- parallel work
- a destructive or production-adjacent request
- a language-specific task
- a PR or human-facing report

Confirm the file improves communication and behavior without overriding project-local decisions.
After distributing it, verify each intended machine and harness loads the canonical guidance, and
that capability-specific guidance is absent from ineligible targets.
