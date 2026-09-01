'use strict';

function deepFreeze(value) {
  Object.freeze(value);
  for (const nested of Object.values(value)) {
    if (nested && typeof nested === 'object' && !Object.isFrozen(nested)) {
      deepFreeze(nested);
    }
  }
  return value;
}

const EXACT_RELEASE_TARGET = deepFreeze({
  identity: {
    name: 'skills',
    version: '1.0.0',
    stage: 'release-candidate',
  },
  inventory: [
    { name: 'agent-writing', classification: 'primary' },
    { name: 'carve', classification: 'primary' },
    { name: 'code-review', classification: 'primary' },
    { name: 'dispatch-work', classification: 'primary' },
    { name: 'engineering-guidance', classification: 'primary' },
    { name: 'implement', classification: 'primary' },
    { name: 'incident-investigation', classification: 'primary' },
    { name: 'pr-carver', classification: 'primary' },
    { name: 'skill-writing', classification: 'primary' },
    { name: 'take-it-offline', classification: 'primary' },
    { name: 'take-ticket', classification: 'primary' },
    { name: 'to-humans', classification: 'audience' },
    { name: 'review-coordinator', classification: 'private' },
    { name: 'review-worker', classification: 'private' },
    { name: 'skill-evaluation', classification: 'private' },
    { name: 'skill-mechanics', classification: 'private' },
    { name: 'slice-plan', classification: 'private' },
    { name: 'ticket-scope', classification: 'private' },
    { name: 'writing-foundation', classification: 'private' },
  ],
  runtimeEdges: [
    { consumer: 'agent-writing', dependency: 'writing-foundation' },
    { consumer: 'carve', dependency: 'slice-plan' },
    { consumer: 'code-review', dependency: 'review-coordinator' },
    { consumer: 'code-review', dependency: 'review-worker' },
    { consumer: 'code-review', dependency: 'take-it-offline' },
    { consumer: 'dispatch-work', dependency: 'take-it-offline' },
    { consumer: 'dispatch-work', dependency: 'take-ticket' },
    { consumer: 'implement', dependency: 'engineering-guidance' },
    { consumer: 'pr-carver', dependency: 'ticket-scope' },
    { consumer: 'review-coordinator', dependency: 'take-it-offline' },
    { consumer: 'review-worker', dependency: 'engineering-guidance' },
    { consumer: 'review-worker', dependency: 'take-it-offline' },
    { consumer: 'skill-writing', dependency: 'agent-writing' },
    { consumer: 'skill-writing', dependency: 'skill-evaluation' },
    { consumer: 'skill-writing', dependency: 'skill-mechanics' },
    { consumer: 'slice-plan', dependency: 'take-it-offline' },
    { consumer: 'slice-plan', dependency: 'ticket-scope' },
    { consumer: 'take-it-offline', dependency: 'agent-writing' },
    { consumer: 'take-ticket', dependency: 'code-review' },
    { consumer: 'take-ticket', dependency: 'implement' },
    { consumer: 'to-humans', dependency: 'writing-foundation' },
  ],
  externalPrerequisites: [
    { name: 'autopilot', consumers: ['dispatch-work', 'pr-carver'] },
    { name: 'split-to-prs', consumers: ['pr-carver'] },
    { name: 'tdd', consumers: ['implement'] },
  ],
  predecessors: [
    { name: 'lean', replacement: 'to-humans' },
    { name: 'unslop', replacement: 'to-humans' },
    { name: 'writing-for-agents', replacement: 'agent-writing' },
    { name: 'writing-great-skills', replacement: 'skill-writing' },
    { name: 'handoff', replacement: 'take-it-offline' },
  ],
});

class SuiteContractError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SuiteContractError';
  }
}

function identity(value) {
  return value;
}

function requireArray(value, field) {
  if (!Array.isArray(value)) {
    throw new SuiteContractError(`${field} must be an array`);
  }
}

function assertUnique(
  values,
  field,
  keyOf = identity,
  displayOf = identity,
) {
  const seen = new Set();
  for (const value of values) {
    const key = keyOf(value);
    if (seen.has(key)) {
      throw new SuiteContractError(
        `${field} contains duplicate "${displayOf(value)}"`,
      );
    }
    seen.add(key);
  }
}

function canonicalSkillNames(suite) {
  return suite.inventory.map(({ name }) => name);
}

function runtimeEdgeKey({ consumer, dependency }) {
  return JSON.stringify([consumer, dependency]);
}

function formatRuntimeEdge({ consumer, dependency }) {
  return `${consumer}->${dependency}`;
}

module.exports = {
  EXACT_RELEASE_TARGET,
  SuiteContractError,
  assertUnique,
  canonicalSkillNames,
  formatRuntimeEdge,
  requireArray,
  runtimeEdgeKey,
};
