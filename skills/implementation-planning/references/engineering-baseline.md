# Mandatory engineering baseline

Use this baseline on every implementation-planning run, including when
repository authority is absent, weak, or stale. Carry applicable guidance and
conflicts into the design, TDD plan, and reviews.

## Authority and admission

- User and organization policy and source requirements control. Treat explicit
  repository decisions and mechanical constraints as evidence; treat existing
  code, repetition, and nearby patterns as descriptive rather than sufficient
  proof of design quality. Where stronger authority is silent, use this
  baseline as the default and challenge lens.
- Resolve competing guidelines against the ticket's actual behavior, risk,
  compatibility, cost, and delivery constraints. Record the selected trade-off,
  evidence, and rejected alternative; never average incompatible advice.
- Admit another industry movement only when all four are shown: a credible
  primary source; current durable adoption or standardization; concrete
  applicability to this ticket; and a demonstrable maintainability,
  testability, reliability, or operability benefit. Record the source and
  benefit, not popularity or novelty.

## Mandatory applicability index

Disposition all 12 guidelines as `applicable`, `not-applicable`, or `conflict`
with artifact evidence and design, finding, or proof IDs. Guidelines 1 and 2 use
sources, questions, and counterweights from the required `architecture-review` result;
3–8 use the core guidance below. For 9–12, load only the linked references whose
triggers apply before design or review. Record source-backed reasons for
untriggered items without loading their details. An uncertain trigger requires
bounded investigation or a blocker. An applicable conflict also loads its
reference before resolving the trade-off.

1. **Uncle Bob/SOLID/Clean Architecture.** Trigger: mandatory independent lens;
   apply principles to changed responsibilities, interfaces, and dependencies.
2. **John Ousterhout/APOSD.** Trigger: mandatory independent lens; apply principles
   to modules, interfaces, errors, configuration, and maintenance knowledge.
   Use Design It Twice under the blueprint-review authority gate.
3. **Ports and Adapters.** Trigger: effects need substitution, deterministic proof,
   or multiple technologies.
4. **Behavior-first vertical TDD.** Trigger: every behavior change.
5. **Invariant ownership and executable qualities.** Trigger: state/concurrency,
   shared data/policy, or durable quality constraints.
6. **Dependency injection.** Trigger: changed I/O, clocks, randomness, providers,
   storage, transport, frameworks, or environment-dependent configuration.
7. **DRY knowledge ownership.** Trigger: every changed responsibility and
   structurally similar copy found during discovery.
8. **Agent and human navigability.** Trigger: changed production artifacts,
   contracts, diagnostics, setup paths, or non-obvious design decisions.
9. **[Security](engineering-security.md).** Trigger: untrusted input, identity or
   authorization, sensitive data, cryptography, external reachability, supply
   chain, or explicit security requirements.
10. **[Reliability and observability](engineering-reliability.md).** Trigger:
    production services, distributed/async work, operational failure modes,
    or reliability/telemetry acceptance criteria.
11. **[Compatibility](engineering-compatibility.md).** Trigger: any consumer-visible
    change, especially independently deployed producers and consumers.
12. **[Schema and data migration](engineering-data-migration.md).** Trigger: schema,
    persisted representation, reference/transaction data, backfill, retention,
    or data ownership changes.

## Core guidance

### 3. Use Ports and Adapters where effectful dependencies vary.

