'use strict';

function createTakeTicketAdapter() {
  const pending = new Map();
  const starts = [];

  return Object.freeze({
    start(ticket) {
      if (pending.has(ticket)) {
        throw new Error(`ticket "${ticket}" is already active`);
      }
      starts.push(ticket);
      return new Promise((resolve) => {
        pending.set(ticket, resolve);
      });
    },
    complete(ticket, reviewedResult) {
      const resolve = pending.get(ticket);
      if (!resolve) {
        throw new Error(`ticket "${ticket}" is not active`);
      }
      pending.delete(ticket);
      resolve(structuredClone(reviewedResult));
    },
    started() {
      return [...starts];
    },
    active() {
      return [...pending.keys()];
    },
  });
}

module.exports = { createTakeTicketAdapter };
