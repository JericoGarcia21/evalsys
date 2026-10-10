const router = require('../utils/asyncRouter')();
const {
  submitEvaluation,
  getMyEvaluation,
  getGroupResult,
  getSectionResults,
  clearEvaluation,
  exportAllResults,
  masterReset,
} = require('../controllers/evaluation.controller');
const { protect, adminOnly, panelOnly, superadminInstructorContext } = require('../middleware/auth.middleware');
const { validateScores } = require('../middleware/validate.middleware');
const { cacheResponse } = require('../middleware/cache.middleware');
const { backgroundJob } = require('../middleware/backgroundJob.middleware');

const superadminContextForSelectedSubject = (req, res, next) => {
  const subject = req.headers['x-subject-id'] || req.query.subject || req.body?.subject;
  if (subject) return superadminInstructorContext(req, res, next);
  next();
};

// Panel routes
router.post('/group/:groupId', protect, panelOnly, validateScores, submitEvaluation);
router.get('/group/:groupId/mine', protect, panelOnly, cacheResponse('evaluation:mine', 10000), getMyEvaluation);

// Admin routes
router.get('/group/:groupId/result', protect, adminOnly, superadminInstructorContext, cacheResponse('evaluation:group-result', 15000), getGroupResult);
router.get('/section/:sectionId/results', protect, adminOnly, superadminInstructorContext, cacheResponse('evaluation:section-results', 15000), getSectionResults);
router.get('/export-all', protect, adminOnly, superadminContextForSelectedSubject, backgroundJob('results.export', exportAllResults));
router.post(
  '/master-reset',
  protect,
  adminOnly,
  superadminContextForSelectedSubject,
  backgroundJob('data.reset', masterReset)
);
router.delete('/:evaluationId', protect, adminOnly, superadminInstructorContext, clearEvaluation);

module.exports = router;
