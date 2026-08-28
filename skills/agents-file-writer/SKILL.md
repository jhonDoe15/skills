---
name: agents-file-writer
description: Use when the user asks to create, migrate, review, refine, scope, or split an AGENTS.md, CLAUDE.md pointer, or agent-facing reference file.
---

# Agents file writer

Write guidance that helps an agent change a project and communicate with its maintainers. Give the
right agent the right context at the right time.

Observe local failures, audit them, codify the smallest effective rule, and retest. The user's
history and preferences are the source of truth.

## Lead the end-to-end flow

If the request is bare or leaves its scope or target ambiguous, inspect the local context before
asking a question:

1. Identify the current directory, workspace root, and repository root.
2. Bound local candidates to the narrowest evidenced service or component containing the current
   directory, the repository root, and, only when the current directory is the root, directly
   declared top-level services or components.
3. For each candidate, inspect its applicable main instruction files, compatibility pointers, and
   supported load mechanism. Determine its loadable target path and whether it is Create or Improve.
4. Stop when those bounded candidates are classified. Save deeper repository exploration and the
   failure audit for Discover after the user selects a target.

Build the structured choice from those findings. Rank candidates by the narrowest boundary
containing the current directory, then the closest applicable main file, then repository scope; at
the same boundary, prefer an existing loaded target and break remaining ties by shortest relative
path. Put the first candidate first, mark it recommended, and explain the ranking in the prompt.
Label every option with the concrete action, named scope, and derived path, such as
`Improve Worker guidance — services/worker/AGENTS.md`. Include only candidates from the bounded
scan. Use the choice tool's free-form option as the escape hatch; add `Another location` only when
the tool has no such option.

Outside a repository, inspect the private main-instruction load path, then offer Create or Improve
private cross-repository guidance plus the free-form escape hatch. Ask for a raw path only after the
user selects an inaccessible external target. Skip intake only when the request unambiguously
identifies both scope and target.

A request only to review is **Review**. A request to review and apply changes is **Improve**.
Otherwise, inspect the selected scope before classifying:

- **Improve** when any main agent instruction file applies to that scope, such as `AGENTS.md`,
  `CLAUDE.md`, `CODEX.md`, or the active harness's equivalent.
- **Create** when no main agent instruction file applies.

Supporting rules, pointers, and references are evidence, but their existence alone does not make the
request Improve. Read every applicable main file before building the migration ledger or writing
files, but treat its current wording, layout, and file boundaries as inputs rather than constraints.
Migration, refinement, and restructuring are techniques within Create or Improve, not separate
user-facing modes.

A Review request is read-only: run Discover, Resolve, Analyze, Verify, and Present without changing
files.

Create and Improve use this flow:

1. **Discover.** Inspect the actual load chain, existing instructions and references, authoritative
   project sources, and relevant user or repository history. This phase is complete when the
   applicable authorities, current files, and evidence gaps are named.
2. **Resolve.** Infer factual answers from those authorities before asking questions. Ask only for
   unresolved policy choices that belong to the user or maintainer. This phase is complete when no
   remaining question can be answered from available evidence.
3. **Analyze.** Build a complete Keep/Move/Delete ledger and a mutation manifest naming every file
   to add, modify, move, or delete. Include the intended load and trigger-pointer edges. For a fresh
   file, record that there is no existing material to migrate. This phase is complete when every
   source item has a destination or verified deletion reason and every planned write is in scope.
4. **Preflight.** Resolve the actual worktree and repository boundary. Capture repository-wide
   status plus staged and unstaged diffs. Detect detached HEAD, active Git operations, sparse
   checkout, and skip-worktree paths. For every manifest target and move/delete source, inspect its
   existence, every path component, file type, canonical destination, symlink destination, and
   staged, unstaged, untracked, ignored, or unmerged state. Treat nested-repository, submodule, and
   sparse-checkout crossings as scope expansion and block writes to conflicted paths. Detect
   manifest entries that resolve to the same inode or case-normalized path; consolidate them or
   require exception authorization. Capture current content and Git state as the run baseline.
   Unrelated dirty files do not block the run. This phase is complete when every planned path has a
   recoverability and ownership disposition.
5. **Authorize exceptions.** The Create or Improve request authorizes ordinary in-scope writes to
   clean tracked repository paths or previously nonexistent paths. Ask one consolidated question
   before moving or deleting files, replacing an existing harness body with a pointer, writing
   through or replacing a symlink, replacing existing private guidance, making a destructive change
   without Git recovery, or expanding scope. This phase is complete when every exception is removed
   from the manifest or explicitly authorized.
6. **Implement.** Write the complete final file set directly to its intended paths. Write
   destinations and references first, then the main files that point to them, and delete sources
   last. Immediately before each operation, revalidate its target and source against the baseline,
   including content, type, Git state, and canonical destination. Preserve unrelated content and the
   existing index; do not stage, commit, stash, push, or publish unless the user separately chose
   that action. Record each completed operation. If one fails, stop before remaining writes or
   deletions and Present the partial state without claiming completion. This phase is complete when
   every manifest operation is applied and the final guidance is fully viewable in place.
