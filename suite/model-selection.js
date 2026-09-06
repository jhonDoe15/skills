'use strict';

const { createHash } = require('node:crypto');

const MODEL_ALIASES = new Set([
  'auto',
  'claude',
  'default',
  'frontier',
  'gpt',
  'haiku',
  'latest',
  'opus',
  'ordinary',
  'sonnet',
]);

class ModelSelectionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ModelSelectionError';
  }
}

function requireExactFields(value, fields, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ModelSelectionError(`${field} must be an object`);
  }
  const expected = [...fields].sort();
  const actual = Object.keys(value).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new ModelSelectionError(
      `${field} must contain exactly ${expected.join(', ')}`,
    );
  }
}

function requireToken(value, field) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ModelSelectionError(`${field} must be a non-empty string`);
  }
  if (/[\s\p{Cc}]/u.test(value)) {
    throw new ModelSelectionError(
      `${field} must not contain whitespace or control characters`,
    );
  }
  return value;
}

function compareCodeUnits(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function normalizeModelSelection(value, field = 'model') {
  requireExactFields(value, ['id', 'params'], field);
  const id = requireToken(value.id, `${field}.id`);
  const alias = id.toLowerCase();
  if (MODEL_ALIASES.has(alias)
    || alias.endsWith('-latest')
    || alias.endsWith('/latest')) {
    throw new ModelSelectionError(
      `${field}.id must be an exact non-alias model identifier`,
    );
  }
  if (!Array.isArray(value.params)) {
    throw new ModelSelectionError(`${field}.params must be an array`);
  }

  const params = value.params.map((parameter, index) => {
    const parameterField = `${field}.params[${index}]`;
    requireExactFields(parameter, ['id', 'value'], parameterField);
    return {
      id: requireToken(parameter.id, `${parameterField}.id`),
      value: requireToken(parameter.value, `${parameterField}.value`),
    };
  }).sort((left, right) => compareCodeUnits(left.id, right.id));

  for (let index = 1; index < params.length; index += 1) {
    if (params[index - 1].id === params[index].id) {
      throw new ModelSelectionError(
        `${field}.params contains duplicate "${params[index].id}"`,
      );
    }
  }

  for (const parameter of params) Object.freeze(parameter);
  return Object.freeze({
    id,
    params: Object.freeze(params),
  });
}

function modelSelectionsEqual(left, right) {
  try {
    const normalizedLeft = normalizeModelSelection(left, 'left model');
    const normalizedRight = normalizeModelSelection(right, 'right model');
    return JSON.stringify(normalizedLeft) === JSON.stringify(normalizedRight);
  } catch {
    return false;
  }
}

function modelSelectionFingerprint(value) {
  return createHash('sha256')
    .update(JSON.stringify(normalizeModelSelection(value)))
    .digest('hex');
}

function normalizeModelIdentity(value, field = 'model') {
  requireExactFields(
    value,
    ['requested', 'resolved', 'verification'],
    field,
  );
  const requested = normalizeModelSelection(
    value.requested,
    `${field}.requested`,
  );
  const resolved = value.resolved === null
    ? null
    : normalizeModelSelection(value.resolved, `${field}.resolved`);
  requireExactFields(
    value.verification,
    ['status', 'source', 'reason', 'catalogEntryFingerprint'],
    `${field}.verification`,
  );
  const {
    status,
    source,
    reason,
    catalogEntryFingerprint,
  } = value.verification;
  if (!['verified', 'mismatch', 'unavailable'].includes(status)) {
    throw new ModelSelectionError(`${field}.verification.status is invalid`);
  }
  requireToken(source, `${field}.verification.source`);
  if (reason !== null) requireToken(reason, `${field}.verification.reason`);
  if (catalogEntryFingerprint !== null
    && (typeof catalogEntryFingerprint !== 'string'
      || !/^[a-f0-9]{64}$/.test(catalogEntryFingerprint))) {
    throw new ModelSelectionError(
      `${field}.verification.catalogEntryFingerprint `
        + 'must be null or a SHA-256 fingerprint',
    );
  }

  let expectedStatus = 'mismatch';
  if (resolved === null) {
    expectedStatus = 'unavailable';
  } else if (modelSelectionsEqual(requested, resolved)) {
    expectedStatus = 'verified';
  }
  if (status !== expectedStatus) {
    throw new ModelSelectionError(
      `${field}.verification.status does not match resolved identity`,
    );
  }
  if ((status === 'verified') !== (reason === null)) {
    throw new ModelSelectionError(
      `${field} verified identity requires a null reason and `
        + 'unavailable or mismatched identity requires a reason',
    );
  }

  return Object.freeze({
    requested,
    resolved,
    verification: Object.freeze({
      status,
      source,
      reason,
      catalogEntryFingerprint,
    }),
  });
}

function formatModelSelection(value) {
  const normalized = normalizeModelSelection(value);
  if (normalized.params.length === 0) return normalized.id;
  const parameters = normalized.params
    .map(({ id, value: parameterValue }) => `${id}=${parameterValue}`)
    .join(',');
  return `${normalized.id}[${parameters}]`;
}

module.exports = {
  ModelSelectionError,
  formatModelSelection,
  modelSelectionFingerprint,
  modelSelectionsEqual,
  normalizeModelIdentity,
  normalizeModelSelection,
};
