const mongoose = require("mongoose");
const asyncHandler = require("../utils/asyncHandler");
const ErrorResponse = require("../utils/errorResponse");
const Bill = require("../models/Bill");
const DirectSale = require("../models/DirectSale");
const OPRegistration = require("../models/OPRegistration");
const Counter = require("../models/Counter");
const Medicine = require("../models/Medicine");
const { allocateBillNumber } = require("../utils/generateId");
const {
  generateInvoicePDF,
  generateThermalPrint,
} = require("../utils/pdfGenerator");
const {
  getMedicineItems,
  stockableMedicineItems,
  validateMedicineStock,
  deductMedicineStock,
  restoreMedicineStock,
  restoreBillItemsStock,
} = require("../utils/stockManager");
const {
  getPatientBillableCharges,
  getPendingDischargeBilling,
  markSourcesAsBilled,
  unmarkSourcesAsBilled,
} = require("../services/billingService");
const {
  isPharmacyScopeBill,
  pharmacistBillScopeError,
} = require("../utils/billingAccess");

const enrichMedicineItems = async (items = []) => {
  const enriched = [];
  for (const item of items) {
    const next = { ...item };
    if (next.medicine) {
      const medicine = await Medicine.findById(next.medicine).select(
        "name genericName sellingPrice gstPercent currentStock mrp hsnCode unitOfMeasure batches",
      );
      if (medicine) {
        next.type = "medicine";
        next.name = medicine.name;
        next.description = next.description || medicine.name;
        if (!next.unitPrice) next.unitPrice = medicine.sellingPrice;
        if (next.gstPercent == null) next.gstPercent = medicine.gstPercent;
        // Auto-fill pharmacy fields from medicine inventory
        if (!next.genericName) next.genericName = medicine.genericName || "";
        if (!next.mrp) next.mrp = medicine.mrp || medicine.sellingPrice;
        if (!next.hsnCode) next.hsnCode = medicine.hsnCode || "";
        if (!next.unitOfMeasure) next.unitOfMeasure = medicine.unitOfMeasure || "Nos";
        // Fill batch details if batchNumber or batch is provided
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
          // Auto-pick the first valid non-disposed batch
          const validBatch = medicine.batches.find((b) => !b.isDisposed && b.quantity > 0);
          if (validBatch) {
            next.batchNumber = validBatch.batchNumber;
            next.batch = validBatch.batchNumber;
            if (!next.expiryDate) next.expiryDate = validBatch.expiryDate;
            if (!next.mfgDate) next.mfgDate = validBatch.receivedDate;
          }
        }
      }
    }
    enriched.push(next);
  }
  return enriched;
};

const CATEGORY_TYPE_MAP = {
  Consultation: "consultation",
  Pharmacy: "medicine",
  Laboratory: "lab",
  Admission: "admission",
  Room: "room",
  ICU: "room",
  Procedure: "procedure",
  Nursing: "nursing",
  Miscellaneous: "other",
};

