const express = require('express');
const router = express.Router();
const { 
  login, 
  logout, 
  getMe, 
  updatePassword, 
  forgotPassword, 
  resetPassword 
} = require('../controllers/authController');
const { authenticateUser } = require('../middleware/auth');

router.post('/login', login);
router.get('/logout', authenticateUser, logout);
router.get('/me', authenticateUser, getMe);
router.put('/updatepassword', authenticateUser, updatePassword);
router.post('/forgotpassword', forgotPassword);
router.post('/resetpassword', resetPassword);

module.exports = router;
