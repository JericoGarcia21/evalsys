const router = require('../utils/asyncRouter')();
const {
  getRegistrationLinks,
  createRegistrationLink,
  updateRegistrationLink,
  deleteRegistrationLink,
  getPublicRegistrationLink,
  registerGroupWithLink,
} = require('../controllers/registrationLink.controller');
const { protect, adminOnly, superadminInstructorContext } = require('../middleware/auth.middleware');
const maintenance = require('../middleware/maintenance.middleware');
const proposalUpload = require('../middleware/proposalUpload.middleware');
const { cacheResponse } = require('../middleware/cache.middleware');

router.get('/public/:token', cacheResponse('registration-links:public', 10000), getPublicRegistrationLink);
router.post('/public/:token/register', maintenance, proposalUpload, registerGroupWithLink);

router.use(protect, adminOnly, superadminInstructorContext);

router.get('/', cacheResponse('registration-links:list', 15000), getRegistrationLinks);
router.post('/', createRegistrationLink);
router.patch('/:id', updateRegistrationLink);
router.delete('/:id', deleteRegistrationLink);

module.exports = router;
