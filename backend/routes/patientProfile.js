const express = require('express');
const multer = require('multer');
const router = express.Router({ mergeParams: true });
const ctrl = require('../controllers/patientProfileController');
const { authenticateUser, authorizeAnyPermission } = require('../middleware/auth');
const { requireHospitalModule } = require('../middleware/hospitalModule');
const ErrorResponse = require('../utils/errorResponse');

router.use(authenticateUser);
router.use(requireHospitalModule('patients'));

const VIEW_PROFILE = authorizeAnyPermission(
  'VIEW_PATIENT_PROFILE',
  'VIEW_PATIENT',
  'VIEW_NURSE_STATION',
  'VIEW_IP_ADMISSION',
  'VIEW_BILLING',
  'CREATE_CONSULTATION',
  'VIEW_OP_QUEUE',
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
  'CREATE_CONSULTATION',
  'UPDATE_CONSULTATION',
  'CREATE_PRESCRIPTION',
  'UPDATE_OP_QUEUE',
);
const AUDIT = authorizeAnyPermission('VIEW_REPORTS', 'VIEW_ACTIVITY');

const scanUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 12 },
  fileFilter: (req, file, cb) => {
    const mime = String(file.mimetype || '').toLowerCase();
    const name = String(file.originalname || '').toLowerCase();
    const ok = /^(image\/(jpeg|jpg|png|webp)|application\/pdf)$/.test(mime)
      || /\.(jpe?g|png|webp|pdf)$/.test(name);
    if (!ok) return cb(new ErrorResponse('Only PDF, JPG and PNG files are allowed', 400));
    cb(null, true);
  },
});

const handleScanUpload = (req, res, next) => {
  scanUpload.array('files', 12)(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(new ErrorResponse('Each file must be under 20 MB', 400));
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return next(new ErrorResponse('A prescription can have at most 12 pages', 400));
    }
    return next(err);
  });
};

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
router.post('/documents/scan', DOCUMENTS, handleScanUpload, ctrl.scanPrescription);
router.get('/documents/:docId/file', ctrl.streamDocumentFile);
router.post('/documents/:docId/replace', DOCUMENTS, handleScanUpload, ctrl.replacePrescriptionScan);
router.delete('/documents/:docId', DOCUMENTS, ctrl.deleteDocument);
// Section 17
router.get('/alerts', ctrl.getAlerts);
// Section 18
router.get('/audit-history', AUDIT, ctrl.getAuditHistory);

module.exports = router;
