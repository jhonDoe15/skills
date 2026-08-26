# To Humans evaluations

The owner-local definitions under `evals/` cover four seams:

- `role.json` isolates human-writing behavior owned by `to-humans`.
- `component.json` compares the complete consumer with a test-only ablation of
  `writing-foundation`.
- `outcome.json` defines the complete public outcome and its matched No-Skill
  control.
- `trigger.json` covers ordinary and requested prose, canonical invocation,
  Audience and Primary co-selection, agent-facing exclusions, mixed readers,
  ambiguity, non-prose work, and Private dependency false activation.

Each definition uses the shared host-neutral evaluation contract and lists both
Claude Code and Cursor. The same cases and graders apply to either Adapter.
Host-specific setup, discovery events, execution, and cleanup stay in the
shared Adapters.

`evals/index.js` grades normalized observations. It checks routing, required
observable signals, protected work products, forbidden prose signals, and the
no-em-dash rule without requiring one exact response. Qualitative judge
dimensions cover reader fit, completeness, decision quality, and contextual
voice.

The Writing Foundation fixture under `test/fixtures/` is a dependency tracer
only. It contains no Foundation writing behavior, is not named `SKILL.md`, and
never enters production package construction.

Run the local contract tests with:

```sh
node --test skills/to-humans/test/to-humans.test.js
```

These static and fixture checks do not constitute adoption evidence. Paid or
credentialed host campaigns remain part of the suite-wide adoption work.