const normalizeBillItem = (item) => {
  const category = item.category || "Miscellaneous";
  const type = item.type || CATEGORY_TYPE_MAP[category] || "other";
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

const VALID_CATEGORIES = [
  "Consultation", "Pharmacy", "Laboratory", "Admission", "Room",
  "ICU", "Procedure", "Nursing", "Miscellaneous",
];
const VALID_TYPES = [
  "consultation", "procedure", "medicine", "lab", "room", "nursing", "admission", "other",
];
const VALID_REF_MODELS = [
  "OPRegistration", "IPAdmission", "LabTest", "Prescription", "Patient", "Medicine",
];

const asObjectId = (value) => {
  if (!value) return undefined;
  const raw = value._id || value;
  const str = String(raw);
  if (!mongoose.Types.ObjectId.isValid(str)) return undefined;
  const id = new mongoose.Types.ObjectId(str);
  return String(id) === str ? id : undefined;
};

const asDate = (value) => {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

const sanitizeBillItems = (items = []) =>
  calculateItemAmounts(
    items.map((raw) => {
      const category = VALID_CATEGORIES.includes(raw.category)
        ? raw.category
        : "Miscellaneous";
      const type = VALID_TYPES.includes(raw.type)
        ? raw.type
        : CATEGORY_TYPE_MAP[category] || "other";
      const keepId = asObjectId(raw._id);
      return {
        ...(keepId ? { _id: keepId } : {}),
        category,
        type,
        description: String(raw.description || raw.name || "Charge").trim() || "Charge",
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
        unitOfMeasure: raw.unitOfMeasure || "Nos",
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

const stockFingerprint = (items = []) =>
  stockableMedicineItems(items)
    .map((item) =>
      [
        String(item.medicine?._id || item.medicine || ""),
        String(item.batch || item.batchNumber || ""),
        Number(item.quantity || 0),
      ].join(":"),
    )
    .sort()
    .join("|");

const safeStockRollback = async (fn) => {
  try {
    await fn();
  } catch (_) { /* never hide the original save/update error */ }
};

const toBillError = (error) => {
  if (error instanceof ErrorResponse) return error;
  if (error.name === "ValidationError") {
    return new ErrorResponse(
      Object.values(error.errors || {}).map((e) => e.message).join(", ") || "Invalid bill data",
      400,
    );
  }
  if (error.name === "CastError") {
    return new ErrorResponse("Invalid bill data. Please refresh and try again.", 400);
  }
  if (error.code === 11000) {
    return new ErrorResponse("This bill could not be saved because a value already exists. Please refresh and try again.", 400);
  }
  return new ErrorResponse(error.message || "Could not save bill", error.statusCode || 400);
};

const toPlain = (value) => JSON.parse(JSON.stringify(value || null));

const requirePharmacistBillScope = (req, billLike, next) => {
  const message = pharmacistBillScopeError(req.user, billLike);
  if (!message) return false;
  next(new ErrorResponse(message, 403));
  return true;
};

const summarizeItem = (item = {}) => ({
  id: item._id?.toString?.() || item.id,
  medicine:
    item.medicine?._id?.toString?.() ||
    item.medicine?.toString?.() ||
    item.medicine,
  name: item.description || item.name,
  quantity: Number(item.quantity || 0),
  rate: Number(item.unitPrice || 0),
  gstPercent: Number(item.gstPercent || 0),
  total: Number(item.totalAmount || 0),
});

const itemAuditKey = (item = {}) =>
  item._id?.toString?.() ||
  item.id ||
  [
    item.medicine?._id?.toString?.() ||
      item.medicine?.toString?.() ||
      item.medicine ||
      "",
    item.description || item.name || "",
    item.batch || "",
  ].join("|");

const makeAuditEntry = (
  bill,
  req,
  actionType,
  previousValue,
  newValue,
  reason,
  field,
) => ({
  billNumber: bill.billNumber,
  user: req.user._id,
  userName: req.user.name,
  editTime: new Date(),
  actionType,
  field,
  previousValue,
  newValue,
  reason,
});

const buildBillEditEntries = (oldBill, newBill, req, reason) => {
  const entries = [];
  const oldItems = new Map(
    (oldBill.items || []).map((item) => [itemAuditKey(item), item]),
  );
  const newItems = new Map(
    (newBill.items || []).map((item) => [itemAuditKey(item), item]),
  );

  for (const [key, nextItem] of newItems.entries()) {
    const prevItem = oldItems.get(key);
    if (!prevItem) {
      entries.push(
        makeAuditEntry(
          newBill,
          req,
          "Medicine Added",
          null,
          summarizeItem(nextItem),
          reason,
          "items",
        ),
      );
      continue;
    }

    if (Number(prevItem.quantity || 0) !== Number(nextItem.quantity || 0)) {
      entries.push(
        makeAuditEntry(
          newBill,
          req,
          "Quantity Changed",
          {
            item: prevItem.description || prevItem.name,
            quantity: Number(prevItem.quantity || 0),
          },
          {
            item: nextItem.description || nextItem.name,
            quantity: Number(nextItem.quantity || 0),
          },
          reason,
          "items.quantity",
        ),
      );
    }

    if (Number(prevItem.unitPrice || 0) !== Number(nextItem.unitPrice || 0)) {
      entries.push(
        makeAuditEntry(
          newBill,
          req,
          "Rate Changed",
          {
            item: prevItem.description || prevItem.name,
            rate: Number(prevItem.unitPrice || 0),
          },
          {
            item: nextItem.description || nextItem.name,
            rate: Number(nextItem.unitPrice || 0),
          },
          reason,
          "items.unitPrice",
        ),
      );
    }
  }

  for (const [key, prevItem] of oldItems.entries()) {
    if (!newItems.has(key)) {
      entries.push(
        makeAuditEntry(
          newBill,
          req,
          "Medicine Removed",
          summarizeItem(prevItem),
          null,
          reason,
          "items",
        ),
      );
    }
  }

  if (Number(oldBill.discount || 0) !== Number(newBill.discount || 0)) {
    entries.push(
      makeAuditEntry(
        newBill,
        req,
        "Discount Changed",
        Number(oldBill.discount || 0),
        Number(newBill.discount || 0),
        reason,
        "discount",
      ),
    );
  }

  if (Number(oldBill.paidAmount || 0) !== Number(newBill.paidAmount || 0)) {
    entries.push(
      makeAuditEntry(
        newBill,
        req,
        "Payment Updated",
        Number(oldBill.paidAmount || 0),
        Number(newBill.paidAmount || 0),
        reason,
        "paidAmount",
      ),
    );
  }

  if ((oldBill.status || "") !== (newBill.status || "")) {
    entries.push(
      makeAuditEntry(
        newBill,
        req,
        "Status Changed",
        oldBill.status,
        newBill.status,
        reason,
        "status",
      ),
    );
  }

  return entries;
};

const billPrintPopulate = [
  { path: "patient", select: "patientId name age gender phone address email" },
  { path: "doctor", select: "name specialization" },
  { path: "department", select: "name" },
  {
    path: "items.medicine",
    select: "name genericName currentStock unitOfMeasure",
  },
  { path: "createdBy", select: "name" },
  { path: "editHistory.user", select: "name role" },
  { path: "printHistory.printedBy", select: "name role" },
  { path: "opRegistration", select: "tokenNumber tokenDate" },
  {
    path: "ipAdmission",
    select: "admissionNumber admissionDate dischargeDate dischargeSummary",
  },
];

exports.getPatientCharges = asyncHandler(async (req, res, next) => {
  const billType = req.query.billType || req.query.type || "auto";
  const data = await getPatientBillableCharges(req.params.patientId, {
    billType,
  });
  if (!data) return next(new ErrorResponse("Patient not found", 404));
  res.status(200).json({ success: true, data });
});

exports.getPendingDischarge = asyncHandler(async (req, res) => {
  const data = await getPendingDischargeBilling();
  res.status(200).json({ success: true, count: data.length, data });
});

exports.getBills = asyncHandler(async (req, res) => {
  const Patient = require("../models/Patient");
  const { orgFilter } = require("../middleware/tenant");
  const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
  const extra = {};

  if (req.query.status) extra.status = req.query.status;
  if (req.query.billType === "op") {
    extra.billType = { $in: ["op", "pharmacy", "lab", "unified"] };
  } else if (req.query.billType === "ip") {
    extra.billType = "ip";
  } else if (req.query.billType === "lab") {
    extra.billType = { $ne: "ip" };
    extra.$or = [
      { billType: "lab" },
      { "items.category": "Laboratory" },
      { "items.type": "lab" },
    ];
  } else if (req.query.billType && req.query.billType !== "all") {
    extra.billType = req.query.billType;
  }
  if (req.query.department) extra.department = req.query.department;
  if (req.query.from || req.query.to) {
    extra.createdAt = {};
    if (req.query.from) extra.createdAt.$gte = new Date(req.query.from);
    if (req.query.to) extra.createdAt.$lt = new Date(req.query.to);
  }

  const q = String(req.query.search || req.query.billNumber || "").trim();
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    const patients = await Patient.find(
      orgFilter(req, { $or: [{ name: rx }, { patientId: rx }, { phone: rx }] }),
    )
      .select("_id")
      .limit(80);
    const searchOr = [{ billNumber: rx }, { patient: { $in: patients.map((p) => p._id) } }];
    if (extra.$or) {
      extra.$and = [{ $or: extra.$or }, { $or: searchOr }];
      delete extra.$or;
    } else {
      extra.$or = searchOr;
    }
  }

  const filter = orgFilter(req, extra);
  const [rows, total] = await Promise.all([
    Bill.find(filter)
      .populate("patient", "patientId name phone")
      .populate("doctor", "name")
      .populate("department", "name")
      .sort("-createdAt")
      .skip((page - 1) * limit)
      .limit(limit),
    Bill.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    count: rows.length,
    total,
    page,
    pages: Math.ceil(total / limit) || 1,
    data: rows,
  });
});

exports.getBill = asyncHandler(async (req, res, next) => {
  const bill = await Bill.findById(req.params.id).populate(billPrintPopulate);
  if (!bill) return next(new ErrorResponse("Bill not found", 404));

  // Enforce Patient ownership
  if (req.user.role === "Patient" && bill.patient?.email !== req.user.email) {
    return next(new ErrorResponse("Not authorized to access this bill", 403));
  }

  res.status(200).json({ success: true, data: bill });
});

exports.createBill = asyncHandler(async (req, res, next) => {
  if (!req.body.items?.length) {
    return next(new ErrorResponse("At least one bill item is required", 400));
  }

  req.body.billNumber = await allocateBillNumber();
  req.body.createdBy = req.user._id;
  if (!req.body.billType) req.body.billType = "unified";

  req.body.items = sanitizeBillItems(await enrichMedicineItems(req.body.items));

  if (requirePharmacistBillScope(req, req.body, next)) return;

  const medicineItems = getMedicineItems(req.body.items);
  const newMeds = stockableMedicineItems(req.body.items);
  const alreadyIssuedMeds = medicineItems.length - newMeds.length;

  let deductedStock = [];
  if (newMeds.length > 0) {
    await validateMedicineStock(newMeds);
    deductedStock = await deductMedicineStock(newMeds, req.user._id);
  }

  let bill;
  try {
    req.body.originalData = toPlain({
      billType: req.body.billType,
      patient: req.body.patient,
      doctor: req.body.doctor,
      department: req.body.department,
      opRegistration: req.body.opRegistration,
      ipAdmission: req.body.ipAdmission,
      items: req.body.items,
      discount: req.body.discount,
      paidAmount: req.body.paidAmount,
      paymentMode: req.body.paymentMode,
      notes: req.body.notes,
    });
    const paidNow = Number(req.body.paidAmount) || 0;
    if (paidNow > 0 && !(Array.isArray(req.body.payments) && req.body.payments.length)) {
      req.body.payments = [{
        amount: paidNow,
        mode: req.body.paymentMode || "cash",
        receivedBy: req.user._id,
        paidAt: new Date(),
      }];
    }
    bill = await Bill.create(req.body);
    await markSourcesAsBilled(req.body.items, bill._id);
  } catch (error) {
    await restoreMedicineStock(deductedStock, {
      userId: req.user._id,
      remarks: 'Stock restored — bill create failed',
      referenceModel: 'Bill',
    });
    throw error;
  }

  const populated = await Bill.findById(bill._id)
    .populate("patient", "patientId name age gender phone")
    .populate("doctor", "name")
    .populate("department", "name")
    .populate("items.medicine", "name currentStock");

  const itemCount = req.body.items.length;

  try {
    const { notifyRoles } = require('../utils/notify');
    const due = Number(populated.totalAmount || 0) - Number(populated.paidAmount || 0) - Number(populated.advanceAmount || 0);
    if (due > 0.01) {
      await notifyRoles(req, {
        roles: ['Admin', 'Super Admin', 'Pharmacist', 'Accountant', 'Receptionist'],
        title: 'Unpaid bill',
        message: `Bill ${populated.billNumber} — ${populated.patient?.name || 'Patient'} owes ₹${due.toFixed(2)}`,
        type: 'billing',
        link: '/billing',
        relatedId: populated._id,
        relatedModel: 'Bill',
        excludeUserId: req.user._id,
      });
    }
  } catch (_) { /* ignore */ }

  res.status(201).json({
    success: true,
    data: populated,
    message: `Unified bill created with ${itemCount} item(s).${alreadyIssuedMeds ? ` ${alreadyIssuedMeds} already-issued medicine charge(s) included.` : ""}${newMeds.length ? ` ${newMeds.length} medicine(s) deducted from inventory.` : ""}`,
  });
});

exports.updateBill = asyncHandler(async (req, res, next) => {
  let bill = await Bill.findById(req.params.id);
  if (!bill) return next(new ErrorResponse("Bill not found", 404));
  if (bill.status === "cancelled")
    return next(new ErrorResponse("Cannot update a cancelled bill", 400));
  if (requirePharmacistBillScope(req, bill, next)) return;

  // Reason is now mandatory for ANY bill edit (IP, OP, pharmacy, unified) —
  // not just pharmacy-scoped bills — so every edit gets an audit trail.
  const reason = (req.body.reason || req.body.auditReason || "").trim();
  if (!reason) {
    return next(
      new ErrorResponse("Reason is required when editing a bill", 400),
    );
  }

  const oldBill = toPlain(bill.toObject());
  const update = { ...req.body };
  delete update.reason;
  delete update.auditReason;

  let stockAdjusted = false;
  let sanitizedItems = null;

  if (update.items) {
    sanitizedItems = sanitizeBillItems(await enrichMedicineItems(update.items));
    const oldStockable = stockableMedicineItems(oldBill.items || []);
    const newStockable = stockableMedicineItems(sanitizedItems);
    const stockChanged = stockFingerprint(oldBill.items) !== stockFingerprint(sanitizedItems);

    if (stockChanged && (oldStockable.length || newStockable.length)) {
      try {
        await restoreBillItemsStock(oldStockable, {
          userId: req.user._id,
          remarks: `Stock restored before bill edit: ${reason}`,
          referenceId: bill._id,
          referenceModel: 'Bill',
        });
        await validateMedicineStock(newStockable);
        await deductMedicineStock(newStockable, req.user._id);
        stockAdjusted = true;
      } catch (error) {
        await safeStockRollback(() => deductMedicineStock(oldStockable, req.user._id));
        return next(toBillError(error));
      }
    }

    bill.items = sanitizedItems;
    bill.markModified("items");
  }

  if (update.discount != null) {
    bill.discount = Number(update.discount) || 0;
  }

  const auditEntries = buildBillEditEntries(
    oldBill,
    {
      ...toPlain(bill.toObject()),
      items: sanitizedItems || oldBill.items,
      discount: bill.discount,
      billNumber: bill.billNumber,
    },
    req,
    reason,
  );
  if (!Array.isArray(bill.editHistory)) bill.editHistory = [];
  if (auditEntries.length) bill.editHistory.push(...auditEntries);

  try {
    await bill.save();
  } catch (error) {
    if (stockAdjusted && sanitizedItems) {
      await safeStockRollback(async () => {
        await restoreBillItemsStock(stockableMedicineItems(sanitizedItems), {
          userId: req.user._id,
          remarks: 'Stock restored — bill save failed',
          referenceId: bill._id,
          referenceModel: 'Bill',
        });
        await deductMedicineStock(stockableMedicineItems(oldBill.items), req.user._id);
      });
    }
    return next(toBillError(error));
  }

  bill = await Bill.findById(req.params.id)
    .populate("patient", "patientId name age gender phone")
    .populate("doctor", "name")
    .populate("items.medicine", "name")
    .populate("editHistory.user", "name role");

  res.status(200).json({ success: true, data: bill });
});

exports.cancelBill = asyncHandler(async (req, res, next) => {
  const bill = await Bill.findById(req.params.id);
  if (!bill) return next(new ErrorResponse("Bill not found", 404));
  if (bill.status === "cancelled")
    return next(new ErrorResponse("Bill is already cancelled", 400));

  const reason = (req.body.reason || req.body.auditReason || "").trim();
  if (!reason) {
    return next(new ErrorResponse("Please enter a reason to cancel this bill", 400));
  }

  const medicineItems = stockableMedicineItems(bill.items);
  if (medicineItems.length > 0) {
    await restoreBillItemsStock(medicineItems, {
      userId: req.user._id,
      remarks: `Bill cancelled: ${reason}`,
      referenceId: bill._id,
      referenceModel: 'Bill',
    });
  }

  await unmarkSourcesAsBilled(bill.items, bill._id);

  bill.status = "cancelled";
  bill.notes = `${bill.notes ? `${bill.notes} | ` : ""}Cancelled: ${reason}`;
  if (!Array.isArray(bill.editHistory)) bill.editHistory = [];
  bill.editHistory.push({
    billNumber: bill.billNumber,
    user: req.user._id,
    userName: req.user.name,
    actionType: "cancel",
    field: "status",
    previousValue: bill.status,
    newValue: "cancelled",
    reason,
  });
  await bill.save();

  const populated = await Bill.findById(bill._id)
    .populate("patient", "patientId name phone")
    .populate("items.medicine", "name");

  res.status(200).json({
    success: true,
    data: populated,
    message:
      medicineItems.length > 0
        ? `Bill cancelled. ${medicineItems.length} medicine(s) restored to inventory.`
        : "Bill cancelled.",
  });
});

exports.recordPayment = asyncHandler(async (req, res, next) => {
  const bill = await Bill.findById(req.params.id);
  if (!bill) return next(new ErrorResponse("Bill not found", 404));
  if (bill.status === "cancelled")
    return next(
      new ErrorResponse("Cannot record payment for a cancelled bill", 400),
    );

  const amount = Number(req.body.amount || 0);

  const outstanding = bill.totalAmount - (bill.paidAmount + bill.advanceAmount);

  if (amount > outstanding + 0.01) {
    return next(
      new ErrorResponse(
        "Payment amount cannot exceed outstanding bill amount",
        400,
      ),
    );
  }

  const payment = { ...req.body, amount, receivedBy: req.user._id };
  bill.payments.push(payment);
  console.log("Before:", bill.paidAmount, bill.totalAmount);

  bill.paidAmount = Number((bill.paidAmount + amount).toFixed(2));

  console.log("After:", bill.paidAmount, bill.totalAmount);
  if (isPharmacyScopeBill(bill)) {
    bill.editHistory.push(
      makeAuditEntry(
        bill,
        req,
        amount < bill.dueAmount
          ? "Partial Payment Received"
          : "Payment Updated",
        {
          paidAmount: Number(bill.paidAmount - amount),
          dueAmount: Number(bill.dueAmount || 0),
        },
        {
          paymentAmount: amount,
          mode: req.body.mode,
          paidAmount: Number(bill.paidAmount),
        },
        req.body.reason || "Balance payment received",
        "payments",
      ),
    );
  }

  await bill.save();

  const populated = await Bill.findById(bill._id)
    .populate("patient", "patientId name phone")
    .populate("items.medicine", "name");

  try {
    const { notifyRoles } = require('../utils/notify');
    await notifyRoles(req, {
      roles: ['Admin', 'Super Admin', 'Pharmacist', 'Accountant', 'Receptionist'],
      title: 'Payment received',
      message: `₹${amount.toFixed(2)} on bill ${bill.billNumber} — ${populated.patient?.name || 'Patient'}`,
      type: 'billing',
      link: '/billing',
      relatedId: bill._id,
      relatedModel: 'Bill',
      excludeUserId: req.user._id,
    });
  } catch (_) { /* ignore */ }

  res.status(200).json({ success: true, data: populated });
});

exports.printInvoice = asyncHandler(async (req, res, next) => {
  const bill = await Bill.findById(req.params.id).populate(billPrintPopulate);
  if (!bill) return next(new ErrorResponse("Bill not found", 404));
  bill.printCount = (bill.printCount || 0) + 1;
  bill.printHistory.push({
    printCount: bill.printCount,
    printedBy: req.user._id,
    printedByName: req.user.name,
    printedAt: new Date(),
    reason:
      req.query.reason ||
      req.body?.reason ||
      (bill.printCount === 1 ? "Original print" : "Bill reprint"),
    format: "invoice",
  });
  await bill.save();
  const pageSize = String(req.query.size || 'A4').toUpperCase() === 'A5' ? 'A5' : 'A4';
  await generateInvoicePDF(bill, res, undefined, { size: pageSize });
});

exports.printThermal = asyncHandler(async (req, res, next) => {
  const bill = await Bill.findById(req.params.id).populate(billPrintPopulate);
  if (!bill) return next(new ErrorResponse("Bill not found", 404));
  bill.printCount = (bill.printCount || 0) + 1;
  bill.printHistory.push({
    printCount: bill.printCount,
    printedBy: req.user._id,
    printedByName: req.user.name,
    printedAt: new Date(),
    reason:
      req.query.reason ||
      req.body?.reason ||
      (bill.printCount === 1 ? "Original print" : "Bill reprint"),
    format: "thermal",
  });
  await bill.save();
  await generateThermalPrint(bill, res);
});

exports.getBillingStats = asyncHandler(async (req, res) => {
  const { orgFilter } = require("../middleware/tenant");
  const { istToday, aggregateTodayRevenue } = require("../utils/todayRevenue");
  const day = istToday();
  const monthIso = `${new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }).slice(0, 8)}01`;
  const month = new Date(`${monthIso}T00:00:00.000+05:30`);
  const todayWindow = { createdAt: { $gte: day.from, $lt: day.to } };
  const scoped = (extra) => orgFilter(req, extra);

  const [
    todayAgg,
    todayRevenue,
    monthRevenue,
    pendingAgg,
    overdueAgg,
    todayByStatus,
    pendingDischarge,
  ] = await Promise.all([
    Bill.aggregate([
      { $match: scoped({ ...todayWindow, status: { $ne: "cancelled" } }) },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          total: { $sum: "$totalAmount" },
          collected: { $sum: "$paidAmount" },
        },
      },
    ]),
    aggregateTodayRevenue(Bill, scoped({})),
    Bill.aggregate([
      {
        $match: scoped({
          createdAt: { $gte: month },
          status: { $in: ["paid", "partial"] },
        }),
      },
      { $group: { _id: null, total: { $sum: "$paidAmount" } } },
    ]),
    Bill.aggregate([
      { $match: scoped({ status: { $in: ["pending", "partial"] } }) },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          total: { $sum: "$dueAmount" },
        },
      },
    ]),
    Bill.aggregate([
      {
        $match: scoped({
          status: { $in: ["pending", "partial"] },
          dueAmount: { $gt: 0 },
          createdAt: { $lt: day.from },
        }),
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          total: { $sum: "$dueAmount" },
        },
      },
    ]),
    Bill.aggregate([
      { $match: scoped(todayWindow) },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          total: { $sum: "$totalAmount" },
        },
      },
    ]),
    getPendingDischargeBilling(),
  ]);

  const byStatus = { paid: { count: 0, total: 0 }, pending: { count: 0, total: 0 }, overdue: { count: 0, total: 0 }, cancelled: { count: 0, total: 0 } };
  todayByStatus.forEach((row) => {
    const key = row._id === "partial" ? "pending" : row._id;
    if (!byStatus[key]) byStatus[key] = { count: 0, total: 0 };
    byStatus[key].count += row.count;
    byStatus[key].total += row.total || 0;
  });
  byStatus.overdue.count = overdueAgg[0]?.count || 0;
  byStatus.overdue.total = overdueAgg[0]?.total || 0;

  const pdAmount = (pendingDischarge || []).reduce(
    (sum, row) => sum + (Number(row.estimatedTotal) || 0),
    0,
  );

  res.status(200).json({
    success: true,
    data: {
      todayRevenue: todayRevenue || 0,
      monthRevenue: monthRevenue[0]?.total || 0,
      pendingBills: pendingAgg[0]?.count || 0,
      pendingAmount: pendingAgg[0]?.total || 0,
      totalBills: todayAgg[0]?.count || 0,
      todayBillsAmount: todayAgg[0]?.total || 0,
      todayCollection: todayRevenue || 0,
      overdueBills: overdueAgg[0]?.count || 0,
      overdueAmount: overdueAgg[0]?.total || 0,
      pendingDischarge: (pendingDischarge || []).length,
      pendingDischargeAmount: pdAmount,
      summary: byStatus,
    },
  });
});

