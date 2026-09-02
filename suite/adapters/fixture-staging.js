'use strict';

const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function fixtureError(message) {
  return Object.assign(new Error(message), { code: 'fixture-staging-failed' });
}

function canonicalDestination(destination) {
  return typeof destination === 'string'
    && destination.length > 0
    && !destination.includes('\\')
    && path.posix.normalize(destination) === destination
    && !path.posix.isAbsolute(destination)
    && (destination.startsWith('test/') || destination.startsWith('evals/'));
}

function stageCaseFixtures(projectRoot, fixtures = []) {
  if (!Array.isArray(fixtures)) {
    throw fixtureError('Case fixtures must be an array');
  }
  const stagedDigests = new Map();
  for (const fixture of fixtures) {
    if (!fixture || typeof fixture !== 'object'
      || !canonicalDestination(fixture.destination)
      || typeof fixture.sourcePath !== 'string'
      || !path.isAbsolute(fixture.sourcePath)
      || !fixture.provenance
      || fixture.provenance.destination !== fixture.destination
      || typeof fixture.provenance.digest !== 'string') {
      throw fixtureError('Case fixture metadata is invalid');
    }
    if (stagedDigests.has(fixture.destination)) {
      throw fixtureError(`Duplicate case fixture "${fixture.destination}"`);
    }
    stagedDigests.set(fixture.destination, fixture.provenance.digest);

    let status;
    try {
      status = fs.lstatSync(fixture.sourcePath);
    } catch {
      throw fixtureError(`Case fixture "${fixture.destination}" is unavailable`);
    }
    if (!status.isFile() || status.isSymbolicLink()) {
      throw fixtureError(`Case fixture "${fixture.destination}" is not a regular file`);
    }
    const contents = fs.readFileSync(fixture.sourcePath);
    const digest = createHash('sha256').update(contents).digest('hex');
    if (digest !== fixture.provenance.digest) {
      throw fixtureError(`Case fixture "${fixture.destination}" changed after planning`);
    }

    const destinationPath = path.resolve(projectRoot, fixture.destination);
    const relativeDestination = path.relative(projectRoot, destinationPath);
    if (relativeDestination.startsWith(`..${path.sep}`)
      || path.isAbsolute(relativeDestination)
      || fs.existsSync(destinationPath)) {
      throw fixtureError(`Case fixture "${fixture.destination}" has an unsafe destination`);
    }
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.writeFileSync(destinationPath, contents, { mode: 0o600 });
  }
  return stagedDigests;
}

module.exports = { stageCaseFixtures };
