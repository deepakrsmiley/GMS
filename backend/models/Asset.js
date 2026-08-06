const mongoose = require('mongoose');
const Counter = require('./Counter');

/**
 * Equipment Master — live summary record.
 * Transaction modules (PM, calibration, repairs, movement, etc.) update these
 * denormalized fields automatically; history lives in BME transaction collections.
 */
const documentSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: [
      'User Manual', 'Service Manual', 'Installation Report', 'Commissioning Report',
      'Calibration Certificate', 'Electrical Safety Certificate', 'Photo',
      'Warranty Document', 'Invoice', 'Other',
    ],
  },
  name: String,
  /** Legacy external link (optional) */
  url: String,
  /** File stored in DB as base64 data URI (data:<mime>;base64,...) */
  data: { type: String },
  mimeType: { type: String, trim: true },
  fileName: { type: String, trim: true },
  size: { type: Number, default: 0 },
  uploadedAt: { type: Date, default: Date.now },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { _id: true });

const assetSchema = new mongoose.Schema({
  // Identification
  assetId: { type: String, unique: true },
  assetNumber: { type: String, trim: true },
  equipmentCode: { type: String, trim: true },
  qrCode: { type: String, trim: true, unique: true, sparse: true },
  barcode: { type: String, trim: true },

  // Basic
  name: { type: String, required: [true, 'Equipment name is required'], trim: true },
  category: {
    type: String,
    required: true,
    enum: [
      'Laboratory Equipment',
      'Radiology Equipment',
      'OT Equipment',
      'ICU Equipment',
      'Pharmacy Equipment',
      'Emergency Equipment',
      'CSSD Equipment',
      'General Hospital Equipment',
    ],
  },
  manufacturer: { type: String, trim: true },
  brand: { type: String, trim: true },
  modelNumber: { type: String, trim: true },
  serialNumber: { type: String, trim: true },
  version: { type: String, trim: true },

  // Location (current — history in BmeMovement)
  hospital: { type: String, trim: true, default: 'Main Hospital' },
  building: { type: String, trim: true },
  floor: { type: String, trim: true },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
  room: { type: String, trim: true },
  ward: { type: String, trim: true },
  bed: { type: String, trim: true },
  location: { type: String, trim: true },
  currentUser: { type: String, trim: true },

  // Purchase
  purchaseDate: { type: Date },
  purchaseCost: { type: Number, default: 0 },
  cost: { type: Number, default: 0 }, // legacy alias
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'BmeVendor' },
  vendorName: { type: String, trim: true },
  vendorContact: { type: String, trim: true },
  vendorEmail: { type: String, trim: true },
  invoiceNumber: { type: String, trim: true },
  purchaseOrder: { type: String, trim: true },
  warrantyStart: { type: Date },
  warrantyExpiry: { type: Date },
  expectedLifeYears: { type: Number },
  currentValue: { type: Number, default: 0 },

  // Technical
  voltage: { type: String, trim: true },
  frequency: { type: String, trim: true },
  powerRating: { type: String, trim: true },
  batteryDetails: { type: String, trim: true },
  accessories: { type: String, trim: true },
  softwareVersion: { type: String, trim: true },

  // Risk / compliance
  riskClass: { type: String, enum: ['Critical', 'High', 'Medium', 'Low'], default: 'Medium' },
  healthScore: { type: Number, default: 100, min: 0, max: 100 },

  // Lifecycle stage
  lifecycleStage: {
    type: String,
    enum: [
      'Purchase Request', 'Purchase Order', 'Received', 'Installation',
      'Commissioning', 'In Service', 'Upgrade', 'Transfer', 'Condemned', 'Disposed',
    ],
    default: 'In Service',
  },
  installationDate: { type: Date },
  commissioningDate: { type: Date },
  condemnationDate: { type: Date },
  disposalDate: { type: Date },

  // Status (live — updated by workflows)
  status: {
    type: String,
    enum: [
      'Working', 'Idle', 'In Use', 'PM Due', 'Calibration Due',
      'Under Repair', 'Waiting Spare Parts', 'Vendor Visit Scheduled',
      'AMC Due', 'CMC Due', 'Condemned', 'Disposed', 'Shifted',
      // legacy
      'Under Maintenance', 'Breakdown', 'Repair In Progress', 'Ready to Use', 'Decommissioned',
    ],
    default: 'Working',
  },

  // Auto-maintained summary dates
  lastPmDate: { type: Date },
  nextPmDate: { type: Date },
  pmIntervalDays: { type: Number, default: 90 },
  lastCalibrationDate: { type: Date },
  nextCalibrationDate: { type: Date },
  calibrationIntervalDays: { type: Number, default: 365 },
  lastElectricalSafetyDate: { type: Date },
  nextElectricalSafetyDate: { type: Date },
  totalDowntimeHours: { type: Number, default: 0 },
  failureCount: { type: Number, default: 0 },
  lastBreakdownDate: { type: Date },
  lastRepairDate: { type: Date },
  amcExpiry: { type: Date },
  cmcExpiry: { type: Date },
  nextVendorVisit: { type: Date },

  documents: [documentSchema],
  description: { type: String },
  isActive: { type: Boolean, default: true },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

assetSchema.pre('save', async function (next) {
  if (!this.assetId) {
    const counter = await Counter.findOneAndUpdate(
      { name: 'asset' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    this.assetId = `AST-${String(counter.seq).padStart(6, '0')}`;
  }
  if (!this.qrCode) {
    this.qrCode = this.assetId;
  }
  if (this.purchaseCost && !this.cost) this.cost = this.purchaseCost;
  if (this.cost && !this.purchaseCost) this.purchaseCost = this.cost;
  next();
});

assetSchema.index({ status: 1 });
assetSchema.index({ department: 1 });
assetSchema.index({ warrantyExpiry: 1 });
assetSchema.index({ category: 1 });
assetSchema.index({ nextPmDate: 1 });
assetSchema.index({ nextCalibrationDate: 1 });
assetSchema.index({ riskClass: 1 });

module.exports = mongoose.model('Asset', assetSchema);
