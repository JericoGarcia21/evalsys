const router = require('../utils/asyncRouter')();
const {
  getSubjects,
  createSubject,
  updateSubject,
  deleteSubject,
  assignSubjectAdmins,
  getPublicSubjects,
} = require('../controllers/subject.controller');
const { protect, adminOnly, superadminOnly } = require('../middleware/auth.middleware');
const { cacheResponse } = require('../middleware/cache.middleware');

router.get('/public', cacheResponse('subjects:public', 30000), getPublicSubjects);

router.get('/', protect, adminOnly, cacheResponse('subjects:list', 30000), getSubjects);
router.post('/', protect, adminOnly, createSubject);
router.put('/:id', protect, adminOnly, updateSubject);
router.put('/:id/admins', protect, superadminOnly, assignSubjectAdmins);
router.delete('/:id', protect, superadminOnly, deleteSubject);

module.exports = router;
