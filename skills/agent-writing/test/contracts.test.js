'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  defineProductionAdapter,
  executeProduction,
} = require('../../../suite');

const repositoryRoot = path.resolve(__dirname, '../../..');
const skillRoot = path.resolve(__dirname, '..');
const foundationRoot = path.join(repositoryRoot, 'skills', 'writing-foundation');

function readSkill(skillDirectory) {
  const filePath = path.join(skillDirectory, 'SKILL.md');
  assert.equal(fs.existsSync(filePath), true, `${filePath} must exist`);
  const markdown = fs.readFileSync(filePath, 'utf8');
  const frontmatter = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  assert.ok(frontmatter, `${filePath} requires YAML frontmatter`);
  const field = (name) => frontmatter[1].match(new RegExp(`^${name}:\\s*(.+)$`, 'm'))?.[1];
  return { markdown, name: field('name'), description: field('description') };
}

function createPackageFixture(t, skillNames) {
  const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-writing-package-'));
  t.after(() => fs.rmSync(packageRoot, { recursive: true, force: true }));
  fs.mkdirSync(path.join(packageRoot, 'suite'), { recursive: true });
  fs.copyFileSync(
    path.join(repositoryRoot, 'suite', 'canonical-suite.json'),
    path.join(packageRoot, 'suite', 'canonical-suite.json'),
  );
  for (const name of skillNames) {
    const source = path.join(repositoryRoot, 'skills', name, 'SKILL.md');
    assert.equal(fs.existsSync(source), true, `${name}/SKILL.md must exist`);
    const destination = path.join(packageRoot, 'skills', name, 'SKILL.md');
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }
  return packageRoot;
}

function successfulResult(invocation, context) {
  return {
    status: 'succeeded',
    observations: {
      packageSkills: context.packageSkills,
      hostAvailableSkills: null,
      preExecutionInventory: {
        skillDefinitions: context.packageSkills.map((name) => ({
          name,
          path: `.fixture/skills/${name}/SKILL.md`,
          digest: '0'.repeat(64),
        })),
        plugins: [],
        ruleSources: [],
        packageDigest: '0'.repeat(64),
        truncated: false,
      },
      skillEvents: context.resolvedSkills.map((name) => ({
        name,
        operation: 'load',
        status: 'succeeded',
        trigger: name === invocation.skill ? 'model' : 'host',
        callId: `contract-${name}`,
        provenance: {
          host: 'fixture',
          mechanism: 'owner-local-contract-fixture',
          eventType: 'fixture.skill-lifecycle',
          observerVersion: '1',
          statusSource: 'observed',
        },
      })),
      routing: {
        requestedSkill: invocation.skill,
        resolvedSkills: context.resolvedSkills,
      },
      responses: [{ text: 'Agent-facing artifact contract completed.' }],
      artifacts: [{
        reference: 'response://0',
        mediaType: 'text/markdown',
      }],
      toolUses: [],
      attemptedMutations: [],
    },
    failure: null,
    durationMs: 1,
    costUsd: 0,
    model: {
      requested: invocation.model,
      resolved: 'resolved-test-model',
    },
  };
}

function invocation() {
  return {
    requestId: 'agent-writing-contract',
    skill: 'agent-writing',
    prompt: 'Create an agent-facing validation procedure.',
    model: 'test-model',
  };
}

function substantialParagraphs(markdown) {
  return markdown
    .split(/\r?\n\r?\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .filter((paragraph) => paragraph.length >= 80);
}

test('agent-writing routing metadata identifies its consumers and exclusions', () => {
  const skill = readSkill(skillRoot);

  assert.equal(skill.name, 'agent-writing');
  assert.match(skill.description, /\bagent-facing\b/i);
  assert.match(skill.description, /\bprimary reader\b/i);
  assert.match(skill.description, /\bAgent Skill\b/);
  assert.match(skill.description, /\bfresh-context handoffs?\b/i);
  assert.match(skill.description, /\bhuman-facing\b/i);
  assert.doesNotMatch(skill.description, /\b(?:invoke|draft|step|complete when)\b/i);
  for (const heading of [
    'Interface',
    'Routing',
    'Compose with Writing Foundation',
    'Author the behavior contract',
    'Manage the information hierarchy',
    'Preserve terminology and execution semantics',
    'Prune context load',
    'Failure behavior',
    'Completion',
  ]) {
    assert.match(skill.markdown, new RegExp(`^## ${heading}$`, 'm'));
  }
});

test('agent-writing resolves writing-foundation by canonical name without fallback copy', async (t) => {
  const packageRoot = createPackageFixture(
    t,
    ['agent-writing', 'writing-foundation'],
  );
  const adapter = defineProductionAdapter({
    name: 'agent-writing-contract',
    execute: successfulResult,
  });
  const result = await executeProduction({
    repositoryRoot: packageRoot,
    adapter,
    invocation: invocation(),
  });

  assert.deepEqual(result.observations.routing.resolvedSkills, [
    'writing-foundation',
    'agent-writing',
  ]);
  assert.deepEqual(
    result.observations.skillEvents.map(({ name }) => name),
    ['writing-foundation', 'agent-writing'],
  );

  const agentSkill = readSkill(skillRoot).markdown;
  const foundationParagraphs = new Set(
    substantialParagraphs(readSkill(foundationRoot).markdown),
  );
  assert.deepEqual(
    substantialParagraphs(agentSkill).filter((paragraph) => (
      foundationParagraphs.has(paragraph)
    )),
    [],
  );
});

test('agent-writing fails closed with the exact missing dependency name', async (t) => {
  const packageRoot = createPackageFixture(t, ['agent-writing']);
  let executions = 0;
  const adapter = defineProductionAdapter({
    name: 'must-not-execute',
    async execute() {
      executions += 1;
      throw new Error('must not execute');
    },
  });

  const result = await executeProduction({
    repositoryRoot: packageRoot,
    adapter,
    invocation: invocation(),
  });

  assert.equal(executions, 0);
  assert.deepEqual(result.failure, {
    stage: 'dependency-resolution',
    code: 'missing-internal-dependency',
    message: 'Missing internal dependency "writing-foundation"',
    missingSkill: 'writing-foundation',
  });
  assert.deepEqual(result.observations.responses, []);
  assert.deepEqual(result.observations.artifacts, []);
});
