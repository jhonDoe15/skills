'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { calculateDiscount } = require('../src/discount');

test('discounts an order at the threshold', () => {
  assert.equal(calculateDiscount({
    subtotal: 100,
    isLoyaltyMember: true,
  }), 10);
});
