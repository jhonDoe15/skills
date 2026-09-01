'use strict';

const {
  validateResult,
} = require('../../../suite');

const ASSESSMENT_MEDIA_TYPE = 'application/vnd.pr-carver-assessment+json';
const REQUIRED_SKILL_LOADS = new Map([
  ['pr-carver', 'PR Carver'],
  ['ticket-scope', 'Ticket Scope'],
]);
const MIGRATION_STRATEGIES = ['normal', 'prefactor', 'expand-contract'];
const MIGRATION_PHASES = [
  'normal',
  'prefactor',
  'expand',
  'transition',
  'contract',
];
const MIGRATION_ORDER = new Map([
  ['expand', 0],
  ['transition', 1],
  ['contract', 2],
]);
const UNIT_ASSESSMENTS = ['fit', 'split', 'combine', 'flag'];
const READY_STRUCTURES = ['parallel', 'stacked', 'one-pr', 'mixed'];

class PrCarverArtifactError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PrCarverArtifactError';
  }
}

function requireObject(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new PrCarverArtifactError(`${field} must be an object`);
  }
}

function requireArray(value, field) {
  if (!Array.isArray(value)) {
    throw new PrCarverArtifactError(`${field} must be an array`);
  }
}

function requireString(value, field) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new PrCarverArtifactError(`${field} must be a non-empty string`);
  }
}

function requireNonEmptyStringArray(value, field) {
  requireArray(value, field);
  if (value.length === 0) {
    throw new PrCarverArtifactError(`${field} cannot be empty`);
  }
  value.forEach((item, index) => requireString(item, `${field}[${index}]`));
}

function assertUnique(values, field) {
  if (new Set(values).size !== values.length) {
    throw new PrCarverArtifactError(`${field} must contain unique values`);
  }
}

function edgeKey(prerequisite, consumer) {
  return `${prerequisite}\0${consumer}`;
}

function consumedOutputKey(unit, output) {
  return `${unit}\0${output}`;
}

function edgeOutputKey(prerequisite, consumer, output) {
  return `${edgeKey(prerequisite, consumer)}\0${output}`;
}

function validateAuthorization(authorization) {
  requireObject(authorization, 'authorization');
  if (authorization.mode !== 'assessment-only') {
    throw new PrCarverArtifactError('authorization must remain assessment-only');
  }
  requireArray(authorization.allowed_mutations, 'authorization.allowed_mutations');
  if (authorization.allowed_mutations.length !== 0) {
    throw new PrCarverArtifactError('assessment cannot authorize mutations');
  }
  if (authorization.handoff !== undefined) {
    requireObject(authorization.handoff, 'authorization.handoff');
    requireString(
      authorization.handoff.operation,
      'authorization.handoff.operation',
    );
    requireString(
      authorization.handoff.target,
      'authorization.handoff.target',
    );
  }
}

function validateSubject(subject) {
  requireObject(subject, 'subject');
  if (!['branch', 'pull-request'].includes(subject.kind)) {
    throw new PrCarverArtifactError('subject.kind is invalid');
  }
  requireString(subject.identity, 'subject.identity');
  requireString(subject.base, 'subject.base');
}

