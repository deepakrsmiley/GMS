const express = require('express');
const router = express.Router();
const {
  getDirectory,
  getMessages,
  getConversations,
  getUnread,
  postMessage,
  markRead,
} = require('../controllers/chatController');
const { authenticateUser } = require('../middleware/auth');

router.use(authenticateUser);

router.get('/directory', getDirectory);
router.get('/messages', getMessages);
router.get('/conversations', getConversations);
router.get('/unread', getUnread);
router.post('/messages', postMessage);
router.post('/read', markRead);

module.exports = router;
