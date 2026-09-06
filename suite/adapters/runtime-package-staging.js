'use strict';

const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { fingerprintValue } = require('../evaluation');

function stagingError(message) {
  return Object.assign(new Error(message), {
    code: 'runtime-package-staging-failed',
  });
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function pathEscapes(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '..'
    || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative);
}

function safeRelativePath(value) {
  return typeof value === 'string'
    && value.length > 0
    && !value.includes('\\')
    && value !== '.'
    && !value.startsWith('../')
    && !path.posix.isAbsolute(value)
    && path.posix.normalize(value) === value
    && !value.split('/').some((segment) => segment.startsWith('.'));
}

function hasExactFields(value, expectedFields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actualFields = Object.keys(value).sort();
  const sortedExpectedFields = [...expectedFields].sort();
  return actualFields.length === sortedExpectedFields.length
    && actualFields.every(
      (field, index) => field === sortedExpectedFields[index],
    );
}

function validateRuntimePackage(runtimePackage, packageSkills) {
  if (!runtimePackage
    || runtimePackage.schema_version !== 1
    || runtimePackage.kind !== 'adoption-runtime-package'
    || !Array.isArray(runtimePackage.skills)
    || !Array.isArray(runtimePackage.entries)) {
    throw stagingError('Runtime package metadata is invalid');
  }
  const packageContents = {
    schema_version: runtimePackage.schema_version,
    kind: runtimePackage.kind,
    skills: runtimePackage.skills,
    entries: runtimePackage.entries,
  };
  const fingerprintMatches = runtimePackage.fingerprint
    === fingerprintValue(packageContents);
  const includesRequestedSkills = packageSkills.every(
    (skill) => runtimePackage.skills.includes(skill),
  );
  if (!fingerprintMatches || !includesRequestedSkills) {
    throw stagingError('Runtime package metadata is invalid');
  }
}

function readRuntimeEntry(skillsRoot, entry) {
  if (!hasExactFields(entry, ['digest', 'path', 'skill'])
    || !/^[a-z0-9-]+$/.test(entry.skill)
    || !safeRelativePath(entry.path)
    || !/^[a-f0-9]{64}$/.test(entry.digest)) {
    throw stagingError('Runtime package entry is invalid');
  }
  const skillRoot = path.join(skillsRoot, entry.skill);
  const source = path.resolve(skillRoot, ...entry.path.split('/'));
  if (pathEscapes(skillRoot, source)) {
    throw stagingError(`Runtime package entry "${entry.skill}/${entry.path}" escapes`);
  }
  let status;
  try {
    status = fs.lstatSync(source);
  } catch {
    throw stagingError(
      `Runtime package entry "${entry.skill}/${entry.path}" is unavailable`,
    );
  }
  if (!status.isFile() || status.isSymbolicLink()) {
    throw stagingError(
      `Runtime package entry "${entry.skill}/${entry.path}" is not a regular file`,
    );
  }
  const bytes = fs.readFileSync(source);
  if (sha256(bytes) !== entry.digest) {
    throw stagingError(
      `Runtime package entry "${entry.skill}/${entry.path}" changed after planning`,
    );
  }
  return bytes;
}

function stageRuntimePackage({
  skillsRoot,
  projectSkillsRoot,
  packageSkills,
  runtimePackage,
}) {
  validateRuntimePackage(runtimePackage, packageSkills);
  const destinations = new Set();
  for (const entry of runtimePackage.entries) {
    if (!packageSkills.includes(entry.skill)) continue;
    const destination = path.join(
      projectSkillsRoot,
      entry.skill,
      ...entry.path.split('/'),
    );
    if (destinations.has(destination) || fs.existsSync(destination)) {
      throw stagingError(
        `Duplicate runtime package entry "${entry.skill}/${entry.path}"`,
      );
    }
    destinations.add(destination);
    const bytes = readRuntimeEntry(skillsRoot, entry);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, bytes, { mode: 0o600 });
  }
  for (const skill of packageSkills) {
    if (!destinations.has(path.join(projectSkillsRoot, skill, 'SKILL.md'))) {
      throw stagingError(`Runtime package is missing "${skill}/SKILL.md"`);
    }
  }
}

function validHoldoutDestination(value) {
  return safeRelativePath(value)
    && value.startsWith('holdout-inputs/')
    && value.endsWith('/input.md');
}

function stageHoldoutInputs(projectRoot, inputs) {
  if (!Array.isArray(inputs)) {
    throw stagingError('Holdout inputs must be an array');
  }
  const staged = new Map();
  for (const input of inputs) {
    if (!hasExactFields(input, ['bytes', 'destination', 'digest'])
      || !Buffer.isBuffer(input.bytes)
      || !validHoldoutDestination(input.destination)
      || !/^[a-f0-9]{64}$/.test(input.digest)
      || sha256(input.bytes) !== input.digest
      || staged.has(input.destination)) {
      throw stagingError('Holdout input metadata is invalid');
    }
    const destination = path.resolve(
      projectRoot,
      ...input.destination.split('/'),
    );
    if (pathEscapes(projectRoot, destination) || fs.existsSync(destination)) {
      throw stagingError(`Holdout input "${input.destination}" is unsafe`);
    }
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, input.bytes, { mode: 0o600 });
    staged.set(input.destination, input.digest);
  }
  return staged;
}

module.exports = {
  stageHoldoutInputs,
  stageRuntimePackage,
};
