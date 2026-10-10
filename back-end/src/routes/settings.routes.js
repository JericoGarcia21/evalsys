const router = require('../utils/asyncRouter')();
const {
  getSettings,
  getPublicSettings,
  toggleGradingLock,
  toggleCsvExportLock,
  updateSystemControls,
} = require('../controllers/settings.controller');
const { protect, adminOnly, superadminOnly } = require('../middleware/auth.middleware');
const { cacheResponse } = require('../middleware/cache.middleware');

router.get('/public', cacheResponse('settings:public', 10000), getPublicSettings);
router.get('/', protect, cacheResponse('settings:detail', 10000), getSettings);
router.patch('/toggle-lock', protect, adminOnly, toggleGradingLock);
router.patch('/toggle-csv-lock', protect, superadminOnly, toggleCsvExportLock);
router.patch('/system-controls', protect, superadminOnly, updateSystemControls);

module.exports = router;
