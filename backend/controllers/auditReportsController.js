const asyncHandler = require('../utils/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const Patient = require('../models/Patient');
const OPRegistration = require('../models/OPRegistration');
const IPAdmission = require('../models/IPAdmission');
const Bed = require('../models/Bed');
const Bill = require('../models/Bill');
const LabTest = require('../models/LabTest');
const DirectSale = require('../models/DirectSale');
const Medicine = require('../models/Medicine');
const StockMovement = require('../models/StockMovement');
const Appointment = require('../models/Appointment');
const Operation = require('../models/Operation');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const Prescription = require('../models/Prescription');
const Asset = require('../models/Asset');

const RADIOLOGY_TYPES = ['Radiology', 'X-Ray', 'CT Scan', 'MRI', 'Ultrasound'];
const LAB_CLINICAL_TYPES = [
  'Biochemistry', 'Haematology', 'Microbiology', 'Serology',
  'Urine Analysis', 'Pathology', 'ECG', 'Other',
];

const SECTION_KEYS = [
  'executive', 'user-activity', 'patient', 'appointment', 'doctor',
  'pharmacy', 'inventory', 'billing', 'payment', 'laboratory', 'radiology',
  'bed', 'nurse', 'ot', 'financial', 'insurance', 'employee', 'security', 'system',
];

const NOT_TRACKED = 'Not tracked yet';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const parseRange = (req) => {
  const now = new Date();
  let from = req.query.from ? new Date(req.query.from) : new Date(now);
  let to = req.query.to ? new Date(req.query.to) : new Date(now);
  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);
  if (from > to) [from, to] = [to, from];
  return { from, to };
};

const kpi = (key, label, value, format = 'number', tracked = true) => ({
  key, label, value: tracked ? value : NOT_TRACKED, format: tracked ? format : 'text', tracked,
});

const statusMap = (rows) => {
  const map = {};
  rows.forEach((r) => { map[r._id || 'unknown'] = r.count; });
  return map;
};

const sumField = (agg, field = 'total') => (agg?.[0]?.[field] || 0);

const respond = (res, section, from, to, payload) => {
  res.status(200).json({
    success: true,
    data: {
      section,
      range: { from, to },
      kpis: payload.kpis || [],
      breakdown: payload.breakdown || [],
      details: payload.details || [],
      footnotes: payload.footnotes || [],
      meta: payload.meta || {},
    },
  });
};

const bedOccupancy = async () => {
  const bedStatsRaw = await Bed.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
  const bedStat = statusMap(bedStatsRaw);
  const total = Object.values(bedStat).reduce((s, v) => s + v, 0);
  const occupied = bedStat.occupied || 0;
  return {
    occupied,
    available: bedStat.available || 0,
    cleaning: bedStat.cleaning || 0,
    maintenance: bedStat.maintenance || 0,
    reserved: bedStat.reserved || 0,
    total,
    percent: total ? Math.round((occupied / total) * 1000) / 10 : 0,
  };
};

const paidMatch = (from, to) => ({
  createdAt: { $gte: from, $lte: to },
  status: { $in: ['paid', 'partial'] },
});

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------
async function buildExecutive(from, to) {
  const paidStatus = { $in: ['paid', 'partial'] };
  const [
    totalPatients,
    newPatients,
    opCount,
    ipCount,
    discharges,
    surgeries,
    labTests,
    pharmacyBills,
    revenueAgg,
    pharmacySalesAgg,
    beds,
    activeUsers,
    failedLogins,
    criticalAlerts,
  ] = await Promise.all([
    Patient.countDocuments({ isActive: { $ne: false } }),
    Patient.countDocuments({ createdAt: { $gte: from, $lte: to } }),
    OPRegistration.countDocuments({ tokenDate: { $gte: from, $lte: to } }),
    IPAdmission.countDocuments({ admissionDate: { $gte: from, $lte: to } }),
    IPAdmission.countDocuments({ dischargeDate: { $gte: from, $lte: to } }),
    Operation.countDocuments({ scheduledDate: { $gte: from, $lte: to } }),
    LabTest.countDocuments({ createdAt: { $gte: from, $lte: to } }),
    Bill.countDocuments({ createdAt: { $gte: from, $lte: to }, billType: 'pharmacy' }),
    Bill.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to }, status: paidStatus } },
      { $group: { _id: null, total: { $sum: '$paidAmount' } } },
    ]),
    DirectSale.aggregate([
      { $match: { saleDate: { $gte: from, $lte: to } } },
      { $group: { _id: null, total: { $sum: '$grandTotal' }, count: { $sum: 1 } } },
    ]),
    bedOccupancy(),
    User.countDocuments({ isActive: true }),
    ActivityLog.countDocuments({
      module: 'Authentication',
      action: 'Login Failure',
      createdAt: { $gte: from, $lte: to },
    }),
    LabTest.countDocuments({
      createdAt: { $gte: from, $lte: to },
      'results.status': 'Critical',
    }),
  ]);

  const billRevenue = sumField(revenueAgg);
  const pharmacySales = sumField(pharmacySalesAgg);
  const revenue = billRevenue + pharmacySales;
  const pharmacyBillCount = (pharmacySalesAgg[0]?.count || 0) + pharmacyBills;

  return {
    kpis: [
      kpi('totalPatients', 'Total Patients', totalPatients),
      kpi('newPatients', 'New Patients', newPatients),
      kpi('opCount', 'OP Visits', opCount),
      kpi('ipCount', 'IP Admissions', ipCount),
      kpi('discharges', 'Discharges', discharges),
      kpi('surgeries', 'Surgeries', surgeries),
      kpi('labTests', 'Lab / Diagnostics', labTests),
      kpi('pharmacyBills', 'Pharmacy Bills', pharmacyBillCount),
      kpi('revenue', 'Revenue', revenue, 'currency'),
      kpi('expenses', 'Expenses', 0, 'text', false),
      kpi('profit', 'Profit', 0, 'text', false),
      kpi('bedOccupancy', 'Bed Occupancy', beds.percent, 'percent'),
      kpi('activeUsers', 'Active Users', activeUsers),
      kpi('failedLogins', 'Failed Logins', failedLogins),
      kpi('criticalAlerts', 'Critical Alerts', criticalAlerts),
    ],
    breakdown: [
      { label: 'Beds occupied', value: beds.occupied },
      { label: 'Beds available', value: beds.available },
      { label: 'Beds total', value: beds.total },
      { label: 'Bill revenue', value: billRevenue, format: 'currency' },
      { label: 'Pharmacy sales', value: pharmacySales, format: 'currency' },
    ],
    details: [],
    footnotes: [
      'Expenses / Profit: Not tracked yet (no expense ledger).',
      'Critical Alerts = lab results marked Critical in the selected period.',
    ],
    meta: { bedOccupancy: beds },
  };
}

