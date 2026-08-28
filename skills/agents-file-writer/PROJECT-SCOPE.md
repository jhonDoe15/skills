# Project agent files

Project-scoped guidance is for agents changing a repository. It is contributor guidance, not a
README for people deciding whether to use the project.

## Build the project mental model

Use a repository-evidence-led flow. Inspect applicable instructions and the smallest representative
set of configuration, documentation, source, and history needed to disposition architecture,
commands, ownership, recurring failure modes, and policy gaps. Ask only about policy choices those
sources cannot resolve. Discovery is complete when each of those concerns has an explicit
disposition.

Use the failure-audit workflow from the main skill. Do not accept generated guidance as authority.

Keep enough project description to prevent repeated blind exploration:

- what the product or service does
- its major components and data flow
- scale, maturity, compatibility, openness, or operational context that changes risk
- qualities changes must not compromise, such as performance, remote operation, wire compatibility,
  or support for forks

Write these as decision criteria, not marketing copy.

## Capture maintainer intent

Include a short maintainer note when several valid designs exist. State preferences such as where
complexity belongs, how much abstraction is acceptable, and what "simple" means in this project.
Separate overridable taste from hard contracts.

Add a glossary when local terms, roles, or pronouns affect communication. Define only terms needed
to understand or describe work, such as user, agent, provider, client, environment, project, or
domain-specific concepts. Use the team's vocabulary consistently.

## Encode project failure modes

Prefer verified repository traps over generic style advice. Name the failure, where it appears, and
the completion check that prevents it.

When applicable, require an explicit decision for each task case in a completeness matrix:

- user entry points: settings, commands, keybindings, APIs
- clients and surfaces: web, desktop, mobile, CLI
- provider or platform adapters
- shared packages and generated code
- persistence, schemas, and wire contracts
- forward and inverse operations: create/delete, enable/disable, set/unset, migrate/rollback
- connection or deployment modes
- user and maintainer documentation

"Unsupported here" is a valid decision; silently skipping a task case is not.

## Preserve operational gotchas

Keep exact commands and lifecycle rules when normal discovery produces the wrong action:

- unusual package-manager or dev-server syntax
- startup ordering and required environment
- isolated development state that must not overwrite real state
- recording the PID of a process the agent starts and stopping only that process
- safe representative test data
- the required integrated verification path for user-visible work
- when computer use or a real client is required, and when it is unnecessary

Calibrate security to the actual threat model. Distinguish local maintainer tooling from production,
customer-facing, or untrusted-input paths without weakening hard security contracts.

## Place code and documentation guidance

Record architectural placement rules only when they resolve recurring ambiguity, such as:

- complexity belongs at an adapter boundary
- orchestration remains independent of providers
- UI remains presentation-focused
- contracts change with the data that crosses the boundary

Keep user documentation separate from maintainer and implementation documentation. Route internal
details to maintainer docs so they do not leak into user-facing material.

## Layer the files

Keep the repository root for repository-wide invariants and routing. Use nested `AGENTS.md` files for
service or component boundaries that map to directories. Use subject references for substantial
architecture, dependencies, communication, testing, deployment, or environment material.

Every pointer names its trigger. Every nested file states its scope and authority. Avoid repeating
root rules in service files.

Shape a service main file for the next agent's reading path. A useful order is:

1. the service's scope, ownership, and boundary;
2. decision criteria and non-negotiable qualities;
3. recurring failure modes and observable completion checks;
4. triggered pointers to substantial task-specific detail.

This is an organizing default, not a fixed template or content cap. Include maintainer intent,
vocabulary, exact commands, security constraints, compatibility facts, or operational gotchas when
the evidence requires them. Omit empty headings and inventories that source or configuration exposes
more reliably.

## Verify representative changes

Select applicable cases from this list:

- a change that touches one surface
- a feature spanning adapters or clients
- a wire-contract or schema change
- a reversible state change
- a documentation change
- a dev-server or integrated-verification task

Record unsupported cases as not applicable rather than inventing project behavior. The file passes
when agents identify every applicable task case, use the correct commands, preserve the environment,
and explain the result in the project's vocabulary.
