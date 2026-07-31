const express = require('express');
const router = express.Router();
const { getDashboardStats, getDepartmentAnalytics } = require('../controllers/dashboardController');
const { protect } = require('../middleware/auth');

router.use(protect);
router.get('/stats', getDashboardStats);
router.get('/department-analytics', getDepartmentAnalytics);

module.exports = router;