7. **Verify.** Re-read files in effective load order, run loss and contradiction checks, validate
   the reference graph, and simulate representative task prompts without implementing those tasks
   or acting on external systems. Run command validation only when guidance adds or changes commands,
   through the prescribed sandbox or runner. Verify the index and unrelated working-tree state still
   match the post-collision baseline. Record the tested host and model plus untested gaps. This phase
   is complete when applicable facts survive, every route works, and the run-relative change set is
   known.
8. **Present.** Report a concise outcome, actual file links or diff locations, important migration
   decisions, validation, and an adaptive artifact map of the complete guidance graph. Keep full
   file contents on disk. Label repository-relative diffs as combined when they include pre-existing
   changes, and provide a run-relative diff or operation-level delta for continued dirty targets.
   This phase is complete when the user can inspect the complete result and choose to iterate, stop,
   or separately authorize version-control or external actions.

### Handle target collisions

When a manifest path has pre-existing staged, unstaged, untracked, or ignored state, use the
structured choice tool. Always offer:

- Continue from the current contents and treat them as the accepted baseline.
- Stop.

Offer Commit or Stash first when a path-limited operation is supported and preserves unrelated state;
do not offer them for ignored paths. Disable Commit and Stash during an active Git operation or
detached HEAD unless the user explicitly authorizes the exact effect. After the user selects Commit
or Stash, name the exact paths and limit the operation to the agreed existing changes. Record the
resulting commit or stash identifier, verify unrelated index and working-tree state, then rerun
Preflight to establish a new baseline. A Continue choice authorizes editing the existing content
without claiming the whole Git diff was created by this run.

After Present, leave the in-place result available for iteration. Roll back only when requested,
reverse only this run's changes, and stop if later user edits overlap the reversal.

## Select the scope

Resolve the intended audience and actual load chain before editing:

- **Private or user-scoped:** guidance owned by one person and used across projects. Read
  [PRIVATE-SCOPE.md](PRIVATE-SCOPE.md).
- **Project or repository:** contributor guidance for one codebase. Read
  [PROJECT-SCOPE.md](PROJECT-SCOPE.md).
- **Service or component:** project guidance narrowed to one independently understandable,
  buildable, or runnable unit. Use the project workflow at that boundary.
- **Environment:** constraints for a named network, runtime, runner, or deployment environment.
- **Reference:** detailed facts for one subject or invocation branch.

For new or materially revised behavioral guidance, read
[FAILURE-AUDIT.md](FAILURE-AUDIT.md). When deciding whether a procedure belongs in an agent file,
reference, rule, or skill, read [WORKFLOW-EXTRACTION.md](WORKFLOW-EXTRACTION.md).

Do not assume a home-directory or repository `AGENTS.md` loads in every harness. Inspect the
supported user, project, and nested instruction mechanisms for the active tools.

## Distinguish agent guidance from project documentation

A README helps people understand, evaluate, install, or use a project. An agent file tells an agent
how to change it, what it must preserve, and how to work with the maintainer.

Include only enough project description to support correct decisions and avoid repeated blind
exploration. Move user documentation and broad exposition elsewhere. Omit cheaply code-derived
inventories or point to their authoritative source; cache only expensive lookups with a revalidation
condition.

`AGENTS.md` is vendor-neutral guidance. `CLAUDE.md` is a harness compatibility file when needed.
Keep `@` imports, tool-specific frontmatter, and editor-specific behavior out of vendor-neutral
files.

## Derive guidance from evidence

Do not generate a generic template and call it done. Start with:

1. Existing agent files, rules, skills, references, configuration, and representative source.
2. The user's explicit preferences and corrections.
3. Real conversation, tool-call, review, and failure history.
4. Repository history for recurring defects and reverted assumptions.

Use multiple audits when the history is broad or model behavior differs. Quantify recurring
failures where useful, but account for task difficulty and workload differences. Ask why an agent
made a bad decision and what context led it there. When a small task took too long, classify its
tool calls and identify wasted work.

Turn each verified pattern into the narrowest rule that changes behavior. Use one real bad/good
example for subjective output such as titles, reports, or explanations. Treat generated drafts as
raw material for maintainer curation.

## Inventory before pruning

Classify every existing section:

- **Keep:** always-needed rules, safety constraints, decision criteria, and routing instructions.
- **Move:** load-bearing facts needed only for a subject or invocation branch.
- **Delete:** stale, duplicated, or reliably code-derived material.

Maintain a migration map while editing:

```text
old section -> kept
old section -> moved to <canonical file>
old section -> deleted because <verified reason>
```

Every deletion requires one of these outcomes:

- the same meaning remains in a named canonical file;
- an authoritative source proves it stale or wrong;
- the repository exposes it directly and it contains no hidden gotcha;
- the user explicitly approved dropping it.

Preserve non-derivable ownership, workflow, failure-mode, compatibility, security, product-quality,
and environment facts. Do not trade completeness for an arbitrary line target.

## Place information by load

Keep private and root files short because they load broadly:

- behavior, safety, collaboration preferences, decision criteria, and triggered pointers
- no language, service, component, or environment detail unless it applies throughout the scope

