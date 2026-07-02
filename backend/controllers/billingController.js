const asyncHandler = require("../utils/asyncHandler");
const ErrorResponse = require("../utils/errorResponse");
const Bill = require("../models/Bill");
const OPRegistration = require("../models/OPRegistration");
const Counter = require("../models/Counter");
const Medicine = require("../models/Medicine");
const { generateBillNo } = require("../utils/generateId");
const {
  generateInvoicePDF,
  generateThermalPrint,
} = require("../utils/pdfGenerator");
const {
  getMedicineItems,
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
const { normalizeRole } = require("../utils/roles");

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

const toPlain = (value) => JSON.parse(JSON.stringify(value || null));

const isPharmacyScopeBill = (bill) => {
  const type = bill.billType || "unified";
  const items = bill.items || [];
  const hasOnlyMedicines =
    items.length > 0 &&
    items.every(
      (item) => item.type === "medicine" || item.category === "Pharmacy",
    );
  return type === "pharmacy" || (type === "ip" && hasOnlyMedicines);
};

const requirePharmacistBillScope = (req, billLike, next) => {
  if (normalizeRole(req.user.role) !== "Pharmacist") return false;
  if (!isPharmacyScopeBill(billLike)) {
    next(
      new ErrorResponse(
        "Pharmacy users can manage pharmacy and IP pharmacy bills only",
        403,
      ),
    );
    return true;
  }
  return false;
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
  res.status(200).json(res.advancedResults);
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

  const seq = await Counter.getNextSeq("bill");
  req.body.billNumber = generateBillNo(seq);
  req.body.createdBy = req.user._id;
  if (!req.body.billType) req.body.billType = "unified";

  req.body.items = await enrichMedicineItems(req.body.items);
  req.body.items = calculateItemAmounts(req.body.items);

  if (requirePharmacistBillScope(req, req.body, next)) return;

  const medicineItems = getMedicineItems(req.body.items);
  const dispensedMeds = medicineItems.filter(
    (i) => i.referenceModel === "Prescription",
  );
  const newMeds = medicineItems.filter(
    (i) => i.referenceModel !== "Prescription",
  );

  if (newMeds.length > 0) {
    await validateMedicineStock(req.body.items);
  }

  let deductedStock = [];
  if (newMeds.length > 0) {
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
    bill = await Bill.create(req.body);
    await markSourcesAsBilled(req.body.items, bill._id);
  } catch (error) {
    await restoreMedicineStock(deductedStock);
    throw error;
  }

  const populated = await Bill.findById(bill._id)
    .populate("patient", "patientId name age gender phone")
    .populate("doctor", "name")
    .populate("department", "name")
    .populate("items.medicine", "name currentStock");

  const itemCount = req.body.items.length;
  res.status(201).json({
    success: true,
    data: populated,
    message: `Unified bill created with ${itemCount} item(s).${dispensedMeds.length ? ` ${dispensedMeds.length} dispensed medicine charge(s) included.` : ""}${newMeds.length ? ` ${newMeds.length} medicine(s) deducted from inventory.` : ""}`,
  });
});

