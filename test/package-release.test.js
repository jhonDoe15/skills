'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  loadCanonicalSuite,
} = require('../suite');
const {
  findInstallCollisions,
  validateHostDiscovery,
  validateInstallCollisions,
  validatePackageClosure,
  validateReleasePackage,
} = require('../suite/release');
const {
  validateEvaluationDefinition,
} = require('../suite/evaluation');

const repositoryRoot = path.resolve(__dirname, '..');

test('release package is the dependency-complete 19-Skill candidate', () => {
  const release = validateReleasePackage(repositoryRoot);

  assert.deepEqual(release.identity, {
    name: 'skills',
    version: '1.0.0',
    stage: 'release-candidate',
  });
  assert.equal(release.skills.length, 19);
  assert.deepEqual(
    release.skills,
    loadCanonicalSuite(repositoryRoot).inventory.map(({ name }) => name),
  );
  assert.equal(release.runtimeEdges.length, 21);
  assert.deepEqual(release.componentEdges, release.runtimeEdges);
  assert.equal(release.skills.includes('lean'), false);
  assert.equal(release.skills.includes('skill-evaluation'), true);
});

test('package closure names every missing suite-owned Skill exactly', () => {
  const suite = loadCanonicalSuite(repositoryRoot);
  const allSkills = suite.inventory.map(({ name }) => ({ name }));

  for (const { name } of allSkills) {
    assert.throws(
      () => validatePackageClosure(
        suite,
        { skills: allSkills.filter((skill) => skill.name !== name) },
      ),
      new RegExp(`missing suite-owned Skill "${name}"`),
    );
  }
});

test('collision validation uses only supplied installation inventories', () => {
  const suite = loadCanonicalSuite(repositoryRoot);
  const installedDefinitions = [
    {
      name: 'agent-writing',
      source: 'package:skills/agent-writing',
    },
    {
      name: 'agent-writing',
      source: 'project:.cursor/skills/agent-writing',
    },
    {
      name: 'lean',
      source: 'user:~/.claude/skills/lean',
    },
    {
      name: 'unrelated-skill',
      source: 'user:~/.claude/skills/unrelated-skill',
    },
  ];
  const collisions = findInstallCollisions(suite, installedDefinitions);

  assert.deepEqual(collisions, [
    {
      kind: 'canonical-name-collision',
      name: 'agent-writing',
      sources: [
        'package:skills/agent-writing',
        'project:.cursor/skills/agent-writing',
      ],
    },
    {
      kind: 'conflicting-predecessor',
      name: 'lean',
      replacement: 'to-humans',
      sources: ['user:~/.claude/skills/lean'],
    },
  ]);
  assert.throws(
    () => validateInstallCollisions(suite, installedDefinitions),
    (error) => {
      assert.match(error.message, /canonical-name-collision "agent-writing"/);
      assert.match(error.message, /conflicting-predecessor "lean"/);
      assert.deepEqual(error.collisions, collisions);
      return true;
    },
  );
});

test('package checker rejects a supplied collision inventory', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'package-collisions-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const inventoryPath = path.join(directory, 'inventory.json');
  fs.writeFileSync(inventoryPath, JSON.stringify([
    { name: 'agent-writing', source: 'project:.cursor/skills/agent-writing' },
  ]));

  const result = spawnSync(
    process.execPath,
    [
      'scripts/check-package.js',
      '--installation-inventory',
      inventoryPath,
    ],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
    },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /canonical-name-collision "agent-writing"/);
  assert.match(result.stderr, /package:skills\/agent-writing/);
  assert.match(result.stderr, /project:\.cursor\/skills\/agent-writing/);
});

