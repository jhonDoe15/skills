'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { defineTestAdapter } = require('../../../suite/testing');
const { createNormalizedResult } = require('./normalized-result');

function readBoundary(name) {
  return JSON.parse(fs.readFileSync(
    path.join(__dirname, 'sandbox', `${name}.json`),
    'utf8',
  ));
}

function createTakeTicketAdapter({ repository }) {
  return defineTestAdapter({
    name: 'take-ticket-fixture',
    async execute(invocation, context) {
      if (!fs.existsSync(path.join(repository, '.git'))) {
        throw new Error('Take Ticket fixture requires a repository boundary');
      }
      const boundaries = ['tracker', 'pr', 'ci'].map(readBoundary);
      return createNormalizedResult(invocation, context, {
        response: 'dispatch-artifact: fixture://dispatch/completed',
        artifacts: [
          {
            reference: 'fixture://dispatch/completed',
            mediaType: 'application/vnd.dispatch-work+json',
          },
          {
            reference: 'fixture://reviewed-ticket/B',
            mediaType: 'application/vnd.fixture-reviewed-ticket+json',
          },
        ],
        toolUses: [
          { name: 'take-ticket.start', outcome: 'succeeded' },
          ...boundaries.flatMap(({ observations }) => observations.toolUses),
        ],
        attemptedMutations: [
          ...['A', 'C', 'B', 'D'].map((ticket) => ({
            operation: 'write',
            target: `fixture-repository:${ticket}`,
            outcome: 'succeeded-in-sandbox',
          })),
          ...boundaries.flatMap(
            ({ observations }) => observations.attemptedMutations,
          ),
        ],
      });
    },
  });
}

module.exports = { createTakeTicketAdapter };
