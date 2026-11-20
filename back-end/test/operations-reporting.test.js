const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
process.env.JWT_SECRET = 'isolated-phase-three-qa';
process.env.MONGOMS_DOWNLOAD_DIR = path.join(__dirname, '..', 'node_modules', '.cache', 'mongodb-binaries');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../src/app');
const Admin = require('../src/models/Admin');
const Panel = require('../src/models/Panel');
const Subject = require('../src/models/Subject');
const Section = require('../src/models/Section');
const Group = require('../src/models/Group');
const Evaluation = require('../src/models/Evaluation');
const Settings = require('../src/models/Settings');
const AuditLog = require('../src/models/AuditLog');
const MaintenancePreset = require('../src/models/MaintenancePreset');
const { issueSession } = require('../src/services/session.service');
const { currentAnnouncement } = require('../src/services/announcement.service');
const { clearResponseCache } = require('../src/middleware/cache.middleware');
let mongo, superadmin, instructor, other, panel, direct, unassigned, otherPanel, subject, otherSubject, section, group, otherGroup, tokens;
const api = (method, url, user = superadmin) => {
  const req = request(app)[method]('/api' + url);
  return user ? req.set('Authorization', 'Bearer ' + tokens.get(String(user._id))) : req;
};
const announcement = (extra = {}) => ({ isActive: true, title: 'Private subject reminder', message: 'For the selected audience only.', roles: ['admin', 'panel'], subjectIds: [], ...extra });
const saveNotice = value => api('patch', '/settings/system-controls').send({ announcement: value }).expect(200);
const parseCsv = text => text.trim().replace(/^\uFEFF/, '').split('\r\n').map(line => [...line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)].map(match => match[1].replaceAll('""', '"')));

before(async () => {
  mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri());
  await Promise.all(Object.values(mongoose.models).map(model => model.init()));
});
after(async () => { await mongoose.disconnect(); if (mongo) await mongo.stop(); });
beforeEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map(collection => collection.deleteMany({})));
  clearResponseCache();
  [subject, otherSubject] = await Subject.create([{ code: 'QA101', title: 'First subject' }, { code: 'QA202', title: 'Other subject' }]);
  [superadmin, instructor, other] = await Admin.insertMany([
    { name: 'Report Super', email: 'report-super@evalsys.com', password: 'test-fixture-only', role: 'superadmin' },
    { name: 'Report Instructor', email: 'report-instructor@evalsys.com', password: 'test-fixture-only', assignedSubjects: [subject._id] },
    { name: 'Other Instructor', email: 'report-other@evalsys.com', password: 'test-fixture-only', assignedSubjects: [otherSubject._id] },
  ]);
  [panel, direct, unassigned, otherPanel] = await Panel.insertMany([
    { name: 'Block Panel', email: 'report-panel@evalsys.com', password: 'test-fixture-only', createdBy: instructor._id, mustChangePassword: false },
    { name: 'Direct Panel', email: 'report-direct@evalsys.com', password: 'test-fixture-only', createdBy: instructor._id, mustChangePassword: false },
    { name: 'Unassigned', email: 'report-unassigned@evalsys.com', password: 'test-fixture-only', createdBy: instructor._id, mustChangePassword: false },
    { name: 'Other Panel', email: 'report-other-panel@evalsys.com', password: 'test-fixture-only', createdBy: other._id, mustChangePassword: false },
  ]);
  section = await Section.create({ name: 'First', block: 'A-1', subject: subject._id, createdBy: instructor._id, assignedPanels: [panel._id] });
  const otherSection = await Section.create({ name: 'Other', block: 'B-1', subject: otherSubject._id, createdBy: other._id, assignedPanels: [otherPanel._id] });
  group = await Group.create({ name: 'First Group', section: section._id, createdBy: instructor._id, assignedPanels: [direct._id], members: ['First', 'Second'], proposalFile: { path: 'qa/proposal.pdf', size: 1024 }, createdAt: new Date(Date.now() - 10 * 86400000) });
  otherGroup = await Group.create({ name: 'Other Group', section: otherSection._id, createdBy: other._id, members: ['Other'] });
  await Evaluation.create({ group: group._id, panel: panel._id, subject: subject._id, scores: { quality: 8 }, isSubmitted: true });
  await Settings.create({});
  const users = [superadmin, instructor, other, panel, direct, unassigned, otherPanel];
  const issued = await Promise.all(users.map(user => issueSession(user, { ip: '127.0.0.1', headers: {} })));
  tokens = new Map(users.map((user, index) => [String(user._id), issued[index]]));
});