async function buildUserActivity(from, to) {
  const authMatch = { module: 'Authentication', createdAt: { $gte: from, $lte: to } };
  const [
    logins, logouts, failures, lockouts, passwordChanges,
    activeUsers, lockedUsers, inactiveUsers,
    recentLogins, actionBreakdown,
  ] = await Promise.all([
    ActivityLog.countDocuments({ ...authMatch, action: 'Login Success' }),
    ActivityLog.countDocuments({ ...authMatch, action: 'Logout' }),
    ActivityLog.countDocuments({ ...authMatch, action: 'Login Failure' }),
    ActivityLog.countDocuments({ ...authMatch, action: 'Account Lockout' }),
    ActivityLog.countDocuments({
      module: 'Authentication',
      action: { $in: ['Password Change', 'Password Reset'] },
      createdAt: { $gte: from, $lte: to },
    }),
    User.countDocuments({ isActive: true }),
    User.countDocuments({ accountLockedUntil: { $gt: new Date() } }),
    User.countDocuments({ isActive: false }),
    User.find({ lastLogin: { $gte: from, $lte: to } })
      .select('name email role lastLogin isActive failedLoginAttempts accountLockedUntil')
      .sort({ lastLogin: -1 })
      .limit(50)
      .lean(),
    ActivityLog.aggregate([
      { $match: authMatch },
      { $group: { _id: '$action', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
  ]);

  return {
    kpis: [
      kpi('logins', 'Successful Logins', logins),
      kpi('logouts', 'Logouts', logouts),
      kpi('failures', 'Failed Logins', failures),
      kpi('lockouts', 'Account Lockouts', lockouts),
      kpi('passwordChanges', 'Password Changes', passwordChanges),
      kpi('activeUsers', 'Active Users', activeUsers),
      kpi('lockedUsers', 'Currently Locked', lockedUsers),
      kpi('inactiveUsers', 'Inactive Users', inactiveUsers),
      kpi('onlineUsers', 'Users Online Now', 0, 'text', false),
    ],
    breakdown: actionBreakdown.map((r) => ({ label: r._id, value: r.count })),
    details: recentLogins.map((u) => ({
      name: u.name,
      email: u.email,
      role: u.role,
      lastLogin: u.lastLogin,
      isActive: u.isActive,
      failedLoginAttempts: u.failedLoginAttempts || 0,
      locked: !!(u.accountLockedUntil && u.accountLockedUntil > new Date()),
    })),
    footnotes: ['Users currently online: Not tracked yet (no session store).'],
  };
}

async function buildPatient(from, to) {
  const [newPatients, opVisits, ipAdmissions, discharges, activePatients, genderBreakdown, statusOp] = await Promise.all([
    Patient.countDocuments({ createdAt: { $gte: from, $lte: to } }),
    OPRegistration.countDocuments({ tokenDate: { $gte: from, $lte: to } }),
    IPAdmission.countDocuments({ admissionDate: { $gte: from, $lte: to } }),
    IPAdmission.countDocuments({ dischargeDate: { $gte: from, $lte: to } }),
    Patient.countDocuments({ isActive: { $ne: false } }),
    Patient.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to } } },
      { $group: { _id: '$gender', count: { $sum: 1 } } },
    ]),
    OPRegistration.aggregate([
      { $match: { tokenDate: { $gte: from, $lte: to } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);

  const recent = await Patient.find({ createdAt: { $gte: from, $lte: to } })
    .select('patientId name gender age phone createdAt')
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  return {
    kpis: [
      kpi('newPatients', 'New Registrations', newPatients),
      kpi('activePatients', 'Active Patients', activePatients),
      kpi('opVisits', 'OP Visits', opVisits),
      kpi('ipAdmissions', 'IP Admissions', ipAdmissions),
      kpi('discharges', 'Discharges', discharges),
      kpi('merges', 'Patient Merges', 0, 'text', false),
    ],
    breakdown: [
      ...genderBreakdown.map((r) => ({ label: `Gender: ${r._id || 'Unknown'}`, value: r.count })),
      ...statusOp.map((r) => ({ label: `OP ${r._id || 'unknown'}`, value: r.count })),
    ],
    details: recent.map((p) => ({
      patientId: p.patientId,
      name: p.name,
      gender: p.gender,
      age: p.age,
      phone: p.phone,
      registeredAt: p.createdAt,
    })),
    footnotes: ['Patient merge / soft-delete history: Not tracked yet.'],
  };
}

async function buildAppointment(from, to) {
  const match = { appointmentDate: { $gte: from, $lte: to } };
  const [total, byStatus, cancelled, noShow, completed, rescheduledHint] = await Promise.all([
    Appointment.countDocuments(match),
    Appointment.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Appointment.countDocuments({ ...match, status: 'cancelled' }),
    Appointment.countDocuments({ ...match, status: 'no_show' }),
    Appointment.countDocuments({ ...match, status: 'completed' }),
    Appointment.countDocuments({ ...match, status: 'scheduled' }),
  ]);
  const sm = statusMap(byStatus);
  const details = await Appointment.find(match)
    .populate('patient', 'name patientId')
    .populate('doctor', 'name')
    .select('appointmentDate status doctor patient department')
    .sort({ appointmentDate: -1 })
    .limit(50)
    .lean();

  return {
    kpis: [
      kpi('total', 'Appointments', total),
      kpi('completed', 'Completed', completed),
      kpi('cancelled', 'Cancelled', cancelled),
      kpi('noShow', 'No-show', noShow),
      kpi('scheduled', 'Scheduled / Booked', rescheduledHint + (sm.confirmed || 0)),
      kpi('rescheduled', 'Rescheduled', 0, 'text', false),
      kpi('doctorChanged', 'Doctor Changes', 0, 'text', false),
    ],
    breakdown: byStatus.map((r) => ({ label: r._id || 'unknown', value: r.count })),
    details: details.map((a) => ({
      date: a.appointmentDate,
      patient: a.patient?.name || '—',
      patientId: a.patient?.patientId || '—',
      doctor: a.doctor?.name || '—',
      status: a.status,
    })),
    footnotes: [
      'Reschedule count: Not tracked yet (no dedicated reschedule field).',
      'Doctor change history: Not tracked yet.',
    ],
  };
}

async function buildDoctor(from, to) {
  const [opByDoc, ipByDoc, billByDoc, labByDoc, rxByDoc] = await Promise.all([
    OPRegistration.aggregate([
      { $match: { tokenDate: { $gte: from, $lte: to }, doctor: { $ne: null } } },
      { $group: { _id: '$doctor', opCount: { $sum: 1 } } },
    ]),
    IPAdmission.aggregate([
      { $match: { admissionDate: { $gte: from, $lte: to }, doctor: { $ne: null } } },
      { $group: { _id: '$doctor', ipCount: { $sum: 1 } } },
    ]),
    Bill.aggregate([
      { $match: { ...paidMatch(from, to), doctor: { $ne: null } } },
      { $group: { _id: '$doctor', revenue: { $sum: '$paidAmount' }, bills: { $sum: 1 } } },
    ]),
    LabTest.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to }, doctor: { $ne: null } } },
      { $group: { _id: '$doctor', labCount: { $sum: 1 } } },
    ]),
    Prescription.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to }, doctor: { $ne: null } } },
      { $group: { _id: '$doctor', rxCount: { $sum: 1 } } },
    ]),
  ]);

  const map = {};
  const ensure = (id) => {
    const key = String(id);
    if (!map[key]) map[key] = { doctorId: id, opCount: 0, ipCount: 0, revenue: 0, bills: 0, labCount: 0, rxCount: 0 };
    return map[key];
  };
  opByDoc.forEach((r) => { ensure(r._id).opCount = r.opCount; });
  ipByDoc.forEach((r) => { ensure(r._id).ipCount = r.ipCount; });
  billByDoc.forEach((r) => { const d = ensure(r._id); d.revenue = r.revenue; d.bills = r.bills; });
  labByDoc.forEach((r) => { ensure(r._id).labCount = r.labCount; });
  rxByDoc.forEach((r) => { ensure(r._id).rxCount = r.rxCount; });

  const ids = Object.values(map).map((d) => d.doctorId);
  const users = await User.find({ _id: { $in: ids } }).select('name role').lean();
  const nameMap = {};
  users.forEach((u) => { nameMap[String(u._id)] = u.name; });

  const details = Object.values(map)
    .map((d) => ({
      doctor: nameMap[String(d.doctorId)] || 'Unknown',
      opCount: d.opCount,
      ipCount: d.ipCount,
      bills: d.bills,
      revenue: d.revenue,
      labCount: d.labCount,
      rxCount: d.rxCount,
    }))
    .sort((a, b) => (b.opCount + b.ipCount) - (a.opCount + a.ipCount))
    .slice(0, 50);

  const totalOp = details.reduce((s, d) => s + d.opCount, 0);
  const totalIp = details.reduce((s, d) => s + d.ipCount, 0);
  const totalRev = details.reduce((s, d) => s + d.revenue, 0);

  return {
    kpis: [
      kpi('doctorsActive', 'Doctors with Activity', details.length),
      kpi('opConsults', 'OP Consultations', totalOp),
      kpi('ipCases', 'IP Cases', totalIp),
      kpi('revenue', 'Attributed Revenue', totalRev, 'currency'),
      kpi('prescriptions', 'Prescriptions', details.reduce((s, d) => s + d.rxCount, 0)),
      kpi('labOrders', 'Lab Orders', details.reduce((s, d) => s + d.labCount, 0)),
    ],
    breakdown: details.slice(0, 10).map((d) => ({ label: d.doctor, value: d.opCount + d.ipCount })),
    details,
    footnotes: [],
  };
}

