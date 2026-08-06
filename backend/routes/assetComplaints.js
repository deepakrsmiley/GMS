const express = require('express');
const router = express.Router();
const {
  getComplaints,
  getComplaint,
  createComplaint,
  updateComplaint,
  getComplaintDashboard,
} = require('../controllers/assetComplaintController');
const { authenticateUser, authorizeRoles } = require('../middleware/auth');

router.use(authenticateUser);

const ALL_STAFF = ['Super Admin', 'Admin', 'Biomedical Engineer', 'Doctor', 'Nurse', 'Pharmacist', 'Lab Technician', 'Receptionist'];
const ADMIN_ROLES = ['Super Admin', 'Admin', 'Biomedical Engineer'];

router.get('/dashboard', authorizeRoles(...ALL_STAFF), getComplaintDashboard);

router.route('/')
  .get(authorizeRoles(...ALL_STAFF), getComplaints)
  .post(authorizeRoles(...ALL_STAFF), createComplaint);

router.route('/:id')
  .get(authorizeRoles(...ALL_STAFF), getComplaint)
  .put(authorizeRoles(...ADMIN_ROLES), updateComplaint);

module.exports = router;
