const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const asyncHandler = require('../utils/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const sendTokenResponse = require('../utils/sendToken');
const logger = require('../utils/logger');

// Helper function to create audit logs
const createAuditLog = async (userId, action, description, req) => {
  try {
    await ActivityLog.create({
      user: userId,
      action,
      module: 'Authentication',
      description,
      ipAddress: req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1',
      userAgent: req.headers['user-agent'] || 'Unknown',
    });
  } catch (err) {
    logger.error(`Audit log creation failed: ${err.message}`);
  }
};

// Password policy validator
const validatePasswordStrength = (password) => {
  const minLength = 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  return password.length >= minLength && hasUppercase && hasLowercase && hasDigit && hasSpecial;
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = asyncHandler(async (req, res, next) => {
  logger.info('LOGIN REQUEST received');
  const { email, password } = req.body;

  if (!email || !password) {
    logger.warn('LOGIN rejected: missing email or password');
    return next(new ErrorResponse('Please provide email and password', 400));
  }

  const normalizedEmail = email.toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail }).select('+password');

  if (!user) {
    logger.warn(`LOGIN failed: user not found for ${normalizedEmail}`);
    return next(new ErrorResponse('Invalid credentials', 401));
  }

  // Check if account is locked
  if (user.accountLockedUntil && user.accountLockedUntil > new Date()) {
    const timeRemaining = Math.round((user.accountLockedUntil - new Date()) / 60000);
    logger.warn(`LOGIN failed: locked account ${normalizedEmail}`);
    return next(new ErrorResponse(`Account is temporarily locked. Try again in ${timeRemaining} minutes.`, 401));
  }

  if (!user.isActive) {
    logger.warn(`LOGIN failed: inactive account ${normalizedEmail}`);
    return next(new ErrorResponse('Account is deactivated. Contact administrator.', 401));
  }

  const isMatch = await user.matchPassword(password);
  logger.info(`LOGIN password match for ${normalizedEmail}: ${isMatch}`);

  if (!isMatch) {
    // Increment failed login attempts
    user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
    
    if (user.failedLoginAttempts >= 5) {
      user.accountLockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 mins lock
      await user.save({ validateBeforeSave: false });
      
      // Log lock event
      await createAuditLog(user._id, 'Account Lockout', 'Account locked due to 5 failed login attempts', req);
      
      return next(new ErrorResponse('Account locked due to multiple failed login attempts. Please try again after 15 minutes.', 401));
    }
    
    await user.save({ validateBeforeSave: false });
    
    // Log failed login
    await createAuditLog(user._id, 'Login Failure', 'Incorrect password entered', req);
    
    const attemptsLeft = 5 - user.failedLoginAttempts;
    return next(new ErrorResponse(`Invalid credentials. ${attemptsLeft} attempts remaining.`, 401));
  }

  // Reset lock and login attempts on success
  user.failedLoginAttempts = 0;
  user.accountLockedUntil = undefined;
  user.lastLogin = new Date();
  await user.save({ validateBeforeSave: false });

  // Log successful login
  await createAuditLog(user._id, 'Login Success', 'User logged in successfully', req);

  logger.info(`LOGIN successful for ${normalizedEmail} (${user.role})`);
  sendTokenResponse(user, 200, res);
});

// @desc    Logout user / clear cookie
// @route   GET /api/auth/logout
// @access  Private
exports.logout = asyncHandler(async (req, res) => {
  const isLocalhost = (process.env.CLIENT_URL || '').includes('localhost');
  const isProduction = process.env.NODE_ENV === 'production' && !isLocalhost;

  // Log logout if authenticated
  if (req.user) {
    await createAuditLog(req.user._id, 'Logout', 'User logged out', req);
  }

  res.cookie('token', 'none', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
  });

  res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
});

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).populate('department');

  res.status(200).json({
    success: true,
    data: user,
  });
});

