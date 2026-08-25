const express = require('express');
const router = express.Router();
const { getReportsSummary, getDetailedReport } = require('../controllers/reportsController');
const { getAuditExecutive, getAuditSection } = require('../controllers/auditReportsController');
const { protect, authorizeAnyPermission } = require('../middleware/auth');
const { requireHospitalModule } = require('../middleware/hospitalModule');

router.use(protect);
router.use(requireHospitalModule('reports'));
router.use(authorizeAnyPermission('VIEW_REPORTS', 'VIEW_ACTIVITY'));

router.get('/summary', getReportsSummary);
router.get('/detailed', getDetailedReport);

router.get('/audit/executive', getAuditExecutive);
router.get('/audit/:section', getAuditSection);

module.exports = router;
