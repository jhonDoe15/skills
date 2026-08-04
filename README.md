# skills

Agent skills. One Claude Code plugin, two skills: **lean** and **lean-routing**.

## Install

As a Claude Code plugin:

```
/plugin marketplace add jhonDoe15/skills
/plugin install lean@jhonDoe15
```

Or with the `skills` CLI, for any agent that reads `SKILL.md`:

```
npx skills add jhonDoe15/skills
```


The repo is laid out to serve both installers: `skills/lean/SKILL.md` is where
the `skills` CLI looks, and the root `.claude-plugin/` manifests make the same
tree a single-plugin Claude Code marketplace.

Nothing here reads or transmits your data. The skill ships a hook that writes a
routing ledger to `.claude/.lean/ledger.json` inside whatever project you run it
in, and nothing else touches the filesystem.

---

Both share one rule — **correctness outranks cost** — and each has an override
that ignores its own economics when getting it right is at stake.

## lean — response density and shape

Compress depth, never breadth — if the answer touches eight things it names
eight things, and what shrinks is how much is said about each. Told merely to
"be brief", a model covers the three most interesting items and silently drops
five; that is omission, not compression, and the reader cannot tell which
happened.

Failures, skipped steps, assumptions and unverified claims are never compressed
away. Neither is the work product: a terse setting governs the conversation,
never the code, docs or files you asked for.

Output is shaped for skimming, because the goal is the reader's scanning time
rather than the token count — answer in the first line, sets as lists with the
identifier leading, grouped by what the reader must act on, no ceremony on a
short answer.

A `UserPromptSubmit` hook injects a ~390-token card on every prompt, so the
rules apply without being invoked. Three levels:

```bash
python "${CLAUDE_PLUGIN_ROOT}/skills/lean/scripts/route.py" density terse|default|full
```

## lean-routing

Moves a single evolving task across a cheap/mid/main tier ladder, routing on the
uncertainty that remains *now* rather than the task's original size. A large task
whose approach is settled belongs on the cheap tier; a one-line change whose
correct behaviour is still open does not.

Tier changes are gated by a deterministic ledger rather than by model memory. It
blocks oscillation (a scope that moved `cheap → mid` does not move back), refuses
handoffs with too little work left to repay them, enforces a capability floor,
and caps hops per scope and per task. Escalating to the top tier on a design
question or a risk flag is never blocked by any of it.

Transports: the Codex CLI over a shared working tree (separate Claude and OpenAI
accounts), a unified harness where every model is natively spawnable, or a
Claude-only fallback with no external dependencies. Model ids live in
`lean.config.json` and nowhere else.

```bash
python "${CLAUDE_PLUGIN_ROOT}/skills/lean/scripts/route.py" doctor
python "${CLAUDE_PLUGIN_ROOT}/skills/lean/tests/test_rules.py"   # 42 tests, no deps
```

---

## What was measured

Eighteen paired subagent runs on Claude Opus 5, with and without the skill,
across nine evals. Chat responses came out **45–52% shorter at identical
coverage** — 24 of 24 scan findings named either way, all six release-note claims
verified either way.

On the one eval that applied real breadth pressure, the unaided baseline dropped
a finding, emitted a YAML block mid-answer, and scored 2/5 against the skill's
5/5.

Two honest limits:

- **Coverage guarantees do not transfer down-tier.** Given the same 24-item task,
  Claude Haiku 4.5 held 17 findings with the card and 14 without — better, but
  nowhere near complete. No amount of prompt fixes a model ceiling, which is why
  `references/routing.md` now treats item breadth as a tier signal in its own
  right.
- **Single run per cell.** The length effect is large and consistent across all
  nine evals; the pass-rate delta on the easier evals is not distinguishable from
  noise.

---

## Licence

MIT — see [LICENSE](LICENSE).
