#!/usr/bin/env node
'use strict';

const path = require('node:path');

const { validateReleasePackage } = require('../suite');

const repositoryRoot = path.resolve(__dirname, '..');

try {
  const release = validateReleasePackage(repositoryRoot);
  process.stdout.write(`${JSON.stringify({
    passed: true,
    identity: release.identity,
    skillCount: release.skills.length,
    runtimeEdgeCount: release.runtimeEdges.length,
    componentEdgeCount: release.componentEdges.length,
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error.name}: ${error.message}\n`);
  process.exitCode = 1;
}