// Pharmacy sales: money actually paid on the selected IST calendar day.
// Matches Billing "today paid" for pharmacy / medicine lines only — unpaid
// bills and consultation/lab charges are excluded.
const kolkataToday = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

const istDayBounds = (dateStr) => {
  const raw = String(dateStr || "").slice(0, 10);
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : kolkataToday();
  return {
    iso,
    from: new Date(`${iso}T00:00:00.000+05:30`),
    to: new Date(`${iso}T23:59:59.999+05:30`),
  };
};

const lineQty = (items = []) =>
  items.reduce((s, it) => s + (Number(it.quantity) || 0), 0);

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const inRange = (value, from, to) => {
  if (!value) return false;
  const t = new Date(value).getTime();
  return t >= from.getTime() && t <= to.getTime();
};

const isPharmacyLine = (item = {}) =>
  String(item.type || "").toLowerCase() === "medicine" ||
  item.category === "Pharmacy";

const pharmacyShareOfBill = (bill) => {
  if (String(bill.billType || "") === "pharmacy") return 1;
  const total = Number(bill.totalAmount) || 0;
  const part = (bill.items || []).reduce(
    (sum, item) => sum + (isPharmacyLine(item) ? Number(item.totalAmount) || 0 : 0),
    0,
  );
  if (part <= 0) return 0;
  if (total <= 0) return 1;
  return Math.min(1, part / total);
};