Keep service and component files focused:

- purpose and boundaries
- non-negotiable product or architectural qualities
- local vocabulary
- recurring failure modes and completeness checks
- exact commands when normal discovery leads to mistakes
- subject-triggered pointers

Split references by real invocation branches, such as architecture, dependencies, communication,
testing, deployment, or private-network access. Keep a concept's definition, constraints, and
caveats together. Avoid both sprawling catch-all references and tiny circular fragments.

## Write useful pointers

A Markdown link is a pointer, not an import. The platform does not automatically lazy-load ordinary
links; the agent must follow the instruction.

Each pointer states what to read and the observable trigger:

```md
- Read `docs/agents/dependencies.md` when tracing shared-library or build-time dependencies.
- Read `docs/agents/private-network.md` before cloning, building, testing, or running work that
  depends on private repositories or services.
```

Front-load the trigger. Use one trigger per invocation branch. Name an environment for its real
constraint, such as `private-network` or `hosted-vm`, not for the editor exposing it.

Maintain a guidance graph with two distinct edge types:

- **Loads/imports:** the platform automatically applies another instruction file.
- **Read when:** an agent follows a pointer for an observable task or decision.

For each active or repository-supported harness and representative task path, start from a main file
proven to load. Every disclosed reference in the final guidance set, existing or new, needs a direct
`Read <path> when <trigger>` edge from the nearest applicable loaded main or nested instruction file.
Resolve paths relative to the file containing the pointer. Ordinary links do not count as routing
edges. Reject orphan references, pointer cycles, scope inversion, and contradictory inherited
guidance. Keep each meaning in one canonical file; repeat routing pointers only when no common
applicable loaded ancestor exists.

Use a scoped rule or model-invoked skill when automatic loading is required. Avoid restating a
reference in the pointer; a short safety invariant may remain inline when agents need it before
deciding whether to follow the link.

## Encode intent and communication

Agent files should improve communication as deliberately as implementation:

- Write in the tone the user or maintainers want returned; models tone-match.
- Define ambiguous local terms so agents describe work using the team's mental model.
- Explain why a non-obvious rule or product quality matters.
- Give explicit authorization boundaries and stop points.
- Make completion criteria observable and exhaustive where omissions are costly.
- Distinguish overridable taste from hard security, contract, and irreversible-action guardrails.
- State how a conflict is escalated before violating a core invariant.

Do not use one blanket "these are only defaults" statement to weaken hard rules. Scope the override
language to preferences, and let the current user's explicit request override those preferences.

## Migrate harness files safely

When a real `CLAUDE.md` or other harness file already contains guidance:

1. Inventory every section and determine its authority.
2. Move durable project rules to `AGENTS.md` when the discovered harnesses load it directly or
   through a compatibility pointer. Otherwise keep them in the supported main instruction file.
3. Keep harness-specific behavior in the harness file or owning skill.
4. Run a loss check across commands, exceptions, constraints, and references.
5. Show the proposed files and migration map.
6. Replace the old body with a thin pointer only after explicit user approval.

Never overwrite first and reconstruct later.

## Show the actual guidance set

Build the artifact map from the preflight baseline and final files, not from the earlier plan. Show
the complete effective guidance graph for each tested harness and representative task path,
including unchanged routing nodes. Use `[A]`, `[M]`, `[D]`, `[=]`, and `[R old → new]` for added,
modified, deleted, unchanged, and moved files; derive moves from the migration ledger rather than
Git rename detection. Use `==loads==>` for automatic platform edges and `--when <trigger>-->` for
agent-followed pointers. Show deleted paths separately and distinguish pre-existing changes when the
user chose to continue from a dirty baseline.

```text
service/AGENTS.md [M]
├── --when changing schemas--> docs/agents/api-compatibility.md [A]
└── --when running tests-----> docs/agents/testing.md [M]

CLAUDE.md [A] ==loads==> service/AGENTS.md [M]
```

For one file, collapse this to one line. For a graph too large to read, group by harness and task
path, show the loaded main files and their direct routes, include counts of collapsed nodes, and add
a diagnostics list for conflicts or gaps.

## Verify behavior, not only Markdown

Before reporting completion:

- Re-read the files in their actual load order.
- Account for every moved or deleted fact.
- Verify each pointer covers every evidenced invocation branch that requires its target.
- Check links, paths, precedence, duplication, stale names, and contradictions.
- Simulate applicable representative tasks for the file's scope in a read-only or sandboxed
  evaluation. Record unsupported cases as not applicable rather than inventing project branches.
- Confirm agents choose the right procedure, preserve the environment, cover applicable surfaces,
  and communicate in the intended vocabulary.
- Verify the index and unrelated working-tree state match the post-collision baseline.
- Run `git diff --check` for repository changes.
- Run build or test commands only when the guidance change affects their use, through the required
  runner or container.

Report the scope, files changed, migration map, tested host and model, validation, and unresolved
gaps. Never claim a reference auto-loads unless the platform guarantees it.

Agent guidance is maintained code. Revisit it when a recurring failure appears, a rule stops
helping, or the underlying model, harness, project, or environment changes.
