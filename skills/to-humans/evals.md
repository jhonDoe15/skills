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

`evals/index.js` grades normalized observations. It checks exact observed
routing, requested-item preservation, structural minimums, protected work
products, forbidden prose signals, and the no-em-dash rule. Semantic phrasing
stays with blind judgment. Qualitative judge dimensions cover reader fit,
completeness, decision quality, and contextual voice.

The fixtures under `test/fixtures/` are dependency and Primary-selection
tracers only. They contain no production behavior, are not named `SKILL.md`,
and enter only temporary test packages. Trigger cases run through the shared
trigger seam before owner-local grading of the retained routing evidence.

Run the local contract tests with:

```sh
node --test skills/to-humans/test/to-humans.test.js
```

These static and fixture checks do not constitute adoption evidence. Paid or
credentialed host campaigns remain part of the suite-wide adoption work.
