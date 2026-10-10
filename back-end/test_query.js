require('dotenv').config();
const mongoose = require('mongoose');
const Section = require('./src/models/Section');
const Group = require('./src/models/Group');
const Panel = require('./src/models/Panel');

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const panel = await Panel.findOne({ email: 'lance@gmail.com' });
  if (!panel) { console.log('Panel not found'); return process.exit(); }
  console.log('Panel ID:', panel._id);

  const assignedSections = await Section.find({ assignedPanels: panel._id });
  console.log('Assigned Sections:', assignedSections.map(s => s.block));

  const sectionIds = assignedSections.map(s => s._id);
  const groups = await Group.find({
    $or: [
      { section: { $in: sectionIds } },
      { assignedPanels: panel._id }
    ]
  }).populate('section', 'name block');

  console.log('Groups returned by query:', groups.length);
  console.log(groups.map(g => ({ name: g.name, sectionId: g.section ? g.section._id : 'null' })));
  process.exit();
}).catch(console.error);
