const express = require('express');
const router = express.Router();
const { authenticateUser, authorizeAnyPermission } = require('../middleware/auth');
const { requireHospitalModule } = require('../middleware/hospitalModule');
const ctrl = require('../controllers/bemsController');

router.use(authenticateUser);
router.use(requireHospitalModule('biomedical'));

// Dashboard & QR
router.get('/dashboard', authorizeAnyPermission('VIEW_BEMS', 'MANAGE_BEMS'), ctrl.getDashboard);
router.get('/equipment/:id/timeline', authorizeAnyPermission('VIEW_BEMS', 'MANAGE_BEMS', 'VIEW_ASSETS'), ctrl.getEquipmentTimeline);
router.get('/qr/:code', authorizeAnyPermission('VIEW_BEMS', 'MANAGE_BEMS', 'VIEW_ASSETS', 'VIEW_ASSET_COMPLAINTS'), ctrl.getByQr);

// Checklists
router.get('/checklists', authorizeAnyPermission('VIEW_BEMS', 'MANAGE_BEMS'), ctrl.listChecklists);
router.post('/checklists', authorizeAnyPermission('VIEW_BEMS', 'MANAGE_BEMS'), ctrl.createChecklist);
router.put('/checklists/:id', authorizeAnyPermission('VIEW_BEMS', 'MANAGE_BEMS'), ctrl.updateChecklist);

// Preventive Maintenance
router.get('/pm', authorizeAnyPermission('VIEW_BEMS', 'MANAGE_BEMS'), ctrl.listPm);
router.post('/pm', authorizeAnyPermission('VIEW_BEMS', 'MANAGE_BEMS'), ctrl.schedulePm);
router.put('/pm/:id/complete', authorizeAnyPermission('VIEW_BEMS', 'MANAGE_BEMS'), ctrl.completePm);

// Calibration
router.get('/calibrations', authorizeAnyPermission('VIEW_BEMS', 'MANAGE_BEMS'), ctrl.listCalibrations);
router.post('/calibrations', authorizeAnyPermission('VIEW_BEMS', 'MANAGE_BEMS'), ctrl.createCalibration);

// Electrical Safety
router.get('/electrical-safety', authorizeAnyPermission('VIEW_BEMS', 'MANAGE_BEMS'), ctrl.listElectricalSafety);
router.post('/electrical-safety', authorizeAnyPermission('VIEW_BEMS', 'MANAGE_BEMS'), ctrl.createElectricalSafety);

// Work Orders
router.get('/work-orders', authorizeAnyPermission('VIEW_BEMS', 'MANAGE_BEMS'), ctrl.listWorkOrders);
router.post('/work-orders', authorizeAnyPermission('VIEW_BEMS', 'MANAGE_BEMS'), ctrl.createWorkOrder);
router.put('/work-orders/:id', authorizeAnyPermission('VIEW_BEMS', 'MANAGE_BEMS'), ctrl.updateWorkOrder);

// Spare Parts
router.get('/spares', authorizeAnyPermission('VIEW_BEMS', 'MANAGE_BEMS'), ctrl.listSpares);
router.post('/spares', authorizeAnyPermission('VIEW_BEMS', 'MANAGE_BEMS'), ctrl.createSpare);
router.put('/spares/:id', authorizeAnyPermission('VIEW_BEMS', 'MANAGE_BEMS'), ctrl.updateSpare);
router.post('/spares/:id/adjust', authorizeAnyPermission('VIEW_BEMS', 'MANAGE_BEMS'), ctrl.adjustSpareStock);

// Vendors
router.get('/vendors', authorizeAnyPermission('VIEW_BEMS', 'MANAGE_BEMS'), ctrl.listVendors);
router.post('/vendors', authorizeAnyPermission('VIEW_BEMS', 'MANAGE_BEMS'), ctrl.createVendor);
router.put('/vendors/:id', authorizeAnyPermission('VIEW_BEMS', 'MANAGE_BEMS'), ctrl.updateVendor);

// AMC / CMC
router.get('/contracts', authorizeAnyPermission('VIEW_BEMS', 'MANAGE_BEMS'), ctrl.listContracts);
router.post('/contracts', authorizeAnyPermission('VIEW_BEMS', 'MANAGE_BEMS'), ctrl.createContract);
router.put('/contracts/:id', authorizeAnyPermission('VIEW_BEMS', 'MANAGE_BEMS'), ctrl.updateContract);

// Movement
router.get('/movements', authorizeAnyPermission('VIEW_BEMS', 'MANAGE_BEMS'), ctrl.listMovements);
router.post('/movements', authorizeAnyPermission('VIEW_BEMS', 'MANAGE_BEMS'), ctrl.createMovement);

// Lifecycle / documents
router.post('/equipment/:id/lifecycle', authorizeAnyPermission('VIEW_BEMS', 'MANAGE_BEMS'), ctrl.advanceLifecycle);
router.post('/equipment/:id/documents', authorizeAnyPermission('VIEW_BEMS', 'MANAGE_BEMS'), ctrl.addDocument);

// Reports
router.get('/reports', authorizeAnyPermission('VIEW_BEMS_REPORTS', 'MANAGE_BEMS', 'VIEW_REPORTS'), ctrl.getReports);

router.post('/seed-defaults', authorizeAnyPermission('MANAGE_BEMS', 'MANAGE_MASTERS'), ctrl.seedDefaults);

module.exports = router;
