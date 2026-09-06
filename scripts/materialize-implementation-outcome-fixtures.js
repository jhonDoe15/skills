#!/usr/bin/env node
'use strict';

const path = require('node:path');

const {
  loadImplementationOutcomeHoldouts,
} = require('../suite/adoption/implementation-outcome-holdouts');
const {
  materializeLocalOutcomeRepository,
} = require('../suite/adoption/implementation-outcome-local');

const repositoryRoot = path.resolve(__dirname, '..');

function isContained(root, target) {
  const relative = path.relative(root, target);
  return relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);
}

function main(outputArgument) {
  if (!outputArgument) {
    throw new Error(
      'Usage: node scripts/materialize-implementation-outcome-fixtures.js <output>',
    );
  }
  const output = path.resolve(process.cwd(), outputArgument);
  if (isContained(repositoryRoot, output)) {
    throw new Error('output must remain outside the suite repository');
  }
  const catalog = loadImplementationOutcomeHoldouts({ repositoryRoot });
  console.log(JSON.stringify(materializeLocalOutcomeRepository({
    catalog,
    target: output,
  }), null, 2));
}

try {
  main(process.argv[2]);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
