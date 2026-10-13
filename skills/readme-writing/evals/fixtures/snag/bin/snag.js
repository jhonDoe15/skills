#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { checkDirectory } = require('../src/index.js');

const USAGE = 'usage: snag check <directory> [--format text|json]';

function main(argv) {
  const [command, target, ...rest] = argv;
  if (command !== 'check' || !target) {
    console.error(USAGE);
    return 2;
  }
  let format = 'text';
  for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] === '--format' && ['text', 'json'].includes(rest[index + 1])) {
      format = rest[index + 1];
      index += 1;
    } else {
      console.error(USAGE);
      return 2;
    }
  }

  let findings;
  try {
    findings = checkDirectory(path.resolve(target));
  } catch (error) {
    console.error(`snag: ${error.message}`);
    return 2;
  }

  if (format === 'json') {
    console.log(JSON.stringify(findings, null, 2));
  } else {
    for (const finding of findings) {
      console.log(`${finding.file}:${finding.line} ${finding.check}  ${finding.message}`);
    }
    console.log(`${findings.length} finding${findings.length === 1 ? '' : 's'}`);
  }
  return findings.length === 0 ? 0 : 1;
}

process.exitCode = main(process.argv.slice(2));
