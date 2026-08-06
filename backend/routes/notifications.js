const express = require('express');
const router = express.Router();
const {
  getMyNotifications,
  getUnreadCount,
  markRead,
  deleteNotification,
} = require('../controllers/notificationController');
const { authenticateUser } = require('../middleware/auth');

router.use(authenticateUser);

router.get('/', getMyNotifications);
router.get('/unread-count', getUnreadCount);
router.post('/read', markRead);
router.delete('/:id', deleteNotification);

module.exports = router;
