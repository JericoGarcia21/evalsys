const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 60 },
  nameKey: { type: String, required: true, unique: true },
  message: { type: String, required: true, trim: true, maxlength: 250 },
  delayMinutes: { type: Number, enum: [0, 5, 15, 30], required: true },
  durationMinutes: { type: Number, default: null, min: 1, max: 10080 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
}, { timestamps: true });
module.exports = mongoose.model('MaintenancePreset', schema);
