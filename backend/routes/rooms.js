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
const { authenticateUser, authorizeAnyPermission } = require('../middleware/auth');

router.use(authenticateUser);

const MANAGE_ROOMS = authorizeAnyPermission('MANAGE_ROOMS', 'MANAGE_BEDS');

router.get('/dashboard', getRoomDashboard);
router.get('/available', getAvailableRooms);

router.route('/')
  .get(getRooms)
  .post(MANAGE_ROOMS, createRoom);

router.route('/:id')
  .put(MANAGE_ROOMS, updateRoom)
  .delete(MANAGE_ROOMS, deleteRoom);

module.exports = router;
