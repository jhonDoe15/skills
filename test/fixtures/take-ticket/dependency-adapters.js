'use strict';

function createInstrumentedAdapter(name, execute) {
  if (typeof execute !== 'function') {
    throw new TypeError(`${name} fixture execute callback must be a function`);
  }
  const calls = [];
  return {
    calls,
    async execute(input) {
      const retainedInput = structuredClone(input);
      calls.push(retainedInput);
      return execute(Object.freeze(retainedInput));
    },
  };
}

function createImplementAdapter(execute) {
  return createInstrumentedAdapter('Implement Adapter', execute);
}

function createCodeReviewAdapter(execute) {
  return createInstrumentedAdapter('Code Review Adapter', execute);
}

module.exports = {
  createCodeReviewAdapter,
  createImplementAdapter,
};
