# Greenhouse leader revocation

Immutable revision: `6666666666666666666666666666666666666666`

## Ticket HEAT-11

Prevent an obsolete greenhouse controller leader from applying setpoints after leadership changes or an operator revokes control.

Linked requirements state:

- OPS-7: when `revokeZone(zoneId)` resolves successfully, the previous leader must be unable to issue another actuator write.
- CONTROL-4: a lease holder remains authorized until its granted lease expires, including temporary coordinator unavailability.

No source establishes precedence, whether revocation may wait for expiry, or whether an interval with no authorized writer is acceptable.

## Capability evidence

- The coordinator exposes boolean acquire, renew, and release operations.
- It returns no monotonically ordered fencing value.
- The actuator accepts unconditional setpoint writes and cannot compare a generation, revision, or coordinator state.
- A controller may pause beyond lease expiry and resume.
- An actuator timeout does not reveal whether a write was applied.

## Repository snapshot

`src/zone-controller.js`

```js
async function applyScheduledSetpoint(zoneId, dependencies) {
  const { coordinator, schedules, actuator } = dependencies;
  if (!(await coordinator.tryAcquire(zoneId, 15_000))) {
    return { applied: false };
  }
  const setpoint = await schedules.current(zoneId);
  await actuator.setSetpoint(zoneId, setpoint);
  return { applied: true };
}
```

`src/zone-admin.js` calls `coordinator.release(zoneId)` and returns `{ revoked: true }`.

`package.json` defines `test:control` as `node --test test/zone-controller.test.js` and `test` as `node --test`.

## Owners

The product/control owner owns the authorization cutoff. Coordinator and actuator owners own capability evidence. Existing tests prove only one uncontested leader write.
