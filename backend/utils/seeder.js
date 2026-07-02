require('dotenv').config();
require('../models');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const connectDB = require('../config/db');

const User = require('../models/User');
const Department = require('../models/Department');
const Ward = require('../models/Ward');
const Bed = require('../models/Bed');
const Medicine = require('../models/Medicine');

const seed = async () => {
  await connectDB();
  console.log('Connected to DB. Starting seed...');

  // Clear existing data
  await Promise.all([User.deleteMany(), Department.deleteMany(), Ward.deleteMany(), Bed.deleteMany(), Medicine.deleteMany()]);
  console.log('Cleared existing data');

  // Departments
  const departments = await Department.insertMany([
    { name: 'General Medicine', code: 'GM', consultationFee: 300, color: '#3b82f6', location: 'OPD Block A' },
    { name: 'Cardiology', code: 'CARD', consultationFee: 600, color: '#ef4444', location: 'OPD Block B' },
    { name: 'Orthopedics', code: 'ORTH', consultationFee: 500, color: '#f59e0b', location: 'OPD Block C' },
    { name: 'Pediatrics', code: 'PED', consultationFee: 400, color: '#22c55e', location: 'OPD Block D' },
    { name: 'Gynecology', code: 'GYN', consultationFee: 500, color: '#8b5cf6', location: 'OPD Block E' },
    { name: 'ENT', code: 'ENT', consultationFee: 350, color: '#06b6d4', location: 'OPD Block F' },
    { name: 'Dermatology', code: 'DERM', consultationFee: 350, color: '#f97316', location: 'OPD Block G' },
    { name: 'Neurology', code: 'NEURO', consultationFee: 700, color: '#6366f1', location: 'OPD Block H' },
  ]);
  console.log('Departments seeded:', departments.length);

  // Admin user
  const adminPassword = await bcrypt.hash('admin123', 12);

  const users = await User.insertMany([
    { name: 'Super Admin', email: 'superadmin@hms.com', password: adminPassword, role: 'Super Admin', phone: '9999999999', isActive: true },
    { name: 'Hospital Admin', email: 'admin@hms.com', password: adminPassword, role: 'Admin', phone: '9888888888', isActive: true },
    { name: 'Dr. Rajesh Kumar', email: 'doctor@hms.com', password: adminPassword, role: 'Doctor', phone: '9777777777', department: departments[0]._id, specialization: 'General Physician', consultationFee: 300, isActive: true },
    { name: 'Dr. Priya Sharma', email: 'dr.priya@hms.com', password: adminPassword, role: 'Doctor', phone: '9666666666', department: departments[1]._id, specialization: 'Cardiologist', consultationFee: 600, isActive: true },
    { name: 'Receptionist Mary', email: 'receptionist@hms.com', password: adminPassword, role: 'Receptionist', phone: '9555555555', isActive: true },
    { name: 'Nurse Kavya', email: 'nurse@hms.com', password: adminPassword, role: 'Nurse', phone: '9444444444', isActive: true },
    { name: 'Pharmacist Ravi', email: 'pharmacist@hms.com', password: adminPassword, role: 'Pharmacist', phone: '9333333333', isActive: true },
    { name: 'Lab Tech Suresh', email: 'lab@hms.com', password: adminPassword, role: 'Lab Technician', phone: '9222222222', isActive: true },
    { name: 'Accountant Amit', email: 'accountant@hms.com', password: adminPassword, role: 'Accountant', phone: '9111111111', isActive: true },
    { name: 'Patient John Doe', email: 'patient@hms.com', password: adminPassword, role: 'Patient', phone: '9000000000', isActive: true },
  ]);
  console.log('Users seeded:', users.length);

  // Wards
  const wards = await Ward.insertMany([
    { name: 'General Ward A', code: 'GWA', type: 'general', floor: 1, department: departments[0]._id },
    { name: 'General Ward B', code: 'GWB', type: 'general', floor: 2, department: departments[0]._id },
    { name: 'ICU', code: 'ICU', type: 'icu', floor: 3 },
    { name: 'Emergency Ward', code: 'EMRG', type: 'emergency', floor: 0 },
    { name: 'Maternity Ward', code: 'MAT', type: 'maternity', floor: 2, department: departments[4]._id },
  ]);
  console.log('Wards seeded:', wards.length);

  // Beds
  const bedData = [];
  for (let i = 1; i <= 20; i++) {
    bedData.push({ bedNumber: `GWA-${String(i).padStart(2,'0')}`, ward: wards[0]._id, type: 'general', status: i <= 12 ? 'occupied' : 'available', dailyRate: 500, floor: 1 });
  }
  for (let i = 1; i <= 10; i++) {
    bedData.push({ bedNumber: `ICU-${String(i).padStart(2,'0')}`, ward: wards[2]._id, type: 'icu', status: i <= 6 ? 'occupied' : 'available', dailyRate: 3000, floor: 3 });
  }
  for (let i = 1; i <= 5; i++) {
    bedData.push({ bedNumber: `EMRG-${String(i).padStart(2,'0')}`, ward: wards[3]._id, type: 'emergency', status: 'available', dailyRate: 1000, floor: 0 });
  }
  const beds = await Bed.insertMany(bedData);
  console.log('Beds seeded:', beds.length);

  // Update ward bed counts
  await Ward.findByIdAndUpdate(wards[0]._id, { totalBeds: 20, availableBeds: 8 });
  await Ward.findByIdAndUpdate(wards[2]._id, { totalBeds: 10, availableBeds: 4 });
  await Ward.findByIdAndUpdate(wards[3]._id, { totalBeds: 5, availableBeds: 5 });

  // Medicines
  const expiryDate = new Date(); expiryDate.setFullYear(expiryDate.getFullYear() + 2);
  await Medicine.insertMany([
    { name: 'Paracetamol 500mg', genericName: 'Acetaminophen', category: 'tablet', sellingPrice: 2, purchasePrice: 1, mrp: 2.5, gstPercent: 5, currentStock: 500, minimumStock: 50, batches: [{ batchNumber: 'B001', expiryDate, quantity: 500, sellingPrice: 2 }] },
    { name: 'Amoxicillin 250mg', genericName: 'Amoxicillin', category: 'capsule', sellingPrice: 8, purchasePrice: 5, mrp: 10, gstPercent: 12, currentStock: 200, minimumStock: 30, batches: [{ batchNumber: 'B002', expiryDate, quantity: 200, sellingPrice: 8 }] },
    { name: 'Omeprazole 20mg', genericName: 'Omeprazole', category: 'capsule', sellingPrice: 5, purchasePrice: 3, mrp: 6, gstPercent: 12, currentStock: 300, minimumStock: 40, batches: [{ batchNumber: 'B003', expiryDate, quantity: 300, sellingPrice: 5 }] },
    { name: 'Metformin 500mg', genericName: 'Metformin HCl', category: 'tablet', sellingPrice: 3, purchasePrice: 1.5, mrp: 3.5, gstPercent: 5, currentStock: 8, minimumStock: 50, batches: [{ batchNumber: 'B004', expiryDate, quantity: 8, sellingPrice: 3 }] },
    { name: 'Atorvastatin 10mg', genericName: 'Atorvastatin', category: 'tablet', sellingPrice: 12, purchasePrice: 7, mrp: 15, gstPercent: 12, currentStock: 150, minimumStock: 25, batches: [{ batchNumber: 'B005', expiryDate, quantity: 150, sellingPrice: 12 }] },
    { name: 'Azithromycin 500mg', genericName: 'Azithromycin', category: 'tablet', sellingPrice: 25, purchasePrice: 15, mrp: 30, gstPercent: 12, currentStock: 100, minimumStock: 20, batches: [{ batchNumber: 'B006', expiryDate, quantity: 100, sellingPrice: 25 }] },
    { name: 'Normal Saline 500ml', genericName: 'Sodium Chloride 0.9%', category: 'injection', sellingPrice: 40, purchasePrice: 25, mrp: 50, gstPercent: 5, currentStock: 5, minimumStock: 30, batches: [{ batchNumber: 'B007', expiryDate, quantity: 5, sellingPrice: 40 }] },
    { name: 'Cough Syrup 100ml', genericName: 'Dextromethorphan', category: 'syrup', sellingPrice: 55, purchasePrice: 35, mrp: 65, gstPercent: 12, currentStock: 80, minimumStock: 15, batches: [{ batchNumber: 'B008', expiryDate, quantity: 80, sellingPrice: 55 }] },
  ]);
  console.log('Medicines seeded');

  console.log('\n✅ Seed complete!\n');
  console.log('Login credentials:');
  console.log('  Super Admin : superadmin@hms.com   / admin123');
  console.log('  Admin       : admin@hms.com        / admin123');
  console.log('  Doctor      : doctor@hms.com       / admin123');
  console.log('  Reception   : receptionist@hms.com / admin123');
  console.log('  Nurse       : nurse@hms.com        / admin123');
  console.log('  Pharmacy    : pharmacist@hms.com   / admin123');
  console.log('  Lab Tech    : lab@hms.com          / admin123');
  console.log('  Accountant  : accountant@hms.com   / admin123');
  console.log('  Patient     : patient@hms.com      / admin123');

  process.exit(0);
};

seed().catch((err) => { console.error(err); process.exit(1); });
