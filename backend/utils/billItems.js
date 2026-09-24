const mongoose = require('mongoose');
const Medicine = require('../models/Medicine');

const CATEGORY_TYPE_MAP = {
  Consultation: 'consultation',
  Pharmacy: 'medicine',
  Laboratory: 'lab',
  Admission: 'admission',
  Room: 'room',
  ICU: 'room',
  Procedure: 'procedure',
  Nursing: 'nursing',
  Miscellaneous: 'other',
};

const VALID_CATEGORIES = [
  'Consultation', 'Pharmacy', 'Laboratory', 'Admission', 'Room',
  'ICU', 'Procedure', 'Nursing', 'Miscellaneous',
];
const VALID_TYPES = [
  'consultation', 'procedure', 'medicine', 'lab', 'room', 'nursing', 'admission', 'other',
];
const VALID_REF_MODELS = [
  'OPRegistration', 'IPAdmission', 'LabTest', 'Prescription', 'Patient', 'Medicine',
];
const VALID_PAYMENT_MODES = [
  'cash', 'card', 'upi', 'cheque', 'insurance', 'online', 'multiple',
];

const asObjectId = (value) => {
  if (!value) return undefined;
  const raw = value._id || value.$oid || value;
  const str = String(raw);
  if (!mongoose.Types.ObjectId.isValid(str)) return undefined;
  try {
    const id = new mongoose.Types.ObjectId(str);
    return String(id) === str.toLowerCase() ? id : undefined;
  } catch (_) {
    return undefined;
  }
};

