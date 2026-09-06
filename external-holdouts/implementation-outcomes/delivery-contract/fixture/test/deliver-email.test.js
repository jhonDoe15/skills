'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { deliverEmail } = require('../src/deliver-email');

test('passes the email request to the provider', async () => {
  const calls = [];
  const provider = {
    async send(request) {
      calls.push(request);
      return { messageId: 'provider-1', accepted: true };
    },
  };
  assert.deepEqual(await deliverEmail({
    provider,
    recipient: 'dev@example.test',
    subject: 'Build',
    body: 'Passed',
  }), { messageId: 'provider-1', accepted: true });
  assert.deepEqual(calls, [{
    recipient: 'dev@example.test',
    subject: 'Build',
    body: 'Passed',
  }]);
});
