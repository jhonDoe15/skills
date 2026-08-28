'use strict';

const OBSERVED_PROVENANCE = Object.freeze({
  host: 'fixture-host',
  mechanism: 'dispatch-work-test-adapter',
  eventType: 'fixture-observation',
  observerVersion: '1',
  statusSource: 'observed',
});

function createNormalizedResult(
  invocation,
  context,
  {
    response,
    artifacts,
    toolUses,
    attemptedMutations,
  },
) {
  return {
    status: 'succeeded',
    observations: {
      packageSkills: [...context.packageSkills],
      hostAvailableSkills: {
        names: [...context.packageSkills],
        provenance: OBSERVED_PROVENANCE,
      },
      preExecutionInventory: {
        skillDefinitions: [],
        plugins: [],
        ruleSources: [],
        packageDigest: '0'.repeat(64),
        truncated: false,
      },
      skillEvents: context.resolvedSkills.map((name) => ({
        name,
        operation: 'load',
        status: 'succeeded',
        provenance: OBSERVED_PROVENANCE,
      })),
      routing: {
        requestedSkill: invocation.skill,
        resolvedSkills: [...context.resolvedSkills],
      },
      responses: [{ text: response }],
      artifacts,
      toolUses,
      attemptedMutations,
    },
    failure: null,
    durationMs: 1,
    costUsd: 0,
    model: {
      requested: invocation.model,
      resolved: 'fixture-model',
    },
  };
}

module.exports = { createNormalizedResult };
