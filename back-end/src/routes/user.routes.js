const router = require('../utils/asyncRouter')();
const { createUser, getUsers, toggleActive, deleteUser, bulkCreateUsers, resetPassword, updateSubjectLimit, updateCsvExportLock, updateGradingLock, updateAiRubricCredits } = require('../controllers/user.controller');
const { protect, adminOnly, instructorOnly } = require('../middleware/auth.middleware');
const { cacheResponse } = require('../middleware/cache.middleware');

router.use(protect, adminOnly);
router.get('/assignable-panels', async (req, res) => {
  const Admin = require('../models/Admin');
  const Panel = require('../models/Panel');
  const owners = await Admin.find({ role: 'admin', isActive: true }).select('_id');
  const shared = await require('../services/panelAccess.service').sharedPanelsEnabled();
  const ownerId = req.user.role === 'superadmin' ? req.headers['x-instructor-id'] : req.user._id;
  const panels = await Panel.find({ isActive: true, createdBy: { $in: owners.filter(owner => shared || String(owner._id) === String(ownerId)).map(owner => owner._id) } })
    .select('name email createdBy isActive role').populate('createdBy', 'name').sort({ name: 1, _id: 1 });
  res.json(panels);
});
router.post('/', createUser);
router.post('/bulk', bulkCreateUsers);
router.get('/', cacheResponse('users:list', 15000), getUsers);
router.patch('/:id/toggle', toggleActive);
router.patch('/:id/reset-password', resetPassword);
router.patch('/:id/subject-limit', updateSubjectLimit);
router.patch('/:id/csv-export-lock', updateCsvExportLock);
router.patch('/:id/grading-lock', instructorOnly, updateGradingLock);
router.patch('/:id/ai-rubric-credits', updateAiRubricCredits);
router.delete('/:id', deleteUser);

module.exports = router;
