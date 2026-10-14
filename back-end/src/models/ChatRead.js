const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, required: true },
  role: { type: String, enum: ['admin', 'panel'], required: true },
  room: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatRoom', required: true },
  lastReadMessageId: { type: mongoose.Schema.Types.ObjectId, required: true },
}, { timestamps: true, collection: 'chat_read_states' });
schema.index({ user: 1, role: 1, room: 1 }, { unique: true });
module.exports = mongoose.model('ChatRead', schema);
