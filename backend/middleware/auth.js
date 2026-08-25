const jwt = require("jsonwebtoken");
const asyncHandler = require("../utils/asyncHandler");
const ErrorResponse = require("../utils/errorResponse");
const User = require("../models/User");
const logger = require("../utils/logger");
const { resolveEffectivePermissions } = require("../config/permissions");
const { normalizeRole, rolesMatch, isSuperAdmin } = require("../utils/roles");
const { resolveOrganizationContext } = require("./tenant");
const {
  bindOrganizationContext,
  setRequestOrganizationContext,
} = require("./tenantContext");

const isJwtError = (err) =>
  err?.name === "JsonWebTokenError" ||
  err?.name === "TokenExpiredError" ||
  err?.name === "NotBeforeError";

const authenticateUser = asyncHandler(async (req, res, next) => {
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  } else if (req.cookies?.token && req.cookies.token !== "none") {
    token = req.cookies.token;
  }

  if (!token) {
    return next(new ErrorResponse("Not authorized to access this route", 401));
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    logger.warn(`JWT verify failed (${err.name}): ${req.originalUrl}`);
    return next(new ErrorResponse("Not authorized, token failed", 401));
  }

  const userId = decoded.userId || decoded.id;
  const user = await User.findById(userId)
    .select("-password -profilePhoto -resetPasswordOTP -resetPasswordToken")
    .setOptions({ skipOrganizationFilter: true });

  if (!user || !user.isActive) {
    return next(new ErrorResponse("User not found or inactive", 401));
  }

  if (user.accountLockedUntil && user.accountLockedUntil > new Date()) {
    return next(
      new ErrorResponse(
        "Account is locked. Please contact administrator.",
        401,
      ),
    );
  }

  const currentTokenVersion = decoded.tokenVersion || 0;
  const userTokenVersion = user.tokenVersion || 0;
  if (currentTokenVersion < userTokenVersion) {
    return next(
      new ErrorResponse("Session expired, please login again", 401),
    );
  }

  if (user.department) {
    try {
      await user.populate({
        path: "department",
        select: "name code",
        options: { skipOrganizationFilter: true },
      });
    } catch (err) {
      logger.warn(`Auth department populate skipped: ${err.message}`);
    }
  }

  // Hospital tenancy is taken from the user record, never from a client JWT claim.
  req.authToken = {
    userId: decoded.userId || decoded.id,
    role: decoded.role,
    tokenVersion: decoded.tokenVersion,
    activeOrganizationId: isSuperAdmin(user.role)
      ? decoded.activeOrganizationId
      : undefined,
  };
  req.user = user;

  let context;
  try {
    context = await resolveOrganizationContext(user, req.authToken);
  } catch (err) {
    if (err instanceof ErrorResponse || err.statusCode) return next(err);
    if (isJwtError(err)) {
      return next(new ErrorResponse("Not authorized, token failed", 401));
    }
    logger.error(`Organization context failed: ${err.message}`);
    return next(err);
  }
  setRequestOrganizationContext(req, context);

  await bindOrganizationContext(context, res, next);
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

const resolveUserPermissions = (user) =>
  resolveEffectivePermissions(normalizeRole(user.role), user.permissions);

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

const protect = authenticateUser;
const authorize = authorizeRoles;

module.exports = {
  authenticateUser,
  authorizeRoles,
  authorizePermissions,
  authorizeAnyPermission,
  resolveUserPermissions,
  protect,
  authorize,
};
