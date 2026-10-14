const router = require('../utils/asyncRouter')();
const {
  exportBackup,
  cleanupProposalOrphans,
  getActivity,
  getAuditLogs,
  getInstructorSummary,
  getProposalOrphans,
  getSecurityMonitor,
} = require('../controllers/operations.controller');
const { getAnalytics } = require('../controllers/analytics.controller');
const { protect, superadminOnly } = require('../middleware/auth.middleware');
const { cacheResponse } = require('../middleware/cache.middleware');
const { backgroundJob } = require('../middleware/backgroundJob.middleware');

router.use(protect, superadminOnly);

router.get('/analytics', cacheResponse('operations:analytics', 15000), getAnalytics);
router.get('/audit-logs', cacheResponse('operations:audit-logs', 10000), getAuditLogs);
router.get('/activity', cacheResponse('operations:activity', 10000), getActivity);
router.get('/security', cacheResponse('operations:security', 10000), getSecurityMonitor);
router.get('/instructor-summary', cacheResponse('operations:instructor-summary', 15000), getInstructorSummary);
router.get('/proposal-orphans', cacheResponse('operations:proposal-orphans', 15000), getProposalOrphans);
router.delete('/proposal-orphans', cleanupProposalOrphans);
router.get('/backup/:type', backgroundJob('backup.export', exportBackup));

module.exports = router;
