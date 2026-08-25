const express = require('express');
const router = express.Router();
const {
  getBeds,
  getBedOccupancy,
  updateBedStatus,
  updateBed,
  createBed,
  deleteBed,
  getWards,
  createWard,     // NEW
  updateWard,     // NEW
  deleteWard,     // NEW
} = require('../controllers/bedController');
const { authenticateUser, authorizeAnyPermission } = require('../middleware/auth');
const { requireHospitalModule } = require('../middleware/hospitalModule');

router.use(authenticateUser);
router.use(requireHospitalModule('ip'));

const MANAGE_WARDS = authorizeAnyPermission('MANAGE_WARDS', 'MANAGE_BEDS');
const CREATE_BED = authorizeAnyPermission('CREATE_BED', 'MANAGE_BEDS');
const UPDATE_BED = authorizeAnyPermission('UPDATE_BED', 'MANAGE_BEDS');
const DELETE_BED = authorizeAnyPermission('DELETE_BED', 'MANAGE_BEDS');
const UPDATE_STATUS = authorizeAnyPermission('UPDATE_BED_STATUS', 'MANAGE_BEDS', 'VIEW_NURSE_STATION');

router.get('/occupancy', getBedOccupancy);

// ===== WARD ROUTES =====
router.get('/wards', getWards);
router.post('/wards', MANAGE_WARDS, createWard);
router.put('/wards/:id', MANAGE_WARDS, updateWard);
router.delete('/wards/:id', MANAGE_WARDS, deleteWard);

// ===== BED ROUTES =====
router.route('/')
  .get(getBeds)
  .post(CREATE_BED, createBed);

router.put('/:id/status', UPDATE_STATUS, updateBedStatus);
router.route('/:id')
  .put(UPDATE_BED, updateBed)
  .delete(DELETE_BED, deleteBed);

module.exports = router;