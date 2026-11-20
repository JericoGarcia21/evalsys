const router = require('../utils/asyncRouter')();
const {
  getLegacyData,
  repairLegacyData,
  deleteLegacyGroup,
  deleteLegacyPanel,
  deleteLegacyResult,
  deleteAllLegacyResults,
  deleteLegacySection,
} = require('../controllers/legacyData.controller');
const { protect, superadminOnly } = require('../middleware/auth.middleware');
const { cacheResponse } = require('../middleware/cache.middleware');
const reports = require('../controllers/archiveReport.controller');

router.use(protect, superadminOnly);
router.post('/repair', repairLegacyData);
router.get('/', cacheResponse('legacy-data:list', 15000), getLegacyData);
router.get('/results', reports.list);
router.get('/results/export', reports.export);
router.delete('/groups/:id', deleteLegacyGroup);
router.delete('/panels/:id', deleteLegacyPanel);
router.delete('/results', deleteAllLegacyResults);
router.delete('/results/:id', deleteLegacyResult);
router.delete('/sections/:id', deleteLegacySection);

module.exports = router;
