const express = require('express');
const router = express.Router();
const { getTests, lookupTest, createTest, updateTest, deleteTest } = require('../controllers/testMasterController');
const { protect, authorizeRoles } = require('../middleware/auth');

router.use(protect);

// Everyone on staff can view test prices (lab technician, doctor, nurse, receptionist, pharmacist, admin...)
const VIEW_ROLES = ['Super Admin', 'Admin', 'Doctor', 'Nurse', 'Receptionist', 'Pharmacist', 'Lab Technician'];
// Only these roles can add/edit/deactivate prices in the master
const MANAGE_ROLES = ['Super Admin', 'Admin', 'Lab Technician'];

router.get('/lookup', authorizeRoles(...VIEW_ROLES), lookupTest);

router.route('/')
  .get(authorizeRoles(...VIEW_ROLES), getTests)
  .post(authorizeRoles(...MANAGE_ROLES), createTest);

router.route('/:id')
  .put(authorizeRoles(...MANAGE_ROLES), updateTest)
  .delete(authorizeRoles(...MANAGE_ROLES), deleteTest);

module.exports = router;