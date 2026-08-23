const express = require('express');
const router = express.Router();
const { getBranding, updateBranding } = require('../controllers/brandingController');
const { authenticateUser, authorizeAnyPermission } = require('../middleware/auth');

router.get('/', getBranding);
router.put('/', authenticateUser, authorizeAnyPermission('MANAGE_BRANDING', 'MANAGE_SETTINGS'), updateBranding);

module.exports = router;
