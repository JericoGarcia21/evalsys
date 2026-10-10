const router = require('../utils/asyncRouter')();
const { getPlatformUsage } = require('../controllers/usage.controller');
const { protect, superadminOnly } = require('../middleware/auth.middleware');
const { cacheResponse } = require('../middleware/cache.middleware');

router.get('/', protect, superadminOnly, cacheResponse('usage:platform', 15000), getPlatformUsage);

module.exports = router;
