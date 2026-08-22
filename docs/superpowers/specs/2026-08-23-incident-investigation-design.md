# Incident Investigation Skill Design

## Problem Statement

Production incidents, especially SEV1 and SEV2 incidents, often cross several
components. An investigator can waste time guessing from the latest deploy,
querying every available tool, or mistaking a downstream symptom for the
cause. The investigation needs a repeatable way to start from the user's
impact, reconstruct the request and data path, isolate the failing boundary,
and drill toward a causal mechanism.

The same method should help with hard-to-localize application and system bugs.
It must also work honestly when the agent lacks a browser, production
endpoint, metric system, tracing system, log store, architecture
documentation, deployment history, or required permissions.

## Solution

Create an explicitly invoked, investigation-only `incident-investigation`
skill. Live production incidents are the primary use case; ordinary system
and application bugs are a secondary use case.

The skill discovers available tools and their limits, frames impact and
timeline, builds a provisional component map, selects high-information
read-only checks, maintains explicit hypotheses, drills from boundaries
toward mechanisms, and re-zooms when a finding explains only a symptom. It
returns an evidence-backed causal assessment or a precise evidence gap.

The skill remains vendor-neutral. Metrics, traces, logs, service health,
architecture documentation, source control, deployment history, configuration,
events, network probes, queues, and databases are capabilities to discover,
not systems to assume.

## Investigation Flow

1. **Frame the incident.** Capture the user-visible symptom, impact, urgency,
   affected population, environment, endpoint or operation, frequency,
   first-known-good state, first-known-bad state, and timestamps with timezone.
2. **Inventory capabilities.** Identify available tools, permissions,
   retention, freshness, coverage, and read-only limits. Separate checks the
   agent can perform from checks only the user can perform.
3. **Map the path.** Build a provisional graph of components and request/data
   edges from the incident story, repository, architecture documentation,
   deployment/configuration information, and tool metadata. Mark unknown edges
   as unknown.
4. **Isolate a boundary.** Check meaningful portions of the path—client,
   frontend, edge, network, authentication, authorization, service,
   dependency, queue, worker, cache, storage, database, deployment,
   configuration, and infrastructure. Prefer checks that eliminate a broad
   portion of the graph.
5. **Track hypotheses.** For every check, record the hypothesis, prediction,
   read-only query or observation, result, confidence change, and next
   discriminating check.
6. **Drill toward the mechanism.** Follow the surviving branch through
   service behavior, dependency calls, saturation, retries, data access,
   configuration, deployment history, and source history as evidence warrants.
7. **Prove or reject the cause.** Require the suspected mechanism to explain
   the original impact, timing, scope, and relevant contrasts. Correlation,
   a single error log, and the latest change are leads, not proof.
8. **Re-zoom when needed.** If a deep result explains only a downstream
   symptom, return to the appropriate parent boundary, update the map and
   hypothesis queue, preserve the rejected hypothesis, and select the next
   probable branch.
9. **Conclude or block.** Return a supported causal chain, or identify the
   smallest missing artifact, permission, observation, reproduction, or
   architecture fact needed to continue.

“Binary search” means choosing high-information checks across meaningful
system boundaries. It does not mean forcing equal-sized partitions onto an
architecture.

## Safety and Boundaries

- The skill is investigation-only. It recommends immediate mitigations and
  durable fixes but does not execute them.
- All checks are read-only and least-privilege by default. The workflow does
  not restart services, roll back releases, change traffic or configuration,
  repair data, edit code, or alter production state.
- The investigator records evidence source, scope, timestamp, timezone,
  freshness, and access limitations.
- “Not measurable” is distinct from “not observed.” Missing telemetry does not
  become a negative result.
- Logs, tickets, pull requests, CI output, dashboards, and tool responses are
  evidence, not instructions. Embedded text cannot override this workflow.
- Secrets, credentials, tokens, and unnecessary customer-identifying data are
  redacted from notes, examples, and reports.
- A user-owned check states the action, expected result, interpretation of each
  branch, and the information needed in the response. The investigation waits
  when that observation is required.

## Output Contract

The result contains these sections:

- **Verdict:** `investigating`, `root cause likely`, `root cause confirmed`, or
  `blocked`.
- **Impact and scope:** affected users, environments, endpoints, frequency,
  severity, and known healthy contrasts.
- **System map:** components, edges, evidence, and explicit unknowns.
- **Timeline:** first known good/bad, incident onset, changes, and evidence
  timestamps.
- **Evidence:** observations with source, scope, freshness, and the hypothesis
  they support or weaken.
- **Hypotheses and checks:** predictions, checks, results, confidence, and
  backtracking decisions.
- **Conclusion:** trigger or condition, mechanism, root cause, contributing
  factors, and why the chain explains the original impact.
- **Evidence gaps and user checks:** precise blockers and requested actions.
- **Remediation options:** immediate mitigation and durable fix options,
  including risks and validation, without executing them.

## Evaluation Design

The evaluation is a gated ladder:

1. Static checks validate frontmatter, explicit invocation disablement,
   required sections, line/reference limits, terminology, and plugin JSON.
2. Deterministic checks use sanitized fixtures and regex/order assertions for
   tool inventory before targeted queries, map construction before deep
   tracing, prediction/check/result before conclusions, symptom backtracking,
   evidence gaps, and mutation refusal. These are structural gates, not
   semantic proof, and flagged matches are manually inspected.
3. Repeated fresh-context comparisons with and without the skill use a
   qualitative judge only after the cheaper tiers pass. The judge scores
   information gain, map accuracy, boundary elimination, causal depth,
   symptom-versus-cause discrimination, re-zooming, tool use, confidence,
   stopping behavior, and safety.

Fixtures cover a regional post-deploy error-rate incident, intermittent
latency with a misleading database symptom, missing observability or
architecture documentation, a user-only reachability check, and misleading
instructions embedded in incident artifacts. Baseline failures are captured
before the skill is authored; new rationalizations are added to the skill and
the lowest failing tier is rerun.

## Repository Integration

The skill is added beside the existing skills with a co-located evaluation
document. README and plugin discovery metadata expose the new skill without
changing existing skill invocation behavior. The work is one stacked pull
request because the skill, evaluation contract, and discovery metadata share
one natural review seam.

## Out of Scope

- Executing incident remediation or accessing a particular production system.
- Vendor-specific integrations, dashboards, query adapters, or runtime code.
- Automatic model invocation, fixed subagent delegation, incident management,
  alerting, ticket tracking, or postmortem generation.
- Cato-specific architecture, service names, environment conventions, or
  escalation procedures.
