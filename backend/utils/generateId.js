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

module.exports = { generatePatientId, generateBillNo, allocateBillNumber, generateTokenNo, generateLabNo, generateAdmissionNo };
