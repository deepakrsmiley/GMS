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
const { authenticateUser, authorizeRoles } = require('../middleware/auth');

router.use(authenticateUser);

router.get('/occupancy', getBedOccupancy);

// ===== WARD ROUTES =====
router.get('/wards', getWards);
router.post('/wards', authorizeRoles('Super Admin', 'Admin'), createWard);           // NEW: Create ward
router.put('/wards/:id', authorizeRoles('Super Admin', 'Admin'), updateWard);        // NEW: Update ward
router.delete('/wards/:id', authorizeRoles('Super Admin', 'Admin'), deleteWard);     // NEW: Delete ward

// ===== BED ROUTES =====
router.route('/')
  .get(getBeds)
  .post(authorizeRoles('Super Admin', 'Admin', 'Nurse'), createBed);

router.put('/:id/status', authorizeRoles('Super Admin', 'Admin', 'Nurse', 'Doctor'), updateBedStatus);
router.route('/:id')
  .put(authorizeRoles('Super Admin', 'Admin'), updateBed)
  .delete(authorizeRoles('Super Admin', 'Admin'), deleteBed);

module.exports = router;