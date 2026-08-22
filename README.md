# skills

One Claude Code plugin with three agent skills:

- **Lean** — model-invoked writing guidance for response density and shape.
- **`/carve`** — explicitly invoked to size a spec-derived ticket set so each piece fits one main subagent.
- **`/dispatch-work`** — explicitly invoked to run an already-sized tracker in parallel and carry each piece through implementation, review, and PR approval.

Lean is selected automatically by the model when its description matches the
response being written. Carve and dispatch-work run only when the user invokes
them.

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

## `/carve` — size the work

Carve layers sizing and collision coordination onto a spec-derived ticket set.
Each resulting piece must fit one main subagent. Work that does not fit is split;
an open design choice or risk boundary is flagged for a human. Related pieces
record dependencies and shared-resource collisions so dispatch-work can
parallelise safely.

Invoke `/carve` explicitly after the work has been reduced to a spec and ticket
set.

## `/dispatch-work` — run the tracker

Dispatch-work takes an already-carved tracker and keeps a small batch of
independent pieces in flight. Each piece is implemented, independently
reviewed, and babysat through PR approval in separate subagent contexts.
Invoking it again resumes from live tracker, branch, and PR state.

Invoke `/dispatch-work` explicitly.

Carve and dispatch-work use the repository model policy when one exists.
Otherwise they read `subagent.model` and `subagent.effort` from the active
`lean.config.json`. Those values apply to every implementation, review, and
PR-babysitting spawn; there is no routing ladder. Lean does not read that
config.

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