test('central metadata pins prerequisites and adapted upstream sources', () => {
  const suite = loadCanonicalSuite(repositoryRoot);

  assert.deepEqual(
    suite.externalPrerequisites.map(({ name }) => name),
    ['autopilot', 'split-to-prs', 'tdd'],
  );
  for (const prerequisite of suite.externalPrerequisites) {
    assert.match(prerequisite.source.url, /^https:\/\//);
    assert.match(prerequisite.testedRevision, /^sha256:[a-f0-9]{64}$/);
    assert.equal(typeof prerequisite.license, 'string');
    assert.notEqual(prerequisite.license.length, 0);
    assert.notEqual(prerequisite.consumers.length, 0);
  }

  assert.ok(suite.adaptedUpstream.length > 0);
  for (const contribution of suite.adaptedUpstream) {
    assert.match(contribution.source.url, /^https:\/\/github\.com\//);
    assert.match(contribution.pinnedRevision, /^[a-f0-9]{40}$/);
    assert.equal(typeof contribution.license, 'string');
    assert.notEqual(contribution.license.length, 0);
    assert.notEqual(contribution.modules.length, 0);
  }
});

test('root and Claude metadata expose one package identity', () => {
  const suite = loadCanonicalSuite(repositoryRoot);
  const packageMetadata = require('../package.json');
  const plugin = require('../.claude-plugin/plugin.json');
  const marketplace = require('../.claude-plugin/marketplace.json');

  assert.equal(packageMetadata.name, suite.identity.name);
  assert.equal(packageMetadata.version, suite.identity.version);
  assert.equal(plugin.name, suite.identity.name);
  assert.equal(plugin.version, suite.identity.version);
  assert.equal(plugin.skills, './skills');
  assert.deepEqual(
    marketplace.plugins.map(({ name, source }) => ({ name, source })),
    [{ name: suite.identity.name, source: '.' }],
  );
});

test('generated evidence is ignored while reusable inputs stay versioned', () => {
  const ignore = fs.readFileSync(path.join(repositoryRoot, '.gitignore'), 'utf8');
  for (const generatedPath of [
    '.artifacts/',
    '**/.eval-results/',
    '**/.eval-workspaces/',
    '**/.model-runs/',
    '**/.package-checks/',
    '**/.review-runs/',
    '**/.transcripts/',
  ]) {
    assert.match(ignore, new RegExp(
      `^${generatedPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
      'm',
    ));
  }

  for (const versionedPath of [
    'skills/agent-writing/evals/component.json',
    'skills/code-review/evals/review-artifact.js',
    'skills/slice-plan/schemas/plan.schema.json',
    'suite/adapters/claude-code.js',
    'suite/adapters/cursor.js',
    'suite/evaluation/schemas/retained-evidence.schema.json',
    'test/fixtures/code-review/scenario/ticket-outcome.json',
  ]) {
    assert.equal(fs.existsSync(path.join(repositoryRoot, versionedPath)), true);
  }
});

test('production entry point does not export test Adapters', () => {
  const production = require('../suite');

  assert.equal(production.defineTestAdapter, undefined);
  assert.equal(production.executeTest, undefined);
});

test('Skill Evaluation ships a valid owner-local role case', () => {
  const definition = require('../skills/skill-evaluation/evals/role.json');

  assert.equal(
    validateEvaluationDefinition(definition, repositoryRoot),
    definition,
  );
});

test('release host gate requires exact observed package discovery', () => {
  function observedDiscovery(names) {
    return {
      names,
      provenance: { statusSource: 'observed' },
    };
  }

  const result = {
    observations: {
      packageSkills: ['agent-writing', 'writing-foundation'],
      hostAvailableSkills: observedDiscovery([
        'agent-writing',
        'writing-foundation',
      ]),
    },
  };

  assert.deepEqual(
    validateHostDiscovery(result),
    result.observations.packageSkills,
  );

  const invalidDiscoveries = [
    [null, /host did not report packaged Skill discovery/],
    [
      {
        names: ['agent-writing', 'writing-foundation'],
        provenance: { statusSource: 'inferred' },
      },
      /host Skill discovery must be observed/,
    ],
    [
      observedDiscovery(['agent-writing']),
      /host did not discover packaged Skill "writing-foundation"/,
    ],
    [
      observedDiscovery([
        'agent-writing',
        'writing-foundation',
        'unrelated-skill',
      ]),
      /host discovered unexpected packaged Skill "unrelated-skill"/,
    ],
    [
      observedDiscovery([
        'agent-writing',
        'writing-foundation',
        'writing-foundation',
      ]),
      /host packaged Skill discovery contains duplicates/,
    ],
  ];

  for (const [hostAvailableSkills, expectedError] of invalidDiscoveries) {
    assert.throws(
      () => validateHostDiscovery({
        observations: {
          ...result.observations,
          hostAvailableSkills,
        },
      }),
      expectedError,
    );
  }
});
