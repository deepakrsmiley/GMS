const express = require('express');
const router = express.Router();
const { 
  getStaff, 
  getStaffMember, 
  createStaff, 
  updateStaff, 
  toggleStaffStatus,
  deleteStaff,
  getDoctors 
} = require('../controllers/staffController');
const { authenticateUser, authorizeAnyPermission } = require('../middleware/auth');
const advancedResults = require('../middleware/advancedResults');
const User = require('../models/User');

router.use(authenticateUser);

const VIEW_STAFF = authorizeAnyPermission('VIEW_STAFF', 'MANAGE_STAFF');
const CREATE_STAFF = authorizeAnyPermission('CREATE_STAFF', 'MANAGE_STAFF');
const UPDATE_STAFF = authorizeAnyPermission('UPDATE_STAFF', 'MANAGE_STAFF');
const DELETE_STAFF = authorizeAnyPermission('DELETE_STAFF', 'MANAGE_STAFF');

router.get('/doctors', getDoctors);

router.route('/')
  .get(VIEW_STAFF, advancedResults(User, 'department'), getStaff)
  .post(CREATE_STAFF, createStaff);

router.route('/:id')
  .get(VIEW_STAFF, getStaffMember)
  .put(UPDATE_STAFF, updateStaff)
  .delete(DELETE_STAFF, deleteStaff);

router.put('/:id/toggle-status', UPDATE_STAFF, toggleStaffStatus);

module.exports = router;
