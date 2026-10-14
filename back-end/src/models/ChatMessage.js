const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  room: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatRoom', required: true },
  sender: {
    id: { type: mongoose.Schema.Types.ObjectId, required: true },
    role: { type: String, enum: ['admin', 'panel'], required: true },
    name: { type: String, required: true },
  },
  body: { type: String, required: true, maxlength: 2000 },
  clientMessageId: { type: String, required: true },
}, { timestamps: true });
schema.index({ room: 1, _id: -1 });
schema.index({ 'sender.id': 1, 'sender.role': 1, clientMessageId: 1 }, { unique: true });
module.exports = mongoose.model('ChatMessage', schema);
