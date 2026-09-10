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

const asObjectId = (value) => {
  if (!value) return undefined;
  const raw = value._id || value;
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

const normalizeBillItem = (item) => {
  const category = item.category || 'Miscellaneous';
  const type = item.type || CATEGORY_TYPE_MAP[category] || 'other';
  return { ...item, category, type };
};

const calculateItemAmounts = (items = []) =>
  items.map((item) => {
    const normalized = normalizeBillItem(item);
    const lineTotal =
      Number(normalized.quantity || 0) * Number(normalized.unitPrice || 0);
    const gstAmount = lineTotal * ((Number(normalized.gstPercent) || 0) / 100);
    return { ...normalized, gstAmount, totalAmount: lineTotal + gstAmount };
  });

const sanitizeBillItems = (items = []) =>
  calculateItemAmounts(
    items.map((raw) => {
      const category = VALID_CATEGORIES.includes(raw.category)
        ? raw.category
        : 'Miscellaneous';
      const type = VALID_TYPES.includes(raw.type)
        ? raw.type
        : CATEGORY_TYPE_MAP[category] || 'other';
      const keepId = asObjectId(raw._id);
      return {
        ...(keepId ? { _id: keepId } : {}),
        category,
        type,
        description: String(raw.description || raw.name || 'Charge').trim() || 'Charge',
        name: raw.name || raw.description,
        quantity: Number(raw.quantity || 0),
        unitPrice: Number(raw.unitPrice || 0),
        gstPercent: Number(raw.gstPercent || 0),
        medicine: asObjectId(raw.medicine),
        batch: raw.batch || raw.batchNumber || undefined,
        batchNumber: raw.batchNumber || raw.batch || undefined,
        genericName: raw.genericName || undefined,
        mrp: raw.mrp != null ? Number(raw.mrp) : undefined,
        hsnCode: raw.hsnCode || undefined,
        unitOfMeasure: raw.unitOfMeasure || 'Nos',
        expiryDate: asDate(raw.expiryDate),
        mfgDate: asDate(raw.mfgDate),
        discountPercent: Number(raw.discountPercent || 0),
        discountAmount: Number(raw.discountAmount || 0),
        referenceId: asObjectId(raw.referenceId),
        referenceModel: VALID_REF_MODELS.includes(raw.referenceModel)
          ? raw.referenceModel
          : undefined,
      };
    }),
  );

const fillFromMedicine = (next, medicine) => {
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
  } else if (!batchKey && medicine.batches?.length) {
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
const enrichMedicineItems = async (items = []) => {
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
    if (medicine) fillFromMedicine(next, medicine);
    return next;
  });
};

const isAdmissionLevelItem = (item = {}) =>
  item.referenceModel === 'IPAdmission' &&
  (item.type === 'admission' || item.type === 'room' || item.category === 'Admission' || item.category === 'Room' || item.category === 'ICU');

const pickIpAdmissionId = (items = []) => {
  const admissionLine = items.find(isAdmissionLevelItem);
  return asObjectId(admissionLine?.referenceId);
};

/** IP Billing must store billType=ip so the invoice appears on the IP tab. */
const inferBillType = (billType, items = []) => {
  if (billType && billType !== 'unified') return billType;
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

module.exports = {
  CATEGORY_TYPE_MAP,
  VALID_CATEGORIES,
  VALID_TYPES,
  VALID_REF_MODELS,
  asObjectId,
  asDate,
  sanitizeBillItems,
  enrichMedicineItems,
  inferBillType,
  pickIpAdmissionId,
  calculateItemAmounts,
};
