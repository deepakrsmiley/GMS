const mongoose = require('mongoose');
const { applyOrganizationScope } = require('../plugins/organizationScope');

const supplierSchema = new mongoose.Schema({
  name: { type: String, required: true },
  company: String,
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
  paymentTerms: String,

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

applyOrganizationScope(supplierSchema);

module.exports = mongoose.model('Supplier', supplierSchema);