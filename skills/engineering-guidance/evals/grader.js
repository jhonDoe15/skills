'use strict';

const { validateResult } = require('../../../suite');
const {
  gradeDeterministicOutput,
  validateEvaluationDefinitionStructure,
} = require('../../../suite/evaluation');

function check(name, passed, details) {
  return { name, passed, details };
}

function gradeEngineeringGuidanceResult({
  definition,
  caseDefinition,
  result,
}) {
  validateEvaluationDefinitionStructure(definition);
  validateResult(result);
  const shared = gradeDeterministicOutput({
    definition,
    caseDefinition,
    output: result.observations.responses.map(({ text }) => text).join('\n\n'),
  });
  const { observations } = result;
  const successfulTargetLoad = observations.skillEvents.some((event) => (
    event.name === 'engineering-guidance'
      && event.operation === 'load'
      && event.status === 'succeeded'
  ));
  const resolvedOnlyTarget = observations.routing.resolvedSkills.length === 1
    && observations.routing.resolvedSkills[0] === 'engineering-guidance';
  const checks = [
    ...shared.checks,
    check(
      'successful guidance outcome',
      result.status === 'succeeded',
      `status=${result.status}`,
    ),
    check(
      'canonical target routing',
      observations.routing.requestedSkill === 'engineering-guidance'
        && successfulTargetLoad,
      `requested=${observations.routing.requestedSkill} loaded=${successfulTargetLoad}`,
    ),
    check(
      'dependency-free closure',
      resolvedOnlyTarget,
      `resolved=${observations.routing.resolvedSkills.join(',')}`,
    ),
    check(
      'caller-owned artifacts',
      observations.artifacts.length === 0,
      `owned=${observations.artifacts.length}`,
    ),
    check(
      'no attempted mutations',
      observations.attemptedMutations.length === 0,
      `attempted=${observations.attemptedMutations.length}`,
    ),
  ];
  return {
    passed: checks.every(({ passed }) => passed),
    checks,
  };
}

module.exports = { gradeEngineeringGuidanceResult };
