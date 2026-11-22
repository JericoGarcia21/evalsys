const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');
process.env.JWT_SECRET = 'isolated-account-control-qa';
process.env.MONGOMS_DOWNLOAD_DIR = path.join(__dirname, '..', 'node_modules', '.cache', 'mongodb-binaries');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
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
const SemesterArchive = require('../src/models/SemesterArchive');
const RegistrationLink = require('../src/models/RegistrationLink');
const Settings = require('../src/models/Settings');
const AuthSession = require('../src/models/AuthSession');
const AuditLog = require('../src/models/AuditLog');
const ChatRoom = require('../src/models/ChatRoom');
const ChatMessage = require('../src/models/ChatMessage');
const { issueSession } = require('../src/services/session.service');
const { clearResponseCache } = require('../src/middleware/cache.middleware');
let mongo, hash, owner, source, target, panel, subject, section, group, rubric, link, room;
let ownerToken, sourceToken, targetToken, panelToken;
const password = 'AccountQa!2026';
const fakeReq = { ip: '127.0.0.1', headers: { 'user-agent': 'Isolated QA browser' } };
const api = (method, route, token = ownerToken) => {
  const req = request(app)[method]('/api' + route);
  return token ? req.set('Authorization', 'Bearer ' + token) : req;
};
const login = async (email, pass = password) => (await request(app).post('/api/auth/login').send({ email, password: pass }).expect(200)).body.token;
const transferBody = () => ({ sourceId: String(source._id), targetId: String(target._id), subjectIds: [String(subject._id)], confirmText: 'TRANSFER' });
const readyTransfer = async () => {
  await api('patch', `/account-control/instructors/${source._id}/status`).send({ isActive: false, confirmText: 'DEACTIVATE' }).expect(200);
  await Settings.updateOne({}, { isMaintenanceMode: true }); clearResponseCache();
};

before(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(mongo.getUri());
  hash = await bcrypt.hash(password, 4);
  await Promise.all(Object.values(mongoose.models).map(model => model.init()));
});
after(async () => { await mongoose.disconnect(); if (mongo) await mongo.stop(); });
beforeEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map(collection => collection.deleteMany({})));
  clearResponseCache();
  subject = await Subject.create({ code: 'MOVE101', title: 'Transfer QA' });
  [owner, source, target] = await Admin.insertMany([
    { name: 'Control Super', email: 'control-super@evalsys.com', role: 'superadmin', password: hash },
    { name: 'Source Instructor', email: 'control-source@evalsys.com', role: 'admin', password: hash, assignedSubjects: [subject._id] },
    { name: 'Target Instructor', email: 'control-target@evalsys.com', role: 'admin', password: hash, subjectLimit: 3 },
  ]);
  await Subject.updateOne({ _id: subject._id }, { createdBy: source._id });
  [panel] = await Panel.insertMany([{ name: 'Control Panel', email: 'control-panel@evalsys.com', password: hash, createdBy: source._id, mustChangePassword: false }]);
  section = await Section.create({ name: 'Move Block', block: 'MOVE-A', subject: subject._id, createdBy: source._id, assignedPanels: [panel._id] });
  group = await Group.create({ name: 'Move Group', section: section._id, createdBy: source._id, assignedPanels: [panel._id], gradingPanelIds: [panel._id], members: [{ firstName: 'Keep', lastName: 'Student' }] });
  group.proposalFile = { path: `${source._id}/${subject._id}/${group._id}/original.pdf`, originalName: 'original.pdf', mimeType: 'application/pdf', size: 100 };
  await group.save();
  rubric = await Rubric.create({ title: 'Keep Rubric', subject: subject._id, createdBy: source._id, criteria: [{ key: 'quality', label: 'Quality', maxScore: 10, levels: [{ label: 'Score', minScore: 0, maxScore: 10 }] }] });
  await Evaluation.create({ group: group._id, panel: panel._id, rubric: rubric._id, subject: subject._id, scores: { quality: 8 }, comments: 'Keep feedback', isSubmitted: true });
  link = await RegistrationLink.create({ createdBy: source._id, subject: subject._id, sections: [section._id], expiresAt: new Date(Date.now() + 86400000) });
  room = await ChatRoom.create({ instructor: source._id, subject: subject._id });
  await ChatMessage.create({ room: room._id, sender: { id: source._id, role: 'admin', name: source.name }, body: 'Keep chat history', clientMessageId: 'control-history' });
  await Settings.create({});
  [ownerToken, sourceToken, targetToken, panelToken] = await Promise.all([owner, source, target, panel].map(user => issueSession(user, fakeReq)));
});

