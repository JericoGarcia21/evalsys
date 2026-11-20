const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  role: { type: String, enum: ['superadmin', 'admin', 'panel'], required: true },
  version: { type: Number, required: true },
  ip: { type: String },
  userAgent: { type: String, maxlength: 500 },
  lastSeenAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null },
}, { timestamps: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
schema.index({ user: 1, version: 1, revokedAt: 1, expiresAt: 1 });
module.exports = mongoose.model('AuthSession', schema);