async function buildPharmacy(from, to) {
  const moveMatch = { transactionDate: { $gte: from, $lte: to } };
  const [
    medicinesCreated, medicinesUpdated, salesAgg, salesCount,
    movementsByType, dispenseQty, expiredBatches, lowStock,
    salesWithItems, disposeCostAgg, pharmacyBillRev,
  ] = await Promise.all([
    Medicine.countDocuments({ createdAt: { $gte: from, $lte: to } }),
    Medicine.countDocuments({ updatedAt: { $gte: from, $lte: to }, createdAt: { $lt: from } }),
    DirectSale.aggregate([
      { $match: { saleDate: { $gte: from, $lte: to } } },
      { $group: { _id: null, total: { $sum: '$grandTotal' }, count: { $sum: 1 } } },
    ]),
    DirectSale.countDocuments({ saleDate: { $gte: from, $lte: to } }),
    StockMovement.aggregate([
      { $match: moveMatch },
      { $group: { _id: '$type', count: { $sum: 1 }, qty: { $sum: '$quantityChanged' } } },
      { $sort: { count: -1 } },
    ]),
    StockMovement.aggregate([
      { $match: { ...moveMatch, type: { $in: ['dispense', 'sale', 'bill_deduct'] } } },
      { $group: { _id: null, qty: { $sum: { $abs: '$quantityChanged' } } } },
    ]),
    Medicine.aggregate([
      { $unwind: '$batches' },
      { $match: { 'batches.expiryDate': { $lte: to }, 'batches.quantity': { $gt: 0 }, 'batches.isDisposed': { $ne: true } } },
      { $count: 'count' },
    ]),
    Medicine.countDocuments({
      isActive: true,
      $expr: { $lte: ['$currentStock', '$minimumStock'] },
    }),
    DirectSale.find({ saleDate: { $gte: from, $lte: to } })
      .select('items grandTotal invoiceNumber saleDate')
      .lean(),
    StockMovement.aggregate([
      { $match: { ...moveMatch, type: { $in: ['dispose'] } } },
      {
        $group: {
          _id: null,
          qty: { $sum: { $abs: '$quantityChanged' } },
          cost: { $sum: { $multiply: [{ $abs: '$quantityChanged' }, { $ifNull: ['$unitPrice', 0] }] } },
        },
      },
    ]),
    Bill.aggregate([
      {
        $match: {
          createdAt: { $gte: from, $lte: to },
          status: { $in: ['paid', 'partial'] },
          billType: { $in: ['pharmacy', 'Pharmacy', 'counter', 'op_pharmacy', 'OP Pharmacy'] },
        },
      },
      { $group: { _id: null, total: { $sum: '$paidAmount' } } },
    ]).catch(() => []),
  ]);

  // Build purchase-price lookup for COGS
  const medIds = new Set();
  salesWithItems.forEach((s) => {
    (s.items || []).forEach((it) => {
      if (it.medicine) medIds.add(String(it.medicine));
    });
  });
  const medDocs = await Medicine.find({ _id: { $in: [...medIds] } })
    .select('purchasePrice batches.batchNumber batches.purchasePrice')
    .lean();
  const medCost = {};
  medDocs.forEach((m) => {
    const batchMap = {};
    (m.batches || []).forEach((b) => {
      if (b.batchNumber) batchMap[String(b.batchNumber).toLowerCase()] = b.purchasePrice;
    });
    medCost[String(m._id)] = { purchasePrice: m.purchasePrice || 0, batches: batchMap };
  });

  let cogs = 0;
  const pnlByMedicine = {};
  salesWithItems.forEach((s) => {
    (s.items || []).forEach((it) => {
      const mid = it.medicine ? String(it.medicine) : null;
      const info = mid ? medCost[mid] : null;
      const batchKey = it.batchNumber ? String(it.batchNumber).toLowerCase() : '';
      const unitCost = (info?.batches?.[batchKey] != null && info.batches[batchKey] !== '')
        ? Number(info.batches[batchKey])
        : Number(info?.purchasePrice || 0);
      const qty = Number(it.quantity) || 0;
      const lineRev = Number(it.totalAmount != null ? it.totalAmount : (it.unitPrice || 0) * qty);
      const lineCost = unitCost * qty;
      cogs += lineCost;
      const name = it.medicineName || 'Unknown';
      if (!pnlByMedicine[name]) {
        pnlByMedicine[name] = { name, revenue: 0, cost: 0, qty: 0, profit: 0 };
      }
      pnlByMedicine[name].revenue += lineRev;
      pnlByMedicine[name].cost += lineCost;
      pnlByMedicine[name].qty += qty;
      pnlByMedicine[name].profit = pnlByMedicine[name].revenue - pnlByMedicine[name].cost;
    });
  });

  const counterRevenue = sumField(salesAgg);
  const billPharmacyRevenue = sumField(pharmacyBillRev);
  const revenue = counterRevenue + billPharmacyRevenue;
  const expiredLoss = disposeCostAgg[0]?.cost || 0;
  const grossProfit = revenue - cogs;
  const netProfit = grossProfit - expiredLoss;
  const marginPct = revenue > 0 ? Math.round((netProfit / revenue) * 1000) / 10 : 0;

  const pnlRows = Object.values(pnlByMedicine)
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 40)
    .map((r) => ({
      name: r.name,
      qty: r.qty,
      revenue: Math.round(r.revenue * 100) / 100,
      cost: Math.round(r.cost * 100) / 100,
      profit: Math.round(r.profit * 100) / 100,
      margin: r.revenue > 0 ? `${Math.round((r.profit / r.revenue) * 1000) / 10}%` : '—',
    }));

  const details = await DirectSale.find({ saleDate: { $gte: from, $lte: to } })
    .select('invoiceNumber saleType grandTotal paymentMethod paymentStatus saleDate')
    .sort({ saleDate: -1 })
    .limit(50)
    .lean();

  return {
    kpis: [
      kpi('medicineRevenue', 'Medicine Sales (Revenue)', revenue, 'currency'),
      kpi('medicineCogs', 'Medicine Cost (COGS)', Math.round(cogs * 100) / 100, 'currency'),
      kpi('grossProfit', 'Gross Profit', Math.round(grossProfit * 100) / 100, 'currency'),
      kpi('expiredLoss', 'Expired / Dispose Loss', Math.round(expiredLoss * 100) / 100, 'currency'),
      kpi('netProfit', 'Net Medicine Profit / Loss', Math.round(netProfit * 100) / 100, 'currency'),
      kpi('marginPct', 'Profit Margin %', marginPct, 'percent'),
      kpi('medicinesAdded', 'Medicines Added', medicinesCreated),
      kpi('medicinesUpdated', 'Medicines Updated', medicinesUpdated),
      kpi('salesCount', 'Counter Sales', salesCount || sumField(salesAgg, 'count')),
      kpi('dispensedQty', 'Units Dispensed', dispenseQty[0]?.qty || 0),
      kpi('stockMovements', 'Stock Movements', movementsByType.reduce((s, r) => s + r.count, 0)),
      kpi('expiredBatches', 'Expired Batches (qty>0)', expiredBatches[0]?.count || 0),
      kpi('lowStock', 'Low Stock Items', lowStock),
    ],
    breakdown: [
      { label: 'Counter sale revenue', value: counterRevenue, format: 'currency' },
      { label: 'Pharmacy bill revenue', value: billPharmacyRevenue, format: 'currency' },
      { label: 'Cost of goods sold (purchase price × qty)', value: Math.round(cogs * 100) / 100, format: 'currency' },
      { label: 'Gross profit (Sales − Cost)', value: Math.round(grossProfit * 100) / 100, format: 'currency' },
      { label: 'Expired / disposed loss', value: Math.round(expiredLoss * 100) / 100, format: 'currency' },
      { label: 'Net profit / loss', value: Math.round(netProfit * 100) / 100, format: 'currency' },
      ...movementsByType.map((r) => ({ label: `Movement: ${r._id || 'unknown'}`, value: r.count })),
    ],
    details: pnlRows.length
      ? pnlRows
      : details.map((s) => ({
        invoice: s.invoiceNumber,
        type: s.saleType,
        amount: s.grandTotal,
        method: s.paymentMethod,
        status: s.paymentStatus,
        date: s.saleDate,
      })),
    footnotes: [
      'Revenue = counter sales + pharmacy bills in range.',
      'Cost (COGS) = sold qty × batch/medicine purchase price.',
      'Net Profit / Loss = Gross Profit − expired/disposed stock value.',
      netProfit >= 0
        ? `Result: PROFIT of ₹${Math.round(netProfit).toLocaleString('en-IN')} (${marginPct}% margin).`
        : `Result: LOSS of ₹${Math.round(Math.abs(netProfit)).toLocaleString('en-IN')}.`,
    ],
    pnl: {
      revenue: Math.round(revenue * 100) / 100,
      cogs: Math.round(cogs * 100) / 100,
      grossProfit: Math.round(grossProfit * 100) / 100,
      expiredLoss: Math.round(expiredLoss * 100) / 100,
      netProfit: Math.round(netProfit * 100) / 100,
      marginPct,
    },
  };
}

