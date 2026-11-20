const router = require('../utils/asyncRouter')();
const { login, getMe, changePassword, updateOwnPassword, logout } = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth.middleware');

router.post('/login', login);
router.get('/me', protect, getMe);
router.post('/logout', protect, logout);
router.patch('/change-password', protect, changePassword);
router.patch('/my-password', protect, updateOwnPassword);

module.exports = router;
