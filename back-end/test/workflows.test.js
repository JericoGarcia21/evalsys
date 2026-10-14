const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
process.env.JWT_SECRET = 'qa-isolated-secret-not-for-production';
process.env.DB_CACHE_TTL_MS = '0';
process.env.MONGOMS_DOWNLOAD_DIR = path.join(__dirname, '..', 'node_modules', '.cache', 'mongodb-binaries');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../src/app');
const Admin = require('../src/models/Admin');
const Panel = require('../src/models/Panel');
const Subject = require('../src/models/Subject');
const Section = require('../src/models/Section');
const Group = require('../src/models/Group');
const Rubric = require('../src/models/Rubric');
const Evaluation = require('../src/models/Evaluation');
const RegistrationLink = require('../src/models/RegistrationLink');
const Settings = require('../src/models/Settings');
const ChatMessage = require('../src/models/ChatMessage');
const ChatRead = require('../src/models/ChatRead');
const ChatRoom = require('../src/models/ChatRoom');
const { clearResponseCache } = require('../src/middleware/cache.middleware');
let mongo, passwordHash, superadmin, instructor, otherInstructor, panel, secondPanel, outsider, subject, otherSubject, section, group, rubric;
const password = 'QaPassword!2026';
const token = user => jwt.sign({ id: user._id.toString(), role: user.role }, process.env.JWT_SECRET);
const api = (method, url, user = instructor, scope = true) => {
  let req = request(app)[method](url);
  if (user) req = req.set('Authorization', 'Bearer ' + token(user));
  if (scope && subject) req = req.set('x-subject-id', subject._id.toString());
  if (user?.role === 'superadmin') req = req.set('x-instructor-id', instructor._id.toString());
  return req;
};
const submit = (user = panel, scores = { quality: 8 }, selectedRubric = rubric) => api('post', '/api/evaluations/group/' + group._id, user).send({ rubricId: selectedRubric._id.toString(), scores, comments: 'QA comment' });

before(async () => {
  mongo = await MongoMemoryServer.create({ instance: { dbName: 'evalsys_qa_temporary' } });
  await mongoose.connect(mongo.getUri());
  passwordHash = await bcrypt.hash(password, 4);
  await Promise.all([Admin, Panel, Subject, Section, Group, Rubric, Evaluation, RegistrationLink, Settings, ChatMessage, ChatRead, ChatRoom].map(model => model.init()));
});
after(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});
beforeEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map(collection => collection.deleteMany({})));
  clearResponseCache();
  [subject, otherSubject] = await Subject.create([{ code: 'QA101', title: 'QA Subject' }, { code: 'QA202', title: 'Other Subject' }]);
  [superadmin, instructor, otherInstructor] = await Admin.insertMany([
    { name: 'QA Super', email: 'qa-super@evalsys.com', password: passwordHash, role: 'superadmin' },
    { name: 'QA Instructor', email: 'qa-instructor@evalsys.com', password: passwordHash, role: 'admin', assignedSubjects: [subject._id], subjectLimit: 2 },
    { name: 'Other Instructor', email: 'qa-other@evalsys.com', password: passwordHash, role: 'admin', assignedSubjects: [otherSubject._id] },
  ]);
  [panel, secondPanel, outsider] = await Panel.insertMany([
    { name: 'Panel A', email: 'qa-panel-a@evalsys.com', password: passwordHash, createdBy: instructor._id, mustChangePassword: false },
    { name: 'Panel B', email: 'qa-panel-b@evalsys.com', password: passwordHash, createdBy: instructor._id, mustChangePassword: false },
    { name: 'Other Panel', email: 'qa-outsider@evalsys.com', password: passwordHash, createdBy: otherInstructor._id, mustChangePassword: false },
  ]);
  section = await Section.create({ name: 'QA Block', block: 'QA-A', subject: subject._id, createdBy: instructor._id, assignedPanels: [panel._id, secondPanel._id] });
  group = await Group.create({ name: 'QA Group', section: section._id, createdBy: instructor._id, members: [{ firstName: 'Test', lastName: 'Student' }] });
  rubric = await Rubric.create({ title: 'QA Rubric', subject: subject._id, createdBy: instructor._id, criteria: [{ key: 'quality', label: 'Quality', maxScore: 10, levels: [{ label: 'Score', minScore: 0, maxScore: 10 }] }] });
  await Settings.create({});
});