const paymentsReceivedInRange = (bill, from, to) => {
  const listed = Array.isArray(bill.payments) ? bill.payments : [];
  const listedSum = round2(
    listed.reduce((sum, p) => sum + (Number(p.amount) || 0), 0),
  );
  const paid = Number(bill.paidAmount) || 0;
  const rows = listed.filter((p) => inRange(p.paidAt, from, to));

  // createBill often stores paidAmount without a payments[] row
  const missing = round2(paid - listedSum);
  if (missing > 0.02 && inRange(bill.createdAt, from, to)) {
    rows.push({
      amount: missing,
      mode: bill.paymentMode || "cash",
      paidAt: bill.createdAt,
    });
  } else if (!listed.length && paid > 0 && inRange(bill.createdAt, from, to)) {
    rows.push({
      amount: paid,
      mode: bill.paymentMode || "cash",
      paidAt: bill.createdAt,
    });
  }

  return rows;
};

const splitPaymentAmount = (bill) => {
  const paid = Number(bill.paidAmount) || 0;
  const out = { cash: 0, upi: 0, card: 0, other: 0 };
  if (Array.isArray(bill.payments) && bill.payments.length) {
    bill.payments.forEach((p) => {
      const amt = Number(p.amount) || 0;
      const mode = String(p.mode || "").toLowerCase();
      if (mode === "cash") out.cash += amt;
      else if (mode === "upi") out.upi += amt;
      else if (mode === "card") out.card += amt;
      else out.other += amt;
    });
  } else if (paid) {
    const mode = String(bill.paymentMode || "").toLowerCase();
    if (mode === "cash") out.cash = paid;
    else if (mode === "upi") out.upi = paid;
    else if (mode === "card") out.card = paid;
    else out.other = paid;
  }
  const splitTotal = out.cash + out.upi + out.card + out.other;
  if (paid <= 0) return { cash: 0, upi: 0, card: 0, other: 0 };
  if (splitTotal <= 0) {
    const mode = String(bill.paymentMode || "cash").toLowerCase();
    if (mode === "upi") return { cash: 0, upi: paid, card: 0, other: 0 };
    if (mode === "card") return { cash: 0, upi: 0, card: paid, other: 0 };
    if (mode === "cash") return { cash: paid, upi: 0, card: 0, other: 0 };
    return { cash: 0, upi: 0, card: 0, other: paid };
  }
  if (Math.abs(splitTotal - paid) < 0.02) return out;
  const k = paid / splitTotal;
  const cash = round2(out.cash * k);
  const upi = round2(out.upi * k);
  const card = round2(out.card * k);
  return { cash, upi, card, other: round2(paid - cash - upi - card) };
};

