const express = require('express');
const router = express.Router({ mergeParams: true });
const ctrl = require('../controllers/patientProfileController');
const { authenticateUser, authorizeAnyPermission } = require('../middleware/auth');

router.use(authenticateUser);

const VIEW_PROFILE = authorizeAnyPermission(
  'VIEW_PATIENT_PROFILE',
  'VIEW_PATIENT',
  'VIEW_NURSE_STATION',
  'VIEW_IP_ADMISSION',
  'VIEW_BILLING',
  'CREATE_CONSULTATION',
  'VIEW_LAB',
  'VIEW_PHARMACY',
);
const CLINICAL_WRITE = authorizeAnyPermission(
  'UPDATE_PATIENT_PROFILE',
  'CREATE_DISCHARGE_SUMMARY',
  'CREATE_DOCTOR_ROUND',
  'VIEW_NURSE_STATION',
);
const DOCUMENTS = authorizeAnyPermission(
  'UPDATE_PATIENT',
  'UPDATE_PATIENT_PROFILE',
  'CREATE_PATIENT',
  'VIEW_NURSE_STATION',
);
const AUDIT = authorizeAnyPermission('VIEW_REPORTS', 'VIEW_ACTIVITY');

router.use(VIEW_PROFILE);

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
router.post('/operation-history', CLINICAL_WRITE, ctrl.createOperation);
// Section 14 & 15
router.get('/billing-history', ctrl.getBillingHistory);
router.get('/payment-history', ctrl.getPaymentHistory);
// Section 16
router.get('/documents', ctrl.getDocumentHistory);
router.post('/documents', DOCUMENTS, ctrl.uploadDocument);
router.delete('/documents/:docId', DOCUMENTS, ctrl.deleteDocument);
// Section 17
router.get('/alerts', ctrl.getAlerts);
// Section 18
router.get('/audit-history', AUDIT, ctrl.getAuditHistory);

module.exports = router;
