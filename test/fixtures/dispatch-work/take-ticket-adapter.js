'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { defineTestAdapter } = require('../../../suite/testing');
const { createNormalizedResult } = require('./normalized-result');

const TICKET_EXECUTION_ORDER = ['A', 'C', 'B', 'D'];

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
          ...TICKET_EXECUTION_ORDER.map((ticket) => ({
            reference: `fixture://reviewed-ticket/${ticket}`,
            mediaType: 'application/vnd.fixture-reviewed-ticket+json',
          })),
        ],
        toolUses: [
          ...TICKET_EXECUTION_ORDER.flatMap((ticket) => [
            { name: `take-ticket.invoke:${ticket}`, outcome: 'succeeded' },
            { name: `take-ticket.complete:${ticket}`, outcome: 'succeeded' },
          ]),
          ...boundaries.flatMap(({ observations }) => observations.toolUses),
        ],
        attemptedMutations: [
          ...TICKET_EXECUTION_ORDER.map((ticket) => ({
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
