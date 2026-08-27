# Extracting agent workflows

Use this reference when agent-file guidance describes a repeated conditional procedure rather than
an always-needed rule.

## Choose the container

- Keep a short invariant in `AGENTS.md` when it applies to most work in that scope.
- Use a focused reference when the material is factual and read only for one subject.
- Use a scoped rule when the platform must attach guidance automatically for matching files.
- Extract a skill when users repeatedly request a conditional workflow with a recognizable intent.

Examples of skill-shaped workflows include filing a PR, monitoring a PR, testing one client,
provisioning a machine, uploading an artifact, or presenting a human-readable report.

## Split by user intent

One skill should represent one intent. Split workflows users may request independently:

- file a PR versus monitor it through review and CI
- read an existing artifact versus create a new one
- upload a file versus generate the content

Chain skills only when the user requested the combined intent. Give every workflow a stop point,
especially before commit, push, close, deploy, publish, or another external mutation.

## Write descriptions as triggers

The description is always-visible routing text. Write the words users actually use to request the
workflow, including meaningful synonyms and shorthand. Do not summarize the procedure in the
description; the model may treat that summary as a substitute for reading the skill.

When keywords overlap another intent, add the smallest contextual trigger or false-positive
exclusion that separates them. A supplied artifact URL should select a reader; a request to create
product-shipped HTML should not select a human-report skill.

Keep the body focused on execution. Omit a "when to use" section when the description fully selects
a single-purpose workflow.

## Encode quality and safety

- Use one real bad/good example when output quality is subjective.
- Prevent review feedback or automation from expanding the original scope.
- Verify automated findings against source before changing code.
- Give a written reason when dismissing a false positive.
- Require approval before closing, superseding, publishing, or deleting unless already authorized.
- When posting through a maintainer's account, identify agent authorship or representation according
  to the user's policy.
- State prerequisites such as credentials, tools, machine capabilities, or network access. If a
  prerequisite is absent, report it instead of guessing.
- Verify an upload or publication succeeded before claiming it is available or opening it.

Communication is part of the product. Skills that create PRs, reports, recordings, previews, or
other artifacts should optimize what the human can understand and act on, not only the agent's
ability to finish the mechanical task.

For a PR-filing workflow, check for an existing PR and inspect the full diff first. Follow repository
title conventions. Lead the description with the user's problem and why it matters, then explain the
solution; do not lead with an implementation inventory. Choose draft versus ready status from the
repository's real review automation, not a universal preference.

For a PR-monitoring workflow, prefer native watch or notification support. Otherwise poll checks and
comments until the defined stop condition. Act only on results newer than the latest push, keep the
branch current, and continue until the requested readiness condition is met. Verify bot findings,
distinguish repository failures from infrastructure failures, and ask before closing a superseded
PR unless closure was already authorized.

For human-facing artifact workflows:

- Split reading an existing artifact from creating one when users request those independently.
- Define the artifact contract: format, size bound, comparison labels, stable identity across
  iterations, retrieval method, and publication verification.
- Prefer an accessible link when the human needs to inspect a recording, preview, report, or mock.
- Use the cheapest direct retrieval method that preserves the artifact; do not open interactive
  tooling without a reason.

For machine-provisioning workflows, study a known-good machine and its real history, test the
instructions on another machine, record misses and unnecessary work, then revise. Scope the skill
to machines with its required access and tools.

Do not install or copy another person's skill collection wholesale. Build skills from repeated
local needs and observed failures.
