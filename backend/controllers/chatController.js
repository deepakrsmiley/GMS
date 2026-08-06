const asyncHandler = require('../utils/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const ChatMessage = require('../models/ChatMessage');
const User = require('../models/User');

const STAFF_ROLES = [
  'Super Admin',
  'Admin',
  'Doctor',
  'Receptionist',
  'Pharmacist',
  'Lab Technician',
  'Accountant',
  'Nurse',
];

const assertStaff = (req, next) => {
  if (!STAFF_ROLES.includes(req.user?.role)) {
    return next(new ErrorResponse('Chat is available for hospital staff only', 403));
  }
  return null;
};

const populateMsg = (q) =>
  q
    .populate('sender', 'name role email')
    .populate('mentions', 'name role')
    .populate('participants', 'name role');

const serialize = (m) => ({
  _id: m._id,
  body: m.body,
  channel: m.channel,
  createdAt: m.createdAt,
  sender: m.sender
    ? { _id: m.sender._id, name: m.sender.name, role: m.sender.role, email: m.sender.email }
    : null,
  mentions: (m.mentions || []).map((u) => ({ _id: u._id, name: u.name, role: u.role })),
  participants: (m.participants || []).map((u) => ({ _id: u._id, name: u.name, role: u.role })),
  readBy: (m.readBy || []).map((id) => String(id)),
});

/** Active staff directory for @mentions and DM picker */
exports.getDirectory = asyncHandler(async (req, res, next) => {
  if (assertStaff(req, next)) return;
  const q = (req.query.q || '').trim();
  const filter = {
    isActive: true,
    role: { $in: STAFF_ROLES },
    _id: { $ne: req.user._id },
  };
  if (q) {
    filter.$or = [
      { name: { $regex: q, $options: 'i' } },
      { email: { $regex: q, $options: 'i' } },
      { role: { $regex: q, $options: 'i' } },
    ];
  }

  const users = await User.find(filter)
    .select('name role email department')
    .populate('department', 'name')
    .sort({ name: 1 })
    .limit(40)
    .lean();

  res.status(200).json({
    success: true,
    data: users.map((u) => ({
      _id: u._id,
      name: u.name,
      role: u.role,
      email: u.email,
      department: u.department?.name || null,
    })),
  });
});

/** Fetch messages by scope */
exports.getMessages = asyncHandler(async (req, res, next) => {
  if (assertStaff(req, next)) return;
  const scope = req.query.scope || 'hospital';
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const before = req.query.before ? new Date(req.query.before) : null;
  const me = req.user._id;
  const withUser = req.query.with;

  let filter = {};
  if (scope === 'hospital') {
    filter = { channel: 'hospital' };
  } else if (scope === 'mentions') {
    filter = { mentions: me };
  } else if (scope === 'direct') {
    if (!withUser) {
      filter = { channel: 'direct', participants: me };
    } else {
      filter = {
        channel: 'direct',
        participants: { $all: [me, withUser] },
      };
    }
  } else {
    return next(new ErrorResponse('Invalid scope', 400));
  }

  if (before && !Number.isNaN(before.getTime())) {
    filter.createdAt = { $lt: before };
  }

  const rows = await populateMsg(
    ChatMessage.find(filter).sort({ createdAt: -1 }).limit(limit)
  );

  res.status(200).json({
    success: true,
    count: rows.length,
    data: rows.map(serialize).reverse(),
  });
});

/** Distinct direct conversation partners */
exports.getConversations = asyncHandler(async (req, res, next) => {
  if (assertStaff(req, next)) return;
  const me = req.user._id;
  const recent = await ChatMessage.find({ channel: 'direct', participants: me })
    .sort({ createdAt: -1 })
    .limit(200)
    .populate('sender', 'name role')
    .populate('participants', 'name role')
    .lean();

  const map = new Map();
  for (const msg of recent) {
    const other = (msg.participants || []).find((p) => String(p._id) !== String(me));
    if (!other) continue;
    const key = String(other._id);
    if (map.has(key)) continue;
    const unread = !(msg.readBy || []).some((id) => String(id) === String(me))
      && String(msg.sender?._id || msg.sender) !== String(me);
    map.set(key, {
      user: { _id: other._id, name: other.name, role: other.role },
      lastMessage: {
        _id: msg._id,
        body: msg.body,
        createdAt: msg.createdAt,
        senderId: msg.sender?._id || msg.sender,
      },
      unread,
    });
  }

  res.status(200).json({ success: true, data: [...map.values()] });
});

/** Unread counts for badge */
exports.getUnread = asyncHandler(async (req, res, next) => {
  if (assertStaff(req, next)) return;
  const me = req.user._id;

  const [mentions, direct, hospital] = await Promise.all([
    ChatMessage.countDocuments({
      mentions: me,
      sender: { $ne: me },
      readBy: { $ne: me },
    }),
    ChatMessage.countDocuments({
      channel: 'direct',
      participants: me,
      sender: { $ne: me },
      readBy: { $ne: me },
    }),
    ChatMessage.countDocuments({
      channel: 'hospital',
      sender: { $ne: me },
      readBy: { $ne: me },
      createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    }),
  ]);

  res.status(200).json({
    success: true,
    data: {
      mentions,
      direct,
      hospital,
      total: mentions + direct + hospital,
    },
  });
});

/** Post a message (hospital or direct); parse/accept @mentions */
exports.postMessage = asyncHandler(async (req, res, next) => {
  if (assertStaff(req, next)) return;
  const body = String(req.body.body || '').trim();
  if (!body) return next(new ErrorResponse('Message cannot be empty', 400));
  if (body.length > 4000) return next(new ErrorResponse('Message too long', 400));

  const channel = req.body.channel === 'direct' ? 'direct' : 'hospital';
  let mentionIds = Array.isArray(req.body.mentions)
    ? [...new Set(req.body.mentions.map(String))]
    : [];

  // Resolve @Name tokens in body against directory if client didn't send ids
  if (mentionIds.length === 0) {
    const tokens = [...body.matchAll(/@([A-Za-z][A-Za-z0-9 .'-]{0,60})/g)].map((m) => m[1].trim());
    if (tokens.length) {
      const staff = await User.find({
        isActive: true,
        role: { $in: STAFF_ROLES },
        name: { $in: tokens.map((t) => new RegExp(`^${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')) },
      })
        .select('_id name')
        .lean();
      // Match each token to a user (exact-ish)
      for (const token of tokens) {
        const hit = staff.find((u) => u.name.toLowerCase() === token.toLowerCase());
        if (hit) mentionIds.push(String(hit._id));
      }
      mentionIds = [...new Set(mentionIds)];
    }
  }

  // Validate mention ids exist
  if (mentionIds.length) {
    const valid = await User.find({ _id: { $in: mentionIds }, isActive: true }).select('_id');
    mentionIds = valid.map((u) => String(u._id));
  }

  let participants = [];
  if (channel === 'direct') {
    const recipientId = req.body.recipientId || mentionIds[0];
    if (!recipientId) return next(new ErrorResponse('Select a person for direct message', 400));
    if (String(recipientId) === String(req.user._id)) {
      return next(new ErrorResponse('Cannot message yourself', 400));
    }
    const recipient = await User.findOne({ _id: recipientId, isActive: true });
    if (!recipient) return next(new ErrorResponse('Recipient not found', 404));
    participants = [req.user._id, recipient._id];
    if (!mentionIds.includes(String(recipient._id))) mentionIds.push(String(recipient._id));
  }

  const msg = await ChatMessage.create({
    sender: req.user._id,
    body,
    channel,
    participants,
    mentions: mentionIds,
    readBy: [req.user._id],
  });

  const populated = await populateMsg(ChatMessage.findById(msg._id));
  const payload = serialize(populated);

  const io = req.app.get('io');
  if (io) {
    if (channel === 'hospital') {
      io.to('hospital:chat').emit('chat:message', payload);
    } else {
      for (const uid of participants) {
        io.to(`user:${uid}`).emit('chat:message', payload);
      }
    }
  }

  try {
    const { notifyUser } = require('../utils/notify');
    const targets = new Set(mentionIds.map(String));
    if (channel === 'direct') {
      for (const uid of participants.map(String)) {
        if (uid !== String(req.user._id)) targets.add(uid);
      }
    }
    for (const uid of targets) {
      if (uid === String(req.user._id)) continue;
      const isMention = mentionIds.map(String).includes(uid);
      await notifyUser(req, {
        userId: uid,
        title: isMention ? `${req.user.name} mentioned you` : `Direct message from ${req.user.name}`,
        message: body.length > 120 ? `${body.slice(0, 120)}…` : body,
        type: 'chat',
        link: null,
        relatedId: msg._id,
        relatedModel: 'ChatMessage',
      });
      if (io) io.to(`user:${uid}`).emit('chat:mention', payload);
    }
  } catch (_) { /* ignore */ }

  res.status(201).json({ success: true, data: payload });
});

/** Mark messages as read */
exports.markRead = asyncHandler(async (req, res, next) => {
  if (assertStaff(req, next)) return;
  const ids = Array.isArray(req.body.messageIds) ? req.body.messageIds : [];
  const scope = req.body.scope;
  const me = req.user._id;

  if (ids.length) {
    await ChatMessage.updateMany(
      { _id: { $in: ids }, readBy: { $ne: me } },
      { $addToSet: { readBy: me } }
    );
  } else if (scope === 'mentions') {
    await ChatMessage.updateMany(
      { mentions: me, readBy: { $ne: me } },
      { $addToSet: { readBy: me } }
    );
  } else if (scope === 'hospital') {
    await ChatMessage.updateMany(
      { channel: 'hospital', readBy: { $ne: me }, createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      { $addToSet: { readBy: me } }
    );
  } else if (scope === 'direct' && req.body.with) {
    await ChatMessage.updateMany(
      { channel: 'direct', participants: { $all: [me, req.body.with] }, readBy: { $ne: me } },
      { $addToSet: { readBy: me } }
    );
  }

  res.status(200).json({ success: true });
});