test('health endpoint and unknown API paths return JSON', async () => {
  await request(app).get('/api/health').expect(200, { status: 'ok' });
  await request(app).get('/api/missing').expect(404).expect('Content-Type', /json/);
});
test('login accepts username and returns safe account details', async () => {
  const response = await request(app).post('/api/auth/login').send({ email: 'qa-instructor', password }).expect(200);
  assert.ok(response.body.token); assert.equal(response.body.user.role, 'admin'); assert.equal(response.body.user.password, undefined);
  const me = await request(app).get('/api/auth/me').set('Authorization', 'Bearer ' + response.body.token).expect(200);
  assert.equal(me.body.password, undefined);
});
test('invalid credentials and missing/invalid tokens are denied', async () => {
  await request(app).post('/api/auth/login').send({ email: 'qa-instructor', password: 'wrong' }).expect(401);
  await request(app).get('/api/groups').expect(401);
  await request(app).get('/api/groups').set('Authorization', 'Bearer invalid').expect(401);
});
test('temporary password flow blocks operations until password changes', async () => {
  await Panel.updateOne({ _id: panel._id }, { mustChangePassword: true });
  await api('get', '/api/groups', panel).expect(403);
  await api('patch', '/api/auth/change-password', panel).send({ newPassword: 'NewQaPassword!2026' }).expect(200);
  await api('get', '/api/groups', panel).expect(200);
});
test('instructors cannot create administrators or access platform operations', async () => {
  await api('post', '/api/users').send({ name: 'Forbidden', email: 'forbidden', password, role: 'superadmin' }).expect(403);
  await api('get', '/api/operations/audit-logs').expect(403);
  await api('get', '/api/operations/audit-logs', superadmin).expect(200);
});
test('instructor can create a panel, block, group, and rubric', async () => {
  const user = await api('post', '/api/users').send({ name: 'New Panel', email: 'qa-new', password, role: 'panel' }).expect(201);
  const block = await api('post', '/api/sections').send({ name: 'New Block', block: 'QA-B', assignedPanels: [user.body.id] }).expect(201);
  await api('post', '/api/groups').send({ name: 'New Group', section: block.body._id, members: ['Sample Member'] }).expect(201);
  await api('post', '/api/rubrics').send({ title: 'New Rubric', criteria: [{ key: 'demo', label: 'Demo', maxScore: 10, levels: [{ label: 'Score', minScore: 0, maxScore: 10 }] }] }).expect(201);
});
test('subject limits and duplicate subject codes are enforced', async () => {
  await api('post', '/api/subjects').send({ code: 'QA303', title: 'Second Subject' }).expect(201);
  await api('post', '/api/subjects').send({ code: 'QA404', title: 'Beyond Limit' }).expect(400);
  await api('post', '/api/subjects', superadmin).send({ code: 'QA101', title: 'Duplicate' }).expect(409);
});
test('cross-instructor group access and panel assignments are denied', async () => {
  await api('get', '/api/groups/' + group._id, otherInstructor).expect(403);
  await api('put', '/api/groups/' + group._id, otherInstructor).send({ name: 'Hijacked' }).expect(403);
  await api('put', '/api/sections/' + section._id).send({ assignedPanels: [outsider._id.toString()] }).expect(400);
  await submit(outsider).expect(403);
});
test('public block listing requires a subject', async () => {
  await request(app).get('/api/sections/public').expect(400);
  await request(app).get('/api/sections/public?subject=' + subject._id).expect(200);
});
test('valid registration link creates a group and prevents duplicates', async () => {
  const link = await api('post', '/api/registration-links').send({ sections: [section._id.toString()], expiresAt: new Date(Date.now() + 3600000).toISOString() }).expect(201);
  await request(app).get('/api/registration-links/public/' + link.body.token).expect(200);
  const url = '/api/registration-links/public/' + link.body.token + '/register';
  const payload = { name: 'Registered QA Group', section: section._id.toString(), members: JSON.stringify([{ firstName: 'New', lastName: 'Student' }]) };
  await request(app).post(url).send(payload).expect(201);
  await request(app).post(url).send(payload).expect(400);
});
test('closed, expired, and inactive-owner registration links are rejected', async () => {
  const link = await RegistrationLink.create({ subject: subject._id, sections: [section._id], createdBy: instructor._id, expiresAt: new Date(Date.now() - 1000) });
  await request(app).get('/api/registration-links/public/' + link.token).expect(403);
  await RegistrationLink.updateOne({ _id: link._id }, { expiresAt: new Date(Date.now() + 3600000) });
  await Admin.updateOne({ _id: instructor._id }, { isActive: false });
  await request(app).get('/api/registration-links/public/' + link.token).expect(403);
});
test('proposal upload rejects unsupported files without creating a group', async () => {
  const link = await RegistrationLink.create({ subject: subject._id, createdBy: instructor._id, expiresAt: new Date(Date.now() + 3600000) });
  await request(app).post('/api/registration-links/public/' + link.token + '/register').field('name', 'Invalid Upload').field('section', section._id.toString()).attach('proposalFile', Buffer.from('bad'), 'script.exe').expect(400);
  assert.equal(await Group.countDocuments({ name: 'Invalid Upload' }), 0);
});
test('scores submit and update one evaluation per panel/group', async () => {
  const first = await submit().expect(200); assert.equal(first.body.total, 8);
  const second = await submit(panel, { quality: 6 }).expect(200); assert.equal(second.body.total, 6);
  assert.equal(await Evaluation.countDocuments({ group: group._id, panel: panel._id }), 1);
});
test('unknown, missing, nonnumeric, negative, and excessive score values are rejected', async () => {
  for (const scores of [{ quality: 10, bonus: 1000 }, {}, { quality: 'NaN' }, { quality: -1 }, { quality: 11 }, { quality: true }, []]) await submit(panel, scores).expect(400);
  assert.equal(await Evaluation.countDocuments({}), 0);
});
test('wrong-subject and wrong-owner rubrics are rejected', async () => {
  const wrong = await Rubric.create({ title: 'Other', subject: otherSubject._id, createdBy: otherInstructor._id, criteria: rubric.criteria.toObject() });
  await submit(panel, { quality: 8 }, wrong).expect(400);
  wrong.subject = subject._id; await wrong.save();
  await submit(panel, { quality: 8 }, wrong).expect(400);
});
test('section results and export distinguish incomplete and complete evaluations', async () => {
  await submit(panel, { quality: 8 }).expect(200);
  let result = await api('get', '/api/evaluations/section/' + section._id + '/results').expect(200);
  assert.equal(result.body[0].isIncomplete, true); assert.deepEqual(result.body[0].missingPanels, ['Panel B']);
  let exported = await api('get', '/api/evaluations/export-all').expect(200);
  assert.equal(exported.body[0].AverageScore, 'Pending Complete Evaluation');
  await submit(secondPanel, { quality: 10 }).expect(200);
  result = await api('get', '/api/evaluations/section/' + section._id + '/results').expect(200);
  assert.equal(result.body[0].isIncomplete, false); assert.equal(result.body[0].finalTotal, 9);
  exported = await api('get', '/api/evaluations/export-all').expect(200);
  assert.equal(exported.body[0].AverageScore, 9);
});
test('exports honor group assignments and include groups with no submissions', async () => {
  await Section.updateOne({ _id: section._id }, { assignedPanels: [] });
  await Group.updateOne({ _id: group._id }, { assignedPanels: [panel._id, secondPanel._id] });
  let exported = await api('get', '/api/evaluations/export-all').expect(200);
  assert.equal(exported.body.length, 1); assert.equal(exported.body[0].Status, 'Incomplete');
  await submit().expect(200);
  exported = await api('get', '/api/evaluations/export-all').expect(200);
  assert.equal(exported.body[0].Status, 'Incomplete'); assert.equal(exported.body[0].MissingPanels, 'Panel B');
});
test('subject grading lock blocks submission while preserving submitted results', async () => {
  await submit().expect(200);
  await api('patch', '/api/users/' + instructor._id + '/grading-lock', superadmin).send({ subject: subject._id.toString(), gradingLocked: true }).expect(200);
  await submit().expect(403);
  assert.equal(await Evaluation.countDocuments({}), 1);
});
test('immediate maintenance blocks login, operations, and public registration but allows superadmin', async () => {
  const link = await RegistrationLink.create({ subject: subject._id, createdBy: instructor._id, expiresAt: new Date(Date.now() + 3600000) });
  await api('patch', '/api/settings/system-controls', superadmin).send({ isMaintenanceMode: true, maintenanceDelayMinutes: 0 }).expect(200);
  await request(app).post('/api/auth/login').send({ email: 'qa-instructor', password }).expect(503);
  await api('get', '/api/groups').expect(503);
  await request(app).post('/api/registration-links/public/' + link.token + '/register').send({ name: 'Blocked', section: section._id.toString() }).expect(503);
  await api('get', '/api/operations/audit-logs', superadmin).expect(200);
});
test('scheduled maintenance starts at the configured time and can be cancelled', async () => {
  await api('patch', '/api/settings/system-controls', superadmin).send({ isMaintenanceMode: true, maintenanceDelayMinutes: 5 }).expect(200);
  await api('get', '/api/groups').expect(200);
  await Settings.updateOne({}, { maintenanceStartsAt: new Date(Date.now() - 1000) });
  const status = await request(app).get('/api/settings/public').set('Cache-Control', 'no-cache').expect(200); assert.equal(status.body.isMaintenanceMode, true);
  await api('get', '/api/groups').expect(503);
  await api('patch', '/api/settings/system-controls', superadmin).send({ isMaintenanceMode: false }).expect(200);
  await api('get', '/api/groups').expect(200);
});
test('malformed IDs and malformed JSON return controlled errors', async () => {
  await api('get', '/api/groups/not-an-id').expect(400).expect('Content-Type', /json/);
  await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{broken').expect(400);
  await request(app).get('/api/health').expect(200);
});
test('deleting a group snapshots its submitted evaluations into archive', async () => {
  await submit().expect(200);
  await api('delete', '/api/groups/' + group._id).expect(200);
  const record = await Evaluation.findOne({}); assert.equal(record.isLegacyArchived, true); assert.equal(record.legacySnapshot.groupName, 'QA Group'); assert.equal(record.total, 8);
});
test('deleting a block preserves submitted evaluations and removes active groups', async () => {
  await submit().expect(200);
  await api('delete', '/api/sections/' + section._id).expect(200);
  assert.equal(await Group.countDocuments({}), 0); assert.equal(await Evaluation.countDocuments({ isLegacyArchived: true }), 1);
});
test('deleting a panel preserves its submitted score and name snapshot', async () => {
  await submit().expect(200);
  await api('delete', '/api/users/' + panel._id).expect(200);
  const record = await Evaluation.findOne({}); assert.equal(record.total, 8); assert.equal(record.legacySnapshot.panelName, 'Panel A');
});
test('subject reset requires confirmation and preserves submitted evaluations', async () => {
  await submit().expect(200);
  await api('post', '/api/evaluations/master-reset').send({ confirmText: 'wrong' }).expect(400);
  await api('post', '/api/evaluations/master-reset').send({ confirmText: 'RESET QA101' }).expect(200);
  assert.equal(await Section.countDocuments({}), 0); assert.equal(await Evaluation.countDocuments({ isLegacyArchived: true }), 1);
});
test('background export completes and job results are owner-restricted', async () => {
  await submit().expect(200);
  const queued = await api('get', '/api/evaluations/export-all?background=true').expect(202);
  const id = queued.body.job.id; let status;
  for (let i = 0; i < 50; i++) { status = await api('get', '/api/jobs/' + id).expect(200); if (status.body.status === 'completed') break; await new Promise(resolve => setTimeout(resolve, 20)); }
  assert.equal(status.body.status, 'completed');
  await api('get', '/api/jobs/' + id, otherInstructor).expect(404);
  const result = await api('get', '/api/jobs/' + id + '/result').expect(200); assert.ok(Array.isArray(result.body.result));
});

test('inactive accounts and repeated failed-login account lockout are enforced', async () => {
  await Admin.updateOne({ _id: otherInstructor._id }, { isActive: false });
  await api('get', '/api/subjects', otherInstructor, false).expect(401);
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await request(app).post('/api/auth/login').send({ email: 'qa-outsider', password: 'wrong' });
    assert.ok([401, 423].includes(response.status));
  }
  const response = await request(app).post('/api/auth/login').send({ email: 'qa-outsider', password });
  assert.ok([403, 423].includes(response.status));
});
test('database failures are contained and do not expose internal details', async () => {
  const original = Group.findById;
  Group.findById = () => ({ populate() { return this; }, then(resolve, reject) { return Promise.reject(new Error('sensitive database connection details')).then(resolve, reject); } });
  try {
    const response = await api('get', '/api/groups/' + group._id).expect(500);
    assert.equal(JSON.stringify(response.body).includes('sensitive'), false);
  } finally { Group.findById = original; }
  await request(app).get('/api/health').expect(200);
});
test('proposal upload rollback and local storage-adapter contract are verified', async () => {
  const http = require('node:http');
  const oldUrl = process.env.SUPABASE_URL, oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const link = await RegistrationLink.create({ subject: subject._id, createdBy: instructor._id, expiresAt: new Date(Date.now() + 3600000) });
  const url = '/api/registration-links/public/' + link.token + '/register';
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  await request(app).post(url).field('name', 'Upload Fails').field('section', section._id.toString()).field('members', JSON.stringify([{ firstName: 'Test', lastName: 'Student' }])).attach('proposalFile', Buffer.from('%PDF-1.4 QA'), { filename: 'qa.pdf', contentType: 'application/pdf' }).expect(502);
  assert.equal(await Group.countDocuments({ name: 'Upload Fails' }), 0);
  const calls = [];
  const storage = http.createServer((req, res) => {
    calls.push(req.url); req.resume();
    if (req.method === 'GET' && req.url.includes('/object/')) {
      res.setHeader('Content-Type', 'application/pdf');
      return res.end('%PDF-1.4 QA');
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(req.url.includes('/sign/') ? { signedURL: '/object/sign/qa-file?token=qa' } : { Key: 'qa-file' }));
  });
  await new Promise(resolve => storage.listen(0, '127.0.0.1', resolve));
  process.env.SUPABASE_URL = 'http://127.0.0.1:' + storage.address().port;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'qa-local-storage-key';
  try {
    const uploaded = await request(app).post(url).field('name', 'Uploaded QA').field('section', section._id.toString()).field('members', JSON.stringify([{ firstName: 'Test', lastName: 'Student' }])).attach('proposalFile', Buffer.from('%PDF-1.4 QA'), { filename: 'qa.pdf', contentType: 'application/pdf' }).expect(201);
    assert.equal(uploaded.body.proposalFile.originalName, 'qa.pdf');
    const signed = await api('get', '/api/groups/' + uploaded.body._id + '/proposal-url', panel).expect(200);
    assert.ok(signed.body.url.includes('token=qa'));
    const preview = await api('get', '/api/groups/' + uploaded.body._id + '/proposal-url?format=content', panel).expect(200);
    assert.match(preview.headers['content-type'], /application\/pdf/);
    assert.equal(preview.headers['content-disposition'], 'inline');
    assert.equal(preview.headers['cache-control'], 'private, no-store');
    assert.equal(preview.body.toString(), '%PDF-1.4 QA');
    await api('get', '/api/groups/' + uploaded.body._id + '/proposal-url?format=content', outsider).expect(403);
    await api('get', '/api/groups/' + uploaded.body._id + '/proposal-url', outsider).expect(403);
    assert.ok(calls.some(path => path.includes('/sign/')));
  } finally {
    if (oldUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
    await new Promise(resolve => storage.close(resolve));
  }
});
test('global reset requires superadmin and exact confirmation and is explicitly destructive', async () => {
  await submit().expect(200);
  await api('post', '/api/evaluations/master-reset', instructor, false).send({ confirmText: 'RESET GLOBAL' }).expect(403);
  await api('post', '/api/evaluations/master-reset', superadmin, false).send({ confirmText: 'wrong' }).expect(400);
  await api('post', '/api/evaluations/master-reset', superadmin, false).send({ confirmText: 'RESET GLOBAL' }).expect(200);
  assert.equal(await Group.countDocuments({}), 0);
  assert.equal(await Section.countDocuments({}), 0);
  assert.equal(await Evaluation.countDocuments({}), 0);
});

test('mixed block and group assignments use a unique combined expected-panel set', async () => {
  const third = await Panel.create({ name: 'Panel C', email: 'qa-panel-c@evalsys.com', password, createdBy: instructor._id, mustChangePassword: false });
  await Group.updateOne({ _id: group._id }, { assignedPanels: [panel._id, third._id] });
  await submit(panel).expect(200); await submit(secondPanel).expect(200);
  const results = await api('get', '/api/evaluations/section/' + section._id + '/results').expect(200);
  assert.deepEqual(results.body[0].missingPanels, ['Panel C']);
  const exported = await api('get', '/api/evaluations/export-all').expect(200);
  assert.equal(exported.body[0].Status, 'Incomplete'); assert.equal(exported.body[0].MissingPanels, 'Panel C');
  await submit(third).expect(200);
  const complete = await api('get', '/api/evaluations/export-all').expect(200); assert.equal(complete.body[0].AverageScore, 8);
});
test('revoked subject access blocks result reads and member-only group edits', async () => {
  await Admin.updateOne({ _id: instructor._id }, { assignedSubjects: [] });
  await api('get', '/api/evaluations/group/' + group._id + '/result').expect(403);
  await api('put', '/api/groups/' + group._id).send({ members: ['Unauthorized edit'] }).expect(403);
});
test('instructor CSV export lock is enforced by the export API', async () => {
  await Admin.updateOne({ _id: instructor._id }, { csvExportLocked: true });
  await api('get', '/api/evaluations/export-all').expect(403);
});

test('reading Archive does not change active grades after a panel is deleted', async () => {
  await submit(panel, { quality: 8 }).expect(200); await submit(secondPanel, { quality: 10 }).expect(200);
  await api('delete', '/api/users/' + panel._id).expect(200);
  await api('get', '/api/legacy-data', superadmin).expect(200);
  assert.equal(await Evaluation.countDocuments({ isLegacyArchived: true }), 0);
  const results = await api('get', '/api/evaluations/section/' + section._id + '/results').expect(200);
  assert.equal(results.body[0].finalTotal, 9);
});
test('explicit archive migration requires confirmation and preserves current deleted-panel snapshots', async () => {
  await submit().expect(200); await api('delete', '/api/users/' + panel._id).expect(200);
  await api('post', '/api/legacy-data/repair', superadmin).send({ confirmText: 'wrong' }).expect(400);
  await api('post', '/api/legacy-data/repair', superadmin).send({ confirmText: 'ARCHIVE LEGACY' }).expect(200);
  assert.equal(await Evaluation.countDocuments({ isLegacyArchived: true }), 0);
  await Group.updateOne({ _id: group._id }, { $unset: { createdBy: '' } });
  await api('post', '/api/legacy-data/repair', superadmin).send({ confirmText: 'ARCHIVE LEGACY' }).expect(200);
  assert.equal(await Evaluation.countDocuments({ isLegacyArchived: true }), 1);
});

test('superadmin can recover subjects after their instructor is deleted', async () => {
  await Subject.updateOne({ _id: subject._id }, { createdBy: instructor._id });
  await api('delete', '/api/users/' + instructor._id, superadmin).expect(200);
  const subjects = await api('get', '/api/subjects?scope=all', superadmin).expect(200);
  assert.ok(subjects.body.some(item => item._id === subject._id.toString()));
  const scoped = await api('get', '/api/subjects', superadmin).expect(200);
  assert.deepEqual(scoped.body, []);
  await Admin.updateOne({ _id: otherInstructor._id }, { subjectLimit: 2 });
  await api('put', '/api/subjects/' + subject._id + '/admins', superadmin)
    .send({ adminIds: [otherInstructor._id.toString()] }).expect(200);
  const assigned = await api('get', '/api/subjects', otherInstructor).expect(200);
  assert.ok(assigned.body.some(item => item._id === subject._id.toString()));
  await api('delete', '/api/subjects/' + subject._id, superadmin)
    .send({ confirmText: 'DELETE QA101' }).expect(200);
  assert.equal(await Subject.findById(subject._id), null);
});

test('all-subject management scope does not expose other subjects to instructors', async () => {
  const response = await api('get', '/api/subjects?scope=all').expect(200);
  assert.deepEqual(response.body.map(item => item._id), [subject._id.toString()]);
});

test('panel grades assigned groups across instructor subjects with separate rubrics and scores', async () => {
  await Admin.updateOne({ _id: instructor._id }, { $addToSet: { assignedSubjects: otherSubject._id } });
  const secondSection = await Section.create({ name: 'Second block', block: 'QA-B', subject: otherSubject._id, createdBy: instructor._id, assignedPanels: [panel._id] });
  const secondGroup = await Group.create({ name: 'Second group', section: secondSection._id, createdBy: instructor._id, members: [] });
  const secondRubric = await Rubric.create({ title: 'Second subject rubric', subject: otherSubject._id, createdBy: instructor._id, criteria: [{ key: 'presentation', label: 'Presentation', maxScore: 20, levels: [{ label: 'Score', minScore: 0, maxScore: 20 }] }] });
  const groups = await api('get', '/api/groups', panel).expect(200);
  assert.ok(groups.body.some(item => item._id === group._id.toString()));
  assert.ok(groups.body.some(item => item._id === secondGroup._id.toString()));
  const sections = await api('get', '/api/sections', panel).expect(200);
  assert.ok(sections.body.some(item => item._id === secondSection._id.toString()));
  const active = await api('get', '/api/rubrics/active?subject=' + otherSubject._id, panel)
    .set('x-subject-id', otherSubject._id.toString()).expect(200);
  assert.equal(active.body._id, secondRubric._id.toString());
  await submit(panel, { quality: 8 }).expect(200);
  await api('post', '/api/evaluations/group/' + secondGroup._id, panel)
    .set('x-subject-id', otherSubject._id.toString())
    .send({ rubricId: secondRubric._id.toString(), scores: { presentation: 18 } }).expect(200);
  await api('post', '/api/evaluations/group/' + secondGroup._id, panel)
    .send({ rubricId: rubric._id.toString(), scores: { quality: 9 } }).expect(400);
  const first = await Evaluation.findOne({ group: group._id, panel: panel._id });
  const second = await Evaluation.findOne({ group: secondGroup._id, panel: panel._id });
  assert.equal(first.total, 8);
  assert.equal(first.subject.toString(), subject._id.toString());
  assert.equal(second.total, 18);
  assert.equal(second.subject.toString(), otherSubject._id.toString());
});


test('score exports sort groups and members A-Z while keeping scores intact', async () => {
  group.name = 'Zeta group';
  await group.save();
  const memberList = [
    { lastName: 'zulu', firstName: 'Zed' },
    { lastName: 'Ábel', firstName: 'Ada' },
    { lastName: 'beta', firstName: 'Ben' },
  ];
  const extraGroups = await Group.create([
    { name: 'Group 10', section: section._id, createdBy: instructor._id, members: memberList },
    { name: ' beta group ', section: section._id, createdBy: instructor._id, members: memberList },
    { name: 'Álpha group', section: section._id, createdBy: instructor._id, members: memberList },
    { name: 'Group 2', section: section._id, createdBy: instructor._id, members: memberList },
  ]);
  const allGroups = [group, ...extraGroups];
  for (const [index, item] of allGroups.entries()) {
    await Evaluation.insertMany([panel, secondPanel].map(person => ({ group: item._id, panel: person._id, rubric: rubric._id, subject: subject._id, scores: { quality: index + 3 }, total: index + 3, isSubmitted: true })));
  }
  const expectedNames = ['Álpha group', 'beta group', 'Group 2', 'Group 10', 'Zeta group'];
  const exported = await api('get', '/api/evaluations/export-all').expect(200);
  assert.deepEqual(exported.body.map(row => row.GroupName), expectedNames);
  const expectedScores = new Map(allGroups.map((item, index) => [item.name, index + 3]));
  exported.body.forEach(row => assert.equal(row.AverageScore, expectedScores.get(row.GroupName)));
  assert.equal(exported.body[0].Members, 'Ada Ábel; Ben beta; Zed zulu');
  const stored = await Group.findById(extraGroups[0]._id);
  assert.deepEqual(stored.members.map(member => member.lastName), ['zulu', 'Ábel', 'beta']);
  const queued = await api('get', '/api/evaluations/export-all?background=true').expect(202);
  let status;
  for (let attempt = 0; attempt < 100; attempt++) {
    status = await api('get', '/api/jobs/' + queued.body.job.id).expect(200);
    if (status.body.status === 'completed') break;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.equal(status.body.status, 'completed');
  const completed = await api('get', '/api/jobs/' + queued.body.job.id + '/result').expect(200);
  assert.deepEqual(completed.body.result.map(row => row.GroupName), expectedNames);
});


test('panel block list includes direct group assignments without exposing unassigned groups', async () => {
  await Section.updateOne({ _id: section._id }, { assignedPanels: [] });
  await Group.updateOne({ _id: group._id }, { assignedPanels: [panel._id] });
  const hiddenGroup = await Group.create({ name: 'Unassigned peer', section: section._id, createdBy: instructor._id, members: [] });
  const blocks = await api('get', '/api/sections', panel).expect(200);
  const assignedBlock = blocks.body.find(item => item._id === section._id.toString());
  assert.ok(assignedBlock);
  assert.equal(assignedBlock.subject.code, subject.code);
  const assignedGroups = await api('get', '/api/groups', panel).expect(200);
  assert.ok(assignedGroups.body.some(item => item._id === group._id.toString()));
  assert.ok(!assignedGroups.body.some(item => item._id === hiddenGroup._id.toString()));
  const outsiderBlocks = await api('get', '/api/sections', outsider).expect(200);
  assert.ok(!outsiderBlocks.body.some(item => item._id === section._id.toString()));
});

test('calendar maintenance saves exact dates, permits message edits and supports cancellation', async () => {
  const start = new Date(Date.now() + 3600000).toISOString();
  const end = new Date(Date.now() + 7200000).toISOString();
  const saved = await api('patch', '/api/settings/system-controls', superadmin)
    .send({ isMaintenanceMode: true, maintenanceStartsAt: start, maintenanceEndsAt: end, maintenanceMessage: 'Scheduled update' }).expect(200);
  assert.equal(saved.body.isMaintenanceMode, false);
  assert.equal(saved.body.maintenanceStartsAt, start);
  assert.equal(saved.body.maintenanceEndsAt, end);
  await api('get', '/api/groups', panel).expect(200);
  const edited = await api('patch', '/api/settings/system-controls', superadmin)
    .send({ maintenanceMessage: 'Updated maintenance notice' }).expect(200);
  assert.equal(edited.body.maintenanceStartsAt, start);
  assert.equal(edited.body.maintenanceEndsAt, end);
  const cancelled = await api('patch', '/api/settings/system-controls', superadmin)
    .send({ isMaintenanceMode: false }).expect(200);
  assert.equal(cancelled.body.maintenanceStartsAt, null);
  assert.equal(cancelled.body.maintenanceEndsAt, null);
});

test('maintenance calendar rejects invalid windows and remains restricted to superadmin', async () => {
  const start = new Date(Date.now() + 3600000).toISOString();
  const end = new Date(Date.now() + 7200000).toISOString();
  await api('patch', '/api/settings/system-controls', instructor)
    .send({ isMaintenanceMode: true, maintenanceStartsAt: start }).expect(403);
  const invalidRequests = [
    { isMaintenanceMode: true, maintenanceStartsAt: 'not-a-date' },
    { isMaintenanceMode: true, maintenanceStartsAt: null },
    { isMaintenanceMode: true, maintenanceStartsAt: '2099-06-15T24:00:00Z' },
    { isMaintenanceMode: true, maintenanceStartsAt: new Date(Date.now() - 1000).toISOString() },
    { isMaintenanceMode: true, maintenanceStartsAt: '2099-02-30T09:00:00Z' },
    { isMaintenanceMode: true, maintenanceStartsAt: '2099-06-15T09:00' },
    { isMaintenanceMode: true, maintenanceStartsAt: start, maintenanceEndsAt: start },
    { isMaintenanceMode: true, maintenanceStartsAt: start, maintenanceEndsAt: 'invalid' },
    { isMaintenanceMode: true, maintenanceStartsAt: start, maintenanceDelayMinutes: 5 },
    { maintenanceStartsAt: start },
    { isMaintenanceMode: 'true' },
    { maintenanceMessage: 'x'.repeat(251) },
  ];
  for (const body of invalidRequests) {
    await api('patch', '/api/settings/system-controls', superadmin).send(body).expect(400);
  }
  const valid = await api('patch', '/api/settings/system-controls', superadmin)
    .send({ isMaintenanceMode: true, maintenanceStartsAt: start, maintenanceEndsAt: end }).expect(200);
  assert.equal(valid.body.maintenanceStartsAt, start);
});

test('maintenance automatically restores login, API and student registration access at its end', async () => {
  const link = await RegistrationLink.create({ subject: subject._id, createdBy: instructor._id, expiresAt: new Date(Date.now() + 3600000) });
  await Settings.updateOne({}, {
    isMaintenanceMode: true,
    maintenanceStartsAt: new Date(Date.now() - 60000),
    maintenanceEndsAt: new Date(Date.now() + 3600000),
  });
  await api('get', '/api/groups', panel).expect(503);
  await request(app).post('/api/auth/login').send({ email: 'qa-instructor', password }).expect(503);
  await request(app).post('/api/registration-links/public/' + link.token + '/register')
    .send({ name: 'During maintenance', section: section._id.toString() }).expect(503);
  await api('get', '/api/settings', superadmin).expect(200);
  await Settings.updateOne({}, { maintenanceEndsAt: new Date(Date.now() - 1000) });
  const status = await request(app).get('/api/settings/public').set('Cache-Control', 'no-cache').expect(200);
  assert.equal(status.body.isMaintenanceMode, false);
  await api('get', '/api/groups', panel).expect(200);
  await request(app).post('/api/auth/login').send({ email: 'qa-instructor', password }).expect(200);
  await request(app).post('/api/registration-links/public/' + link.token + '/register')
    .send({ name: 'After maintenance', section: section._id.toString(), members: [{ firstName: 'Test', lastName: 'Student' }] }).expect(201);
});

test('platform analytics counts all instructors and current group rosters with separate grading statuses', async () => {
  const otherSection = await Section.create({ name: 'Other block', block: 'OTHER-A', subject: otherSubject._id, createdBy: otherInstructor._id, assignedPanels: [outsider._id] });
  const otherGroup = await Group.create({
    name: 'Other analytics group', section: otherSection._id, createdBy: otherInstructor._id,
    members: ['First Student', { firstName: 'Second', lastName: 'Student' }, 'Third Student'],
    proposalFile: { path: 'analytics/proposal.pdf', size: 2097152 },
    createdAt: new Date(Date.now() - 10 * 86400000),
  });
  const unassignedSection = await Section.create({ name: 'Unassigned block', block: 'UNASSIGNED', subject: subject._id, createdBy: instructor._id, assignedPanels: [] });
  await Group.create({ name: 'Unassigned analytics group', section: unassignedSection._id, createdBy: instructor._id, members: ['One Student', 'Two Student'] });
  await Group.updateOne({ _id: group._id }, { assignedPanels: [panel._id] });
  await submit().expect(200);
  await Evaluation.create({ group: otherGroup._id, panel: panel._id, rubric: rubric._id, subject: otherSubject._id, scores: { quality: 4 }, isSubmitted: true, isLegacyArchived: true });
  await Admin.updateOne({ _id: otherInstructor._id }, { isActive: false });
  await RegistrationLink.create([
    { subject: subject._id, createdBy: instructor._id, expiresAt: new Date(Date.now() + 3600000) },
    { subject: subject._id, createdBy: instructor._id, expiresAt: new Date(Date.now() - 1000) },
    { subject: subject._id, createdBy: instructor._id, expiresAt: new Date(Date.now() + 3600000), isActive: false },
  ]);

  const response = await api('get', '/api/operations/analytics?days=7', superadmin).set('Cache-Control', 'no-cache').expect(200);
  assert.equal(response.body.scope, 'platform');
  const totals = response.body.totals;
  assert.equal(totals.students, 6);
  assert.equal(totals.groups, 3);
  assert.deepEqual(totals.instructors, { total: 2, active: 1, inactive: 1 });
  assert.deepEqual(totals.panels, { total: 3, active: 3, inactive: 0 });
  assert.equal(totals.subjects.total, 2);
  assert.equal(totals.blocks, 3);
  assert.deepEqual(totals.proposals, { uploaded: 1, missing: 2, storageMb: 2 });
  assert.deepEqual(totals.grading, { complete: 0, inProgress: 1, pending: 1, unassigned: 1, submittedEvaluations: 1 });
  assert.equal(totals.archivedEvaluations, 1);
  assert.deepEqual(totals.registrationLinks, { total: 3, open: 1 });
  assert.equal(response.body.registrations.length, 7);
  assert.deepEqual(response.body.period, { groups: 2, students: 3 });
  const otherStats = response.body.bySubject.find(item => item.subjectId === otherSubject._id.toString());
  assert.equal(otherStats.students, 3);
  assert.equal(otherStats.proposals, 1);
  await submit(secondPanel).expect(200);
  const completed = await api('get', '/api/operations/analytics?days=30', superadmin).set('Cache-Control', 'no-cache').expect(200);
  assert.equal(completed.body.totals.grading.complete, 1);
  assert.equal(completed.body.totals.grading.inProgress, 0);
  assert.deepEqual(completed.body.period, { groups: 3, students: 6 });
  assert.equal(completed.body.registrations.length, 30);
  assert.equal(completed.body.registrations.reduce((sum, day) => sum + day.groups, 0), 3);
});

test('analytics is restricted to superadmin and validates the registration range', async () => {
  await request(app).get('/api/operations/analytics').expect(401);
  await api('get', '/api/operations/analytics', instructor).expect(403);
  await api('get', '/api/operations/analytics', panel).expect(403);
  await api('get', '/api/operations/analytics?days=14', superadmin).expect(400);
  await api('get', '/api/operations/analytics?days=invalid', superadmin).expect(400);
  await api('get', '/api/operations/analytics?days=90', superadmin).expect(200);
});

test('analytics handles an empty platform without fabricating students or registrations', async () => {
  await Promise.all([Group, Section, Subject, Panel, Evaluation, RegistrationLink].map(model => model.deleteMany({})));
  await Admin.deleteMany({ role: 'admin' });
  const response = await api('get', '/api/operations/analytics?days=7', superadmin, false)
    .set('x-instructor-id', '').set('Cache-Control', 'no-cache').expect(200);
  assert.equal(response.body.totals.students, 0);
  assert.equal(response.body.totals.groups, 0);
  assert.equal(response.body.totals.instructors.total, 0);
  assert.equal(response.body.totals.panels.total, 0);
  assert.deepEqual(response.body.bySubject, []);
  assert.deepEqual(response.body.period, { groups: 0, students: 0 });
  assert.equal(response.body.registrations.length, 7);
  assert.ok(response.body.registrations.every(day => day.groups === 0 && day.students === 0));
});

const chatPayload = body => ({ body, clientMessageId: require('node:crypto').randomUUID() });
const chatRooms = async (user = panel) => (await api('get', '/api/chat/rooms', user).expect(200)).body.rooms;

test('general panel chat joins instructor and assigned judges across blocks of one subject', async () => {
  await Section.updateOne({ _id: section._id }, { assignedPanels: [panel._id] });
  await Section.create({ name: 'Second subject block', block: 'QA-B', subject: subject._id, createdBy: instructor._id, assignedPanels: [secondPanel._id] });
  const roomA = (await chatRooms(panel))[0];
  const roomB = (await chatRooms(secondPanel))[0];
  assert.equal(roomA._id, roomB._id);
  assert.equal(roomA.name, 'General Panel Chat');
  assert.equal(roomA.groups, undefined);
  assert.equal(roomA.block, undefined);
  assert.equal(roomA.participants.length, 3);
  assert.ok(roomA.participants.some(person => person.role === 'admin' && person._id === instructor._id.toString()));
  assert.equal((await chatRooms(instructor))[0]._id, roomA._id);
  const posted = await api('post', '/api/chat/rooms/' + roomA._id + '/messages', panel).send(chatPayload('Let us discuss the presentation after the demo.')).expect(201);
  assert.equal(posted.body.sender.role, 'panel');
  assert.equal(posted.body.sender.name, panel.name);
  const received = await api('get', '/api/chat/rooms/' + roomB._id + '/messages', secondPanel).expect(200);
  assert.equal(received.body.messages[0].body, posted.body.body);
  assert.equal(received.body.messages[0].clientMessageId, undefined);
  await api('post', '/api/chat/rooms/' + roomA._id + '/messages', instructor).send(chatPayload('Please use the rubric for your own scores.')).expect(201);
  assert.equal((await chatRooms(panel))[0].unread, 1);
  assert.equal((await chatRooms(secondPanel))[0].unread, 2);
});

test('chat read cursors are monotonic and retries do not duplicate messages', async () => {
  const room = (await chatRooms(panel))[0];
  const payload = chatPayload('Presentation coordination');
  const first = await api('post', '/api/chat/rooms/' + room._id + '/messages', panel).send(payload).expect(201);
  const retry = await api('post', '/api/chat/rooms/' + room._id + '/messages', panel).send(payload).expect(200);
  assert.equal(retry.body._id, first.body._id);
  assert.equal(await ChatMessage.countDocuments(), 1);
  await api('post', '/api/chat/rooms/' + room._id + '/messages', panel).send({ ...payload, body: 'Changed text' }).expect(409);
  const second = await api('post', '/api/chat/rooms/' + room._id + '/messages', panel).send(chatPayload('Second message')).expect(201);
  assert.equal((await chatRooms(secondPanel))[0].unread, 2);
  await api('post', '/api/chat/rooms/' + room._id + '/read', secondPanel).send({ messageId: second.body._id }).expect(200);
  await api('post', '/api/chat/rooms/' + room._id + '/read', secondPanel).send({ messageId: first.body._id }).expect(200);
  assert.equal((await chatRooms(secondPanel))[0].unread, 0);
  assert.equal(await ChatRead.countDocuments({ user: secondPanel._id }), 1);
});

test('chat checks current assignments and denies students, unrelated panels and other instructors', async () => {
  const room = (await chatRooms(panel))[0];
  await request(app).get('/api/chat/rooms').expect(401);
  await api('get', '/api/chat/rooms', superadmin).expect(403);
  assert.deepEqual(await chatRooms(outsider), []);
  await api('get', '/api/chat/rooms/' + room._id + '/messages', outsider).expect(403);
  await api('post', '/api/chat/rooms/' + room._id + '/messages', otherInstructor).send(chatPayload('Not allowed')).expect(403);
  await api('post', '/api/chat/rooms/' + room._id + '/read', outsider).send({ messageId: group._id.toString() }).expect(403);
  await Section.updateOne({ _id: section._id }, { assignedPanels: [secondPanel._id] });
  assert.deepEqual(await chatRooms(panel), []);
  await api('get', '/api/chat/rooms/' + room._id + '/messages', panel).expect(403);
  await Group.updateOne({ _id: group._id }, { assignedPanels: [panel._id] });
  assert.equal((await chatRooms(panel))[0]._id, room._id);
  await api('get', '/api/chat/rooms/' + room._id + '/messages', panel).expect(200);
  await Admin.updateOne({ _id: instructor._id }, { $set: { assignedSubjects: [] } });
  assert.deepEqual(await chatRooms(panel), []);
  await api('get', '/api/chat/rooms/' + room._id + '/messages', panel).expect(403);
});

test('chat validates messages, preserves sender identity and paginates history without gaps', async () => {
  const room = (await chatRooms(panel))[0];
  await api('post', '/api/chat/rooms/' + room._id + '/messages', panel).send(chatPayload('   ')).expect(400);
  await api('post', '/api/chat/rooms/' + room._id + '/messages', panel).send(chatPayload('x'.repeat(2001))).expect(400);
  await api('get', '/api/chat/rooms/not-an-id/messages', panel).expect(400);
  await api('get', '/api/chat/rooms/' + room._id + '/messages?before=invalid', panel).expect(400);
  const spoofed = await api('post', '/api/chat/rooms/' + room._id + '/messages', panel)
    .send({ ...chatPayload('<script>plain text</script>'), sender: { id: instructor._id, role: 'admin', name: 'Fake instructor' } }).expect(201);
  assert.equal(spoofed.body.sender.role, 'panel');
  assert.equal(spoofed.body.sender.id, panel._id.toString());
  assert.equal(spoofed.body.sender.name, panel.name);
  await ChatMessage.deleteMany({});
  const history = await ChatMessage.insertMany(Array.from({ length: 60 }, (_, index) => ({
    room: room._id, sender: { id: panel._id, role: 'panel', name: panel.name }, body: 'History ' + index, clientMessageId: 'history-message-' + index,
  })));
  const latest = await api('get', '/api/chat/rooms/' + room._id + '/messages', secondPanel).expect(200);
  assert.equal(latest.body.messages.length, 50);
  assert.equal(latest.body.messages[0].body, 'History 10');
  assert.equal(latest.body.hasMore, true);
  const older = await api('get', '/api/chat/rooms/' + room._id + '/messages?before=' + latest.body.messages[0]._id, secondPanel).expect(200);
  assert.equal(older.body.messages.length, 10);
  assert.equal(older.body.hasMore, false);
  const incremental = await api('get', '/api/chat/rooms/' + room._id + '/messages?after=' + history[0]._id, secondPanel).expect(200);
  assert.equal(incremental.body.messages.length, 50);
  assert.equal(incremental.body.hasMoreNew, true);
  assert.equal(incremental.body.messages[0].body, 'History 1');
  const tail = await api('get', '/api/chat/rooms/' + room._id + '/messages?after=' + incremental.body.messages[49]._id, secondPanel).expect(200);
  assert.equal(tail.body.messages.length, 9);
  assert.equal(tail.body.hasMoreNew, false);
  const otherRoom = await ChatRoom.create({ instructor: otherInstructor._id, subject: otherSubject._id });
  const otherMessage = await ChatMessage.create({ room: otherRoom._id, sender: { id: outsider._id, role: 'panel', name: outsider.name }, body: 'Private', clientMessageId: 'other-room-message' });
  await api('post', '/api/chat/rooms/' + room._id + '/read', panel).send({ messageId: otherMessage._id.toString() }).expect(400);
});