test('announcements are never disclosed publicly or to an unmatched role or subject', async () => {
  await saveNotice(announcement({ roles: ['panel'], subjectIds: [String(subject._id)] }));
  const publicResponse = await request(app).get('/api/settings/public').expect(200);
  assert.equal(publicResponse.body.announcement.title, undefined);
  await request(app).get('/api/settings/notices').expect(401);
  for (const user of [instructor, other, unassigned, otherPanel, superadmin]) {
    const response = await api('get', '/settings/notices', user).set('x-subject-id', String(subject._id)).set('x-instructor-id', String(instructor._id)).expect(200);
    assert.deepEqual(response.body.announcement, { isActive: false });
    if (user.role !== 'superadmin') {
      const settings = await api('get', '/settings', user).expect(200);
      assert.equal(settings.body.announcement.message, undefined);
    }
  }
  for (const user of [panel, direct]) {
    const response = await api('get', '/settings/notices', user).expect(200);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.body.announcement.title, 'Private subject reminder');
    assert.equal(response.body.announcement.subjectIds, undefined);
  }
  const toggle = await api('patch', '/settings/toggle-lock', instructor).expect(200);
  assert.equal(toggle.body.announcement.title, undefined);
  assert.equal(toggle.body.announcement.message, undefined);
  await saveNotice(announcement({ subjectIds: [String(subject._id)] }));
  assert.equal((await api('get', '/settings/notices', instructor).expect(200)).body.announcement.isActive, true);
  await Admin.updateOne({ _id: instructor._id }, { isActive: false });
  assert.equal((await api('get', '/settings/notices', panel).expect(200)).body.announcement.isActive, false);
});

test('notice delivery observes exact start/end boundaries, hides drafts and supports legacy broadcasts', async () => {
  const start = Date.UTC(2026, 10, 20), end = start + 1000;
  const notice = announcement({ startsAt: new Date(start), endsAt: new Date(end) });
  assert.equal((await currentAnnouncement(notice, instructor, start - 1)).isActive, false);
  assert.equal((await currentAnnouncement(notice, instructor, start)).isActive, true);
  assert.equal((await currentAnnouncement(notice, instructor, end - 1)).isActive, true);
  assert.equal((await currentAnnouncement(notice, instructor, end)).isActive, false);
  await saveNotice(announcement({ isActive: false }));
  assert.equal((await api('get', '/settings/notices', instructor)).body.announcement.isActive, false);
  await api('patch', '/settings/system-controls').send({ announcement: { isActive: true, title: 'Legacy', message: 'Both roles' } }).expect(200);
  assert.equal((await api('get', '/settings/notices', otherPanel)).body.announcement.title, 'Legacy');
  await Settings.updateOne({}, { isMaintenanceMode: true });
  await api('get', '/settings/notices', panel).expect(200);
  await Panel.updateOne({ _id: panel._id }, { mustChangePassword: true });
  await api('get', '/settings/notices', panel).expect(403);
});

test('invalid announcement payloads cannot partially change maintenance or publish unsafe audiences', async () => {
  await saveNotice(announcement());
  const invalid = [null, [], announcement({ isActive: 'true' }), announcement({ title: {} }), announcement({ title: 'x'.repeat(81) }), announcement({ message: 'x'.repeat(501) }), announcement({ roles: [] }), announcement({ roles: ['superadmin'] }), announcement({ roles: ['panel', 'panel'] }), announcement({ subjectIds: ['bad'] }), announcement({ subjectIds: [String(new mongoose.Types.ObjectId())] }), announcement({ startsAt: '2026-02-30T12:00:00Z' }), announcement({ endsAt: 'tomorrow' }), announcement({ startsAt: '2026-11-20T12:00:00Z', endsAt: '2026-11-20T11:00:00Z' })];
  for (const value of invalid) {
    await api('patch', '/settings/system-controls').send({ isMaintenanceMode: true, maintenanceDelayMinutes: 0, announcement: value }).expect(400);
    const settings = await Settings.findOne();
    assert.equal(settings.isMaintenanceMode, false);
    assert.equal(settings.announcement.title, 'Private subject reminder');
  }
});

test('maintenance presets are reusable audited templates and never start maintenance', async () => {
  const payload = { name: 'Routine Update', message: 'A reusable maintenance notice.', delayMinutes: 0, durationMinutes: 60 };
  const created = await api('post', '/settings/maintenance-presets').send(payload).expect(201);
  assert.equal((await Settings.findOne()).isMaintenanceMode, false);
  const list = await api('get', '/settings/maintenance-presets').expect(200);
  assert.equal(list.body[0].durationMinutes, 60);
  assert.equal(list.headers['cache-control'], 'no-store');
  await api('post', '/settings/maintenance-presets').send({ ...payload, name: 'routine update' }).expect(409);
  for (const patch of [{ name: '' }, { message: 'x'.repeat(251) }, { delayMinutes: '5' }, { durationMinutes: 0 }, { durationMinutes: 1.5 }, { durationMinutes: 10081 }]) await api('post', '/settings/maintenance-presets').send({ ...payload, ...patch }).expect(400);
  await Settings.updateOne({}, { isMaintenanceMode: true });
  await api('delete', '/settings/maintenance-presets/' + created.body._id).expect(200);
  assert.equal((await Settings.findOne()).isMaintenanceMode, true);
  assert.equal(await MaintenancePreset.countDocuments(), 0);
  assert.equal(await AuditLog.countDocuments({ action: 'maintenance.preset.create' }), 1);
  assert.equal(await AuditLog.countDocuments({ action: 'maintenance.preset.delete' }), 1);
});

