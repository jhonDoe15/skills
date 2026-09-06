'use strict';

const { fingerprintValue } = require('../evaluation');
const { normalizeModelSelection } = require('../model-selection');

const PLAN_KIND = 'implementation-outcome-plan';
const PAIR_KIND = 'implementation-outcome-pair';
const RUN_INDEX_KIND = 'implementation-outcome-run-index';
const STAGE_CHECKPOINT_KIND = 'implementation-outcome-stage-checkpoint';
const ARMS = Object.freeze(['baseline', 'treatment']);
const MODEL_ROLES = Object.freeze(['planner', 'implementer', 'judge']);

class ImplementationOutcomeContractError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ImplementationOutcomeContractError';
  }
}

function requireString(value, field) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ImplementationOutcomeContractError(
      `${field} must be a non-empty string`,
    );
  }
  return value;
}

function requireDigest(value, field, length = 64) {
  if (typeof value !== 'string'
    || !new RegExp(`^[a-f0-9]{${length}}$`).test(value)) {
    throw new ImplementationOutcomeContractError(
      `${field} must be a ${length}-hex digest`,
    );
  }
  return value;
}

function requirePositiveInteger(value, field) {
  if (!Number.isInteger(value) || value < 1) {
    throw new ImplementationOutcomeContractError(
      `${field} must be a positive integer`,
    );
  }
  return value;
}

function requireUniqueStrings(values, field, allowEmpty = true) {
  if (!Array.isArray(values) || (!allowEmpty && values.length === 0)) {
    throw new ImplementationOutcomeContractError(
      `${field} must be ${allowEmpty ? 'an' : 'a non-empty'} array`,
    );
  }
  values.forEach((value, index) => requireString(value, `${field}[${index}]`));
  if (new Set(values).size !== values.length) {
    throw new ImplementationOutcomeContractError(`${field} contains duplicates`);
  }
  return values;
}

function recordContents(record) {
  const contents = structuredClone(record);
  delete contents.fingerprint;
  return contents;
}

function sealRecord(record) {
  const contents = recordContents(record);
  return Object.freeze({
    ...contents,
    fingerprint: fingerprintValue(contents),
  });
}

function validateSealed(record, kind, field) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new ImplementationOutcomeContractError(`${field} must be an object`);
  }
  if (record.kind !== kind) {
    throw new ImplementationOutcomeContractError(`${field} kind is invalid`);
  }
  if (record.fingerprint !== fingerprintValue(recordContents(record))) {
    throw new ImplementationOutcomeContractError(`${field} fingerprint mismatch`);
  }
  return record;
}

function detectTicketCycle(tickets) {
  const blockers = new Map(
    tickets.map(({ id, blockers: dependencies }) => [id, dependencies]),
  );
  const visiting = new Set();
  const visited = new Set();

  function visit(id) {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;

    visiting.add(id);
    if (blockers.get(id).some(visit)) return true;

    visiting.delete(id);
    visited.add(id);
    return false;
  }
  return tickets.some(({ id }) => visit(id));
}

function normalizeTicket(ticket, caseField, index, knownIds) {
  const field = `${caseField}.tickets[${index}]`;
  if (!ticket || typeof ticket !== 'object' || Array.isArray(ticket)) {
    throw new ImplementationOutcomeContractError(`${field} must be an object`);
  }
  const id = requireString(ticket.id, `${field}.id`);
  if (knownIds.has(id)) {
    throw new ImplementationOutcomeContractError(`${caseField}.tickets duplicate "${id}"`);
  }
  knownIds.add(id);
  return {
    id,
    blockers: [...requireUniqueStrings(ticket.blockers, `${field}.blockers`)],
    collisions: [
      ...requireUniqueStrings(ticket.collisions, `${field}.collisions`),
    ],
    ticketDigest: requireDigest(ticket.ticketDigest, `${field}.ticketDigest`),
  };
}

