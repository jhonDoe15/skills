---
name: agent-writing
description: Test-only tracer for an explicit agent-facing writing request.
disable-model-invocation: true
---

# Agent Writing Tracer

Invoke `writing-foundation` by its canonical name before drafting. If that
dependency cannot be invoked, stop instead of supplying replacement guidance.

Return one Markdown artifact with these headings:

- `## Activation` states when the next agent acts.
- `## Action` states the observable result it must produce.
- `## Done when` states the checkable completion condition.

This fixture traces composition and artifact production only. It is not the
production Agent Writing contract.
