const Medicine = require('../models/Medicine');
const StockMovement = require('../models/StockMovement');
const Prescription = require('../models/Prescription');
const { getAvailableStock, getExpiredBatches } = require('../utils/pharmacyStockHelper');

const startOfDay = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const startOfMonth = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1);

const daysUntil = (date) => Math.ceil((new Date(date) - new Date()) / 86400000);

const flattenExpiringBatches = (medicines, withinDays = 30) => {
  const now = new Date();
  const limit = new Date();
  limit.setDate(limit.getDate() + withinDays);
  const rows = [];

  medicines.forEach((med) => {
    (med.batches || []).forEach((batch) => {
      if (!batch.quantity || batch.isDisposed) return;
      const exp = new Date(batch.expiryDate);
      if (exp < now || exp > limit) return;
      const remaining = daysUntil(exp);
      rows.push({
        medicineId: med._id,
        medicineName: med.name,
        genericName: med.genericName,
        batchNumber: batch.batchNumber,
        expiryDate: batch.expiryDate,
        remainingDays: remaining,
        quantity: batch.quantity,
        urgency: remaining <= 7 ? 'critical' : remaining <= 15 ? 'high' : 'warning',
        stockValue: batch.quantity * (batch.purchasePrice || med.purchasePrice || med.sellingPrice || 0),
      });
    });
  });

  return rows.sort((a, b) => a.remainingDays - b.remainingDays);
};

const flattenExpiredBatches = (medicines) => {
  const now = new Date();
  const rows = [];

  medicines.forEach((med) => {
    (med.batches || []).forEach((batch) => {
      if (!batch.quantity || batch.isDisposed) return;
      if (new Date(batch.expiryDate) >= now) return;
      rows.push({
        medicineId: med._id,
        medicineName: med.name,
        batchNumber: batch.batchNumber,
        expiryDate: batch.expiryDate,
        quantity: batch.quantity,
        stockValue: batch.quantity * (batch.purchasePrice || med.purchasePrice || med.sellingPrice || 0),
        batchId: batch._id,
        isDisposed: batch.isDisposed,
      });
    });
  });

  return rows.sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
};

