#!/usr/bin/env node
'use strict';

const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..');
const outputRoot = path.join(
  repositoryRoot,
  'external-holdouts',
  'implementation-outcomes',
  'runtime',
  'matt-pocock',
);
const defaultRevision = '6654f6b60cd9d5be8b54c6fafe44346dabeb3b76';
const sources = [
  ...[
    'to-spec/SKILL.md',
    'to-tickets/SKILL.md',
    'implement/SKILL.md',
    'tdd/SKILL.md',
    'tdd/tests.md',
    'tdd/mocking.md',
    'codebase-design/SKILL.md',
    'codebase-design/DEEPENING.md',
    'codebase-design/DESIGN-IT-TWICE.md',
  ].map((sourcePath) => ({ sourcePath, revision: defaultRevision })),
  {
    sourcePath: 'code-review/SKILL.md',
    revision: '5c89081d4bbeb3d039a42093653f90bb698d780e',
  },
];

function githubFile(sourcePath, revision) {
  const result = spawnSync('gh', [
    'api',
    `repos/mattpocock/skills/contents/skills/engineering/${sourcePath}`
      + `?ref=${revision}`,
    '-H',
    'Accept: application/vnd.github.raw+json',
  ], { encoding: null });
  if (result.error || result.status !== 0) {
    throw new Error(`cannot fetch ${sourcePath} at ${revision}`);
  }
  return result.stdout;
}

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function writeOrCheck(relativePath, bytes, check) {
  const target = path.join(outputRoot, relativePath);
  if (check) {
    if (!fs.existsSync(target)
      || !fs.readFileSync(target).equals(bytes)) {
      throw new Error(`vendored runtime differs: ${relativePath}`);
    }
    return;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes);
}

function main() {
  const check = process.argv.includes('--check');
  const files = sources.map(({ sourcePath, revision }) => {
    const bytes = githubFile(sourcePath, revision);
    const relativePath = path.posix.join(
      'skills',
      sourcePath.endsWith('/SKILL.md')
        ? sourcePath.replace(/SKILL\.md$/, 'definition.md')
        : sourcePath,
    );
    writeOrCheck(relativePath, bytes, check);
    return {
      path: relativePath,
      source: `skills/engineering/${sourcePath}`,
      revision,
      sha256: digest(bytes),
    };
  });
  const manifest = {
    schema_version: 1,
    kind: 'pinned-matt-pocock-outcome-runtime',
    repository: 'https://github.com/mattpocock/skills',
    license: 'MIT',
    files,
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  writeOrCheck('runtime.json', manifestBytes, check);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
