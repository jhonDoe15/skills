'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  DeliveryError,
} = require('/workspace/src/delivery-result');
const {
  deliverEmail,
} = require('/workspace/src/deliver-email');
const {
  deliverWebhook,
} = require('/workspace/src/deliver-webhook');

test('email exposes one immutable stable result and preserves its provider call', async () => {
  const calls = [];
  const result = await deliverEmail({
    provider: {
      async send(request) {
        calls.push(request);
        return { messageId: 'email-1', accepted: true, internal: 'hidden' };
      },
    },
    recipient: 'dev@example.test',
    subject: 'Build',
    body: 'Passed',
  });
  assert.deepEqual(result, {
    channel: 'email',
    destination: 'dev@example.test',
    providerId: 'email-1',
  });
  assert.equal(Object.isFrozen(result), true);
  assert.deepEqual(calls, [{
    recipient: 'dev@example.test',
    subject: 'Build',
    body: 'Passed',
  }]);
});

test('webhook uses the same result contract and sends the specified request', async () => {
  const calls = [];
  const result = await deliverWebhook({
    provider: {
      async send(request) {
        calls.push(request);
        return { requestId: 'webhook-1', debug: 'hidden' };
      },
    },
    destination: 'https://hooks.example.test/order',
    event: 'order.paid',
    payload: { orderId: 'A-1' },
  });
  assert.deepEqual(result, {
    channel: 'webhook',
    destination: 'https://hooks.example.test/order',
    providerId: 'webhook-1',
  });
  assert.equal(Object.isFrozen(result), true);
  assert.deepEqual(calls, [{
    destination: 'https://hooks.example.test/order',
    event: 'order.paid',
    payload: { orderId: 'A-1' },
  }]);
});

for (const [name, deliver, input, channel, destination] of [
  [
    'email',
    deliverEmail,
    {
      recipient: 'dev@example.test',
      subject: 'Build',
      body: 'Failed',
    },
    'email',
    'dev@example.test',
  ],
  [
    'webhook',
    deliverWebhook,
    {
      destination: 'https://hooks.example.test/order',
      event: 'order.failed',
      payload: { orderId: 'A-1' },
    },
    'webhook',
    'https://hooks.example.test/order',
  ],
]) {
  test(`${name} translates provider failures without losing the cause`, async () => {
    const cause = new Error('provider unavailable');
    await assert.rejects(
      deliver({
        ...input,
        provider: {
          async send() {
            throw cause;
          },
        },
      }),
      (error) => (
        error instanceof DeliveryError
        && error.channel === channel
        && error.destination === destination
        && error.cause === cause
      ),
    );
  });
}
