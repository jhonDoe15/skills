'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { LeaseRegistry } = require('../src/lease-registry');

test('an active lease blocks another acquisition', () => {
  let now = 100;
  const leases = new LeaseRegistry({ now: () => now });
  assert.equal(leases.acquire('job-1', 50), true);
  assert.equal(leases.acquire('job-1', 50), false);
  now = 151;
  assert.equal(leases.acquire('job-1', 50), true);
});

test('release makes a lease available', () => {
  const leases = new LeaseRegistry({ now: () => 100 });
  assert.equal(leases.acquire('job-1', 50), true);
  assert.equal(leases.release('job-1'), true);
  assert.equal(leases.acquire('job-1', 50), true);
});