function normalizeCase(caseDefinition, index, caseIds) {
  const field = `cases[${index}]`;
  const id = requireString(caseDefinition?.id, `${field}.id`);
  if (caseIds.has(id)) {
    throw new ImplementationOutcomeContractError(`cases duplicate "${id}"`);
  }
  caseIds.add(id);
  const ticketIds = new Set();
  const tickets = (caseDefinition.tickets || []).map(
    (ticket, ticketIndex) => normalizeTicket(
      ticket,
      field,
      ticketIndex,
      ticketIds,
    ),
  );
  if (tickets.length === 0) {
    throw new ImplementationOutcomeContractError(`${field}.tickets must not be empty`);
  }
  for (const ticket of tickets) {
    const unknown = ticket.blockers.find((blocker) => !ticketIds.has(blocker));
    if (unknown || ticket.blockers.includes(ticket.id)) {
      throw new ImplementationOutcomeContractError(
        `${field}.tickets "${ticket.id}" has invalid blocker "${unknown || ticket.id}"`,
      );
    }
  }
  if (detectTicketCycle(tickets)) {
    throw new ImplementationOutcomeContractError(`${field}.tickets contain a cycle`);
  }
  const normalizedCase = {
    id,
    repositoryUrl: requireString(
      caseDefinition.repositoryUrl,
      `${field}.repositoryUrl`,
    ),
    baseRevision: requireDigest(
      caseDefinition.baseRevision,
      `${field}.baseRevision`,
      40,
    ),
    fixtureDigest: requireDigest(
      caseDefinition.fixtureDigest,
      `${field}.fixtureDigest`,
    ),
    sourceDigest: requireDigest(
      caseDefinition.sourceDigest,
      `${field}.sourceDigest`,
    ),
    oracleDigest: requireDigest(
      caseDefinition.oracleDigest,
      `${field}.oracleDigest`,
    ),
    tickets,
  };
  return {
    ...normalizedCase,
    fingerprint: fingerprintValue(normalizedCase),
  };
}

function normalizeModels(models) {
  if (!models || typeof models !== 'object' || Array.isArray(models)) {
    throw new ImplementationOutcomeContractError('models must be an object');
  }
  return Object.fromEntries(MODEL_ROLES.map((role) => {
    try {
      return [role, normalizeModelSelection(models[role], `models.${role}`)];
    } catch (error) {
      throw new ImplementationOutcomeContractError(error.message);
    }
  }));
}

function freezePlan(value) {
  Object.freeze(value.models);
  value.cases.forEach((caseDefinition) => {
    caseDefinition.tickets.forEach((ticket) => {
      Object.freeze(ticket.blockers);
      Object.freeze(ticket.collisions);
      Object.freeze(ticket);
    });
    Object.freeze(caseDefinition.tickets);
    Object.freeze(caseDefinition);
  });
  Object.freeze(value.cases);
  return Object.freeze(value);
}

function createImplementationOutcomePlan({
  candidateRevision,
  cases,
  models,
  repetitions,
  randomizationSeed,
}) {
  requireDigest(candidateRevision, 'candidateRevision', 40);
  requirePositiveInteger(repetitions, 'repetitions');
  requireString(randomizationSeed, 'randomizationSeed');
  if (!Array.isArray(cases) || cases.length === 0) {
    throw new ImplementationOutcomeContractError('cases must be a non-empty array');
  }
  const caseIds = new Set();
  const contents = {
    schemaVersion: 1,
    kind: PLAN_KIND,
    candidateRevision,
    repetitions,
    randomizationSeed,
    models: normalizeModels(models),
    cases: cases.map(
      (caseDefinition, index) => normalizeCase(caseDefinition, index, caseIds),
    ),
  };
  return freezePlan({
    ...contents,
    fingerprint: fingerprintValue(contents),
  });
}

