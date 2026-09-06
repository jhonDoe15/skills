# skills

Version 1.0.0 release candidate for one atomic 23-Skill suite. Install the
package as a unit. Partial or domain-only subsets are not release candidates.

The suite covers project agent guidance, human and agent writing, ticket
planning, implementation planning, implementation, architecture and code
review, DAG dispatch, and explicit read-only incident investigation.
`to-humans` is an Audience outcome
selected independently from substantive Primary outcomes. Artifact flow does
not create an invocation dependency.

`carve` turns authoritative requirements into either a validated ready ticket
DAG or a needs-decision plan. It publishes only after separate authorization.

## Canonical inventory

Public Primary outcomes:

- `agent-writing`
- `agents-file-writer`
- `architecture-review`
- `carve`
- `code-review`
- `dispatch-work`
- `engineering-guidance`
- `implement`
- `implementation-planning`
- `incident-investigation`
- `pr-carver`
- `skill-writing`
- `take-it-offline`
- `take-ticket`

Public Audience outcome:

- `to-humans`

Private dependency Modules:

- `maintaining-agent-guidance`
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

To reject collisions from a caller-scoped inventory:

```bash
node scripts/check-package.js --installation-inventory inventory.json
```

The JSON file is an array of `{ "name": "...", "source": "..." }` records from
the target host's configured project and user discovery roots. The check
reports every conflicting owner and predecessor, then exits nonzero.

It verifies the 1.0.0 identity, exact 23-Skill inventory, package-wide
dependency closure, and component coverage for every declared runtime edge.
Missing suite-owned dependencies fail with the exact canonical name. Collision
checks use explicit installation inventories supplied by the caller.

The host evaluation adapters install the complete canonical package in pristine
Cursor and Claude Code projects. They retain package inventory, discovered
Skills where the host exposes them, requested and resolved Skills, lifecycle
events, responses, artifacts, tool use, attempted mutations, model identity,
duration, cost, and failure state. Component ablation remains available only
through the test Adapter boundary.

The release candidate is ready for the separate 23-Skill adoption campaign.
Static package validation does not claim that the paid cross-host campaign or
human adoption decision has run.

Prepare the guarded campaign without creating host or judge clients:

```bash
cp adoption-campaign.config.example.json /tmp/adoption-campaign.json
# Replace every placeholder with HEAD and exact available model selections.
npm run adoption -- plan --config /tmp/adoption-campaign.json
```

Every model is configured as `{ "id": "...", "params": [...] }`. Keep Claude
Code host and judge `params` empty. For Cursor, use `Cursor.models.list()` for
the executing API key and configure every parameter declared by the exact
catalog model ID; parameter IDs and values are account-scoped and must not be
inferred from aliases or defaults. Parameter order is normalized
deterministically, while every explicit value remains part of the campaign and
evidence fingerprints.

Structured selections use adoption artifact schema v2 and evaluation retained
evidence schema v3. Plans, acknowledgements, run indexes, and evidence produced
by earlier schema versions must be regenerated because they did not retain
parameter-level model identity.

The plan output prints its exact fingerprint, initial call count, configured
cost ceiling, and the acknowledgement required by `run`. `replay` and `packet`
use only retained evidence. The packet leaves the final go/no-go decision
explicitly pending human adjudication.

Focused external holdouts use a separate partial-assessment plan and the
materialized `external-holdouts/implementation-planning/manifest.json` corpus:

```bash
npm run adoption -- plan --config /tmp/adoption-campaign.json \
  --external-holdouts \
  --case proportional/compact-celsius \
  --model-cell claude-code:ordinary
npm run adoption -- run --plan .artifacts/adoption/<fingerprint>/plan.json \
  --acknowledge-paid-execution '<value printed by plan>'
npm run adoption -- replay --plan .artifacts/adoption/<fingerprint>/plan.json
npm run adoption -- packet --plan .artifacts/adoption/<fingerprint>/plan.json
```

`--case`, `--domain`, `--host`, and `--model-cell` are repeatable plan-time
selectors. Values within a selector category are unioned and categories
intersect; the sealed plan fixes the exact cases and cells for run/replay.
Focused artifacts are always labeled `partial-holdout-assessment` and cannot
satisfy canonical release or adoption gates. Cursor cells can be planned, but
paid Cursor execution is blocked by default because the SDK has no enforceable
per-run budget cap. Only `run` accepts
`--allow-unbounded-cursor-execution`; its run index retains the exception, and
resume requires the same exception policy. Focused runs stage only the resolved
runtime Skill closure and immutable input bytes; oracle content remains
runner/judge side.

## Evidence and source material

Reusable evaluation cases, schemas, test Adapters, validators, rubrics, and
source fixtures stay versioned. Generated package checks, reviews, transcripts,
model runs, temporary workspaces, evaluation output, and reports stay ignored.

See `THIRD_PARTY_NOTICES.md` for pinned sources, licenses, and affected suite
Modules. The package is MIT licensed. See `LICENSE`.
