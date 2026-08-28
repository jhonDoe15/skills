# skills

Agent Skills including these documented planning surfaces:

- **Lean** — model-invoked writing guidance for response density and shape.
- **`ticket-scope`** — private per-candidate judgment loaded by Slice Plan and PR Carver.
- **`slice-plan`** — private set-level decomposition loaded by Carve.
- **`/carve`** — explicitly invoked to turn settled requirements into a ready ticket DAG.
- **`pr-carver`** — model-invoked, read-only topology guidance for existing branches and pull requests.
- **`/dispatch-work`** — explicitly invoked to run an authorized published ticket DAG through moving parallel Take Ticket frontiers.
- **`/incident-investigation`** — explicitly invoked, investigation-only guidance for evidence-led production incident and hard-to-localize bug analysis.

Lean and pr-carver are selected automatically by the model when their
descriptions match the work. Ticket Scope and Slice Plan activate only when
their declared consumers load them. Carve, dispatch-work, and
incident-investigation run only when the user explicitly invokes them.

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

The workflow skills reference companion skills when their branches are used.
Dispatch Work requires the canonical Take Ticket (`take-ticket`) and Take It
Offline (`take-it-offline`) skills. Other workflows may also require
`/to-tickets`, `/to-spec`, `/wayfinder`, `/implement`, `/code-review`, or
`/autopilot`; install those separately in the host that runs the workflows.

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

## `ticket-scope` — private unit evaluation

Ticket Scope is the private per-candidate evaluator loaded by Slice Plan and PR
Carver. It checks outcome, seam, shape, acceptance, validation, uncertainty,
risk, breadth, blockers, and collisions. Slice Plan accepts vertical slices or
concrete prerequisites for the ordinary Carve path. PR Carver can also consume
a constrained layered result when a real contract or migration order requires
a separately landing PR.

## `/carve` — size the work

Carve turns settled source requirements into a complete ready ticket DAG. It
loads Slice Plan for set-level decomposition; Slice Plan loads Ticket Scope for
each bounded candidate judgment. Work that does not fit is split; an open
design choice or risk boundary is flagged for a human. Related pieces record
dependencies and shared-resource collisions so later execution can
parallelise safely.

Invoke `/carve` explicitly after requirements and material design decisions are
settled. Carve publishes only with separate explicit authorization.

## `pr-carver` — assess PR topology

PR Carver uses Ticket Scope to identify natural mergeable units, then recommends
topology from concrete prerequisite edges and normal, prefactor, or
expand-contract migration treatment. Shared-resource collisions remain
serialization metadata rather than dependency edges. Assessment is read-only;
every later branch or pull-request mutation requires separate authorization for
the named operation and target.

## `/dispatch-work` — run the tracker

Dispatch Work consumes explicit execution authorization and a published ready
ticket DAG. It starts each independent eligible ticket through canonical Take
Ticket, then advances dependencies and starts newly unblocked tickets on each
complete authoritative reviewed-ticket completion event without waiting for
unrelated work. Completed-frontier synthesis consumes compact implementation
handoffs and Review briefs without repeating per-ticket review.

Invoke `/dispatch-work` explicitly.

Carve uses the repository model policy when one exists. Otherwise it reads
`subagent.model` and `subagent.effort` from the active `lean.config.json`.
Lean, ticket-scope, and pr-carver do not read that config.

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
