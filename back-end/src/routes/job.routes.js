const router = require('../utils/asyncRouter')();
const { protect } = require('../middleware/auth.middleware');
const { getJobStatus, getJobResult } = require('../controllers/job.controller');

router.use(protect);
router.get('/:id', getJobStatus);
router.get('/:id/result', getJobResult);

module.exports = router;
