'use strict';

function calculateDiscount({ subtotal }) {
  return subtotal >= 100 ? subtotal * 0.1 : 0;
}

function quoteOrder(order) {
  order.discount = calculateDiscount(order);
  return order;
}

module.exports = { calculateDiscount, quoteOrder };
