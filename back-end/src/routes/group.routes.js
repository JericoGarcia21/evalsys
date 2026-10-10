const router = require('../utils/asyncRouter')();
const {
  createGroup,
  getGroups,
  getGroup,
  getGroupProposalUrl,
  updateGroup,
  deleteGroup,
  bulkCreateGroups,
} = require('../controllers/group.controller');
const { protect, adminOnly, superadminInstructorContext } = require('../middleware/auth.middleware');
const { cacheResponse } = require('../middleware/cache.middleware');

router.post('/register', (_req, res) => {
  res.status(403).json({ message: 'Registration requires an instructor registration link.' });
});

router.use(protect, superadminInstructorContext);
router.get('/', cacheResponse('groups:list', 15000), getGroups);
router.get('/:id/proposal-url', getGroupProposalUrl);
router.get('/:id', cacheResponse('groups:detail', 15000), getGroup);

router.post('/', adminOnly, createGroup);
router.post('/bulk', adminOnly, bulkCreateGroups);
router.put('/:id', adminOnly, updateGroup);
router.delete('/:id', adminOnly, deleteGroup);

module.exports = router;
