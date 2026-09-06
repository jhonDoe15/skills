# Engineering baseline 11: compatibility

Load when guideline 11's trigger in [the mandatory index](engineering-baseline.md)
applies. Apply this guidance and record the source and resulting design or
proof obligation.

**Name the compatibility contract and stage incompatible change.**
**Source:** [Semantic Versioning
2.0.0](https://semver.org/spec/v2.0.0.html) and Danilo Sato, [“Parallel
Change”](https://martinfowler.com/bliki/ParallelChange.html). **Ask:** Which
public API, protocol, event, persisted shape, configuration, or operational
procedure has consumers? What exact behavior remains compatible? Must old
and new forms coexist, how are consumers migrated, and what proves the
contract phase is safe? Apply SemVer only when the project declares that
contract; use expand-migrate-contract when coordinated replacement is unsafe.
**Counterweight:** a version number does not prove
compatibility. Parallel change creates temporary dual support, so assign a
completion condition and owner for contraction rather than leaving both
paths permanent.
