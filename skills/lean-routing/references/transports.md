# Transports

The routing rules are transport-independent. Only *how a tier gets spawned*
changes. Set `"transport"` in `lean.config.json` to one of the three below
and run `route.py doctor`.

---

## `codex-cli` — separate Claude and Codex accounts

Main runs in Claude Code on your Anthropic account. `cheap` and `mid` run as
`codex exec` processes on your OpenAI account. Both operate on the **same
working tree**, which is what makes the handoff cheap: the code state travels
through the filesystem, not through the prompt.

### Setup

```bash
npm install -g @openai/codex
codex login
```

Then verify:

```bash
python .claude/skills/lean/scripts/route.py doctor
```

### The one line you may need to change

`transports.codex-cli.command_template` in the config. Codex CLI flag syntax
has shifted between versions, and this template is deliberately isolated so a
version bump costs one edit rather than a rewrite:

```
codex exec -m {model} -c model_reasoning_effort="{effort}" --cd "{cwd}" "{prompt}"
```

Placeholders: `{model}`, `{effort}`, `{cwd}`, `{prompt}`, `{prompt_file}`.
Check yours with `codex exec --help` before the first real hop.

**`doctor` cannot verify model ids.** It confirms the CLI exists and runs; it
cannot confirm that `gpt-5.6-luna` and `gpt-5.6-terra` are available on your
account under those exact names. Run one throwaway `codex exec` per tier first.
If a name is wrong, fix it in `lean.config.json` under
`tiers.<tier>.models.codex-cli` — nowhere else.

### Running a hop

Prefer `--prompt-file`; handoffs contain quotes, newlines, and paths that do
not survive inline shell quoting on Windows.

```bash
python .claude/skills/lean/scripts/route.py spawn --tier mid --prompt-file .claude/.lean/handoff.md
```

It prints the exact command. Run it with the **Bash** tool — the emitted form
uses POSIX `<` redirection. The PowerShell equivalent is:

```
Get-Content .claude.lean\handoff.md | codex exec -m gpt-5.6-terra -c model_reasoning_effort="medium"
```

The subagent edits files directly. Its final message is the handoff report.

### Sandbox

`codex exec` needs write access to the tree to be useful as an implementation
tier. Add `--sandbox workspace-write` (or your version's equivalent) to the
template if your default is read-only. Grant the narrowest mode that lets it
edit the repo — it is running an OpenAI model against your code with the same
reach you have.

---

## `unified` — one harness, every model

Cursor, or anything else where all three models are spawnable natively. There
is no shell-out: `route.py spawn` prints a directive and you use the harness's
own subagent mechanism.

The only thing that matters here: **pin the model explicitly on every spawn.**
A subagent that inherits the parent model silently defeats the entire ladder —
every hop still gets recorded in the ledger, the audit trail looks healthy, and
you pay main-tier prices for cheap-tier work. If your harness cannot pin a
model per subagent, this transport does not work; use `codex-cli`.

Set `tiers.<tier>.models.unified` to whatever id your harness uses. Reasoning
effort comes from `tiers.<tier>.effort` — set it per spawn if the harness
exposes it, and if it does not, note that the ladder is then tier-only.

---

## `claude-native` — fallback, no external dependencies

Claude-only tiers via the Agent tool with a `model` override: `haiku` for
cheap, `sonnet` for mid, `opus` for main. Real tiering with nothing to install
and nothing to log into.

Use it when Codex is unavailable, or to exercise the routing logic before
committing to a cross-account setup. The economics are less dramatic than the
Opus/Terra/Luna ladder, but every rule in the skill behaves identically.

---

## Nested spawning

`policy.allow_nested_spawn` is `false` by default: only main spawns. Flat
routing keeps one writer in the tree and one complete audit trail.

With it enabled, `mid` may spawn `cheap` directly without returning to main
first. That saves a round trip on the common "Terra scoped it, Luna types it"
pattern. The cost is that the nested spawn only stays auditable if `mid`'s
brief explicitly instructs it to run `route.py commit` before spawning, and
`mid` is not the tier you would trust to be rigorous about bookkeeping under
pressure. Enable it once the flat loop is working and you have seen the ledger
stay honest — not before.

Never nest two levels. `cheap` spawns nothing.
