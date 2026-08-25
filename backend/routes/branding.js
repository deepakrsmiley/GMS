const express = require('express');
const router = express.Router();
const { getBranding, updateBranding, getPublicBranding } = require('../controllers/brandingController');
const { authenticateUser, authorizeAnyPermission } = require('../middleware/auth');

router.get('/public', getPublicBranding);
router.get('/', authenticateUser, getBranding);
router.put('/', authenticateUser, authorizeAnyPermission('MANAGE_BRANDING', 'MANAGE_SETTINGS'), updateBranding);

module.exports = router;
