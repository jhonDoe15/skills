#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..');
const commands = [
  ['--test'],
  [
    'skills/incident-investigation/scripts/run-evals.js',
    '--mode',
    'static',
    '--json',
  ],
];

for (const arguments_ of commands) {
  const result = spawnSync(process.execPath, arguments_, {
    cwd: repositoryRoot,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
