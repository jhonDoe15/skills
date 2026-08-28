'use strict';

function createPublishedDagAdapter(publishedDag) {
  const calls = [];
  return Object.freeze({
    async read() {
      calls.push('read');
      return structuredClone(publishedDag);
    },
    calls() {
      return [...calls];
    },
  });
}

module.exports = { createPublishedDagAdapter };
