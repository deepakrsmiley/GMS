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

const generateAdmissionNo = (counter) => {
  const year = new Date().getFullYear().toString().slice(-2);
  const num = String(counter).padStart(5, '0');
  return `IP${year}${num}`;
};

module.exports = {
  generatePatientId,
  generateBillNo,
  allocateBillNumber,
  generateTokenNo,
  allocateDailyOpToken,
  generateLabNo,
  generateAdmissionNo,
};
