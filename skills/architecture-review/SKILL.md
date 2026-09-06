---
name: architecture-review
description: "Architecture review of existing code, a supplied technical design, or a PR change range. Use for architecture audits and when another skill needs an architecture assessment."
---

# Architecture Review

Review one bounded architecture target without changing it. Produce an
inspectable brief that explains the current design, evaluates its architecture,
and reports every credible in-scope finding.

## 1. Admit the architecture target

Bind one target:

- `existing-code`: existing code at one immutable revision;
- `technical-design`: a named design artifact and numbered technical-design
  revision, together with its immutable repository base; or
- `change-range`: a pull request or branch at one immutable base and head.

Require the repository root, bounded paths or components, review intent,
applicable requirements and repository authority, and publication boundary.

Build a **decision ladder** before implementation detail: project or feature
intent; the controlling ticket and design/spec; scoped ADRs and domain
guidance; then implementation plans, history, comments, and tests. Record
explicit MVP cuts, staged consumers, compatibility bridges, deferred work, and
temporary seams. Unavailable rungs are context limits; classify unused or
transitional shapes only after resolving the ladder.

Route a complete implemented-ticket assessment to `code-review`, authoring a
pre-code design and TDD plan to `implementation-planning`, and remediation to
its owning flow. Keep missing or conflicting inputs as named context limits;
an unresolved target identity makes the review incomplete.

*Complete when:* the target identity is verified, scope, intent, authority,
requirements availability, and publication boundary are verified or represented
by a context limit, and the decision ladder distinguishes deliberate staging
from accidental architecture. Otherwise retain the bounded evidence in an
incomplete brief.

## 2. Ground the current architecture

Invoke `engineering-guidance` by its exact canonical Skill name. Architecture
Review owns the activity mapping: `technical-design` uses activity `design`;
`existing-code` and `change-range` use activity `review`. Stop before analysis
when unavailable with:

`Missing internal dependency "engineering-guidance"`

Trace the bounded target's consumers, runtime and data paths, ownership,
interfaces, state, effects, failures, compatibility promises, tests, relevant
history, and surrounding modules needed to establish boundary behavior. Bind
every observation to the immutable target and distinguish controlling,
mechanical, descriptive, and fallback evidence.

*Complete when:* every affected path and consumer contract has base-bound
evidence or a context limit, all nine Engineering Guidance concerns have one
artifact-specific disposition, and every followed path ends at an evidenced
boundary or explicit exclusion.

## 3. Evaluate architecture quality

Read [architecture quality](references/architecture-quality.md) before
evaluation. Run its scope-bounded scan and apply all six quality claims to every
affected module and the target as a whole. Compare base and head for a change
range; evaluate the named revision for existing code. For a technical design,
compare the proposed architecture in the bound design revision with existing
architecture at its repository base. Label proposed contracts and planned
proof separately from observed behavior and executed proof; assess the design's
validation obligations without treating planned tests as passing evidence.

Record a written architecture model and apply the reference's view rules.

*Complete when:* every scan item and quality claim has cited supporting and
contrary evidence, an evidence-backed `not-applicable`, or a named context
limit for every affected module and the whole target.

## 4. Review through independent lenses

Run architecture quality's mandatory independent lenses and specialist coverage
assessment against the same immutable target, using its reviewer-result rules.

Give every reviewer the same decision ladder, requirements, authority, scope,
and immutable target.

*Complete when:* every assessed risk has an evidence-backed specialist coverage
disposition, and every mandatory and separately required lens returned a valid
result for the same target. Unavailable or unresolved required expertise, or a
failed lens, makes the review incomplete; retain the reason and partial evidence.

## 5. Reconcile findings

Apply architecture quality's credibility and identity rules. Give every source
finding exactly one review disposition:

- `reported`: retain a credible in-scope finding and its highest supported
  correction direction;
- `disproved`: cite stronger contrary evidence;
- `out-of-scope`: cite the controlling boundary or exclusion; or
- `needs-decision`: name the authority or design choice needed before a
  correction direction is supportable.

Report every credible in-scope finding regardless of severity, size, priority,
or pre-existing status.

Before final dispositions, run a **falsification pass** beyond the initial
hot-spot trace. Search each candidate's symbols, contract terms, and plausible
synonyms across repository consumers, public entry points, tests, history,
tickets, specs, ADRs, domain docs, and explicit follow-up decisions. Seek
evidence that changes novelty, severity, missing-consumer claims, or the
proposed correction, then update the finding.

*Complete when:* every source finding has one supported disposition, every
credible in-scope finding remains visible, and every disagreement or decision
need has an owner and resolution condition, with falsification sources and any
changed conclusions recorded.

## 6. Return the architecture brief

Read [the architecture-review brief
contract](references/architecture-review-brief.md) before writing. Return the
brief and retained evidence references as a draft by default. Explicit
authorization permits publication of the brief or review comments to the named
destination; record the authorization and publication result.

Architecture Review keeps the reviewed target read-only. Code edits, repository
or tracker changes beyond authorized review publication, implementation-plan
authoring, and remediation belong to their owning flows. A complete brief can
seed `implementation-planning` for a bounded ticket or a separate remediation
flow.

*Complete when:* the brief alone identifies the target or unresolved binding,
current and applicable proposed architecture, claim and lens dispositions,
every finding disposition, context limits, publication status, and concrete
next owner. Incomplete coverage includes its reason, retained evidence, and
recovery condition.
