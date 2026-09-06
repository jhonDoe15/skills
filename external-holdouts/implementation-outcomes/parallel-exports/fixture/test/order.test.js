'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createOrder } = require('../src/order');

test('creates an immutable order record', () => {
  const order = createOrder('A-1', 1250, 'paid');
  assert.deepEqual(order, {
    id: 'A-1',
    totalCents: 1250,
    status: 'paid',
  });
  assert.equal(Object.isFrozen(order), true);
});
