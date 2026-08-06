const express = require('express');
const router = express.Router();
const { getReportsSummary, getDetailedReport } = require('../controllers/reportsController');
const { getAuditExecutive, getAuditSection } = require('../controllers/auditReportsController');
const { protect, authorizeRoles } = require('../middleware/auth');

router.use(protect);
router.use(authorizeRoles('Super Admin', 'Admin'));

router.get('/summary', getReportsSummary);
router.get('/detailed', getDetailedReport);

router.get('/audit/executive', getAuditExecutive);
router.get('/audit/:section', getAuditSection);

module.exports = router;
