'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const AGENT_WRITING_SKILL = `---
name: agent-writing
description: Test-only tracer for an explicit request to write an agent-facing instruction artifact.
disable-model-invocation: true
---

# Agent Writing tracer

Use \`writing-foundation\` by its canonical Skill name. Do not copy or restate
that dependency's behavior.

For the supplied request:

1. Create \`agent-instructions.md\` with a reachable activation condition, one
   observable behavior, and a completion condition.
2. Create \`agent-writing-trace.json\` with this exact invocation evidence:
   \`{"invokedSkills":["writing-foundation","agent-writing"],"status":"complete"}\`.
3. Return the artifact paths and repeat the activation, behavior, and completion
   conditions so the result is inspectable after the temporary project is gone.

Complete when both files exist and the response contains all three conditions.
`;

const WRITING_FOUNDATION_MARKER = `---
name: writing-foundation
description: Test-only dependency marker consumed only by the Agent Writing tracer.
disable-model-invocation: true
---

# Writing Foundation tracer marker

Record that this canonical dependency was invoked. This fixture intentionally
defines no writing behavior.
`;

const tracerCase = Object.freeze({
  id: 'cursor-agent-writing-tracer',
  skill: 'agent-writing',
  prompt: [
    'Create agent-instructions.md for an agent that validates one JSON file.',
    'It must activate when a JSON path is supplied, report whether parsing',
    'succeeds, and complete after returning the parse result.',
  ].join(' '),
  treatment: Object.freeze({
    installedSkills: Object.freeze(['agent-writing', 'writing-foundation']),
  }),
  control: Object.freeze({
    kind: 'no-skill',
    installedSkills: Object.freeze([]),
  }),
  gateOrder: Object.freeze(['deterministic', 'qualitative']),
  deterministicExpectations: Object.freeze([
    'normalized-success',
    'canonical-invocations',
    'activation-behavior-completion',
    'artifact-references',
  ]),
});

function writeSkill(repositoryRoot, name, markdown) {
  const directory = path.join(repositoryRoot, 'skills', name);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'SKILL.md'), markdown);
}

function createTracerPackage(t, canonicalRepositoryRoot) {
  const repositoryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'cursor-agent-writing-tracer-'),
  );
  t.after(() => fs.rmSync(repositoryRoot, { recursive: true, force: true }));

  fs.mkdirSync(path.join(repositoryRoot, 'suite'), { recursive: true });
  fs.copyFileSync(
    path.join(canonicalRepositoryRoot, 'suite', 'canonical-suite.json'),
    path.join(repositoryRoot, 'suite', 'canonical-suite.json'),
  );
  writeSkill(repositoryRoot, 'agent-writing', AGENT_WRITING_SKILL);
  writeSkill(
    repositoryRoot,
    'writing-foundation',
    WRITING_FOUNDATION_MARKER,
  );
  return repositoryRoot;
}

module.exports = {
  AGENT_WRITING_SKILL,
  WRITING_FOUNDATION_MARKER,
  createTracerPackage,
  tracerCase,
};