const archiveSemester = (token = sourceToken, body = {}) => api('post', '/evaluations/archive-semester', token)
  .set('x-subject-id', String(subject._id)).send({ semester: 'First Semester AY 2026–2027', confirmText: `ARCHIVE ${subject.code}`, ...body });

test('semester archive preserves results and rubrics while keeping blocks ready for new groups', async () => {
  const ungraded = await Group.create({ name: 'Not yet graded', section: section._id, createdBy: source._id, members: ['New Student'] });
  const response = await archiveSemester().expect(200);
  assert.equal(response.body.archivedGroups, 2);
  assert.equal(response.body.archivedResults, 1);
  assert.equal(await Group.countDocuments({ createdBy: source._id }), 0);
  assert.deepEqual((await Section.findById(section._id)).assignedPanels.map(String), [String(panel._id)]);
  assert.ok(await Subject.exists({ _id: subject._id }));
  assert.ok(await Rubric.exists({ _id: rubric._id }));
  assert.equal((await RegistrationLink.findById(link._id)).isActive, false);
  assert.equal((await Evaluation.findOne({ group: group._id })).isLegacyArchived, true);
  const archive = await api('get', '/evaluations/my-archive', sourceToken).expect(200);
  assert.equal(archive.body.pagination.total, 2);
  const graded = archive.body.items.find(item => item.snapshot.group.name === group.name);
  assert.equal(graded.snapshot.finalTotal, 8);
  assert.equal(graded.snapshot.status, 'Complete');
  assert.equal(graded.snapshot.evaluations[0].scores.quality, 8);
  assert.equal(graded.snapshot.evaluations[0].comments, 'Keep feedback');
  assert.equal(graded.snapshot.evaluations[0].rubric.criteria[0].maxScore, 10);
  assert.equal(archive.body.items.find(item => item.snapshot.group.name === ungraded.name).snapshot.status, 'Not graded');
  await Rubric.updateOne({ _id: rubric._id }, { title: 'Changed next semester' });
  await Panel.deleteOne({ _id: panel._id });
  const retained = await api('get', '/evaluations/my-archive', sourceToken).expect(200);
  assert.equal(retained.body.items.find(item => item._id === graded._id).snapshot.evaluations[0].rubric.title, 'Keep Rubric');
  const fresh = await Group.create({ name: 'Next semester group', section: section._id, createdBy: source._id });
  assert.ok(fresh);
  const activeResults = await api('get', `/evaluations/section/${section._id}/results`, sourceToken).set('x-subject-id', String(subject._id)).expect(200);
  assert.equal(activeResults.body.length, 1);
  assert.equal(activeResults.body[0].finalTotal, null);
});

test('semester archive enforces role, ownership, confirmation and label before any changes', async () => {
  await archiveSemester(null).expect(401);
  for (const token of [ownerToken, panelToken, targetToken]) await archiveSemester(token).expect(403);
  for (const semester of ['', ' ', 12, 'x'.repeat(101)]) await archiveSemester(sourceToken, { semester }).expect(400);
  await archiveSemester(sourceToken, { confirmText: 'WRONG' }).expect(400);
  assert.equal(await Group.countDocuments({ _id: group._id }), 1);
  assert.equal(await SemesterArchive.countDocuments(), 0);
  for (const token of [ownerToken, panelToken]) await api('get', '/evaluations/my-archive', token).expect(403);
});

