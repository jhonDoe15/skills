'use strict';

const fs = require('node:fs');
const path = require('node:path');

function check(name, passed, details) {
  return { name, passed, details };
}

function fixturePath(skillRoot, relativePath) {
  if (path.isAbsolute(relativePath)) return null;
  const resolvedRoot = path.resolve(skillRoot);
  const resolved = path.resolve(resolvedRoot, relativePath);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    return null;
  }
  return resolved;
}

function isRegularFile(filePath) {
  if (filePath === null) return false;
  try {
    return fs.lstatSync(filePath).isFile();
  } catch {
    return false;
  }
}

function gradeMechanicsArtifacts({ skillRoot, caseDefinition }) {
  const declaredFiles = new Set(caseDefinition.files);
  const checks = caseDefinition.files.map((relativePath) => {
    const passed = isRegularFile(fixturePath(skillRoot, relativePath));
    return check(
      `input ${relativePath}`,
      passed,
      passed ? `resolved ${relativePath}` : `missing ${relativePath}`,
    );
  });
  const contractPath = 'evals/fixtures/behavior-contract.json';
  const resolvedContract = fixturePath(skillRoot, contractPath);

  if (!declaredFiles.has(contractPath) || !isRegularFile(resolvedContract)) {
    return {
      passed: false,
      checks,
    };
  }

  let contract;
  try {
    contract = JSON.parse(fs.readFileSync(resolvedContract, 'utf8'));
  } catch {
    checks.push(check(
      `input ${contractPath}`,
      false,
      `invalid JSON ${contractPath}`,
    ));
    return {
      passed: false,
      checks,
    };
  }

  const references = contract.branches
    .map(({ reference }) => reference)
    .filter((reference) => typeof reference === 'string');
  for (const reference of references) {
    const declaredPath = path.posix.join('evals/fixtures', reference);
    const passed = declaredFiles.has(declaredPath)
      && isRegularFile(fixturePath(skillRoot, declaredPath));
    checks.push(check(
      `reference ${reference}`,
      passed,
      passed ? `resolved ${declaredPath}` : `missing ${declaredPath}`,
    ));
  }

  return {
    passed: checks.every(({ passed }) => passed),
    checks,
  };
}

module.exports = {
  gradeMechanicsArtifacts,
};