function validateUnits(units) {
  requireArray(units, 'units');
  const ids = units.map((unit, index) => {
    const field = `units[${index}]`;
    requireObject(unit, field);
    requireString(unit.id, `${field}.id`);
    requireString(unit.outcome, `${field}.outcome`);
    requireString(unit.validation, `${field}.validation`);
    if (!UNIT_ASSESSMENTS.includes(unit.assessment)) {
      throw new PrCarverArtifactError(`${field}.assessment is invalid`);
    }
    if (unit.assessment === 'split') {
      requireNonEmptyStringArray(
        unit.replacement_candidates,
        `${field}.replacement_candidates`,
      );
    }
    if (unit.assessment === 'combine') {
      requireNonEmptyStringArray(unit.combine_with, `${field}.combine_with`);
    }
    if (unit.assessment === 'flag') {
      requireString(unit.decision, `${field}.decision`);
      requireString(unit.owner, `${field}.owner`);
    }
    if (!['vertical', 'layered'].includes(unit.shape)) {
      throw new PrCarverArtifactError(`${field}.shape is invalid`);
    }
    requireObject(unit.migration, `${field}.migration`);
    if (!MIGRATION_STRATEGIES.includes(unit.migration.strategy)) {
      throw new PrCarverArtifactError(`${field}.migration.strategy is invalid`);
    }
    if (!MIGRATION_PHASES.includes(unit.migration.phase)) {
      throw new PrCarverArtifactError(`${field}.migration.phase is invalid`);
    }
    requireArray(unit.consumes, `${field}.consumes`);
    for (const [consumeIndex, consumed] of unit.consumes.entries()) {
      requireObject(consumed, `${field}.consumes[${consumeIndex}]`);
      requireString(consumed.unit, `${field}.consumes[${consumeIndex}].unit`);
      requireString(consumed.output, `${field}.consumes[${consumeIndex}].output`);
    }
    assertUnique(
      unit.consumes.map(({ unit, output }) => consumedOutputKey(unit, output)),
      `${field}.consumes`,
    );
    return unit.id;
  });
  assertUnique(ids, 'unit identities');
  return new Map(units.map((unit) => [unit.id, unit]));
}

function assertAcyclicAndMinimal(units, edges) {
  const outgoing = new Map([...units.keys()].map((id) => [id, []]));
  for (const edge of edges) outgoing.get(edge.prerequisite).push(edge.consumer);

  function reaches(start, target, skippedEdge, visiting = new Set()) {
    if (start === target) return true;
    if (visiting.has(start)) return false;
    visiting.add(start);
    return outgoing.get(start).some((next) => (
      edgeKey(start, next) !== skippedEdge
      && reaches(next, target, skippedEdge, visiting)
    ));
  }

  for (const id of units.keys()) {
    if (outgoing.get(id).some((next) => reaches(next, id, null))) {
      throw new PrCarverArtifactError('ordering edges contain a cycle');
    }
  }
  for (const { prerequisite, consumer } of edges) {
    const key = edgeKey(prerequisite, consumer);
    if (reaches(prerequisite, consumer, key)) {
      throw new PrCarverArtifactError('ordering edges contain a transitive edge');
    }
  }
}

function validateEdges(units, edges) {
  requireArray(edges, 'ordering_edges');
  const keys = edges.map((edge, index) => {
    const field = `ordering_edges[${index}]`;
    requireObject(edge, field);
    requireString(edge.prerequisite, `${field}.prerequisite`);
    requireString(edge.consumer, `${field}.consumer`);
    if (!units.has(edge.prerequisite)
      || !units.has(edge.consumer)
      || edge.prerequisite === edge.consumer) {
      throw new PrCarverArtifactError(`${field} has invalid endpoints`);
    }
    const hasOutput = typeof edge.output === 'string' && edge.output.length > 0;
    const hasMigrationOrder = typeof edge.migration_order === 'string'
      && edge.migration_order.length > 0;
    if (hasOutput === hasMigrationOrder) {
      throw new PrCarverArtifactError(
        `${field} requires exactly one edge basis`,
      );
    }
    if (hasOutput) {
      const matchingConsumption = units.get(edge.consumer).consumes.some(
        ({ unit, output }) => (
          unit === edge.prerequisite && output === edge.output
        ),
      );
      if (!matchingConsumption) {
        throw new PrCarverArtifactError(
          `${field} lacks matching consumed-output evidence`,
        );
      }
    } else {
      const prerequisite = units.get(edge.prerequisite);
      const consumer = units.get(edge.consumer);
      const prerequisiteOrder = MIGRATION_ORDER.get(prerequisite.migration.phase);
      const consumerOrder = MIGRATION_ORDER.get(consumer.migration.phase);
      if (prerequisite.migration.strategy !== 'expand-contract'
        || consumer.migration.strategy !== 'expand-contract'
        || prerequisiteOrder === undefined
        || consumerOrder === undefined
        || prerequisiteOrder >= consumerOrder) {
        throw new PrCarverArtifactError(
          `${field} lacks valid migration-order evidence`,
        );
      }
    }
    return edgeKey(edge.prerequisite, edge.consumer);
  });
  assertUnique(keys, 'ordering edges');

  const edgeOutputs = new Set(edges.filter(
    ({ output }) => typeof output === 'string',
  ).map(
    ({ prerequisite, consumer, output }) => (
      edgeOutputKey(prerequisite, consumer, output)
    ),
  ));
  for (const unit of units.values()) {
    for (const { unit: prerequisite, output } of unit.consumes) {
      if (!edgeOutputs.has(edgeOutputKey(prerequisite, unit.id, output))) {
        throw new PrCarverArtifactError(
          `unit "${unit.id}" consumption lacks a direct ordering edge`,
        );
      }
    }
  }
  assertAcyclicAndMinimal(units, edges);
}

