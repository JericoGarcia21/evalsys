const router = require('../utils/asyncRouter')();
const {
  getActiveRubric,
  getAllRubrics,
  createRubric,
  updateRubric,
  setActiveRubric,
  deleteRubric,
  generateAIRubric,
} = require('../controllers/rubric.controller');
const { protect, instructorOnly, instructorOrPanelOnly } = require('../middleware/auth.middleware');
const { cacheResponse } = require('../middleware/cache.middleware');
const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

// Panel can read the active rubric
router.get('/active', protect, instructorOrPanelOnly, cacheResponse('rubrics:active', 30000), getActiveRubric);

// Instructor only. Super Admin does not manage grading rubrics.
router.get('/', protect, instructorOnly, cacheResponse('rubrics:list', 30000), getAllRubrics);
router.post('/', protect, instructorOnly, createRubric);
router.post('/generate-ai', protect, instructorOnly, upload.single('file'), generateAIRubric);
router.put('/:id', protect, instructorOnly, updateRubric);
router.patch('/:id/activate', protect, instructorOnly, setActiveRubric);
router.delete('/:id', protect, instructorOnly, deleteRubric);

module.exports = router;
