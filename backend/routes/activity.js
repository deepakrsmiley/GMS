const express = require('express');
const router = express.Router();
const { getRecentActivity } = require('../controllers/activityController');
const { authenticateUser, authorizeRoles } = require('../middleware/auth');

router.use(authenticateUser);
router.get('/recent', authorizeRoles('Super Admin', 'Admin'), getRecentActivity);

module.exports = router;