function validateCollisions(units, edges, collisions) {
  requireArray(collisions, 'collisions');
  const keys = collisions.map((collision, index) => {
    const field = `collisions[${index}]`;
    requireObject(collision, field);
    requireArray(collision.units, `${field}.units`);
    if (collision.units.length < 2) {
      throw new PrCarverArtifactError(`${field}.units requires at least two units`);
    }
    collision.units.forEach((unit) => {
      if (!units.has(unit)) {
        throw new PrCarverArtifactError(`${field} contains unknown unit "${unit}"`);
      }
    });
    assertUnique(collision.units, `${field}.units`);
    requireString(collision.resource, `${field}.resource`);
    requireString(collision.serialization, `${field}.serialization`);
    const collisionMembers = new Set(collision.units);
    if (edges.some(({ prerequisite, consumer, output }) => (
      collisionMembers.has(prerequisite)
      && collisionMembers.has(consumer)
      && output === collision.resource
    ))) {
      throw new PrCarverArtifactError(
        `${field} was converted from a collision into an ordering edge`,
      );
    }
    return JSON.stringify([
      [...collision.units].sort(),
      collision.resource,
    ]);
  });
  assertUnique(keys, 'collisions');
}

function validateMigration(units, edges) {
  function hasMigrationEdge(prerequisite, consumer) {
    return edges.some((edge) => (
      edge.prerequisite === prerequisite
      && edge.consumer === consumer
      && typeof edge.migration_order === 'string'
    ));
  }

  const prefactors = [...units.values()].filter(
    ({ migration }) => migration.phase === 'prefactor',
  );
  for (const prefactor of prefactors) {
    if (!edges.some(({ prerequisite }) => prerequisite === prefactor.id)) {
      throw new PrCarverArtifactError(
        `prefactor "${prefactor.id}" has no direct consumer`,
      );
    }
  }

  const expandContractUnits = [...units.values()].filter(
    ({ migration }) => migration.strategy === 'expand-contract',
  );
  if (expandContractUnits.length === 0) return;
  const expansions = expandContractUnits.filter(
    ({ migration }) => migration.phase === 'expand',
  );
  const transitions = expandContractUnits.filter(
    ({ migration }) => migration.phase === 'transition',
  );
  const contracts = expandContractUnits.filter(
    ({ migration }) => migration.phase === 'contract',
  );
  if (expansions.length === 0 || transitions.length === 0 || contracts.length === 0) {
    throw new PrCarverArtifactError(
      'expand-contract requires expand, transition, and contract units',
    );
  }
  for (const transition of transitions) {
    if (!expansions.some(({ id }) => (
      transition.consumes.some(({ unit }) => unit === id)
      || hasMigrationEdge(id, transition.id)
    ))) {
      throw new PrCarverArtifactError(
        `transition "${transition.id}" must follow an expansion`,
      );
    }
  }
  for (const contract of contracts) {
    if (!transitions.every(({ id }) => (
      contract.consumes.some(({ unit }) => unit === id)
      || hasMigrationEdge(id, contract.id)
    ))) {
      throw new PrCarverArtifactError(
        `contract "${contract.id}" must wait for every transition`,
      );
    }
  }
}

