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
const { authenticateUser, authorizeAnyPermission } = require('../middleware/auth');

router.use(authenticateUser);

// Full asset master (dashboard / edit) stays VIEW_ASSETS.
// Staff who only raise complaints still need a read-only asset list to pick equipment.
const VIEW_ASSETS = authorizeAnyPermission('VIEW_ASSETS', 'MANAGE_ASSETS', 'VIEW_BEMS');
const LIST_ASSETS_FOR_COMPLAINTS = authorizeAnyPermission(
  'VIEW_ASSETS',
  'MANAGE_ASSETS',
  'VIEW_BEMS',
  'VIEW_ASSET_COMPLAINTS',
  'CREATE_ASSET_COMPLAINT',
  'MANAGE_ASSET_COMPLAINTS',
);
const MANAGE_ASSETS = authorizeAnyPermission('MANAGE_ASSETS', 'CREATE_ASSET', 'UPDATE_ASSET');
const DELETE_ASSETS = authorizeAnyPermission('DELETE_ASSET', 'MANAGE_ASSETS');

router.get('/dashboard', VIEW_ASSETS, getAssetDashboard);

router.route('/')
  .get(LIST_ASSETS_FOR_COMPLAINTS, getAssets)
  .post(MANAGE_ASSETS, createAsset);

router.route('/:id')
  .get(VIEW_ASSETS, getAsset)
  .put(MANAGE_ASSETS, updateAsset)
  .delete(DELETE_ASSETS, deleteAsset);

module.exports = router;
