'use strict';

const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const {
  fingerprintValue,
} = require('../evaluation');

const DEFAULT_MANIFEST = path.join(
  'external-holdouts',
  'implementation-outcomes',
  'manifest.json',
);

class ImplementationOutcomeHoldoutError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ImplementationOutcomeHoldoutError';
  }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function safeRelative(value, field) {
  if (typeof value !== 'string'
    || value.length === 0
    || value.includes('\\')
    || value.startsWith('../')
    || path.posix.isAbsolute(value)
    || path.posix.normalize(value) !== value) {
    throw new ImplementationOutcomeHoldoutError(
      `${field} must be a contained relative path`,
    );
  }
  return value;
}

function pathEscapes(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '..'
    || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative);
}

function posixRelative(root, candidate) {
  return path.relative(root, candidate).split(path.sep).join('/');
}

function containedEntry(root, relativePath, field, directory = false) {
  safeRelative(relativePath, field);
  const absoluteRoot = path.resolve(root);
  const absolute = path.resolve(absoluteRoot, relativePath);
  if (pathEscapes(absoluteRoot, absolute)) {
    throw new ImplementationOutcomeHoldoutError(`${field} escapes its root`);
  }
  let current = absoluteRoot;
  for (const segment of relativePath.split('/')) {
    current = path.join(current, segment);
    let status;
    try {
      status = fs.lstatSync(current);
    } catch {
      throw new ImplementationOutcomeHoldoutError(`${field} does not exist`);
    }
    if (status.isSymbolicLink()) {
      throw new ImplementationOutcomeHoldoutError(
        `${field} must not traverse a symlink`,
      );
    }
  }
  const status = fs.lstatSync(absolute);
  if (directory ? !status.isDirectory() : !status.isFile()) {
    throw new ImplementationOutcomeHoldoutError(
      `${field} must be a regular ${directory ? 'directory' : 'file'}`,
    );
  }
  return absolute;
}

function readJson(file, field) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new ImplementationOutcomeHoldoutError(
      `${field} is invalid JSON: ${error.message}`,
    );
  }
}

function uniqueStrings(values, field, allowEmpty = false) {
  if (!Array.isArray(values) || (!allowEmpty && values.length === 0)) {
    throw new ImplementationOutcomeHoldoutError(
      `${field} must be ${allowEmpty ? 'an' : 'a non-empty'} array`,
    );
  }
  if (values.some((value) => typeof value !== 'string' || value.length === 0)
    || new Set(values).size !== values.length) {
    throw new ImplementationOutcomeHoldoutError(
      `${field} must contain unique non-empty strings`,
    );
  }
  return values;
}

function directoryDigest(root) {
  const hash = createHash('sha256');
  function visit(relative = '') {
    for (const entry of fs.readdirSync(path.join(root, relative), {
      withFileTypes: true,
    }).sort((left, right) => left.name.localeCompare(right.name))) {
      const entryRelative = path.join(relative, entry.name);
      const normalized = entryRelative.split(path.sep).join('/');
      if (entry.isSymbolicLink()) {
        throw new ImplementationOutcomeHoldoutError(
          `fixture contains symlink "${normalized}"`,
        );
      }
      if (entry.isDirectory()) {
        hash.update(`directory\0${normalized}\0`);
        visit(entryRelative);
      } else if (entry.isFile()) {
        hash.update(`file\0${normalized}\0`);
        hash.update(fs.readFileSync(path.join(root, entryRelative)));
        hash.update('\0');
      } else {
        throw new ImplementationOutcomeHoldoutError(
          `fixture contains unsupported entry "${normalized}"`,
        );
      }
    }
  }
  visit();
  return hash.digest('hex');
}

