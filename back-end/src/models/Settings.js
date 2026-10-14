const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  isGradingLocked: { type: Boolean, default: false },
  isCsvExportLocked: { type: Boolean, default: false },
  isMaintenanceMode: { type: Boolean, default: false },
  maintenanceStartsAt: { type: Date, default: null },
  maintenanceEndsAt: { type: Date, default: null },
  maintenanceMessage: {
    type: String,
    default: 'EvalSys is temporarily unavailable while maintenance is in progress.',
    trim: true,
  },
  announcement: {
    isActive: { type: Boolean, default: false },
    title: { type: String, default: '', trim: true },
    message: { type: String, default: '', trim: true },
    updatedAt: { type: Date },
  },
}, { timestamps: true });

module.exports = mongoose.model('Settings', settingsSchema);
