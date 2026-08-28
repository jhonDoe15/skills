'use strict';

const {
  defineTestAdapter,
} = require('../../../suite/testing');

function skillEvent(name, index) {
  return {
    name,
    operation: 'load',
    status: 'succeeded',
    trigger: name === 'pr-carver' ? 'model' : 'host',
    callId: `pr-carver-fixture-${index}`,
    provenance: {
      host: 'fixture',
      mechanism: 'canned-contract-observation',
      eventType: 'fixture.skill-load',
      observerVersion: '1',
      statusSource: 'observed',
    },
  };
}

function createAssessmentAdapter({ artifactReference }) {
  return defineTestAdapter({
    name: 'pr-carver-assessment-fixture',
    async execute(invocation, context) {
      const dependencyAvailable = context.dependencyAblation === null;
      return {
        status: 'succeeded',
        observations: {
          packageSkills: context.packageSkills,
          hostAvailableSkills: null,
          preExecutionInventory: {
            skillDefinitions: context.resolvedSkills.map((name) => ({
              name,
              path: `.fixture/skills/${name}/SKILL.md`,
              digest: '0'.repeat(64),
            })),
            plugins: [],
            ruleSources: [],
            packageDigest: '1'.repeat(64),
            truncated: false,
          },
          skillEvents: context.resolvedSkills.map(skillEvent),
          routing: {
            requestedSkill: invocation.skill,
            resolvedSkills: context.resolvedSkills,
          },
          responses: [{
            text: dependencyAvailable
              ? 'A canned assessment artifact was observed.'
              : 'The bounded dependency contribution is unavailable.',
          }],
          artifacts: dependencyAvailable ? [{
            reference: artifactReference,
            mediaType: 'application/vnd.pr-carver-assessment+json',
          }] : [],
          toolUses: dependencyAvailable ? [{
            name: 'assessment.read',
            outcome: 'succeeded',
          }] : [],
          attemptedMutations: [],
        },
        failure: null,
        durationMs: 1,
        costUsd: 0,
        model: {
          requested: invocation.model,
          resolved: 'fixture-model',
        },
      };
    },
  });
}

module.exports = {
  createAssessmentAdapter,
};
