const Counter = require('../models/Counter');
const Medicine = require('../models/Medicine');
const Supplier = require('../models/Supplier');
const Purchase = require('../models/Purchase');
const PurchaseReturn = require('../models/PurchaseReturn');
const StockMovement = require('../models/StockMovement');
const {
  syncCurrentStock,
  findActiveBatch,
  receivePurchaseBatch,
  logStockMovement,
  normalizeBatchNumber,
  sameBatchNumber,
} = require('../utils/pharmacyStockHelper');
const {
  round2,
  RETURN_REASONS,
  PAYMENT_TYPES,
  PAYMENT_STATUSES,
  GST_MODES,
  parseExpiry,
  summarizePurchase,
  physicalQty,
  effectiveUnitCost,
  stockValue,
  returnValue,
  returnableQuantity,
  assertReturnQuantity,
  creditPortion,
  returnStatusOf,
} = require('../utils/purchaseCalc');
const { logActivity } = require('../utils/activityLogger');
const { parseIstDateTime, istDayBounds, inclusiveIstRange, kolkataToday } = require('../utils/istDay');

const fail = (message, statusCode = 400) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  throw err;
};

const MOVEMENT_LABELS = {
  stock_in: 'Purchase',
  purchase: 'Purchase',
  purchase_return: 'Purchase Return',
  dispense: 'Sale',
  bill_deduct: 'Sale',
  sale: 'Sale',
  sale_return: 'Sale Return',
  stock_adjustment_increase: 'Adjustment In',
  adjustment_in: 'Adjustment In',
  stock_adjustment_reduce: 'Adjustment Out',
  adjustment_out: 'Adjustment Out',
  adjustment: 'Adjustment',
  dispose: 'Expired',
  expired: 'Expired',
  damaged: 'Damaged',
  opening_stock: 'Opening',
  transfer_in: 'Transfer In',
  transfer_out: 'Transfer Out',
  expiry_alert: 'Expiry Alert',
  reorder: 'Reorder',
};

const TYPE_CODES = {
  stock_in: 'PURCHASE',
  purchase: 'PURCHASE',
  purchase_return: 'PURCHASE_RETURN',
  dispense: 'SALE',
  bill_deduct: 'SALE',
  sale: 'SALE',
  sale_return: 'SALE_RETURN',
  stock_adjustment_increase: 'ADJUSTMENT_IN',
  adjustment_in: 'ADJUSTMENT_IN',
  stock_adjustment_reduce: 'ADJUSTMENT_OUT',
  adjustment_out: 'ADJUSTMENT_OUT',
  adjustment: 'ADJUSTMENT_OUT',
  dispose: 'EXPIRED',
  expired: 'EXPIRED',
  damaged: 'DAMAGED',
  opening_stock: 'OPENING_STOCK',
  transfer_in: 'TRANSFER_IN',
  transfer_out: 'TRANSFER_OUT',
};

const auditFrom = (req, action, note) => ({
  action,
  user: req.user?._id,
  role: req.user?.role || '',
  at: new Date(),
  ipAddress: String(req.ip || req.headers?.['x-forwarded-for'] || '').slice(0, 120),
  userAgent: String(req.headers?.['user-agent'] || '').slice(0, 240),
  note: note || '',
});

const actor = (req) => ({
  createdBy: req.user._id,
  createdByName: req.user.name || '',
  createdByRole: req.user.role || '',
  ipAddress: String(req.ip || req.headers?.['x-forwarded-for'] || '').slice(0, 120),
  userAgent: String(req.headers?.['user-agent'] || '').slice(0, 240),
});

const nextNumber = async (key, prefix) => {
  const seq = await Counter.getNextSeq(key);
  return `${prefix}-${String(seq).padStart(6, '0')}`;
};

const adjustSupplierCredit = async (supplierId, delta) => {
  const change = round2(delta);
  if (!change) return;
  const supplier = await Supplier.findById(supplierId);
  if (!supplier) return;
  supplier.outstanding = round2(Math.max(0, (Number(supplier.outstanding) || 0) + change));
  await supplier.save();
};

const rollbackReceipts = async (receipts) => {
  for (const row of [...receipts].reverse()) {
    const medicine = await Medicine.findById(row.medicineId);
    if (!medicine) continue;
    const batch = findActiveBatch(medicine, row.batchNumber);
    if (batch) {
      const left = (Number(batch.quantity) || 0) - row.physical;
      if (!row.merged && left <= 0) {
        medicine.batches.pull(batch._id);
      } else {
        batch.quantity = Math.max(0, left);
        batch.freeQuantity = Math.max(0, (Number(batch.freeQuantity) || 0) - (row.free || 0));
      }
    }
    syncCurrentStock(medicine);
    medicine.markModified('batches');
    await medicine.save();
  }
};

const prepareLines = async (rawItems, gstMode) => {
  if (!Array.isArray(rawItems) || !rawItems.length) fail('Add at least one medicine');
  const seen = new Set();
  const drafts = [];

  for (const raw of rawItems) {
    const medicine = await Medicine.findById(raw.medicineId || raw.medicine);
    if (!medicine || medicine.isActive === false) {
      fail('Select a medicine from the medicine master. Do not create a duplicate.');
    }
    const batchNumber = normalizeBatchNumber(raw.batchNumber);
    if (!batchNumber) fail(`Batch number is required for ${medicine.name}`);
    const key = `${medicine._id}|${batchNumber.toLowerCase()}`;
    if (seen.has(key)) fail(`${medicine.name} batch ${batchNumber} is listed twice on this invoice`);
    seen.add(key);

    const freeQuantity = Number(raw.freeQuantity || 0);
    if (freeQuantity < 0) fail('Free quantity cannot be negative');
    const expiryDate = parseExpiry(raw.expiryDate);
    const sellingPrice = Number(medicine.sellingPrice) || 0;
    drafts.push({
      medicine,
      batchNumber,
      expiryDate,
      quantity: raw.quantity,
      freeQuantity,
      purchaseRate: raw.purchaseRate,
      discount: raw.discountAmount != null ? raw.discountAmount : raw.discount,
      gstPercent: raw.gstPercent != null && raw.gstPercent !== '' ? raw.gstPercent : (medicine.gstPercent || 0),
      sellingPrice,
    });
  }

  const summary = summarizePurchase(drafts.map((d) => ({
    quantity: d.quantity,
    purchaseRate: d.purchaseRate,
    discount: d.discount,
    gstPercent: d.gstPercent,
  })), 0, gstMode);

  return drafts.map((draft, index) => {
    const priced = summary.lines[index];
    const units = physicalQty(priced.quantity, draft.freeQuantity);
    return {
      ...draft,
      ...priced,
      freeQuantity: draft.freeQuantity,
      physical: units,
      effectiveUnitCost: effectiveUnitCost(priced.grossAmount, units),
    };
  });
};

