const generatePatientId = (counter) => {
  const year = new Date().getFullYear().toString().slice(-2);
  const num = String(counter).padStart(6, '0');
  return `PT${year}${num}`;
};

const generateBillNo = (counter) => {
  const year = new Date().getFullYear().toString().slice(-2);
  const month = String(new Date().getMonth() + 1).padStart(2, '0');
  const num = String(counter).padStart(5, '0');
  return `BILL${year}${month}${num}`;
};

/** Next bill number that is unique across the whole database (billNumber is globally unique). */
const allocateBillNumber = async () => {
  const Counter = require('../models/Counter');
  const Bill = require('../models/Bill');
  for (let i = 0; i < 80; i += 1) {
    const seq = await Counter.getNextSeq('bill');
    const billNumber = generateBillNo(seq);
    const exists = await Bill.findOne({ billNumber })
      .setOptions({ skipOrganizationFilter: true })
      .select('_id')
      .lean();
    if (!exists) return billNumber;
  }
  return `BILL${Date.now()}`;
};

const generateTokenNo = (counter) => String(counter).padStart(3, '0');

const tokenNumeric = (value) => {
  const n = parseInt(String(value || '').replace(/\D/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Daily OP token for the India calendar day (resets to 001 after 12:00 AM IST).
 * Seeded from existing tokens that day so a restart never jumps back to 001.
 */
const allocateDailyOpToken = async (tokenDate, organizationId) => {
  const Counter = require('../models/Counter');
  const OPRegistration = require('../models/OPRegistration');
  const { getContextOrganizationId } = require('../middleware/tenantContext');
  const { istDayBounds } = require('./istDay');

  const { iso, from, to } = istDayBounds(tokenDate);
  const orgId = organizationId || getContextOrganizationId();
  const name = `opToken:${iso}`;
  const key = orgId ? `${name}:${orgId}` : name;

  const exists = await Counter.findById(key).lean();
  if (!exists) {
    const rows = await OPRegistration.find({
      tokenDate: { $gte: from, $lt: to },
    }).select('tokenNumber').lean();
    const max = rows.reduce((acc, row) => Math.max(acc, tokenNumeric(row.tokenNumber)), 0);
    if (max > 0) {
      await Counter.findByIdAndUpdate(
        key,
        { $setOnInsert: { seq: max } },
        { upsert: true },
      );
    }
  }

  const seq = await Counter.getNextSeq(name, orgId);
  return generateTokenNo(seq);
};

const generateLabNo = (counter) => {
  const year = new Date().getFullYear().toString().slice(-2);
  const num = String(counter).padStart(5, '0');
  return `LAB${year}${num}`;
};

/** Next lab number unique inside this hospital (labNumber is unique per organization). */
const allocateLabNumber = async () => {
  const Counter = require('../models/Counter');
  const LabTest = require('../models/LabTest');
  const year = new Date().getFullYear().toString().slice(-2);
  const latest = await LabTest.findOne({ labNumber: new RegExp(`^LAB${year}`) })
    .sort({ labNumber: -1 })
    .select('labNumber')
    .lean();
  if (latest?.labNumber) {
    const maxSeq = parseInt(latest.labNumber.slice(-5), 10);
    if (Number.isFinite(maxSeq)) {
      await Counter.findByIdAndUpdate(
        Counter.keyFor('lab'),
        { $max: { seq: maxSeq } },
        { upsert: true },
      );
    }
  }
  for (let i = 0; i < 8; i += 1) {
    const seq = await Counter.getNextSeq('lab');
    const labNumber = generateLabNo(seq);
    const exists = await LabTest.exists({ labNumber });
    if (!exists) return labNumber;
  }
  return `LAB${year}${Date.now().toString().slice(-5)}`;
};

const generateAdmissionNo = (counter) => {
  const year = new Date().getFullYear().toString().slice(-2);
  const num = String(counter).padStart(5, '0');
  return `IP${year}${num}`;
};

/** Next IP number unique inside this hospital (admissionNumber is unique per organization). */
const allocateAdmissionNumber = async () => {
  const Counter = require('../models/Counter');
  const IPAdmission = require('../models/IPAdmission');
  const year = new Date().getFullYear().toString().slice(-2);
  const latest = await IPAdmission.findOne({ admissionNumber: new RegExp(`^IP${year}`) })
    .sort({ admissionNumber: -1 })
    .select('admissionNumber')
    .lean();
  if (latest?.admissionNumber) {
    const maxSeq = parseInt(latest.admissionNumber.slice(-5), 10);
    if (Number.isFinite(maxSeq)) {
      await Counter.findByIdAndUpdate(
        Counter.keyFor('admission'),
        { $max: { seq: maxSeq } },
        { upsert: true },
      );
    }
  }
  for (let i = 0; i < 8; i += 1) {
    const seq = await Counter.getNextSeq('admission');
    const admissionNumber = generateAdmissionNo(seq);
    const exists = await IPAdmission.exists({ admissionNumber });
    if (!exists) return admissionNumber;
  }
  return `IP${year}${Date.now().toString().slice(-5)}`;
};

const generatePrescriptionDocNo = (counter) => {
  const year = new Date().getFullYear().toString().slice(-2);
  const num = String(counter).padStart(6, '0');
  return `RXS${year}${num}`;
};

const allocatePrescriptionDocNumber = async (organizationId) => {
  const Counter = require('../models/Counter');
  const seq = await Counter.getNextSeq('prescriptionScan', organizationId);
  return generatePrescriptionDocNo(seq);
};

module.exports = {
  generatePatientId,
  generateBillNo,
  allocateBillNumber,
  generateTokenNo,
  allocateDailyOpToken,
  generateLabNo,
  allocateLabNumber,
  generateAdmissionNo,
  allocateAdmissionNumber,
  generatePrescriptionDocNo,
  allocatePrescriptionDocNumber,
};
