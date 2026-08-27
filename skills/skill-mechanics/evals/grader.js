'use strict';

const fs = require('node:fs');
const path = require('node:path');

function check(name, passed, details) {
  return { name, passed, details };
}

function isStrictDescendant(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== ''
    && relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);
}

function regularFileWithin(root, relativePath) {
  if (path.posix.isAbsolute(relativePath)
    || path.win32.isAbsolute(relativePath)) return null;
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  if (!isStrictDescendant(resolvedRoot, resolved)) return null;
  try {
    const relative = path.relative(resolvedRoot, resolved);
    let current = resolvedRoot;
    let stats = null;
    for (const component of relative.split(path.sep)) {
      current = path.join(current, component);
      stats = fs.lstatSync(current);
      if (stats.isSymbolicLink()) return null;
    }
    if (!stats?.isFile()) return null;
    const realRoot = fs.realpathSync(resolvedRoot);
    const realFile = fs.realpathSync(resolved);
    return isStrictDescendant(realRoot, realFile) ? resolved : null;
  } catch {
    return null;
  }
}

function gradeMechanicsArtifacts({ skillRoot, caseDefinition }) {
  const declaredFiles = new Set(caseDefinition.files);
  const checks = caseDefinition.files.map((relativePath) => {
    const passed = regularFileWithin(skillRoot, relativePath) !== null;
    return check(
      `input ${relativePath}`,
      passed,
      passed ? `resolved ${relativePath}` : `missing ${relativePath}`,
    );
  });
  const contractPath = 'evals/fixtures/behavior-contract.json';
  const resolvedContract = regularFileWithin(skillRoot, contractPath);

  if (!declaredFiles.has(contractPath) || resolvedContract === null) {
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
  const fixtureRoot = path.join(skillRoot, 'evals', 'fixtures');
  for (const reference of references) {
    const portableRelative = path.posix.isAbsolute(reference)
      || path.win32.isAbsolute(reference)
      || reference.includes('\\')
      ? null
      : path.posix.normalize(reference);
    const staysWithinFixture = portableRelative !== null
      && portableRelative !== '.'
      && portableRelative !== '..'
      && !portableRelative.startsWith('../');
    const declaredPath = staysWithinFixture
      ? path.posix.join('evals/fixtures', portableRelative)
      : null;
    const passed = declaredPath !== null
      && declaredFiles.has(declaredPath)
      && regularFileWithin(fixtureRoot, portableRelative) !== null;
    checks.push(check(
      `reference ${reference}`,
      passed,
      passed
        ? `resolved ${declaredPath}`
        : `missing ${declaredPath ?? reference}`,
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