const applyReceipts = async (lines, { supplierInvoice, receivedDate }) => {
  const receipts = [];
  try {
    for (const line of lines) {
      const medicine = await Medicine.findById(line.medicine._id);
      if (!medicine) fail('Medicine stock changed. Refresh and try again.', 409);
      const masterSelling = medicine.sellingPrice;
      const masterPurchase = medicine.purchasePrice;
      const qtyBefore = medicine.currentStock;
      const result = receivePurchaseBatch(medicine, {
        batchNumber: line.batchNumber,
        paidQuantity: line.quantity,
        freeQuantity: line.freeQuantity,
        expiryDate: line.expiryDate,
        purchaseRate: line.purchaseRate,
        supplierInvoice,
        receivedDate,
      });
      if (medicine.sellingPrice !== masterSelling || medicine.purchasePrice !== masterPurchase) {
        medicine.sellingPrice = masterSelling;
        medicine.purchasePrice = masterPurchase;
      }
      syncCurrentStock(medicine);
      medicine.markModified('batches');
      await medicine.save();
      receipts.push({
        medicineId: medicine._id,
        batchNumber: result.batch.batchNumber,
        physical: result.physical,
        free: line.freeQuantity,
        merged: result.merged,
      });
      line.stock = {
        medicine,
        qtyBefore,
        qtyAfter: medicine.currentStock,
        batchQtyBefore: result.batchQtyBefore,
        batchQtyAfter: result.batchQtyAfter,
        batchNumber: result.batch.batchNumber,
      };
    }
    return receipts;
  } catch (err) {
    await rollbackReceipts(receipts);
    throw err;
  }
};

const decoratePurchase = async (doc) => {
  const purchase = doc.toObject ? doc.toObject() : { ...doc };
  const ids = [...new Set((purchase.items || []).map((item) => String(item.medicine?._id || item.medicine)))];
  const meds = await Medicine.find({ _id: { $in: ids } }).select('batches sellingPrice purchasePrice');
  const byId = new Map(meds.map((m) => [String(m._id), m]));

  purchase.items = (purchase.items || []).map((item) => {
    const med = byId.get(String(item.medicine?._id || item.medicine));
    const batch = med ? findActiveBatch(med, item.batchNumber) : null;
    const batchQty = batch ? Number(batch.quantity) || 0 : 0;
    const info = returnableQuantity({
      purchasedQty: item.quantity,
      freeQty: item.freeQuantity,
      returnedQty: item.returnedQuantity,
      batchQty,
    });
    const rate = Number(item.purchaseRate) || 0;
    const batchRate = batch && batch.purchasePrice != null ? Number(batch.purchasePrice) : rate;
    return {
      ...item,
      batchStock: batchQty,
      availableToReturn: purchase.status === 'active' ? info.available : 0,
      remainingOnInvoice: info.remainingOnInvoice,
      originalValue: stockValue(item.quantity, rate),
      returnedValue: returnValue(item.returnedQuantity, rate),
      remainingInvoiceValue: stockValue(info.remainingOnInvoice, rate),
      batchPurchaseRate: batchRate,
      batchStockValue: stockValue(batchQty, batchRate),
    };
  });
  return purchase;
};

const compactPurchase = (row) => ({
  _id: row._id,
  purchaseNumber: row.purchaseNumber,
  supplierInvoiceNumber: row.supplierInvoiceNumber,
  supplier: row.supplier,
  supplierName: row.supplierName || row.supplier?.name,
  purchaseDate: row.purchaseDate,
  dueDate: row.dueDate,
  paymentType: row.paymentType,
  paymentStatus: row.paymentStatus,
  grandTotal: row.grandTotal,
  netPurchaseValue: row.netPurchaseValue,
  grossPurchaseValue: row.grossPurchaseValue,
  totalQuantity: row.totalQuantity,
  itemCount: row.items?.length || 0,
  returnStatus: row.returnStatus,
  status: row.status,
  createdBy: row.createdBy,
  createdByName: row.createdByName || row.createdBy?.name,
  createdByRole: row.createdByRole,
});