// @desc    Update password (when logged in)
// @route   PUT /api/auth/updatepassword
// @access  Private
exports.updatePassword = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id).select('+password');

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  if (!(await user.matchPassword(req.body.currentPassword))) {
    return next(new ErrorResponse('Current password incorrect', 401));
  }

  const { newPassword, confirmNewPassword } = req.body;

  if (newPassword !== confirmNewPassword) {
    return next(new ErrorResponse('New passwords do not match', 400));
  }

  if (!validatePasswordStrength(newPassword)) {
    return next(new ErrorResponse('Password policy not met: Must be at least 8 characters and contain uppercase, lowercase, number, and special character.', 400));
  }

  // Hash and save new password
  user.password = newPassword;
  user.passwordChangedAt = new Date();
  user.tokenVersion = (user.tokenVersion || 0) + 1; // Invalidate current tokens
  await user.save();

  // Audit Log
  await createAuditLog(user._id, 'Password Change', 'Password updated successfully when logged in', req);

  // Clear cookie and force re-login by sending response indicating password changed
  res.cookie('token', 'none', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
  });

  res.status(200).json({
    success: true,
    message: 'Password changed successfully.',
  });
});

// @desc    Forgot Password - Request OTP
// @route   POST /api/auth/forgotpassword
// @access  Public
exports.forgotPassword = asyncHandler(async (req, res, next) => {
  const { email } = req.body;

  if (!email) {
    return next(new ErrorResponse('Please provide email address', 400));
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() });

  if (!user) {
    return next(new ErrorResponse('No user found with that email address', 404));
  }

  // Generate 6-digit verification code (OTP)
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  
  // Hash and save code to user schema with 10 minutes expiry
  const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
  user.resetPasswordOTP = otpHash;
  user.resetPasswordOTPExpire = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  await user.save({ validateBeforeSave: false });

  // Console log in all modes
  console.log(`\n--- RESET PASSWORD OTP FOR ${user.email}: ${otp} ---\n`);

  // Respond
  res.status(200).json({
    success: true,
    message: 'Verification code sent to email (mock). Check console/logs.',
    // Return code in response under development mode for convenience
    otp: process.env.NODE_ENV === 'development' ? otp : undefined
  });
});

// @desc    Reset Password using OTP
// @route   POST /api/auth/resetpassword
// @access  Public
exports.resetPassword = asyncHandler(async (req, res, next) => {
  const { email, otp, newPassword, confirmNewPassword } = req.body;

  if (!email || !otp || !newPassword || !confirmNewPassword) {
    return next(new ErrorResponse('Please provide email, verification code, new password and confirmation', 400));
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');

  if (!user) {
    return next(new ErrorResponse('Invalid email address', 400));
  }

  // Hash OTP and verify
  const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
  
  if (user.resetPasswordOTP !== otpHash || user.resetPasswordOTPExpire < new Date()) {
    return next(new ErrorResponse('Invalid or expired verification code', 400));
  }

  if (newPassword !== confirmNewPassword) {
    return next(new ErrorResponse('New passwords do not match', 400));
  }

  if (!validatePasswordStrength(newPassword)) {
    return next(new ErrorResponse('Password policy not met: Must be at least 8 characters and contain uppercase, lowercase, number, and special character.', 400));
  }

  // Reset attempts, update password, clear OTP, change token version
  user.password = newPassword;
  user.resetPasswordOTP = undefined;
  user.resetPasswordOTPExpire = undefined;
  user.failedLoginAttempts = 0;
  user.accountLockedUntil = undefined;
  user.passwordChangedAt = new Date();
  user.tokenVersion = (user.tokenVersion || 0) + 1; // Forces logout from all devices
  await user.save();

  // Audit Log
  await createAuditLog(user._id, 'Password Reset', 'Password reset using OTP verification code', req);

  res.status(200).json({
    success: true,
    message: 'Password changed successfully.',
  });
});