const express = require('express');
const router = express.Router();
const {
  getRooms,
  getAvailableRooms,
  getRoomDashboard,
  createRoom,
  updateRoom,
  deleteRoom,
} = require('../controllers/roomController');
const { authenticateUser, authorizeRoles } = require('../middleware/auth');

router.use(authenticateUser);

router.get('/dashboard', getRoomDashboard);
router.get('/available', getAvailableRooms);

router.route('/')
  .get(getRooms)
  .post(authorizeRoles('Super Admin', 'Admin'), createRoom);

router.route('/:id')
  .put(authorizeRoles('Super Admin', 'Admin'), updateRoom)
  .delete(authorizeRoles('Super Admin', 'Admin'), deleteRoom);

module.exports = router;
