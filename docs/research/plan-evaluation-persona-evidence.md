# Persona evidence for architecture-plan evaluation

## Purpose

This note answers one narrow question: what source-backed claims from Robert
C. Martin's Clean Architecture/SOLID family and John Ousterhout's *A Philosophy
of Software Design* (APOSD) family can justify—or defeat—plan-evaluation
judgments about module depth, interfaces, ownership, dependencies,
proportionality, and behavioral tests?

It is an evidence guide, not an architecture standard. A reviewer should not
award credit for naming SOLID, Clean Architecture, APOSD, deep modules, or TDD.
It should award credit only when a principle explains concrete blueprint
evidence and a relevant consequence.

## Claim and finding grammar

The labels below deliberately separate what the authors say from what an
evaluator may do with it.

- **Direct source claim** is a short quotation or a close restatement whose
  operative words appear in the cited primary source.
- **Careful paraphrase** combines or translates source language without
  claiming that the author used the evaluator's vocabulary.
- **Evaluator operationalization** is this research's proposed evidence rule.
  It is not attributed to either author.

A persona finding is admissible only in this form:

> **Blueprint fact** → **source-backed principle** → **supporting condition** →
> **maintenance, change, behavior, or proof consequence**, after considering
> **contrary evidence**.

A finding is not admissible when it contains only a doctrine name, preferred
diagram, layer count, class count, method-size preference, or testing ritual.
The reviewer should quote the affected blueprint field, name the concrete
caller/change/invariant/effect at issue, and state what evidence would disprove
the finding.

## Robert C. Martin / Clean Architecture family

### M1. Cohesion and ownership follow reasons for change

