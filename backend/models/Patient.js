const mongoose = require('mongoose');

const patientSchema = new mongoose.Schema({
  patientId: { type: String, unique: true },
  name: { type: String, required: true, trim: true },
  age: { type: Number, required: true },
  gender: { type: String, enum: ['Male', 'Female', 'Other'], required: true },
  dob: Date,
  phone: { type: String, required: true },
  alternatePhone: String,
  email: String,
  address: {
    street: String,
    city: String,
    state: String,
    pincode: String,
  },
  bloodGroup: { type: String, enum: ['A+','A-','B+','B-','AB+','AB-','O+','O-','Unknown'] },
  maritalStatus: { type: String, enum: ['Single','Married','Divorced','Widowed'] },
  occupation: String,
  nationality: { type: String, default: 'Indian' },
  emergencyContact: {
    name: String,
    relation: String,
    phone: String,
  },
  allergies: [String],
  chronicConditions: [String],
  insuranceInfo: {
    provider: String,
    policyNumber: String,
    validUpto: Date,
  },
  photo: String,
  isActive: { type: Boolean, default: true },
  registeredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  visits: [{ type: mongoose.Schema.Types.ObjectId, ref: 'OPRegistration' }],
  admissions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'IPAdmission' }],
}, { timestamps: true });

patientSchema.index({ phone: 1 });
patientSchema.index({ name: 'text', patientId: 'text', phone: 'text' });

module.exports = mongoose.model('Patient', patientSchema);