function validateImplementationOutcomePlan(plan) {
  validateSealed(plan, PLAN_KIND, 'implementation outcome plan');
  const expected = createImplementationOutcomePlan({
    candidateRevision: plan.candidateRevision,
    cases: plan.cases,
    models: plan.models,
    repetitions: plan.repetitions,
    randomizationSeed: plan.randomizationSeed,
  });
  if (expected.fingerprint !== plan.fingerprint) {
    throw new ImplementationOutcomeContractError(
      'implementation outcome plan is stale or malformed',
    );
  }
  return plan;
}

function armOrder(plan, caseDefinition, repetition) {
  const value = fingerprintValue({
    plan: plan.fingerprint,
    case: caseDefinition.fingerprint,
    repetition,
    seed: plan.randomizationSeed,
  });
  return Number.parseInt(value.slice(0, 2), 16) % 2 === 0
    ? [...ARMS]
    : [...ARMS].reverse();
}

function createPairManifest(plan, caseId, repetition) {
  validateImplementationOutcomePlan(plan);
  requirePositiveInteger(repetition, 'repetition');
  if (repetition > plan.repetitions) {
    throw new ImplementationOutcomeContractError(
      'repetition exceeds the planned count',
    );
  }
  const caseDefinition = plan.cases.find(({ id }) => id === caseId);
  if (!caseDefinition) {
    throw new ImplementationOutcomeContractError(`unknown case "${caseId}"`);
  }
  return sealRecord({
    schemaVersion: 1,
    kind: PAIR_KIND,
    planFingerprint: plan.fingerprint,
    caseId,
    caseFingerprint: caseDefinition.fingerprint,
    repetition,
    armOrder: armOrder(plan, caseDefinition, repetition),
  });
}

function createRunIndex(plan, pair) {
  validateImplementationOutcomePlan(plan);
  validateSealed(pair, PAIR_KIND, 'implementation outcome pair');
  if (pair.planFingerprint !== plan.fingerprint) {
    throw new ImplementationOutcomeContractError(
      'implementation outcome pair does not belong to the plan',
    );
  }
  return sealRecord({
    schemaVersion: 1,
    kind: RUN_INDEX_KIND,
    planFingerprint: plan.fingerprint,
    pairFingerprint: pair.fingerprint,
    checkpoints: [],
    complete: false,
  });
}

function validateRunIndex(index, plan, pair) {
  validateImplementationOutcomePlan(plan);
  validateSealed(pair, PAIR_KIND, 'implementation outcome pair');
  validateSealed(index, RUN_INDEX_KIND, 'implementation outcome run index');
  if (index.planFingerprint !== plan.fingerprint
    || index.pairFingerprint !== pair.fingerprint
    || !Array.isArray(index.checkpoints)
    || typeof index.complete !== 'boolean') {
    throw new ImplementationOutcomeContractError(
      'implementation outcome run index is stale or malformed',
    );
  }
  const keys = new Set();
  for (const [position, checkpoint] of index.checkpoints.entries()) {
    validateSealed(
      checkpoint,
      STAGE_CHECKPOINT_KIND,
      `checkpoints[${position}]`,
    );
    if (checkpoint.sequence !== position + 1) {
      throw new ImplementationOutcomeContractError(
        'implementation outcome checkpoint sequence is invalid',
      );
    }
    const key = [
      checkpoint.pairFingerprint,
      checkpoint.arm,
      checkpoint.stage,
      checkpoint.ticketId,
    ].join('\0');
    if (keys.has(key)) {
      throw new ImplementationOutcomeContractError(
        'implementation outcome checkpoints contain duplicates',
      );
    }
    keys.add(key);
  }
  return index;
}

module.exports = {
  ARMS,
  ImplementationOutcomeContractError,
  createImplementationOutcomePlan,
  createPairManifest,
  createRunIndex,
  sealRecord,
  validateImplementationOutcomePlan,
  validateRunIndex,
};
