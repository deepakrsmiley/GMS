const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const userSchema = new mongoose.Schema({
  name: { type: String, required: [true, 'Name is required'], trim: true },
  email: { type: String, required: [true, 'Email is required'], unique: true, lowercase: true, match: [/^\S+@\S+\.\S+$/, 'Invalid email'] },
  password: { type: String, required: [true, 'Password is required'], minlength: 6, select: false },
  role: { type: String, enum: ['Super Admin', 'Admin', 'Doctor', 'Receptionist', 'Pharmacist', 'Lab Technician', 'Accountant', 'Nurse', 'Patient'], default: 'Patient' },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
  specialization: String,
  phone: String,
  employeeId: { type: String, unique: true, sparse: true },
  avatar: String,
  isActive: { type: Boolean, default: true },
  lastLogin: Date,
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

userSchema.methods.getSignedJwtToken = function () {
  return jwt.sign(
    { 
      userId: this._id, 
      role: this.role, 
      name: this.name, 
      email: this.email,
      tokenVersion: this.tokenVersion || 0
    }, 
    process.env.JWT_SECRET, 
    { expiresIn: process.env.JWT_EXPIRE }
  );
};

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

userSchema.index({ role: 1 });
userSchema.index({ department: 1 });

module.exports = mongoose.model('User', userSchema);
