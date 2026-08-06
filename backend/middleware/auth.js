const jwt = require("jsonwebtoken");
const asyncHandler = require("../utils/asyncHandler");
const ErrorResponse = require("../utils/errorResponse");
const User = require("../models/User");
const permissions = require("../config/permissions");
const { normalizeRole, rolesMatch, isSuperAdmin } = require("../utils/roles");

// Authenticate user middleware
const authenticateUser = asyncHandler(async (req, res, next) => {
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  } else if (req.cookies?.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return next(new ErrorResponse("Not authorized to access this route", 401));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Support both decoded.userId and decoded.id
    const userId = decoded.userId || decoded.id;

    const user = await User.findById(userId).populate("department");
    if (!user || !user.isActive) {
      return next(new ErrorResponse("User not found or inactive", 401));
    }

    // Check account locking
    if (user.accountLockedUntil && user.accountLockedUntil > new Date()) {
      return next(
        new ErrorResponse(
          "Account is locked. Please contact administrator.",
          401,
        ),
      );
    }

    // Verify token version (forces logout if password changed)
    const currentTokenVersion = decoded.tokenVersion || 0;
    const userTokenVersion = user.tokenVersion || 0;
    if (currentTokenVersion < userTokenVersion) {
      return next(
        new ErrorResponse("Session expired, please login again", 401),
      );
    }

    req.user = user;
    next();
  } catch (err) {
    return next(new ErrorResponse("Not authorized, token failed", 401));
  }
});

const authorizeRoles =
  (...roles) =>
  (req, res, next) => {
    const userRole = normalizeRole(req.user.role);
    const allowed = roles.some((role) => rolesMatch(userRole, role));

    if (!allowed) {
      return next(
        new ErrorResponse(
          `Role '${req.user.role}' is not authorized to access this resource`,
          403,
        ),
      );
    }

    next();
  };

const resolveUserPermissions = (user) => {
  const roleKey = normalizeRole(user.role);
  if (Array.isArray(user.permissions) && user.permissions.length > 0) {
    return user.permissions;
  }
  return permissions[roleKey] || [];
};

// Authorize permissions middleware (ALL listed codes required)
const authorizePermissions =
  (...requiredPermissions) =>
  (req, res, next) => {
    if (isSuperAdmin(req.user.role)) {
      return next();
    }

    const userPermissions = resolveUserPermissions(req.user);

    const hasPermission = requiredPermissions.every(
      (perm) => userPermissions.includes(perm) || userPermissions.includes("*"),
    );

    if (!hasPermission) {
      return next(
        new ErrorResponse(
          "You do not have permission to access this resource",
          403,
        ),
      );
    }
    next();
  };

/**
 * Allow if user has ANY of the listed permissions (or '*').
 * Specific codes are required — MANAGE_PHARMACY is not a silent bypass for
 * EDIT_MEDICINE / batch / stock actions (those must be listed or granted).
 */
const authorizeAnyPermission =
  (...requiredPermissions) =>
  (req, res, next) => {
    if (isSuperAdmin(req.user.role)) {
      return next();
    }

    const userPermissions = resolveUserPermissions(req.user);
    if (userPermissions.includes("*")) return next();

    const ok = requiredPermissions.some((perm) => userPermissions.includes(perm));
    if (!ok) {
      return next(
        new ErrorResponse(
          "You do not have permission to access this resource",
          403,
        ),
      );
    }
    next();
  };

// Aliases for compatibility with existing codebase
const protect = authenticateUser;
const authorize = authorizeRoles;

module.exports = {
  authenticateUser,
  authorizeRoles,
  authorizePermissions,
  authorizeAnyPermission,
  protect,
  authorize,
};