const mapPharmacyBillRow = (b, from, to) => {
  if (b.status === "cancelled" || b.status === "refunded") return null;
  const share = pharmacyShareOfBill(b);
  if (share <= 0) return null;

  const dayPayments = paymentsReceivedInRange(b, from, to);
  const paidToday = round2(
    dayPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0),
  );
  const collected = round2(paidToday * share);
  if (collected <= 0) return null;

  const pharmacyItems =
    String(b.billType || "") === "pharmacy"
      ? b.items || []
      : (b.items || []).filter(isPharmacyLine);
  const billed = round2(
    String(b.billType || "") === "pharmacy"
      ? Number(b.totalAmount) || 0
      : pharmacyItems.reduce((sum, it) => sum + (Number(it.totalAmount) || 0), 0),
  );
  const scaledPayments = dayPayments.map((p) => ({
    ...p,
    amount: round2((Number(p.amount) || 0) * share),
  }));
  const p = splitPaymentAmount({
    ...b,
    paidAmount: collected,
    payments: scaledPayments,
  });
  const lastPay = dayPayments[dayPayments.length - 1];
  const modes = [
    ...new Set(
      dayPayments.map((pay) =>
        String(pay.mode || b.paymentMode || "cash").toLowerCase(),
      ),
    ),
  ];

  return {
    id: String(b._id),
    source: "bill",
    billNumber: b.billNumber,
    patientName: b.patient?.name || "—",
    patientId: b.patient?.patientId || "",
    phone: b.patient?.phone || "",
    createdAt: lastPay?.paidAt || b.createdAt,
    items: lineQty(pharmacyItems),
    totalAmount: billed,
    discount: round2((Number(b.discountAmount) || 0) * share),
    paidAmount: collected,
    dueAmount: round2((Number(b.dueAmount) || 0) * share),
    paymentMode: modes.length > 1 ? "multiple" : modes[0] || b.paymentMode || "—",
    billedByName: b.createdBy?.name || "—",
    billedByRole: b.createdBy?.role || "",
    status: b.status,
    cancelled: false,
    cashAmount: p.cash,
    upiAmount: p.upi,
    cardAmount: p.card,
    otherAmount: p.other,
  };
};