exports.createPurchase = async (req) => {
  const body = req.body || {};
  if (!body.supplier) fail('Supplier is required');
  const invoice = String(body.supplierInvoiceNumber || '').trim();
  if (!invoice) fail('Supplier invoice number is required');

  const supplier = await Supplier.findById(body.supplier);
  if (!supplier || supplier.isActive === false) fail('Supplier not found', 404);

  const duplicate = await Purchase.findOne({
    supplier: supplier._id,
    supplierInvoiceNumber: invoice,
    status: 'active',
  }).select('purchaseNumber');
  if (duplicate) fail(`Invoice ${invoice} is already recorded (${duplicate.purchaseNumber})`, 409);

  const gstMode = GST_MODES.includes(body.gstMode) ? body.gstMode : 'intra';
  const paymentType = PAYMENT_TYPES.includes(body.paymentType) ? body.paymentType : 'credit';
  let paymentStatus = body.paymentStatus;
  if (!PAYMENT_STATUSES.includes(paymentStatus)) {
    paymentStatus = paymentType === 'credit' ? 'unpaid' : 'paid';
  }

  let lines = await prepareLines(body.items, gstMode);
  const summary = summarizePurchase(lines.map((line) => ({
    quantity: line.quantity,
    purchaseRate: line.purchaseRate,
    discount: line.discountAmount,
    gstPercent: line.gstPercent,
  })), body.overallDiscount || 0, gstMode);
  lines = lines.map((line, index) => {
    const priced = summary.lines[index];
    return {
      ...line,
      ...priced,
      effectiveUnitCost: effectiveUnitCost(priced.grossAmount, line.physical),
    };
  });

  const purchaseDate = parseIstDateTime(body.purchaseDate) || new Date();
  const receipts = await applyReceipts(lines, { supplierInvoice: invoice, receivedDate: purchaseDate });

  const pay = creditPortion(summary.grandTotal, paymentStatus, body.amountPaid);
  const who = actor(req);
  let purchase;
  try {
    purchase = await Purchase.create({
      purchaseNumber: await nextNumber('purchase', 'PUR'),
      supplier: supplier._id,
      supplierName: supplier.name,
      supplierInvoiceNumber: invoice,
      purchaseDate,
      dueDate: body.dueDate ? parseIstDateTime(body.dueDate) : undefined,
      paymentType,
      paymentStatus,
      amountPaid: pay.amountPaid,
      appliedCredit: pay.credit,
      referenceNumber: String(body.referenceNumber || '').trim(),
      notes: String(body.notes || '').trim(),
      gstMode,
      items: lines.map((line) => ({
        medicine: line.medicine._id,
        medicineName: line.medicine.name,
        batchNumber: line.stock?.batchNumber || line.batchNumber,
        expiryDate: line.expiryDate,
        quantity: line.quantity,
        freeQuantity: line.freeQuantity,
        purchaseRate: line.purchaseRate,
        sellingPrice: line.sellingPrice,
        discountAmount: line.discountAmount,
        overallDiscountShare: line.overallDiscountShare,
        gstPercent: line.gstPercent,
        grossAmount: line.grossAmount,
        taxableAmount: line.taxableAmount,
        cgst: line.cgst,
        sgst: line.sgst,
        igst: line.igst,
        taxAmount: line.taxAmount,
        lineTotal: line.lineTotal,
        returnedQuantity: 0,
        effectiveUnitCost: line.effectiveUnitCost,
      })),
      grossPurchaseValue: summary.grossPurchaseValue,
      itemDiscountTotal: summary.itemDiscountTotal,
      overallDiscount: summary.overallDiscount,
      taxableAmount: summary.taxableAmount,
      taxAmount: summary.taxAmount,
      cgstTotal: summary.cgstTotal,
      sgstTotal: summary.sgstTotal,
      igstTotal: summary.igstTotal,
      netPurchaseValue: summary.netPurchaseValue,
      grandTotal: summary.grandTotal,
      totalQuantity: round2(lines.reduce((s, line) => s + line.physical, 0)),
      returnStatus: 'none',
      status: 'active',
      ...who,
      audit: [auditFrom(req, 'Created', 'Purchase saved and stock increased')],
    });
  } catch (err) {
    await rollbackReceipts(receipts);
    throw err;
  }

  for (const line of lines) {
    await logStockMovement({
      medicine: line.stock.medicine,
      batchNumber: line.stock.batchNumber,
      type: 'purchase',
      quantityBefore: line.stock.qtyBefore,
      quantityAfter: line.stock.qtyAfter,
      quantityChanged: line.physical,
      batchQuantityBefore: line.stock.batchQtyBefore,
      batchQuantityAfter: line.stock.batchQtyAfter,
      unitPrice: line.purchaseRate,
      totalValue: line.grossAmount,
      supplier: supplier._id,
      referenceId: purchase._id,
      referenceModel: 'Purchase',
      userId: req.user._id,
      remarks: `Purchase ${invoice} (${purchase.purchaseNumber})`,
    });
  }

  if (pay.credit) await adjustSupplierCredit(supplier._id, pay.credit);

  await logActivity(req, {
    action: 'Purchase Created',
    module: 'Pharmacy',
    description: `${req.user?.name || 'User'} recorded purchase ${invoice} from ${supplier.name}`,
    relatedId: purchase._id,
    relatedModel: 'Purchase',
    metadata: { grandTotal: purchase.grandTotal, purchaseNumber: purchase.purchaseNumber },
  });

  return decoratePurchase(purchase);
};

exports.listPurchases = async (query = {}) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  const filter = {};
  if (query.status === 'active' || query.status === 'cancelled') filter.status = query.status;
  if (query.supplier) filter.supplier = query.supplier;
  if (query.paymentStatus && PAYMENT_STATUSES.includes(query.paymentStatus)) {
    filter.paymentStatus = query.paymentStatus;
  }
  if (query.returnStatus) filter.returnStatus = query.returnStatus;
  if (query.from || query.to) {
    const range = inclusiveIstRange(query.from || query.to, query.to || query.from);
    filter.purchaseDate = { $gte: range.from, $lt: range.to };
  }
  const q = String(query.q || '').trim();
  if (q) {
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { supplierInvoiceNumber: { $regex: escaped, $options: 'i' } },
      { purchaseNumber: { $regex: escaped, $options: 'i' } },
      { supplierName: { $regex: escaped, $options: 'i' } },
    ];
  }

  const [rows, total] = await Promise.all([
    Purchase.find(filter)
      .sort('-purchaseDate -createdAt')
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('supplier', 'name phone gstNumber')
      .populate('createdBy', 'name role')
      .lean(),
    Purchase.countDocuments(filter),
  ]);

  let data = rows.map(compactPurchase);
  if (query.returnable === '1' || query.returnable === 'true') {
    const full = await Purchase.find({ _id: { $in: rows.map((r) => r._id) }, status: 'active' });
    const openIds = new Set();
    full.forEach((doc) => {
      const open = (doc.items || []).some((item) =>
        physicalQty(item.quantity, item.freeQuantity) - (item.returnedQuantity || 0) > 0);
      if (open) openIds.add(String(doc._id));
    });
    data = data.filter((row) => openIds.has(String(row._id)) && row.status === 'active');
  }

  return { data, total, page, pages: Math.max(1, Math.ceil(total / limit)) };
};

