const asyncHandler = require('../utils/asyncHandler');
const Patient = require('../models/Patient');
const OPRegistration = require('../models/OPRegistration');
const IPAdmission = require('../models/IPAdmission');
const Bed = require('../models/Bed');
const Bill = require('../models/Bill');
const LabTest = require('../models/LabTest');
const User = require('../models/User');
const Department = require('../models/Department');
const Asset = require('../models/Asset');
const DirectSale = require('../models/DirectSale');

exports.getDashboardStats = asyncHandler(async (req, res) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const month = new Date(today.getFullYear(), today.getMonth(), 1);

  const [
    todayOP, todayIP, totalPatients, totalIP,
    bedStats, revenue, pendingBills, labToday,
    recentPatients, opQueue,
  ] = await Promise.all([
    OPRegistration.countDocuments({ tokenDate: { $gte: today, $lt: tomorrow } }),
    IPAdmission.countDocuments({ createdAt: { $gte: today } }),
    Patient.countDocuments(),
    IPAdmission.countDocuments({ status: 'admitted' }),
    Bed.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Bill.aggregate([{ $match: { createdAt: { $gte: today }, status: { $in: ['paid', 'partial'] } } }, { $group: { _id: null, total: { $sum: '$paidAmount' } } }]),
    Bill.countDocuments({ status: { $in: ['pending', 'partial'] } }),
    LabTest.countDocuments({ createdAt: { $gte: today } }),
    Patient.find().sort('-createdAt').limit(5).select('patientId name age gender phone createdAt'),
    OPRegistration.find({ tokenDate: { $gte: today, $lt: tomorrow }, status: { $in: ['waiting', 'in_consultation'] } })
      .populate('patient', 'name age').populate('doctor', 'name').populate('department', 'name').sort('tokenNumber').limit(10),
  ]);

  const bedStat = bedStats.reduce((acc, b) => { acc[b._id] = b.count; return acc; }, {});

  // 30-day revenue trend
  const from30 = new Date(); from30.setDate(from30.getDate() - 30);
  const revenueTrend = await Bill.aggregate([
    { $match: { createdAt: { $gte: from30 }, status: { $in: ['paid', 'partial'] } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, revenue: { $sum: '$paidAmount' } } },
    { $sort: { _id: 1 } },
  ]);

  const opStats = await OPRegistration.aggregate([
    { $match: { tokenDate: { $gte: today, $lt: tomorrow } } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const opStat = opStats.reduce((acc, s) => { acc[s._id] = s.count; return acc; }, {});

  // New stats
  const [totalDoctors, totalDepartments, totalAssets, assetsUnderRepair, pharmacySalesToday] = await Promise.all([
    User.countDocuments({ role: 'Doctor', isActive: true }),
    Department.countDocuments({ isActive: true }),
    Asset.countDocuments({ isActive: true }),
    Asset.countDocuments({ isActive: true, status: { $in: ['Under Maintenance', 'Breakdown', 'Repair In Progress'] } }),
    DirectSale.aggregate([
      { $match: { saleDate: { $gte: today, $lt: tomorrow } } },
      { $group: { _id: null, total: { $sum: '$grandTotal' }, count: { $sum: 1 } } },
    ]),
  ]);

  res.status(200).json({
    success: true,
    data: {
      todayOP, todayIP, totalPatients, totalIP,
      beds: { available: bedStat.available || 0, occupied: bedStat.occupied || 0, cleaning: bedStat.cleaning || 0, maintenance: bedStat.maintenance || 0 },
      todayRevenue: revenue[0]?.total || 0,
      pendingBills, labToday,
      opQueue: {
        waiting: opStat.waiting || 0,
        in_consultation: opStat.in_consultation || 0,
        completed: (opStat.completed || 0) + (opStat.consultation_completed || 0) + (opStat.sent_to_pharmacy || 0) + (opStat.pharmacy_completed || 0),
      },
      recentPatients, liveQueue: opQueue, revenueTrend,
      totalDoctors,
      totalDepartments,
      totalAssets,
      assetsUnderRepair,
      todayPharmacySales: { total: pharmacySalesToday[0]?.total || 0, count: pharmacySalesToday[0]?.count || 0 },
    },
  });
});

exports.getDepartmentAnalytics = asyncHandler(async (req, res) => {
  const from = new Date(); from.setDate(from.getDate() - 30);
  const analytics = await OPRegistration.aggregate([
    { $match: { createdAt: { $gte: from } } },
    { $group: { _id: '$department', count: { $sum: 1 }, completed: { $sum: { $cond: [{ $in: ['$status', ['completed', 'consultation_completed', 'sent_to_pharmacy', 'pharmacy_completed']] }, 1, 0] } } } },
    { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'dept' } },
    { $unwind: { path: '$dept', preserveNullAndEmptyArrays: true } },
    { $project: { name: { $ifNull: ['$dept.name', 'Unknown'] }, count: 1, completed: 1, color: '$dept.color' } },
    { $sort: { count: -1 } },
  ]);
  res.status(200).json({ success: true, data: analytics });
});
