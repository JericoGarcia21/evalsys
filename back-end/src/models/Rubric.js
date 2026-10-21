const mongoose = require('mongoose');

const levelSchema = new mongoose.Schema({
  label: { type: String, required: true },      // e.g. "Excellent"
  minScore: { type: Number, required: true },
  maxScore: { type: Number, required: true },
  description: { type: String, default: '' },
  percentage: { type: Number, min: 0, max: 100 },
}, { _id: false });

const criteriaSchema = new mongoose.Schema({
  key: { type: String, required: true },         // e.g. "systemFunctionality"
  label: { type: String, required: true },       // e.g. "System Functionality"
  section: { type: String, default: '' },
  description: { type: String, default: '' },
  scoringMode: { type: String, enum: ['range', 'percentage'], default: 'range' },
  maxScore: { type: Number, required: true },
  levels: [levelSchema],
}, { _id: false });

const rubricSchema = new mongoose.Schema({
  title: { type: String, required: true, default: 'Default Rubric' },
  instructions: { type: String, default: '' },
  subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', index: true },
  criteria: [criteriaSchema],
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

rubricSchema.index({ subject: 1, createdBy: 1, isActive: 1 });

module.exports = mongoose.model('Rubric', rubricSchema);
