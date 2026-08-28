'use strict';

const { defineTestAdapter } = require('../../../suite/testing');
const { createNormalizedResult } = require('./normalized-result');

function createTakeItOfflineAdapter() {
  return defineTestAdapter({
    name: 'take-it-offline-fixture',
    async execute(invocation, context) {
      return createNormalizedResult(invocation, context, {
        response: 'continuation-artifact: fixture://continuation/completed',
        artifacts: [
          {
            reference: 'fixture://dispatch/completed',
            mediaType: 'application/vnd.dispatch-work+json',
          },
          {
            reference: 'fixture://continuation/completed',
            mediaType: 'application/vnd.fixture-continuation+json',
          },
        ],
        toolUses: [
          { name: 'take-it-offline.create', outcome: 'succeeded' },
        ],
        attemptedMutations: [
          {
            operation: 'write',
            target: 'fixture-continuation:completed',
            outcome: 'succeeded-in-sandbox',
          },
        ],
      });
    },
  });
}

module.exports = { createTakeItOfflineAdapter };
