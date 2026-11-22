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
const AuditLog = require('../src/models/AuditLog');
const AuthSession = require('../src/models/AuthSession');
const ChatMessage = require('../src/models/ChatMessage');
const ChatRead = require('../src/models/ChatRead');
const ChatRoom = require('../src/models/ChatRoom');
const { clearResponseCache } = require('../src/middleware/cache.middleware');
let mongo, passwordHash, superadmin, instructor, otherInstructor, panel, secondPanel, outsider, subject, otherSubject, section, group, rubric;
const password = 'QaPassword!2026';
const token = user => user._qaToken || jwt.sign({ id: user._id.toString(), role: user.role, sid: user._id.toString(), sv: user.sessionVersion || 0 }, process.env.JWT_SECRET, { expiresIn: '1h' });
const seedSession = user => AuthSession.create({ _id: user._id, user: user._id, role: user.role, version: 0, expiresAt: new Date(Date.now() + 3600000) });
const createPanel = async payload => { const user = await Panel.create(payload); await seedSession(user); return user; };
const api = (method, url, user = instructor, scope = true) => {
  let req = request(app)[method](url);
  if (user) req = req.set('Authorization', 'Bearer ' + token(user));
  if (scope && subject) req = req.set('x-subject-id', subject._id.toString());
  if (user?.role === 'superadmin') req = req.set('x-instructor-id', instructor._id.toString());
  return req;
};
const submit = (user = panel, scores = { quality: 8 }, selectedRubric = rubric) => api('post', '/api/evaluations/group/' + group._id, user).send({ rubricId: selectedRubric._id.toString(), scores, comments: 'QA comment' });

const databaseTemplate = () => {
  const template = require('../../front-end/src/data/databaseRubric.json');
  return { title: 'Database Final Project', instructions: template.instructions, criteria: template.criteria.map(criterion => ({
    ...criterion, levels: [100, 90, 80, 70, 0].map(percentage => ({ label: `${percentage}%`, percentage,
      minScore: Math.round(criterion.maxScore * percentage) / 100, maxScore: Math.round(criterion.maxScore * percentage) / 100,
    })),
  })) };
};

test('complete document template survives create, read, update, grading, results, activation and deletion', async () => {
  const payload = databaseTemplate();
  assert.equal(payload.criteria.length, 16);
  const totals = Object.values(payload.criteria.reduce((sums, c) => ({ ...sums, [c.section]: (sums[c.section] || 0) + c.maxScore }), {}));
  assert.deepEqual(totals, [40, 30, 30]);
  const created = await api('post', '/api/rubrics').send(payload).expect(201);
  const id = created.body._id;
  const list = await api('get', '/api/rubrics').expect(200);
  assert.deepEqual(list.body.find(item => item._id === id).criteria, created.body.criteria);
  const edited = await api('put', '/api/rubrics/' + id).send({ instructions: 'Updated instructions', title: 'Edited template' }).expect(200);
  assert.deepEqual(edited.body.criteria, created.body.criteria);
  const scores = Object.fromEntries(payload.criteria.map(c => [c.key, Math.round(c.maxScore * 90) / 100]));
  const submitted = await submit(panel, scores, created.body).expect(200);
  assert.equal(submitted.body.total, 90);
  await submit(secondPanel, scores, created.body).expect(200);
  const results = await api('get', '/api/evaluations/section/' + section._id + '/results').expect(200);
  const result = results.body.find(item => item.group._id === group._id.toString());
  assert.equal(result.finalTotal, 90);
  assert.equal(result.averaged.section0criterion2, 10.8);
  assert.equal(result.rubricCriteria[0].section, 'Project Requirements');
  assert.equal(result.rubricCriteria[0].description, payload.criteria[0].description);
  await api('patch', '/api/rubrics/' + id + '/activate').expect(200);
  assert.equal(await Rubric.countDocuments({ subject: subject._id, createdBy: instructor._id, isActive: true }), 1);
  await api('delete', '/api/rubrics/' + id).expect(200);
  assert.equal(await Evaluation.countDocuments({ group: group._id }), 2);
  assert.equal(await Rubric.countDocuments({ subject: subject._id, isActive: true }), 1);
});

