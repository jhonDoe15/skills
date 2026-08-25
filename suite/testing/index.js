'use strict';

const {
  SuiteContractError,
  discoverCanonicalPackage,
  loadCanonicalSuite,
  resolvePackageDependencies,
  validateAdapterResult,
  validateInvocation,
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
  const contractInvocation = Object.freeze({ ...validateInvocation(invocation) });
  if (!testAdapters.has(adapter)) {
    throw new SuiteContractError('test execution requires a test Adapter');
  }

  const suite = loadCanonicalSuite(repositoryRoot);
  validateAblation(suite, contractInvocation, dependencyAblation);
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
    contractInvocation.skill,
  );
  if (resolution.missingSkill) {
    throw new SuiteContractError(
      `test package is missing "${resolution.missingSkill}"`,
    );
  }

  const context = Object.freeze({
    discoveredSkills: Object.freeze(
      packageDefinition.skills.map(({ name }) => name),
    ),
    resolvedSkills: Object.freeze([...resolution.resolved]),
    dependencyAblation: Object.freeze({ ...dependencyAblation }),
  });
  return validateAdapterResult(
    await adapter.execute(contractInvocation, context),
    contractInvocation,
    context,
  );
}

module.exports = {
  defineTestAdapter,
  executeTest,
};
