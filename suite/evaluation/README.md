# Skill Evaluation contracts

`suite/evaluation/index.js` is the host-neutral evaluation module for the
canonical suite. It keeps evaluation behavior behind one interface while host
Adapters own project setup, execution, normalization, and cleanup.

The module provides:

- matched treatment and No-Skill execution after canonical package closure;
- component ablation through the existing test-only Adapter seam;
- versioned definition, run-evidence, and judgment-evidence schemas;
- deterministic lower-gate enforcement before seeded blind comparison;
- execution, output, comparison, and complete-record fingerprints;
- fail-closed resume assessment, outcome replay, and trigger replay;
- report-only Adoption report rendering.

Production package closure always runs against the unmodified canonical graph
before either matched arm or a component ablation. A missing dependency reports
its exact canonical name. The evaluator never converts that failure into a
No-Skill or ablated arm.

`replayCampaign` and `replayTriggerCampaign` accept retained JSON values and
have no host or judge callback. They validate complete cells, fingerprints,
deterministic grades, activation boundaries, judgments, thresholds, and tracer
scope. `buildAdoptionReport` renders those replay results but does not write
them or make a suite release decision.

The Incident Investigation runner is the first live tracer. It stages the
canonical Incident Investigation package in pristine projects and retains
shared evidence. Claude Code and Cursor transports remain separate production
Adapter implementations.
