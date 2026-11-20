const router = require('../utils/asyncRouter')();
const {
  getSettings,
  getPublicSettings,
  getNotices,
  toggleGradingLock,
  toggleCsvExportLock,
  updateSystemControls,
} = require('../controllers/settings.controller');
const { protect, adminOnly, superadminOnly } = require('../middleware/auth.middleware');
const presets = require('../controllers/maintenancePreset.controller');

router.get('/public', getPublicSettings);
router.get('/notices', protect, getNotices);
router.get('/maintenance-presets', protect, superadminOnly, presets.list);
router.post('/maintenance-presets', protect, superadminOnly, presets.create);
router.delete('/maintenance-presets/:id', protect, superadminOnly, presets.remove);
router.get('/', protect, getSettings);
router.patch('/toggle-lock', protect, adminOnly, toggleGradingLock);
router.patch('/toggle-csv-lock', protect, superadminOnly, toggleCsvExportLock);
router.patch('/system-controls', protect, superadminOnly, updateSystemControls);

module.exports = router;