const mapDirectSaleRow = (s) => {
  const paid = Number(s.paidAmount) || 0;
  if (paid <= 0 || s.paymentStatus === "pending") return null;
  const mode = String(s.paymentMethod || "cash").toLowerCase();
  const total = s.grandTotal || 0;
  return {
    id: String(s._id),
    source: "sale",
    billNumber: s.invoiceNumber,
    patientName: s.patient?.name || s.customerName || "Walk-in",
    patientId: s.patient?.patientId || "",
    phone: s.patient?.phone || s.customerPhone || "",
    createdAt: s.saleDate || s.createdAt,
    items: lineQty(s.items),
    totalAmount: total,
    discount: s.totalDiscount || 0,
    paidAmount: paid,
    dueAmount: Math.max(0, total - paid),
    paymentMode: mode,
    billedByName: s.soldBy?.name || "—",
    billedByRole: s.soldBy?.role || "",
    status: s.paymentStatus || "paid",
    cancelled: false,
    cashAmount: mode === "cash" ? paid : 0,
    upiAmount: mode === "upi" ? paid : 0,
    cardAmount: mode === "card" ? paid : 0,
    otherAmount: !["cash", "upi", "card"].includes(mode) ? paid : 0,
  };
};

const summarisePharmacyRows = (rows) => {
  const acc = rows.filter((r) => !r.cancelled).reduce(
    (out, r) => {
      out.totalBills += 1;
      out.totalAmount += r.totalAmount;
      out.totalPaid += r.paidAmount;
      out.totalDue += r.dueAmount;
      out.totalDiscount += r.discount;
      out.totalItems += r.items;
      out.cashAmount += r.cashAmount;
      out.upiAmount += r.upiAmount;
      out.cardAmount += r.cardAmount;
      out.otherAmount += r.otherAmount;
      return out;
    },
    {
      totalBills: 0,
      totalAmount: 0,
      totalPaid: 0,
      totalDue: 0,
      totalDiscount: 0,
      totalItems: 0,
      cashAmount: 0,
      upiAmount: 0,
      cardAmount: 0,
      otherAmount: 0,
    },
  );
  ["totalAmount", "totalPaid", "totalDue", "totalDiscount", "cashAmount", "upiAmount", "cardAmount", "otherAmount"]
    .forEach((k) => { acc[k] = round2(acc[k]); });
  const modes = round2(acc.cashAmount + acc.upiAmount + acc.cardAmount + acc.otherAmount);
  if (Math.abs(modes - acc.totalPaid) > 0.05) {
    acc.otherAmount = round2(acc.otherAmount + (acc.totalPaid - modes));
  }
  return acc;
};

