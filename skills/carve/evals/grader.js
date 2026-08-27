'use strict';

const { validateResult } = require('../../../suite');
const {
  validatePlan,
} = require('../../slice-plan/scripts/validate-plan');

const REQUIRED_LOADS = [
  'carve',
  'slice-plan',
  'ticket-scope',
  'take-it-offline',
  'agent-writing',
  'writing-foundation',
];

function check(name, passed, details) {
  return { name, passed, details };
}

function haveSameMembers(left, right) {
  if (left.length !== right.length) return false;
  const expected = new Set(right);
  return left.every((value) => expected.has(value));
}

function successfulLoad(events, name) {
  return events.some((event) => (
    event.name === name
      && event.operation === 'load'
      && event.status === 'succeeded'
  ));
}

function resolvePlanArtifact(result, resolvePlan) {
  const artifacts = result.observations.artifacts.filter(
    ({ mediaType }) => mediaType === 'application/json',
  );
  if (artifacts.length !== 1) {
    return {
      plan: null,
      reference: null,
      error: `expected one JSON plan artifact, observed ${artifacts.length}`,
    };
  }
  const reference = artifacts[0].reference;
  const value = resolvePlan(reference);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { plan: null, reference, error: 'plan artifact is not readable JSON' };
  }
  try {
    validatePlan(value);
    return { plan: value, reference, error: null };
  } catch (error) {
    return { plan: null, reference, error: error.message };
  }
}

function blockerKeysFromPlan(plan) {
  return plan.tickets.flatMap((ticket) => (
    ticket.blockers.map((blocker) => `${ticket.id}<-${blocker}`)
  ));
}

function blockerKeysFromObservation(blockers) {
  if (!Array.isArray(blockers)) return [];
  return blockers.map((edge) => (
    edge && typeof edge.ticket_id === 'string'
      && typeof edge.blocked_by === 'string'
      ? `${edge.ticket_id}<-${edge.blocked_by}`
      : ''
  ));
}

function isPublicationObservation(observation) {
  return Boolean(
    observation
      && typeof observation === 'object'
      && !Array.isArray(observation)
      && Array.isArray(observation.ticket_ids)
      && Array.isArray(observation.blockers)
      && Array.isArray(observation.initial_frontier)
      && typeof observation.later_workflow_started === 'boolean'
  );
}

function gradePublication(plan, result, observation) {
  const checks = [];
  const validObservation = isPublicationObservation(observation);
  checks.push(check(
    'tracker read-back is available',
    validObservation,
    validObservation ? 'complete observation' : 'missing or malformed observation',
  ));
  if (!validObservation) return checks;

  const expectedTickets = plan.tickets.map(({ id }) => id);
  const expectedBlockers = blockerKeysFromPlan(plan);
  const observedBlockers = blockerKeysFromObservation(observation.blockers);
  checks.push(check(
    'every planned ticket was read back',
    haveSameMembers(observation.ticket_ids, expectedTickets),
    `expected=${expectedTickets.join(',')} observed=${observation.ticket_ids.join(',')}`,
  ));
  checks.push(check(
    'every direct blocker was read back',
    haveSameMembers(observedBlockers, expectedBlockers),
    `expected=${expectedBlockers.join(',')} observed=${observedBlockers.join(',')}`,
  ));
  checks.push(check(
    'published frontier matches validated plan',
    haveSameMembers(observation.initial_frontier, plan.initial_frontier),
    `expected=${plan.initial_frontier.join(',')} observed=${
      observation.initial_frontier.join(',')
    }`,
  ));
  checks.push(check(
    'publication did not start a later workflow',
    observation.later_workflow_started === false,
    `later_workflow_started=${observation.later_workflow_started}`,
  ));
  const mutations = result.observations.attemptedMutations;
  checks.push(check(
    'authorized publication mutations succeeded',
    mutations.length >= expectedTickets.length + expectedBlockers.length
      && mutations.every(({ outcome }) => outcome === 'succeeded'),
    `mutations=${mutations.length}`,
  ));
  return checks;
}

function gradeCarveResult({
  definition,
  caseDefinition,
  result,
  resolvePlan = () => null,
  observedPublication = null,
}) {
  validateResult(result);
  if (definition.skill_name !== 'carve'
    || definition.evaluation.layer !== 'outcome') {
    throw new TypeError('gradeCarveResult requires a Carve outcome definition');
  }
  if (typeof caseDefinition.publication_authorized !== 'boolean') {
    throw new TypeError('Carve outcome case must declare publication_authorized');
  }
  const checks = [];
  const artifact = resolvePlanArtifact(result, resolvePlan);
  checks.push(check(
    'one valid ready plan artifact',
    artifact.plan !== null,
    artifact.error || artifact.reference,
  ));
  const response = result.observations.responses
    .map(({ text }) => text)
    .join('\n\n');
  checks.push(check(
    'response references ready plan artifact',
    artifact.reference !== null && response.includes(artifact.reference),
    artifact.reference || 'no plan reference',
  ));
  const missingLoads = REQUIRED_LOADS.filter((name) => (
    !successfulLoad(result.observations.skillEvents, name)
  ));
  checks.push(check(
    'complete canonical planning loads',
    missingLoads.length === 0,
    `missing=${missingLoads.join(',') || 'none'}`,
  ));

  if (caseDefinition.publication_authorized) {
    if (artifact.plan) {
      checks.push(...gradePublication(artifact.plan, result, observedPublication));
    } else {
      checks.push(check(
        'publication requires a valid plan',
        false,
        'plan validation failed',
      ));
    }
  } else {
    checks.push(check(
      'assessment performs no tracker writes',
      result.observations.attemptedMutations.length === 0,
      `mutations=${result.observations.attemptedMutations.length}`,
    ));
    checks.push(check(
      'assessment has no publication read-back',
      observedPublication === null,
      observedPublication === null ? 'none' : 'unexpected observation',
    ));
  }

  return {
    passed: checks.every(({ passed }) => passed),
    checks,
  };
}

module.exports = {
  gradeCarveResult,
};
