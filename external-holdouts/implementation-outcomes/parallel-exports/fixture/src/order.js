'use strict';

function createOrder(id, totalCents, status) {
  return Object.freeze({ id, totalCents, status });
}

module.exports = { createOrder };
