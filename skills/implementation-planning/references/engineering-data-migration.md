# Engineering baseline 12: data migration

Load when guideline 12's trigger in [the mandatory index](engineering-baseline.md)
applies. Apply this guidance and record the source and resulting design or
proof obligation.

**Treat schema and data movement as versioned production behavior.**
**Source:** Pramod Sadalage and Martin Fowler, [“Evolutionary Database
Design”](https://martinfowler.com/articles/evodb.html), supplemented by the
selected datastore's official migration, transaction, constraint, and lock
documentation. **Ask:** Which data invariant holds before, during, and after
each phase? How are schema, access code, backfill, validation, cutover, and
cleanup ordered? Are steps restartable and observable; what are their lock,
load, failure, roll-forward, and rollback consequences? **Counterweight:** never transplant a database-specific
recipe without confirming the actual engine/version. Keep migrations small,
automated, ordered, and version-controlled, and do not call rollback safe
until the treatment of writes after cutover is explicit.
