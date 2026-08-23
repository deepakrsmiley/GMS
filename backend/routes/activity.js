const express = require('express');
const router = express.Router();
const { getRecentActivity } = require('../controllers/activityController');
const { authenticateUser, authorizeAnyPermission } = require('../middleware/auth');

router.use(authenticateUser);
router.get('/recent', authorizeAnyPermission('VIEW_ACTIVITY', 'VIEW_REPORTS'), getRecentActivity);

module.exports = router;