test('semester archives isolate instructors and retain access after subject reassignment', async () => {
  await archiveSemester().expect(200);
  const unrelated = await api('get', '/evaluations/my-archive', targetToken).set('x-instructor-id', String(source._id)).query({ subject: String(subject._id) }).expect(200);
  assert.deepEqual(unrelated.body.items, []);
  await Admin.updateOne({ _id: source._id }, { assignedSubjects: [] });
  const retained = await api('get', '/evaluations/my-archive', sourceToken).expect(200);
  assert.equal(retained.body.pagination.total, 1);
  await archiveSemester().expect(403);
});

test('semester archive keeps incomplete results pending and concurrent retries do not duplicate history', async () => {
  const extra = await Panel.create({ name: 'Missing judge', email: 'missing@qa.test', password: hash, createdBy: source._id });
  await Section.updateOne({ _id: section._id }, { $addToSet: { assignedPanels: extra._id } });
  await Group.updateOne({ _id: group._id }, { gradingPanelIds: [panel._id, extra._id] });
  const responses = await Promise.all([archiveSemester(), archiveSemester()]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  assert.equal(await SemesterArchive.countDocuments(), 1);
  const snapshot = (await SemesterArchive.findOne()).snapshot;
  assert.equal(snapshot.status, 'Incomplete');
  assert.equal(snapshot.finalTotal, null);
  assert.deepEqual(snapshot.missingPanels, ['Missing judge']);
  await archiveSemester().expect(409);
});

test('in-flight panel submission cannot create a lost grade after semester archival', async () => {
  let entered, release;
  const atFence = new Promise(resolve => { entered = resolve; });
  const proceed = new Promise(resolve => { release = resolve; });
  const original = Group.updateOne;
  Group.updateOne = async function (...args) {
    if (args[1]?.$inc?.gradingRevision) { entered(); await proceed; }
    return original.apply(this, args);
  };
  const scoring = api('post', `/evaluations/group/${group._id}`, panelToken)
    .send({ rubricId: String(rubric._id), scores: { quality: 10 } }).then(response => response);
  try {
    await atFence;
    await archiveSemester().expect(200);
    release();
    assert.equal((await scoring).status, 404);
    assert.equal((await SemesterArchive.findOne()).snapshot.finalTotal, 8);
    assert.equal(await Evaluation.countDocuments({ isLegacyArchived: { $ne: true } }), 0);
  } finally { release(); Group.updateOne = original; await scoring; }
});

test('semester archive rolls back snapshots, group removal and links when audit fails', async () => {
  const original = AuditLog.create;
  AuditLog.create = async () => { throw new Error('QA audit failure'); };
  try { await archiveSemester().expect(500); } finally { AuditLog.create = original; }
  assert.equal(await SemesterArchive.countDocuments(), 0);
  assert.ok(await Group.exists({ _id: group._id }));
  assert.equal((await Evaluation.findOne({ group: group._id })).isLegacyArchived, false);
  assert.equal((await RegistrationLink.findById(link._id)).isActive, true);
});

test('account controls reject unauthenticated, instructor and panel requests', async () => {
  for (const token of [null, sourceToken, panelToken]) {
    const expected = token ? 403 : 401;
    await api('get', `/account-control/accounts/${source._id}/sessions`, token).expect(expected);
    await api('get', `/account-control/instructors/${source._id}/offboarding`, token).expect(expected);
    await api('post', '/account-control/password-resets', token).send({}).expect(expected);
    await api('post', '/account-control/transfers/preview', token).send(transferBody()).expect(expected);
    await api('patch', `/account-control/instructors/${source._id}/status`, token).send({}).expect(expected);
  }
});

test('tracked login sessions list no tokens, are bound to accounts and revoke individually', async () => {
  const first = await login(source.email);
  const second = await login(source.email);
  const sid = jwt.decode(first).sid;
  const listed = await api('get', `/account-control/accounts/${source._id}/sessions`).expect(200);
  assert.equal(listed.headers['cache-control'], 'no-store');
  assert.equal(listed.body.total, 3);
  assert.equal(listed.body.sessions[0].token, undefined);
  assert.equal(listed.body.sessions[0].user, undefined);
  await api('post', `/account-control/accounts/${target._id}/sessions/${sid}/revoke`).send({ confirmText: 'SIGN OUT' }).expect(404);
  await api('post', `/account-control/accounts/${source._id}/sessions/${sid}/revoke`).send({ confirmText: 'wrong' }).expect(400);
  await api('post', `/account-control/accounts/${source._id}/sessions/${sid}/revoke`).send({ confirmText: 'SIGN OUT' }).expect(200);
  await api('get', '/auth/me', first).expect(401);
  await api('get', '/auth/me', second).expect(200);
  assert.equal(await AuditLog.countDocuments({ action: 'session.revoke' }), 1);
});

test('revoke-all and deactivation invalidate cached responses and reactivation never restores tokens', async () => {
  await api('get', '/users', sourceToken).expect(200);
  await api('post', `/account-control/accounts/${source._id}/revoke-sessions`).send({ confirmText: 'SIGN OUT' }).expect(200);
  await api('get', '/users', sourceToken).expect(401);
  sourceToken = await login(source.email);
  await api('patch', `/account-control/instructors/${source._id}/status`).send({ isActive: false, confirmText: 'DEACTIVATE' }).expect(200);
  await api('get', '/auth/me', sourceToken).expect(401);
  await api('patch', `/account-control/instructors/${source._id}/status`).send({ isActive: false, confirmText: 'DEACTIVATE' }).expect(200);
  await api('patch', `/account-control/instructors/${source._id}/status`).send({ isActive: true, confirmText: 'ACTIVATE' }).expect(200);
  await api('get', '/auth/me', sourceToken).expect(401);
  await api('get', '/auth/me', await login(source.email)).expect(200);
  assert.equal(await Group.countDocuments({}), 1);
});

test('expired/untracked/tampered sessions are rejected and logout works during password rotation', async () => {
  const legacy = jwt.sign({ id: source._id, role: source.role }, process.env.JWT_SECRET);
  await api('get', '/auth/me', legacy).expect(401);
  await AuthSession.updateOne({ _id: jwt.decode(sourceToken).sid }, { expiresAt: new Date(Date.now() - 1000) });
  await api('get', '/auth/me', sourceToken).expect(401);
  const foreign = jwt.sign({ id: target._id, role: target.role, sv: 0, sid: jwt.decode(panelToken).sid }, process.env.JWT_SECRET);
  await api('get', '/auth/me', foreign).expect(401);
  await Panel.updateOne({ _id: panel._id }, { mustChangePassword: true });
  await Settings.updateOne({}, { isMaintenanceMode: true });
  await api('post', '/auth/logout', panelToken).expect(200);
  await api('get', '/auth/me', panelToken).expect(401);
});

test('password changes replace the current token and invalidate older sessions, including administrative resets', async () => {
  const old = sourceToken;
  const changed = await api('patch', '/auth/my-password', sourceToken).send({ currentPassword: password, newPassword: 'NewControl!2026' }).expect(200);
  await api('get', '/auth/me', old).expect(401);
  await api('get', '/auth/me', changed.body.token).expect(200);
  await api('patch', `/users/${source._id}/reset-password`).send({ newPassword: 'ResetControl!2026' }).expect(200);
  await api('get', '/auth/me', changed.body.token).expect(401);
  const temporary = await login(source.email, 'ResetControl!2026');
  await api('get', '/users', temporary).expect(403);
  const rotated = await api('patch', '/auth/change-password', temporary).send({ newPassword: 'FinalControl!2026' }).expect(200);
  await api('get', '/users', rotated.body.token).expect(200);
  await api('get', '/auth/me', temporary).expect(401);
});

test('offboarding is computed, validates instructor status and records archive review without deleting records', async () => {
  const initial = await api('get', `/account-control/instructors/${source._id}/offboarding`).expect(200);
  assert.equal(initial.body.counts.groups, 1);
  assert.equal(initial.body.counts.panels, 1);
  assert.equal(initial.body.checklist[0].complete, false);
  await api('patch', `/account-control/instructors/${source._id}/status`).send({ isActive: 'false', confirmText: 'DEACTIVATE' }).expect(400);
  await api('patch', `/account-control/instructors/${owner._id}/status`).send({ isActive: false, confirmText: 'DEACTIVATE' }).expect(404);
  await api('post', `/account-control/instructors/${source._id}/offboarding-review`).send({ confirmText: 'REVIEW ARCHIVE' }).expect(200);
  const reviewed = await api('get', `/account-control/instructors/${source._id}/offboarding`).expect(200);
  assert.equal(reviewed.body.checklist.at(-1).complete, true);
  assert.ok(reviewed.body.reviewedAt);
  assert.equal(await Evaluation.countDocuments(), 1);
  assert.equal(await AuditLog.countDocuments({ action: 'instructor.offboarding.review' }), 1);
});

test('bulk instructor reset generates unique private credentials atomically and requires rotation', async () => {
  const response = await api('post', '/account-control/password-resets').send({ instructorIds: [String(source._id), String(target._id)], confirmText: 'RESET PASSWORDS' }).expect(200);
  assert.equal(response.headers['cache-control'], 'no-store');
  const credentials = response.body.passwords;
  assert.equal(credentials.length, 2);
  assert.notEqual(credentials[0].temporaryPassword, credentials[1].temporaryPassword);
  for (const item of credentials) {
    assert.ok(item.temporaryPassword.length >= 20);
    const token = await login(item.email, item.temporaryPassword);
    await api('get', '/users', token).expect(403);
    const user = await Admin.findById(item._id);
    assert.notEqual(user.password, item.temporaryPassword);
    const audit = JSON.stringify(await AuditLog.find().lean());
    assert.ok(!audit.includes(item.temporaryPassword));
    assert.ok(!audit.includes(user.password));
  }
  await api('get', '/auth/me', sourceToken).expect(401);
  assert.equal(await AuditLog.countDocuments({ action: 'instructor.password.bulk_reset' }), 1);
});

test('bulk reset rejects malformed/missing/non-instructor IDs without changing any password', async () => {
  const before = (await Admin.findById(source._id)).password;
  for (const ids of [[], ['bad'], [String(source._id), String(source._id)], [String(source._id), String(panel._id)], [String(owner._id)], Array.from({ length: 21 }, () => String(new mongoose.Types.ObjectId()))]) {
    const response = await api('post', '/account-control/password-resets').send({ instructorIds: ids, confirmText: 'RESET PASSWORDS' });
    assert.ok([400, 404].includes(response.status));
  }
  assert.equal((await Admin.findById(source._id)).password, before);
  await api('get', '/auth/me', sourceToken).expect(200);
});

test('transactional reset and transfer roll back if their audit record cannot be written', async () => {
  await readyTransfer();
  const original = AuditLog.create;
  AuditLog.create = async () => { throw new Error('QA audit failure'); };
  try {
    await api('post', '/account-control/password-resets').send({ instructorIds: [String(target._id)], confirmText: 'RESET PASSWORDS' }).expect(500);
    await api('post', '/account-control/transfers').send(transferBody()).expect(500);
  } finally { AuditLog.create = original; }
  assert.equal((await Admin.findById(target._id)).password, hash);
  assert.equal(String((await Group.findById(group._id)).createdBy), String(source._id));
  assert.equal(String((await Panel.findById(panel._id)).createdBy), String(source._id));
  assert.equal((await Group.findById(group._id)).proposalFile.storageOwner, undefined);
  assert.equal((await Admin.findById(target._id)).assignedSubjects.length, 0);
});

test('transfer preview and execute enforce maintenance, inactive source, destination quota and conflicts', async () => {
  await api('post', '/account-control/transfers/preview').send(transferBody()).expect(409);
  await api('patch', `/account-control/instructors/${source._id}/status`).send({ isActive: false, confirmText: 'DEACTIVATE' }).expect(200);
  await api('post', '/account-control/transfers/preview').send(transferBody()).expect(409);
  await Settings.updateOne({}, { isMaintenanceMode: true });
  await Admin.updateOne({ _id: target._id }, { assignedSubjects: [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()] });
  await api('post', '/account-control/transfers/preview').send(transferBody()).expect(409);
  await Admin.updateOne({ _id: target._id }, { assignedSubjects: [] });
  await ChatRoom.create({ instructor: target._id, subject: subject._id });
  await api('post', '/account-control/transfers/preview').send(transferBody()).expect(409);
  await ChatRoom.deleteOne({ instructor: target._id });
  const preview = await api('post', '/account-control/transfers/preview').send(transferBody()).expect(200);
  assert.equal(preview.body.counts.proposalFiles, 1);
  await api('post', '/account-control/transfers').send({ ...transferBody(), confirmText: 'wrong' }).expect(400);
  await Admin.updateOne({ _id: target._id }, { isActive: false });
  await api('post', '/account-control/transfers').send(transferBody()).expect(409);
  assert.equal(String((await Group.findById(group._id)).createdBy), String(source._id));
});

test('shared panels outside the subject selection block transfers instead of losing access', async () => {
  await readyTransfer();
  const other = await Subject.create({ code: 'MOVE202', title: 'Shared panel subject' });
  await Admin.updateOne({ _id: source._id }, { $push: { assignedSubjects: other._id } });
  await Section.create({ name: 'Other block', block: 'OTHER', subject: other._id, createdBy: source._id, assignedPanels: [panel._id] });
  const blocked = await api('post', '/account-control/transfers').send(transferBody()).expect(409);
  assert.match(blocked.body.message, /outside the selected/);
  await api('post', '/account-control/transfers/preview').send({ ...transferBody(), subjectIds: [String(subject._id), String(other._id)] }).expect(200);
});

test('transfer rejects malformed input and inconsistent file, block, panel, rubric and link references', async () => {
  await readyTransfer();
  for (const body of [{}, { ...transferBody(), subjectIds: [] }, { ...transferBody(), sourceId: {} }, { ...transferBody(), subjectIds: [String(new mongoose.Types.ObjectId())] }, { ...transferBody(), targetId: String(panel._id) }]) {
    const response = await api('post', '/account-control/transfers').send({ ...body, confirmText: 'TRANSFER' });
    assert.ok([400, 404, 409].includes(response.status));
  }
  await Group.updateOne({ _id: group._id }, { 'proposalFile.path': 'unrelated/file.pdf' });
  await api('post', '/account-control/transfers').send(transferBody()).expect(409);
  await Group.updateOne({ _id: group._id }, { 'proposalFile.path': group.proposalFile.path });
  await Panel.updateOne({ _id: panel._id }, { createdBy: target._id });
  await api('post', '/account-control/transfers').send(transferBody()).expect(409);
  await Panel.updateOne({ _id: panel._id }, { createdBy: source._id });
  await Rubric.updateOne({ _id: rubric._id }, { createdBy: target._id });
  await api('post', '/account-control/transfers').send(transferBody()).expect(409);
  await Rubric.updateOne({ _id: rubric._id }, { createdBy: source._id });
  await RegistrationLink.updateOne({ _id: link._id }, { sections: [new mongoose.Types.ObjectId()] });
  await api('post', '/account-control/transfers').send(transferBody()).expect(409);
  assert.equal(String((await Group.findById(group._id)).createdBy), String(source._id));
  assert.equal(await AuditLog.countDocuments({ action: 'instructor.ownership.transfer' }), 0);
});

test('transfer refuses source groups placed in another instructor’s blocks of the selected subject', async () => {
  await readyTransfer();
  const foreignBlock = await Section.create({ name: 'Foreign block', block: 'FOREIGN', subject: subject._id, createdBy: target._id });
  await Group.create({ name: 'Misowned group', section: foreignBlock._id, createdBy: source._id });
  // The source itself cannot safely be transferred even if target is a third instructor.
  const [third] = await Admin.insertMany([{ name: 'Third', email: 'control-third@evalsys.com', password: hash, subjectLimit: 3 }]);
  const response = await api('post', '/account-control/transfers').send({ ...transferBody(), targetId: String(third._id) }).expect(409);
  assert.match(response.body.message, /groups in another/);
  assert.equal(String((await Group.findById(group._id)).createdBy), String(source._id));
});

test('transfer preserves grade/file/chat/link identity and grants only the destination workspace', async () => {
  await Admin.updateOne({ _id: source._id }, { gradingLockedSubjects: [subject._id] });
  await readyTransfer();
  const evaluationBefore = (await Evaluation.findOne().lean());
  const moved = await api('post', '/account-control/transfers').send(transferBody()).expect(200);
  assert.equal(moved.body.counts.groups, 1);
  const current = await Group.findById(group._id);
  assert.equal(String(current.createdBy), String(target._id));
  assert.equal(current.proposalFile.path, group.proposalFile.path);
  assert.equal(String(current.proposalFile.storageOwner), String(source._id));
  assert.deepEqual(current.members.toObject(), group.members.toObject());
  assert.equal(String((await Panel.findById(panel._id)).createdBy), String(target._id));
  assert.equal(String((await Rubric.findById(rubric._id)).createdBy), String(target._id));
  assert.equal(String((await RegistrationLink.findById(link._id)).createdBy), String(target._id));
  assert.equal(String((await ChatRoom.findById(room._id)).instructor), String(target._id));
  assert.deepEqual(await Evaluation.findOne().lean(), evaluationBefore);
  assert.equal((await ChatMessage.findOne()).body, 'Keep chat history');
  assert.equal((await Admin.findById(source._id)).assignedSubjects.length, 0);
  assert.equal(String((await Admin.findById(target._id)).gradingLockedSubjects[0]), String(subject._id));
  await api('get', '/auth/me', panelToken).expect(401);
  await api('get', '/auth/me', targetToken).expect(401);
  await api('post', '/account-control/transfers').send(transferBody()).expect(409);
  assert.equal(await AuditLog.countDocuments({ action: 'instructor.ownership.transfer' }), 1);
  await Settings.updateOne({}, { isMaintenanceMode: false }); clearResponseCache();
  targetToken = await login(target.email); panelToken = await login(panel.email);
  const results = await api('get', `/evaluations/section/${section._id}/results`, targetToken).set('x-subject-id', String(subject._id)).expect(200);
  assert.equal(results.body[0].finalTotal, 8);
  await api('get', `/chat/rooms/${room._id}/messages`, targetToken).expect(200);
  const publicLink = await request(app).get('/api/registration-links/public/' + link.token).expect(200);
  assert.ok(publicLink.body);
  // A local fake storage adapter proves preserved paths remain readable, without live Supabase.
  const storage = http.createServer((req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ signedURL: '/object/sign/original-file?token=qa' })); });
  await new Promise(resolve => storage.listen(0, '127.0.0.1', resolve));
  const oldUrl = process.env.SUPABASE_URL, oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = `http://127.0.0.1:${storage.address().port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'local-test-adapter';
  try {
    const file = await api('get', `/groups/${group._id}/proposal-url`, targetToken).set('x-subject-id', String(subject._id)).expect(200);
    assert.match(file.body.url, /original-file/);
    await api('get', `/groups/${group._id}/proposal-url`, panelToken).expect(200);
  } finally {
    if (oldUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
    await new Promise(resolve => storage.close(resolve));
  }
});
