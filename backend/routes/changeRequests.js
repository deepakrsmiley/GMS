const express = require('express');
const router = express.Router();
const {
  createChangeRequest,
  getChangeRequests,
  getChangeRequest,
  reviewChangeRequest,
  getPendingMedicineLocks,
} = require('../controllers/changeRequestController');
const { protect, authorizeRoles } = require('../middleware/auth');

router.use(protect);

// All authenticated staff can raise / view own requests
const STAFF = [
  'Super Admin', 'Admin', 'Doctor', 'Receptionist',
  'Pharmacist', 'Lab Technician', 'Nurse', 'Accountant',
];

router.route('/')
  .get(authorizeRoles(...STAFF), getChangeRequests)
  .post(authorizeRoles(...STAFF), createChangeRequest);

// Must be before /:id
router.get('/medicine-locks', authorizeRoles(...STAFF), getPendingMedicineLocks);

router.get('/:id', authorizeRoles(...STAFF), getChangeRequest);
router.put('/:id/review', authorizeRoles('Super Admin', 'Admin'), reviewChangeRequest);

module.exports = router;
