---
name: lean
description: >-
  Compress a response to full coverage at low depth, shaped so it can be
  skimmed. Use when a reply needs tightening, when an answer came out long or
  hard to scan, or when another skill needs the density and shape rules.
---

# Lean

**Optimise the reader's scanning time, not the token count.** Fewer tokens is a
side effect worth having; make it the objective and you get dense unreadable
blocks that are technically short. A slightly longer answer that can be skimmed
beats a shorter one that must be read in full.

A hook injects the working rules on every prompt, and again after a compaction,
so this file is the reasoning behind them rather than a thing to invoke. Read it
when a rule needs interpreting, or when you are changing one.

The rules steer by being in the prompt. Nothing here grants or denies
permission — there is one script, and its only job is printing the card.

## If the card never appears

Installed with `npx skills add`, no hook is registered — that installer handles
skill directories, not hooks. Register it once:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/lean/scripts/card.mjs" --install-hook
```

Merges into `settings.json`, backs it up, and is safe to re-run. `--project`
scopes it to one repo instead of your user settings.

## Hosts without hooks

Claude Code hooks do not fire in Cursor, Zed, or any other host that does not
read `.claude/settings.json`. The rules then never reach the model and the whole
thing is inert — which looks identical to it being installed and ignored.

Where that applies, write the card into whatever file the host always loads —
run this **from a terminal inside that host**, so it detects the right one:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/lean/scripts/card.mjs" --write AGENTS.md
```

Or set `transport` explicitly in `lean.config.json` and generate it anywhere;
that is the safer route, since a card generated elsewhere bakes in whatever host
*that* machine detected.

It is a snapshot either way — re-run after changing the config. Losing the
post-compaction re-injection is the real cost: a long session drifts back to its
defaults, and only a fresh write or a new session restores the rules.

## Compress depth, never breadth

If the answer touches eight things, name eight things. What shrinks is how much
you say about each.

This is the rule ordinary "be brief" instructions get wrong. Told to be brief, a
model covers the three most interesting items and drops five — and the reader
has no way to tell omission from concision. Lists exist partly for this: a set
rendered as prose can quietly cover five of eight and still read as complete,
where a list of five cannot.

Grammar is not the axis; elaboration is. Sentences stay normal. What goes is the
second example, the justification nobody asked for, the tutorial on a library
the reader already uses.

## Bury nothing

Open with the answer. A reader who stops at the first line still has it, which
is what makes every following line optional rather than mandatory — and optional
lines are the only ones a reader can safely skip.

The reader is not asking "what did you find". They are asking **what do I act
on, and what can wait**. Group by that. "Blocking / this week / backlog" beats
"security / performance / style": a taxonomy mirroring your analysis hands the
reader the sorting you skipped.

## What density never touches

**The work product.** Code, docs, commit messages, and any file you were asked
to produce keep their full length and quality. A terse setting governs the
conversation about the work, never the work. If the request was a detailed
report, the report is detailed and the message carrying it is short.

**Reasoning.** Think as long as the problem needs.

**Load-bearing content**, at any density: failures, skipped steps, unverified
claims, the assumptions you made to proceed, and anything that changes what the
reader does next. Compression is never a reason to round "passes locally, CI
untested" up to "tests pass".

## Ceremony scales with the answer

A two-sentence answer takes no header, no bullet, no bold. Structure is a
response to complexity that already exists — adding it so an answer looks
thorough is the likeliest way these rules backfire, and it costs the reader more
scanning than it saves.

## When to expand past the level

Correctness outranks cost, the same override the routing half carries. Expand
when the reader is working from a wrong premise, when a caveat would change the
conclusion, when safety or irreversibility is in play, or when they asked "why".

**A follow-up asking for more depth is the dial working** — pre-empting those
questions is what inflates answers in the first place. A follow-up needed to
*discover* something you omitted is the failure. Depth is negotiable across
turns; coverage is not.

## Levels

`terse` (answer alone), `default` (answer plus one line of why per non-obvious
call), `full` (no compression — for teaching and design discussion).

Set the default in `lean.config.json` under `response.density`. To change it for
one exchange, just say so — "keep it terse", "give me the full version" — the
rules are prompt text, not a setting a script enforces.

**Where the config lives**, most specific first: `$CLAUDE_LEAN_CONFIG`, then
`<project>/.claude/lean.config.json`, then `~/.claude/lean.config.json`, then the
copy bundled with the skill. Edit one of the first three — the bundled copy is a
read-only default and is replaced on every plugin update. Copy it as a starting
point:

```bash
cp "${CLAUDE_PLUGIN_ROOT}/skills/lean/lean.config.json" ~/.claude/lean.config.json
```

## Going deeper

- `references/density.md` — how much to say, with worked before/after examples
- `references/structure.md` — what shape it arrives in, with a worked example
- The `admino` skill — the other half: which model should do the next phase of a
  task. Shares this skill's config and hook.