- **Direct source claim.** “Gather together the things that change for the same
  reasons. Separate those things that change for different reasons.” Martin
  defines those reasons in organizational terms: a module should respond to one
  person or tightly coupled group representing one narrowly defined business
  function. Source: Robert C. Martin,
  [“The Single Responsibility Principle”](https://blog.cleancoder.com/uncle-bob/2014/05/08/SingleReponsibilityPrinciple.html).
- **Careful paraphrase.** Ownership is not “one file does one verb.” It is a
  claim that one coherent policy or stakeholder-owned reason for change has a
  clear home, while independently changing policy, presentation, persistence,
  or transport concerns do not become tangled. Martin explicitly gives
  business rules, GUI code, SQL, and communications protocols as examples of
  concerns that can change for different reasons. Source: Robert C. Martin,
  [“SOLID Relevance”](https://blog.cleancoder.com/uncle-bob/2020/10/18/Solid-Relevance.html).
- **Evaluator operationalization — concrete blueprint evidence.** Look for the
  named owner of each invariant or policy; the requirements or actors that can
  cause it to change; and a change map showing that one policy change lands
  with that owner instead of requiring synchronized edits in unrelated
  modules.
- **Supporting condition.** Apply when the plan combines concerns with
  independently evidenced change owners, or scatters one source requirement
  through several modules and interfaces.
- **Falsifying or contrary evidence.** Disprove a split request when the
  allegedly separate operations enforce one invariant, are changed by the same
  requirement owner, and separating them would duplicate knowledge or create a
  coordination protocol. Disprove a merge request when repository or ticket
  evidence establishes independent compatibility, lifecycle, deployment, or
  authority owners.
- **Anti-cargo-cult failure mode.** Counting responsibilities from method names,
  requiring one class per action, or calling any multi-step cohesive operation
  an SRP violation. The source criterion is reason for change, not number of
  statements or verbs.
- **Judgments informed.** Ownership, module boundary, proportionality.

### M2. High-level policy should not source-depend on low-level detail

- **Direct source claim.** Martin states the Dependency Inversion Principle as
  “Depend in the direction of abstraction. High level modules should not depend
  upon low level details,” and says source dependencies crossing architectural
  boundaries should point toward high-level abstractions. Source: Robert C.
  Martin,
  [“SOLID Relevance”](https://blog.cleancoder.com/uncle-bob/2020/10/18/Solid-Relevance.html).
- **Direct source claim.** In the Clean Architecture formulation, mechanisms
  are outside, policies are inside, and source-code dependencies point inward;
  outer framework or data formats should not force an inner policy to know the
  outer detail. Source: Robert C. Martin,
  [“The Clean Architecture”](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html).
- **Careful paraphrase.** Runtime control may still call outward. The relevant
  design evidence is who owns the source-level contract: Martin's worked
  example puts a gateway shaped to the business rule beside the business rule,
  with the database implementation depending on that contract. Source: Robert
  C. Martin,
  [“A Little Architecture”](https://blog.cleancoder.com/uncle-bob/2016/01/04/ALittleArchitecture.html).
- **Evaluator operationalization — concrete blueprint evidence.** Require a
  dependency description that distinguishes runtime calls from source
  dependencies; identifies policy and detail; locates the consumer-shaped
  contract; names the composition owner; and shows that framework/database
  types do not cross into policy unless the source requirement makes them part
  of the domain contract.
- **Supporting condition.** Apply when a changed external effect, framework,
  transport, storage mechanism, clock, or provider would otherwise force policy
  code to construct, import, or speak in that detail's vocabulary.
- **Falsifying or contrary evidence.** No inversion finding is supported when
  there is no meaningful policy/detail distinction, no boundary-crossing
  dependency, or the dependency is itself the required domain contract. A
  parameter or interface also fails to prove inversion if it merely republishes
  the low-level API into policy code.
- **Anti-cargo-cult failure mode.** Demanding dependency injection containers,
  an interface for every call, or literal concentric layers. Martin says the
  four circles are schematic and that additional circles may exist; the
  enduring rule is dependency direction. Source: Robert C. Martin,
  [“The Clean Architecture”](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html).
- **Judgments informed.** Dependency, interface ownership, behavioral-test
  seam.

### M3. Interfaces should be client-relevant and semantically stable

- **Direct source claim.** The Interface Segregation Principle is “Keep
  interfaces small so that users don't end up depending on things they don't
  need.” The Liskov Substitution Principle requires that an implementation not
  confuse a user of its declared or implied interface; users must agree on the
  interface's meaning. Source: Robert C. Martin,
  [“SOLID Relevance”](https://blog.cleancoder.com/uncle-bob/2020/10/18/Solid-Relevance.html).
- **Careful paraphrase.** “Small” means small relative to a client's actual
  needs and recompilation/change exposure, not a fixed method count. Martin
  also says splitting one class into separate classes is sometimes infeasible
  or undesirable. Source: Robert C. Martin,
  [“SOLID Relevance”](https://blog.cleancoder.com/uncle-bob/2020/10/18/Solid-Relevance.html).
- **Evaluator operationalization — concrete blueprint evidence.** Check that
  each planned caller depends only on operations and semantics it uses; all
  implementations preserve ordering, result, side-effect, and failure meaning;
  and compatibility tests exercise those shared semantics rather than concrete
  implementation structure.
- **Supporting condition.** Apply when a public or cross-boundary interface has
  multiple clients or implementations, or a change to unused capabilities
  would force unrelated consumers to change, rebuild, redeploy, or branch on
  implementation type.
- **Falsifying or contrary evidence.** Disprove an interface-splitting finding
  when the operations form one atomic capability or invariant, every real
  caller requires the whole contract, and splitting would expose sequencing or
  duplicate state. Disprove a substitutability finding when the allegedly
  shared implementations are intentionally different contracts and no common
  abstraction is proposed.
- **Anti-cargo-cult failure mode.** One-method interfaces, interface-per-class,
  or inheritance ceremony justified only by ISP/LSP vocabulary.
- **Judgments informed.** Interface, dependency, behavioral tests,
  proportionality.

### M4. Boundaries earn their cost by isolating use-case policy from changeable
details

- **Direct source claim.** Martin describes Clean Architecture systems as
  independent of frameworks, UI, database, and external agencies, with
  application use cases orchestrating business behavior and adapters
  translating between external and internally convenient data. Source: Robert
  C. Martin,
  [“The Clean Architecture”](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html).
- **Careful paraphrase.** A boundary is supported when it protects a use-case
  policy from a detail with an independent change reason; copying a diagram
  without that change relationship does not establish value. Martin says
  architecture should emphasize use cases rather than frameworks. Source:
  Robert C. Martin,
  [“Screaming Architecture”](https://blog.cleancoder.com/uncle-bob/2011/09/30/Screaming-Architecture.html).
- **Evaluator operationalization — concrete blueprint evidence.** Require the
  plan to name the policy protected by each new seam, the detail on the other
  side, the translation performed there, and the current caller, compatibility,
  test, or replacement scenario that benefits.
- **Supporting condition.** Apply where a real policy is currently coupled to
  UI, transport, persistence, framework lifecycle, or external-provider
  representation.
- **Falsifying or contrary evidence.** A new layer is unsupported when it only
  forwards calls or renames data, protects no independently changing policy,
  and has no present caller, substitution, or proof need.
- **Anti-cargo-cult failure mode.** Requiring entities, use cases, presenters,
  gateways, and controllers for every change irrespective of actual change
  boundaries.
- **Judgments informed.** Module boundary, dependency, proportionality.

### M5. Architecture effort must be proportional to present complexity and need

- **Direct source claim.** Martin says services are “expensive and complicated”
  and should be created only when needed; his example criticizes a physical
  UI/database split that smears each feature across applications. Source:
  Robert C. Martin,
  [“Service Oriented Agony”](https://blog.cleancoder.com/uncle-bob/2012/02/01/Service-Oriented-Agony.html).
- **Direct source claim.** Martin says relatively simple programs can tolerate
  some disorganization, while organization needs change as programs grow.
  Source: Robert C. Martin,
  [“Does Organization Matter?”](https://blog.cleancoder.com/uncle-bob/2015/04/15/DoesOrganizationMatter.html).
- **Evaluator operationalization — concrete blueprint evidence.** Compare every
  proposed module, layer, service, port, and configuration point against a
  current requirement, observed change coupling, risk boundary, or deterministic
  test need. For a local deterministic transformation, prefer the existing
  ownership seam and a direct behavioral test unless evidence shows additional
  complexity.
- **Supporting condition.** Apply both positively when present coupling
  warrants structure and negatively when the proposed structure exceeds the
  ticket's behavior and risk.
- **Falsifying or contrary evidence.** “The change is small” does not disprove a
  boundary when it touches an existing policy/detail seam or high-risk
  invariant. Conversely, anticipated scale, imagined providers, or a familiar
  architecture diagram does not prove a boundary without a current support
  condition.
- **Anti-cargo-cult failure mode.** Treating Clean Architecture as a minimum
  number of layers, or treating “keep it simple” as permission to ignore
  evidenced coupling.
- **Judgments informed.** Proportionality, module boundary, ownership.

### M6. Behavioral proof should cross significant boundaries, not mirror every
internal collaboration

- **Direct source claim.** Martin says Clean Architecture makes business rules
  testable without UI, database, web server, or other external elements.
  Source: Robert C. Martin,
  [“The Clean Architecture”](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html).
- **Direct source claim.** Martin's testing heuristic is to mock across
  architecturally significant boundaries, not within them; he warns that
  mocking every class interaction creates tests coupled to implementation
  details and can force an explosion of interfaces. He explicitly calls these
  heuristics guidelines rather than rules. Source: Robert C. Martin,
  [“When to Mock”](https://blog.cleancoder.com/uncle-bob/2014/05/10/WhenToMock.html).
- **Evaluator operationalization — concrete blueprint evidence.** Look for
  tests whose stimuli and assertions describe use-case results, state changes,
  emitted effects, and failure behavior at a public or leaf seam. Admit a test
  double only where a named external or nondeterministic boundary must be
  controlled; require broader contract or integration proof for the real
  adapter when its behavior matters.
- **Supporting condition.** Apply when policy tests otherwise require live
  external infrastructure, or proposed tests assert call choreography that is
  not itself a contract.
- **Falsifying or contrary evidence.** A live integration test may be the
  strongest proportionate proof when the changed behavior is the adapter or
  cross-system contract. A pure function may need no mock or architectural
  seam at all.
- **Anti-cargo-cult failure mode.** Equating mockability with good architecture,
  mocking every collaborator, or accepting tests that repeat the planned
  implementation rather than independently observable behavior.
- **Judgments informed.** Behavioral tests, interfaces, dependencies,
  proportionality.

## John Ousterhout / APOSD family

### O1. Judge design by apparent complexity for a concrete change

- **Direct source claim.** Ousterhout defines complexity as system structure
  that makes development hard and names change amplification, cognitive load,
  and unknown unknowns as symptoms. He says apparent complexity is what a
  developer experiences for a particular task, is about the common case, and
  does not necessarily correlate with system size or feature count. Source:
  John Ousterhout,
  [“The Nature of Complexity”](https://web.stanford.edu/~ouster/cgi-bin/cs190-winter18/lecture.php?topic=complexity).
- **Careful paraphrase.** “Deep” is valuable because it reduces what callers
  must know for useful behavior; it is not an implementation-size score.
  Ousterhout's measure is reader- and task-facing rather than a line-count
  target. Source: John Ousterhout,
  [“The Nature of Complexity”](https://web.stanford.edu/~ouster/cgi-bin/cs190-winter18/lecture.php?topic=complexity).
- **Evaluator operationalization — concrete blueprint evidence.** Ask what a
  named caller must know and edit for the ticket's common path. Use affected
  modules, required sequencing, leaked configuration, duplicate policy, and
  search closure as evidence; do not compute depth from implementation lines
  divided by interface lines.
- **Supporting condition.** Apply when the plan adds or changes a seam, moves
  knowledge, or claims maintainability improvement.
- **Falsifying or contrary evidence.** Disprove a complexity finding when the
  alleged burden is outside the supported scenario, is already hidden by an
  existing seam, or the proposed correction increases common-path knowledge or
  edits. A large implementation is not evidence of depth by itself.
- **Anti-cargo-cult failure mode.** Depth ratios, file-size thresholds, or
  rewarding a large hidden implementation regardless of usefulness,
  cohesion, or caller burden.
- **Judgments informed.** Module depth, interface, proportionality.

### O2. A deep module hides substantial useful behavior behind a simpler
interface

- **Direct source claim.** Ousterhout defines a deep class as having a small
  interface and much functionality, while a shallow class has a complex
  interface and/or little functionality. He says every class and method adds
  interface complexity, so the goal is to receive substantial functionality
  for that cost; interface simplicity matters more than implementation
  simplicity. Source: John Ousterhout,
  [“Modular Design”](https://web.stanford.edu/~ouster/cgi-bin/cs190-winter18/lecture.php?topic=modularDesign).
- **Careful paraphrase.** Depth is caller leverage: one coherent abstraction
  handles meaningful work while hiding decisions and exceptional detail. A
  forwarding wrapper, one-line extraction, or layer that repeats its neighbor's
  abstraction is suspect because it adds an interface without hiding much.
  Source: John Ousterhout,
  [“Modular Design”](https://web.stanford.edu/~ouster/cgi-bin/cs190-winter18/lecture.php?topic=modularDesign).
- **Evaluator operationalization — concrete blueprint evidence.** For each
  planned module, list the caller-visible operations, ordering rules, errors,
  configuration, and concepts; then list the useful behavior and decisions
  hidden. Flag a module only when concrete callers must learn nearly as much as
  the implementation provides, or an adjacent layer passes the same
  abstraction through.
- **Supporting condition.** Apply where a plan creates, splits, wraps, or
  preserves a module/interface.
- **Falsifying or contrary evidence.** A small leaf function that gives a clear
  domain name to a stable deterministic operation may be appropriately
  shallow; not every function is intended as a major abstraction. A wrapper
  may also be justified by a mechanical compatibility or instrumentation
  contract even if it adds little functional depth.
- **Anti-cargo-cult failure mode.** Combining unrelated behavior into a “deep”
  god module, padding implementation, or rejecting all small functions.
- **Judgments informed.** Module depth, interface, proportionality.

### O3. Information and design decisions should have one module-level home

- **Direct source claim.** Ousterhout calls information hiding the most
  important idea in software design: a module should encapsulate knowledge or
  design decisions so they are known in that module and reflected minimally in
  its interface. He describes information leakage as implementation detail on
  which other classes depend. Source: John Ousterhout,
  [“Modular Design”](https://web.stanford.edu/~ouster/cgi-bin/cs190-winter18/lecture.php?topic=modularDesign).
- **Direct source claim.** Ousterhout identifies temporal decomposition—code
  structured by execution order—as a common source of leakage and recommends
  bringing leaked information together in one place. Source: John Ousterhout,
  [“Modular Design”](https://web.stanford.edu/~ouster/cgi-bin/cs190-winter18/lecture.php?topic=modularDesign).
- **Careful paraphrase.** APOSD ownership is primarily ownership of knowledge
  and whole-problem handling, not organizational stakeholder ownership. A
  lifecycle may execute in phases while one module still owns its invariant
  and hides phase coordination.
- **Evaluator operationalization — concrete blueprint evidence.** Trace each
  invariant, format rule, retry/ordering rule, configuration choice, and state
  transition to one owner. Flag repeated knowledge, caller-managed sequencing,
  or lifecycle phases that each expose and reinterpret the same internal state.
- **Supporting condition.** Apply where several modules must know the same
  implementation fact or where callers must invoke steps in a fragile order.
- **Falsifying or contrary evidence.** Separate modules are justified when the
  knowledge is genuinely independent, the protocol between them is itself a
  stable required contract, or one owner coordinating several collaborators
  still enforces the invariant.
- **Anti-cargo-cult failure mode.** Co-locating everything that executes in one
  workflow, or treating one-owner evidence as a demand for one class or one
  service.
- **Judgments informed.** Ownership, module depth, interface, dependency.

### O4. Pull complexity downward, but preserve different abstractions and
cohesion

- **Direct source claim.** Ousterhout says each layer should expose a different
  abstraction from adjacent layers and identifies pass-through methods as a red
  flag. He recommends that module writers solve hard problems completely and
  make the result easy for users, including handling error conditions rather
  than merely punting them upward. Source: John Ousterhout,
  [“Modular Design”](https://web.stanford.edu/~ouster/cgi-bin/cs190-winter18/lecture.php?topic=modularDesign).
- **Direct source claim.** Ousterhout recommends reducing the number of places
  where exceptions must be handled by defining errors out of existence,
  masking recoverable errors, collapsing cases by handling strategy, or
  deferring reporting to an appropriate level. Source: John Ousterhout,
  [“Exception Handling”](https://web.stanford.edu/~ouster/cgi-bin/cs190-spring16/lecture.php?topic=exceptions).
- **Evaluator operationalization — concrete blueprint evidence.** Prefer the
  lowest coherent owner that has enough information to choose a safe default,
  complete a common task, normalize variants, or translate failures. Require
  adjacent layers to contribute distinct policy or translation rather than
  repeat the same method and data shape.
- **Supporting condition.** Apply when callers are asked to select internal
  knobs, repeat recovery, coordinate steps, or catch distinctions they cannot
  use.
- **Falsifying or contrary evidence.** Complexity must remain visible when the
  caller owns the policy choice, when hiding it would erase a required failure
  distinction, or when the lower module lacks authority or information to
  decide safely. Combining unrelated policies merely to shrink an interface is
  not supported.
- **Anti-cargo-cult failure mode.** Swallowing failures, inventing defaults,
  hiding required control, or building an incohesive module under the slogan
  “pull complexity down.”
- **Judgments informed.** Interface, ownership, failure behavior, module depth.

### O5. Generality and decomposition are bounded by current needs

- **Direct source claim.** Ousterhout advises making modules somewhat generic:
  overall capabilities should reflect current needs, while the interface may
  cover other uses when that also provides the simplest API for current needs.
  He warns not to create many specific features that are not currently needed.
  Source: John Ousterhout,
  [“Modular Design”](https://web.stanford.edu/~ouster/cgi-bin/cs190-winter18/lecture.php?topic=modularDesign).
- **Direct source claim.** The same lecture says size does not matter much,
  warns against “classitis,” and recommends decomposing long methods only when
  the parts can be separated cleanly. Source: John Ousterhout,
  [“Modular Design”](https://web.stanford.edu/~ouster/cgi-bin/cs190-winter18/lecture.php?topic=modularDesign).
- **Direct source claim.** In their joint discussion, Ousterhout and Martin
  agree that modular design is valuable and over-decomposition is possible;
  they disagree about how far to decompose and how heavily to weigh
  entanglement. Source: John Ousterhout and Robert C. Martin,
  [“A Philosophy of Software Design vs Clean Code”](https://github.com/johnousterhout/aposd-vs-clean-code/blob/main/README.md#method-length-summary).
- **Evaluator operationalization — concrete blueprint evidence.** Require a
  current caller or requirement for overall capability. Accept a slightly more
  general interface only when it simplifies all present uses and does not add
  visible modes, configuration, or unsupported promises. Judge extraction by
  hidden complexity and independence, never line count.
- **Supporting condition.** Apply to speculative extension points, generic
  frameworks, method/class splitting, and new configuration.
- **Falsifying or contrary evidence.** A broader interface is unsupported when
  it exists only for hypothetical consumers or burdens the common path. A
  narrowly named local function is not defective merely because it is not
  reusable. Conversely, repeated present variants may support one general
  mechanism.
- **Anti-cargo-cult failure mode.** “Future-proofing” with unused features,
  rejecting all generality as YAGNI, or applying fixed class/function length
  limits.
- **Judgments informed.** Proportionality, module depth, interface.

### O6. Interface evidence includes behavior, side effects, and usage
constraints

- **Direct source claim.** Ousterhout defines a module interface as everything
  other modules must know, including formal signatures and informal behavior,
  side effects, and usage constraints; the implementation carries out the
  promises made by that interface. Source: John Ousterhout,
  [“Modular Design”](https://web.stanford.edu/~ouster/cgi-bin/cs190-winter18/lecture.php?topic=modularDesign).
- **Direct source claim.** Ousterhout says interface documentation should
  contain everything users need to know while excluding implementation detail;
  he lists boundaries, null meaning, ownership, invariants, and rationale as
  examples of information code may not make obvious. Source: John Ousterhout,
  [“Writing Comments”](https://web.stanford.edu/~ouster/cgi-bin/cs190-spring16/lecture.php?topic=comments).
- **Evaluator operationalization — concrete blueprint evidence.** A behavioral
  test plan should turn the interface's promises into observable stimuli and
  results: outputs, state/effects, ordering, failures, retries, and constraints.
  Tests need not expose private decomposition. When a promise cannot be tested
  economically, require another named proof rather than silently omitting it.
- **Supporting condition.** Apply whenever a changed seam has behavior beyond
  its type signature or multiple implementations/adapters must preserve the
  same promise.
- **Falsifying or contrary evidence.** A signature plus language-enforced type
  may fully express a simple pure transformation; do not demand prose or extra
  tests for nonexistent side effects and lifecycle. Conversely, a test that
  asserts only construction or call order does not prove the semantic promise
  unless that order is externally required.
- **Anti-cargo-cult failure mode.** Treating the interface as only a language
  declaration, requiring comments for obvious local details, or testing private
  methods because they exist.
- **Judgments informed.** Interface, behavioral tests, dependency contracts.

### O7. Compare alternatives where an interface or ownership decision is real

- **Direct source claim.** Ousterhout's modular-design lecture advises “Make 2
  designs and compare,” then implement, watch for red flags, and revise.
  Source: John Ousterhout,
  [“Modular Design”](https://web.stanford.edu/~ouster/cgi-bin/cs190-winter18/lecture.php?topic=modularDesign).
- **Evaluator operationalization — concrete blueprint evidence.** When
  controlling requirements leave a consequential interface or ownership choice
  open, compare materially different designs by caller knowledge, hidden
  decisions, invariant locality, failure behavior, compatibility, test seam,
  and change amplification.
- **Supporting condition.** Apply only when two credible options change a
  supported scenario or maintenance burden and the planner has authority to
  choose.
- **Falsifying or contrary evidence.** Do not demand alternatives for a
  mechanically fixed change, an already authoritative repository decision, or
  unsupported future behavior. If behavior authority is missing, alternatives
  expose the decision but do not authorize selecting one.
- **Anti-cargo-cult failure mode.** Producing cosmetically different class
  diagrams, or rewarding alternative count without distinct interfaces,
  ownership, or consequences.
- **Judgments informed.** Interface, ownership, module depth, proportionality.

## Compatible claims and preserved differences

### Shared evidence that can support either lens

1. **Boundaries must reduce a concrete reader/caller burden.** Ousterhout says
   modular design should replace implementation knowledge with a simpler
   interface; Martin says separation should prevent independently changing
   concerns from tangling. Sources: John Ousterhout,
   [“Modular Design”](https://web.stanford.edu/~ouster/cgi-bin/cs190-winter18/lecture.php?topic=modularDesign);
   Robert C. Martin,
   [“SOLID Relevance”](https://blog.cleancoder.com/uncle-bob/2020/10/18/Solid-Relevance.html).
   An evaluator can therefore require both hidden complexity and an evidenced
   change/ownership seam without pretending the concepts are identical.
2. **Interfaces are semantic, not merely syntactic.** Martin's LSP asks
   implementations to preserve the meaning expected by interface users;
   Ousterhout includes behavior, side effects, and constraints in the
   interface. Sources: Robert C. Martin,
   [“SOLID Relevance”](https://blog.cleancoder.com/uncle-bob/2020/10/18/Solid-Relevance.html);
   John Ousterhout,
   [“Modular Design”](https://web.stanford.edu/~ouster/cgi-bin/cs190-winter18/lecture.php?topic=modularDesign).
   A plan should therefore state and prove observable semantics, not receive
   credit merely for adding an interface type.
3. **A module should own coherent knowledge.** Martin groups behavior by actor
   or reason for change; Ousterhout localizes design decisions and leaked
   information. Sources: Robert C. Martin,
   [“The Single Responsibility Principle”](https://blog.cleancoder.com/uncle-bob/2014/05/08/SingleReponsibilityPrinciple.html);
   John Ousterhout,
   [“Modular Design”](https://web.stanford.edu/~ouster/cgi-bin/cs190-winter18/lecture.php?topic=modularDesign).
   The shared evaluator question is “what fact or policy has one enforcement
   home?”; the two lenses supply different evidence for where that home belongs.
4. **Tests are necessary evidence but do not prove architecture by ritual.**
   Martin and Ousterhout agree that unit tests are essential and that either
   TDD or a test-after-small-bundle discipline can produce good designs; they
   disagree about relative risk and explicitly report no empirical data that
   resolves that dispute. Source: John Ousterhout and Robert C. Martin,
   [“A Philosophy of Software Design vs Clean Code”](https://github.com/johnousterhout/aposd-vs-clean-code/blob/main/README.md#tdd-summary).
   The evaluator should score behavioral coverage, independent observability,
   regression protection, and proportionate seams—not whether the blueprint
   recites one development sequence as architecture evidence.
5. **Neither family supports arbitrary decomposition metrics.** Ousterhout and
   Martin agree over-decomposition is possible, while differing on preferred
   granularity. Source: John Ousterhout and Robert C. Martin,
   [“A Philosophy of Software Design vs Clean Code”](https://github.com/johnousterhout/aposd-vs-clean-code/blob/main/README.md#method-length-summary).
   File count, method count, lines, class count, and layer count are therefore
   discovery clues at most, never findings by themselves.

### Differences the evaluator must not erase

- **Ownership basis.** Martin's SRP asks who or what business function causes a
  module to change; Ousterhout asks which module hides the knowledge or design
  decision. Sources: Robert C. Martin,
  [“The Single Responsibility Principle”](https://blog.cleancoder.com/uncle-bob/2014/05/08/SingleReponsibilityPrinciple.html);
  John Ousterhout,
  [“Modular Design”](https://web.stanford.edu/~ouster/cgi-bin/cs190-winter18/lecture.php?topic=modularDesign).
  These answers can conflict: record the conflict and ticket-specific tradeoff
  rather than averaging them.
- **Dependency emphasis.** Clean Architecture supplies a normative direction
  across policy/detail boundaries; APOSD emphasizes minimizing dependencies and
  information leakage without prescribing concentric direction for every
  module relationship. Sources: Robert C. Martin,
  [“The Clean Architecture”](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html);
  John Ousterhout,
  [“The Nature of Complexity”](https://web.stanford.edu/~ouster/cgi-bin/cs190-winter18/lecture.php?topic=complexity).
  Do not report an APOSD dependency-direction violation when the evidence only
  supports a Clean Architecture claim.
- **Decomposition emphasis.** Martin prefers smaller, well-named methods that
  separate concerns; Ousterhout gives greater weight to depth and avoiding
  entangled shallow methods. Both acknowledge judgment and over-decomposition,
  but they disagree on weighting. Source: John Ousterhout and Robert C. Martin,
  [“A Philosophy of Software Design vs Clean Code”](https://github.com/johnousterhout/aposd-vs-clean-code/blob/main/README.md#method-length-summary).
  A reviewer should present concrete locality and interface evidence, not
  declare one persona the tie-breaker.
- **Comments.** Ousterhout treats comments as essential for interface
  abstraction and non-obvious design information; Martin prefers
  self-explanatory code and fewer comments, while accepting comments when code
  cannot preserve intent or rationale. Sources: John Ousterhout,
  [“Writing Comments”](https://web.stanford.edu/~ouster/cgi-bin/cs190-spring16/lecture.php?topic=comments);
  Robert C. Martin,
  [“Necessary Comments”](https://blog.cleancoder.com/uncle-bob/2017/02/23/NecessaryComments.html).
  The evaluator should require durable non-obvious semantics and rationale, but
  let repository authority decide their exact representation.
- **TDD.** Martin favors test-first short cycles; Ousterhout favors design-first
  small bundles followed promptly by comprehensive unit tests. They agree on
  tests and possible good outcomes but disagree on risks and rewards. Source:
  John Ousterhout and Robert C. Martin,
  [“A Philosophy of Software Design vs Clean Code”](https://github.com/johnousterhout/aposd-vs-clean-code/blob/main/README.md#tdd-summary).
  This dispute cannot justify rejecting a blueprint whose behavioral proof and
  executable feedback loop are otherwise sound.

## Source examples and synthetic case seeds

These seeds reuse the evaluation properties behind author examples, not their
names, prose, code, or exact topology. Each entry points back to the claim IDs
above; those claims remain the single source of truth for principle and
counterweight.

### Martin-family seeds

#### SM1 — Grow one transformation past example-specific code

- **Source.** Robert C. Martin's author-owned
  [“The Transformation Priority Premise”](https://blog.cleancoder.com/uncle-bob/2013/05/27/TheTransformationPriorityPremise.html)
  develops a prime-factor function from hard-coded test cases toward a general
  algorithm. No book location is claimed.
- **Original example.** Successive examples expose that a chain of
  input-specific constants is working code but not yet the general behavior.
- **Contrast and reusable properties.** A consumer asks one pure question; the
  useful abstraction is the transformation, while leaked complexity appears as
  one branch per observed example. This exercises M5/M6.
- **Synthetic adaptation.** `compact_runs(text)` converts repeated adjacent
  symbols into count-symbol groups; start with examples for empty, singleton,
  repeated, alternating, and mixed input. This domain and algorithm are not in
  Martin's example.
- **Required.** One consumer-facing function, deterministic output, a compact
  general rule, and table-driven behavioral partitions.
- **Forbidden.** One production branch per fixture, a strategy hierarchy, or a
  dependency seam without an effect or current variant.
- **Oracle actions/outcomes.** Call the function with each partition; observe
  exact encoded output, preservation of order, and unchanged singleton
  semantics.
- **Alternatives and judgment-changing evidence.** A loop, fold, or small
  state machine is acceptable. Streaming requirements, bounded-memory input,
  or a public decoder compatibility contract would justify a different seam.
- **Rung.** One function; proportionality baseline.

#### SM2 — Separate a stateful transport from cohesive pure helpers

- **Source.** Robert C. Martin's author-owned
  [“Functional Classes”](https://blog.cleancoder.com/uncle-bob/2023/01/18/functional-classes.html)
  contrasts a legitimate namespace-like math library with a protocol module
  that mixed WebSocket lifecycle and message rules, then extracts a cohesive
  stateful relay abstraction. No book location is claimed.
- **Original example.** Pure functions over external values can remain a
  utility namespace; state and operations unified by one transport lifecycle
  earn a component boundary.
- **Contrast and reusable properties.** Cohesion and owned state—not a class
  keyword—decide placement; protocol policy should not source-depend on a
  specific transport. This exercises M1/M2/M5.
- **Synthetic adaptation.** Keep pure `label_checks` helpers together, but move
  socket connection, reconnect, and send state out of `alert_rules` into a
  `notification_link` component supplied to the rules.
- **Required.** One owner for connection state, a policy-facing send/receive
  contract, and composition outside the policy.
- **Forbidden.** Turning every helper into a class, leaving socket types in
  alert rules, or extracting a pass-through object with no owned lifecycle.
- **Oracle actions/outcomes.** Consumers validate labels without setup; alert
  rules submit and receive domain messages; reconnect/failure tests control the
  link seam and observe policy results rather than private calls.
- **Alternatives and judgment-changing evidence.** A closure, record plus
  functions, actor, or class is acceptable. A single synchronous call with no
  retained state would support a plain adapter function.
- **Rung.** Helper/utility module and stateful component.

#### SM3 — Split a stateful class by independently owned change reasons

- **Source.** Robert C. Martin's author-owned
  [“The Single Responsibility Principle”](https://blog.cleancoder.com/uncle-bob/2014/05/08/SingleReponsibilityPrinciple.html)
  uses an employee object combining pay calculation, database persistence, and
  hours reporting to show distinct business owners and collateral change. No
  book location is claimed.
- **Original example.** One data-bearing class exposes operations governed by
  finance, technology, and operations stakeholders; shared data does not make
  those policies one responsibility.
- **Contrast and reusable properties.** Ownership follows evidenced reasons
  for change; the bad structure couples independent policy, persistence, and
  presentation. This exercises M1/M3.
- **Synthetic adaptation.** A `greenhouse_reading` record is consumed by a
  climate-score policy, a storage adapter, and a compliance-summary formatter;
  none is named or arranged like the source.
- **Required.** One authoritative climate rule, explicit persistence and report
  boundaries, and domain data that does not know storage schema or output
  formatting.
- **Forbidden.** A record object that computes policy, writes itself, and emits
  reports; one-interface-per-method ceremony is also forbidden.
- **Oracle actions/outcomes.** Score a reading and observe the domain result;
  save/reload through the adapter contract; format a compliance summary and
  verify content without invoking storage.
- **Alternatives and judgment-changing evidence.** Functions, modules, or
  classes are acceptable. A tiny local script with one owner and no independent
  persistence/report evolution could remain cohesive in one module.
- **Rung.** Stateful class/component.

#### SM4 — Keep a small feature's policy outside framework lifecycle

- **Source.** Robert C. Martin's author-owned
  [“Test Induced Design Damage?”](https://blog.cleancoder.com/uncle-bob/2014/05/01/Design-Damage.html)
  discusses separating business logic from Rails framework code, while
  [“Screaming Architecture”](https://blog.cleancoder.com/uncle-bob/2011/09/30/Screaming-Architecture.html)
  says use cases should remain testable without web server or database. No
  exact book example location is claimed.
- **Original example.** Framework-coupled policy makes change and fast proof
  depend on delivery and persistence details; separation exposes the use case.
- **Contrast and reusable properties.** The consumer-facing action is a use
  case, adapters translate at its edges, and tests observe policy without
  reconstructing the framework. This exercises M4/M6.
- **Synthetic adaptation.** A `schedule_digest` use case selects due notices
  and returns dispatch intents; an HTTP handler translates input and a queue
  adapter performs delivery.
- **Required.** Domain request/result shapes, one scheduling-policy owner, and
  adapter contract proof in addition to policy tests.
- **Forbidden.** HTTP request, ORM row, or queue-client types in scheduling
  rules; mocks between internal policy helpers.
- **Oracle actions/outcomes.** Submit schedule state and time; observe selected
  notice IDs, deduplication, and dispatch intents; separately prove HTTP
  translation and queue delivery contracts.
- **Alternatives and judgment-changing evidence.** A function or application
  service is acceptable. If the ticket changes only HTTP validation, keeping
  the behavior in the handler may be the smallest supported design.
- **Rung.** Small feature/module.

#### SM5 — Invert a real policy/detail boundary without multiplying services

- **Source.** Robert C. Martin's author-owned
  [“A Little Architecture”](https://blog.cleancoder.com/uncle-bob/2016/01/04/ALittleArchitecture.html)
  places a business-rule-shaped gateway with policy and makes the database
  implementation depend on it.
  [“Service Oriented Agony”](https://blog.cleancoder.com/uncle-bob/2012/02/01/Service-Oriented-Agony.html)
  supplies the counterexample: physical UI/database service partitioning can
  smear each feature across processes. No exact book location is claimed.
- **Original example.** Good dependency direction lets policy call a detail at
  runtime without source-depending on it; bad distribution adds interfaces and
  coordinated edits without separating business capabilities.
- **Contrast and reusable properties.** Policy owns the minimal needed
  capability, composition owns the concrete detail, and deployment boundaries
  require independent evidence. This exercises M2/M4/M5.
- **Synthetic adaptation.** A parcel-eligibility policy asks a `route_facts`
  capability for zone and restrictions; a map-provider adapter implements it
  in one process. A deliberately bad variant adds separate UI, gateway, and
  data services that all need edits for one eligibility rule.
- **Required.** Inward source dependency, policy-level contract terms, one
  eligibility owner, and no network boundary absent deployment evidence.
- **Forbidden.** Injecting the provider SDK as an “interface,” copying the
  concentric diagram literally, or awarding extra layers.
- **Oracle actions/outcomes.** Evaluate eligible, restricted, missing, and
  provider-failure routes; observe domain decisions and error translation;
  contract-test the real adapter.
- **Alternatives and judgment-changing evidence.** A callback, port, or direct
  stable library call is acceptable. Independent scaling, trust, ownership, or
  deployment requirements could justify a service boundary.
- **Rung.** Deeper architecture and proportionality.

### Ousterhout-family seeds

#### SO1 — Keep a cohesive algorithm legible instead of extracting shallow steps

- **Source.** In the author-owned joint discussion, Ousterhout critiques
  `PrimeGenerator` from Robert C. Martin's *Clean Code*, first edition,
  Chapter “Classes,” Listing 10-8, pages 145–146, then compares less fragmented
  rewrites. Source: John Ousterhout and Robert C. Martin,
  [“A Philosophy of Software Design vs Clean Code”](https://github.com/johnousterhout/aposd-vs-clean-code/blob/main/README.md#method-length).
- **Original example.** Tiny entangled methods force readers to traverse
  multiple interfaces to recover one algorithm and can hide stateful side
  effects; combining related work can improve locality. The discussion also
  catches a performance regression and accepts a corrected multi-method
  alternative.
- **Contrast and reusable properties.** Method count is not the oracle;
  consumer simplicity, hidden implementation, local reasoning, behavior, and
  relevant performance are. This exercises O1/O2/O5.
- **Synthetic adaptation.** Compute contiguous billing windows from ordered
  usage events. Compare one cohesive scan with a variant split into
  `advance`, `maybe_close`, `reopen`, and `emit` helpers sharing mutable cursor
  state.
- **Required.** One simple function contract, locally visible scan invariant,
  and independently measured behavior; helpers must hide a genuine subproblem.
- **Forbidden.** Fixed line limits, helper count scoring, copied prime-number
  names/topology, or performance claims without a benchmark requirement.
- **Oracle actions/outcomes.** Supply empty, singleton, adjacent, gapped, and
  boundary-time events; observe windows and input-order handling. Benchmark
  only if the ticket establishes a throughput constraint.
- **Alternatives and judgment-changing evidence.** A cohesive loop, iterator,
  reducer, or state object can pass. Independently reusable parsing or
  normalization can justify extraction.
- **Rung.** One function and internal helpers.

#### SO2 — Distinguish a deep utility from a pass-through wrapper

- **Source.** Ousterhout's author-owned Stanford notes use Unix file I/O as a
  deep interface and a linked list as a shallow example, and flag pass-through
  methods and repeated abstractions across layers. Source: John Ousterhout,
  [“Modular Design”](https://web.stanford.edu/~ouster/cgi-bin/cs190-winter18/lecture.php?topic=modularDesign).
  The notes assign Chapters 4–7 and 14 of APOSD as reading, but do not verify
  an exact edition/page for each example.
- **Original example.** A small common I/O interface hides device-specific
  behavior; a shallow wrapper makes invocation scarcely easier than the work it
  wraps.
- **Contrast and reusable properties.** Depth is useful consumer leverage and
  hidden variation, not implementation size. This exercises O1/O2/O4.
- **Synthetic adaptation.** An `artifact_reader` accepts one logical key and
  handles local bundles, compressed archives, and remote cached objects. The
  bad variant exposes three provider-shaped methods through a forwarding
  facade.
- **Required.** Common consumer action, hidden selection/decompression/cache
  policy, and one domain-level failure contract.
- **Forbidden.** Provider method mirroring, pass-through layers with identical
  data/error shapes, or speculative backends visible to callers.
- **Oracle actions/outcomes.** Read present, absent, corrupt, and cached
  artifacts through the same action; observe bytes plus stable domain errors;
  adapter tests prove each supported backend.
- **Alternatives and judgment-changing evidence.** One function, module, or
  object may pass. Provider-specific controls required by real callers can
  justify separate explicit interfaces.
- **Rung.** Helper/utility module; pass-through versus deep module.

#### SO3 — Own a state machine as a whole instead of decomposing by time

- **Source.** Ousterhout's author-owned
  [“Modular Design”](https://web.stanford.edu/~ouster/cgi-bin/cs190-winter18/lecture.php?topic=modularDesign)
  identifies temporal decomposition as information leakage. His Stanford
  [“Raft Project 1 Review/Discussion”](https://web.stanford.edu/~ouster/cs190-winter23/lectures/raftReview1-2023/)
  compares per-state and per-message decompositions and recommends collecting
  the Raft state machine behind a simple constructor/run API. No exact APOSD
  book page for the Raft example is claimed.
- **Original example.** Splitting lifecycle phases can leak shared transition
  knowledge; a component owning the complete state machine can hide it behind
  a small action surface.
- **Contrast and reusable properties.** One owner enforces transitions while
  internal organization may still use helpers; execution order alone does not
  define module boundaries. This exercises O3/O4.
- **Synthetic adaptation.** An upload session owns `begin`, `accept_chunk`,
  `cancel`, and `finish` transitions. The bad variant stores validation,
  reservation, transfer, and cleanup state in separate phase modules called by
  a sequencing client.
- **Required.** Explicit valid states, atomic transition ownership, cleanup and
  duplicate/late-event behavior, and a small session interface.
- **Forbidden.** Caller-managed phase order, duplicated state interpretation,
  or one class per enum value by default.
- **Oracle actions/outcomes.** Exercise normal completion, invalid order,
  duplicate chunk, cancellation, timeout, and late completion; observe final
  state and effects.
- **Alternatives and judgment-changing evidence.** A reducer plus effect
  handler, actor, or class can pass. Independent transactional owners or a
  controlling distributed protocol may require multiple components.
- **Rung.** Stateful class/component; information leakage and temporal
  decomposition.

#### SO4 — Separate a feature's interaction shell from its reusable capability

- **Source.** Ousterhout's author-owned
  [“Raft Project 1 Review/Discussion”](https://web.stanford.edu/~ouster/cs190-winter23/lectures/raftReview1-2023/)
  criticizes combining terminal input/output with cluster communication and
  recommends a general-purpose client capability separate from the command
  shell. No exact APOSD edition/page is claimed.
- **Original example.** One user interface is only one consumer; embedding
  communication in it leaks transport and prevents other consumers from using
  the capability.
- **Contrast and reusable properties.** The feature boundary separates
  interaction policy from reusable domain communication without creating
  pass-through layers. This exercises O2/O3/O5.
- **Synthetic adaptation.** A command-line inventory importer parses files and
  prints summaries, while a `catalog_submitter` owns batching, retries, and
  response normalization for CLI and scheduled-job consumers.
- **Required.** Distinct consumer actions, submitter-owned communication
  behavior, and simple result semantics shared by both consumers.
- **Forbidden.** CLI streams in the submitter, transport clients in parsing
  code, or an interface added before a second consumer/effect-control need is
  evidenced.
- **Oracle actions/outcomes.** CLI tests observe parsing and rendered summary;
  submitter tests observe accepted/rejected batches, retry termination, and
  normalized failures; an adapter contract covers transport.
- **Alternatives and judgment-changing evidence.** Functions or modules pass.
  A one-off internal CLI with no scheduled use and trivial synchronous call may
  remain one feature module.
- **Rung.** Small feature/module and proportionality.

#### SO5 — Move cross-cutting variation behind a distinct architecture seam

- **Source.** Ousterhout's author-owned
  [“Raft Project 1 Review/Discussion”](https://web.stanford.edu/~ouster/cs190-winter23/lectures/raftReview1-2023/)
  identifies specialized persistence and duplicated client/server
  communication as design problems; the follow-up
  [“Raft Project 2 Review/Discussion”](https://web.stanford.edu/~ouster/cs190-winter23/lectures/raftReview2-2023/)
  evaluates deeper classes, reduced specialization, information leakage, and
  which related work belongs together. These are author-owned course examples,
  not claimed APOSD book examples.
- **Original example.** Infrastructure tailored to one state machine leaks
  policy into communication and persistence; a deeper general mechanism can
  serve current client/server paths while specialization stays above it.
- **Contrast and reusable properties.** Adjacent layers need different
  abstractions, one module owns each hidden design decision, and generality must
  serve present uses. This exercises O2/O3/O4/O5/O7.
- **Synthetic adaptation.** A workflow engine uses one `command_channel` for
  worker-worker and operator-worker exchanges and one journal for opaque
  workflow records; workflow-specific transitions stay in a separate policy
  module.
- **Required.** Distinct transport, journal, and workflow-policy ownership;
  common present communication semantics; and end-to-end failure/state proof.
- **Forbidden.** Workflow field names in transport/storage APIs, duplicate
  client/server stacks, same-shaped pass-through layers, or hypothetical
  generality.
- **Oracle actions/outcomes.** Send commands on both current paths, restart from
  journaled state, reject corrupt records, and observe workflow results under
  transport loss and duplicate delivery.
- **Alternatives and judgment-changing evidence.** One integrated module can
  pass for a bounded single-use workflow. Different security, latency, or
  durability contracts can justify separate channels or stores.
- **Rung.** Deeper architecture; information hiding and Design It Twice.

## Compact evaluator language

Use language like:

- “The proposed adapter leaks the framework response type into policy module
  `X`; caller `Y` needs only domain result `Z`, so the plan does not yet show
  inward dependency toward a policy-owned contract (M2). This finding is
  disproved if `Z` is itself a controlling external contract.”
- “The new wrapper repeats the same operation, data shape, and failure contract
  as its callee and hides no decision for the named caller, so it is shallow
  under O2. Keep it if compatibility or instrumentation evidence establishes a
  distinct contract.”
- “The plan assigns transition `T` to modules `A` and `B`, and both reinterpret
  invariant `I`; this supports M1/O3 only because the requirement and state
  evidence show one policy fact with two enforcement homes. It is not a finding
  merely because two files change.”
- “The extra provider interface has no present alternate, effect-control need,
  or source-backed replacement scenario; M5/O5 therefore support removing the
  speculative seam. A verified test double or current second provider would
  defeat this finding.”
- “Test `P` asserts private call order but not the public result, state change,
  effect, or failure promise. M6/O6 support moving proof to the approved
  behavioral seam unless ordering is itself a required contract.”

Do not use language like:

- “Violates SOLID.”
- “Not Clean Architecture.”
- “This module is not deep enough.”
- “Use dependency injection.”
- “Add a repository/service layer.”
- “TDD requires this interface.”
- “One responsibility means one class.”

## Source-quality and applicability limits

- Martin's cited Clean Coder posts are first-party statements by Martin, and
  Ousterhout's cited Stanford lecture notes and author page are first-party
  materials by Ousterhout; they are high-trust sources for what each author
  advocates, not controlled empirical proof that each heuristic improves every
  system. Sources: Robert C. Martin,
  [“The Clean Architecture”](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html);
  John Ousterhout,
  [APOSD author page](https://web.stanford.edu/~ouster/cgi-bin/aposd.php).
- The Stanford notes are concise course material and the 2018 modular-design
  notes predate APOSD's 2021 second edition. Ousterhout's author page says the
  second edition expanded the general-purpose-module chapter and added explicit
  comparisons with *Clean Code*. Source: John Ousterhout,
  [APOSD author page](https://web.stanford.edu/~ouster/cgi-bin/aposd.php).
- The 2024–2025 joint discussion is unusually useful primary evidence because
  both authors accept its summaries of their agreements and disagreements, but
  it remains an exchange of reasoned experience. The authors explicitly say
  they lack empirical data to resolve their TDD disagreement. Source: John
  Ousterhout and Robert C. Martin,
  [“A Philosophy of Software Design vs Clean Code”](https://github.com/johnousterhout/aposd-vs-clean-code/blob/main/README.md#tdd-summary).
- The joint discussion concerns *Clean Code*, not the whole Clean Architecture
  body. Use its method-length, comment, and TDD counterweights to prevent
  persona caricature; do not silently attribute every *Clean Code* preference
  to the Clean Architecture dependency rule. Source: John Ousterhout and Robert
  C. Martin,
  [“A Philosophy of Software Design vs Clean Code”](https://github.com/johnousterhout/aposd-vs-clean-code/blob/main/README.md).
- For simple functions and bounded local changes, the default operational rule
  is restraint: preserve the existing coherent owner, state the direct
  input/output behavior, and test it directly. Escalate to new modules,
  interfaces, layers, or alternatives only when ticket/repository evidence
  supplies a supporting condition from the mappings above.
