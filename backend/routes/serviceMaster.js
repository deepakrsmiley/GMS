const express = require('express');
const router = express.Router();
const { getServices, createService, updateService, deleteService } = require('../controllers/serviceMasterController');
const { protect, authorizeRoles } = require('../middleware/auth');

router.use(protect);

const VIEW_ROLES = ['Super Admin', 'Admin', 'Doctor', 'Nurse', 'Receptionist', 'Accountant', 'Pharmacist'];
const MANAGE_ROLES = ['Super Admin', 'Admin'];

router.route('/')
  .get(authorizeRoles(...VIEW_ROLES), getServices)
  .post(authorizeRoles(...MANAGE_ROLES), createService);

router.route('/:id')
  .put(authorizeRoles(...MANAGE_ROLES), updateService)
  .delete(authorizeRoles(...MANAGE_ROLES), deleteService);

module.exports = router;
