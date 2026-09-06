# Plan-evaluation model candidates

Research snapshot: 2026-09-04
Ticket: [#77, “Inventory strong planner and judge configurations”](https://github.com/jhonDoe15/skills/issues/77)
Canonical map: [#75, “Improve implementation planning through a plan-only architecture ladder”](https://github.com/jhonDoe15/skills/issues/75)

## Conclusion

Use a **plan-only, model-cell tournament**. For each exact planner model
configuration, the baseline and treatment receive the same ticket, immutable
repository snapshot, rubric, and bounded-run policy:

- **Baseline:** the planner produces a combined technical architecture,
  implementation-slice plan, and TDD test plan without access to
  `implementation-planning`.
- **Treatment:** the same planner model produces that combined implementation
  blueprint with the pinned `implementation-planning` package available and
  successfully loaded.

The measured object is the blueprint. No implementation agent runs; no product
code is generated, compiled, tested, reviewed, committed, or merged. A blueprint
may establish that its proposed implementation and proof are coherent, but it
cannot establish that the unimplemented product works.

A defensible provisional three-family planner roster is:

1. GPT-5.6 Sol;
2. Claude Opus 5;
3. Grok 4.6.

Cursor has first-party pages for all three and describes each as a strong model
for difficult agentic or coding work
([GPT-5.6 Sol](https://cursor.com/docs/models/gpt-5-6-sol),
[Claude Opus 5](https://cursor.com/docs/models/claude-opus-5),
[Grok 4.6](https://cursor.com/docs/models/grok-4-6)).
This supports a **family roster**, not exact campaign configurations. Exact IDs,
parameter values, effort levels, service tiers, and account entitlements must
come from the campaign account's live Cursor catalog before the plan is sealed
([Cursor SDK model discovery](https://cursor.com/docs/sdk/typescript#cursormodelslist)).

Gemini 3.1 Pro is the preferred model to **calibrate as** the common semantic
judge because it is a fourth provider family and Cursor documents it as
Agent-capable with strong reasoning and coding capability
([Cursor: Gemini 3.1 Pro](https://cursor.com/docs/models/gemini-3-1-pro)).
That is a judge candidate, not evidence that it is calibrated for this rubric.
The final roster, exact variants, judge, stochastic repetition count, retry
rules, correction-cycle semantics, and the exact 15–25 minute wall cap remain
decisions for [#80, “Choose the planner tournament and bounded run policy”](https://github.com/jhonDoe15/skills/issues/80).

## Facts that can be sealed

### Product availability is not account availability

- Cursor documents `gpt-5.6-sol` and separate standard and fast service tiers
  ([Cursor: GPT-5.6 Sol](https://cursor.com/docs/models/gpt-5-6-sol)).
- Cursor documents Claude Opus 5 and recommends high thinking for its strongest
  results ([Cursor: Claude Opus 5](https://cursor.com/docs/models/claude-opus-5)).
  Anthropic independently documents `claude-opus-5`, adaptive thinking, and
  `low` through `max` effort
  ([Anthropic: Claude Opus 5](https://docs.anthropic.com/en/docs/about-claude/models/whats-new-claude-4-8)).
- Cursor documents Grok 4.6 with `low`, `medium`, `high`, and `xhigh` effort
  ([Cursor: Grok 4.6](https://cursor.com/docs/models/grok-4-6)).
- Cursor documents Gemini 3.1 Pro as available to Cursor Agent
  ([Cursor: Gemini 3.1 Pro](https://cursor.com/docs/models/gemini-3-1-pro)).

These public pages do not prove availability to the campaign account.
Account-specific availability, entitlements, parameter values, and rate limits
remain unverified; this research does not report a paid run.

At campaign-planning time, save the authenticated `Cursor.models.list()` result
without credentials, its hash, the CLI and SDK versions, and each fully expanded
selection. Cursor says model parameter IDs and allowed values vary by model and
are discoverable from that catalog
([Cursor SDK model parameters](https://cursor.com/docs/sdk/typescript#model-parameters)).
Abort if a candidate is absent; do not substitute `auto`, `latest`, or Cursor
Router because routing can change the underlying model
([Cursor Router](https://cursor.com/docs/cursor-router)).

The repository already rejects ambiguous aliases, canonicalizes explicit
parameters, and fingerprints selections
([`suite/model-selection.js:6-15`](../../suite/model-selection.js#L6-L15),
[`suite/model-selection.js:56-107`](../../suite/model-selection.js#L56-L107)).
Its Cursor adapter requires every catalog parameter, rejects unknown values,
compares the resolved run model with the request, and makes successful evidence
require verified identity
([`suite/adapters/cursor.js:581-678`](../../suite/adapters/cursor.js#L581-L678),
[`suite/adapters/cursor.js:699-735`](../../suite/adapters/cursor.js#L699-L735),
[`suite/index.js:800-862`](../../suite/index.js#L800-L862)).
This SDK-backed adapter is the appropriate existing execution path for
model-ranking evidence.

### Candidate cells are not repetitions

A **model cell** is one exact catalog selection: model ID, every explicit
parameter, service tier, host adapter, and catalog fingerprint. The three
recommended families become three cells only after those fields are resolved
and sealed. A **stochastic repetition** is a fresh run of one cell on one case
and arm. Repetitions estimate within-cell instability; adding repetitions does
not add model candidates.

The experimental unit is:

`cell fingerprint × case × repetition × arm × attempt`.

The repository's core evaluation manifest can hold multiple distinct cells and
an independent positive repetition count
([`suite/evaluation/index.js:1149-1182`](../../suite/evaluation/index.js#L1149-L1182)).
Its pairing identity includes case, host, exact model, and repetition
([`suite/evaluation/index.js:1471-1479`](../../suite/evaluation/index.js#L1471-L1479)).
The static planning role definition already declares `no-skill` and `treatment`
arms and three runs per configuration
([`skills/implementation-planning/evals/role.json:1-15`](../../skills/implementation-planning/evals/role.json#L1-L15)).

A reasonable starting proposal for #80 is three cells × two arms × three fresh
repetitions per case: 18 planner runs per case before judging. Three repetitions
are exploratory stability evidence, not a strong population-level superiority
claim.

## Plan-only estimands and reporting

For each case and repetition, run a fresh baseline and treatment with the same
sealed planner cell. Reuse only the immutable input snapshot and predeclared
policy; do not share agent state or conversation history. Randomize arm order.

Report two different questions:

1. **Skill effect:** within each model cell, report every paired
   `treatment − baseline` difference, then a pooled estimate with model-cell
   interaction visible. This answers whether the skill improves plans and
   whether its effect differs by model.
2. **Planner recommendation:** compare every treatment output's absolute
   deterministic validity and semantic scores by cell. This answers which model
   works best with the skill.

Do not use the best output from either arm as the model score or skill-effect
estimate. Timeouts, cancellations, empty outputs, malformed structures,
contamination, and model mismatches stay in the denominator with their
predeclared failure score.

The user may still choose the best **valid** blueprint for operational use after
the experiment. Record that separately as
`selected_output_fingerprint`, selection rule, and selection reason. That
downstream choice must not replace, censor, or reweight any run in model
recommendation or causal reporting.

For every run retain:

- requested and resolved model selections and catalog fingerprint;
- case, arm, repetition, attempt, request, run, and agent identities;
- immutable ticket/repository/skill/rubric identities;
- complete blueprint output and terminal status;
- each deterministic validation result and diagnostic;
- every absolute semantic dimension, cited finding, and judge identity;
- wall duration, token fields, billed usage, and failure code;
- planning draft/review/integration revision records and finding dispositions;
- attempted mutations and skill-load evidence.

Publish candidate-level records first, then per-cell absolute distributions and
paired differences. Aggregates must link back to every retained record.

## Blueprint checks

Every nonempty retained output should receive the same two layers of checking.
A no-output terminal failure receives the predeclared floor without fabricating
a semantic judgment.

### Deterministic property oracle

Validate a normalized YAML architecture/test model against a versioned schema,
then validate:

- unique and typed requirement, module, interface, invariant, scenario,
  decision, implementation-slice, test, command, finding, and evidence IDs;
- all required fields and allowed status/finding dispositions;
- requirement → design → scenario → slice → test/proof traceability, with no
  dangling or orphaned IDs;
- Mermaid syntax for required dependency and behavioral views;
- every Mermaid node/edge reference against the same normalized IDs;
- cross-view ownership and dependency consistency;
- explicit plan-only boundary, no application implementation code, and zero
  repository mutation;
- correction count at or below three and one monotonic integrated revision
  ledger.

Deterministic validity is an absolute property of each output, not a paired
winner. Preserve every check and error path, including for an invalid plan.

### Blind common semantic judge

Use one pinned judge configuration and rubric for all planner cells and both
arms. Strip model, provider, skill, arm, timing, cost, and file-path labels.
Give candidates opaque IDs and treat their contents as untrusted data.

The judge should score each plan independently before any pair preference:
grounding and authority; requirement/behavior coverage; architecture and deep
module quality; proportionality and anti-slop; lifecycle and failure semantics;
TDD proof quality; finding integration; and implementability of the **plan**.
Every score or finding must cite blueprint evidence. Compute paired differences
from those absolute scores; a blind pair preference can remain secondary.

The current comparison payload correctly labels outputs as untrusted data,
randomizes A/B placement, and requires complete expectation and dimension
results for both candidates
([`suite/evaluation/index.js:2837-2868`](../../suite/evaluation/index.js#L2837-L2868),
[`suite/evaluation/index.js:2890-2934`](../../suite/evaluation/index.js#L2890-L2934)).
However, placement currently depends on seed, case, and repetition but not the
model-cell fingerprint, so the same arm position repeats across cells
([`suite/evaluation/index.js:2593-2598`](../../suite/evaluation/index.js#L2593-L2598)).
#80 should predeclare cell-aware placement or a balanced order.

Cross-family judging reduces direct self-preference risk but does not establish
independence. Published experiments report that LLM evaluators can recognize
and favor their own or same-family generations
([Panickssery et al.](https://arxiv.org/abs/2404.13076),
[Wataoka et al.](https://arxiv.org/abs/2410.21819)).
A fourth-family judge avoids a direct family match with the proposed three
planner families, but shared Cursor scaffolding, style preference, training-data
overlap, and undisclosed distillation or routing can still correlate judgments.
Calibrate the judge against deterministic fixtures and a predeclared human
sample; if a sensitivity judge is used, apply it to every retained output rather
than only disagreements.

## Existing plan/adoption/role-eval paths

### Reusable plan-only machinery

The general evaluation path already provides useful primitives:

- paired `no-skill`/`treatment` provisioning, with only treatment receiving the
  skill closure
  ([`suite/evaluation/index.js:2320-2389`](../../suite/evaluation/index.js#L2320-L2389));
- no-skill contamination and treatment-load gates
  ([`suite/evaluation/index.js:2690-2737`](../../suite/evaluation/index.js#L2690-L2737));
- exact model/cell/repetition keys and per-run fingerprinted evidence containing
  full output, duration, cost, tool use, mutations, and skill events
  ([`suite/evaluation/index.js:1760-1850`](../../suite/evaluation/index.js#L1760-L1850));
- a trusted versioned deterministic-grader registry
  ([`suite/evaluation/index.js:367-379`](../../suite/evaluation/index.js#L367-L379),
  [`suite/evaluation/index.js:497-537`](../../suite/evaluation/index.js#L497-L537));
- schema-constrained blind judgments and retained attempt records
  ([`suite/adoption/runner.js:733-810`](../../suite/adoption/runner.js#L733-L810),
  [`suite/adoption/runner.js:812-953`](../../suite/adoption/runner.js#L812-L953));
- replay that reports semantic thresholds separately for every cell
  ([`suite/evaluation/index.js:3447-3476`](../../suite/evaluation/index.js#L3447-L3476)).

The role and outcome definitions are already plan-only prompts: they request a
reviewed blueprint and explicitly prohibit code changes
([`skills/implementation-planning/evals/role.json:21-69`](../../skills/implementation-planning/evals/role.json#L21-L69),
[`skills/implementation-planning/evals/outcome.json:21-59`](../../skills/implementation-planning/evals/outcome.json#L21-L59)).
The adoption replay also exposes baseline/treatment first-pass, attempt, and
cost series for planning skills
([`suite/adoption/runner.js:2169-2229`](../../suite/adoption/runner.js#L2169-L2229),
[`suite/adoption/runner.js:2304-2311`](../../suite/adoption/runner.js#L2304-L2311)).

### Plan-only gaps

1. **No normalized YAML/Mermaid oracle exists.** The current planning
   definitions declare no deterministic signals, so the default grader may
   legally return a checkless pass
   ([`skills/implementation-planning/evals/role.json:15-20`](../../skills/implementation-planning/evals/role.json#L15-L20),
   [`suite/evaluation/index.js:613-704`](../../suite/evaluation/index.js#L613-L704),
   [`suite/evaluation/index.js:1561-1585`](../../suite/evaluation/index.js#L1561-L1585)).
   The isolated blueprint validator checks a Markdown `ready` artifact,
   references, reviews, and an enabled implementation-start block; it rejects
   `needs-decision` and does not parse normalized YAML or Mermaid
   ([`suite/adoption/blueprint.js:232-360`](../../suite/adoption/blueprint.js#L232-L360)).
   Its unique-ID and known-reference checks are reusable concepts, but not the
   required oracle.
2. **The adoption configuration does not express exactly three arbitrary
   planner cells.** It requires ordinary/frontier tiers for both Claude Code
   and Cursor, creating one-cell manifests from a fixed four-cell shape, while
   forbidding parameterized judges
   ([`suite/adoption/index.js:510-587`](../../suite/adoption/index.js#L510-L587),
   [`suite/adoption/index.js:650-729`](../../suite/adoption/index.js#L650-L729)).
   The lower-level evaluation manifest supports the desired three exact cells.
3. **Current judging is paired, not independent absolute-first.** The payload
   shows A and B together, although it records dimensions for each. This permits
   contrast and position effects. Absolute per-output judging needs a retained
   plan-level result before paired deltas. Replay also forbids a judgment after
   a failed deterministic gate, whereas the proposed policy semantically scores
   every nonempty retained output while preserving deterministic invalidity
   ([`suite/evaluation/index.js:3400-3418`](../../suite/evaluation/index.js#L3400-L3418)).
4. **The production judge path is Claude Code-shaped.** It accepts empty model
   parameters, while the proposed fourth-family Gemini judge is Cursor-catalog
   based
   ([`suite/adoption/index.js:582-587`](../../suite/adoption/index.js#L582-L587),
   [`suite/adoption/runner.js:1606-1668`](../../suite/adoption/runner.js#L1606-L1668)).
   A catalog-verified Cursor judge path is a plan-only evaluator gap; otherwise
   an Opus planner would share the judge's model family.
5. **Correction cycles are not observable.** The skill itself calls for draft,
   independent review, central integration, reread, revision, and final
   re-review
   ([`skills/implementation-planning/SKILL.md:291-360`](../../skills/implementation-planning/SKILL.md#L291-L360),
   [`skills/implementation-planning/SKILL.md:470-486`](../../skills/implementation-planning/SKILL.md#L470-L486)).
   Run evidence retains the final output and coarse tool/skill events, not each
   draft, review packet, integrated revision, finding transition, or revision
   duration. `max_attempts` records whole execution retries; it is not a
   planning correction-cycle counter.
6. **Plan-only behavior is observed, not fail-closed.** The Cursor adapter
   creates a normal local Agent with sandboxing and records write/edit/delete/
   move/shell attempts and generated files
   ([`suite/adapters/cursor.js:947-960`](../../suite/adapters/cursor.js#L947-L960),
   [`suite/adapters/cursor.js:400-475`](../../suite/adapters/cursor.js#L400-L475)).
   The plan-only oracle must make any repository mutation attempt a retained
   failure; prompt wording alone is insufficient.
7. **Token telemetry is available upstream but not retained.** See the next
   section.

These are gaps in the plan/adoption/role evaluator. This research does not
propose changes to the implementation-outcome runner.

## Usage and bounded-run telemetry

Cursor's SDK documents:

- resolved model and duration on `RunResult`;
- per-run input, output, cache-read, cache-write, total, and optional reasoning
  token usage;
- per-turn usage stream events; and
- raw and charged cents from `Agent.getUsage()`.

Sources:
[SDK Run and TokenUsage](https://cursor.com/docs/sdk/typescript#run),
[SDK token usage](https://cursor.com/docs/sdk/typescript#token-usage), and
[SDK Agent.getUsage](https://cursor.com/docs/sdk/typescript#agentgetusage).
Cost can be delayed; zero charged cost can mean included, BYOK, or credit usage,
not zero consumption
([SDK Agent.getUsage](https://cursor.com/docs/sdk/typescript#agentgetusage)).

The repository pins `@cursor/sdk` 1.0.28
([`package-lock.json:6-13`](../../package-lock.json#L6-L13),
[`package-lock.json:57-60`](../../package-lock.json#L57-L60)).
The Cursor adapter retains duration and charged cost after calling
`agent.getUsage()`, but does not retain `runResult.usage`, raw cost, billing
settlement, reasoning tokens, or cache tokens
([`suite/adapters/cursor.js:982-1024`](../../suite/adapters/cursor.js#L982-L1024),
[`suite/index.js:706-799`](../../suite/index.js#L706-L799)).

For each planner and judge run, the plan-only evidence packet should retain
run-level tokens, duration, charged/raw cost when available, and billing state.
For treatment correction telemetry, additionally retain:

- initial complete draft identity and completion time;
- each review packet and reviewed revision;
- every finding ID and disposition before/after integration;
- each integrated revision identity and completion time;
- final full-artifact reread and final review identity;
- `correction_cycles_used`, capped at three.

Do not derive correction count from implementation review, tool-call count, or
whole-run retries.

## Timeout, cancellation, retry, and correction policy

The map currently permits **at most three planning correction cycles per
candidate** and leaves the exact **15–25 minute wall-clock cap unsettled**.
Report that range; do not silently choose 15, 20, or 25 minutes in this ticket.

The selected wall cap should cover the complete candidate lifecycle: catalog
check, startup, repository reading, initial draft, reviews, up to three
integrations, final validation, run settlement, and evidence capture. Cleanup
needs a separate short deadline. A correction limit does not extend the wall
deadline.

The existing Cursor adapter can enforce one lifecycle deadline, cancel and
settle a started run on failure/expiry, and separately bound cleanup
([`suite/adapters/cursor.js:739-793`](../../suite/adapters/cursor.js#L739-L793),
[`suite/adapters/cursor.js:835-850`](../../suite/adapters/cursor.js#L835-L850),
[`suite/adapters/cursor.js:982-1007`](../../suite/adapters/cursor.js#L982-L1007),
[`suite/adapters/cursor.js:1137-1155`](../../suite/adapters/cursor.js#L1137-L1155)).
Cursor documents `run.cancel()` and terminal cancelled settlement
([Cursor SDK cancellation](https://cursor.com/docs/sdk/typescript#cancelling-a-run)).
The adoption configuration already carries positive `timeout_ms`,
`budget_usd`, and `max_attempts`
([`suite/adoption/index.js:675-685`](../../suite/adoption/index.js#L675-L685)).

`budget_usd` is an estimated configured ceiling, not a Cursor in-flight hard
stop; post-run billing cannot enforce it. Likewise, `max_attempts` currently
retries a whole failed execution and uses the last result while retaining each
attempt record
([`suite/adoption/runner.js:733-810`](../../suite/adoption/runner.js#L733-L810)).
#80 should distinguish:

- **quality failure:** no replacement run; retain the candidate failure;
- **infrastructure retry:** if permitted, retain every attempt and never select
  the successful retry as though the failed attempt did not exist;
- **planning correction:** one draft/review/integration revision transition
  inside a candidate, never an implementation code-review turn.

## Choices reserved for #80

Primary evidence supports feasibility but does not settle:

- the exact three account-catalog cell records and whether to use standard or
  fast service;
- the exact effort/thinking value for each cell;
- whether three repetitions per cell are affordable and sufficient for the
  first ladder rung;
- Gemini 3.1 Pro's calibration as primary judge and any complete sensitivity
  pass;
- the absolute semantic dimensions, weights, failure floors, and model-ranking
  rule;
- cell-aware blind placement and arm execution order;
- the exact definition of one correction cycle, while preserving the map's
  maximum of three;
- the exact wall cap within 15–25 minutes;
- infrastructure retry eligibility and cost ceiling.

Seal these choices before paid execution. Changing them after seeing outputs
invalidates confirmatory comparisons and must create a new campaign identity.

## Source-quality caveats

- Cursor model, SDK, and CLI pages are primary product sources, but catalogs,
  parameters, prices, entitlements, and routing can change. The authenticated
  campaign catalog immediately before sealing is authoritative.
- Anthropic provides independent primary corroboration for Opus 5. No
  corresponding OpenAI primary model page for GPT-5.6 Sol was located; its name
  and availability are verified only as a Cursor-facing product.
- Cursor's model pages establish product claims, not semantic-judge calibration
  or superiority on this repository.
- Judge-bias citations are primary research but do not quantify bias for these
  exact current models, prompts, or fixtures.
- Repository findings describe commit `ae0e606` before this follow-up commit.
  They identify existing capabilities and gaps; they do not claim the missing
  plan-only oracle or telemetry has been implemented.

## Ticket-resolution gist

Use three exact catalog-pinned planner cells—provisionally GPT-5.6 Sol, Claude
Opus 5, and Grok 4.6—across matched plan-only no-skill/treatment arms. Validate
every retained blueprint with a normalized YAML/Mermaid/traceability oracle and
one blind common semantic rubric; calibrate fourth-family Gemini 3.1 Pro as the
preferred judge candidate. Keep every per-cell, per-arm, per-repetition result
and paired delta; operational best-valid-plan selection is separate from model
ranking and causal skill claims. The core evaluation path already supplies
paired provisioning, model identity, retention, blind comparison, replay,
timeouts, and charged cost, but still needs a plan-schema grader, arbitrary
three-cell adoption configuration, absolute-first judging, Cursor-based
cross-family judge support, token persistence, fail-closed no-mutation grading,
and explicit draft/review/integration correction telemetry. #80 must choose the
exact catalog variants, correction semantics, retry rule, and wall cap within
the map's current maximum-three-corrections and unresolved 15–25 minute policy.
