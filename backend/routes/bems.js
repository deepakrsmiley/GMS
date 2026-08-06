const express = require('express');
const router = express.Router();
const { authenticateUser, authorizeRoles, authorizeAnyPermission } = require('../middleware/auth');
const ctrl = require('../controllers/bemsController');

const BME_ROLES = ['Super Admin', 'Admin', 'Biomedical Engineer'];

router.use(authenticateUser);

// Dashboard & QR
router.get('/dashboard', authorizeRoles(...BME_ROLES), ctrl.getDashboard);
router.get('/equipment/:id/timeline', authorizeAnyPermission('VIEW_BEMS', 'MANAGE_BEMS', 'VIEW_ASSETS'), ctrl.getEquipmentTimeline);
router.get('/qr/:code', authorizeAnyPermission('VIEW_BEMS', 'MANAGE_BEMS', 'VIEW_ASSETS', 'VIEW_ASSET_COMPLAINTS'), ctrl.getByQr);

// Checklists
router.get('/checklists', authorizeRoles(...BME_ROLES), ctrl.listChecklists);
router.post('/checklists', authorizeRoles(...BME_ROLES), ctrl.createChecklist);
router.put('/checklists/:id', authorizeRoles(...BME_ROLES), ctrl.updateChecklist);

// Preventive Maintenance
router.get('/pm', authorizeRoles(...BME_ROLES), ctrl.listPm);
router.post('/pm', authorizeRoles(...BME_ROLES), ctrl.schedulePm);
router.put('/pm/:id/complete', authorizeRoles(...BME_ROLES), ctrl.completePm);

// Calibration
router.get('/calibrations', authorizeRoles(...BME_ROLES), ctrl.listCalibrations);
router.post('/calibrations', authorizeRoles(...BME_ROLES), ctrl.createCalibration);

// Electrical Safety
router.get('/electrical-safety', authorizeRoles(...BME_ROLES), ctrl.listElectricalSafety);
router.post('/electrical-safety', authorizeRoles(...BME_ROLES), ctrl.createElectricalSafety);

// Work Orders
router.get('/work-orders', authorizeRoles(...BME_ROLES), ctrl.listWorkOrders);
router.post('/work-orders', authorizeRoles(...BME_ROLES), ctrl.createWorkOrder);
router.put('/work-orders/:id', authorizeRoles(...BME_ROLES), ctrl.updateWorkOrder);

// Spare Parts
router.get('/spares', authorizeRoles(...BME_ROLES), ctrl.listSpares);
router.post('/spares', authorizeRoles(...BME_ROLES), ctrl.createSpare);
router.put('/spares/:id', authorizeRoles(...BME_ROLES), ctrl.updateSpare);
router.post('/spares/:id/adjust', authorizeRoles(...BME_ROLES), ctrl.adjustSpareStock);

// Vendors
router.get('/vendors', authorizeRoles(...BME_ROLES), ctrl.listVendors);
router.post('/vendors', authorizeRoles(...BME_ROLES), ctrl.createVendor);
router.put('/vendors/:id', authorizeRoles(...BME_ROLES), ctrl.updateVendor);

// AMC / CMC
router.get('/contracts', authorizeRoles(...BME_ROLES), ctrl.listContracts);
router.post('/contracts', authorizeRoles(...BME_ROLES), ctrl.createContract);
router.put('/contracts/:id', authorizeRoles(...BME_ROLES), ctrl.updateContract);

// Movement
router.get('/movements', authorizeRoles(...BME_ROLES), ctrl.listMovements);
router.post('/movements', authorizeRoles(...BME_ROLES), ctrl.createMovement);

// Lifecycle / documents
router.post('/equipment/:id/lifecycle', authorizeRoles(...BME_ROLES), ctrl.advanceLifecycle);
router.post('/equipment/:id/documents', authorizeRoles(...BME_ROLES), ctrl.addDocument);

// Reports
router.get('/reports', authorizeAnyPermission('VIEW_BEMS_REPORTS', 'MANAGE_BEMS', 'VIEW_REPORTS'), ctrl.getReports);

router.post('/seed-defaults', authorizeRoles('Super Admin', 'Admin'), ctrl.seedDefaults);

module.exports = router;