async function buildInventory(from, to) {
  const [
    totalMeds, lowStock, outOfStock, adjustments, stockIn, assets, assetIssues,
  ] = await Promise.all([
    Medicine.countDocuments({ isActive: true }),
    Medicine.countDocuments({ isActive: true, $expr: { $lte: ['$currentStock', '$minimumStock'] } }),
    Medicine.countDocuments({ isActive: true, currentStock: { $lte: 0 } }),
    StockMovement.countDocuments({
      transactionDate: { $gte: from, $lte: to },
      type: { $in: ['adjustment', 'dispose', 'stock_adjustment_reduce', 'stock_adjustment_increase'] },
    }),
    StockMovement.countDocuments({
      transactionDate: { $gte: from, $lte: to },
      type: 'stock_in',
    }),
    Asset.countDocuments({ isActive: { $ne: false } }),
    Asset.countDocuments({ status: { $in: ['Under Maintenance', 'Breakdown', 'Repair In Progress', 'Decommissioned'] } }),
  ]);

  const lowList = await Medicine.find({
    isActive: true,
    $expr: { $lte: ['$currentStock', '$minimumStock'] },
  })
    .select('name currentStock minimumStock reorderLevel category')
    .sort({ currentStock: 1 })
    .limit(50)
    .lean();

  return {
    kpis: [
      kpi('totalMeds', 'Active Medicines', totalMeds),
      kpi('lowStock', 'Below Minimum', lowStock),
      kpi('outOfStock', 'Out of Stock', outOfStock),
      kpi('stockIn', 'Stock-In Events', stockIn),
      kpi('adjustments', 'Adjustments / Dispose', adjustments),
      kpi('assets', 'Assets Tracked', assets),
      kpi('assetIssues', 'Assets Needing Attention', assetIssues),
    ],
    breakdown: [
      { label: 'Low stock', value: lowStock },
      { label: 'Out of stock', value: outOfStock },
      { label: 'Assets', value: assets },
    ],
    details: lowList.map((m) => ({
      name: m.name,
      category: m.category,
      currentStock: m.currentStock,
      minimumStock: m.minimumStock,
      reorderLevel: m.reorderLevel,
    })),
    footnotes: [],
  };
}

