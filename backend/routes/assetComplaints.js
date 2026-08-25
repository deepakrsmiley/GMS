const express = require('express');
const router = express.Router();
const {
  getComplaints,
  getComplaint,
  createComplaint,
  updateComplaint,
  getComplaintDashboard,
} = require('../controllers/assetComplaintController');
const { authenticateUser, authorizeAnyPermission } = require('../middleware/auth');
const { requireHospitalModule } = require('../middleware/hospitalModule');

router.use(authenticateUser);
router.use(requireHospitalModule('biomedical'));

const VIEW = authorizeAnyPermission('VIEW_ASSET_COMPLAINTS', 'CREATE_ASSET_COMPLAINT', 'MANAGE_ASSET_COMPLAINTS');
const CREATE = authorizeAnyPermission('CREATE_ASSET_COMPLAINT', 'MANAGE_ASSET_COMPLAINTS');
const MANAGE = authorizeAnyPermission('UPDATE_ASSET_COMPLAINT', 'MANAGE_ASSET_COMPLAINTS');

router.get('/dashboard', VIEW, getComplaintDashboard);

router.route('/')
  .get(VIEW, getComplaints)
  .post(CREATE, createComplaint);

router.route('/:id')
  .get(VIEW, getComplaint)
  .put(MANAGE, updateComplaint);

module.exports = router;
