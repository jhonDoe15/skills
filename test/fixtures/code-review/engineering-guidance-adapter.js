'use strict';

const { defineTestAdapter } = require('../../../suite/testing');

function createEngineeringGuidanceAdapter(execute) {
  if (typeof execute !== 'function') {
    throw new TypeError('fixture execute callback must be a function');
  }
  const calls = [];
  return {
    adapter: defineTestAdapter({
      name: 'instrumented-code-review-guidance-fixture',
      async execute(invocation, context) {
        calls.push({ invocation, context });
        return execute(invocation, context);
      },
    }),
    calls,
  };
}

module.exports = { createEngineeringGuidanceAdapter };
