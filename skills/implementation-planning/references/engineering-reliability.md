# Engineering baseline 10: reliability

Load when guideline 10's trigger in [the mandatory index](engineering-baseline.md)
applies. Apply this guidance and record the source and resulting design or
proof obligation.

**Make reliability and observability answer a user-visible objective.**
**Source:** Google SRE, [“Service Level
Objectives”](https://sre.google/sre-book/service-level-objectives/) and
[“Monitoring Distributed
Systems”](https://sre.google/sre-book/monitoring-distributed-systems/), plus
the OpenTelemetry project's [official
overview](https://opentelemetry.io/docs/what-is-opentelemetry/). **Ask:** What
success/failure does the user observe? Which SLI/SLO or existing reliability
promise constrains the design? How do timeout, retry, overload, partial
failure, and recovery terminate? Which logs, metrics, and traces make those
states diagnosable and correlate work across boundaries? **Counterweight:** libraries and
local tools need not invent SLOs or dashboards. Golden signals are a
user-facing-service starting point, not a requirement to emit every signal
from every component; prefer existing telemetry conventions and budgets.
