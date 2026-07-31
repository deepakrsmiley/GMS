const express = require('express');
const router = express.Router();
const { 
  getStaff, 
  getStaffMember, 
  createStaff, 
  updateStaff, 
  toggleStaffStatus, 
  getDoctors 
} = require('../controllers/staffController');
const { authenticateUser, authorizeRoles } = require('../middleware/auth');
const advancedResults = require('../middleware/advancedResults');
const User = require('../models/User');

router.use(authenticateUser);

router.get('/doctors', getDoctors);

router.route('/')
  .get(authorizeRoles('Super Admin', 'Admin'), advancedResults(User, 'department'), getStaff)
  .post(authorizeRoles('Super Admin', 'Admin'), createStaff);

router.route('/:id')
  .get(authorizeRoles('Super Admin', 'Admin'), getStaffMember)
  .put(authorizeRoles('Super Admin', 'Admin'), updateStaff);

router.put('/:id/toggle-status', authorizeRoles('Super Admin', 'Admin'), toggleStaffStatus);

module.exports = router;
