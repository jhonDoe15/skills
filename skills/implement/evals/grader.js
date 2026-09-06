'use strict';

const { validateResult } = require('../../../suite');
const { validateImplementHandoff } = require('./handoff');

const ALLOWED_MUTATIONS = new Set([
  'write',
  'edit',
  'delete',
  'move',
  'shell',
]);

function check(name, passed, details) {
  return { name, passed, details };
}

function resultText(result) {
  return result.observations.responses.map(({ text }) => text).join('\n\n');
}

function loadedSkill(result, name) {
  return result.observations.skillEvents.some((event) => (
    event.name === name
      && event.operation === 'load'
      && event.status === 'succeeded'
  ));
}

function mutationIdentity({ operation, target }) {
  return `${operation}:${target}`;
}

function mutationEvidenceMatches(handoff, attemptedMutations) {
  if (!handoff) return false;
  const recorded = handoff.lifecycle
    .filter(({ kind }) => kind === 'mutation')
    .map(({ reference, status }) => `${reference}:${status}`);
  const observed = attemptedMutations.map((mutation) => (
    `${mutationIdentity(mutation)}:${mutation.outcome}`
  ));
  return recorded.length === observed.length
    && recorded.every((entry, index) => entry === observed[index]);
}

function gradeImplementResult({ result, resolveArtifact = () => null }) {
  validateResult(result);
  const { observations } = result;
  const artifacts = observations.artifacts;
  const artifact = artifacts.length === 1 ? artifacts[0] : null;
  const serialized = artifact?.mediaType === 'application/json'
    ? resolveArtifact(artifact.reference)
    : null;
  let handoff = null;
  let artifactError = null;
  if (typeof serialized === 'string') {
    try {
      handoff = validateImplementHandoff(JSON.parse(serialized));
    } catch (error) {
      artifactError = error.message;
    }
  }
  const implementLoaded = loadedSkill(result, 'implement');
  const guidanceLoaded = loadedSkill(result, 'engineering-guidance');
  const mutationOperations = observations.attemptedMutations
    .map(({ operation }) => operation);

  const checks = [
    check(
      'one readable JSON handoff',
      handoff !== null,
      handoff ? artifact.reference : (artifactError || 'artifact unavailable'),
    ),
    check(
      'response references handoff',
      artifact !== null && resultText(result).includes(artifact.reference),
      artifact?.reference || 'artifact absent',
    ),
    check(
      'Implement lifecycle observed',
      implementLoaded,
      `loaded=${implementLoaded}`,
    ),
    check(
      'no full Code Review',
      !observations.toolUses.some(({ name }) => name.toLowerCase() === 'code-review'),
      `tools=${observations.toolUses.map(({ name }) => name).join(',')}`,
    ),
    check(
      'only scoped patch mutations',
      mutationOperations.every((operation) => ALLOWED_MUTATIONS.has(operation)),
      `operations=${mutationOperations.join(',') || 'none'}`,
    ),
    check(
      'ordered mutation evidence matches observations',
      mutationEvidenceMatches(handoff, observations.attemptedMutations),
      `recorded=${handoff?.lifecycle
        .filter(({ kind }) => kind === 'mutation').length || 0} observed=${
        observations.attemptedMutations.length
      }`,
    ),
  ];

  if (handoff?.status === 'completed') {
    checks.push(check(
      'completed result and guidance load',
      result.status === 'succeeded' && guidanceLoaded,
      `status=${result.status} guidance=${guidanceLoaded}`,
    ));
  } else if (handoff?.failure.kind === 'guidance') {
    checks.push(check(
      'guidance failure stops before mutation',
      result.status === 'failed'
        && observations.attemptedMutations.length === 0
        && handoff.failure.message
          === 'Missing internal dependency "engineering-guidance"',
      `status=${result.status} mutations=${
        observations.attemptedMutations.length
      } message=${handoff.failure.message}`,
    ));
  } else if (handoff) {
    checks.push(check(
      'failed artifact is not complete',
      result.status === 'failed',
      `status=${result.status} kind=${handoff.failure.kind}`,
    ));
  }

  return {
    passed: checks.every(({ passed }) => passed),
    checks,
  };
}

module.exports = { gradeImplementResult };
