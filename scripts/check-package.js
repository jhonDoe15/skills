#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { loadCanonicalSuite } = require('../suite');
const {
  validateInstallCollisions,
  validateReleasePackage,
} = require('../suite/release');

const repositoryRoot = path.resolve(__dirname, '..');

function parseInstallationInventory(arguments_) {
  if (arguments_.length === 0) return null;
  if (arguments_.length !== 2 || arguments_[0] !== '--installation-inventory') {
    throw new Error(
      'Usage: node scripts/check-package.js '
        + '[--installation-inventory <inventory.json>]',
    );
  }
  const inventoryPath = path.resolve(arguments_[1]);
  return JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
}

try {
  const release = validateReleasePackage(repositoryRoot);
  const installationInventory = parseInstallationInventory(process.argv.slice(2));
  if (installationInventory) {
    const candidateDefinitions = release.skills.map((name) => ({
      name,
      source: `package:skills/${name}`,
    }));
    validateInstallCollisions(
      loadCanonicalSuite(repositoryRoot),
      [...candidateDefinitions, ...installationInventory],
    );
  }
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
