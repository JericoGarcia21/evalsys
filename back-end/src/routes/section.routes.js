const router = require('../utils/asyncRouter')();
const {
  createSection,
  getSections,
  updateSection,
  deleteSection,
  assignBlocksToPanel
} = require('../controllers/section.controller');
const { protect, adminOnly, superadminInstructorContext } = require('../middleware/auth.middleware');
const { cacheResponse } = require('../middleware/cache.middleware');

router.get('/public', cacheResponse('sections:public', 10000), getSections); // Allow public to see blocks for registration

router.use(protect, superadminInstructorContext);

router.get('/', cacheResponse('sections:list', 15000), getSections);
router.post('/assign-blocks', adminOnly, assignBlocksToPanel);
router.post('/', adminOnly, createSection);
router.put('/:id', adminOnly, updateSection);
router.delete('/:id', adminOnly, deleteSection);

module.exports = router;