for (const panelCount of [1, 2, 3]) {
  test(`document rubric averages by ${panelCount} assigned panels consistently in results and exports`, async () => {
    const judges = [panel, secondPanel];
    if (panelCount === 3) judges.push(await createPanel({ name: 'Panel C', email: 'qa-average-c@evalsys.com', password,
      createdBy: instructor._id, mustChangePassword: false }));
    judges.length = panelCount;
    const sectionPanels = panelCount === 2 ? [] : judges.slice(0, 2).map(judge => judge._id);
    const groupPanels = panelCount === 3 ? [panel._id, judges[2]._id] : judges.map(judge => judge._id);
    await Section.updateOne({ _id: section._id }, { assignedPanels: sectionPanels });
    await Group.updateOne({ _id: group._id }, { assignedPanels: groupPanels });
    const created = await api('post', '/api/rubrics').send(databaseTemplate()).expect(201);
    await api('patch', '/api/rubrics/' + created.body._id + '/activate').expect(200);
    const ratings = panelCount === 1 ? [70] : panelCount === 2 ? [100, 90] : [100, 90, 70];
    for (let index = 0; index < judges.length; index++) {
      if (index === judges.length - 1) {
        const pending = await api('get', '/api/evaluations/section/' + section._id + '/results').expect(200);
        assert.equal(pending.body[0].isIncomplete, true);
        assert.deepEqual(pending.body[0].missingPanels, [judges[index].name]);
        const pendingExport = await api('get', '/api/evaluations/export-all').expect(200);
        assert.equal(pendingExport.body[0].AverageScore, 'Pending Complete Evaluation');
      }
      const scores = Object.fromEntries(created.body.criteria.map(criterion => [criterion.key, Math.round(criterion.maxScore * ratings[index]) / 100]));
      await submit(judges[index], scores, created.body).expect(200);
    }
    const expected = Math.round(ratings.reduce((sum, rating) => sum + rating, 0) / panelCount * 100) / 100;
    const results = await api('get', '/api/evaluations/section/' + section._id + '/results').expect(200);
    const result = results.body[0];
    assert.equal(result.isIncomplete, false);
    assert.deepEqual(result.missingPanels, []);
    assert.equal(result.evaluatedBy.length, panelCount);
    assert.equal(result.finalTotal, expected);
    for (const criterion of created.body.criteria) {
      const sum = ratings.reduce((total, rating) => total + Math.round(criterion.maxScore * rating) / 100, 0);
      assert.equal(result.averaged[criterion.key], Math.round(sum / panelCount * 100) / 100);
    }
    const detail = await api('get', '/api/evaluations/group/' + group._id + '/result').expect(200);
    assert.equal(detail.body.finalTotal, expected);
    const exported = await api('get', '/api/evaluations/export-all').expect(200);
    assert.equal(exported.body[0].AverageScore, expected);
  });
}

test('percentage rubric edits enforce ownership, preserve protected fields and reject invalid metadata', async () => {
  const payload = databaseTemplate();
  const created = await api('post', '/api/rubrics').send(payload).expect(201);
  const id = created.body._id;
  await api('put', '/api/rubrics/' + id, otherInstructor).send({ title: 'Stolen' }).expect(403);
  await api('put', '/api/rubrics/' + id).send({ title: 'Allowed', subject: otherSubject._id, createdBy: otherInstructor._id, isActive: true }).expect(200);
  const stored = await Rubric.findById(id);
  assert.equal(stored.createdBy.toString(), instructor._id.toString());
  assert.equal(stored.subject.toString(), subject._id.toString());
  assert.equal(stored.isActive, false);
  for (const instructions of [null, {}, 12]) await api('put', '/api/rubrics/' + id).send({ instructions }).expect(400);
  for (const [field, value] of [['section', {}], ['description', 4], ['scoringMode', 'invalid'], ['scoringMode', '']]) {
    const invalid = databaseTemplate(); invalid.criteria[0][field] = value;
    await api('post', '/api/rubrics').send(invalid).expect(400);
  }
  for (const percentage of [-1, 101, null, '90']) {
    const invalid = databaseTemplate(); invalid.criteria[0].levels[1].percentage = percentage;
    await api('post', '/api/rubrics').send(invalid).expect(400);
  }
  const duplicate = databaseTemplate(); duplicate.criteria[1].label = duplicate.criteria[0].label;
  await api('post', '/api/rubrics').send(duplicate).expect(400);
});

test('percentage scores include zero, reject non-ratings without changing saved scores and preserve range rounding', async () => {
  const created = await api('post', '/api/rubrics').send(databaseTemplate()).expect(201);
  const scores = Object.fromEntries(created.body.criteria.map(c => [c.key, 0]));
  await submit(panel, scores, created.body).expect(200);
  for (const invalid of [undefined, null, '', -1, 10.01, 11, 'bad']) {
    await submit(panel, { ...scores, section0criterion2: invalid }, created.body).expect(400);
    assert.equal((await Evaluation.findOne({ group: group._id, panel: panel._id })).scores.get('section0criterion2'), 0);
  }
  await submit(panel, { quality: 8.6 }).expect(200);
  assert.equal((await Evaluation.findOne({ group: group._id, panel: panel._id })).scores.get('quality'), 9);
});