**Source:** Alistair Cockburn, [“Hexagonal (Ports & Adapters)
Architecture”](https://alistair.cockburn.us/hexagonal-architecture).
**Ask:** What purposeful application conversation is the port? Which side
owns its protocol? Which adapters serve production, test, migration, or
alternate technologies? Can application behavior run without the external
technology, and are effect failures translated at the boundary?
**Counterweight:** create ports around application
purposes, not every function call. One stable dependency with no useful
substitution may need no new abstraction; the hexagon's shape and number of
sides carry no design meaning.

### 4. Plan behavior-first, vertical TDD through deliberate seams.

**Source:** Kent Beck, [“Canon
TDD”](https://newsletter.kentbeck.com/p/canon-tdd), [“Thinkie: End To
End”](https://newsletter.kentbeck.com/p/thinkie-end-to-end), and Michael
Feathers, [“Seam Types”](https://www.informit.com/articles/article.aspx?p=359417&seqNum=3).
**Ask:** What observable behavior and variants form the test list? What is
the smallest end-to-end slice that can go red, then green, then refactor?
Which public or leaf seam permits deterministic control of effects/time
without changing the code under test? What independently derived assertion
proves the result? **Counterweight:** do not pre-write
every concrete test, test private structure, paste computed output as the
oracle, or mock interactions whose order is not part of the contract.
Characterize existing behavior first when compatibility must remain green.

### 5. Give every invariant an owner and every durable quality an executable check.

**Source:** Ousterhout's information-hiding guidance in [“Modular
Design”](https://web.stanford.edu/~ouster/cgi-bin/cs190-winter18/lecture.php?topic=modularDesign)
and Neal Ford, Rebecca Parsons, Patrick Kua, and Pramod Sadalage,
[*Building Evolutionary Architectures*, official
page](https://www.thoughtworks.com/insights/books/building-evolutionaryarchitectures-second-edition)
and [architectural fitness-function
definition](https://www.thoughtworks.com/radar/techniques/architectural-fitness-function).
**Ask:** Who alone enforces each state transition, authorization decision,
data rule, schedule, and effect? Where is invalid state rejected? Which
architecture characteristic could silently decay, and what objective test,
metric, monitor, or static rule detects that decay? **Counterweight:** one owner
may coordinate several collaborators; ownership does not require a new service. Add a fitness check
only when its protected characteristic and pass/fail signal are explicit;
prose and vanity metrics are not checks.

### 6. Inject effectful and variable dependencies at a deliberate seam.

**Source:** Martin Fowler, [“Inversion of Control Containers and the
Dependency Injection
pattern”](https://martinfowler.com/articles/injection.html), and Robert C.
Martin, [“SOLID
Relevance”](https://blog.cleancoder.com/uncle-bob/2020/10/18/Solid-Relevance.html).
**Ask:** Which dependencies or configuration choices can vary across
production, tests, environments, or future providers? Does a separate
composition owner supply them without making policy code locate or construct
details? Is the injected contract expressed at the consumer's domain level,
and can tests substitute effects without replacing core behavior?
**Counterweight:** DI separates configuration from use; it
does not require a container, class, or interface for every dependency.
Injecting a low-level detail through a parameter does not by itself satisfy
dependency inversion.

### 7. Keep each piece of knowledge DRY under one authoritative owner.

**Source:** David Thomas and Andrew Hunt, [*The Pragmatic Programmer* DRY
excerpt](https://media.pragprog.com/titles/tpp20/dry.pdf) and [official
tip](https://pragprog.com/tips/).
**Ask:** Does one policy, schema fact, calculation, compatibility rule,
configuration choice, or operational procedure have multiple authoritative
representations? Would one conceptual change require coordinated edits in
several places or formats? Which owner should be canonical, and can other
representations be removed, generated, or mechanically checked?
**Counterweight:** DRY concerns duplicated knowledge,
not merely identical text. Similar code representing independently changing
concepts may remain separate. Do not introduce speculative abstraction;
temporary duplication for migration needs an owner and removal gate.

### 8. Make the repository navigable to agents and humans.

**Sources:** Ousterhout's module, information-hiding, naming, consistency,
obviousness, and design-comment guidance in [“Modular
Design”](https://web.stanford.edu/~ouster/cgi-bin/cs190-winter18/lecture.php?topic=modularDesign)
and [*A Philosophy of Software Design*, author
page](https://web.stanford.edu/~ouster/cgi-bin/aposd.php), supplemented by
AkitaOnRails [“Clean Code for AI
Agents”](https://akitaonrails.com/en/2026/04/20/clean-code-for-ai-agents/).
The practitioner article is supplementary quality evidence, not controlling
authority; this baseline and stronger scoped authority determine what is
mandatory.
**Ask:** Can a maintainer bound the change to bounded cohesive artifacts and
find each concept through distinctive, searchable domain names and
predictable paths? Are behavior and invalid states exposed through explicit
contracts and types where language-appropriate? Do failures provide
contextual diagnostics that identify the operation, affected domain object,
and recovery evidence without exposing secrets? Can an agent establish the
development/test environment through agent-runnable, noninteractive, and
idempotent setup, then execute the authoritative checks? Does durable
rationale preserve source-backed why for decisions that code cannot make
obvious?
Keep production artifacts dual-audience: agent-primary navigation never reduces
human readability, debuggability, operability, or ownership.
**Counterweight:** cohesion and depth set boundaries, not arbitrary
compactness. Use no fixed file, function, line, coverage, or grep-result
threshold. Do not fragment cohesive behavior, rename established domain
vocabulary merely to force unique search hits, require types unsupported by
the language, or add setup machinery without a demonstrated workflow need.