async function buildBilling(from, to) {
  const match = { createdAt: { $gte: from, $lte: to } };
  const [
    total, byStatus, byType, discountAgg, refunded, edited, revenueAgg, outstandingAgg,
  ] = await Promise.all([
    Bill.countDocuments(match),
    Bill.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$totalAmount' } } }]),
    Bill.aggregate([{ $match: match }, { $group: { _id: '$billType', count: { $sum: 1 }, amount: { $sum: '$totalAmount' } } }]),
    Bill.aggregate([
      { $match: match },
      { $group: { _id: null, discount: { $sum: { $ifNull: ['$discountAmount', 0] } } } },
    ]),
    Bill.countDocuments({ ...match, status: 'refunded' }),
    Bill.countDocuments({ ...match, 'editHistory.0': { $exists: true } }),
    Bill.aggregate([
      { $match: { ...match, status: { $in: ['paid', 'partial'] } } },
      { $group: { _id: null, total: { $sum: '$paidAmount' } } },
    ]),
    Bill.aggregate([
      { $match: { status: { $in: ['pending', 'partial'] } } },
      { $group: { _id: null, total: { $sum: '$dueAmount' } } },
    ]),
  ]);

  const details = await Bill.find(match)
    .select('billNumber billType status totalAmount paidAmount dueAmount discountAmount createdAt')
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  return {
    kpis: [
      kpi('totalBills', 'Bills Created', total),
      kpi('revenue', 'Collected', sumField(revenueAgg), 'currency'),
      kpi('outstanding', 'Outstanding', sumField(outstandingAgg), 'currency'),
      kpi('discounts', 'Discounts Given', sumField(discountAgg, 'discount'), 'currency'),
      kpi('refunded', 'Refunded Bills', refunded),
      kpi('edited', 'Edited Bills', edited),
      kpi('cancelled', 'Cancelled', statusMap(byStatus).cancelled || 0),
    ],
    breakdown: [
      ...byStatus.map((r) => ({ label: `Status: ${r._id}`, value: r.count, amount: r.amount })),
      ...byType.map((r) => ({ label: `Type: ${r._id || 'n/a'}`, value: r.count, amount: r.amount })),
    ],
    details: details.map((b) => ({
      billNumber: b.billNumber,
      type: b.billType,
      status: b.status,
      total: b.totalAmount,
      paid: b.paidAmount,
      due: b.dueAmount,
      discount: b.discountAmount || 0,
      date: b.createdAt,
    })),
    footnotes: [],
  };
}

async function buildPayment(from, to) {
  const [billModes, saleModes, billPaid, salePaid, paymentCount] = await Promise.all([
    Bill.aggregate([
      { $match: paidMatch(from, to) },
      { $unwind: { path: '$payments', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: { $ifNull: ['$payments.mode', '$paymentMode'] },
          amount: { $sum: { $ifNull: ['$payments.amount', '$paidAmount'] } },
          count: { $sum: 1 },
        },
      },
      { $match: { _id: { $ne: null } } },
      { $sort: { amount: -1 } },
    ]),
    DirectSale.aggregate([
      { $match: { saleDate: { $gte: from, $lte: to } } },
      { $group: { _id: '$paymentMethod', amount: { $sum: '$paidAmount' }, count: { $sum: 1 } } },
      { $sort: { amount: -1 } },
    ]),
    Bill.aggregate([
      { $match: paidMatch(from, to) },
      { $group: { _id: null, total: { $sum: '$paidAmount' } } },
    ]),
    DirectSale.aggregate([
      { $match: { saleDate: { $gte: from, $lte: to } } },
      { $group: { _id: null, total: { $sum: '$paidAmount' } } },
    ]),
    Bill.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to }, 'payments.0': { $exists: true } } },
      { $project: { n: { $size: '$payments' } } },
      { $group: { _id: null, total: { $sum: '$n' } } },
    ]),
  ]);

  const modeMap = {};
  billModes.forEach((r) => {
    const key = String(r._id).toLowerCase();
    modeMap[key] = { mode: r._id, amount: (modeMap[key]?.amount || 0) + r.amount, count: (modeMap[key]?.count || 0) + r.count };
  });
  saleModes.forEach((r) => {
    const key = String(r._id || 'unknown').toLowerCase();
    modeMap[key] = { mode: r._id || 'unknown', amount: (modeMap[key]?.amount || 0) + r.amount, count: (modeMap[key]?.count || 0) + r.count };
  });
  const breakdown = Object.values(modeMap).sort((a, b) => b.amount - a.amount);

  return {
    kpis: [
      kpi('billCollections', 'Bill Collections', sumField(billPaid), 'currency'),
      kpi('pharmacyCollections', 'Pharmacy Collections', sumField(salePaid), 'currency'),
      kpi('totalCollections', 'Total Collections', sumField(billPaid) + sumField(salePaid), 'currency'),
      kpi('paymentEntries', 'Payment Entries', sumField(paymentCount)),
      kpi('modes', 'Payment Modes Used', breakdown.length),
    ],
    breakdown: breakdown.map((r) => ({ label: r.mode, value: r.count, amount: r.amount, format: 'currency' })),
    details: breakdown.map((r) => ({ mode: r.mode, count: r.count, amount: r.amount })),
    footnotes: [],
  };
}

