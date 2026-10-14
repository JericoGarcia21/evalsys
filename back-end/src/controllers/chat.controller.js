const ChatMessage = require('../models/ChatMessage');
const ChatRead = require('../models/ChatRead');
const { getRooms, authorizeRoom, validId } = require('../services/chat.service');

const handle = handler => async (req, res, next) => {
  try { await handler(req, res); }
  catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    next(error);
  }
};

exports.rooms = handle(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  res.json({ rooms: await getRooms(req.user) });
});

exports.messages = handle(async (req, res) => {
  const scope = await authorizeRoom(req.user, req.params.roomId);
  const before = req.query.before;
  const after = req.query.after;
  if ((before && !validId(before)) || (after && !validId(after)) || (before && after)) {
    return res.status(400).json({ message: 'Invalid message cursor.' });
  }
  const filter = { ...scope, ...(before ? { _id: { $lt: before } } : after ? { _id: { $gt: after } } : {}) };
  const messages = await ChatMessage.find(filter).sort({ _id: after ? 1 : -1 }).limit(51).select('-clientMessageId -__v').lean();
  const more = messages.length > 50;
  res.set('Cache-Control', 'private, no-store');
  res.json({ messages: after ? messages.slice(0, 50) : messages.slice(0, 50).reverse(), hasMore: !after && more, hasMoreNew: Boolean(after && more) });
});

exports.send = handle(async (req, res) => {
  const scope = await authorizeRoom(req.user, req.params.roomId);
  const body = typeof req.body.body === 'string' ? req.body.body.trim() : '';
  const clientMessageId = req.body.clientMessageId;
  if (!body || body.length > 2000 || typeof clientMessageId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(clientMessageId)) {
    return res.status(400).json({ message: 'Enter a message of 1–2,000 characters and a valid message identifier.' });
  }
  const sender = { id: req.user._id, role: req.user.role, name: req.user.name };
  let message;
  let existing = false;
  try { message = await ChatMessage.create({ ...scope, sender, body, clientMessageId }); }
  catch (error) {
    if (error.code !== 11000) throw error;
    existing = true;
    message = await ChatMessage.findOne({ 'sender.id': sender.id, 'sender.role': sender.role, clientMessageId });
    if (!message || String(message.room) !== String(scope.room) || message.body !== body) {
      return res.status(409).json({ message: 'This message identifier was already used. Please try a new message.' });
    }
  }
  const result = message.toObject();
  delete result.clientMessageId;
  delete result.__v;
  res.status(existing ? 200 : 201).json(result);
});

exports.read = handle(async (req, res) => {
  const scope = await authorizeRoom(req.user, req.params.roomId);
  if (!validId(req.body.messageId)) return res.status(400).json({ message: 'Invalid read cursor.' });
  const message = await ChatMessage.findOne({ ...scope, _id: req.body.messageId }).select('_id');
  if (!message) return res.status(400).json({ message: 'Read cursor does not belong to this conversation.' });
  const filter = { user: req.user._id, role: req.user.role, ...scope };
  try {
    await ChatRead.updateOne(filter, { $max: { lastReadMessageId: message._id } }, { upsert: true });
  } catch (error) {
    if (error.code !== 11000) throw error;
    await ChatRead.updateOne(filter, { $max: { lastReadMessageId: message._id } });
  }
  res.json({ read: true });
});