test('sectioned percentage rubric preserves metadata and decimal rating scores', async () => {
  const criteria = ['Requirements', 'Documentation'].map((section, index) => ({
    key: `design${index}`, label: 'Design', section, description: 'Correct database design', maxScore: 12,
    scoringMode: 'percentage', levels: [100, 90, 80, 70, 0].map(percentage => ({
      label: `${percentage}%`, percentage, minScore: Math.round(12 * percentage) / 100, maxScore: Math.round(12 * percentage) / 100,
    })),
  }));
  const created = await api('post', '/api/rubrics').send({ title: 'Sectioned rubric', instructions: 'Demonstrate the database', criteria }).expect(201);
  assert.equal(created.body.criteria[0].section, 'Requirements');
  assert.equal(created.body.instructions, 'Demonstrate the database');
  const saved = await submit(panel, { design0: 10.8, design1: 9.6 }, created.body).expect(200);
  const evaluation = await Evaluation.findOne({ group: group._id, panel: panel._id });
  assert.equal(evaluation.scores.get('design0'), 10.8);
  assert.ok(Math.abs(evaluation.total - 20.4) < 0.000001);
  await submit(panel, { design0: 11, design1: 9.6 }, created.body).expect(400);
  criteria[0].levels[1].minScore = 11;
  await api('post', '/api/rubrics').send({ title: 'Invalid scale', criteria }).expect(400);
});

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
  await Promise.all([superadmin, instructor, otherInstructor, panel, secondPanel, outsider].map(seedSession));
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
  const changed = await api('patch', '/api/auth/change-password', panel).send({ newPassword: 'NewQaPassword!2026' }).expect(200);
  panel._qaToken = changed.body.token;
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
  await api('patch', '/api/users/' + instructor._id + '/grading-lock').send({ subject: subject._id.toString(), gradingLocked: true }).expect(200);
  await submit().expect(403);
  assert.equal(await Evaluation.countDocuments({}), 1);
});
test('semester archiving refuses standalone databases without changing groups or scores', async () => {
  await api('post', '/api/evaluations/archive-semester').send({ semester: 'First Semester', confirmText: `ARCHIVE ${subject.code}` }).expect(503);
  assert.ok(await Group.exists({ _id: group._id }));
  assert.equal(await require('../src/models/SemesterArchive').countDocuments(), 0);
});

test('transactional account actions refuse standalone databases without partial changes', async () => {
  await api('post', '/api/account-control/password-resets', superadmin).send({ instructorIds: [String(instructor._id)], confirmText: 'RESET PASSWORDS' }).expect(503);
  assert.equal((await Admin.findById(instructor._id)).password, passwordHash);
  await api('post', '/api/account-control/transfers', superadmin).send({ sourceId: String(instructor._id), targetId: String(otherInstructor._id), subjectIds: [String(subject._id)], confirmText: 'TRANSFER' }).expect(503);
  assert.equal(String((await Group.findById(group._id)).createdBy), String(instructor._id));
});
test('grading-lock changes stay instructor-only and restricted to own assigned subjects', async () => {
  const body = { subject: subject._id.toString(), gradingLocked: true };
  await api('patch', '/api/users/' + instructor._id + '/grading-lock', superadmin).send(body).expect(403);
  await api('patch', '/api/users/' + instructor._id + '/grading-lock', panel).send(body).expect(403);
  await api('patch', '/api/users/' + instructor._id + '/grading-lock', otherInstructor).send(body).expect(403);
  await api('patch', '/api/users/' + instructor._id + '/grading-lock').send({ ...body, subject: otherSubject._id.toString() }).expect(400);
  assert.equal((await Admin.findById(instructor._id)).gradingLockedSubjects.length, 0);
  await api('patch', '/api/users/' + instructor._id + '/grading-lock').send(body).expect(200);
  await api('patch', '/api/users/' + instructor._id + '/grading-lock').send({ ...body, gradingLocked: false }).expect(200);
});

test('audit listing and CSV export reject anonymous, instructor and panel access', async () => {
  for (const url of ['/api/operations/audit-logs', '/api/operations/audit-logs/export']) {
    await api('get', url, null).expect(401);
    await api('get', url).expect(403);
    await api('get', url, panel).expect(403);
    await api('get', url, otherInstructor).expect(403);
  }
});

const seedAuditRecords = async () => AuditLog.insertMany([
  { action: 'qa.audit', actor: { name: 'Audit [One]', email: 'audit-one@example.test', role: 'admin' }, createdAt: new Date('2026-11-19T23:59:59.999Z') },
  { action: 'qa.audit', actor: { name: 'Audit [One]', email: 'audit-one@example.test', role: 'admin' }, createdAt: new Date('2026-11-20T00:00:00.000Z'), instructor: instructor._id, subject: subject._id },
  { action: 'qa.audit', actor: { name: 'Audit [One]', email: 'audit-one@example.test', role: 'admin' }, createdAt: new Date('2026-11-20T23:59:59.999Z'), entity: { name: '=SUM(1,2)' } },
  { action: 'qa.audit', actor: { name: 'Audit [One]' }, createdAt: new Date('2026-11-21T00:00:00.000Z') },
  { action: 'qa.audit', status: 'failed', actor: { name: 'Audit [One]' }, createdAt: new Date('2026-11-20T12:00:00.000Z') },
  { action: 'qa.other', actor: { name: 'Audit [One]' }, createdAt: new Date('2026-11-20T12:00:00.000Z') },
  { action: 'qa.audit', actor: { name: 'Other' }, createdAt: new Date('2026-11-20T12:00:00.000Z') },
]);

