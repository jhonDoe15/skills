# skills

One Claude Code plugin with six agent skills:

- **Lean** — model-invoked writing guidance for response density and shape.
- **`ticket-scope`** — internal model-invoked evaluation of cohesive, independently verifiable ticket and PR units.
- **`/carve`** — explicitly invoked to size a spec-derived ticket set so each piece fits one main subagent.
- **`pr-carver`** — model-invoked PR size and structure guidance for parallel and stacked pull requests.
- **`/dispatch-work`** — explicitly invoked to run an already-sized tracker in parallel and carry each piece through implementation, review, and PR approval.
- **`/incident-investigation`** — explicitly invoked, investigation-only guidance for evidence-led production incident and hard-to-localize bug analysis.

Lean, ticket-scope, and pr-carver are selected automatically by the model when
their descriptions match the work. Carve, dispatch-work, and
incident-investigation run only when the user invokes them.

## Install

As a Claude Code plugin:

```
/plugin marketplace add jhonDoe15/skills
/plugin install lean@jhonDoe15
```

Or with the `skills` CLI, for any agent that reads `SKILL.md`:

```
npx skills add -g jhonDoe15/skills    # ~/.claude/skills — every project
npx skills add jhonDoe15/skills       # ./.claude/skills — this project only
```

`-g` installs the skills for your user. Without it, they are installed into the
current repository. Lean uses normal model skill selection and needs no hook or
generated card setup.

The repository layout supports both installers: each skill lives under
`skills/<name>/SKILL.md`, while `.claude-plugin/` exposes the tree as one
Claude Code marketplace plugin.

The workflow skills reference companion skills when their branches are used:
`/to-tickets`, `/to-spec`, `/wayfinder`, `/implement`, `/code-review`,
`/handoff`, and `/autopilot`. Install those separately in the host that runs
the workflows.

### Upgrading from hook/card releases

If an older installation registered Lean's `UserPromptSubmit` or `PostCompact`
hook, remove those entries from the relevant settings file when upgrading.
Current Lean uses normal model skill discovery and registers no hook or card.

## Lean — response density and shape

Lean optimises the reader's scanning time, not raw token count. It compresses
depth, never breadth: if an answer touches eight things, it names all eight and
reduces only the elaboration around each.

Failures, skipped steps, assumptions, and unverified claims are never
compressed away. Neither is the work product: density governs the conversation,
not requested code, docs, reports, or files.

Lean shapes output for skimming: answer first, sets as lists with identifiers
leading, content grouped by what the reader must act on, and no ceremony on a
short answer.

The density levels are `terse`, `default`, and `full`. The model chooses the
level from the request and the detail the reader needs.

## `ticket-scope` — shared unit evaluation

Ticket-scope is the shared internal evaluator used by carve and pr-carver. It
checks outcome, seam, shape, acceptance, validation, uncertainty, risk,
breadth, blockers, and collisions. Vertical slices are preferred; constrained
layered slices are valid when a real contract or migration order requires them.

## `/carve` — size the work

Carve layers sizing and collision coordination onto a spec-derived ticket set.
It uses ticket-scope first, then requires each resulting piece to fit one main
subagent. Work that does not fit is split; an open design choice or risk
boundary is flagged for a human. Related pieces record dependencies and
shared-resource collisions so dispatch-work can parallelise safely.

Invoke `/carve` explicitly after the work has been reduced to a spec and ticket
set.

## `pr-carver` — size and structure PRs

PR Carver independently measures additions and deletions and raises size-watch
bands at 500 and 1000 changed lines. It uses ticket-scope to recommend
independent PRs first, then GitHub native stacked PRs, ordinary stacked Git
PRs, or one PR when splitting adds no value. Keeping a Band 3 PR as one unit
requires confirmation; branch and PR mutations always require authorization.

## `/dispatch-work` — run the tracker

Dispatch-work takes an already-carved tracker and keeps a small batch of
independent pieces in flight. Each piece is implemented, independently
reviewed, and babysat through PR approval in separate subagent contexts.
Invoking it again resumes from live tracker, branch, and PR state.

Invoke `/dispatch-work` explicitly.

Carve and dispatch-work use the repository model policy when one exists.
Otherwise they read `subagent.model` and `subagent.effort` from the active
`lean.config.json`. Those values apply to every implementation, review, and
PR-babysitting spawn; there is no routing ladder. Lean, ticket-scope, and
pr-carver do not read that config.

## `/incident-investigation` — isolate incident causes

Incident-investigation maps the user-visible request path, inventories
available evidence, narrows the failing boundary with high-information checks,
and drills from symptoms to a supported causal mechanism. It is read-only:
mitigation and remediation remain decisions for the authorized owner.

Its eval suite follows Anthropic's `evals/evals.json` core schema and uses one
dependency-free harness for static validation, explicit/ambient invocation,
fresh without-skill/with-skill runs, deterministic direction checks, and blind
LLM judging:

```bash
node skills/incident-investigation/scripts/run-evals.js --mode static
node skills/incident-investigation/scripts/run-evals.js --mode all
```

The default is static-only and incurs no model cost. Full runs use isolated
project workspaces, no tools, per-call budgets, and ignored result directories.

## What was measured

Eighteen paired subagent runs on Claude Opus 5, with and without Lean, across
nine evals produced chat responses **45–52% shorter at identical coverage**:
24 of 24 scan findings were named either way, and all six release-note claims
were verified either way.

On the eval with real breadth pressure, the unaided baseline dropped a finding,
emitted a YAML block mid-answer, and scored 2/5 against Lean's 5/5.

Two limits:

- A smaller-model breadth eval retained 17 of 24 findings with density guidance
  and 14 without it. Density guidance helps but cannot overcome a model's
  capability ceiling.
- Each eval cell had one run. The length effect was large and consistent across
  all nine evals; pass-rate differences on easier evals were not
  distinguishable from noise.

## Licence

MIT — see [LICENSE](LICENSE).
