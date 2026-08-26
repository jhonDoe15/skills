'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const AGENT_WRITING_SKILL = `---
name: agent-writing
description: Use when explicitly asked to create agent-facing instructions with activation, behavior, and completion conditions.
---

# Agent Writing tracer

Before producing artifacts, read
\`.cursor/skills/writing-foundation/SKILL.md\` and apply its canonical invocation
marker. Do not copy or invent Foundation behavior.

For the supplied request:

1. Create \`agent-instructions.md\` with a reachable activation condition, one
   observable behavior, and a completion condition.
2. After both canonical Skill files have been read, create
   \`agent-writing-trace.json\` with this exact model-reported diagnostic:
   \`{"reportedSkills":["writing-foundation","agent-writing"],"status":"complete"}\`.
3. Return the artifact paths and repeat the activation, behavior, and completion
   conditions so the result is inspectable after the temporary project is gone.

Complete when both files exist and the response contains all three conditions.
`;

const WRITING_FOUNDATION_MARKER = `---
name: writing-foundation
description: Use when the Agent Writing tracer requests its canonical dependency marker.
---

# Writing Foundation tracer marker

Return only the canonical invocation marker \`writing-foundation\` to the
requesting tracer. This fixture intentionally defines no writing behavior.
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