function validateOracle(oracle, ticketIds, field) {
  if (oracle?.schema_version !== 1) {
    throw new ImplementationOutcomeHoldoutError(
      `${field}.schema_version must be 1`,
    );
  }
  uniqueStrings(oracle.expected_tickets, `${field}.expected_tickets`);
  uniqueStrings(oracle.commands, `${field}.commands`);
  uniqueStrings(oracle.allowed_paths, `${field}.allowed_paths`);
  uniqueStrings(oracle.requirements, `${field}.requirements`);
  if (JSON.stringify(oracle.expected_tickets) !== JSON.stringify(ticketIds)) {
    throw new ImplementationOutcomeHoldoutError(
      `${field}.expected_tickets must match ticket files`,
    );
  }
  if (!Array.isArray(oracle.ticket_graph)
    || oracle.ticket_graph.length !== ticketIds.length) {
    throw new ImplementationOutcomeHoldoutError(
      `${field}.ticket_graph must cover every ticket`,
    );
  }
  const ticketIdSet = new Set(ticketIds);
  const graphIds = new Set();
  for (const [index, ticket] of oracle.ticket_graph.entries()) {
    const ticketField = `${field}.ticket_graph[${index}]`;
    if (!ticketIdSet.has(ticket?.id) || graphIds.has(ticket.id)) {
      throw new ImplementationOutcomeHoldoutError(
        `${ticketField}.id is unknown or duplicated`,
      );
    }
    graphIds.add(ticket.id);
    uniqueStrings(ticket.blockers, `${ticketField}.blockers`, true);
    uniqueStrings(ticket.collisions, `${ticketField}.collisions`, true);
    if (ticket.blockers.some((blocker) => (
      !ticketIdSet.has(blocker) || blocker === ticket.id
    ))) {
      throw new ImplementationOutcomeHoldoutError(
        `${ticketField}.blockers contains an invalid ticket`,
      );
    }
  }
  for (const severity of ['blocker', 'major']) {
    if (!Number.isInteger(oracle.maximum_review_findings?.[severity])
      || oracle.maximum_review_findings[severity] < 0) {
      throw new ImplementationOutcomeHoldoutError(
        `${field}.maximum_review_findings.${severity} is invalid`,
      );
    }
  }
  return oracle;
}

function loadRuntime(root, relativeManifest) {
  const manifestPath = containedEntry(root, relativeManifest, 'runtime manifest');
  const runtimeRoot = path.dirname(manifestPath);
  const manifest = readJson(manifestPath, 'runtime manifest');
  if (manifest.schema_version !== 1
    || manifest.kind !== 'pinned-matt-pocock-outcome-runtime'
    || manifest.license !== 'MIT'
    || !Array.isArray(manifest.files)
    || manifest.files.length === 0) {
    throw new ImplementationOutcomeHoldoutError(
      'runtime manifest contract is invalid',
    );
  }
  const files = manifest.files.map((entry, index) => {
    const field = `runtime.files[${index}]`;
    const absolute = containedEntry(runtimeRoot, entry.path, `${field}.path`);
    const digest = sha256(fs.readFileSync(absolute));
    if (digest !== entry.sha256 || !/^[a-f0-9]{40}$/.test(entry.revision)) {
      throw new ImplementationOutcomeHoldoutError(
        `${field} digest or revision is invalid`,
      );
    }
    return {
      path: entry.path,
      source: entry.source,
      revision: entry.revision,
      sha256: digest,
      absolute,
    };
  });
  return Object.freeze({
    repository: manifest.repository,
    license: manifest.license,
    root: runtimeRoot,
    files: Object.freeze(files.map(Object.freeze)),
    fingerprint: fingerprintValue(files.map(({ absolute, ...entry }) => entry)),
  });
}

