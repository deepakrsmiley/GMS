require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');
const { normalizeRole, CANONICAL_ROLES } = require('../utils/roles');

const REQUIRED_USERS = [
  { name: 'Super Admin', email: 'superadmin@hms.com', role: 'Super Admin', password: 'admin123' },
  { name: 'Hospital Admin', email: 'admin@hms.com', role: 'Admin', password: 'admin123' },
  { name: 'Dr. Rajesh Kumar', email: 'doctor@hms.com', role: 'Doctor', password: 'admin123' },
  { name: 'Receptionist Mary', email: 'receptionist@hms.com', role: 'Receptionist', password: 'admin123' },
  { name: 'Pharmacist Ravi', email: 'pharmacist@hms.com', role: 'Pharmacist', password: 'admin123' },
  { name: 'Lab Tech Suresh', email: 'lab@hms.com', role: 'Lab Technician', password: 'admin123' },
  { name: 'Nurse Kavya', email: 'nurse@hms.com', role: 'Nurse', password: 'admin123' },
  { name: 'Accountant Amit', email: 'accountant@hms.com', role: 'Accountant', password: 'admin123' },
];

const EMAIL_ALIASES = {
  'reception@hms.com': 'receptionist@hms.com',
  'pharmacy@hms.com': 'pharmacist@hms.com',
};

const fixUsers = async () => {
  await connectDB();
  console.log('Connected to MongoDB\n');

  const legacyUsers = await User.find({
    role: { $nin: CANONICAL_ROLES },
  }).select('email role');

  for (const legacyUser of legacyUsers) {
    const normalized = normalizeRole(legacyUser.role);
    if (normalized && normalized !== legacyUser.role) {
      legacyUser.role = normalized;
      await legacyUser.save({ validateBeforeSave: false });
      console.log(`[ROLE_MIGRATED] ${legacyUser.email}: ${legacyUser.role}`);
    }
  }

  const results = [];

  for (const spec of REQUIRED_USERS) {
    let user = await User.findOne({ email: spec.email }).select('+password');
    let action = 'verified';

    if (!user) {
      const aliasEmail = Object.entries(EMAIL_ALIASES).find(([, target]) => target === spec.email)?.[0];
      if (aliasEmail) {
        user = await User.findOne({ email: aliasEmail }).select('+password');
        if (user) {
          user.email = spec.email;
          action = 'email_updated';
        }
      }
    }

    if (!user) {
      user = new User({
        name: spec.name,
        email: spec.email,
        role: spec.role,
        password: spec.password,
        isActive: true,
        phone: '9000000000',
      });
      action = 'created';
    } else {
      user.name = spec.name;
      user.role = spec.role;
      user.isActive = true;
      user.password = spec.password;
      user.failedLoginAttempts = 0;
      user.accountLockedUntil = undefined;
      if (action === 'verified') action = 'password_reset';
    }

    await user.save();

    const saved = await User.findOne({ email: spec.email }).select('+password');
    const passwordValid = await saved.matchPassword(spec.password);

    results.push({
      email: spec.email,
      role: saved.role,
      isActive: saved.isActive,
      hasPassword: !!saved.password,
      passwordValid,
      action,
    });

    console.log(`[${action.toUpperCase()}] ${spec.email} | role=${saved.role} | active=${saved.isActive} | passwordOK=${passwordValid}`);
  }

  console.log('\n--- Summary ---');
  console.table(results);
  await mongoose.connection.close();
  return results;
};

fixUsers()
  .then((results) => {
    const allOk = results.every((r) => r.passwordValid && r.isActive && CANONICAL_ROLES.includes(r.role));
    process.exit(allOk ? 0 : 1);
  })
  .catch((err) => {
    console.error('Fix failed:', err);
    process.exit(1);
  });