exports.getPurchase = async (id) => {
  const purchase = await Purchase.findById(id)
    .populate('supplier', 'name company phone email gstNumber address paymentTerms creditDays')
    .populate('createdBy', 'name role');
  if (!purchase) fail('Purchase not found', 404);
  return decoratePurchase(purchase);
};

exports.updatePurchaseHeader = async (req) => {
  const purchase = await Purchase.findById(req.params.id);
  if (!purchase) fail('Purchase not found', 404);
  if (purchase.status !== 'active') fail('Cancelled purchases cannot be edited');

  const body = req.body || {};
  if (body.paymentType && PAYMENT_TYPES.includes(body.paymentType)) purchase.paymentType = body.paymentType;
  if (body.paymentStatus && PAYMENT_STATUSES.includes(body.paymentStatus)) purchase.paymentStatus = body.paymentStatus;
  if (body.dueDate !== undefined) purchase.dueDate = body.dueDate ? parseIstDateTime(body.dueDate) : undefined;
  if (body.referenceNumber !== undefined) purchase.referenceNumber = String(body.referenceNumber || '').trim();
  if (body.notes !== undefined) purchase.notes = String(body.notes || '').trim();
  if (body.amountPaid !== undefined || body.paymentStatus) {
    const pay = creditPortion(purchase.grandTotal, purchase.paymentStatus, body.amountPaid != null ? body.amountPaid : purchase.amountPaid);
    const delta = round2(pay.credit - (purchase.appliedCredit || 0));
    purchase.amountPaid = pay.amountPaid;
    purchase.appliedCredit = pay.credit;
    if (delta) await adjustSupplierCredit(purchase.supplier, delta);
  }
  purchase.audit.push(auditFrom(req, 'Updated', 'Purchase header updated'));
  await purchase.save();
  await logActivity(req, {
    action: 'Purchase Updated',
    module: 'Pharmacy',
    description: `${req.user?.name || 'User'} updated purchase ${purchase.supplierInvoiceNumber}`,
    relatedId: purchase._id,
    relatedModel: 'Purchase',
  });
  return decoratePurchase(purchase);
};

const releasePurchaseStock = async (purchase, req, remarks) => {
  for (const item of purchase.items) {
    const medicine = await Medicine.findById(item.medicine);
    if (!medicine) fail(`Medicine for ${item.medicineName} is no longer available`, 409);
    const batch = findActiveBatch(medicine, item.batchNumber);
    const physical = physicalQty(item.quantity, item.freeQuantity);
    if (!batch || Number(batch.quantity) < physical) {
      fail(`Some of ${item.medicineName} batch ${item.batchNumber} has already been used. Use Purchase Return for the remaining stock.`);
    }
    const qtyBefore = medicine.currentStock;
    const batchBefore = Number(batch.quantity);
    batch.quantity = round2(batchBefore - physical);
    batch.freeQuantity = Math.max(0, (Number(batch.freeQuantity) || 0) - (Number(item.freeQuantity) || 0));
    syncCurrentStock(medicine);
    medicine.markModified('batches');
    await medicine.save();
    await logStockMovement({
      medicine,
      batchNumber: batch.batchNumber,
      type: 'purchase',
      quantityBefore: qtyBefore,
      quantityAfter: medicine.currentStock,
      quantityChanged: -physical,
      batchQuantityBefore: batchBefore,
      batchQuantityAfter: batch.quantity,
      unitPrice: item.purchaseRate,
      totalValue: -Number(item.grossAmount || 0),
      supplier: purchase.supplier,
      referenceId: purchase._id,
      referenceModel: 'Purchase',
      userId: req.user._id,
      remarks,
    });
  }
};

exports.cancelPurchase = async (req) => {
  const purchase = await Purchase.findById(req.params.id);
  if (!purchase) fail('Purchase not found', 404);
  if (purchase.status !== 'active') fail('This purchase is already cancelled');
  const returned = (purchase.items || []).some((item) => Number(item.returnedQuantity) > 0);
  if (returned) fail('This purchase has returns. Cancel those returns before cancelling the invoice.');

  const reason = String(req.body?.reason || req.body?.cancelReason || '').trim();
  if (!reason) fail('A cancellation reason is required');

  await releasePurchaseStock(purchase, req, `Cancelled purchase ${purchase.supplierInvoiceNumber}`);
  if (purchase.appliedCredit) await adjustSupplierCredit(purchase.supplier, -purchase.appliedCredit);

  purchase.status = 'cancelled';
  purchase.cancelReason = reason;
  purchase.cancelledAt = new Date();
  purchase.cancelledBy = req.user._id;
  purchase.appliedCredit = 0;
  purchase.audit.push(auditFrom(req, 'Cancelled', reason));
  await purchase.save();

  await logActivity(req, {
    action: 'Purchase Cancelled',
    module: 'Pharmacy',
    description: `${req.user?.name || 'User'} cancelled purchase ${purchase.supplierInvoiceNumber}`,
    relatedId: purchase._id,
    relatedModel: 'Purchase',
    metadata: { reason },
  });
  return decoratePurchase(purchase);
};

