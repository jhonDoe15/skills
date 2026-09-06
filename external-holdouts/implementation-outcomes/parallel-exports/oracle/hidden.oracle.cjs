'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  exportOrdersAsJson,
} = require('/workspace/src/export-orders-as-json');
const {
  exportOrdersAsCsv,
} = require('/workspace/src/export-orders-as-csv');

function orders() {
  return [
    {
      id: 'A-1',
      totalCents: 1250,
      status: 'paid',
      internalNote: 'omit me',
    },
    {
      id: 'A,"2"',
      totalCents: 0,
      status: 'needs\nreview',
      internalNote: 'omit me too',
    },
  ];
}

test('JSON exports only the public fields without mutation', () => {
  const input = orders();
  const before = structuredClone(input);
  assert.equal(exportOrdersAsJson(input), JSON.stringify([
    { id: 'A-1', totalCents: 1250, status: 'paid' },
    { id: 'A,"2"', totalCents: 0, status: 'needs\nreview' },
  ]));
  assert.deepEqual(input, before);
  assert.throws(() => exportOrdersAsJson(null), TypeError);
});

test('CSV follows the required header and quoting rules without mutation', () => {
  const input = orders();
  const before = structuredClone(input);
  assert.equal(
    exportOrdersAsCsv(input),
    [
      'id,total_cents,status',
      'A-1,1250,paid',
      '"A,""2""",0,"needs\nreview"',
    ].join('\r\n'),
  );
  assert.deepEqual(input, before);
  assert.throws(() => exportOrdersAsCsv({}), TypeError);
});

test('both empty exports retain their independent contracts', () => {
  assert.equal(exportOrdersAsJson([]), '[]');
  assert.equal(exportOrdersAsCsv([]), 'id,total_cents,status');
});
