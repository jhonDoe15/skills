# Transports

The routing rules are transport-independent. Only *how a tier gets spawned*
changes. Set `"transport"` in `lean.config.json` to one of the three below.

**Pick by goal, because the two main options serve different ones.** `unified`
keeps your main context small — a native subagent's exploration never enters your
window. `codex-cli` moves work onto a second account: your context is untouched
either way, but the tokens land on a different bill. Conflating the two is how
people wire up an elaborate setup that does not do what they wanted.

---

## `codex-cli` — separate Claude and Codex accounts

Main runs in Claude Code on your Anthropic account. The cheaper tiers run as
`codex exec` processes on your OpenAI account. Both operate on the **same working
tree**, which is what makes the handoff cheap: the code state travels through the
filesystem, not through the prompt.

### Setup

```bash
npm install -g @openai/codex
codex login
```

### The command

```
codex exec -m {model} -c model_reasoning_effort="{effort}" --sandbox workspace-write --cd "{cwd}" "{prompt}"
```

Prefer piping the handoff from a file — briefs contain quotes, newlines and paths
that do not survive inline shell quoting on Windows:

```
codex exec -m gpt-5.6-terra -c model_reasoning_effort="medium" --sandbox workspace-write - < handoff.md
```

PowerShell equivalent:

```
Get-Content handoff.md | codex exec -m gpt-5.6-terra -c model_reasoning_effort="medium" --sandbox workspace-write
```

Codex flag syntax has shifted between versions. Check `codex exec --help` before
the first real hop.

### `--sandbox workspace-write` is not optional

It is in the commands above deliberately. Codex defaults to read-only, and a
read-only implementation tier is the worst failure mode available here: the spawn
succeeds, the agent reports plausible work, and nothing was written. You discover
it when you look at the diff and there isn't one.

Grant the narrowest mode that still lets it edit the repo. It is running an
OpenAI model against your code with the same reach you have.

### Nothing verifies model ids for you

`codex --version` confirms the CLI exists. It cannot confirm that
`gpt-5.6-luna` and `gpt-5.6-terra` are available on your account under those exact
names. Run one throwaway `codex exec` per tier before trusting the routing — a
wrong id means the spawn fails and the work quietly stays on the top tier, which
looks exactly like the ladder deciding not to delegate.

Fix wrong names in `lean.config.json` under `tiers.<tier>.models.codex-cli`, and
nowhere else.

---

## `unified` — one harness, every model

Cursor, or anything else where every model is spawnable natively. No shell-out:
you use the harness's own subagent mechanism, and the subagent's context stays
out of yours. This is the transport that saves main-context tokens.

**Pin the model explicitly on every spawn.** A subagent that inherits the parent
model silently defeats the entire ladder — the work looks routed and you pay
top-tier prices for cheap-tier work. If your harness cannot pin a model per
subagent, this transport does not work for you.

Set `tiers.<tier>.models.unified` to whatever ids your harness uses. Reasoning
effort comes from `tiers.<tier>.effort`; if the harness does not expose it, the
ladder is tier-only and that is worth knowing.

Note that Claude Code hooks do not fire in Cursor, so the card never injects
there — see "Hosts without hooks" in the `lean` skill for the fallback.

---

## `claude-native` — fallback, no external dependencies

Claude-only tiers via the Agent tool with a `model` override: haiku, sonnet,
opus. Real tiering with nothing to install and nothing to log into.

Use it when Codex is unavailable, or to exercise the routing before committing to
a cross-account setup. The economics are less dramatic than the Opus/Terra/Luna
ladder, but every rule behaves identically.

---

## Nested spawning

Default to flat: only the top tier spawns. One writer in the tree, and every hop
visible in one place.

A middle tier spawning the cheap tier directly saves a round trip on the common
"scoped it, now type it" pattern. The cost is that a nested spawn leaves no trace
in the parent's report unless the brief explicitly demands one — and the middle
tier is not the one you would trust to be rigorous about bookkeeping under
pressure. Try it once the flat loop is working, not before.

Never nest two levels. The cheap tier spawns nothing.
