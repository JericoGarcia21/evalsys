const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildAuditFilter, validateAuditPagination, auditCsv } = require('../src/utils/auditQuery');

test('audit query uses literal actor search and complete UTC calendar days', () => {
  const filter = buildAuditFilter({ actor: ' A.*[x] ', action: 'login.success', status: 'success', from: '2024-02-29', to: '2024-02-29' });
  const regex = new RegExp(filter.$or[0]['actor.name'].$regex, 'i');
  assert.equal(regex.test('prefix a.*[x] suffix'), true);
  assert.equal(regex.test('Anything'), false);
  assert.equal(filter.createdAt.$gte.toISOString(), '2024-02-29T00:00:00.000Z');
  assert.equal(filter.createdAt.$lt.toISOString(), '2024-03-01T00:00:00.000Z');
  assert.deepEqual(buildAuditFilter({}), {});
  assert.equal(buildAuditFilter({ to: '9999-12-31' }).createdAt.$lt.toISOString(), '+010000-01-01T00:00:00.000Z');
});

test('audit query rejects invalid dates, structured filters, oversized text and unsafe pagination', () => {
  for (const query of [
    { from: '2026-02-29' }, { to: '2026-11-31' }, { from: '2026-01-01T00:00:00Z' },
    { from: '2026-02-02', to: '2026-02-01' }, { status: 'other' },
    { actor: { $ne: '' } }, { action: ['one', 'two'] }, { status: ['success'] },
    { from: ['2026-01-01'] }, { to: {} }, { actor: 'a'.repeat(121) },
  ]) assert.throws(() => buildAuditFilter(query));
  for (const query of [{ page: '0' }, { page: '-1' }, { limit: '1.5' }, { page: ['1'] }, { limit: {} }, { page: 'Infinity' }, { page: '9007199254740991', limit: '200' }]) {
    assert.throws(() => validateAuditPagination(query));
  }
  validateAuditPagination({ page: '1', limit: '500' });
});

test('audit CSV quotes cells, preserves Unicode and neutralizes spreadsheet formulas', () => {
  for (const value of ['=1+1', '+SUM(1)', '-1+1', '@SUM(1)', '  =1+1', '\t=1+1', '\rtest', '\ntest', '\u0000=1']) {
    const csv = auditCsv([{ createdAt: '2026-11-20', actor: { name: value } }]);
    assert.ok(csv.includes(`"'${value}"`), JSON.stringify(value));
  }
  const csv = auditCsv([{ _id: 'one', createdAt: '2026-11-20', actor: { name: 'José, "Admin"\nTwo' }, metadata: { secret: 'not-exported' }, ip: 'private-ip' }]);
  assert.ok(csv.startsWith('\uFEFF"ID","Timestamp (UTC)"'));
  assert.ok(csv.includes('"José, ""Admin""\nTwo"'));
  assert.ok(!csv.includes('not-exported'));
  assert.ok(!csv.includes('private-ip'));
  assert.equal(auditCsv([]).split('\r\n').length, 2);
});
