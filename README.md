# skills

Version 1.0.0 release candidate for one atomic 19-Skill suite. Install the
package as a unit. No 18-Skill or domain-only subset is a release candidate.

The suite covers human and agent writing, ticket planning, implementation,
independent review, DAG dispatch, and explicit read-only incident
investigation. `to-humans` is an Audience outcome selected independently from
substantive Primary outcomes. Artifact flow does not create an invocation
dependency.

`carve` turns authoritative requirements into either a validated ready ticket
DAG or a needs-decision plan. It publishes only after separate authorization.

## Canonical inventory

Public Primary outcomes:

- `agent-writing`
- `carve`
- `code-review`
- `dispatch-work`
- `engineering-guidance`
- `implement`
- `incident-investigation`
- `pr-carver`
- `skill-writing`
- `take-it-offline`
- `take-ticket`

Public Audience outcome:

- `to-humans`

Private dependency Modules:

- `review-coordinator`
- `review-worker`
- `skill-evaluation`
- `skill-mechanics`
- `slice-plan`
- `ticket-scope`
- `writing-foundation`

`skills/` is the only package source. The repository contains no host-specific
copies, generated variants, symlinked definitions, or compatibility aliases.
`lean` was replaced by `to-humans` and is not shipped.

## Install

The three external prerequisites are not bundled or installed automatically:

- `autopilot`, consumed by `dispatch-work` and `pr-carver`
- `split-to-prs`, consumed by `pr-carver`
- `tdd`, consumed by `implement`

Their source, tested content revision, license status, and consumers are pinned
in `suite/canonical-suite.json`.

Install the Claude Code plugin:

```text
/plugin marketplace add jhonDoe15/skills
/plugin install skills@jhonDoe15
```

For Cursor or another Agent Skills host:

```bash
npx skills add -g jhonDoe15/skills
npx skills add jhonDoe15/skills
```

The global form installs for the current user. The project form installs for
one repository. Both consume the same canonical `skills/` tree. The Claude
plugin manifest also points directly to `./skills`.

Before installation, inventory only the project and user discovery roots
configured for the target host. Stop if a canonical name already has another
owner, or if a predecessor such as `lean`, `unslop`, `writing-for-agents`,
`writing-great-skills`, or `handoff` is active. Remove or relocate conflicts
manually. The package never scans arbitrary user locations and never deletes a
user-managed installation.

## Validate

Install development dependencies, then run the complete static release gate:

```bash
npm ci
npm test
```

The package-only precondition is:

```bash
npm run check:package
```

It verifies the 1.0.0 identity, exact 19-Skill inventory, package-wide
dependency closure, and component coverage for every declared runtime edge.
Missing suite-owned dependencies fail with the exact canonical name. Collision
checks use explicit installation inventories supplied by the caller.

The host evaluation adapters install the complete canonical package in pristine
Cursor and Claude Code projects. They retain package inventory, discovered
Skills where the host exposes them, requested and resolved Skills, lifecycle
events, responses, artifacts, tool use, attempted mutations, model identity,
duration, cost, and failure state. Component ablation remains available only
through the test Adapter boundary.

The release candidate is ready for the separate 19-Skill adoption campaign.
Static package validation does not claim that the paid cross-host campaign or
human adoption decision has run.

## Evidence and source material

Reusable evaluation cases, schemas, test Adapters, validators, rubrics, and
source fixtures stay versioned. Generated package checks, reviews, transcripts,
model runs, temporary workspaces, evaluation output, and reports stay ignored.

See `THIRD_PARTY_NOTICES.md` for pinned sources, licenses, and affected suite
Modules. The package is MIT licensed. See `LICENSE`.
