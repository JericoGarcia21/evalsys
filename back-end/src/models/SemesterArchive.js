const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  instructor: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
  semester: { type: String, required: true, maxlength: 100 },
  archivedAt: { type: Date, required: true },
  // Independent snapshots remain readable after source accounts/rubrics are edited or deleted.
  snapshot: { type: mongoose.Schema.Types.Mixed, required: true },
}, { timestamps: true });
schema.index({ instructor: 1, subject: 1, archivedAt: -1, _id: -1 });
module.exports = mongoose.model('SemesterArchive', schema);
