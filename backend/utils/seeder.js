require('dotenv').config();
require('../models');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const connectDB = require('../config/db');

const User = require('../models/User');
const Department = require('../models/Department');

const seed = async () => {
  await connectDB();
  console.log('Connected to DB. Starting user seed...');

  // Clear existing users only
  await User.deleteMany();
  console.log('Cleared existing users');

  // Try to find existing departments (Doctor users reference a department).
  // If none exist yet, doctors will be seeded without a department.
  const generalMedicine = await Department.findOne({ code: 'GM' });
  const cardiology = await Department.findOne({ code: 'CARD' });

  const adminPassword = await bcrypt.hash('admin123', 12);

  const users = await User.insertMany([
    { name: 'Super Admin', email: 'superadmin@hms.com', password: adminPassword, role: 'Super Admin', phone: '9999999999', isActive: true },
    { name: 'Hospital Admin', email: 'admin@hms.com', password: adminPassword, role: 'Admin', phone: '9888888888', isActive: true },
    { name: 'Dr. Rajesh Kumar', email: 'doctor@hms.com', password: adminPassword, role: 'Doctor', phone: '9777777777', department: generalMedicine ? generalMedicine._id : undefined, specialization: 'General Physician', consultationFee: 300, isActive: true },
    { name: 'Dr. Priya Sharma', email: 'dr.priya@hms.com', password: adminPassword, role: 'Doctor', phone: '9666666666', department: cardiology ? cardiology._id : undefined, specialization: 'Cardiologist', consultationFee: 600, isActive: true },
    { name: 'Receptionist Mary', email: 'receptionist@hms.com', password: adminPassword, role: 'Receptionist', phone: '9555555555', isActive: true },
    { name: 'Nurse Kavya', email: 'nurse@hms.com', password: adminPassword, role: 'Nurse', phone: '9444444444', isActive: true },
    { name: 'Pharmacist Ravi', email: 'pharmacist@hms.com', password: adminPassword, role: 'Pharmacist', phone: '9333333333', isActive: true },
    { name: 'Lab Tech Suresh', email: 'lab@hms.com', password: adminPassword, role: 'Lab Technician', phone: '9222222222', isActive: true },
    { name: 'Accountant Amit', email: 'accountant@hms.com', password: adminPassword, role: 'Accountant', phone: '9111111111', isActive: true },
    { name: 'Patient John Doe', email: 'patient@hms.com', password: adminPassword, role: 'Patient', phone: '9000000000', isActive: true },
  ]);
  console.log('Users seeded:', users.length);

  console.log('\n✅ User seed complete!\n');
  console.log('Login credentials:');
  console.log('  Super Admin : superadmin@hms.com   / admin123');
  console.log('  Admin       : admin@hms.com        / admin123');
  console.log('  Doctor      : doctor@hms.com       / admin123');
  console.log('  Doctor 2    : dr.priya@hms.com     / admin123');
  console.log('  Reception   : receptionist@hms.com / admin123');
  console.log('  Nurse       : nurse@hms.com        / admin123');
  console.log('  Pharmacy    : pharmacist@hms.com   / admin123');
  console.log('  Lab Tech    : lab@hms.com          / admin123');
  console.log('  Accountant  : accountant@hms.com   / admin123');
  console.log('  Patient     : patient@hms.com      / admin123');

  process.exit(0);
};

seed().catch((err) => { console.error(err); process.exit(1); });