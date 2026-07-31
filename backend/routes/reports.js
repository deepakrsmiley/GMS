const express = require('express');
const router = express.Router();
const { getReportsSummary, getDetailedReport } = require('../controllers/reportsController');
const { protect, authorizeRoles } = require('../middleware/auth');

router.use(protect);
router.use(authorizeRoles('Super Admin', 'Admin'));

router.get('/summary', getReportsSummary);
router.get('/detailed', getDetailedReport);

module.exports = router;
