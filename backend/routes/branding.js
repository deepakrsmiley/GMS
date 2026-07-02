const express = require('express');
const router = express.Router();
const { getBranding, updateBranding } = require('../controllers/brandingController');
const { authenticateUser, authorizeRoles } = require('../middleware/auth');

router.get('/', getBranding);
router.put('/', authenticateUser, authorizeRoles('Super Admin'), updateBranding);

module.exports = router;
