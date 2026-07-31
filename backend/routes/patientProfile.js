const express = require('express');
const router = express.Router({ mergeParams: true });
const ctrl = require('../controllers/patientProfileController');
const { authenticateUser, authorizeRoles } = require('../middleware/auth');

const VIEW_ROLES = ['Super Admin', 'Admin', 'Doctor', 'Nurse', 'Receptionist', 'Pharmacist', 'Accountant', 'Lab Technician'];
const CLINICAL_ROLES = ['Super Admin', 'Admin', 'Doctor', 'Nurse'];
const CLINICAL_OR_RECEPTION = ['Super Admin', 'Admin', 'Doctor', 'Nurse', 'Receptionist'];

router.use(authenticateUser);
router.use(authorizeRoles(...VIEW_ROLES));

// Section 1
router.get('/summary', ctrl.getSummary);
// Section 2
router.get('/timeline', ctrl.getTimeline);
// Section 3
router.get('/op-history', ctrl.getOPHistory);
// Section 4 & 5
router.get('/ip-history', ctrl.getIPHistory);
router.get('/ip-history/:admissionId', ctrl.getAdmissionDetail);
// Section 6
router.get('/room-history', ctrl.getRoomHistory);
// Section 7
router.get('/doctor-history', ctrl.getDoctorHistory);
// Section 8
router.get('/medicine-history', ctrl.getMedicineHistory);
// Section 9 & 10
router.get('/lab-history', ctrl.getLabHistory);
// Section 11
router.get('/procedure-history', ctrl.getProcedureHistory);
// Section 12
router.get('/machine-history', ctrl.getMachineHistory);
// Section 13
router.get('/operation-history', ctrl.getOperationHistory);
router.post('/operation-history', authorizeRoles(...CLINICAL_ROLES), ctrl.createOperation);
// Section 14 & 15
router.get('/billing-history', ctrl.getBillingHistory);
router.get('/payment-history', ctrl.getPaymentHistory);
// Section 16
router.get('/documents', ctrl.getDocumentHistory);
router.post('/documents', authorizeRoles(...CLINICAL_OR_RECEPTION), ctrl.uploadDocument);
router.delete('/documents/:docId', authorizeRoles(...CLINICAL_OR_RECEPTION), ctrl.deleteDocument);
// Section 17
router.get('/alerts', ctrl.getAlerts);
// Section 18
router.get('/audit-history', authorizeRoles('Super Admin', 'Admin'), ctrl.getAuditHistory);

module.exports = router;
