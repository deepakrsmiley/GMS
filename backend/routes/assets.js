const express = require('express');
const router = express.Router();
const {
  getAssets,
  getAsset,
  createAsset,
  updateAsset,
  deleteAsset,
  getAssetDashboard,
} = require('../controllers/assetController');
const { authenticateUser, authorizeRoles } = require('../middleware/auth');

router.use(authenticateUser);

const ASSET_ROLES = ['Super Admin', 'Admin'];
const ASSET_VIEW_ROLES = ['Super Admin', 'Admin', 'Doctor', 'Nurse', 'Pharmacist', 'Lab Technician', 'Receptionist'];

router.get('/dashboard', authorizeRoles(...ASSET_VIEW_ROLES), getAssetDashboard);

router.route('/')
  .get(authorizeRoles(...ASSET_VIEW_ROLES), getAssets)
  .post(authorizeRoles(...ASSET_ROLES), createAsset);

router.route('/:id')
  .get(authorizeRoles(...ASSET_VIEW_ROLES), getAsset)
  .put(authorizeRoles(...ASSET_ROLES), updateAsset)
  .delete(authorizeRoles(...ASSET_ROLES), deleteAsset);

module.exports = router;
