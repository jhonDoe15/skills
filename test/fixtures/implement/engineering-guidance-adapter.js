'use strict';

const { defineTestAdapter } = require('../../../suite/testing');

function createEngineeringGuidanceAdapter(execute) {
  if (typeof execute !== 'function') {
    throw new TypeError('fixture execute callback must be a function');
  }
  const calls = [];
  const adapter = defineTestAdapter({
    name: 'instrumented-engineering-guidance-fixture',
    async execute(invocation, context) {
      calls.push({ invocation, context });
      return execute(invocation, context);
    },
  });
  return { adapter, calls };
}

module.exports = { createEngineeringGuidanceAdapter };
