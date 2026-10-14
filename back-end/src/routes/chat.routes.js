const router = require('../utils/asyncRouter')();
const { rateLimit } = require('express-rate-limit');
const { protect, instructorOrPanelOnly } = require('../middleware/auth.middleware');
const { rooms, messages, send, read } = require('../controllers/chat.controller');
router.use(protect, instructorOrPanelOnly);
const messageLimiter = rateLimit({
  windowMs: 60000, limit: 30,
  keyGenerator: req => req.user.role + ':' + req.user._id,
  standardHeaders: true, legacyHeaders: false,
  message: { message: 'Please slow down. You can send up to 30 messages per minute.' },
});
router.get('/rooms', rooms);
router.get('/rooms/:roomId/messages', messages);
router.post('/rooms/:roomId/messages', messageLimiter, send);
router.post('/rooms/:roomId/read', read);
module.exports = router;
