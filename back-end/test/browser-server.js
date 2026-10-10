const path = require('node:path');
process.env.JWT_SECRET = 'qa-browser-isolated-secret';
process.env.MONGOMS_DOWNLOAD_DIR = path.join(__dirname, '..', 'node_modules', '.cache', 'mongodb-binaries');
process.env.DB_CACHE_TTL_MS = '0';
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const app = require('../src/app');
const Admin = require('../src/models/Admin');
const Panel = require('../src/models/Panel');
const Subject = require('../src/models/Subject');
const Section = require('../src/models/Section');
const Group = require('../src/models/Group');
const Rubric = require('../src/models/Rubric');
const RegistrationLink = require('../src/models/RegistrationLink');
const Settings = require('../src/models/Settings');
let mongo, server;
async function start() {
  mongo = await MongoMemoryServer.create({ instance: { dbName: 'evalsys_browser_qa_temporary' } });
  await mongoose.connect(mongo.getUri());
  const subjects = await Subject.create([{ code: 'QA101', title: 'Browser QA' }, { code: 'QA202', title: 'Second Browser Subject' }]);
  const superadmin = await Admin.create({ name: 'QA Super', email: 'qa-super@evalsys.com', password: 'QaPassword!2026', role: 'superadmin' });
  const instructor = await Admin.create({ name: 'QA Instructor', email: 'qa-instructor@evalsys.com', password: 'QaPassword!2026', role: 'admin', assignedSubjects: subjects.map(s => s._id), subjectLimit: 2 });
  const panels = await Panel.create([
    { name: 'Panel A', email: 'qa-panel-a@evalsys.com', password: 'QaPassword!2026', createdBy: instructor._id, mustChangePassword: false },
    { name: 'Panel B', email: 'qa-panel-b@evalsys.com', password: 'QaPassword!2026', createdBy: instructor._id, mustChangePassword: false },
    { name: 'Temporary Panel', email: 'qa-temp@evalsys.com', password: 'QaPassword!2026', createdBy: instructor._id, mustChangePassword: true },
  ]);
  const sections = await Section.create(subjects.map((subject, index) => ({ name: 'QA Block ' + index, block: index ? 'QA-B' : 'QA-A', subject: subject._id, createdBy: instructor._id, assignedPanels: panels.slice(0, 2).map(p => p._id) })));
  await Group.create([
    { name: 'QA Grade Group', section: sections[0]._id, createdBy: instructor._id, members: [{ firstName: 'Grade', lastName: 'Student' }] },
    { name: 'QA Draft Group', section: sections[0]._id, createdBy: instructor._id, members: [{ firstName: 'Draft', lastName: 'Student' }] },
    { name: 'QA Other Subject Group', section: sections[1]._id, createdBy: instructor._id, members: [{ firstName: 'Other', lastName: 'Student' }] },
  ]);
  await Rubric.create(subjects.map(subject => ({ title: 'QA Rubric', subject: subject._id, createdBy: instructor._id, criteria: [{ key: 'quality', label: 'Quality', maxScore: 10, levels: [{ label: 'Score', minScore: 0, maxScore: 10 }] }] })));
  await RegistrationLink.create({ token: 'qa-browser-registration', subject: subjects[0]._id, sections: [sections[0]._id], createdBy: instructor._id, expiresAt: new Date(Date.now() + 3600000) });
  await Settings.create({});
  server = app.listen(5101, '127.0.0.1', () => console.log('Isolated browser QA API ready'));
}
async function stop() {
  if (server) await new Promise(resolve => server.close(resolve));
  await mongoose.disconnect(); if (mongo) await mongo.stop(); process.exit(0);
}
process.on('SIGTERM', stop); process.on('SIGINT', stop);
start().catch(async error => { console.error('Browser QA setup failed:', error.message); await mongoose.disconnect(); if (mongo) await mongo.stop(); process.exit(1); });