const buildReturnLines = async (purchase, requestedItems) => {
  if (purchase.status !== 'active') fail('Cancelled purchases cannot be returned');
  if (!Array.isArray(requestedItems) || !requestedItems.length) fail('Select a medicine to return');

  const medicineIds = [...new Set(purchase.items.map((item) => String(item.medicine)))];
  const meds = await Medicine.find({ _id: { $in: medicineIds } });
  const byId = new Map(meds.map((m) => [String(m._id), m]));
  const lines = [];

  for (const raw of requestedItems) {
    const qty = Number(raw.returnQuantity || 0);
    if (!qty) continue;
    const item = purchase.items.id(raw.purchaseItemId);
    if (!item) fail('Selected medicine is not on this invoice', 404);
    const medicine = byId.get(String(item.medicine));
    if (!medicine) fail(`${item.medicineName} is no longer in the medicine master`, 404);
    const batch = findActiveBatch(medicine, item.batchNumber);
    const batchQty = batch ? Number(batch.quantity) || 0 : 0;
    const info = returnableQuantity({
      purchasedQty: item.quantity,
      freeQty: item.freeQuantity,
      returnedQty: item.returnedQuantity,
      batchQty,
    });
    assertReturnQuantity(qty, info.available, { remainingOnInvoice: info.remainingOnInvoice });

    const rate = Number(item.purchaseRate) || 0;
    const value = returnValue(qty, rate);
    const returnedAfter = round2((Number(item.returnedQuantity) || 0) + qty);
    const remaining = round2(physicalQty(item.quantity, item.freeQuantity) - returnedAfter);
    lines.push({
      purchaseItemId: item._id,
      medicine,
      batch,
      medicineName: item.medicineName,
      batchNumber: item.batchNumber,
      expiryDate: item.expiryDate,
      originalQuantity: physicalQty(item.quantity, item.freeQuantity),
      originalPaidQuantity: item.quantity,
      originalValue: stockValue(item.quantity, rate),
      availableQuantity: info.available,
      returnQuantity: qty,
      purchaseRate: rate,
      sellingPrice: Number(item.sellingPrice) || Number(medicine.sellingPrice) || 0,
      returnValue: value,
      remainingQuantity: remaining,
      remainingStockValue: stockValue(remaining, rate),
      batchQtyBefore: batchQty,
    });
  }

  if (!lines.length) fail('Enter a return quantity');
  return lines;
};

const returnSummary = (lines) => ({
  originalQuantity: round2(lines.reduce((s, l) => s + l.originalQuantity, 0)),
  returnedQuantity: round2(lines.reduce((s, l) => s + l.returnQuantity, 0)),
  remainingQuantity: round2(lines.reduce((s, l) => s + l.remainingQuantity, 0)),
  originalValue: round2(lines.reduce((s, l) => s + l.originalValue, 0)),
  returnedValue: round2(lines.reduce((s, l) => s + l.returnValue, 0)),
  remainingStockValue: round2(lines.reduce((s, l) => s + l.remainingStockValue, 0)),
});

exports.previewReturn = async (req) => {
  const body = req.body || {};
  const purchase = await Purchase.findById(body.purchaseId);
  if (!purchase) fail('Original purchase invoice not found', 404);
  if (!RETURN_REASONS.includes(body.reason)) fail('Select a return reason');
  const lines = await buildReturnLines(purchase, body.items);
  return {
    supplier: purchase.supplierName,
    originalInvoice: purchase.supplierInvoiceNumber,
    purchaseNumber: purchase.purchaseNumber,
    reason: body.reason,
    notes: String(body.notes || '').trim(),
    items: lines.map((line) => ({
      purchaseItemId: line.purchaseItemId,
      medicine: line.medicineName,
      batch: line.batchNumber,
      availableQuantity: line.availableQuantity,
      returnQuantity: line.returnQuantity,
      purchaseRate: line.purchaseRate,
      sellingPrice: line.sellingPrice,
      returnValue: line.returnValue,
      originalQuantity: line.originalQuantity,
      remainingQuantity: line.remainingQuantity,
      originalValue: line.originalValue,
      remainingStockValue: line.remainingStockValue,
    })),
    summary: returnSummary(lines),
  };
};

