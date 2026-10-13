'use strict';

const fs = require('node:fs');
const path = require('node:path');
const debugCall = require('./checks/debug-call.js');
const duplicateBlock = require('./checks/duplicate-block.js');

const LANGUAGES = {
  '.py': 'python',
  '.ts': 'typescript',
};

// Checks that run for each language. duplicate-block has no TypeScript
// implementation yet.
const CHECKS = {
  python: [debugCall, duplicateBlock],
  typescript: [debugCall],
};

function sourceFiles(root) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(full));
    else if (LANGUAGES[path.extname(entry.name)]) files.push(full);
  }
  return files;
}

function checkDirectory(root) {
  if (!fs.statSync(root, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`not a directory: ${root}`);
  }
  const findings = [];
  for (const file of sourceFiles(root)) {
    const language = LANGUAGES[path.extname(file)];
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    for (const check of CHECKS[language]) {
      for (const finding of check.run(lines, language)) {
        if (/snag: ignore/.test(lines[finding.line - 1])) continue;
        findings.push({
          file: path.relative(root, file).split(path.sep).join('/'),
          line: finding.line,
          check: check.id,
          message: finding.message,
        });
      }
    }
  }
  return findings.sort((left, right) => (
    left.file.localeCompare(right.file) || left.line - right.line
  ));
}

module.exports = { checkDirectory };
