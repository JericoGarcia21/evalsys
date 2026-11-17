const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const adminSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['superadmin', 'admin'], default: 'admin' },
  assignedSubjects: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Subject' }],
  subjectLimit: { type: Number, default: 1, min: 1 },
  csvExportLocked: { type: Boolean, default: false },
  gradingLocked: { type: Boolean, default: false },
  gradingLockedSubjects: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Subject' }],
  aiRubricCredits: { type: Number, default: 5, min: 0 },
  mustChangePassword: { type: Boolean, default: false },
  failedLoginAttempts: { type: Number, default: 0 },
  lockUntil: { type: Date },
  lastLoginAt: { type: Date },
  isActive: { type: Boolean, default: true },
}, { timestamps: true, collection: 'admin_acc' });

adminSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

adminSchema.methods.matchPassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

module.exports = mongoose.model('Admin', adminSchema);
