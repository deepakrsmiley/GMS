const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { resolveOrganizationContext, orgRoom } = require('./tenant');
const { isSuperAdmin } = require('../utils/roles');
const logger = require('../utils/logger');

const attachSocketOrganization = (io) => {
  io.use(async (socket, next) => {
    try {
      const header = socket.handshake.headers?.authorization;
      const token = socket.handshake.auth?.token
        || (header && header.startsWith('Bearer ') ? header.split(' ')[1] : null);
      if (!token) return next(new Error('Not authorized'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId || decoded.id);
      if (!user || !user.isActive) return next(new Error('Not authorized'));

      const context = await resolveOrganizationContext(user, {
        activeOrganizationId: isSuperAdmin(user.role) ? decoded.activeOrganizationId : undefined,
      });

      socket.data.userId = String(user._id);
      socket.data.role = user.role;
      socket.data.organizationId = context.organizationId ? String(context.organizationId) : null;
      next();
    } catch (err) {
      logger.warn(`Socket auth failed: ${err.message}`);
      next(new Error('Not authorized'));
    }
  });

  io.on('connection', (socket) => {
    const { userId, role, organizationId } = socket.data || {};
    logger.info(`Socket connected: ${socket.id}`);

    if (userId) socket.join(orgRoom.user(userId));
    if (isSuperAdmin(role)) socket.join('role:Super Admin');
    if (organizationId) {
      socket.join(orgRoom.all(organizationId));
      socket.join(orgRoom.chat(organizationId));
      socket.join(orgRoom.branding(organizationId));
      if (role) socket.join(orgRoom.role(organizationId, role));
      if (userId) socket.join(`doctor:${userId}`);
    }

    socket.on('join:room', (room) => {
      const allowed = new Set([
        userId ? orgRoom.user(userId) : null,
        userId ? `doctor:${userId}` : null,
        organizationId ? orgRoom.chat(organizationId) : null,
        organizationId && role ? orgRoom.role(organizationId, role) : null,
        isSuperAdmin(role) ? 'role:Super Admin' : null,
      ].filter(Boolean));
      if (allowed.has(room)) socket.join(room);
    });

    socket.on('doctor:available', (data) => {
      if (organizationId) {
        io.to(orgRoom.all(organizationId)).emit('doctor:status', data);
      }
    });

    socket.on('disconnect', () => {
      logger.info(`Socket disconnected: ${socket.id}`);
    });
  });
};

module.exports = { attachSocketOrganization };
