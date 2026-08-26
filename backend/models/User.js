const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { isSuperAdmin } = require('../utils/roles');

const userSchema = new mongoose.Schema({
  name: { type: String, required: [true, 'Name is required'], trim: true },
  email: { type: String, required: [true, 'Email is required'], lowercase: true, match: [/^\S+@\S+\.\S+$/, 'Invalid email'] },
  password: { type: String, required: [true, 'Password is required'], minlength: 6, select: false },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
  lastActiveOrganizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null },
  role: { type: String, enum: ['Super Admin', 'Admin', 'Doctor', 'Receptionist', 'Pharmacist', 'Lab Technician', 'Accountant', 'Nurse', 'Biomedical Engineer', 'Patient'], default: 'Patient' },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
  specialization: String,
  phone: String,
  employeeId: { type: String, trim: true, sparse: true },
  /** Legacy URL / data-URI string (kept for older records) */
  avatar: String,
  /** Profile photo stored in MongoDB as binary */
  profilePhoto: {
    data: Buffer,
    contentType: String,
  },
  isActive: { type: Boolean, default: true },
  lastLogin: Date,
  lastLoginIp: String,
  lastLoginUserAgent: String,
  permissions: [String],
  shift: { type: String, enum: ['morning', 'afternoon', 'night', 'rotating'], default: 'morning' },
  qualification: String,
  experience: Number,
  consultationFee: { type: Number, default: 0 },
  followUpFee: { type: Number, default: 0 },
  morningSessionStart: { type: String, default: '' },
  morningSessionEnd: { type: String, default: '' },
  eveningSessionStart: { type: String, default: '' },
  eveningSessionEnd: { type: String, default: '' },
  availability: [{
    day: { type: String, enum: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'] },
    startTime: String,
    endTime: String,
    isAvailable: { type: Boolean, default: true }
  }],
  failedLoginAttempts: { type: Number, default: 0 },
  accountLockedUntil: Date,
  passwordChangedAt: Date,
  tokenVersion: { type: Number, default: 0 },
  resetPasswordOTP: String,
  resetPasswordOTPExpire: Date,
  resetPasswordToken: String,
  resetPasswordExpire: Date,
}, { timestamps: true });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.getSignedJwtToken = function (extras = {}) {
  const payload = {
    userId: this._id,
    role: this.role,
    name: this.name,
    email: this.email,
    tokenVersion: this.tokenVersion || 0,
  };
  const orgId = this.organizationId?._id || this.organizationId;
  if (!isSuperAdmin(this.role) && orgId) payload.organizationId = String(orgId);
  if (isSuperAdmin(this.role) && extras.activeOrganizationId) {
    payload.activeOrganizationId = String(extras.activeOrganizationId);
  }
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE });
};

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

userSchema.index({ role: 1 });
userSchema.index({ department: 1 });
userSchema.index({ organizationId: 1, role: 1 });
userSchema.index({ organizationId: 1, email: 1 }, { unique: true });
userSchema.index(
  { organizationId: 1, employeeId: 1 },
  { unique: true, partialFilterExpression: { employeeId: { $type: 'string', $gt: '' } } },
);

module.exports = mongoose.model('User', userSchema);