test('audit filters combine actor/action/status/UTC dates with matching paginated totals and legacy arrays', async () => {
  const records = await seedAuditRecords();
  const filters = { actor: '[one]', action: 'qa.audit', status: 'success', from: '2026-11-20', to: '2026-11-20' };
  const first = await api('get', '/api/operations/audit-logs', superadmin).query({ ...filters, page: 1, limit: 1 }).expect(200);
  assert.equal(first.body.pagination.total, 2);
  assert.equal(first.body.pagination.totalPages, 2);
  assert.equal(first.body.items[0]._id, records[2]._id.toString());
  const second = await api('get', '/api/operations/audit-logs', superadmin).query({ ...filters, page: 2, limit: 1 }).expect(200);
  assert.equal(second.body.items[0]._id, records[1]._id.toString());
  assert.equal(second.body.items[0].instructor.name, instructor.name);
  assert.equal(second.body.items[0].subject.code, subject.code);
  const legacy = await api('get', '/api/operations/audit-logs', superadmin).query(filters).expect(200);
  assert.equal(legacy.body.length, 2);
  const byEmail = await api('get', '/api/operations/audit-logs', superadmin).query({ ...filters, actor: 'AUDIT-ONE@' }).expect(200);
  assert.equal(byEmail.body.length, 2);
  const literal = await api('get', '/api/operations/audit-logs', superadmin).query({ actor: '.*' }).expect(200);
  assert.deepEqual(literal.body, []);
  const failed = await api('get', '/api/operations/audit-logs', superadmin).query({ status: 'failed', page: 1 }).expect(200);
  assert.equal(failed.body.pagination.total, 1);
  const empty = await api('get', '/api/operations/audit-logs', superadmin).query({ action: 'missing', page: 1 }).expect(200);
  assert.equal(empty.body.pagination.total, 0);
  const capped = await api('get', '/api/operations/audit-logs', superadmin).query({ page: 1, limit: 999 }).expect(200);
  assert.equal(capped.body.pagination.limit, 200);
});

test('audit list and export validate malformed filters and list pagination', async () => {
  for (const query of [
    'from=2026-02-30', 'to=not-a-date', 'from=2026-11-21&to=2026-11-20',
    'actor[$ne]=x', 'action[]=one&action[]=two', 'status=unknown', 'to[]=2026-11-20', `actor=${'a'.repeat(121)}`,
  ]) {
    for (const endpoint of ['audit-logs', 'audit-logs/export']) {
      await api('get', '/api/operations/' + endpoint + '?' + query, superadmin).expect(400);
    }
  }
  for (const query of ['page=-1', 'limit=0', 'page=1.5', 'page[]=1', 'limit[$gt]=2']) {
    await api('get', '/api/operations/audit-logs?' + query, superadmin).expect(400);
  }
});

test('audit CSV exports all filtered pages safely and records export metadata', async () => {
  await seedAuditRecords();
  const filters = { actor: '[One]', action: 'qa.audit', status: 'success', from: '2026-11-20', to: '2026-11-20', page: 2, limit: 1 };
  const response = await api('get', '/api/operations/audit-logs/export', superadmin).query(filters).expect(200).expect('Content-Type', /text\/csv/);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.match(response.headers['content-disposition'], /attachment; filename="evalsys_audit_.*\.csv"/);
  assert.equal(response.text.trim().split('\r\n').length, 3);
  assert.ok(response.text.includes('"\'=SUM(1,2)"'));
  assert.ok(response.text.includes('QA Instructor'));
  assert.ok(!response.text.includes('audit.export'));
  const event = await AuditLog.findOne({ action: 'audit.export' });
  assert.equal(event.actor.id.toString(), superadmin._id.toString());
  assert.equal(event.metadata.rows, 2);
  assert.equal(event.metadata.filters.action, 'qa.audit');
  const empty = await api('get', '/api/operations/audit-logs/export', superadmin).query({ action: 'no.matches' }).expect(200);
  assert.equal(empty.text.trim().split('\r\n').length, 1);
});

