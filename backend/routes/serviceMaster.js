const express = require('express');
const router = express.Router();
const { getServices, createService, updateService, deleteService } = require('../controllers/serviceMasterController');
const { protect, authorizeAnyPermission } = require('../middleware/auth');
const { requireHospitalModule } = require('../middleware/hospitalModule');

router.use(protect);
router.use(requireHospitalModule('op', 'ip', 'billing'));

const VIEW_SERVICES = authorizeAnyPermission(
  'MANAGE_SERVICES',
  'CREATE_SERVICE_USAGE',
  'VIEW_NURSE_STATION',
  'CREATE_BILLING',
  'VIEW_BILLING',
  'CREATE_CONSULTATION',
  'VIEW_IP_ADMISSION',
);
const MANAGE_SERVICES = authorizeAnyPermission('MANAGE_SERVICES', 'MANAGE_MASTERS');

router.route('/')
  .get(VIEW_SERVICES, getServices)
  .post(MANAGE_SERVICES, createService);

router.route('/:id')
  .put(MANAGE_SERVICES, updateService)
  .delete(MANAGE_SERVICES, deleteService);

module.exports = router;
