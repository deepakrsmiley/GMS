const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const asyncHandler = require('../utils/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const sendTokenResponse = require('../utils/sendToken');
const logger = require('../utils/logger');
const { serializeUser, parseDataUriPhoto } = require('../utils/userAvatar');
const { sanitizeEnabledModules } = require('../config/hospitalModules');
const { isSuperAdmin } = require('../utils/roles');
const { resolveOrganizationContext } = require('../middleware/tenant');
const { organizationSnapshot, isClientOrg } = require('../utils/hospitalA');

// Helper function to create audit logs (userId may be null for unknown-email failures)
const createAuditLog = async (userId, action, description, req, metadata = undefined) => {
  try {
    const payload = {
      action,
      module: 'Authentication',
      description,
      ipAddress: req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1',
      userAgent: req.headers['user-agent'] || 'Unknown',
    };
    if (userId) payload.user = userId;
    if (metadata) payload.metadata = metadata;
    await ActivityLog.create(payload);
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
  const { email, password, organizationId: loginOrgId } = req.body;

  if (!email || !password) {
    logger.warn('LOGIN rejected: missing email or password');
    return next(new ErrorResponse('Please provide email and password', 400));
  }

  const normalizedEmail = email.toLowerCase().trim();
  const matches = await User.find({ email: normalizedEmail })
    .select('+password')
    .populate('organizationId', 'name code status logo enabledModules kind');

  if (!matches.length) {
    logger.warn(`LOGIN failed: user not found for ${normalizedEmail}`);
    await createAuditLog(null, 'Login Failure', 'Unknown email login attempt', req, {
      email: normalizedEmail,
      reason: 'user_not_found',
    });
    return next(new ErrorResponse('Invalid credentials', 401));
  }

  let candidates = matches;
  if (loginOrgId) {
    candidates = matches.filter((u) => {
      const oid = u.organizationId?._id || u.organizationId;
      return oid && String(oid) === String(loginOrgId);
    });
    if (!candidates.length) {
      return next(new ErrorResponse('No account found for that email at the selected hospital', 401));
    }
  } else if (matches.length > 1) {
    const hospitals = matches
      .filter((u) => !isSuperAdmin(u.role) && u.organizationId)
      .map((u) => ({
        organizationId: String(u.organizationId._id || u.organizationId),
        name: u.organizationId.name || 'Hospital',
        code: u.organizationId.code || '',
      }));
    const uniqueHospitals = [...new Map(hospitals.map((h) => [h.organizationId, h])).values()];
    if (uniqueHospitals.length > 1) {
      return res.status(409).json({
        success: false,
        message: 'This email is used at more than one hospital. Select your hospital to continue.',
        requiresOrganization: true,
        hospitals: uniqueHospitals,
      });
    }
    if (uniqueHospitals.length === 1) {
      candidates = matches.filter((u) => {
        const oid = u.organizationId?._id || u.organizationId;
        return oid && String(oid) === uniqueHospitals[0].organizationId;
      });
    }
  }

  const passwordMatches = [];
  for (const candidate of candidates) {
    if (await candidate.matchPassword(password)) passwordMatches.push(candidate);
  }

  if (!passwordMatches.length) {
    const user = candidates[0];
    if (user) {
      if (user.accountLockedUntil && user.accountLockedUntil > new Date()) {
        const timeRemaining = Math.round((user.accountLockedUntil - new Date()) / 60000);
        logger.warn(`LOGIN failed: locked account ${normalizedEmail}`);
        return next(new ErrorResponse(`Account is temporarily locked. Try again in ${timeRemaining} minutes.`, 401));
      }
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      if (user.failedLoginAttempts >= 5) {
        user.accountLockedUntil = new Date(Date.now() + 15 * 60 * 1000);
        await user.save({ validateBeforeSave: false });
        await createAuditLog(user._id, 'Account Lockout', 'Account locked due to 5 failed login attempts', req);
        return next(new ErrorResponse('Account locked due to multiple failed login attempts. Please try again after 15 minutes.', 401));
      }
      await user.save({ validateBeforeSave: false });
      await createAuditLog(user._id, 'Login Failure', 'Incorrect password entered', req);
      const attemptsLeft = 5 - user.failedLoginAttempts;
      return next(new ErrorResponse(`Invalid credentials. ${attemptsLeft} attempts remaining.`, 401));
    }
    return next(new ErrorResponse('Invalid credentials', 401));
  }

  if (passwordMatches.length > 1) {
    const hospitals = passwordMatches
      .filter((u) => !isSuperAdmin(u.role) && u.organizationId)
      .map((u) => ({
        organizationId: String(u.organizationId._id || u.organizationId),
        name: u.organizationId.name || 'Hospital',
        code: u.organizationId.code || '',
      }));
    const uniqueHospitals = [...new Map(hospitals.map((h) => [h.organizationId, h])).values()];
    if (uniqueHospitals.length > 1) {
      return res.status(409).json({
        success: false,
        message: 'This email is used at more than one hospital. Select your hospital to continue.',
        requiresOrganization: true,
        hospitals: uniqueHospitals,
      });
    }
  }

  const user = passwordMatches[0];

  if (user.accountLockedUntil && user.accountLockedUntil > new Date()) {
    const timeRemaining = Math.round((user.accountLockedUntil - new Date()) / 60000);
    logger.warn(`LOGIN failed: locked account ${normalizedEmail}`);
    return next(new ErrorResponse(`Account is temporarily locked. Try again in ${timeRemaining} minutes.`, 401));
  }

  if (!user.isActive) {
    logger.warn(`LOGIN failed: inactive account ${normalizedEmail}`);
    return next(new ErrorResponse('Account is deactivated. Contact administrator.', 401));
  }

  if (!isSuperAdmin(user.role) && user.organizationId && user.organizationId.status && user.organizationId.status !== 'active') {
    logger.warn(`LOGIN failed: deactivated organization for ${normalizedEmail}`);
    return next(new ErrorResponse('Organization is deactivated. Contact GMS Super Admin.', 401));
  }

  logger.info(`LOGIN password match for ${normalizedEmail}: true`);

  // Reset lock and login attempts on success
  const ip = req.ip || req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || '';
  const ua = req.headers?.['user-agent'] || '';
  const prevIp = user.lastLoginIp;
  const prevUa = user.lastLoginUserAgent;
  const isNewDevice = !!(prevIp || prevUa) && (prevIp !== String(ip) || prevUa !== String(ua));

  user.failedLoginAttempts = 0;
  user.accountLockedUntil = undefined;
  user.lastLogin = new Date();
  user.lastLoginIp = String(ip);
  user.lastLoginUserAgent = String(ua).slice(0, 400);
  await user.save({ validateBeforeSave: false });

  // Log successful login
  await createAuditLog(user._id, 'Login Success', 'User logged in successfully', req);

  if (isNewDevice) {
    try {
        const { notifyRoles } = require('../utils/notify');
        await notifyRoles(req, {
          roles: ['Super Admin'],
          title: 'Login from new device',
          message: `${user.name} (${user.role}) signed in from a new IP/device`,
          type: 'system',
          link: '/masters/staff',
          relatedId: user._id,
          relatedModel: 'User',
          organizationId: user.organizationId,
        });
    } catch (_) { /* ignore */ }
  }

  logger.info(`LOGIN successful for ${normalizedEmail} (${user.role})`);

  // GMS Super Admin always lands on the empty GMS console. Hospital data is
  // only loaded after they explicitly open a client from the switcher.
  const context = await resolveOrganizationContext(user, {});

  sendTokenResponse(user, 200, res, {
    activeOrganizationId: context.isSuperAdmin ? context.organizationId : undefined,
    organization: organizationSnapshot(context.organization),
    req: {
      organization: context.organization,
      organizationId: context.organizationId,
    },
  });
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
  const user = await User.findById(req.user.id)
    .populate({ path: 'department', options: { skipOrganizationFilter: true } })
    .populate('organizationId', 'name code status logo enabledModules kind');

  const data = serializeUser(user);
  if (data) {
    const selectedClient = req.organization && isClientOrg(req.organization) ? req.organization : null;
    if (isSuperAdmin(user.role) && !selectedClient) {
      data.organizationId = null;
      data.organization = null;
      data.mustSelectOrganization = true;
    } else {
      const orgDoc = selectedClient || req.organization || (user.organizationId && user.organizationId.name ? user.organizationId : null);
      data.organizationId = req.organizationId || orgDoc?._id || user.organizationId?._id || user.organizationId || null;
      data.organization = orgDoc
        ? {
            _id: orgDoc._id,
            name: orgDoc.name,
            code: orgDoc.code,
            status: orgDoc.status,
            logo: orgDoc.logo || '',
            kind: orgDoc.kind || (String(orgDoc.code || '').toUpperCase() === 'GMS' ? 'platform' : 'client'),
            enabledModules: sanitizeEnabledModules(orgDoc.enabledModules),
          }
        : null;
      data.mustSelectOrganization = !!req.tenant?.mustSelectOrganization;
    }
  }

  res.status(200).json({
    success: true,
    data,
  });
});

// @desc    Update own profile (name, phone, email, professional details)
// @route   PUT /api/auth/updateprofile
// @access  Private
exports.updateProfile = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id);
  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  const {
    name,
    email,
    phone,
    specialization,
    qualification,
    experience,
    shift,
    consultationFee,
    followUpFee,
    morningSessionStart,
    morningSessionEnd,
    eveningSessionStart,
    eveningSessionEnd,
    avatar,
  } = req.body;

  if (name !== undefined) {
    const trimmed = String(name || '').trim();
    if (!trimmed) return next(new ErrorResponse('Name is required', 400));
    user.name = trimmed;
  }

  if (email !== undefined) {
    const nextEmail = String(email || '').toLowerCase().trim();
    if (!nextEmail || !/^\S+@\S+\.\S+$/.test(nextEmail)) {
      return next(new ErrorResponse('Valid email is required', 400));
    }
    if (nextEmail !== user.email) {
      const takenFilter = {
        email: nextEmail,
        _id: { $ne: user._id },
      };
      if (user.organizationId) takenFilter.organizationId = user.organizationId;
      else takenFilter.$or = [{ organizationId: null }, { organizationId: { $exists: false } }];
      const taken = await User.findOne(takenFilter);
      if (taken) return next(new ErrorResponse('Email already in use at this hospital', 400));
      user.email = nextEmail;
    }
  }

  if (phone !== undefined) user.phone = String(phone || '').trim();
  if (specialization !== undefined) user.specialization = String(specialization || '').trim();
  if (qualification !== undefined) user.qualification = String(qualification || '').trim();
  if (experience !== undefined) {
    const n = Number(experience);
    user.experience = Number.isFinite(n) ? n : user.experience;
  }
  if (shift !== undefined && ['morning', 'afternoon', 'night', 'rotating'].includes(shift)) {
    user.shift = shift;
  }
  if (consultationFee !== undefined) {
    const n = Number(consultationFee);
    if (Number.isFinite(n) && n >= 0) user.consultationFee = n;
  }
  if (followUpFee !== undefined) {
    const n = Number(followUpFee);
    if (Number.isFinite(n) && n >= 0) user.followUpFee = n;
  }
  if (morningSessionStart !== undefined) user.morningSessionStart = String(morningSessionStart || '');
  if (morningSessionEnd !== undefined) user.morningSessionEnd = String(morningSessionEnd || '');
  if (eveningSessionStart !== undefined) user.eveningSessionStart = String(eveningSessionStart || '');
  if (eveningSessionEnd !== undefined) user.eveningSessionEnd = String(eveningSessionEnd || '');

  // Photo: store binary Buffer in MongoDB (profilePhoto)
  if (avatar !== undefined) {
    if (!avatar) {
      user.set('profilePhoto', undefined);
      user.avatar = '';
      user.markModified('profilePhoto');
    } else {
      const parsed = parseDataUriPhoto(avatar);
      if (parsed.error) return next(new ErrorResponse(parsed.error, 400));
      user.profilePhoto = { data: parsed.data, contentType: parsed.contentType };
      user.avatar = '';
      user.markModified('profilePhoto');
    }
  }

  await user.save();
  await createAuditLog(user._id, 'Profile Update', 'User updated their own profile', req);

  // Re-load so Buffer is read fresh from MongoDB and avatar data-URI is rebuilt
  const fresh = await User.findById(user._id).populate('department');
  res.status(200).json({
    success: true,
    message: 'Profile updated successfully',
    data: serializeUser(fresh),
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

  try {
    const { notifyRoles } = require('../utils/notify');
    await notifyRoles(req, {
      roles: ['Super Admin'],
      title: 'Password changed',
      message: `${user.name} (${user.role}) changed their password`,
      type: 'system',
      link: '/masters/staff',
      relatedId: user._id,
      relatedModel: 'User',
      organizationId: user.organizationId,
    });
  } catch (_) { /* ignore */ }

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
  const { email, organizationId } = req.body;

  if (!email) {
    return next(new ErrorResponse('Please provide email address', 400));
  }

  const normalizedEmail = email.toLowerCase().trim();
  const matches = await User.find({ email: normalizedEmail })
    .populate('organizationId', 'name code');

  if (!matches.length) {
    return next(new ErrorResponse('No user found with that email address', 404));
  }

  let user = matches[0];
  if (organizationId) {
    user = matches.find((u) => {
      const oid = u.organizationId?._id || u.organizationId;
      return oid && String(oid) === String(organizationId);
    });
    if (!user) return next(new ErrorResponse('No user found with that email at the selected hospital', 404));
  } else if (matches.length > 1) {
    const hospitals = matches
      .filter((u) => u.organizationId)
      .map((u) => ({
        organizationId: String(u.organizationId._id || u.organizationId),
        name: u.organizationId.name || 'Hospital',
        code: u.organizationId.code || '',
      }));
    const uniqueHospitals = [...new Map(hospitals.map((h) => [h.organizationId, h])).values()];
    if (uniqueHospitals.length > 1) {
      return res.status(409).json({
        success: false,
        message: 'This email is used at more than one hospital. Select your hospital to continue.',
        requiresOrganization: true,
        hospitals: uniqueHospitals,
      });
    }
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

  // Respond — OTP is also sent to Super Admin notifications (no email server required yet).
  // In non-production, return OTP in the response so the login UI can show it.
  const exposeOtp =
    process.env.NODE_ENV !== 'production' || process.env.ALLOW_OTP_IN_RESPONSE === 'true';

  try {
    const { notifyRoles } = require('../utils/notify');
    await notifyRoles(req, {
      roles: ['Admin'],
      title: 'Password reset OTP',
      message: `${user.name} (${user.email}) — OTP ${otp} (valid 10 minutes). Share only with this staff member.`,
      type: 'system',
      link: '/masters/staff',
      relatedId: user._id,
      relatedModel: 'User',
      organizationId: user.organizationId,
    });
    await notifyRoles(req, {
      roles: ['Super Admin'],
      title: 'Password reset OTP',
      message: `${user.name} (${user.email}) — OTP ${otp} (valid 10 minutes). Share only with this staff member.`,
      type: 'system',
      link: '/masters/staff',
      relatedId: user._id,
      relatedModel: 'User',
    });
  } catch (_) { /* ignore */ }

  res.status(200).json({
    success: true,
    message: exposeOtp
      ? 'Verification code generated. Enter it below to set a new password.'
      : 'Verification code sent. Ask Super Admin for the OTP from notifications, or check server logs.',
    otp: exposeOtp ? otp : undefined,
  });
});

// @desc    Reset Password using OTP
// @route   POST /api/auth/resetpassword
// @access  Public
exports.resetPassword = asyncHandler(async (req, res, next) => {
  const { email, otp, newPassword, confirmNewPassword, organizationId } = req.body;

  if (!email || !otp || !newPassword || !confirmNewPassword) {
    return next(new ErrorResponse('Please provide email, verification code, new password and confirmation', 400));
  }

  const normalizedEmail = email.toLowerCase().trim();
  const matches = await User.find({ email: normalizedEmail }).select('+password');
  let user = matches[0];
  if (organizationId) {
    user = matches.find((u) => u.organizationId && String(u.organizationId) === String(organizationId));
  } else if (matches.length > 1) {
    return next(new ErrorResponse('This email is used at more than one hospital. Select your hospital and try again.', 400));
  }

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

  try {
    const { notifyRoles } = require('../utils/notify');
    await notifyRoles(req, {
      roles: ['Super Admin'],
      title: 'Password reset completed',
      message: `${user.name} (${user.email}) reset their password via OTP`,
      type: 'system',
      link: '/masters/staff',
      relatedId: user._id,
      relatedModel: 'User',
      organizationId: user.organizationId,
    });
  } catch (_) { /* ignore */ }

  res.status(200).json({
    success: true,
    message: 'Password changed successfully.',
  });
});