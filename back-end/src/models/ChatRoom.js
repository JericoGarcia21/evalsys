const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  instructor: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
}, { timestamps: true });
schema.index({ instructor: 1, subject: 1 }, { unique: true });
module.exports = mongoose.model('ChatRoom', schema);
