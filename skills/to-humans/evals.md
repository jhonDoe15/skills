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
Claude Code and Cursor. Fresh runs compare matched with-Skill and No-Skill
configurations; the component seam compares the complete consumer with the
Foundation ablation. Host-specific setup, discovery events, execution, and
cleanup stay in the shared Adapters.

The shared v2 trigger grader consumes exact normalized Skill lifecycle events.
Package inventory, resolved dependency closure, generic tool use, output prose,
and case identifiers cannot satisfy activation.

The shared default grader is limited to mechanical facts represented in JSON:
exact protected code, schema, data, and quote lines, plus exact forbidden
characters where the case makes that unambiguous. It does not grade sentence
meaning. Answer-first ordering, accountable owner/action relationships,
recommendation, basis, material uncertainty, change condition, proposition
polarity and direction, clarity, contextual voice, neutral-record behavior,
and non-hollow prose are explicit case expectations and blind-judge
dimensions. Every assertion or dimension pass must quote or reference specific
output evidence. Sampled human review checks the outputs and grades in context.

The fixture under `test/fixtures/` is a dependency tracer only. It contains no
production behavior, is not named `SKILL.md`, and enters only temporary test
packages. Explicit normalized lifecycle fixtures test the v2 grader and
Adapter contract. They do not prove semantic prompt routing. That evidence
requires later adoption campaigns through real hosts.

The owner-local `evals/index.js` only loads definitions and extracts protected
fixture segments; it is not a custom grader. Content-addressed replay of custom
JavaScript graders is deferred and is not a dependency. Generated run
directories, grading payloads, reports, benchmark data, and viewer output stay
uncommitted.

Run the local contract tests with:

```sh
node --test skills/to-humans/test/to-humans.test.js
```

These static and contract-fixture checks prove only schema, mechanical-grader,
and lifecycle contracts. They do not constitute semantic-quality or routing
adoption evidence. Fresh blind comparisons and sampled human review remain
later adoption work; no paid or credentialed calls run here.