async function buildLaboratory(from, to) {
  const match = {
    createdAt: { $gte: from, $lte: to },
    labType: { $in: LAB_CLINICAL_TYPES },
  };
  const [total, byStatus, byType, completed, pending, critical] = await Promise.all([
    LabTest.countDocuments(match),
    LabTest.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    LabTest.aggregate([{ $match: match }, { $group: { _id: '$labType', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    LabTest.countDocuments({ ...match, status: 'completed' }),
    LabTest.countDocuments({ ...match, status: { $in: ['pending', 'sample_collected', 'processing'] } }),
    LabTest.countDocuments({ ...match, 'results.status': 'Critical' }),
  ]);

  const details = await LabTest.find(match)
    .populate('patient', 'name patientId')
    .select('labNumber labType status priority totalAmount createdAt')
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  return {
    kpis: [
      kpi('total', 'Lab Orders', total),
      kpi('completed', 'Completed', completed),
      kpi('pending', 'In Progress', pending),
      kpi('critical', 'Critical Results', critical),
      kpi('types', 'Lab Types Used', byType.length),
    ],
    breakdown: [
      ...byStatus.map((r) => ({ label: `Status: ${r._id}`, value: r.count })),
      ...byType.map((r) => ({ label: r._id || 'Other', value: r.count })),
    ],
    details: details.map((t) => ({
      labNumber: t.labNumber,
      patient: t.patient?.name || '—',
      labType: t.labType,
      status: t.status,
      priority: t.priority,
      amount: t.totalAmount || 0,
      date: t.createdAt,
    })),
    footnotes: [],
  };
}

async function buildRadiology(from, to) {
  const match = {
    createdAt: { $gte: from, $lte: to },
    labType: { $in: RADIOLOGY_TYPES },
  };
  const [total, byStatus, byType, completed, pending] = await Promise.all([
    LabTest.countDocuments(match),
    LabTest.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    LabTest.aggregate([{ $match: match }, { $group: { _id: '$labType', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    LabTest.countDocuments({ ...match, status: 'completed' }),
    LabTest.countDocuments({ ...match, status: { $in: ['pending', 'sample_collected', 'processing'] } }),
  ]);

  const details = await LabTest.find(match)
    .populate('patient', 'name patientId')
    .select('labNumber labType status priority totalAmount createdAt')
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  return {
    kpis: [
      kpi('total', 'Radiology Orders', total),
      kpi('completed', 'Completed', completed),
      kpi('pending', 'Pending / In Progress', pending),
      kpi('xray', 'X-Ray', byType.find((r) => r._id === 'X-Ray')?.count || 0),
      kpi('ct', 'CT Scan', byType.find((r) => r._id === 'CT Scan')?.count || 0),
      kpi('mri', 'MRI', byType.find((r) => r._id === 'MRI')?.count || 0),
      kpi('usg', 'Ultrasound', byType.find((r) => r._id === 'Ultrasound')?.count || 0),
    ],
    breakdown: [
      ...byStatus.map((r) => ({ label: `Status: ${r._id}`, value: r.count })),
      ...byType.map((r) => ({ label: r._id, value: r.count })),
    ],
    details: details.map((t) => ({
      labNumber: t.labNumber,
      patient: t.patient?.name || '—',
      modality: t.labType,
      status: t.status,
      amount: t.totalAmount || 0,
      date: t.createdAt,
    })),
    footnotes: [],
  };
}

async function buildBed(from, to) {
  const beds = await bedOccupancy();
  const [admissions, discharges, transfers, byType] = await Promise.all([
    IPAdmission.countDocuments({ admissionDate: { $gte: from, $lte: to } }),
    IPAdmission.countDocuments({ dischargeDate: { $gte: from, $lte: to } }),
    IPAdmission.countDocuments({
      'transferHistory.transferDate': { $gte: from, $lte: to },
    }),
    Bed.aggregate([{ $group: { _id: '$type', count: { $sum: 1 } } }]),
  ]);

  const bedList = await Bed.find()
    .populate('ward', 'name')
    .populate('currentPatient', 'name patientId')
    .select('bedNumber type status ward currentPatient dailyRate')
    .sort({ bedNumber: 1 })
    .limit(100)
    .lean();

  return {
    kpis: [
      kpi('total', 'Total Beds', beds.total),
      kpi('occupied', 'Occupied', beds.occupied),
      kpi('available', 'Available', beds.available),
      kpi('occupancy', 'Occupancy %', beds.percent, 'percent'),
      kpi('cleaning', 'Cleaning', beds.cleaning),
      kpi('maintenance', 'Maintenance', beds.maintenance),
      kpi('admissions', 'Admissions (period)', admissions),
      kpi('discharges', 'Discharges (period)', discharges),
      kpi('transfers', 'Bed Transfers', transfers),
    ],
    breakdown: [
      { label: 'Occupied', value: beds.occupied },
      { label: 'Available', value: beds.available },
      { label: 'Cleaning', value: beds.cleaning },
      { label: 'Maintenance', value: beds.maintenance },
      { label: 'Reserved', value: beds.reserved },
      ...byType.map((r) => ({ label: `Type: ${r._id || 'n/a'}`, value: r.count })),
    ],
    details: bedList.map((b) => ({
      bedNumber: b.bedNumber,
      ward: b.ward?.name || '—',
      type: b.type,
      status: b.status,
      patient: b.currentPatient?.name || '—',
      dailyRate: b.dailyRate || 0,
    })),
    footnotes: [],
  };
}

async function buildNurse(from, to) {
  const [notesAgg, medsAgg, nursingServices] = await Promise.all([
    IPAdmission.aggregate([
      { $unwind: '$nursingNotes' },
      { $match: { 'nursingNotes.recordedAt': { $gte: from, $lte: to } } },
      { $count: 'count' },
    ]),
    IPAdmission.aggregate([
      { $unwind: '$medications' },
      { $match: { 'medications.administeredAt': { $gte: from, $lte: to } } },
      { $count: 'count' },
    ]),
    IPAdmission.aggregate([
      { $unwind: '$serviceUsages' },
      {
        $match: {
          'serviceUsages.usedAt': { $gte: from, $lte: to },
          'serviceUsages.category': 'Nursing',
        },
      },
      { $count: 'count' },
    ]),
  ]);

  const recentMeds = await IPAdmission.aggregate([
    { $unwind: '$medications' },
    { $match: { 'medications.administeredAt': { $gte: from, $lte: to } } },
    { $sort: { 'medications.administeredAt': -1 } },
    { $limit: 50 },
    {
      $lookup: {
        from: 'patients',
        localField: 'patient',
        foreignField: '_id',
        as: 'patientDoc',
      },
    },
    {
      $project: {
        admissionNumber: 1,
        medicineName: '$medications.medicineName',
        quantity: '$medications.quantity',
        administeredAt: '$medications.administeredAt',
        patientName: { $arrayElemAt: ['$patientDoc.name', 0] },
      },
    },
  ]);

  const notes = notesAgg[0]?.count || 0;
  const meds = medsAgg[0]?.count || 0;

  return {
    kpis: [
      kpi('nursingNotes', 'Nursing Notes', notes),
      kpi('medsAdministered', 'Medications Administered', meds),
      kpi('nursingServices', 'Nursing Services Logged', nursingServices[0]?.count || 0),
      kpi('vitalsTrend', 'Vitals Trends', 0, 'text', false),
      kpi('shiftHandover', 'Shift Handovers', 0, 'text', false),
    ],
    breakdown: [
      { label: 'Notes', value: notes },
      { label: 'Medications', value: meds },
    ],
    details: recentMeds.map((m) => ({
      admission: m.admissionNumber,
      patient: m.patientName || '—',
      medicine: m.medicineName,
      quantity: m.quantity,
      administeredAt: m.administeredAt,
    })),
    footnotes: [
      'Vitals trend dashboards: Not tracked yet as a dedicated series.',
      'Shift handover records: Not tracked yet.',
    ],
  };
}

async function buildOt(from, to) {
  const match = { scheduledDate: { $gte: from, $lte: to } };
  const [total, byStatus, chargesAgg, completed, cancelled] = await Promise.all([
    Operation.countDocuments(match),
    Operation.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Operation.aggregate([
      { $match: match },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$totalCharges', 0] } } } },
    ]),
    Operation.countDocuments({ ...match, status: 'completed' }),
    Operation.countDocuments({ ...match, status: 'cancelled' }),
  ]);

  const details = await Operation.find(match)
    .populate('patient', 'name patientId')
    .populate('surgeon', 'name')
    .select('operationNumber status scheduledDate totalCharges surgeon patient')
    .sort({ scheduledDate: -1 })
    .limit(50)
    .lean();

  return {
    kpis: [
      kpi('booked', 'OT Bookings', total),
      kpi('completed', 'Completed', completed),
      kpi('cancelled', 'Cancelled', cancelled),
      kpi('inProgress', 'In Progress', statusMap(byStatus).in_progress || 0),
      kpi('charges', 'OT Charges', sumField(chargesAgg), 'currency'),
      kpi('postponed', 'Postponed', statusMap(byStatus).postponed || 0),
    ],
    breakdown: byStatus.map((r) => ({ label: r._id || 'unknown', value: r.count })),
    details: details.map((o) => ({
      operationNumber: o.operationNumber,
      patient: o.patient?.name || '—',
      surgeon: o.surgeon?.name || '—',
      status: o.status,
      scheduledDate: o.scheduledDate,
      charges: o.totalCharges || 0,
    })),
    footnotes: [],
  };
}

async function buildFinancial(from, to) {
  const [billRev, pharmRev, outstanding, discounts, refunds] = await Promise.all([
    Bill.aggregate([
      { $match: paidMatch(from, to) },
      { $group: { _id: null, total: { $sum: '$paidAmount' } } },
    ]),
    DirectSale.aggregate([
      { $match: { saleDate: { $gte: from, $lte: to } } },
      { $group: { _id: null, total: { $sum: '$grandTotal' } } },
    ]),
    Bill.aggregate([
      { $match: { status: { $in: ['pending', 'partial'] } } },
      { $group: { _id: null, total: { $sum: '$dueAmount' } } },
    ]),
    Bill.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to } } },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$discountAmount', 0] } } } },
    ]),
    Bill.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to }, status: 'refunded' } },
      { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
    ]),
  ]);

  const revenue = sumField(billRev) + sumField(pharmRev);

  return {
    kpis: [
      kpi('revenue', 'Total Revenue', revenue, 'currency'),
      kpi('billRevenue', 'Billing Revenue', sumField(billRev), 'currency'),
      kpi('pharmacyRevenue', 'Pharmacy Revenue', sumField(pharmRev), 'currency'),
      kpi('outstanding', 'Outstanding Receivables', sumField(outstanding), 'currency'),
      kpi('discounts', 'Discounts', sumField(discounts), 'currency'),
      kpi('refunds', 'Refunds', sumField(refunds), 'currency'),
      kpi('expenses', 'Expenses', 0, 'text', false),
      kpi('profit', 'Net Profit', 0, 'text', false),
    ],
    breakdown: [
      { label: 'Billing revenue', value: sumField(billRev), format: 'currency' },
      { label: 'Pharmacy revenue', value: sumField(pharmRev), format: 'currency' },
      { label: 'Outstanding', value: sumField(outstanding), format: 'currency' },
      { label: 'Discounts', value: sumField(discounts), format: 'currency' },
    ],
    details: [],
    footnotes: [
      'Expenses / Net Profit: Not tracked yet (no expense ledger).',
      `Refunded bills in period: ${refunds[0]?.count || 0}.`,
    ],
  };
}

