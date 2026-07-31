const mongoose = require('mongoose');

const supplierSchema = new mongoose.Schema({
  name: { type: String, required: true },
  contactPerson: String,
  phone: { type: String, required: true },
  email: String,
  address: String,
  city: String,
  state: String,
  pincode: String,
  gstNumber: String,
  drugLicense: String,

  creditDays: { type: Number, default: 30 },

  openingAmount: {
    type: Number,
    default: 0,
  },

  amountPaid: {
    type: Number,
    default: 0,
  },

  outstanding: {
    type: Number,
    default: 0,
  },

  notes: String,
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('Supplier', supplierSchema);