test('audit export accepts exactly 10000 rows and refuses overflow without truncation', async () => {
  const { AUDIT_EXPORT_LIMIT } = require('../src/utils/auditQuery');
  await AuditLog.insertMany(Array.from({ length: AUDIT_EXPORT_LIMIT }, () => ({ action: 'qa.volume' })));
  const exact = await api('get', '/api/operations/audit-logs/export', superadmin).query({ action: 'qa.volume' }).expect(200);
  assert.equal(exact.text.trim().split('\r\n').length, AUDIT_EXPORT_LIMIT + 1);
  await AuditLog.create({ action: 'qa.volume' });
  const response = await api('get', '/api/operations/audit-logs/export', superadmin).query({ action: 'qa.volume' }).expect(413);
  assert.match(response.body.message, /Narrow the filters/);
  assert.equal(await AuditLog.countDocuments({ action: 'audit.export' }), 1);
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
  const third = await createPanel({ name: 'Panel C', email: 'qa-panel-c@evalsys.com', password, createdBy: instructor._id, mustChangePassword: false });
  await Group.updateOne({ _id: group._id }, { assignedPanels: [panel._id, third._id] });
  await submit(panel).expect(200); await submit(secondPanel).expect(200);
  const results = await api('get', '/api/evaluations/section/' + section._id + '/results').expect(200);
  assert.deepEqual(results.body[0].missingPanels, ['Panel C']);
  const exported = await api('get', '/api/evaluations/export-all').expect(200);
  assert.equal(exported.body[0].Status, 'Incomplete'); assert.equal(exported.body[0].MissingPanels, 'Panel C');
  await submit(third).expect(200);
  const complete = await api('get', '/api/evaluations/export-all').expect(200); assert.equal(complete.body[0].AverageScore, 8);
});
test('adding a fourth panel through block assignment after three panels finished does not reopen results', async () => {
  const thirdPanel = await createPanel({ name: 'Panel C', email: 'qa-late-c@evalsys.com', password, createdBy: instructor._id, mustChangePassword: false });
  await Section.updateOne({ _id: section._id }, { assignedPanels: [panel._id, secondPanel._id, thirdPanel._id] });
  clearResponseCache();

  await submit(panel, { quality: 8 }).expect(200);
  await submit(secondPanel, { quality: 6 }).expect(200);
  await submit(thirdPanel, { quality: 7 }).expect(200);

  let results = await api('get', '/api/evaluations/section/' + section._id + '/results').expect(200);
  assert.equal(results.body[0].isIncomplete, false);
  assert.equal(results.body[0].finalTotal, 7);
  assert.equal((await Group.findById(group._id)).gradingPanelIds.length, 3, 'the original three graders are frozen');

  // Exactly the reported case: a fourth panel is suddenly assigned to the block.
  const latePanel = await createPanel({ name: 'Panel D', email: 'qa-late-d@evalsys.com', password, createdBy: instructor._id, mustChangePassword: false });
  await api('post', '/api/sections/assign-blocks').send({ panelId: latePanel._id.toString(), sectionIds: [section._id.toString()] }).expect(200);

  results = await api('get', '/api/evaluations/section/' + section._id + '/results').expect(200);
  assert.equal(results.body[0].isIncomplete, false, 'completed grading must not reopen');
  assert.deepEqual(results.body[0].missingPanels, [], 'the new panel is not required');
  assert.equal(results.body[0].finalTotal, 7, 'the score stays computed over the original three panels');
  assert.equal(results.body[0].evaluatedBy.length, 3);

  const exported = await api('get', '/api/evaluations/export-all').expect(200);
  assert.equal(exported.body[0].Status, 'Complete');
  assert.equal(exported.body[0].AverageScore, 7);

  // Direct group-level assignment must not reopen the result either.
  await Group.updateOne({ _id: group._id }, { $addToSet: { assignedPanels: latePanel._id } });
  clearResponseCache();
  results = await api('get', '/api/evaluations/section/' + section._id + '/results').expect(200);
  assert.equal(results.body[0].isIncomplete, false);
  assert.equal(results.body[0].finalTotal, 7);

  // The late panel may still grade; only then does their score join the average.
  await submit(latePanel, { quality: 10 }).expect(200);
  results = await api('get', '/api/evaluations/section/' + section._id + '/results').expect(200);
  assert.equal(results.body[0].isIncomplete, false);
  assert.equal(results.body[0].evaluatedBy.length, 4);
  assert.equal(results.body[0].finalTotal, 7.75);
});

test('adding a panel while a group is still being graded does not make the new panel required', async () => {
  const thirdPanel = await createPanel({ name: 'Panel C', email: 'qa-mid-c@evalsys.com', password, createdBy: instructor._id, mustChangePassword: false });
  await Section.updateOne({ _id: section._id }, { assignedPanels: [panel._id, secondPanel._id, thirdPanel._id] });
  clearResponseCache();

  await submit(panel, { quality: 9 }).expect(200);
  let results = await api('get', '/api/evaluations/section/' + section._id + '/results').expect(200);
  assert.deepEqual(results.body[0].missingPanels, ['Panel B', 'Panel C']);
  assert.equal(results.body[0].finalTotal, 3);

  const latePanel = await createPanel({ name: 'Panel D', email: 'qa-mid-d@evalsys.com', password, createdBy: instructor._id, mustChangePassword: false });
  await api('post', '/api/sections/assign-blocks').send({ panelId: latePanel._id.toString(), sectionIds: [section._id.toString()] }).expect(200);

  results = await api('get', '/api/evaluations/section/' + section._id + '/results').expect(200);
  assert.deepEqual(results.body[0].missingPanels, ['Panel B', 'Panel C'], 'the added panel is not awaited');
  assert.equal(results.body[0].finalTotal, 3, 'the divisor stays at the three original panels');

  // When the original two finish, the group is complete without the added panel.
  await submit(secondPanel, { quality: 6 }).expect(200);
  await submit(thirdPanel, { quality: 3 }).expect(200);
  results = await api('get', '/api/evaluations/section/' + section._id + '/results').expect(200);
  assert.equal(results.body[0].isIncomplete, false);
  assert.deepEqual(results.body[0].missingPanels, []);
  assert.equal(results.body[0].finalTotal, 6);
});