async function buildInsurance(from, to) {
  const claimMatch = {
    createdAt: { $gte: from, $lte: to },
    'insuranceClaim.claimNumber': { $exists: true, $ne: null },
  };
  const [claims, byStatus, approvedAgg, patientsWithIns] = await Promise.all([
    Bill.countDocuments(claimMatch),
    Bill.aggregate([
      { $match: claimMatch },
      { $group: { _id: '$insuranceClaim.status', count: { $sum: 1 }, amount: { $sum: '$insuranceClaim.approvedAmount' } } },
    ]),
    Bill.aggregate([
      { $match: claimMatch },
      { $group: { _id: null, approved: { $sum: { $ifNull: ['$insuranceClaim.approvedAmount', 0] } } } },
    ]),
    Patient.countDocuments({
      'insuranceInfo.provider': { $exists: true, $nin: [null, ''] },
    }),
  ]);

  const details = await Bill.find(claimMatch)
    .populate('patient', 'name patientId')
    .select('billNumber insuranceClaim totalAmount status createdAt')
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  return {
    kpis: [
      kpi('claims', 'Claims Filed', claims),
      kpi('approvedAmount', 'Approved Amount', approvedAgg[0]?.approved || 0, 'currency'),
      kpi('patientsInsured', 'Patients with Insurance Info', patientsWithIns),
      kpi('pending', 'Pending Claims', byStatus.find((r) => r._id === 'pending')?.count || 0),
      kpi('rejected', 'Rejected Claims', byStatus.find((r) => r._id === 'rejected')?.count || 0),
    ],
    breakdown: byStatus.map((r) => ({
      label: r._id || 'unknown',
      value: r.count,
      amount: r.amount || 0,
    })),
    details: details.map((b) => ({
      billNumber: b.billNumber,
      patient: b.patient?.name || '—',
      provider: b.insuranceClaim?.provider || '—',
      claimNumber: b.insuranceClaim?.claimNumber || '—',
      claimStatus: b.insuranceClaim?.status || '—',
      approved: b.insuranceClaim?.approvedAmount || 0,
      date: b.createdAt,
    })),
    footnotes: [],
  };
}

