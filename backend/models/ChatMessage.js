const mongoose = require('mongoose');
const { applyOrganizationScope } = require('../plugins/organizationScope');

/**
 * Hospital staff chat — hospital channel + direct threads + @mentions.
 */
const chatMessageSchema = new mongoose.Schema(
  {
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, trim: true, maxlength: 4000 },
    /** hospital = visible to all staff; direct = 1:1 thread */
    channel: { type: String, enum: ['hospital', 'direct'], default: 'hospital' },
    /** For direct messages: the two participants (sorted ids stored for lookup) */
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    /** Users explicitly @mentioned in the body */
    mentions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    /** Users who have opened/read this message */
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

chatMessageSchema.index({ channel: 1, createdAt: -1 });
chatMessageSchema.index({ mentions: 1, createdAt: -1 });
chatMessageSchema.index({ participants: 1, createdAt: -1 });
chatMessageSchema.index({ createdAt: -1 });

applyOrganizationScope(chatMessageSchema);

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
