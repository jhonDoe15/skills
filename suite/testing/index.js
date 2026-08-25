'use strict';

const {
  SuiteContractError,
  discoverCanonicalPackage,
  loadCanonicalSuite,
  resolvePackageDependencies,
  validateInvocation,
  validateResult,
} = require('..');

const testAdapters = new WeakSet();

function defineTestAdapter({ name, execute }) {
  if (typeof name !== 'string' || name.length === 0 || typeof execute !== 'function') {
    throw new SuiteContractError('test Adapter requires a name and execute function');
  }
  const adapter = Object.freeze({ name, execute });
  testAdapters.add(adapter);
  return adapter;
}

function validateAblation(suite, invocation, dependencyAblation) {
  if (!dependencyAblation
    || typeof dependencyAblation !== 'object'
    || Array.isArray(dependencyAblation)
    || Object.keys(dependencyAblation).length !== 2
    || typeof dependencyAblation.consumer !== 'string'
    || typeof dependencyAblation.dependency !== 'string') {
    throw new SuiteContractError(
      'dependencyAblation must name one consumer and one dependency',
    );
  }
  if (dependencyAblation.consumer !== invocation.skill) {
    throw new SuiteContractError(
      'dependencyAblation consumer must match invocation.skill',
    );
  }
  const declared = suite.runtimeEdges.some((edge) => (
    edge.consumer === dependencyAblation.consumer
      && edge.dependency === dependencyAblation.dependency
  ));
  if (!declared) {
    throw new SuiteContractError(
      `dependencyAblation is not a declared runtime edge: `
        + `${dependencyAblation.consumer}->${dependencyAblation.dependency}`,
    );
  }
}

async function executeTest({
  repositoryRoot,
  adapter,
  invocation,
  dependencyAblation,
}) {
  validateInvocation(invocation);
  if (!testAdapters.has(adapter)) {
    throw new SuiteContractError('test execution requires a test Adapter');
  }

  const suite = loadCanonicalSuite(repositoryRoot);
  validateAblation(suite, invocation, dependencyAblation);
  const packageDefinition = discoverCanonicalPackage(repositoryRoot);
  const ablatedSuite = {
    ...suite,
    runtimeEdges: suite.runtimeEdges.filter((edge) => (
      edge.consumer !== dependencyAblation.consumer
        || edge.dependency !== dependencyAblation.dependency
    )),
  };
  const resolution = resolvePackageDependencies(
    ablatedSuite,
    packageDefinition,
    invocation.skill,
  );
  if (resolution.missingSkill) {
    throw new SuiteContractError(
      `test package is missing "${resolution.missingSkill}"`,
    );
  }

  const context = Object.freeze({
    discoveredSkills: packageDefinition.skills.map(({ name }) => name),
    resolvedSkills: resolution.resolved,
    dependencyAblation: Object.freeze({ ...dependencyAblation }),
  });
  const result = validateResult(await adapter.execute(invocation, context));
  if (result.model.requested !== invocation.model) {
    throw new SuiteContractError('result.model.requested must match invocation.model');
  }
  if (result.observations.routing.requestedSkill !== invocation.skill) {
    throw new SuiteContractError(
      'result.observations.routing.requestedSkill must match invocation.skill',
    );
  }
  if (JSON.stringify(result.observations.discoveredSkills)
    !== JSON.stringify(context.discoveredSkills)) {
    throw new SuiteContractError(
      'result.observations.discoveredSkills must match canonical discovery',
    );
  }
  return result;
}

module.exports = {
  defineTestAdapter,
  executeTest,
};