async function buildEmployee(from, to) {
  const [total, active, byRole, staffEvents, newUsers] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ isActive: true }),
    User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    ActivityLog.countDocuments({
      createdAt: { $gte: from, $lte: to },
      action: { $in: ['User Creation', 'Role Change', 'Permission Change', 'User Update', 'User Status Toggle'] },
    }),
    User.countDocuments({ createdAt: { $gte: from, $lte: to } }),
  ]);

  const details = await User.find()
    .select('name email role department isActive lastLogin createdAt')
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  return {
    kpis: [
      kpi('totalStaff', 'Total Staff', total),
      kpi('activeStaff', 'Active Staff', active),
      kpi('newUsers', 'New Users (period)', newUsers),
      kpi('staffEvents', 'HR / Staff Events', staffEvents),
      kpi('attendance', 'Attendance', 0, 'text', false),
      kpi('leave', 'Leave Requests', 0, 'text', false),
      kpi('lateArrivals', 'Late Arrivals', 0, 'text', false),
    ],
    breakdown: byRole.map((r) => ({ label: r._id || 'Unknown', value: r.count })),
    details: details.map((u) => ({
      name: u.name,
      email: u.email,
      role: u.role,
      department: u.department || '—',
      isActive: u.isActive,
      lastLogin: u.lastLogin,
    })),
    footnotes: [
      'Attendance / leave / late arrivals: Not tracked yet (no HR module).',
    ],
  };
}

async function buildSecurity(from, to) {
  const authMatch = { module: 'Authentication', createdAt: { $gte: from, $lte: to } };
  const [
    failures, lockouts, logins, passwordEvents, roleChanges, lockedNow, unknownEmailFails,
  ] = await Promise.all([
    ActivityLog.countDocuments({ ...authMatch, action: 'Login Failure' }),
    ActivityLog.countDocuments({ ...authMatch, action: 'Account Lockout' }),
    ActivityLog.countDocuments({ ...authMatch, action: 'Login Success' }),
    ActivityLog.countDocuments({
      ...authMatch,
      action: { $in: ['Password Change', 'Password Reset'] },
    }),
    ActivityLog.countDocuments({
      createdAt: { $gte: from, $lte: to },
      action: { $in: ['Role Change', 'Permission Change'] },
    }),
    User.countDocuments({ accountLockedUntil: { $gt: new Date() } }),
    ActivityLog.countDocuments({
      ...authMatch,
      action: 'Login Failure',
      'metadata.reason': 'user_not_found',
    }),
  ]);

  const recent = await ActivityLog.find({
    createdAt: { $gte: from, $lte: to },
    $or: [
      { module: 'Authentication' },
      { action: { $in: ['Role Change', 'Permission Change', 'User Status Toggle'] } },
    ],
  })
    .populate('user', 'name email role')
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  return {
    kpis: [
      kpi('failedLogins', 'Failed Logins', failures),
      kpi('unknownEmail', 'Unknown Email Attempts', unknownEmailFails),
      kpi('lockouts', 'Lockouts', lockouts),
      kpi('lockedNow', 'Accounts Locked Now', lockedNow),
      kpi('successfulLogins', 'Successful Logins', logins),
      kpi('passwordEvents', 'Password Events', passwordEvents),
      kpi('roleChanges', 'Role / Permission Changes', roleChanges),
    ],
    breakdown: [
      { label: 'Failed logins', value: failures },
      { label: 'Unknown email', value: unknownEmailFails },
      { label: 'Lockouts', value: lockouts },
      { label: 'Role/permission changes', value: roleChanges },
    ],
    details: recent.map((l) => ({
      action: l.action,
      user: l.user?.name || l.metadata?.email || '—',
      email: l.user?.email || l.metadata?.email || '—',
      description: l.description,
      ip: l.ipAddress,
      date: l.createdAt,
    })),
    footnotes: [],
  };
}

async function buildSystem() {
  const uptimeSec = Math.floor(process.uptime());
  const mem = process.memoryUsage();
  let dbStats = null;
  try {
    const mongoose = require('mongoose');
    if (mongoose.connection?.db) {
      dbStats = await mongoose.connection.db.stats();
    }
  } catch (_) {
    dbStats = null;
  }

  return {
    kpis: [
      kpi('uptime', 'Process Uptime (hrs)', Math.round((uptimeSec / 3600) * 10) / 10),
      kpi('heapUsed', 'Heap Used (MB)', Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10),
      kpi('collections', 'DB Collections', dbStats?.collections ?? 0, 'number', !!dbStats),
      kpi('dbObjects', 'DB Objects', dbStats?.objects ?? 0, 'number', !!dbStats),
      kpi('apiErrors', 'API Error Log', 0, 'text', false),
      kpi('backups', 'Backup History', 0, 'text', false),
      kpi('failedJobs', 'Failed Job Queue', 0, 'text', false),
    ],
    breakdown: [
      { label: 'Node version', value: process.version },
      { label: 'Env', value: process.env.NODE_ENV || 'development' },
      { label: 'Uptime seconds', value: uptimeSec },
    ],
    details: [],
    footnotes: [
      'API error history / backup restore / failed jobs: Not tracked yet unless infra collectors are added.',
      !dbStats ? 'DB stats unavailable for this process.' : null,
    ].filter(Boolean),
  };
}

const SECTION_BUILDERS = {
  executive: buildExecutive,
  'user-activity': buildUserActivity,
  patient: buildPatient,
  appointment: buildAppointment,
  doctor: buildDoctor,
  pharmacy: buildPharmacy,
  inventory: buildInventory,
  billing: buildBilling,
  payment: buildPayment,
  laboratory: buildLaboratory,
  radiology: buildRadiology,
  bed: buildBed,
  nurse: buildNurse,
  ot: buildOt,
  financial: buildFinancial,
  insurance: buildInsurance,
  employee: buildEmployee,
  security: buildSecurity,
  system: async () => buildSystem(),
};

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
exports.AUDIT_SECTIONS = SECTION_KEYS;

exports.getAuditExecutive = asyncHandler(async (req, res) => {
  const { from, to } = parseRange(req);
  const payload = await buildExecutive(from, to);
  respond(res, 'executive', from, to, payload);
});

exports.getAuditSection = asyncHandler(async (req, res, next) => {
  const section = String(req.params.section || '').toLowerCase();
  if (!SECTION_BUILDERS[section]) {
    return next(new ErrorResponse(`Unknown audit section: ${section}`, 404));
  }
  const { from, to } = parseRange(req);
  const payload = await SECTION_BUILDERS[section](from, to);
  respond(res, section, from, to, payload);
});
