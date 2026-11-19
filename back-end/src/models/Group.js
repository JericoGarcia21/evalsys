const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  section: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', index: true },
  // Supports old string members and new structured name objects.
  members: [{ type: mongoose.Schema.Types.Mixed }],
  assignedPanels: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Panel' }],
  // Panels that were expected to grade this group when grading started.
  // Adding a panel later must not force already-submitted groups to be re-graded.
  gradingPanelIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Panel' }],
  proposalFile: {
    path: { type: String },
    originalName: { type: String },
    mimeType: { type: String },
    size: { type: Number },
    uploadedAt: { type: Date },
  },
}, { timestamps: true });


groupSchema.index({ section: 1, createdBy: 1 });
groupSchema.index({ createdBy: 1, createdAt: -1 });
module.exports = mongoose.model('Group', groupSchema);