const loadPharmacySaleRows = async (from, to) => {
  const pharmacyBillMatch = {
    status: { $nin: ["cancelled", "refunded"] },
    $and: [
      {
        $or: [
          { billType: "pharmacy" },
          { "items.type": "medicine" },
          { "items.category": "Pharmacy" },
        ],
      },
      {
        $or: [
          { createdAt: { $gte: from, $lte: to }, paidAmount: { $gt: 0 } },
          { "payments.paidAt": { $gte: from, $lte: to } },
        ],
      },
    ],
  };

  const [bills, sales] = await Promise.all([
    Bill.find(pharmacyBillMatch)
      .populate("patient", "patientId name phone")
      .populate("createdBy", "name role")
      .sort({ createdAt: 1 })
      .lean(),
    DirectSale.find({
      saleDate: { $gte: from, $lte: to },
      paidAmount: { $gt: 0 },
      paymentStatus: { $ne: "pending" },
    })
      .populate("patient", "patientId name phone")
      .populate("soldBy", "name role")
      .sort({ saleDate: 1 })
      .lean(),
  ]);

  const seen = new Set();
  const rows = [];
  bills.forEach((b) => {
    const row = mapPharmacyBillRow(b, from, to);
    if (!row) return;
    seen.add(row.billNumber);
    rows.push(row);
  });
  sales.forEach((s) => {
    const row = mapDirectSaleRow(s);
    if (!row || seen.has(row.billNumber)) return;
    rows.push(row);
  });
  rows.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  return rows;
};

exports.getShiftReport = asyncHandler(async (req, res) => {
  const fromParam = req.query.from || req.query.date || kolkataToday();
  const toParam = req.query.to || fromParam;
  const start = istDayBounds(fromParam);
  const end = istDayBounds(toParam);
  const from = start.from;
  const to = end.to;

  const bills = await loadPharmacySaleRows(from, to);
  const summary = summarisePharmacyRows(bills);

  res.status(200).json({
    success: true,
    date: start.iso,
    dateRange: { from, to },
    summary,
    bills,
    shifts: [{
      _id: "day",
      window: { from, to },
      ...summary,
      bills,
    }],
  });
});

// ── Daily Report ──────────────────────────────────────────────────────────────
exports.getDailyReport = asyncHandler(async (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const from = new Date();
  from.setDate(from.getDate() - days);
  from.setHours(0, 0, 0, 0);

  const data = await Bill.aggregate([
    {
      $match: {
        createdAt: { $gte: from },
        status: { $ne: "cancelled" },
        billType: "pharmacy",
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        totalBills:   { $sum: 1 },
        totalAmount:  { $sum: "$totalAmount" },
        totalPaid:    { $sum: "$paidAmount" },
        totalDue:     { $sum: "$dueAmount" },
        paidBills:    { $sum: { $cond: [{ $eq: ["$status", "paid"] }, 1, 0] } },
        partialBills: { $sum: { $cond: [{ $eq: ["$status", "partial"] }, 1, 0] } },
      },
    },
    { $sort: { _id: -1 } },
  ]);

  res.status(200).json({ success: true, days, data });
});