test('maintenance preset duration is calculated server-side from the actual start', async () => {
  const response = await api('patch', '/settings/system-controls').send({ isMaintenanceMode: true, maintenanceDelayMinutes: 5, maintenanceDurationMinutes: 45 }).expect(200);
  assert.equal(new Date(response.body.maintenanceEndsAt) - new Date(response.body.maintenanceStartsAt), 45 * 60000);
  for (const patch of [{ maintenanceDurationMinutes: 0 }, { maintenanceDurationMinutes: 1.5 }, { maintenanceDurationMinutes: '45' }, { maintenanceDurationMinutes: 10081 }, { maintenanceDurationMinutes: 45, maintenanceEndsAt: '2099-01-01T00:00:00Z' }]) {
    await api('patch', '/settings/system-controls').send({ isMaintenanceMode: true, ...patch }).expect(400);
  }
});

test('preset, archive and analytics management and exports remain superadmin-only', async () => {
  for (const user of [null, instructor, panel]) {
    const expected = user ? 403 : 401;
    for (const url of ['/settings/maintenance-presets', '/legacy-data/results', '/legacy-data/results/export', '/operations/analytics/export?report=grading']) await api('get', url, user).expect(expected);
    await api('post', '/settings/maintenance-presets', user).send({}).expect(expected);
    await api('delete', '/settings/maintenance-presets/' + subject._id, user).expect(expected);
  }
});

const archive = (extra = {}) => ({ group: new mongoose.Types.ObjectId(), panel: new mongoose.Types.ObjectId(), isLegacyArchived: true, scores: { quality: 8 }, total: 8, legacyArchivedAt: new Date('2026-11-20T00:00:00Z'), legacySnapshot: { subject: 'QA101 - First subject', block: 'A-1', groupName: 'Alpha [x]', instructorName: 'Old Instructor', panelName: 'Panel', members: ['Zulu', { firstName: 'A', lastName: 'Alpha' }] }, ...extra });
test('archive filters combine literal snapshots and complete UTC days, including missing archive-date fallback', async () => {
  await Evaluation.insertMany([
    archive(), archive({ legacyArchivedAt: new Date('2026-11-20T23:59:59.999Z') }),
    archive({ legacyArchivedAt: null, updatedAt: new Date('2026-11-20T12:00:00Z') }),
    archive({ legacyArchivedAt: new Date('2026-11-19T23:59:59.999Z') }),
    archive({ legacySnapshot: { subject: 'Other', block: 'A-1', groupName: 'Alpha [x]' } }),
  ]);
  const filter = { subject: 'qa101', block: 'a-1', group: '[x]', from: '2026-11-20', to: '2026-11-20' };
  const page = await api('get', '/legacy-data/results').query({ ...filter, page: 1, limit: 2 }).expect(200);
  assert.equal(page.body.pagination.total, 3);
  assert.equal(page.body.items.length, 2);
  const next = await api('get', '/legacy-data/results').query({ ...filter, page: 2, limit: 2 }).expect(200);
  assert.equal(next.body.items.length, 1);
  const beyond = await api('get', '/legacy-data/results').query({ ...filter, page: 99, limit: 2 }).expect(200);
  assert.equal(beyond.body.pagination.page, 2);
  const literal = await api('get', '/legacy-data/results').query({ group: '.*' }).expect(200);
  assert.equal(literal.body.pagination.total, 0);
  const metadata = await api('get', '/legacy-data?includeResults=false').expect(200);
  assert.deepEqual(metadata.body.results, []);
  assert.equal(metadata.body.resultCount, 5);
  assert.equal(await Evaluation.countDocuments({ isLegacyArchived: false }), 1);
});

