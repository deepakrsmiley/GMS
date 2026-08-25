const express = require('express');
const router = express.Router();
const {
  listOrganizations,
  getOrganization,
  createOrganization,
  updateOrganization,
  setOrganizationStatus,
  createHospitalAdmin,
  assignUserToOrganization,
  selectOrganization,
  clearHospitalContext,
  platformOverview,
} = require('../controllers/organizationController');
const { authenticateUser } = require('../middleware/auth');
const { authorizeSuperAdmin } = require('../middleware/tenant');

router.use(authenticateUser, authorizeSuperAdmin);

router.get('/', listOrganizations);
router.get('/overview', platformOverview);
router.post('/', createOrganization);
router.post('/clear-select', clearHospitalContext);
router.get('/:id', getOrganization);
router.put('/:id', updateOrganization);
router.put('/:id/status', setOrganizationStatus);
router.post('/:id/select', selectOrganization);
router.post('/:id/admins', createHospitalAdmin);
router.post('/:id/users', assignUserToOrganization);

module.exports = router;
