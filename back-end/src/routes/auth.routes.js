const router = require('../utils/asyncRouter')();
const { login, getMe, changePassword, updateOwnPassword } = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth.middleware');

router.post('/login', login);
router.get('/me', protect, getMe);
router.patch('/change-password', protect, changePassword);
router.patch('/my-password', protect, updateOwnPassword);

module.exports = router;