exports.createReturn = async (req) => {
  const body = req.body || {};
  const purchase = await Purchase.findById(body.purchaseId);
  if (!purchase) fail('Original purchase invoice not found', 404);
  if (!RETURN_REASONS.includes(body.reason)) fail('Select a return reason');
  const lines = await buildReturnLines(purchase, body.items);
  const summary = returnSummary(lines);
  const returnDate = parseIstDateTime(body.returnDate) || new Date();

  for (const line of lines) {
    const medicine = line.medicine;
    const batch = findActiveBatch(medicine, line.batchNumber);
    if (!batch || Number(batch.quantity) < line.returnQuantity) {
      fail('Return quantity cannot exceed available quantity.');
    }
    const qtyBefore = medicine.currentStock;
    const batchBefore = Number(batch.quantity);
    batch.quantity = round2(batchBefore - line.returnQuantity);
    syncCurrentStock(medicine);
    medicine.markModified('batches');
    await medicine.save();
    line.batchQtyAfter = batch.quantity;
    line.qtyBefore = qtyBefore;
    line.qtyAfter = medicine.currentStock;
    line.savedMedicine = medicine;

    const item = purchase.items.id(line.purchaseItemId);
    item.returnedQuantity = round2((Number(item.returnedQuantity) || 0) + line.returnQuantity);
  }

  purchase.returnStatus = returnStatusOf(purchase.items);
  purchase.audit.push(auditFrom(req, 'Purchase Return', body.reason));

  let doc;
  try {
    doc = await PurchaseReturn.create({
    returnNumber: await nextNumber('purchaseReturn', 'PR'),
    supplier: purchase.supplier,
    supplierName: purchase.supplierName,
    purchase: purchase._id,
    originalInvoice: purchase.supplierInvoiceNumber,
    purchaseNumber: purchase.purchaseNumber,
    returnDate,
    reason: body.reason,
    notes: String(body.notes || '').trim(),
    items: lines.map((line) => ({
      purchaseItemId: line.purchaseItemId,
      medicine: line.medicine._id,
      medicineName: line.medicineName,
      batchNumber: line.batchNumber,
      expiryDate: line.expiryDate,
      originalQuantity: line.originalQuantity,
      availableQuantity: line.availableQuantity,
      returnQuantity: line.returnQuantity,
      purchaseRate: line.purchaseRate,
      sellingPrice: line.sellingPrice,
      returnValue: line.returnValue,
      remainingQuantity: line.remainingQuantity,
      remainingStockValue: line.remainingStockValue,
    })),
    totalReturnQuantity: summary.returnedQuantity,
    totalReturnValue: summary.returnedValue,
    status: 'active',
    ...actor(req),
    audit: [auditFrom(req, 'Created', body.reason)],
  });
  } catch (err) {
    for (const line of lines) {
      const medicine = await Medicine.findById(line.medicine._id);
      if (!medicine) continue;
      const batch = findActiveBatch(medicine, line.batchNumber);
      if (batch) batch.quantity = round2((Number(batch.quantity) || 0) + line.returnQuantity);
      syncCurrentStock(medicine);
      medicine.markModified('batches');
      await medicine.save();
      const item = purchase.items.id(line.purchaseItemId);
      if (item) item.returnedQuantity = round2(Math.max(0, (item.returnedQuantity || 0) - line.returnQuantity));
    }
    throw err;
  }

  await purchase.save();

  for (const line of lines) {
    await logStockMovement({
      medicine: line.savedMedicine,
      batchNumber: line.batchNumber,
      type: 'purchase_return',
      quantityBefore: line.qtyBefore,
      quantityAfter: line.qtyAfter,
      quantityChanged: -line.returnQuantity,
      batchQuantityBefore: line.batchQtyBefore,
      batchQuantityAfter: line.batchQtyAfter,
      unitPrice: line.purchaseRate,
      totalValue: -line.returnValue,
      supplier: purchase.supplier,
      referenceId: doc._id,
      referenceModel: 'PurchaseReturn',
      userId: req.user._id,
      remarks: `Purchase return ${doc.returnNumber} against ${purchase.supplierInvoiceNumber}. ${body.reason}`,
    });
  }

  if (summary.returnedValue) await adjustSupplierCredit(purchase.supplier, -summary.returnedValue);

  await logActivity(req, {
    action: 'Purchase Return',
    module: 'Pharmacy',
    description: `${req.user?.name || 'User'} returned stock on ${purchase.supplierInvoiceNumber} (${doc.returnNumber})`,
    relatedId: doc._id,
    relatedModel: 'PurchaseReturn',
    metadata: { returnValue: doc.totalReturnValue, reason: body.reason },
  });

  const populated = await PurchaseReturn.findById(doc._id)
    .populate('supplier', 'name phone')
    .populate('createdBy', 'name role')
    .populate('purchase', 'supplierInvoiceNumber purchaseNumber');
  return { ...populated.toObject(), summary };
};

exports.listReturns = async (query = {}) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  const filter = {};
  if (query.status === 'active' || query.status === 'cancelled') filter.status = query.status;
  if (query.supplier) filter.supplier = query.supplier;
  if (query.reason) filter.reason = query.reason;
  if (query.from || query.to) {
    const range = inclusiveIstRange(query.from || query.to, query.to || query.from);
    filter.returnDate = { $gte: range.from, $lt: range.to };
  }
  const q = String(query.q || '').trim();
  if (q) {
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { returnNumber: { $regex: escaped, $options: 'i' } },
      { originalInvoice: { $regex: escaped, $options: 'i' } },
      { supplierName: { $regex: escaped, $options: 'i' } },
      { 'items.medicineName': { $regex: escaped, $options: 'i' } },
      { 'items.batchNumber': { $regex: escaped, $options: 'i' } },
    ];
  }

  const [rows, total] = await Promise.all([
    PurchaseReturn.find(filter)
      .sort('-returnDate -createdAt')
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('createdBy', 'name role')
      .lean(),
    PurchaseReturn.countDocuments(filter),
  ]);

  const data = rows.map((row) => ({
    ...row,
    createdByName: row.createdByName || row.createdBy?.name,
    medicineSummary: (row.items || []).map((item) => item.medicineName).join(', '),
    batchSummary: (row.items || []).map((item) => item.batchNumber).join(', '),
  }));
  return { data, total, page, pages: Math.max(1, Math.ceil(total / limit)) };
};

exports.getReturn = async (id) => {
  const doc = await PurchaseReturn.findById(id)
    .populate('supplier', 'name phone gstNumber')
    .populate('createdBy', 'name role')
    .populate('purchase', 'supplierInvoiceNumber purchaseNumber grandTotal');
  if (!doc) fail('Purchase return not found', 404);
  return doc;
};

