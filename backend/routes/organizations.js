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
} = require('../controllers/organizationController');
const { authenticateUser } = require('../middleware/auth');
const { authorizeSuperAdmin } = require('../middleware/tenant');

router.use(authenticateUser, authorizeSuperAdmin);

router.get('/', listOrganizations);
router.post('/', createOrganization);
router.get('/:id', getOrganization);
router.put('/:id', updateOrganization);
router.put('/:id/status', setOrganizationStatus);
router.post('/:id/select', selectOrganization);
router.post('/:id/admins', createHospitalAdmin);
router.post('/:id/users', assignUserToOrganization);

module.exports = router;
