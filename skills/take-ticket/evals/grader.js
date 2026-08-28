'use strict';

const { validateResult } = require('../../../suite');
const { validateTakeTicketResult } = require('./lifecycle');

const ALLOWED_MUTATIONS = new Set(['write', 'edit', 'delete', 'move', 'shell']);

function check(name, passed, details) {
  return { name, passed, details };
}

function loadedSkill(result, name) {
  return result.observations.skillEvents.some((event) => (
    event.name === name
      && event.operation === 'load'
      && event.status === 'succeeded'
  ));
}

function resultText(result) {
  return result.observations.responses.map(({ text }) => text).join('\n\n');
}

function gradeTakeTicketResult({ result, resolveArtifact = () => null }) {
  validateResult(result);
  const { observations } = result;
  const artifact = observations.artifacts.length === 1
    ? observations.artifacts[0]
    : null;
  const serialized = artifact?.mediaType === 'application/json'
    ? resolveArtifact(artifact.reference)
    : null;
  let lifecycle = null;
  let artifactError = null;
  if (typeof serialized === 'string') {
    try {
      lifecycle = validateTakeTicketResult(JSON.parse(serialized));
    } catch (error) {
      artifactError = error.message;
    }
  }
  const mutationOperations = observations.attemptedMutations
    .map(({ operation }) => operation);
  const requiredLoads = ['take-ticket', 'implement', 'code-review'];
  const observedRequiredLoads = requiredLoads.filter(
    (name) => loadedSkill(result, name),
  );
  const checks = [
    check(
      'one readable JSON lifecycle artifact',
      lifecycle !== null,
      lifecycle ? artifact.reference : (artifactError || 'artifact unavailable'),
    ),
    check(
      'response references lifecycle artifact',
      artifact !== null && resultText(result).includes(artifact.reference),
      artifact?.reference || 'artifact absent',
    ),
    check(
      'canonical lifecycle dependencies observed',
      observedRequiredLoads.length === requiredLoads.length,
      `loaded=${observedRequiredLoads.join(',')}`,
    ),
    check(
      'only scoped patch mutations',
      mutationOperations.every((operation) => ALLOWED_MUTATIONS.has(operation)),
      `operations=${mutationOperations.join(',') || 'none'}`,
    ),
  ];

  if (lifecycle?.status === 'reviewed') {
    checks.push(check(
      'reviewed lifecycle succeeded',
      result.status === 'succeeded' && lifecycle.completeness.reviewed === true,
      `status=${result.status} reviewed=${lifecycle.completeness.reviewed}`,
    ));
  } else if (lifecycle) {
    checks.push(check(
      'non-reviewed lifecycle remains failed',
      result.status === 'failed' && lifecycle.completeness.reviewed === false,
      `status=${result.status} reviewed=${lifecycle.completeness.reviewed}`,
    ));
  }

  return {
    passed: checks.every(({ passed }) => passed),
    checks,
  };
}

module.exports = { gradeTakeTicketResult };
