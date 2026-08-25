# Incident Investigation Evaluation Suite

## Purpose

[`evals/evals.json`](evals/evals.json) is the single source of truth for
trigger cases, functional prompts, expectations, deterministic assertions,
safety checks, and judge dimensions. Its core fields follow Anthropic Skill
Creator's `evals.json` schema. The `evaluation` metadata and additional fields
conform to the shared contracts in [`../../suite/evaluation`](../../suite/evaluation).

The local CLI uses the shared evaluator with a thin Claude Code transport.
Every functional case runs matched No-Skill and treatment arms after canonical
package closure. The treatment installs the canonical Incident Investigation
package in an isolated temporary project. Sessions load project settings only,
expose no tools, persist no conversation, and receive only the sanitized
scenario in the JSON. The same shared contracts accept Cursor execution through
its separately owned production Adapter.

Run from the repository root:

```bash
node skills/incident-investigation/scripts/run-evals.js
node skills/incident-investigation/scripts/run-evals.js --mode trigger
node skills/incident-investigation/scripts/run-evals.js --mode behavior --runs 1
node skills/incident-investigation/scripts/run-evals.js --mode all
node skills/incident-investigation/scripts/run-evals.js --mode all --json
node skills/incident-investigation/scripts/run-evals.js --mode check --results-dir <path>
node skills/incident-investigation/scripts/run-evals.js --mode replay --results-dir <path>
node skills/incident-investigation/scripts/run-evals.js --mode report --results-dir <path>
```

The default is static-only and has no model cost. `trigger`, `behavior`, and
`all` call the configured models and enforce a per-call budget. Outputs,
metrics, deterministic grades, blind comparisons, and the final summary are
written under the ignored `.eval-results/` directory unless
`--results-dir` is supplied. Use `--resume` with that directory to retain
only complete successful runs with matching fingerprints. `check` validates
retained run evidence without host or model calls. `replay` reconstructs trigger
and outcome results and fails closed on incompatible evidence. `report` performs
the same offline replay and writes an uncommitted Adoption report. Neither mode
calls a host or model.

## Gated evaluation ladder

Run gates in order. A failed lower gate blocks the next gate.

### Gate 1: Static contract

Check the skill and plugin files for:

- valid frontmatter with `name`, `description`, and
  `disable-model-invocation: true`;
- a human-facing description without model-trigger wording;
- required workflow and output sections;
- fewer than 500 lines in `SKILL.md`;
- one-level references and consistent terms;
- valid JSON plugin metadata.

### Gate 2: Deterministic direction

The harness reads required signals and ordering from the JSON, then checks
every treatment output for:

```text
incident frame
→ capability inventory
→ request/system map
→ boundary check
→ hypothesis prediction
→ check/query
→ result and hypothesis confidence
→ causal conclusion or evidence gap
```

Control outputs are recorded as baselines; treatment outputs gate progression.
The signal patterns are structural checks, not semantic proof. Case-specific
signals cover symptom re-zooming, missing evidence, user-owned checks,
remediation boundaries, and untrusted artifacts. Negative safety patterns
catch direct mutation claims; authorized-owner recommendations remain allowed.

### Gate 3: Qualitative LLM judge

Run this gate only after static, trigger, and deterministic treatment gates
pass. The harness blindly randomizes each control/treatment pair and asks an
independent judge to grade every expectation and score the JSON-defined
dimensions:

- framing and impact scope;
- capability discovery and limitation awareness;
- map accuracy and explicit unknowns;
- information gain from boundary checks;
- hypothesis predictions and evidence updates;
- causal depth and symptom re-zooming;
- tool selection;
- confidence, stopping, and user handoff;
- investigation-only and untrusted-artifact safety.

The aggregate passes only when treatment expectation pass rate and blind win
rate meet the JSON thresholds, and no dimension falls below its minimum.
Finding the right component is insufficient without the investigation path.

## Baseline and result record

Each result directory contains a campaign manifest and schema-valid run and
judgment evidence. Every repetition records host, requested and resolved model,
case, arm, package revision, frozen execution configuration, status, duration,
cost, observed tool use, attempted mutations, output, deterministic grade, and
covered-input fingerprints. Blind judgments retain the judge model, rubric,
seeded placement, structured result, and comparison fingerprint.
Explicit and ambient activation cases retain a separate trigger campaign and
use the same run-evidence schema.

Offline replay rejects missing, stale, partial, mismatched, or tampered
evidence. Its verdict and Adoption report cover Incident Investigation and the
shared machinery only. They do not claim complete 19-Skill Contract coverage or
make the suite release decision. Keep fixtures sanitized; credentials, private
keys, raw customer data, and unnecessary identifiers do not belong in the JSON.
