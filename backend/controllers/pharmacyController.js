const asyncHandler = require('../utils/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const Medicine = require('../models/Medicine');
const Prescription = require('../models/Prescription');
const Notification = require('../models/Notification');
const DirectSale = require('../models/DirectSale');
const Patient = require('../models/Patient');
const { generatePrescriptionPDF } = require('../utils/pdfGenerator');
const {
  syncCurrentStock,
  deductFromUsableBatches,
  logStockMovement,
  validateDispensable,
  getExpiredBatches,
} = require('../utils/pharmacyStockHelper');
const inventoryService = require('../services/pharmacyInventoryService');
const { exportExcel, exportPdf } = require('../utils/pharmacyReportExporter');

exports.getMedicines = asyncHandler(async (req, res) => {
  res.status(200).json(res.advancedResults);
});

exports.getMedicine = asyncHandler(async (req, res, next) => {
  const medicine = await Medicine.findById(req.params.id).populate('supplier', 'name phone');
  if (!medicine) return next(new ErrorResponse('Medicine not found', 404));
  res.status(200).json({ success: true, data: medicine });
});

exports.createMedicine = asyncHandler(async (req, res) => {
  const data = { ...req.body };
  if (!data.barcode || data.barcode.trim() === '') delete data.barcode;
  const medicine = await Medicine.create(data);
  res.status(201).json({ success: true, data: medicine });
});

exports.updateMedicine = asyncHandler(async (req, res, next) => {
  const data = { ...req.body };
  if (!data.barcode || data.barcode.trim() === '') delete data.barcode;
  const medicine = await Medicine.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
  if (!medicine) return next(new ErrorResponse('Medicine not found', 404));
  res.status(200).json({ success: true, data: medicine });
});

exports.deleteMedicine = asyncHandler(async (req, res, next) => {
  const medicine = await Medicine.findById(req.params.id);
  if (!medicine) return next(new ErrorResponse('Medicine not found', 404));
  await medicine.deleteOne();
  res.status(200).json({ success: true, data: {} });
});

exports.addStock = asyncHandler(async (req, res, next) => {
  const medicine = await Medicine.findById(req.params.id);
  if (!medicine) return next(new ErrorResponse('Medicine not found', 404));

  const quantity = Number(req.body.quantity || 0);
  if (quantity <= 0) return next(new ErrorResponse('Stock quantity must be greater than zero', 400));

  const expiryDate = new Date(req.body.expiryDate);
  if (expiryDate < new Date()) return next(new ErrorResponse('Cannot add stock with expired batch', 400));

  const qtyBefore = medicine.currentStock;
  medicine.batches.push({
    ...req.body,
    quantity,
    receivedDate: new Date(),
  });
  syncCurrentStock(medicine);
  await medicine.save();

  await logStockMovement({
    medicine,
    batchNumber: req.body.batchNumber,
    type: 'stock_in',
    quantityBefore: qtyBefore,
    quantityAfter: medicine.currentStock,
    quantityChanged: quantity,
    unitPrice: req.body.purchasePrice || medicine.purchasePrice,
    supplier: req.body.supplier || medicine.supplier,
    userId: req.user._id,
    remarks: req.body.remarks || 'Stock added',
  });

  res.status(200).json({ success: true, data: medicine });
});

// ─── NEW: REDUCE OR ADJUST STOCK DIRECTLY ───────────────────────────────────
exports.adjustStock = asyncHandler(async (req, res, next) => {
  const { quantity, type, remarks } = req.body;
  
  // Validate inputs
  if (quantity === undefined || quantity === null) {
    return next(new ErrorResponse('Quantity is required', 400));
  }
  
  if (Number(quantity) === 0) {
    return next(new ErrorResponse('Quantity must not be zero', 400));
  }

  if (!['reduce', 'increase'].includes(type)) {
    return next(new ErrorResponse('Type must be "reduce" or "increase"', 400));
  }

  const medicine = await Medicine.findById(req.params.id);
  if (!medicine) return next(new ErrorResponse('Medicine not found', 404));

  const qtyNumber = Number(quantity);
  const qtyBefore = medicine.currentStock;

  if (type === 'reduce') {
    // For reduce: deduct from usable batches (non-expired)
    if (qtyNumber < 0) {
      return next(new ErrorResponse('For reduce operation, quantity must be positive', 400));
    }
    
    if (medicine.currentStock < qtyNumber) {
      return next(new ErrorResponse(
        `Insufficient stock! Available: ${medicine.currentStock}, Requested: ${qtyNumber}`,
        400
      ));
    }

    const { unallocated } = deductFromUsableBatches(medicine, qtyNumber);
    if (unallocated > 0) {
      return next(new ErrorResponse(
        `Only ${qtyNumber - unallocated} units of non-expired stock available`,
        400
      ));
    }

    syncCurrentStock(medicine);
    medicine.markModified('batches');
    await medicine.save();

    await logStockMovement({
      medicine,
      type: 'stock_adjustment_reduce',
      quantityBefore: qtyBefore,
      quantityAfter: medicine.currentStock,
      quantityChanged: -qtyNumber,
      unitPrice: medicine.sellingPrice,
      userId: req.user._id,
      remarks: remarks || `Stock reduced by ${qtyNumber} units`,
    });

    res.status(200).json({
      success: true,
      data: medicine,
      message: `Stock reduced by ${qtyNumber} units`,
    });
  } else {
    // For increase: manually add quantity to a specific batch or create new batch
    const { batchNumber, expiryDate, purchasePrice } = req.body;

    if (!batchNumber || batchNumber.trim() === '') {
      return next(new ErrorResponse('Batch number is required for increase operation', 400));
    }

    if (!expiryDate) {
      return next(new ErrorResponse('Expiry date is required for increase operation', 400));
    }

    const expiry = new Date(expiryDate);
    if (expiry < new Date()) {
      return next(new ErrorResponse('Cannot add stock with expired date', 400));
    }

    // Check if batch exists
    let batch = medicine.batches.find(b => b.batchNumber === batchNumber && !b.isDisposed);
    
    if (batch) {
      // Update existing batch quantity
      batch.quantity += qtyNumber;
    } else {
      // Create new batch
      medicine.batches.push({
        batchNumber,
        quantity: qtyNumber,
        expiryDate: expiry,
        purchasePrice: purchasePrice || medicine.purchasePrice,
        receivedDate: new Date(),
        remarks: remarks || `Stock increased`,
      });
    }

    syncCurrentStock(medicine);
    medicine.markModified('batches');
    await medicine.save();

    await logStockMovement({
      medicine,
      batchNumber,
      type: 'stock_adjustment_increase',
      quantityBefore: qtyBefore,
      quantityAfter: medicine.currentStock,
      quantityChanged: qtyNumber,
      unitPrice: purchasePrice || medicine.purchasePrice,
      userId: req.user._id,
      remarks: remarks || `Stock increased by ${qtyNumber} units`,
    });

    res.status(200).json({
      success: true,
      data: medicine,
      message: `Stock increased by ${qtyNumber} units`,
    });
  }
});
// ────────────────────────────────────────────────────────────────────────────

exports.searchMedicines = asyncHandler(async (req, res) => {
  const { q } = req.query;
  
  // FIX: Return empty array if query is empty or very short
  if (!q || q.trim().length < 2) {
    return res.status(200).json({ success: true, data: [] });
  }

  // FIX: Sanitize input
  const searchQuery = q.trim().substring(0, 100);

  // FIX: Better search with case-insensitive and improved regex
  const medicines = await Medicine.find({
    $or: [
      { name: { $regex: searchQuery, $options: 'i' } },
      { genericName: { $regex: searchQuery, $options: 'i' } },
      { barcode: searchQuery }, // Exact match for barcode
    ],
    isActive: true,
  })
    .limit(15)
    .select('name genericName category currentStock sellingPrice gstPercent unitOfMeasure mrp hsnCode batches');

  // FIX: Only return medicines with current stock
  const data = medicines
    .map((m) => {
      const doc = m.toObject();
      syncCurrentStock(m);
      doc.currentStock = m.currentStock;
      doc.hasExpiredStock = getExpiredBatches(m).length > 0;
      return doc;
    })
    .filter((m) => m.currentStock > 0)
    .sort((a, b) => b.currentStock - a.currentStock); // Sort by stock, most available first

  res.status(200).json({ success: true, count: data.length, data });
});

exports.getLowStockMedicines = asyncHandler(async (req, res) => {
  const data = await inventoryService.getLowStockList();
  res.status(200).json({ success: true, count: data.length, data });
});

exports.getOutOfStockMedicines = asyncHandler(async (req, res) => {
  const data = await inventoryService.getOutOfStockList();
  res.status(200).json({ success: true, count: data.length, data });
});

exports.getExpiringMedicines = asyncHandler(async (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const data = await inventoryService.getExpiringList(days);
  res.status(200).json({ success: true, count: data.length, data });
});

exports.getExpiredMedicines = asyncHandler(async (req, res) => {
  const data = await inventoryService.getExpiredList();
  res.status(200).json({ success: true, count: data.length, data });
});

exports.getInventoryActivity = asyncHandler(async (req, res) => {
  const data = await inventoryService.getStockMovements({ limit: parseInt(req.query.limit) || 30 });
  res.status(200).json({ success: true, data });
});

exports.getPharmacyDashboard = asyncHandler(async (req, res) => {
  const data = await inventoryService.getDashboardData();
  res.status(200).json({ success: true, data });
});

exports.disposeExpiredBatch = asyncHandler(async (req, res, next) => {
  const medicine = await Medicine.findById(req.params.id);
  if (!medicine) return next(new ErrorResponse('Medicine not found', 404));

  const batch = medicine.batches.id(req.params.batchId);
  if (!batch) return next(new ErrorResponse('Batch not found', 404));
  if (batch.isDisposed) return next(new ErrorResponse('Batch already disposed', 400));

  const qtyBefore = medicine.currentStock;
  const disposeQty = batch.quantity;
  batch.isDisposed = true;
  batch.disposedAt = new Date();
  batch.disposedBy = req.user._id;
  batch.quantity = 0;
  syncCurrentStock(medicine);
  medicine.markModified('batches');
  await medicine.save();

  await logStockMovement({
    medicine,
    batchNumber: batch.batchNumber,
    type: 'dispose',
    quantityBefore: qtyBefore,
    quantityAfter: medicine.currentStock,
    quantityChanged: -disposeQty,
    unitPrice: batch.purchasePrice || medicine.purchasePrice,
    userId: req.user._id,
    remarks: req.body.remarks || 'Expired medicine disposed',
  });

  res.status(200).json({ success: true, data: medicine, message: 'Batch marked as disposed' });
});

exports.sendInventoryNotification = asyncHandler(async (req, res) => {
  const { type, medicineName, message, roles = ['Pharmacist', 'Admin'] } = req.body;
  const notifications = await Promise.all(
    roles.map((role) => Notification.create({
      title: `Pharmacy Alert: ${type || 'Inventory'}`,
      message: message || `${medicineName} requires attention`,
      type: 'pharmacy',
      recipientRole: role,
      link: '/pharmacy?tab=inventory',
      relatedModel: 'Medicine',
    })),
  );
  res.status(200).json({ success: true, count: notifications.length, message: 'Notifications sent' });
});

exports.exportReport = asyncHandler(async (req, res, next) => {
  const reportData = await inventoryService.getReportData(req.params.type);
  if (!reportData) return next(new ErrorResponse('Invalid report type', 400));

  const format = (req.query.format || 'pdf').toLowerCase();
  if (format === 'excel' || format === 'xlsx') return exportExcel(req.params.type, reportData, res);
  return exportPdf(req.params.type, reportData, res);
});

exports.dispensePrescription = asyncHandler(async (req, res, next) => {
  const prescription = await Prescription.findById(req.params.id).populate('medicines.medicine');
  if (!prescription) return next(new ErrorResponse('Prescription not found', 404));

  let dispensedCount = 0;
  const errors = [];

  for (const item of prescription.medicines) {
    if (item.dispensed) {
      dispensedCount += 1;
      continue;
    }

    const quantity = Number(item.quantity || 0);
    if (!quantity) {
      errors.push(`Missing quantity for ${item.medicineName || 'medicine'}`);
      continue;
    }

    if (item.medicine) {
      const medicine = await Medicine.findById(item.medicine._id);
      if (!medicine) {
        errors.push(`Medicine not found: ${item.medicineName}`);
        continue;
      }

      const check = validateDispensable(medicine, quantity);
      if (!check.ok) {
        errors.push(check.reason);
        continue;
      }

      const qtyBefore = medicine.currentStock;
      const { primaryBatch, unallocated } = deductFromUsableBatches(medicine, quantity);
      if (unallocated > 0) {
        errors.push(`${medicine.name}: insufficient non-expired stock`);
        continue;
      }

      syncCurrentStock(medicine);
      medicine.markModified('batches');
      await medicine.save();

      await logStockMovement({
        medicine,
        batchNumber: primaryBatch,
        type: 'dispense',
        quantityBefore: qtyBefore,
        quantityAfter: medicine.currentStock,
        quantityChanged: -quantity,
        unitPrice: medicine.sellingPrice,
        referenceId: prescription._id,
        referenceModel: 'Prescription',
        userId: req.user._id,
        remarks: `Prescription dispensed`,
      });
    }

    item.dispensed = true;
    dispensedCount += 1;
  }

  if (dispensedCount === prescription.medicines.length) prescription.status = 'dispensed';
  else if (dispensedCount > 0) prescription.status = 'partially_dispensed';
  else return next(new ErrorResponse(`Prescription could not be dispensed. ${errors.join('; ')}`, 400));

  prescription.dispensedBy = req.user._id;
  prescription.dispensedAt = new Date();
  await prescription.save();

  res.status(200).json({
    success: true,
    message: prescription.status === 'partially_dispensed' ? `Partially dispensed. ${errors.join('; ')}` : 'Prescription dispensed',
    data: prescription,
  });
});

exports.printPrescription = asyncHandler(async (req, res, next) => {
  const prescription = await Prescription.findById(req.params.id)
    .populate('patient', 'patientId name age gender')
    .populate('doctor', 'name specialization')
    .populate('medicines.medicine', 'name');
  if (!prescription) return next(new ErrorResponse('Prescription not found', 404));
  await generatePrescriptionPDF(prescription, res);
});

// ─── Direct Sale ───────────────────────────────────────────────

exports.createDirectSale = asyncHandler(async (req, res, next) => {
  const { items, saleType, customerName, customerPhone, patientId, paymentMethod, paidAmount, totalDiscount, notes } = req.body;

  if (!items || !items.length) return next(new ErrorResponse('At least one item is required', 400));

  let subtotal = 0;
  let totalGst = 0;
  const processedItems = [];

  for (const item of items) {
    const medicine = await Medicine.findById(item.medicine);
    if (!medicine) return next(new ErrorResponse(`Medicine not found: ${item.medicineName || item.medicine}`, 404));

    const check = validateDispensable(medicine, item.quantity);
    if (!check.ok) return next(new ErrorResponse(`${medicine.name}: ${check.reason}`, 400));

    const qtyBefore = medicine.currentStock;
    const { primaryBatch, unallocated } = deductFromUsableBatches(medicine, item.quantity);
    if (unallocated > 0) return next(new ErrorResponse(`${medicine.name}: insufficient stock`, 400));

    syncCurrentStock(medicine);
    medicine.markModified('batches');
    await medicine.save();

    const unitPrice = item.unitPrice || medicine.sellingPrice;
    const gstPercent = item.gstPercent !== undefined ? item.gstPercent : medicine.gstPercent;
    const lineSubtotal = unitPrice * item.quantity;
    const discAmt = (lineSubtotal * (item.discountPercent || 0)) / 100;
    const taxableAmt = lineSubtotal - discAmt;
    const gstAmt = (taxableAmt * gstPercent) / 100;
    const lineTotal = taxableAmt + gstAmt;

    subtotal += lineSubtotal;
    totalGst += gstAmt;

    processedItems.push({
      medicine: medicine._id,
      medicineName: medicine.name,
      batchNumber: primaryBatch,
      quantity: item.quantity,
      unitPrice,
      mrp: medicine.mrp,
      gstPercent,
      gstAmount: gstAmt,
      discountPercent: item.discountPercent || 0,
      discountAmount: discAmt,
      totalAmount: lineTotal,
    });

    await logStockMovement({
      medicine,
      batchNumber: primaryBatch,
      type: 'sale',
      quantityBefore: qtyBefore,
      quantityAfter: medicine.currentStock,
      quantityChanged: -item.quantity,
      unitPrice,
      userId: req.user._id,
      remarks: `Direct sale${customerName ? ` to ${customerName}` : ''}`,
    });
  }

  const discountTotal = totalDiscount || 0;
  const grandTotal = subtotal + totalGst - discountTotal;
  const paid = paidAmount !== undefined ? Number(paidAmount) : grandTotal;

  const saleData = {
    saleType: saleType || 'walkin',
    items: processedItems,
    subtotal,
    totalGst,
    totalDiscount: discountTotal,
    grandTotal,
    paidAmount: paid,
    changeAmount: Math.max(0, paid - grandTotal),
    paymentMethod: paymentMethod || 'Cash',
    paymentStatus: paid >= grandTotal ? 'paid' : paid > 0 ? 'partial' : 'pending',
    soldBy: req.user._id,
    notes,
  };

  if (saleType === 'patient' && patientId) {
    saleData.patient = patientId;
  } else {
    saleData.customerName = customerName || 'Walk-in Customer';
    saleData.customerPhone = customerPhone;
  }

  const sale = await DirectSale.create(saleData);
  await sale.populate('soldBy', 'name');

  res.status(201).json({ success: true, data: sale, message: 'Sale created successfully' });
});

exports.getDirectSales = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.date) {
    const d = new Date(req.query.date);
    d.setHours(0, 0, 0, 0);
    const next = new Date(d); next.setDate(next.getDate() + 1);
    filter.saleDate = { $gte: d, $lt: next };
  }
  if (req.query.paymentMethod) filter.paymentMethod = req.query.paymentMethod;

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const [sales, total] = await Promise.all([
    DirectSale.find(filter)
      .populate('patient', 'name patientId')
      .populate('soldBy', 'name')
      .sort('-saleDate')
      .skip(skip)
      .limit(limit),
    DirectSale.countDocuments(filter),
  ]);

  res.status(200).json({ success: true, count: total, pages: Math.ceil(total / limit), data: sales });
});

exports.getDirectSaleById = asyncHandler(async (req, res, next) => {
  const sale = await DirectSale.findById(req.params.id)
    .populate('patient', 'name patientId phone')
    .populate('soldBy', 'name')
    .populate('items.medicine', 'name genericName');
  if (!sale) return next(new ErrorResponse('Sale not found', 404));
  res.status(200).json({ success: true, data: sale });
});

exports.getTodayPharmacySales = asyncHandler(async (req, res) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

  const result = await DirectSale.aggregate([
    { $match: { saleDate: { $gte: today, $lt: tomorrow } } },
    { $group: { _id: null, total: { $sum: '$grandTotal' }, count: { $sum: 1 } } },
  ]);

  res.status(200).json({
    success: true,
    data: { total: result[0]?.total || 0, count: result[0]?.count || 0 },
  });
});