test('unassigning a panel after they submitted keeps their evaluation and the computed result', async () => {
  await submit(panel, { quality: 8 }).expect(200);
  await submit(secondPanel, { quality: 10 }).expect(200);

  let results = await api('get', '/api/evaluations/section/' + section._id + '/results').expect(200);
  assert.equal(results.body[0].finalTotal, 9);
  assert.deepEqual(results.body[0].missingPanels, []);

  // The panel leaves: the instructor removes them from the block only.
  await Section.updateOne({ _id: section._id }, { assignedPanels: [panel._id] });
  clearResponseCache();

  results = await api('get', '/api/evaluations/section/' + section._id + '/results').expect(200);
  assert.equal(results.body[0].isIncomplete, false);
  assert.deepEqual(results.body[0].missingPanels, []);
  assert.equal(results.body[0].finalTotal, 9, 'a departed panel keeps their submitted score');
  assert.equal(results.body[0].evaluatedBy.length, 2);

  // Their evaluation record is never deleted or archived.
  const keptEvaluation = await Evaluation.findOne({ group: group._id, panel: secondPanel._id });
  assert.ok(keptEvaluation);
  assert.equal(keptEvaluation.isSubmitted, true);
  assert.equal(keptEvaluation.isLegacyArchived, false);

  const exported = await api('get', '/api/evaluations/export-all').expect(200);
  assert.equal(exported.body[0].Status, 'Complete');
  assert.equal(exported.body[0].AverageScore, 9);

  // Reassigning the same panel does not double count their single evaluation.
  await Section.updateOne({ _id: section._id }, { assignedPanels: [panel._id, secondPanel._id] });
  clearResponseCache();
  results = await api('get', '/api/evaluations/section/' + section._id + '/results').expect(200);
  assert.equal(results.body[0].finalTotal, 9);
});

test('unassigning a panel who never submitted removes them from the required roster', async () => {
  await submit(panel, { quality: 8 }).expect(200);

  let results = await api('get', '/api/evaluations/section/' + section._id + '/results').expect(200);
  assert.equal(results.body[0].isIncomplete, true);
  assert.deepEqual(results.body[0].missingPanels, ['Panel B']);
  assert.equal(results.body[0].finalTotal, 4, 'the pending panel still divides the average while assigned');

  // The panel leaves before grading, so the group is no longer waiting on them.
  await Section.updateOne({ _id: section._id }, { assignedPanels: [panel._id] });
  clearResponseCache();
  results = await api('get', '/api/evaluations/section/' + section._id + '/results').expect(200);
  assert.equal(results.body[0].isIncomplete, false);
  assert.deepEqual(results.body[0].missingPanels, []);
  assert.equal(results.body[0].finalTotal, 8);

  const exported = await api('get', '/api/evaluations/export-all').expect(200);
  assert.deepEqual(exported.body[0].MissingPanels, '');
});

test('removed panel loses grading access but keeps their submitted evaluation', async () => {
  await submit(panel, { quality: 8 }).expect(200);
  const own = await submit(secondPanel, { quality: 10 }).expect(200);
  const evaluationId = own.body._id;

  // Instructor unassigns the panel from the block through the Assign Panels screen.
  await api('post', '/api/sections/assign-blocks')
    .send({ panelId: secondPanel._id.toString(), sectionIds: [] })
    .expect(200);

  // They can no longer grade or see the workspace for that block.
  await submit(secondPanel, { quality: 5 }).expect(403);
  const panelGroups = await api('get', '/api/groups', secondPanel).expect(200);
  assert.deepEqual(panelGroups.body.filter(g => g._id === group._id.toString()), []);

  // Their existing evaluation is still readable by them and unchanged.
  const mine = await api('get', '/api/evaluations/group/' + group._id + '/mine', secondPanel).expect(200);
  assert.equal(mine.body._id, evaluationId);
  assert.equal(mine.body.total, 10);
  assert.equal(mine.body.scores.quality, 10);
  assert.equal(mine.body.isSubmitted, true);

  // Instructor results and exports still count the submitted score.
  const results = await api('get', '/api/evaluations/section/' + section._id + '/results').expect(200);
  assert.equal(results.body[0].isIncomplete, false);
  assert.deepEqual(results.body[0].missingPanels, []);
  assert.equal(results.body[0].finalTotal, 9);
  assert.equal(results.body[0].evaluatedBy.length, 2);

  const single = await api('get', '/api/evaluations/group/' + group._id + '/result').expect(200);
  assert.equal(single.body.finalTotal, 9);

  const exported = await api('get', '/api/evaluations/export-all').expect(200);
  assert.equal(exported.body[0].Status, 'Complete');
  assert.equal(exported.body[0].AverageScore, 9);
});