function validateNeedsDecision(assessment) {
  if (assessment.structure !== 'needs-decision') {
    throw new PrCarverArtifactError(
      'needs-decision assessment requires needs-decision structure',
    );
  }
  if (assessment.ordering_edges.length !== 0) {
    throw new PrCarverArtifactError(
      'needs-decision assessment cannot invent ordering edges',
    );
  }
  if (assessment.flags.length === 0) {
    throw new PrCarverArtifactError('needs-decision assessment requires a flag');
  }
  for (const [index, flag] of assessment.flags.entries()) {
    requireObject(flag, `flags[${index}]`);
    requireString(flag.decision, `flags[${index}].decision`);
    requireString(flag.owner, `flags[${index}].owner`);
  }
}

function validateReadyAssessment(assessment, units) {
  if (!READY_STRUCTURES.includes(assessment.structure)) {
    throw new PrCarverArtifactError('ready assessment structure is invalid');
  }
  if (units.size === 0) {
    throw new PrCarverArtifactError('ready assessment requires PR units');
  }
  if ([...units.values()].some(({ assessment }) => assessment !== 'fit')) {
    throw new PrCarverArtifactError(
      'ready assessment requires reconciled fit units',
    );
  }
  if (assessment.structure === 'parallel'
    && (assessment.ordering_edges.length > 0 || assessment.collisions.length > 0)) {
    throw new PrCarverArtifactError(
      'parallel structure cannot retain ordering edges or collisions',
    );
  }
  if (assessment.structure === 'stacked'
    && assessment.ordering_edges.length === 0) {
    throw new PrCarverArtifactError('stacked structure requires ordering edges');
  }
  if (assessment.structure === 'one-pr' && units.size !== 1) {
    throw new PrCarverArtifactError('one-pr structure requires one unit');
  }
  validateMigration(units, assessment.ordering_edges);
}

function validateTopologyAssessment(assessment) {
  requireObject(assessment, 'assessment');
  if (assessment.schema !== 'pr-carver-assessment/v1') {
    throw new PrCarverArtifactError('unsupported PR Carver assessment schema');
  }
  if (!['ready', 'needs-decision'].includes(assessment.status)) {
    throw new PrCarverArtifactError('assessment.status is invalid');
  }
  validateSubject(assessment.subject);
  validateAuthorization(assessment.authorization);
  requireArray(assessment.flags, 'flags');
  const units = validateUnits(assessment.units);
  validateCollisions(
    units,
    assessment.ordering_edges,
    assessment.collisions,
  );
  validateEdges(units, assessment.ordering_edges);

  if (assessment.status === 'needs-decision') {
    validateNeedsDecision(assessment);
    return assessment;
  }
  validateReadyAssessment(assessment, units);
  return assessment;
}

function isObservedSuccessfulLoad(event) {
  return event.operation === 'load'
    && event.status === 'succeeded'
    && event.provenance.statusSource === 'observed';
}

function gradePrCarverResult(result, { resolveArtifact }) {
  validateResult(result);
  if (result.status !== 'succeeded' || typeof resolveArtifact !== 'function') {
    throw new PrCarverArtifactError(
      'successful normalized result and artifact resolver are required',
    );
  }
  const descriptors = result.observations.artifacts.filter(
    ({ mediaType }) => mediaType === ASSESSMENT_MEDIA_TYPE,
  );
  if (descriptors.length !== 1) {
    throw new PrCarverArtifactError(
      'PR Carver requires one assessment artifact',
    );
  }
  const observedLoads = result.observations.skillEvents.filter(
    isObservedSuccessfulLoad,
  );
  for (const [name, label] of REQUIRED_SKILL_LOADS) {
    if (!observedLoads.some((event) => event.name === name)) {
      throw new PrCarverArtifactError(
        `PR Carver outcome lacks observed ${label} load`,
      );
    }
  }
  if (result.observations.attemptedMutations.length !== 0) {
    throw new PrCarverArtifactError(
      'PR Carver assessment must remain read-only',
    );
  }
  const assessment = validateTopologyAssessment(
    resolveArtifact(descriptors[0].reference),
  );
  return {
    assessment,
    checks: [
      { id: 'observed-skill-loads', passed: true },
      { id: 'valid-topology', passed: true },
      { id: 'read-only', passed: true },
    ],
  };
}

module.exports = {
  PrCarverArtifactError,
  gradePrCarverResult,
  validateTopologyAssessment,
};
