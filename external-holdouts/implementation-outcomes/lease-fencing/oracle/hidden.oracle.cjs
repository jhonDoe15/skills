'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { LeaseRegistry } = require('/workspace/src/lease-registry');

test('stale release and renewal cannot mutate a newer lease', () => {
  let now = 100;
  const leases = new LeaseRegistry({ now: () => now });
  const first = leases.acquire('job-1', 10);
  assert.deepEqual(first, { token: 1, expiresAt: 110 });

  now = 111;
  const second = leases.acquire('job-1', 20);
  assert.deepEqual(second, { token: 2, expiresAt: 131 });
  assert.equal(leases.release('job-1', first.token), false);
  assert.equal(leases.renew('job-1', first.token, 30), null);
  assert.equal(leases.acquire('job-1', 20), null);
  assert.equal(leases.release('job-1', second.token), true);
});

test('renew rejects expiry and preserves monotonically increasing tokens', () => {
  let now = 20;
  const leases = new LeaseRegistry({ now: () => now });
  const first = leases.acquire('job-2', 5);
  now = 24;
  assert.deepEqual(
    leases.renew('job-2', first.token, 8),
    { token: 1, expiresAt: 32 },
  );
  now = 32;
  assert.equal(leases.renew('job-2', first.token, 8), null);
  assert.deepEqual(leases.acquire('job-2', 8), {
    token: 2,
    expiresAt: 40,
  });
});

test('invalid TTL never changes state', () => {
  const leases = new LeaseRegistry({ now: () => 100 });
  for (const invalid of [0, -1, 1.5, Number.NaN]) {
    assert.throws(() => leases.acquire('job-3', invalid), RangeError);
  }
  assert.deepEqual(leases.acquire('job-3', 5), {
    token: 1,
    expiresAt: 105,
  });
  assert.throws(() => leases.renew('job-3', 1, 0), RangeError);
  assert.equal(leases.acquire('job-3', 5), null);
});

test('returned leases are immutable snapshots', () => {
  const leases = new LeaseRegistry({ now: () => 100 });
  const lease = leases.acquire('job-4', 5);
  assert.equal(Object.isFrozen(lease), true);
  assert.throws(() => {
    lease.token = 99;
  }, TypeError);
  assert.equal(leases.release('job-4', 1), true);
});
