const router = require('../utils/asyncRouter')();
const { createUser, getUsers, toggleActive, deleteUser, bulkCreateUsers, resetPassword, updateSubjectLimit, updateCsvExportLock, updateGradingLock } = require('../controllers/user.controller');
const { protect, adminOnly } = require('../middleware/auth.middleware');
const { cacheResponse } = require('../middleware/cache.middleware');

router.use(protect, adminOnly);
router.post('/', createUser);
router.post('/bulk', bulkCreateUsers);
router.get('/', cacheResponse('users:list', 15000), getUsers);
router.patch('/:id/toggle', toggleActive);
router.patch('/:id/reset-password', resetPassword);
router.patch('/:id/subject-limit', updateSubjectLimit);
router.patch('/:id/csv-export-lock', updateCsvExportLock);
router.patch('/:id/grading-lock', updateGradingLock);
router.delete('/:id', deleteUser);

module.exports = router;