test('archive CSV exports all filtered pages alphabetically, preserves zero/scores, and neutralizes formulas', async () => {
  await Evaluation.insertMany([
    archive({ legacySnapshot: { subject: 'QA101', groupName: 'Zulu', panelName: 'Panel A' } }),
    archive({ total: 0, scores: { quality: 0 }, comments: '  =SUM(1,2)', legacySnapshot: { subject: 'QA101', groupName: 'Alpha', panelName: 'Panel Z' } }),
    archive({ total: 7, scores: { quality: 7 }, legacySnapshot: { subject: 'QA101', groupName: 'Alpha', panelName: 'Panel A' } }),
    archive({ legacySnapshot: { subject: 'Other', groupName: 'Not exported' } }),
  ]);
  const response = await api('get', '/legacy-data/results/export').query({ subject: 'qa101', page: 2, limit: 1 }).expect(200).expect('Content-Type', /text\/csv/);
  const csv = parseCsv(response.text);
  assert.deepEqual(csv.slice(1).map(row => row[3]), ['Alpha', 'Alpha', 'Zulu']);
  assert.deepEqual(csv.slice(1).map(row => row[8]), ['7', '0', '8']);
  assert.equal(csv[2][7], '{"quality":0}');
  assert.equal(csv[2][9], "'  =SUM(1,2)");
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal((await AuditLog.findOne({ action: 'archive.results.export' })).metadata.rows, 3);
  const empty = await api('get', '/legacy-data/results/export').query({ subject: 'missing' }).expect(200);
  assert.equal(parseCsv(empty.text).length, 1);
});

test('archive filters reject malformed input and refuse overflow without silent truncation', async () => {
  for (const query of ['group[$ne]=x', 'subject[]=one', 'block=' + 'a'.repeat(121), 'from=2026-02-30', 'from=2026-11-21&to=2026-11-20']) {
    await api('get', '/legacy-data/results?' + query).expect(400);
    await api('get', '/legacy-data/results/export?' + query).expect(400);
  }
  await api('get', '/legacy-data/results?page=-1').expect(400);
  const base = archive({ legacySnapshot: { groupName: 'Volume', subject: 'Volume' } });
  await Evaluation.insertMany(Array.from({ length: 10000 }, () => ({ ...base, group: new mongoose.Types.ObjectId() })));
  const exact = await api('get', '/legacy-data/results/export').query({ subject: 'volume' }).expect(200);
  assert.equal(parseCsv(exact.text).length, 10001);
  await Evaluation.create(archive({ legacySnapshot: { subject: 'Volume' } }));
  const overflow = await api('get', '/legacy-data/results/export').query({ subject: 'volume' }).expect(413);
  assert.match(overflow.body.message, /Narrow the filters/);
});

test('analytics CSV uses the same registration period and current grading/proposal totals as the dashboard', async () => {
  const summary = (await api('get', '/operations/analytics?days=7').expect(200)).body;
  const registrations = await api('get', '/operations/analytics/export?report=registrations&days=7').expect(200);
  const rows = parseCsv(registrations.text);
  assert.equal(rows.length, 8);
  assert.equal(rows.slice(1).reduce((sum, row) => sum + Number(row[1]), 0), summary.period.groups);
  const grading = parseCsv((await api('get', '/operations/analytics/export?report=grading&days=7').expect(200)).text);
  assert.equal(Number(grading[1][3]), summary.totals.groups);
  assert.equal(Number(grading[1][4]), summary.totals.grading.complete);
  assert.equal(Number(grading[1][5]), summary.totals.grading.inProgress);
  const proposals = parseCsv((await api('get', '/operations/analytics/export?report=proposals&days=90').expect(200)).text);
  assert.equal(Number(proposals[1][4]), summary.totals.proposals.uploaded);
  assert.equal(Number(proposals[1][5]), summary.totals.proposals.missing);
  assert.equal(Number(proposals[1][7]), 1024);
  assert.ok(!registrations.text.includes(instructor.email));
  assert.equal(await AuditLog.countDocuments({ action: /^analytics.export\./ }), 3);
});

test('analytics exports include subject buckets beyond the top ten and escape subject text', async () => {
  for (let index = 0; index < 11; index++) {
    const extra = await Subject.create({ code: `EXTRA${index}`, title: index === 10 ? '=SUM(1,2)' : `Extra ${index}` });
    const block = await Section.create({ name: 'Extra', block: `EXTRA-${index}`, subject: extra._id, createdBy: instructor._id });
    await Group.create({ name: `Extra ${index}`, section: block._id, createdBy: instructor._id });
  }
  const summary = (await api('get', '/operations/analytics?days=7').expect(200)).body;
  assert.equal(summary.bySubject.length, 10);
  const response = await api('get', '/operations/analytics/export?report=grading&days=7').expect(200);
  const rows = parseCsv(response.text);
  assert.equal(rows.length, 15); // header + platform + 13 subject buckets
  assert.ok(rows.some(row => row[1] === 'EXTRA10' && row[2] === "'=SUM(1,2)"));
  assert.equal(rows.slice(2).reduce((sum, row) => sum + Number(row[3]), 0), Number(rows[1][3]));
  for (const query of ['report=pdf', 'report[$ne]=x', 'report=grading&days=14', 'report=proposals&days[]=7']) await api('get', '/operations/analytics/export?' + query).expect(400);
});