const asDate = (value) => {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

const asMoney = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const omitUndefined = (obj) => {
  const next = {};
  Object.entries(obj).forEach(([key, val]) => {
    if (val !== undefined) next[key] = val;
  });
  return next;
};

const normalizeBillItem = (item) => {
  const category = item.category || 'Miscellaneous';
  const type = item.type || CATEGORY_TYPE_MAP[category] || 'other';
  return { ...item, category, type };
};

const calculateItemAmounts = (items = []) =>
  items.map((item) => {
    const normalized = normalizeBillItem(item);
    const lineTotal =
      asMoney(normalized.quantity) * asMoney(normalized.unitPrice);
    const gstAmount = lineTotal * (asMoney(normalized.gstPercent) / 100);
    return { ...normalized, gstAmount, totalAmount: lineTotal + gstAmount };
  });

const sanitizeBillItems = (items = []) =>
  calculateItemAmounts(
    (Array.isArray(items) ? items : [])
      .filter((raw) => raw && typeof raw === 'object')
      .map((raw) => {
        const category = VALID_CATEGORIES.includes(raw.category)
          ? raw.category
          : 'Miscellaneous';
        const type = VALID_TYPES.includes(raw.type)
          ? raw.type
          : CATEGORY_TYPE_MAP[category] || 'other';
        const keepId = asObjectId(raw._id);
        const hasQty = raw.quantity != null && raw.quantity !== '';
        const quantity = hasQty ? asMoney(raw.quantity) : 1;
        return omitUndefined({
          ...(keepId ? { _id: keepId } : {}),
          category,
          type,
          description: String(raw.description || raw.name || 'Charge').trim() || 'Charge',
          name: raw.name || raw.description,
          quantity,
          unitPrice: asMoney(raw.unitPrice),
          gstPercent: asMoney(raw.gstPercent),
          medicine: asObjectId(raw.medicine),
          batch: raw.batch || raw.batchNumber || undefined,
          batchNumber: raw.batchNumber || raw.batch || undefined,
          genericName: raw.genericName || undefined,
          mrp: raw.mrp != null ? asMoney(raw.mrp) : undefined,
          hsnCode: raw.hsnCode || undefined,
          unitOfMeasure: raw.unitOfMeasure || 'Nos',
          expiryDate: asDate(raw.expiryDate),
          mfgDate: asDate(raw.mfgDate),
          discountPercent: asMoney(raw.discountPercent),
          discountAmount: asMoney(raw.discountAmount),
          referenceId: asObjectId(raw.referenceId),
          referenceModel: VALID_REF_MODELS.includes(raw.referenceModel)
            ? raw.referenceModel
            : undefined,
        });
      })
      .filter((item) => item.quantity > 0),
  );

const fillFromMedicine = (next, medicine, { assignMissingBatch = true } = {}) => {
  next.type = 'medicine';
  next.name = medicine.name;
  next.description = next.description || medicine.name;
  if (!next.unitPrice) next.unitPrice = medicine.sellingPrice;
  if (next.gstPercent == null) next.gstPercent = medicine.gstPercent;
  if (!next.genericName) next.genericName = medicine.genericName || '';
  if (!next.mrp) next.mrp = medicine.mrp || medicine.sellingPrice;
  if (!next.hsnCode) next.hsnCode = medicine.hsnCode || '';
  if (!next.unitOfMeasure) next.unitOfMeasure = medicine.unitOfMeasure || 'Nos';
  const batchKey = next.batchNumber || next.batch;
  if (batchKey && medicine.batches?.length) {
    const batchData = medicine.batches.find((b) => b.batchNumber === batchKey);
    if (batchData) {
      next.batchNumber = batchData.batchNumber;
      next.batch = batchData.batchNumber;
      if (!next.expiryDate) next.expiryDate = batchData.expiryDate;
      if (!next.mfgDate) next.mfgDate = batchData.receivedDate;
    }
  } else if (assignMissingBatch && !batchKey && medicine.batches?.length) {
    const validBatch = medicine.batches.find((b) => !b.isDisposed && b.quantity > 0);
    if (validBatch) {
      next.batchNumber = validBatch.batchNumber;
      next.batch = validBatch.batchNumber;
      if (!next.expiryDate) next.expiryDate = validBatch.expiryDate;
      if (!next.mfgDate) next.mfgDate = validBatch.receivedDate;
    }
  }
  return next;
};

/** One query for all medicines — invalid IDs are dropped instead of crashing the save. */
const enrichMedicineItems = async (items = [], options = {}) => {
  const ids = [];
  for (const item of items) {
    const id = asObjectId(item?.medicine);
    if (id) ids.push(id);
  }
  const unique = [...new Set(ids.map(String))];
  const medicines = unique.length
    ? await Medicine.find({ _id: { $in: unique } }).select(
      'name genericName sellingPrice gstPercent currentStock mrp hsnCode unitOfMeasure batches',
    )
    : [];
  const byId = new Map(medicines.map((m) => [String(m._id), m]));

  return items.map((item) => {
    const next = { ...item };
    const id = asObjectId(next.medicine);
    if (!id) {
      delete next.medicine;
      return next;
    }
    next.medicine = id;
    const medicine = byId.get(String(id));
    if (medicine) fillFromMedicine(next, medicine, options);
    return next;
  });
};

const isAdmissionLevelItem = (item = {}) =>
  item.referenceModel === 'IPAdmission' &&
  (item.type === 'admission' || item.type === 'room'
    || item.category === 'Admission' || item.category === 'Room' || item.category === 'ICU');

const pickIpAdmissionId = (items = []) => {
  const admissionLine = items.find(isAdmissionLevelItem);
  return asObjectId(admissionLine?.referenceId);
};

/** IP Billing must store billType=ip so the invoice appears on the IP tab. */
const inferBillType = (billType, items = [], ipAdmission = null) => {
  if (billType && billType !== 'unified') return billType;
  if (ipAdmission) return 'ip';
  const hasIp = (items || []).some((item) =>
    item.referenceModel === 'IPAdmission' ||
    item.type === 'admission' ||
    item.type === 'room' ||
    item.category === 'Admission' ||
    item.category === 'Room' ||
    item.category === 'ICU',
  );
  return hasIp ? 'ip' : (billType || 'unified');
};

const normalizePaymentMode = (mode) =>
  VALID_PAYMENT_MODES.includes(mode) ? mode : 'cash';

module.exports = {
  CATEGORY_TYPE_MAP,
  VALID_CATEGORIES,
  VALID_TYPES,
  VALID_REF_MODELS,
  VALID_PAYMENT_MODES,
  asObjectId,
  asDate,
  asMoney,
  sanitizeBillItems,
  enrichMedicineItems,
  inferBillType,
  pickIpAdmissionId,
  calculateItemAmounts,
  normalizePaymentMode,
};
