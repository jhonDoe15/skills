'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  buildPreExecutionInventory,
  emptyPreExecutionInventory,
  normalizeRetainedPreExecutionInventory,
  retainPreExecutionInventory,
} = require('../suite/pre-execution-inventory');

test('shared inventory builder bounds retained definitions without losing digest', (t) => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'suite-inventory-'));
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));
  for (const name of ['first', 'second', 'third']) {
    const directory = path.join(projectRoot, '.host', 'skills', name);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'SKILL.md'), `# ${name}\n`);
  }

  const inventory = buildPreExecutionInventory({
    projectRoot,
    skillNames: ['first', 'second', 'third'],
    relativePathFor: (name) => `.host/skills/${name}/SKILL.md`,
    maxDefinitions: 2,
  });

  assert.deepEqual(
    inventory.skillDefinitions.map(({ name, path: definitionPath }) => (
      [name, definitionPath]
    )),
    [
      ['first', '.host/skills/first/SKILL.md'],
      ['second', '.host/skills/second/SKILL.md'],
    ],
  );
  assert.equal(inventory.truncated, true);
  assert.match(inventory.packageDigest, /^[a-f0-9]{64}$/);
  assert.equal(
    inventory.skillDefinitions.every(({ digest }) => /^[a-f0-9]{64}$/.test(digest)),
    true,
  );
});

test('shared empty inventory has the canonical empty digest', () => {
  assert.deepEqual(emptyPreExecutionInventory(), {
    skillDefinitions: [],
    plugins: [],
    ruleSources: [],
    packageDigest:
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    truncated: false,
  });
});

test('shared retained inventory normalization round-trips the contract', () => {
  const inventory = emptyPreExecutionInventory();
  assert.deepEqual(
    normalizeRetainedPreExecutionInventory(retainPreExecutionInventory(inventory)),
    inventory,
  );
});