function loadCase(root, entry, index) {
  const field = `manifest.cases[${index}]`;
  if (typeof entry?.id !== 'string'
    || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id)) {
    throw new ImplementationOutcomeHoldoutError(`${field}.id is invalid`);
  }
  const featurePath = containedEntry(root, entry.feature, `${field}.feature`);
  const fixturePath = containedEntry(
    root,
    entry.fixture,
    `${field}.fixture`,
    true,
  );
  const hiddenTestsPath = containedEntry(
    root,
    entry.hidden_tests,
    `${field}.hidden_tests`,
  );
  const oraclePath = containedEntry(root, entry.oracle, `${field}.oracle`);
  const ticketFiles = uniqueStrings(entry.tickets, `${field}.tickets`).map(
    (ticket, ticketIndex) => {
      const absolute = containedEntry(
        root,
        ticket,
        `${field}.tickets[${ticketIndex}]`,
      );
      const bytes = fs.readFileSync(absolute);
      return {
        id: path.basename(ticket, '.md'),
        path: ticket,
        digest: sha256(bytes),
        content: bytes.toString('utf8'),
      };
    },
  );
  const ticketIds = ticketFiles.map(({ id }) => id);
  const oracle = validateOracle(
    readJson(oraclePath, `${field}.oracle`),
    ticketIds,
    `${field}.oracle`,
  );
  const feature = fs.readFileSync(featurePath, 'utf8');
  const featureDigest = sha256(Buffer.from(feature));
  const sourceDigest = fingerprintValue({
    feature: featureDigest,
    tickets: ticketFiles.map(({ id, digest }) => ({ id, digest })),
  });
  return Object.freeze({
    id: entry.id,
    feature: Object.freeze({
      path: entry.feature,
      digest: featureDigest,
      content: feature,
    }),
    fixture: entry.fixture,
    fixturePath,
    fixtureDigest: directoryDigest(fixturePath),
    tickets: Object.freeze(ticketFiles.map(Object.freeze)),
    hiddenTestsPath,
    hiddenTestsDigest: sha256(fs.readFileSync(hiddenTestsPath)),
    oraclePath,
    oracleDigest: sha256(fs.readFileSync(oraclePath)),
    oracle: Object.freeze(oracle),
    sourceDigest,
  });
}

function loadImplementationOutcomeHoldouts({
  repositoryRoot,
  manifestPath = path.join(repositoryRoot, DEFAULT_MANIFEST),
}) {
  const absoluteManifest = path.resolve(manifestPath);
  if (pathEscapes(repositoryRoot, absoluteManifest)) {
    throw new ImplementationOutcomeHoldoutError(
      'implementation outcome manifest escapes repository',
    );
  }
  const root = path.dirname(absoluteManifest);
  const manifest = readJson(
    containedEntry(
      repositoryRoot,
      posixRelative(repositoryRoot, absoluteManifest),
      'implementation outcome manifest',
    ),
    'implementation outcome manifest',
  );
  if (manifest.schema_version !== 1
    || manifest.kind !== 'implementation-outcome-holdouts'
    || !Array.isArray(manifest.cases)
    || manifest.cases.length === 0) {
    throw new ImplementationOutcomeHoldoutError(
      'implementation outcome manifest contract is invalid',
    );
  }
  const cases = manifest.cases
    .map((entry, index) => loadCase(root, entry, index))
    .sort((left, right) => left.id.localeCompare(right.id));
  if (new Set(cases.map(({ id }) => id)).size !== cases.length) {
    throw new ImplementationOutcomeHoldoutError(
      'implementation outcome manifest contains duplicate cases',
    );
  }
  const runtime = loadRuntime(root, manifest.runtime);
  return Object.freeze({
    schemaVersion: 1,
    kind: 'implementation-outcome-holdout-catalog',
    source: posixRelative(repositoryRoot, absoluteManifest),
    runtime,
    cases: Object.freeze(cases),
    fingerprint: fingerprintValue({
      runtime: runtime.fingerprint,
      cases: cases.map((holdoutCase) => ({
        id: holdoutCase.id,
        fixtureDigest: holdoutCase.fixtureDigest,
        sourceDigest: holdoutCase.sourceDigest,
        oracleDigest: holdoutCase.oracleDigest,
      })),
    }),
  });
}

function publicCaseInputs(holdoutCase) {
  return Object.freeze({
    id: holdoutCase.id,
    feature: holdoutCase.feature,
    fixture: holdoutCase.fixture,
    fixtureDigest: holdoutCase.fixtureDigest,
    sourceDigest: holdoutCase.sourceDigest,
    tickets: holdoutCase.tickets,
  });
}

module.exports = {
  DEFAULT_MANIFEST,
  ImplementationOutcomeHoldoutError,
  loadImplementationOutcomeHoldouts,
  publicCaseInputs,
};
