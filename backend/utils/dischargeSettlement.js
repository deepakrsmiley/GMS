const EXCEPTIONAL_DISCHARGE = new Set(['LAMA', 'death', 'absconded', 'transfer']);

/**
 * Regular IP discharge is only allowed after the stay is billed and paid.
 * LAMA / death / absconded / transfer can leave without settling (billing still follows up).
 */
const evaluateDischargeSettlement = ({
  dischargeType = 'regular',
  forceDischarge = false,
  isAdmin = false,
  billed = false,
  unpaidDue = 0,
} = {}) => {
  const type = dischargeType || 'regular';
  const due = Number(unpaidDue) || 0;

  if (EXCEPTIONAL_DISCHARGE.has(type)) {
    return {
      allowed: true,
      exceptional: true,
      code: 'EXCEPTIONAL',
      message: `Discharge type ${type} does not require a settled bill. Complete billing afterwards from Pending Discharge.`,
    };
  }

  if (forceDischarge && isAdmin) {
    return {
      allowed: true,
      forced: true,
      code: 'FORCED',
      message: 'Admin override: discharged without settled bill.',
    };
  }

  if (due > 0.01) {
    return {
      allowed: false,
      code: 'UNPAID',
      unpaidDue: due,
      message: `Settle the IP bill first (due ₹${due.toFixed(2)}). Open Billing → Pending Discharge, collect payment, then discharge.`,
    };
  }

  if (!billed) {
    return {
      allowed: false,
      code: 'NO_BILL',
      unpaidDue: 0,
      message: 'Create and collect the IP bill first. Open Billing → Pending Discharge, then return here to discharge.',
    };
  }

  return { allowed: true, code: 'SETTLED', message: 'Bill settled. Bed can be released.' };
};

const loadAdmissionBillState = async (admission) => {
  const Bill = require('../models/Bill');
  const bills = await Bill.find({
    $or: [
      { ipAdmission: admission._id },
      { items: { $elemMatch: { referenceId: admission._id, referenceModel: 'IPAdmission' } } },
    ],
    status: { $nin: ['cancelled', 'refunded'] },
  }).select('dueAmount status billNumber totalAmount paidAmount');

  const unpaidDue = bills.reduce((sum, b) => sum + Number(b.dueAmount || 0), 0);
  return {
    billed: bills.length > 0,
    unpaidDue,
    billCount: bills.length,
  };
};

module.exports = {
  evaluateDischargeSettlement,
  EXCEPTIONAL_DISCHARGE,
  loadAdmissionBillState,
};
