const mongoose = require('mongoose');

const evaluationSchema = new mongoose.Schema({
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  panel: { type: mongoose.Schema.Types.ObjectId, ref: 'Panel', required: true },
  rubric: { type: mongoose.Schema.Types.ObjectId, ref: 'Rubric' },
  subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', index: true },
  scores: {
    type: Map,
    of: Number,
    required: true,
  },
  total: { type: Number }, // auto-computed
  comments: { type: String, default: '' },
  isSubmitted: { type: Boolean, default: false },
  isLegacyArchived: { type: Boolean, default: false, index: true },
  legacyArchivedAt: { type: Date },
  legacySnapshot: {
    groupName: { type: String },
    block: { type: String },
    subject: { type: String },
    panelName: { type: String },
    panelEmail: { type: String },
    instructorName: { type: String },
    instructorEmail: { type: String },
    members: [{ type: mongoose.Schema.Types.Mixed }],
  },
}, { timestamps: true });

// Auto-compute total before saving
evaluationSchema.pre('save', function (next) {
  let sum = 0;
  for (const val of this.scores.values()) {
    sum += val;
  }
  this.total = Math.round(sum * 100) / 100;
  next();
});

// One evaluation per panel per group
evaluationSchema.index({ group: 1, panel: 1 }, { unique: true });
evaluationSchema.index({ group: 1, isSubmitted: 1, isLegacyArchived: 1 });
evaluationSchema.index({ subject: 1, isSubmitted: 1, isLegacyArchived: 1 });
evaluationSchema.index({ isSubmitted: 1, isLegacyArchived: 1, updatedAt: -1 });

module.exports = mongoose.model('Evaluation', evaluationSchema);