exports.cancelReturn = async (req) => {
  const doc = await PurchaseReturn.findById(req.params.id);
  if (!doc) fail('Purchase return not found', 404);
  if (doc.status !== 'active') fail('This return is already cancelled');
  const reason = String(req.body?.reason || '').trim();
  if (!reason) fail('A cancellation reason is required');

  const purchase = await Purchase.findById(doc.purchase);
  if (!purchase || purchase.status !== 'active') fail('The original purchase is not active', 409);

  for (const item of doc.items) {
    const medicine = await Medicine.findById(item.medicine);
    if (!medicine) fail(`${item.medicineName} is no longer available`, 409);
    const batch = findActiveBatch(medicine, item.batchNumber);
    if (!batch) fail(`Batch ${item.batchNumber} no longer exists, so this return cannot be reversed`);
    const qtyBefore = medicine.currentStock;
    const batchBefore = Number(batch.quantity) || 0;
    batch.quantity = round2(batchBefore + item.returnQuantity);
    syncCurrentStock(medicine);
    medicine.markModified('batches');
    await medicine.save();
    const purchaseItem = purchase.items.id(item.purchaseItemId);
    if (purchaseItem) {
      purchaseItem.returnedQuantity = round2(Math.max(0, (purchaseItem.returnedQuantity || 0) - item.returnQuantity));
    }
    await logStockMovement({
      medicine,
      batchNumber: batch.batchNumber,
      type: 'purchase_return',
      quantityBefore: qtyBefore,
      quantityAfter: medicine.currentStock,
      quantityChanged: item.returnQuantity,
      batchQuantityBefore: batchBefore,
      batchQuantityAfter: batch.quantity,
      unitPrice: item.purchaseRate,
      totalValue: item.returnValue,
      supplier: doc.supplier,
      referenceId: doc._id,
      referenceModel: 'PurchaseReturn',
      userId: req.user._id,
      remarks: `Reversed ${doc.returnNumber}. ${reason}`,
    });
  }

  purchase.returnStatus = returnStatusOf(purchase.items);
  purchase.audit.push(auditFrom(req, 'Return Reversed', reason));
  await purchase.save();

  doc.status = 'cancelled';
  doc.cancelReason = reason;
  doc.cancelledAt = new Date();
  doc.cancelledBy = req.user._id;
  doc.audit.push(auditFrom(req, 'Cancelled', reason));
  await doc.save();

  if (doc.totalReturnValue) await adjustSupplierCredit(doc.supplier, doc.totalReturnValue);

  await logActivity(req, {
    action: 'Purchase Return Cancelled',
    module: 'Pharmacy',
    description: `${req.user?.name || 'User'} reversed ${doc.returnNumber}`,
    relatedId: doc._id,
    relatedModel: 'PurchaseReturn',
    metadata: { reason },
  });
  return doc;
};

exports.getLedger = async (query = {}) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(query.limit, 10) || 50));
  const filter = {};
  if (query.medicine) filter.medicine = query.medicine;
  if (query.batch) filter.batchNumber = normalizeBatchNumber(query.batch);
  if (query.type) filter.type = query.type;
  if (query.from || query.to) {
    const range = inclusiveIstRange(query.from || query.to, query.to || query.from);
    filter.transactionDate = { $gte: range.from, $lt: range.to };
  }
  const q = String(query.q || '').trim();
  if (q) {
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { medicineName: { $regex: escaped, $options: 'i' } },
      { batchNumber: { $regex: escaped, $options: 'i' } },
      { remarks: { $regex: escaped, $options: 'i' } },
    ];
  }

  const [rows, total] = await Promise.all([
    StockMovement.find(filter)
      .sort('-transactionDate -createdAt')
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('addedBy', 'name role')
      .populate('supplier', 'name')
      .lean(),
    StockMovement.countDocuments(filter),
  ]);

  return {
    data: rows.map((row) => ({
      _id: row._id,
      date: row.transactionDate,
      type: row.type,
      typeCode: TYPE_CODES[row.type] || String(row.type || '').toUpperCase(),
      label: MOVEMENT_LABELS[row.type] || row.type,
      medicineName: row.medicineName,
      medicine: row.medicine,
      batchNumber: row.batchNumber,
      reference: row.remarks,
      referenceModel: row.referenceModel,
      quantityChanged: row.quantityChanged,
      balance: row.batchQuantityAfter != null ? row.batchQuantityAfter : row.quantityAfter,
      medicineBalance: row.quantityAfter,
      unitPrice: row.unitPrice,
      totalValue: row.totalValue,
      supplier: row.supplier,
      user: row.addedBy?.name,
      role: row.addedBy?.role,
    })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
  };
};

exports.getValuation = async (query = {}) => {
  const meds = await Medicine.find({ isActive: true })
    .select('name genericName batches purchasePrice sellingPrice')
    .sort('name')
    .lean();
  const q = String(query.q || '').trim().toLowerCase();
  const rows = [];
  meds.forEach((med) => {
    (med.batches || []).forEach((batch) => {
      if (!batch.quantity || batch.isDisposed) return;
      if (q && !`${med.name} ${batch.batchNumber}`.toLowerCase().includes(q)) return;
      const rate = batch.purchasePrice != null ? Number(batch.purchasePrice) : Number(med.purchasePrice || 0);
      rows.push({
        medicineId: med._id,
        medicineName: med.name,
        genericName: med.genericName,
        batchNumber: batch.batchNumber,
        expiryDate: batch.expiryDate,
        quantity: batch.quantity,
        freeQuantity: batch.freeQuantity || 0,
        purchaseRate: rate,
        sellingPrice: batch.sellingPrice != null ? batch.sellingPrice : med.sellingPrice,
        stockValue: stockValue(batch.quantity, rate),
      });
    });
  });
  const totalInventoryPurchaseValue = round2(rows.reduce((s, row) => s + row.stockValue, 0));
  return { data: rows, totalInventoryPurchaseValue, count: rows.length };
};

const purchaseMatch = (range, extra = {}) => ({
  status: 'active',
  purchaseDate: { $gte: range.from, $lt: range.to },
  ...extra,
});

