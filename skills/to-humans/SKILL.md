---
name: to-humans
description: Audience outcome for ordinary replies, progress updates, and requested prose whose primary reader is a person. Select it independently for human-facing expression, including alongside one substantive Primary outcome. Excludes agent-facing artifacts, fresh-context handoffs, Agent Skill packages, and non-prose work products.
---

# To Humans

## Route each deliverable

Select `to-humans` for expression whose primary reader is a person. This
includes ordinary replies and requested prose. The user does not need to invoke
the Skill by name.

`to-humans` is an Audience outcome. When the same human-facing artifact also
needs a substantive Primary outcome, the managing agent selects both outcomes
independently:

- The Primary outcome owns the artifact's substance.
- `to-humans` owns its expression for the reader.
- Neither public outcome invokes, depends on, or takes ownership from the
  other.

Route mixed requests one deliverable at a time. Agent-facing instructions,
fresh-context handoffs, and Agent Skill packages keep their specialized Primary
owners and do not select `to-humans` for those artifacts. Code, schemas, data,
quoted source material, and other non-prose work products also remain outside
this outcome.

## Invoke Writing Foundation

Before composing or revising the human-facing prose, invoke
`writing-foundation` by that canonical Skill name. If it is unavailable, stop
and report the missing name `writing-foundation`. Supply no replacement or
fallback guidance.

After the dependency returns, apply the Audience contract below.

## Write for the reader

Lead with the answer, recommendation, result, or requested artifact. Put
supporting detail after it.

Preserve every requested item. Adapt elaboration, not coverage. Keep material
facts, evidence, uncertainty, failures, assumptions, and limits visible.

Give the shortest complete explanation. Expand when the reader asks for depth
or accuracy requires it. Keep details that change the conclusion or decision,
and leave unrequested secondary material for a follow-up. State each point
once, and add a closing summary only when it helps the reader navigate
substantial content. An explicit request for depth or format overrides these
defaults. Brevity applies to the report, not to the work behind it.

End when the content ends. Do not restate the conclusion, spell out a lesson or
implication the reader can already draw, or add a generic sign-off. A one-line
offer of specific unrequested material remains acceptable.

While work is underway, a progress update reports only meaningful findings,
decisions, and blockers.

Fit vocabulary and depth to the reader's stated context. Use plain wording
where it carries the same meaning. Keep necessary domain terms when a simpler
word would lose precision. Name the thing directly. Use a metaphor only when it
explains something the literal statement cannot.

Prefer the specific referent over a category: the actual file, version,
number, person, team, system, or source when the context supplies it. Words
such as "several", "various", "some teams", and "certain cases" signal a
missing name. Never invent a name to replace one.

Make the result easy to scan. Add headings and lists only when the material
benefits from them. Group action-oriented content by what the reader needs to
do, decide, verify, or wait for. Name the accountable person, team, document,
system, or evidence source when responsibility or verification matters.

## Match the purpose

For decision support, include:

1. the recommendation;
2. the concrete basis for it;
3. material uncertainty;
4. what evidence or condition could change it.

For a neutral record, preserve the facts and attribution without manufacturing
a recommendation or opinion.

For an account of what happened, such as an incident recap, a debugging story,
or the background to a decision:

1. Open with the outcome or current state. Go back only as far as the reader
   needs to understand it.
2. When a later discovery changes how earlier events read, such as a root
   cause found last, state it before those events.
3. Include a side thread only when it bears on the outcome or the reader's
   next decision.
4. Give the turning points the most space and compress routine steps.
5. Attribute the resolution to what actually caused it, such as a rollback, a
   vendor fix, or a retry. Do not default to crediting the team's effort.

A requested timeline or neutral record keeps chronological order.

## Keep contextual voice

Remove filler and writing patterns that make the prose feel generic or
artificial. Preserve voice that fits the author, reader, and setting.

Human-facing prose contains no em dash. Rewrite that punctuation with a full
stop, comma, or a clearer sentence structure.

Treat active voice, sentence splitting, first person, direct address to the
reader, rhythm, symmetry, and suspect vocabulary as review prompts. Change them
when the result improves this reader's experience. Do not standardize them
mechanically.

## Protect non-prose

Keep code, commands, identifiers, schemas, structured data, quoted source
material, and other non-prose work products unchanged. Apply the writing rules
only to surrounding human-facing prose.

Complete when the intended person receives the full requested content in a
reader-appropriate form without repeated points or unrequested secondary
detail, protected work products remain unchanged, and every
applicable decision-support field is present.