exports.getDashboardData = async () => {
  const today = startOfDay();
  const monthStart = startOfMonth();
  const now = new Date();
  const expiringLimit = new Date();
  expiringLimit.setDate(expiringLimit.getDate() + 30);

  const [kpiAgg, movementStats, chartData, activity] = await Promise.all([
    Promise.all([
      Medicine.countDocuments({ isActive: true }),
      Medicine.countDocuments({ isActive: true, $expr: { $and: [{ $gt: ['$currentStock', 0] }, { $lte: ['$currentStock', '$minimumStock'] }] } }),
      Medicine.countDocuments({ isActive: true, currentStock: 0 }),
Medicine.aggregate([
  { $match: { isActive: true } },
  { $unwind: '$batches' },
  {
    $match: {
      'batches.quantity': { $gt: 0 },
      'batches.isDisposed': { $ne: true },
      'batches.expiryDate': { $gte: now },
    },
  },
  {
    $group: {
      _id: null,
      totalValue: {
        $sum: {
          $multiply: [
            '$batches.quantity',
            '$sellingPrice',
          ],
        },
      },
      availableStock: { $sum: '$batches.quantity' },
    },
  },
]),
      Medicine.aggregate([
        { $match: { isActive: true } },
        { $unwind: '$batches' },
        { $match: { 'batches.quantity': { $gt: 0 }, 'batches.isDisposed': { $ne: true }, 'batches.expiryDate': { $gte: now, $lte: expiringLimit } } },
        { $count: 'count' },
      ]),
      Medicine.aggregate([
        { $match: { isActive: true } },
        { $unwind: '$batches' },
        { $match: { 'batches.quantity': { $gt: 0 }, 'batches.isDisposed': { $ne: true }, 'batches.expiryDate': { $lt: now } } },
        { $count: 'count' },
      ]),
    ]),
    StockMovement.aggregate([
      {
        $facet: {
          todayDispensed: [
            { $match: { type: 'dispense', transactionDate: { $gte: today } } },
            { $group: { _id: null, count: { $sum: 1 }, qty: { $sum: { $abs: '$quantityChanged' } }, value: { $sum: '$totalValue' } } },
          ],
          todayAdded: [
            { $match: { type: 'stock_in', transactionDate: { $gte: today } } },
            { $group: { _id: null, count: { $sum: 1 }, qty: { $sum: '$quantityChanged' }, value: { $sum: '$totalValue' } } },
          ],
          monthlyPurchase: [
            { $match: { type: 'stock_in', transactionDate: { $gte: monthStart } } },
            { $group: { _id: null, value: { $sum: '$totalValue' } } },
          ],
          monthlyDispense: [
            { $match: { type: { $in: ['dispense', 'bill_deduct'] }, transactionDate: { $gte: monthStart } } },
            { $group: { _id: null, value: { $sum: '$totalValue' } } },
          ],
          consumption: [
            { $match: { type: { $in: ['dispense', 'bill_deduct'] }, transactionDate: { $gte: new Date(today.getFullYear(), today.getMonth() - 5, 1) } } },
            { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$transactionDate' } }, qty: { $sum: { $abs: '$quantityChanged' } }, value: { $sum: '$totalValue' } } },
            { $sort: { _id: 1 } },
          ],
          purchases: [
            { $match: { type: 'stock_in', transactionDate: { $gte: new Date(today.getFullYear(), today.getMonth() - 5, 1) } } },
            { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$transactionDate' } }, qty: { $sum: '$quantityChanged' }, value: { $sum: '$totalValue' } } },
            { $sort: { _id: 1 } },
          ],
          topDispensed: [
            { $match: { type: { $in: ['dispense', 'bill_deduct'] }, transactionDate: { $gte: monthStart } } },
            { $group: { _id: '$medicineName', qty: { $sum: { $abs: '$quantityChanged' } }, value: { $sum: '$totalValue' } } },
            { $sort: { qty: -1 } },
            { $limit: 10 },
          ],
        },
      },
    ]),
    StockMovement.aggregate([
      { $match: { transactionDate: { $gte: new Date(today.getFullYear(), today.getMonth() - 5, 1) } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$transactionDate' } }, stockIn: { $sum: { $cond: [{ $eq: ['$type', 'stock_in'] }, '$totalValue', 0] } }, stockOut: { $sum: { $cond: [{ $in: ['$type', ['dispense', 'bill_deduct']] }, '$totalValue', 0] } } } },
      { $sort: { _id: 1 } },
    ]),
    StockMovement.find().sort('-transactionDate').limit(20).populate('addedBy', 'name role').lean(),
  ]);

  const stats = movementStats[0] || {};
  const [totalMedicines, lowStock, outOfStock, valueAgg, expiringAgg, expiredAgg] = kpiAgg;
  const totalInventoryValue = valueAgg[0]?.totalValue || 0;
  const availableStock = valueAgg[0]?.availableStock || 0;
  const expiringSoonCount = expiringAgg[0]?.count || 0;
  const expiredCount = expiredAgg[0]?.count || 0;
  const pendingPrescriptions = await Prescription.countDocuments({ status: 'active' });

  const alerts = [
    lowStock > 0 && { type: 'low_stock', icon: '⚠', message: `${lowStock} Medicines Low In Stock`, count: lowStock, severity: 'warning' },
    expiringSoonCount > 0 && { type: 'expiring', icon: '⚠', message: `${expiringSoonCount} Medicines Expiring In 30 Days`, count: expiringSoonCount, severity: 'warning' },
    expiredCount > 0 && { type: 'expired', icon: '⚠', message: `${expiredCount} Medicines Expired`, count: expiredCount, severity: 'error' },
    outOfStock > 0 && { type: 'out_of_stock', icon: '⚠', message: `${outOfStock} Medicines Out Of Stock`, count: outOfStock, severity: 'error' },
  ].filter(Boolean);

  return {
    cards: {
      totalMedicines,
      totalInventoryValue,
      availableStock,
      lowStock,
      outOfStock,
      expiringSoon: expiringSoonCount,
      expired: expiredCount,
      todayDispensed: stats.todayDispensed?.[0]?.qty || 0,
      todayStockAdded: stats.todayAdded?.[0]?.qty || 0,
      monthlyPurchaseValue: stats.monthlyPurchase?.[0]?.value || 0,
      monthlyDispensingValue: stats.monthlyDispense?.[0]?.value || 0,
      pendingPrescriptions,
    },
    alerts,
    charts: {
      monthlyConsumption: stats.consumption || [],
      monthlyPurchases: stats.purchases || [],
      inventoryValueTrend: chartData.map((r) => ({ month: r._id, value: r.stockIn - r.stockOut })),
      topDispensedMedicines: (stats.topDispensed || []).map((r) => ({ name: r._id, qty: r.qty, value: r.value })),
    },
    activity: activity.map((a) => ({
      id: a._id,
      time: a.transactionDate,
      medicineName: a.medicineName,
      type: a.type,
      quantityChanged: a.quantityChanged,
      remarks: a.remarks,
      user: a.addedBy?.name,
      label: formatActivityLabel(a),
    })),
  };
};

const formatActivityLabel = (movement) => {
  const qty = Math.abs(movement.quantityChanged);
  switch (movement.type) {
    case 'stock_in': return `+${qty} Added`;
    case 'dispense':
    case 'bill_deduct': return `-${qty} Dispensed`;
    case 'dispose': return `-${qty} Disposed`;
    case 'expiry_alert': return 'Expiry Alert Generated';
    case 'reorder': return 'Reorder Initiated';
    default: return movement.remarks || movement.type;
  }
};

exports.getLowStockList = async () => {
  const medicines = await Medicine.find({
    isActive: true,
    $expr: { $and: [{ $gt: ['$currentStock', 0] }, { $lte: ['$currentStock', '$minimumStock'] }] },
  })
    .populate('supplier', 'name phone')
    .sort('currentStock')
    .lean();

  return medicines.map((med) => {
    const lastBatch = [...(med.batches || [])].sort((a, b) => new Date(b.receivedDate) - new Date(a.receivedDate))[0];
    return {
      _id: med._id,
      medicineName: med.name,
      genericName: med.genericName,
      currentStock: med.currentStock,
      minimumStock: med.minimumStock,
      supplier: med.supplier,
      lastPurchaseDate: lastBatch?.receivedDate || null,
      status: 'low_stock',
    };
  });
};

exports.getOutOfStockList = async () => {
  const medicines = await Medicine.find({ isActive: true, currentStock: 0 }).populate('supplier', 'name phone').lean();

  const usage = await StockMovement.aggregate([
    { $match: { type: { $in: ['dispense', 'bill_deduct'] }, transactionDate: { $gte: startOfMonth(new Date(Date.now() - 90 * 86400000)) } } },
    { $group: { _id: '$medicine', totalQty: { $sum: { $abs: '$quantityChanged' } } } },
  ]);
  const usageMap = Object.fromEntries(usage.map((u) => [String(u._id), u.totalQty]));

  return medicines.map((med) => {
    const lastBatch = [...(med.batches || [])].sort((a, b) => new Date(b.receivedDate) - new Date(a.receivedDate))[0];
    const months = 3;
    const totalUsage = usageMap[String(med._id)] || 0;
    return {
      _id: med._id,
      medicineName: med.name,
      lastSupplier: med.supplier,
      lastPurchaseDate: lastBatch?.receivedDate || null,
      averageMonthlyUsage: Math.round(totalUsage / months),
      status: 'out_of_stock',
    };
  });
};

exports.getExpiringList = async (days = 30) => {
  const limit = new Date();
  limit.setDate(limit.getDate() + days);
  const medicines = await Medicine.find({
    isActive: true,
    batches: { $elemMatch: { expiryDate: { $lte: limit, $gte: new Date() }, quantity: { $gt: 0 }, isDisposed: { $ne: true } } },
  }).select('name genericName batches purchasePrice sellingPrice').lean();
  return flattenExpiringBatches(medicines, days);
};

exports.getExpiredList = async () => {
  const medicines = await Medicine.find({
    isActive: true,
    batches: { $elemMatch: { expiryDate: { $lt: new Date() }, quantity: { $gt: 0 }, isDisposed: { $ne: true } } },
  }).select('name batches purchasePrice sellingPrice').lean();
  return flattenExpiredBatches(medicines);
};

exports.getStockMovements = async (filters = {}) => {
  const query = {};
  if (filters.medicineId) query.medicine = filters.medicineId;
  if (filters.type) query.type = filters.type;
  if (filters.from || filters.to) {
    query.transactionDate = {};
    if (filters.from) query.transactionDate.$gte = new Date(filters.from);
    if (filters.to) query.transactionDate.$lte = new Date(filters.to);
  }
  return StockMovement.find(query).sort('-transactionDate').limit(filters.limit || 100).populate('addedBy', 'name').lean();
};

exports.getReportData = async (reportType) => {
  switch (reportType) {
    case 'low-stock': return { title: 'Low Stock Report', rows: await exports.getLowStockList() };
    case 'out-of-stock': return { title: 'Out Of Stock Report', rows: await exports.getOutOfStockList() };
    case 'expiry': return { title: 'Expiry Report (30 Days)', rows: await exports.getExpiringList(30) };
    case 'expired': return { title: 'Expired Medicine Report', rows: await exports.getExpiredList() };
    case 'valuation': {
      const meds = await Medicine.find({ isActive: true }).populate('supplier', 'name').lean();
      const rows = meds.map((m) => ({
        medicineName: m.name,
        currentStock: getAvailableStock(m),
        unitPrice: m.purchasePrice || m.sellingPrice,
        stockValue: getAvailableStock(m) * (m.purchasePrice || m.sellingPrice || 0),
        supplier: m.supplier?.name,
      }));
      return { title: 'Inventory Valuation Report', rows };
    }
    case 'supplier-purchase': {
      const rows = await StockMovement.find({ type: 'stock_in' }).sort('-transactionDate').limit(500).populate('supplier', 'name').populate('addedBy', 'name').lean();
      return { title: 'Supplier Purchase Report', rows };
    }
    case 'dispensing': {
      const rows = await StockMovement.find({ type: { $in: ['dispense', 'bill_deduct'] } }).sort('-transactionDate').limit(500).populate('addedBy', 'name').lean();
      return { title: 'Dispensing Report', rows };
    }
    case 'stock-movement': {
      const rows = await exports.getStockMovements({ limit: 500 });
      return { title: 'Stock Movement Report', rows };
    }
    default: return null;
  }
};
