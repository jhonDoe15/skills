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

The shared v2 trigger grader consumes exact normalized Skill lifecycle events.
Package inventory, resolved dependency closure, generic tool use, output prose,
and case identifiers cannot satisfy activation. Owner-local deterministic
grading checks requested-item preservation, answer-first ordering, distinct
accountable actions, scenario-grounded decision fields, structural minimums,
protected code, schema, data, and quotes, forbidden prose signals, and the
no-em-dash rule. It does not require canned headings or exact prose.

The fixture under `test/fixtures/` is a dependency tracer only. It contains no
production behavior, is not named `SKILL.md`, and enters only temporary test
packages. Explicit normalized lifecycle fixtures test the v2 grader and
Adapter contract. They do not prove semantic prompt routing. That evidence
requires later adoption campaigns through real hosts.

Run the local contract tests with:

```sh
node --test skills/to-humans/test/to-humans.test.js
```

These static and contract-fixture checks do not constitute adoption evidence.
Paid or credentialed host campaigns remain part of the suite-wide adoption
work.