exports.updateBill = asyncHandler(async (req, res, next) => {
  let bill = await Bill.findById(req.params.id);
  if (!bill) return next(new ErrorResponse("Bill not found", 404));
  if (bill.status === "cancelled")
    return next(new ErrorResponse("Cannot update a cancelled bill", 400));
  if (requirePharmacistBillScope(req, bill, next)) return;

  const reason = (req.body.reason || req.body.auditReason || "").trim();
  if (isPharmacyScopeBill(bill) && !reason) {
    return next(
      new ErrorResponse("Reason is required when editing pharmacy bills", 400),
    );
  }

  const oldBill = toPlain(bill.toObject());
  const update = { ...req.body };
  delete update.reason;
  delete update.auditReason;

  if (update.items) {
    update.items = await enrichMedicineItems(update.items);
    update.items = calculateItemAmounts(update.items);
    if (isPharmacyScopeBill(bill)) {
      try {
        await restoreBillItemsStock(bill.items);
        await validateMedicineStock(update.items);
        await deductMedicineStock(getMedicineItems(update.items), req.user._id);
      } catch (error) {
        await deductMedicineStock(
          getMedicineItems(oldBill.items),
          req.user._id,
        );
        throw error;
      }
    }
  }

  Object.assign(bill, update);
  const auditEntries = isPharmacyScopeBill(bill)
    ? buildBillEditEntries(
        oldBill,
        {
          ...toPlain(bill.toObject()),
          ...toPlain(update),
          billNumber: bill.billNumber,
        },
        req,
        reason,
      )
    : [];
  if (auditEntries.length) bill.editHistory.push(...auditEntries);

  try {
    await bill.save();
  } catch (error) {
    if (update.items && isPharmacyScopeBill(bill)) {
      await restoreBillItemsStock(update.items);
      await deductMedicineStock(getMedicineItems(oldBill.items), req.user._id);
    }
    throw error;
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

  const medicineItems = getMedicineItems(bill.items).filter(
    (i) => i.referenceModel !== "Prescription",
  );
  if (medicineItems.length > 0) {
    await restoreBillItemsStock(bill.items);
  }

  await unmarkSourcesAsBilled(bill.items, bill._id);

  bill.status = "cancelled";
  bill.notes = req.body.reason
    ? `${bill.notes ? `${bill.notes} | ` : ""}Cancelled: ${req.body.reason}`
    : bill.notes;
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
  await generateInvoicePDF(bill, res);
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
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const month = new Date(today.getFullYear(), today.getMonth(), 1);

  const [todayRevenue, monthRevenue, pendingBills, totalBills] =
    await Promise.all([
      Bill.aggregate([
        {
          $match: {
            createdAt: { $gte: today },
            status: { $in: ["paid", "partial"] },
          },
        },
        { $group: { _id: null, total: { $sum: "$paidAmount" } } },
      ]),
      Bill.aggregate([
        {
          $match: {
            createdAt: { $gte: month },
            status: { $in: ["paid", "partial"] },
          },
        },
        { $group: { _id: null, total: { $sum: "$paidAmount" } } },
      ]),
      Bill.countDocuments({ status: { $in: ["pending", "partial"] } }),
      Bill.countDocuments({ createdAt: { $gte: today } }),
    ]);

  res.status(200).json({
    success: true,
    data: {
      todayRevenue: todayRevenue[0]?.total || 0,
      monthRevenue: monthRevenue[0]?.total || 0,
      pendingBills,
      totalBills,
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Shift helper — returns "morning" | "afternoon" | "evening" | "night"
// Morning   06:00–11:59  |  Afternoon  12:00–17:59
// Evening   18:00–20:59  |  Night      21:00–05:59
// ─────────────────────────────────────────────────────────────────────────────
const getShift = (date) => {
  const h = new Date(date).getHours();
  if (h >= 6 && h < 12)  return "morning";
  if (h >= 12 && h < 18) return "afternoon";
  if (h >= 18 && h < 21) return "evening";
  return "night";
};

// ── Shift-wise Report ─────────────────────────────────────────────────────────
exports.getShiftReport = asyncHandler(async (req, res) => {
  const from = req.query.from
    ? new Date(req.query.from)
    : (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })();
  const to = req.query.to
    ? (() => { const d = new Date(req.query.to); d.setHours(23,59,59,999); return d; })()
    : (() => { const d = new Date(); d.setHours(23,59,59,999); return d; })();

  const bills = await Bill.find({
    createdAt: { $gte: from, $lte: to },
    status: { $ne: "cancelled" },
  })
    .populate("patient", "patientId name phone")
    .populate("createdBy", "name role")
    .sort({ createdAt: 1 })
    .lean();

  // Group by shift
  const shiftMap = { morning: [], afternoon: [], evening: [], night: [] };
  for (const b of bills) {
    const shift = getShift(b.createdAt);
    shiftMap[shift].push(b);
  }

  const shifts = Object.entries(shiftMap).map(([shiftName, shiftBills]) => {
    const totalBills   = shiftBills.length;
    const totalAmount  = shiftBills.reduce((s, b) => s + (b.totalAmount  || 0), 0);
    const totalPaid    = shiftBills.reduce((s, b) => s + (b.paidAmount   || 0), 0);
    const totalDue     = shiftBills.reduce((s, b) => s + (b.dueAmount    || 0), 0);
    const cashCount    = shiftBills.filter(b => b.paymentMode === "cash").length;
    const upiCount     = shiftBills.filter(b => b.paymentMode === "upi").length;
    const cardCount    = shiftBills.filter(b => b.paymentMode === "card").length;
    return {
      _id: shiftName,
      totalBills,
      totalAmount: Number(totalAmount.toFixed(2)),
      totalPaid:   Number(totalPaid.toFixed(2)),
      totalDue:    Number(totalDue.toFixed(2)),
      cashCount, upiCount, cardCount,
      bills: shiftBills.map(b => ({
        billNumber:  b.billNumber,
        patientName: b.patient?.name || "—",
        totalAmount: b.totalAmount  || 0,
        paidAmount:  b.paidAmount   || 0,
        dueAmount:   b.dueAmount    || 0,
        billedByName: b.createdBy?.name || "—",
        paymentMode: b.paymentMode,
        createdAt:   b.createdAt,
      })),
    };
  });

  const grandTotal  = bills.reduce((s, b) => s + (b.totalAmount || 0), 0);
  const grandPaid   = bills.reduce((s, b) => s + (b.paidAmount  || 0), 0);
  const grandDue    = bills.reduce((s, b) => s + (b.dueAmount   || 0), 0);

  res.status(200).json({
    success: true,
    dateRange: { from, to },
    summary: {
      totalBills:  bills.length,
      totalAmount: Number(grandTotal.toFixed(2)),
      totalPaid:   Number(grandPaid.toFixed(2)),
      totalDue:    Number(grandDue.toFixed(2)),
    },
    shifts,
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
        billType: { $in: ["pharmacy", "op", "unified"] },
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
        billType: { $in: ["pharmacy", "op", "unified"] },
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
        billType: { $in: ["pharmacy", "op", "unified"] },
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
  const from = req.query.from
    ? new Date(req.query.from)
    : (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })();
  const to = req.query.to
    ? (() => { const d = new Date(req.query.to); d.setHours(23,59,59,999); return d; })()
    : (() => { const d = new Date(); d.setHours(23,59,59,999); return d; })();

  const bills = await Bill.find({
    createdAt: { $gte: from, $lte: to },
    status: { $ne: "cancelled" },
  })
    .populate("createdBy", "name role")
    .lean();

  // Group by staff × shift
  const map = {};
  for (const b of bills) {
    const staffId   = b.createdBy?._id?.toString() || "unknown";
    const staffName = b.createdBy?.name || "Unknown";
    const shift     = getShift(b.createdAt);
    const key       = `${staffId}__${shift}`;

    if (!map[key]) {
      map[key] = {
        _id:          { staffId, staffName, shift },
        staffName,
        totalBills:   0,
        totalAmount:  0,
        totalPaid:    0,
        totalDue:     0,
        cashCollected: 0,
        upiCollected:  0,
        cardCollected: 0,
      };
    }
    const row = map[key];
    row.totalBills++;
    row.totalAmount  += b.totalAmount || 0;
    row.totalPaid    += b.paidAmount  || 0;
    row.totalDue     += b.dueAmount   || 0;
    if (b.paymentMode === "cash")  row.cashCollected += b.paidAmount || 0;
    if (b.paymentMode === "upi")   row.upiCollected  += b.paidAmount || 0;
    if (b.paymentMode === "card")  row.cardCollected += b.paidAmount || 0;
  }

  const data = Object.values(map).map(row => ({
    ...row,
    totalAmount:   Number(row.totalAmount.toFixed(2)),
    totalPaid:     Number(row.totalPaid.toFixed(2)),
    totalDue:      Number(row.totalDue.toFixed(2)),
    cashCollected: Number(row.cashCollected.toFixed(2)),
    upiCollected:  Number(row.upiCollected.toFixed(2)),
    cardCollected: Number(row.cardCollected.toFixed(2)),
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