// ── Weekly Report ─────────────────────────────────────────────────────────────
exports.getWeeklyReport = asyncHandler(async (req, res) => {
  const weeks = parseInt(req.query.weeks) || 8;
  const from = new Date();
  from.setDate(from.getDate() - weeks * 7);
  from.setHours(0, 0, 0, 0);

  const data = await Bill.aggregate([
    {
      $match: {
        createdAt: { $gte: from },
        status: { $ne: "cancelled" },
        billType: "pharmacy",
      },
    },
    {
      $group: {
        _id: {
          year: { $isoWeekYear: "$createdAt" },
          week: { $isoWeek: "$createdAt" },
        },
        totalBills:   { $sum: 1 },
        totalAmount:  { $sum: "$totalAmount" },
        totalPaid:    { $sum: "$paidAmount" },
        totalDue:     { $sum: "$dueAmount" },
        paidBills:    { $sum: { $cond: [{ $eq: ["$status", "paid"] }, 1, 0] } },
        partialBills: { $sum: { $cond: [{ $eq: ["$status", "partial"] }, 1, 0] } },
        weekStart:    { $min: "$createdAt" },
      },
    },
    { $sort: { "_id.year": -1, "_id.week": -1 } },
    {
      $project: {
        _id: {
          $concat: [
            "Week ",
            { $toString: "$_id.week" },
            " / ",
            { $toString: "$_id.year" },
          ],
        },
        totalBills: 1, totalAmount: 1, totalPaid: 1, totalDue: 1,
        paidBills: 1, partialBills: 1, weekStart: 1,
      },
    },
  ]);

  res.status(200).json({ success: true, weeks, data });
});

// ── Monthly Report ────────────────────────────────────────────────────────────
exports.getMonthlyReport = asyncHandler(async (req, res) => {
  const months = parseInt(req.query.months) || 12;
  const from = new Date();
  from.setMonth(from.getMonth() - months);
  from.setDate(1);
  from.setHours(0, 0, 0, 0);

  const data = await Bill.aggregate([
    {
      $match: {
        createdAt: { $gte: from },
        status: { $ne: "cancelled" },
        billType: "pharmacy",
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
        totalBills:   { $sum: 1 },
        totalAmount:  { $sum: "$totalAmount" },
        totalPaid:    { $sum: "$paidAmount" },
        totalDue:     { $sum: "$dueAmount" },
        paidBills:    { $sum: { $cond: [{ $eq: ["$status", "paid"] }, 1, 0] } },
        partialBills: { $sum: { $cond: [{ $eq: ["$status", "partial"] }, 1, 0] } },
      },
    },
    { $sort: { _id: -1 } },
  ]);

  res.status(200).json({ success: true, months, data });
});

// ── Staff / Pharmacist Settlement Report ──────────────────────────────────────
exports.getStaffReport = asyncHandler(async (req, res) => {
  const fromBound = istDayBounds(req.query.from || kolkataToday());
  const toBound = istDayBounds(req.query.to || req.query.from || kolkataToday());
  const from = fromBound.from;
  const to = toBound.to;

  const rows = await loadPharmacySaleRows(from, to);
  const map = {};
  for (const r of rows) {
    if (r.cancelled) continue;
    const staffName = r.billedByName || "Unknown";
    const key = staffName;
    if (!map[key]) {
      map[key] = {
        _id: { staffName },
        staffName,
        totalBills: 0,
        totalAmount: 0,
        totalPaid: 0,
        totalDue: 0,
        cashCollected: 0,
        upiCollected: 0,
        cardCollected: 0,
      };
    }
    const row = map[key];
    row.totalBills += 1;
    row.totalAmount += r.totalAmount;
    row.totalPaid += r.paidAmount;
    row.totalDue += r.dueAmount;
    row.cashCollected += r.cashAmount;
    row.upiCollected += r.upiAmount;
    row.cardCollected += r.cardAmount;
  }

  const data = Object.values(map).map((row) => ({
    ...row,
    totalAmount: round2(row.totalAmount),
    totalPaid: round2(row.totalPaid),
    totalDue: round2(row.totalDue),
    cashCollected: round2(row.cashCollected),
    upiCollected: round2(row.upiCollected),
    cardCollected: round2(row.cardCollected),
  }));

  res.status(200).json({ success: true, dateRange: { from, to }, data });
});

exports.getRevenueReport = asyncHandler(async (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const from = new Date();
  from.setDate(from.getDate() - days);

  const daily = await Bill.aggregate([
    {
      $match: {
        createdAt: { $gte: from },
        status: { $in: ["paid", "partial"] },
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        revenue: { $sum: "$paidAmount" },
        bills: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const byType = await Bill.aggregate([
    { $match: { createdAt: { $gte: from } } },
    {
      $group: {
        _id: "$billType",
        revenue: { $sum: "$paidAmount" },
        count: { $sum: 1 },
      },
    },
  ]);

  const doctorOPCount = await OPRegistration.aggregate([
    { $match: { tokenDate: { $gte: from } } },
    { $group: { _id: "$doctor", count: { $sum: 1 } } },
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "doctorInfo",
      },
    },
    { $unwind: { path: "$doctorInfo", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        doctorName: { $ifNull: ["$doctorInfo.name", "Unassigned"] },
        count: 1,
      },
    },
  ]);

  const doctorRevenue = await Bill.aggregate([
    {
      $match: {
        createdAt: { $gte: from },
        status: { $in: ["paid", "partial"] },
      },
    },
    {
      $group: {
        _id: "$doctor",
        revenue: { $sum: "$paidAmount" },
        count: { $sum: 1 },
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "doctorInfo",
      },
    },
    { $unwind: { path: "$doctorInfo", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        doctorName: { $ifNull: ["$doctorInfo.name", "Pharmacy/Misc"] },
        revenue: 1,
        count: 1,
      },
    },
  ]);

  res
    .status(200)
    .json({
      success: true,
      data: { daily, byType, doctorOPCount, doctorRevenue },
    });
});