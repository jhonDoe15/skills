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

Classify the request as **create**, **migrate**, **refine**, or **review**, then select its scope
below. Create, migrate, and refine requests use every phase. A review-only request uses Discover,
Resolve, Analyze, and read-only verification, then stops. If the review also requests proposed
changes, continue through Draft and stop there. Enter Authorize and Write only when the user asks
to apply a revision.

1. **Discover.** Inspect the actual load chain, existing instructions and references, authoritative
   project sources, and relevant user or repository history. This phase is complete when the
   applicable authorities, current files, and evidence gaps are named.
2. **Resolve.** Infer factual answers from those authorities before asking questions. Ask only for
   unresolved policy choices that belong to the user or maintainer. This phase is complete when no
   remaining question can be answered from available evidence.
3. **Analyze.** Present the findings and a Keep/Move/Delete migration map. Account for every existing
   section; for a fresh file, state that there is no existing material to migrate. This phase is
   complete when every source item has a destination or a verified reason for deletion.
4. **Draft.** Present the proposed file structure and load chain followed by the full proposed
   contents of every file. This phase is complete when the exact proposed contents and migration
   map are visible to the user.
5. **Authorize.** Ask for one decision that covers acceptance of the exact draft and any replacement
   that could lose guidance or external mutation that still needs approval. Count clear
   authorization in the original request. This phase is complete when the draft is accepted and
   every planned mutation is within the accepted boundary.
6. **Write.** Apply the accepted draft and migration map. This phase is complete when each accepted
   file and compatibility pointer exists at its intended path.
7. **Verify.** Re-read the real load order, run the loss and pointer checks, and behavior-test
   representative tasks. This phase is complete when the result preserves applicable facts, selects
   the right procedures, and reports validation and unresolved gaps.

## Select the branch

Resolve the intended audience and actual load chain before editing:

- **Private or user-scoped:** guidance owned by one person and used across projects. Read
  [PRIVATE-SCOPE.md](PRIVATE-SCOPE.md).
- **Project or repository:** contributor guidance for one codebase. Read
  [PROJECT-SCOPE.md](PROJECT-SCOPE.md).
- **Service or component:** project guidance narrowed to one independently understandable,
  buildable, or runnable unit. Use the project workflow at that boundary.
- **Environment:** constraints for a named network, runtime, runner, or deployment environment.
- **Reference:** detailed facts for one subject or branch.

For new or materially revised behavioral guidance, read
[FAILURE-AUDIT.md](FAILURE-AUDIT.md). When deciding whether a procedure belongs in an agent file,
reference, rule, or skill, read [WORKFLOW-EXTRACTION.md](WORKFLOW-EXTRACTION.md).

Do not assume a home-directory or repository `AGENTS.md` loads in every harness. Inspect the
supported user, project, and nested instruction mechanisms for the active tools.

## Distinguish agent guidance from project documentation

A README helps people understand, evaluate, install, or use a project. An agent file tells an agent
how to change it, what it must preserve, and how to work with the maintainer.

Include only enough project description to support correct decisions and avoid repeated blind
exploration. Move user documentation, broad exposition, and code-derived inventories elsewhere.

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
- **Move:** load-bearing facts needed only for a subject or branch.
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

Split references by real invocation branch, such as architecture, dependencies, communication,
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

Front-load the trigger. Use one trigger per branch. Name an environment for its real constraint,
such as `private-network` or `hosted-vm`, not for the editor exposing it.

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
2. Move durable project rules to `AGENTS.md`.
3. Keep harness-specific behavior in the harness file or owning skill.
4. Run a loss check across commands, exceptions, constraints, and references.
5. Show the proposed files and migration map.
6. Replace the old body with a thin pointer only after explicit user approval.

Never overwrite first and reconstruct later.

## Verify behavior, not only Markdown

Before reporting completion:

- Re-read the files in their actual load order.
- Account for every moved or deleted fact.
- Verify each pointer covers every branch it claims.
- Check links, paths, precedence, duplication, stale names, and contradictions.
- Test representative tasks for the file's scope.
- Confirm agents choose the right procedure, preserve the environment, cover applicable surfaces,
  and communicate in the intended vocabulary.
- Run `git diff --check` for repository changes.
- Run build or test commands only when the guidance change affects their use, through the required
  runner or container.

Report the scope, files changed, migration map, validation, and unresolved gaps. Never claim a
reference auto-loads unless the platform guarantees it.

Agent guidance is maintained code. Revisit it when a recurring failure appears, a rule stops
helping, or the underlying model, harness, project, or environment changes.
