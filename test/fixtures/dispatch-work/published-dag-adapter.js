'use strict';

const { defineTestAdapter } = require('../../../suite/testing');
const { createNormalizedResult } = require('./normalized-result');

function createPublishedDagAdapter() {
  return defineTestAdapter({
    name: 'published-dag-fixture',
    async execute(invocation, context) {
      return createNormalizedResult(invocation, context, {
        response: 'dispatch-artifact: fixture://dispatch/completed',
        artifacts: [{
          reference: 'fixture://dispatch/completed',
          mediaType: 'application/vnd.dispatch-work+json',
        }],
        toolUses: [{
          name: 'published-dag.read',
          outcome: 'succeeded',
        }],
        attemptedMutations: [],
      });
    },
  });
}

module.exports = { createPublishedDagAdapter };
