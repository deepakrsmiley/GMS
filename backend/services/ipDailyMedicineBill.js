const Bill = require('../models/Bill');
const IPAdmission = require('../models/IPAdmission');
const ErrorResponse = require('../utils/errorResponse');
const { allocateBillNumber } = require('../utils/generateId');
const { mergeSameMedicineLines } = require('../utils/mergeMedicineLines');
const { istDayBounds, formatIstDate } = require('../utils/istDay');

const PAYMENT_MODES = new Set(['cash', 'card', 'upi']);

const round2 = (value) => Number((Number(value) || 0).toFixed(2));

const lineSubtotal = (med) => (Number(med.quantity) || 0) * (Number(med.unitPrice) || 0);

const toBillItem = (med) => {
  const quantity = Number(med.quantity) || 0;
  const unitPrice = Number(med.unitPrice) || 0;
  const gstPercent = Number(med.gstPercent) || 0;
  const gstAmount = round2(quantity * unitPrice * (gstPercent / 100));
  return {
    category: 'Pharmacy',
    type: 'medicine',
    description: med.medicineName || 'Medicine',
    name: med.medicineName || 'Medicine',
    quantity,
    unitPrice,
    gstPercent,
    gstAmount,
    totalAmount: round2(quantity * unitPrice + gstAmount),
    referenceId: med._id,
    referenceModel: 'IPAdmission',
    sourceIds: [med._id],
    medicine: med.medicine || undefined,
    batchNumber: med.batchNumber || undefined,
    batch: med.batchNumber || undefined,
  };
};

const billTotal = (items) => {
  const subtotal = items.reduce(
    (sum, item) => sum + (Number(item.unitPrice) || 0) * (Number(item.quantity) || 0),
    0,
  );
  const totalGST = items.reduce((sum, item) => sum + (Number(item.gstAmount) || 0), 0);
  return Number((subtotal + totalGST).toFixed(2));
};

const populateBill = (id) => Bill.findById(id)
  .populate('patient', 'patientId name age gender phone')
  .populate('doctor', 'name')
  .populate('department', 'name');

/**
 * Paid pharmacy bill for one India calendar day of IP medicines.
 * Stock was already deducted when the dose was logged. The admission advance is not used.
 */
const createIpDailyMedicineBill = async ({ admission, day, paymentMode, user }) => {
  const mode = String(paymentMode || '').trim().toLowerCase();
  if (!PAYMENT_MODES.has(mode)) {
    throw new ErrorResponse('Choose cash, card, or UPI', 400);
  }

  const rawDay = String(day || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDay)) {
    throw new ErrorResponse('Choose the day to bill', 400);
  }

  const { iso, from, to } = istDayBounds(rawDay);
  const key = `${admission._id}:${iso}`;
  const existing = await Bill.findOne({
    dailyMedicineKey: key,
    status: { $nin: ['cancelled', 'refunded'] },
  }).select('billNumber');
  if (existing) {
    throw new ErrorResponse(
      `Medicines for ${formatIstDate(iso)} are already billed on ${existing.billNumber}`,
      400,
    );
  }

  const entries = (admission.medications || []).filter((med) => {
    if (med.dailyBill) return false;
    const at = new Date(med.administeredAt);
    if (Number.isNaN(at.getTime()) || at < from || at >= to) return false;
    return lineSubtotal(med) > 0;
  });
  if (!entries.length) {
    throw new ErrorResponse(`No medicines to bill for ${formatIstDate(iso)}`, 400);
  }

  const items = mergeSameMedicineLines(entries.map(toBillItem)).map((item) => {
    const quantity = Number(item.quantity) || 0;
    const unitPrice = Number(item.unitPrice) || 0;
    const gstPercent = Number(item.gstPercent) || 0;
    const gstAmount = round2(quantity * unitPrice * (gstPercent / 100));
    return {
      ...item,
      gstAmount,
      totalAmount: round2(quantity * unitPrice + gstAmount),
    };
  });
  const totalAmount = billTotal(items);
  if (totalAmount <= 0) {
    throw new ErrorResponse(`No medicines to bill for ${formatIstDate(iso)}`, 400);
  }

  let bill;
  try {
    bill = await Bill.create({
      billNumber: await allocateBillNumber(),
      billType: 'pharmacy',
      patient: admission.patient,
      doctor: admission.doctor,
      department: admission.department,
      ipAdmission: admission._id,
      ipDailyMedicine: true,
      dailyMedicineDate: from,
      dailyMedicineKey: key,
      items,
      discount: 0,
      paidAmount: totalAmount,
      advanceAmount: 0,
      paymentMode: mode,
      payments: [{
        amount: totalAmount,
        mode,
        paidAt: new Date(),
        receivedBy: user?._id,
      }],
      notes: `IP daily medicine bill ${formatIstDate(iso)} — ${admission.admissionNumber || ''}`.trim(),
      createdBy: user?._id,
    });
  } catch (error) {
    if (error && error.code === 11000) {
      throw new ErrorResponse(
        `Medicines for ${formatIstDate(iso)} are already billed`,
        400,
      );
    }
    throw error;
  }

  if (Number(bill.dueAmount) > 0) {
    bill.paidAmount = bill.totalAmount;
    if (bill.payments?.[0]) bill.payments[0].amount = bill.totalAmount;
    await bill.save();
  }

  const billedIds = new Set(
    items.flatMap((item) => (item.sourceIds || []).map((id) => String(id))),
  );
  for (const med of admission.medications || []) {
    if (billedIds.has(String(med._id))) med.dailyBill = bill._id;
  }
  admission.bills = admission.bills || [];
  admission.bills.push(bill._id);

  try {
    await admission.save();
  } catch (error) {
    await Bill.deleteOne({ _id: bill._id });
    throw error;
  }

  return (await populateBill(bill._id)) || bill;
};

/** Drop the day lock and the links on the admission so that day can be billed again. */
const releaseIpDailyMedicineBill = async (bill) => {
  if (!bill?.ipDailyMedicine || !bill.ipAdmission) return;

  await Bill.updateOne({ _id: bill._id }, { $unset: { dailyMedicineKey: 1 } });
  await IPAdmission.updateOne(
    { _id: bill.ipAdmission },
    { $pull: { bills: bill._id } },
  );
  await IPAdmission.updateOne(
    { _id: bill.ipAdmission, 'medications.dailyBill': bill._id },
    { $unset: { 'medications.$[med].dailyBill': '' } },
    { arrayFilters: [{ 'med.dailyBill': bill._id }] },
  );
};

module.exports = {
  createIpDailyMedicineBill,
  releaseIpDailyMedicineBill,
};
