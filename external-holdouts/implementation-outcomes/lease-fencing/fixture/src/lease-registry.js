'use strict';

class LeaseRegistry {
  constructor({ now = Date.now } = {}) {
    this.now = now;
    this.leases = new Map();
  }

  acquire(key, ttlMs) {
    const current = this.leases.get(key);
    if (current && current.expiresAt > this.now()) return false;
    this.leases.set(key, { expiresAt: this.now() + ttlMs });
    return true;
  }

  release(key) {
    return this.leases.delete(key);
  }
}

module.exports = { LeaseRegistry };