exports.getReports = async (query = {}) => {
  const type = String(query.type || 'daily');
  const today = kolkataToday();
  let range;
  if (type === 'daily') {
    range = inclusiveIstRange(query.date || query.from || today, query.date || query.to || today);
  } else if (type === 'monthly') {
    const monthStart = `${(query.month || today).slice(0, 7)}-01`;
    const [y, m] = monthStart.split('-').map(Number);
    const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const start = istDayBounds(monthStart);
    range = { from: start.from, to: istDayBounds(next).from, isoFrom: monthStart, isoTo: next };
  } else {
    range = inclusiveIstRange(query.from || `${today.slice(0, 7)}-01`, query.to || today);
  }

  if (type === 'returns') {
    const rows = await PurchaseReturn.find({
      status: 'active',
      returnDate: { $gte: range.from, $lt: range.to },
    }).sort('-returnDate').lean();
    const returnedValue = round2(rows.reduce((s, row) => s + (row.totalReturnValue || 0), 0));
    const returnedQuantity = round2(rows.reduce((s, row) => s + (row.totalReturnQuantity || 0), 0));
    return { type, range, returnedValue, returnedQuantity, data: rows };
  }

  const purchases = await Purchase.find(purchaseMatch(range))
    .select('supplier supplierName grandTotal netPurchaseValue purchaseDate supplierInvoiceNumber items totalQuantity')
    .lean();
  const returns = await PurchaseReturn.find({
    status: 'active',
    returnDate: { $gte: range.from, $lt: range.to },
  }).select('totalReturnValue supplier supplierName').lean();

  const purchaseValue = round2(purchases.reduce((s, row) => s + (row.grandTotal || 0), 0));
  const returnValueTotal = round2(returns.reduce((s, row) => s + (row.totalReturnValue || 0), 0));

  if (type === 'supplier') {
    const map = new Map();
    purchases.forEach((row) => {
      const key = String(row.supplier);
      const cur = map.get(key) || { supplierId: row.supplier, supplier: row.supplierName, purchaseValue: 0, invoices: 0 };
      cur.purchaseValue = round2(cur.purchaseValue + (row.grandTotal || 0));
      cur.invoices += 1;
      map.set(key, cur);
    });
    return { type, range, data: [...map.values()].sort((a, b) => b.purchaseValue - a.purchaseValue) };
  }

  if (type === 'medicine') {
    const map = new Map();
    purchases.forEach((row) => {
      (row.items || []).forEach((item) => {
        const key = String(item.medicine);
        const cur = map.get(key) || { medicineId: item.medicine, medicine: item.medicineName, quantity: 0, freeQuantity: 0, purchaseValue: 0 };
        cur.quantity = round2(cur.quantity + (item.quantity || 0));
        cur.freeQuantity = round2(cur.freeQuantity + (item.freeQuantity || 0));
        cur.purchaseValue = round2(cur.purchaseValue + (item.grossAmount || 0));
        map.set(key, cur);
      });
    });
    return { type, range, data: [...map.values()].sort((a, b) => b.purchaseValue - a.purchaseValue) };
  }

  if (type === 'net') {
    return {
      type,
      range,
      purchases: purchaseValue,
      returns: returnValueTotal,
      netPurchases: round2(purchaseValue - returnValueTotal),
    };
  }

  return {
    type: type === 'monthly' ? 'monthly' : 'daily',
    range,
    purchaseValue,
    invoiceCount: purchases.length,
    data: purchases.map((row) => ({
      _id: row._id,
      invoice: row.supplierInvoiceNumber,
      supplier: row.supplierName,
      date: row.purchaseDate,
      items: row.items?.length || 0,
      quantity: row.totalQuantity,
      value: row.grandTotal,
    })),
  };
};

exports.getDashboardCards = async () => {
  const today = istDayBounds(kolkataToday());
  const monthStart = istDayBounds(`${kolkataToday().slice(0, 7)}-01`);
  const [totals, todayAgg, monthAgg, returnsAgg, monthReturns, stock] = await Promise.all([
    Purchase.aggregate([
      { $match: { status: 'active' } },
      { $group: { _id: null, value: { $sum: '$grandTotal' }, count: { $sum: 1 } } },
    ]),
    Purchase.aggregate([
      { $match: { status: 'active', purchaseDate: { $gte: today.from, $lt: today.to } } },
      { $group: { _id: null, value: { $sum: '$grandTotal' }, count: { $sum: 1 } } },
    ]),
    Purchase.aggregate([
      { $match: { status: 'active', purchaseDate: { $gte: monthStart.from } } },
      { $group: { _id: null, value: { $sum: '$grandTotal' }, count: { $sum: 1 } } },
    ]),
    PurchaseReturn.aggregate([
      { $match: { status: 'active' } },
      { $group: { _id: null, value: { $sum: '$totalReturnValue' }, count: { $sum: 1 } } },
    ]),
    PurchaseReturn.aggregate([
      { $match: { status: 'active', returnDate: { $gte: monthStart.from } } },
      { $group: { _id: null, value: { $sum: '$totalReturnValue' } } },
    ]),
    Medicine.aggregate([
      { $match: { isActive: true } },
      { $unwind: '$batches' },
      { $match: { 'batches.quantity': { $gt: 0 }, 'batches.isDisposed': { $ne: true } } },
      {
        $group: {
          _id: null,
          value: {
            $sum: {
              $multiply: [
                '$batches.quantity',
                { $ifNull: ['$batches.purchasePrice', { $ifNull: ['$purchasePrice', 0] }] },
              ],
            },
          },
        },
      },
    ]),
  ]);

  return {
    totalPurchases: totals[0]?.value || 0,
    totalPurchaseCount: totals[0]?.count || 0,
    todayPurchases: todayAgg[0]?.value || 0,
    todayPurchaseCount: todayAgg[0]?.count || 0,
    monthPurchases: monthAgg[0]?.value || 0,
    monthPurchaseCount: monthAgg[0]?.count || 0,
    purchaseReturns: returnsAgg[0]?.value || 0,
    purchaseReturnCount: returnsAgg[0]?.count || 0,
    monthReturns: monthReturns[0]?.value || 0,
    currentStockValue: stock[0]?.value || 0,
  };
};

exports.RETURN_REASONS = RETURN_REASONS;
exports.sameBatchNumber = sameBatchNumber;
