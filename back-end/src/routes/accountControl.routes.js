const router = require('../utils/asyncRouter')();
const { protect, superadminOnly } = require('../middleware/auth.middleware');
const control = require('../controllers/accountControl.controller');
const transfer = require('../controllers/ownershipTransfer.controller');

router.use(protect, superadminOnly);
router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.get('/accounts/:id/sessions', control.getSessions);
router.post('/accounts/:id/revoke-sessions', control.revokeSessions);
router.post('/accounts/:id/sessions/:sessionId/revoke', control.revokeSessions);
router.patch('/instructors/:id/status', control.setInstructorStatus);
router.get('/instructors/:id/offboarding', control.getOffboarding);
router.post('/instructors/:id/offboarding-review', control.reviewOffboarding);
router.post('/password-resets', control.bulkResetPasswords);
router.post('/transfers/preview', transfer.preview);
router.post('/transfers', transfer.execute);
module.exports = router;
