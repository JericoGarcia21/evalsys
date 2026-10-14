const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isMaintenanceActive } = require('../src/services/maintenance.service');

test('maintenance starts and ends at exact window boundaries without a running scheduler', () => {
  const startsAt = new Date('2099-06-15T01:00:00Z');
  const endsAt = new Date('2099-06-15T02:00:00Z');
  const settings = { isMaintenanceMode: false, maintenanceStartsAt: startsAt, maintenanceEndsAt: endsAt };
  assert.equal(isMaintenanceActive(settings, startsAt.getTime() - 1), false);
  assert.equal(isMaintenanceActive(settings, startsAt.getTime()), true);
  assert.equal(isMaintenanceActive(settings, endsAt.getTime() - 1), true);
  assert.equal(isMaintenanceActive(settings, endsAt.getTime()), false);
  assert.equal(isMaintenanceActive({ ...settings, isMaintenanceMode: true }, endsAt.getTime()), false);
  assert.equal(isMaintenanceActive({ isMaintenanceMode: true }, endsAt.getTime()), true);
  assert.equal(isMaintenanceActive(null), false);
});
