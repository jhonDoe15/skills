'use strict';

const { defineTestAdapter } = require('../../../suite/testing');
const { createNormalizedResult } = require('./normalized-result');

function createPrMaintenanceAdapter({ authorizationGranted }) {
  return defineTestAdapter({
    name: 'pr-maintenance-fixture',
    async execute(invocation, context) {
      if (!authorizationGranted) {
        return createNormalizedResult(invocation, context, {
          response: 'authorization required: refresh PR for ticket fixture-42',
          artifacts: [],
          toolUses: [{
            name: 'pr-maintenance.authorization',
            outcome: 'denied',
          }],
          attemptedMutations: [],
        });
      }

      return createNormalizedResult(invocation, context, {
        response: 'authorized PR maintenance completed in fixture boundary',
        artifacts: [],
        toolUses: [
          { name: 'pr-maintenance.authorization', outcome: 'granted' },
          { name: 'pr-maintenance.refresh', outcome: 'succeeded-in-sandbox' },
        ],
        attemptedMutations: [{
          operation: 'refresh-pr',
          target: 'fixture://pr/42',
          outcome: 'succeeded-in-sandbox',
        }],
      });
    },
  });
}

module.exports = { createPrMaintenanceAdapter };