test('panel dashboard stays usable after another panel is added to the block', async () => {
  await submit(panel, { quality: 8 }).expect(200);

  const latePanel = await createPanel({ name: 'Panel D', email: 'qa-dash-d@evalsys.com', password, createdBy: instructor._id, mustChangePassword: false });
  await api('post', '/api/sections/assign-blocks')
    .send({ panelId: latePanel._id.toString(), sectionIds: [section._id.toString()] })
    .expect(200);

  // The original panel still sees the block and their own draft/submission.
  const groups = await api('get', '/api/groups', panel).expect(200);
  const row = groups.body.find(g => g._id === group._id.toString());
  assert.ok(row, 'assigned panel still lists the group');
  assert.equal(row.isGraded, true);

  const mine = await api('get', '/api/evaluations/group/' + group._id + '/mine', panel).expect(200);
  assert.equal(mine.body.total, 8);

  // The new panel sees the same block without inheriting the other panel's score.
  const lateGroups = await api('get', '/api/groups', latePanel).expect(200);
  assert.ok(lateGroups.body.some(g => g._id === group._id.toString()));
  const lateMine = await api('get', '/api/evaluations/group/' + group._id + '/mine', latePanel).expect(200);
  assert.equal(lateMine.body, null);
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
for (const actorRole of ['instructor', 'superadmin']) {
  test(`${actorRole} saves shared panel assignments through score retrieval and final export`, async () => {
    await Settings.updateOne({}, { sharedPanelsEnabled: true });
    await Section.updateOne({ _id: section._id }, { assignedPanels: [] });
    const actor = actorRole === 'superadmin' ? superadmin : instructor;
    const assign = judge => api('post', '/api/sections/assign-blocks', actor)
      .send({ panelId: String(judge._id), sectionIds: [String(section._id)] });

    await submit(outsider).expect(403);
    for (const judge of [panel, outsider]) {
      await assign(judge).expect(200);
      await assign(judge).expect(200); // Repeated saves must not duplicate assignments.
    }
    const blocks = await api('get', '/api/sections', actor).expect(200);
    assert.deepEqual(blocks.body[0].assignedPanels.map(judge => judge._id).sort(),
      [String(panel._id), String(outsider._id)].sort());
    const assignedGroups = await api('get', '/api/groups', outsider).expect(200);
    assert.ok(assignedGroups.body.some(item => item._id === String(group._id)));

    await submit(panel, { quality: 8 }).expect(200);
    const pending = await api('get', `/api/evaluations/section/${section._id}/results`, actor).expect(200);
    assert.equal(pending.body[0].isIncomplete, true);
    assert.deepEqual(pending.body[0].missingPanels, [outsider.name]);
    await submit(outsider, { quality: 10 }).expect(200);
    const saved = await api('get', `/api/evaluations/group/${group._id}/mine`, outsider).expect(200);
    assert.equal(saved.body.scores.quality, 10);
    assert.equal(saved.body.total, 10);
    await submit(outsider, { quality: 11 }).expect(400);
    const preserved = await api('get', `/api/evaluations/group/${group._id}/mine`, outsider).expect(200);
    assert.equal(preserved.body.total, 10);

    const results = await api('get', `/api/evaluations/section/${section._id}/results`, actor).expect(200);
    assert.equal(results.body[0].isIncomplete, false);
    assert.equal(results.body[0].finalTotal, 9);
    assert.deepEqual(results.body[0].missingPanels, []);
    const exported = await api('get', '/api/evaluations/export-all', actor).expect(200);
    assert.equal(exported.body[0].Status, 'Complete');
    assert.equal(exported.body[0].AverageScore, 9);
    await api('get', `/api/evaluations/section/${section._id}/results`, secondPanel).expect(403);
    await submit(secondPanel).expect(403);
  });
}

test('shared panels are opt-in, immediately reusable, and reversible without losing grades', async () => {
  const settings = await api('get', '/api/settings', superadmin).expect(200);
  assert.equal(settings.body.sharedPanelsEnabled, false);
  const assign = () => api('post', '/api/sections/assign-blocks').send({ panelId: outsider._id.toString(), sectionIds: [section._id.toString()] });
  await assign().expect(400);
  await api('patch', '/api/settings/system-controls', instructor).send({ sharedPanelsEnabled: true }).expect(403);
  await api('patch', '/api/settings/system-controls', superadmin).send({ sharedPanelsEnabled: 'true' }).expect(400);
  await api('patch', '/api/settings/system-controls', superadmin).send({ sharedPanelsEnabled: true }).expect(200);
  const directory = await api('get', '/api/users/assignable-panels').expect(200);
  assert.ok(directory.body.some(item => item._id === outsider._id.toString() && item.createdBy.name === otherInstructor.name));
  assert.ok(directory.body.every(item => !('password' in item) && !('sessionVersion' in item) && !('failedLoginAttempts' in item)));
  const accounts = await api('get', '/api/users').expect(200);
  assert.ok(!accounts.body.some(item => item._id === outsider._id.toString()));
  await submit(outsider).expect(403);
  await assign().expect(200);
  await assign().expect(200);
  assert.equal((await Section.findById(section._id)).assignedPanels.filter(id => String(id) === String(outsider._id)).length, 1);
  const groups = await api('get', '/api/groups', outsider).expect(200);
  assert.equal(groups.body[0]._id, String(group._id));
  assert.equal(groups.body[0].section.createdBy.name, instructor.name);
  await api('get', '/api/groups/' + group._id, outsider).expect(200);
  const active = await api('get', `/api/rubrics/active?groupId=${group._id}`, outsider).expect(200);
  assert.equal(active.body._id, String(rubric._id));
  await submit(outsider).expect(200);
  const rooms = (await api('get', '/api/chat/rooms', outsider).expect(200)).body.rooms;
  const sharedRoom = rooms.find(room => room.instructor._id === String(instructor._id));
  assert.ok(sharedRoom);
  await api('post', `/api/chat/rooms/${sharedRoom._id}/messages`, outsider).send(chatPayload('Shared panel message')).expect(201);
  await api('delete', '/api/users/' + outsider._id, instructor).expect(403);
  await api('delete', '/api/users/' + outsider._id, otherInstructor).expect(409);
  await api('patch', '/api/users/' + outsider._id + '/toggle', otherInstructor).expect(409);
  await api('patch', '/api/users/' + outsider._id + '/reset-password', otherInstructor).send({ newPassword: password }).expect(409);
  const unrelated = await Section.create({ name: 'Other', block: 'OTHER', subject: otherSubject._id, createdBy: otherInstructor._id });
  await api('post', '/api/sections/assign-blocks').send({ panelId: outsider._id.toString(), sectionIds: [unrelated._id.toString()] }).expect(400);
  await api('patch', '/api/settings/system-controls', superadmin).send({ sharedPanelsEnabled: false }).expect(200);
  await assign().expect(400);
  assert.deepEqual((await api('get', '/api/groups', outsider).expect(200)).body, []);
  await api('get', '/api/groups/' + group._id, outsider).expect(403);
  await submit(outsider).expect(403);
  await submit(panel).expect(200);
  await api('get', `/api/chat/rooms/${sharedRoom._id}/messages`, outsider).expect(403);
  assert.ok(await Evaluation.exists({ group: group._id, panel: outsider._id, total: 8 }));
  assert.ok((await Section.findById(section._id)).assignedPanels.some(id => String(id) === String(outsider._id)));
  await api('patch', '/api/settings/system-controls', superadmin).send({ sharedPanelsEnabled: true }).expect(200);
  await submit(outsider).expect(200);
  await api('post', '/api/sections/assign-blocks').send({ panelId: outsider._id.toString(), sectionIds: [] }).expect(200);
  await submit(outsider).expect(403);
  assert.ok(await Evaluation.exists({ group: group._id, panel: outsider._id }));
});

test('shared direct assignments isolate rubrics and locks between instructors of the same subject', async () => {
  await Settings.updateOne({}, { sharedPanelsEnabled: true });
  await Admin.updateOne({ _id: otherInstructor._id }, { $addToSet: { assignedSubjects: subject._id }, gradingLockedSubjects: [subject._id] });
  const otherSection = await Section.create({ name: 'Other', block: 'OTHER', subject: subject._id, createdBy: otherInstructor._id });
  const otherGroup = await Group.create({ name: 'Other group', section: otherSection._id, createdBy: otherInstructor._id });
  const otherRubric = await Rubric.create({ title: 'Other rubric', subject: subject._id, createdBy: otherInstructor._id, criteria: rubric.criteria.toObject() });
  await api('put', '/api/groups/' + otherGroup._id, otherInstructor).send({ assignedPanels: [panel._id.toString()] }).expect(200);
  const groups = await api('get', '/api/groups', panel).expect(200);
  assert.equal(groups.body.length, 2);
  await api('get', '/api/groups/' + otherGroup._id, panel).expect(200);
  const active = await api('get', `/api/rubrics/active?groupId=${otherGroup._id}`, panel).expect(200);
  assert.equal(active.body._id, String(otherRubric._id));
  const me = await api('get', '/api/auth/me', panel).expect(200);
  assert.deepEqual(me.body.gradingLockedWorkspaces, [`${otherInstructor._id}:${subject._id}`]);
  await submit(panel).expect(200);
  await api('post', '/api/evaluations/group/' + otherGroup._id, panel).send({ rubricId: String(otherRubric._id), scores: { quality: 7 } }).expect(403);
  await Admin.updateOne({ _id: otherInstructor._id }, { gradingLockedSubjects: [] });
  await api('post', '/api/evaluations/group/' + otherGroup._id, panel).send({ rubricId: String(rubric._id), scores: { quality: 7 } }).expect(400);
  await api('post', '/api/evaluations/group/' + otherGroup._id, panel).send({ rubricId: String(otherRubric._id), scores: { quality: 7 } }).expect(200);
  const hidden = await Group.create({ name: 'Unassigned', section: otherSection._id, createdBy: otherInstructor._id });
  await api('get', '/api/groups/' + hidden._id, panel).expect(403);
  assert.equal((await api('get', `/api/rubrics/active?groupId=${hidden._id}`, panel).expect(200)).body, null);
});
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
