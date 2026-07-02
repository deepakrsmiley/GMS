const asyncHandler = require('../utils/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const Bed = require('../models/Bed');
const Ward = require('../models/Ward');
const IPAdmission = require('../models/IPAdmission');

exports.getBeds = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.ward) filter.ward = req.query.ward;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.type) filter.type = req.query.type;

  const beds = await Bed.find(filter)
    .populate('ward', 'name type')
    .populate('currentPatient', 'patientId name age gender')
    .populate('currentAdmission', 'admissionNumber admissionDate');
  res.status(200).json({ success: true, count: beds.length, data: beds });
});

exports.getBedOccupancy = asyncHandler(async (req, res) => {
  const stats = await Bed.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const byType = await Bed.aggregate([
    { $group: { _id: '$type', total: { $sum: 1 }, occupied: { $sum: { $cond: [{ $eq: ['$status', 'occupied'] }, 1, 0] } } } },
  ]);
  const byWard = await Ward.aggregate([
    { $lookup: { from: 'beds', localField: '_id', foreignField: 'ward', as: 'beds' } },
    { $project: { name: 1, type: 1, totalBeds: { $size: '$beds' }, occupiedBeds: { $size: { $filter: { input: '$beds', as: 'b', cond: { $eq: ['$$b.status', 'occupied'] } } } } } },
  ]);
  res.status(200).json({ success: true, data: { stats, byType, byWard } });
});

exports.updateBedStatus = asyncHandler(async (req, res, next) => {
  const bed = await Bed.findByIdAndUpdate(req.params.id, req.body, { new: true })
    .populate('ward currentPatient');
  if (!bed) return next(new ErrorResponse('Bed not found', 404));
  if (req.app.get('io')) req.app.get('io').emit('bed:update', { data: bed });
  res.status(200).json({ success: true, data: bed });
});

exports.createBed = asyncHandler(async (req, res) => {
  const bed = await Bed.create(req.body);
  const { syncWardCounters } = require('../utils/roomBedSync');
  await syncWardCounters(req.body.ward);
  res.status(201).json({ success: true, data: bed });
});

exports.updateBed = asyncHandler(async (req, res, next) => {
  const bed = await Bed.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
    .populate('ward', 'name type')
    .populate('currentPatient', 'patientId name');
  if (!bed) return next(new ErrorResponse('Bed not found', 404));
  if (req.body.status || req.body.dailyRate) {
    const { syncWardCounters } = require('../utils/roomBedSync');
    await syncWardCounters(bed.ward);
  }
  if (req.app.get('io')) req.app.get('io').emit('bed:update', { data: bed });
  res.status(200).json({ success: true, data: bed });
});

exports.deleteBed = asyncHandler(async (req, res, next) => {
  const bed = await Bed.findById(req.params.id);
  if (!bed) return next(new ErrorResponse('Bed not found', 404));
  if (bed.status === 'occupied') return next(new ErrorResponse('Cannot delete occupied bed', 400));
  bed.isActive = false;
  bed.status = 'maintenance';
  await bed.save();
  const { syncWardCounters } = require('../utils/roomBedSync');
  await syncWardCounters(bed.ward);
  res.status(200).json({ success: true, message: 'Bed deactivated' });
});

exports.getWards = asyncHandler(async (req, res) => {
  const wards = await Ward.find({ isActive: true }).populate('inCharge', 'name');
  res.status(200).json({ success: true, data: wards });
});

// ============ NEW: CREATE WARD ============
exports.createWard = asyncHandler(async (req, res, next) => {
  const { name, code, type, floor, department, inCharge, description } = req.body;

  // Check if ward with same name already exists
  const existingWard = await Ward.findOne({ name: name });
  if (existingWard) {
    return next(new ErrorResponse('Ward with this name already exists', 400));
  }

  const ward = await Ward.create({
    name,
    code: code || name.substring(0, 3).toUpperCase(),
    type: type || 'general',
    floor,
    department,
    inCharge,
    description,
    totalBeds: 0,
    availableBeds: 0,
  });

  res.status(201).json({ success: true, data: ward });
});

// ============ NEW: UPDATE WARD ============
exports.updateWard = asyncHandler(async (req, res, next) => {
  let ward = await Ward.findById(req.params.id);
  
  if (!ward) {
    return next(new ErrorResponse('Ward not found', 404));
  }

  ward = await Ward.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  res.status(200).json({ success: true, data: ward });
});

// ============ NEW: DELETE WARD ============
exports.deleteWard = asyncHandler(async (req, res, next) => {
  const ward = await Ward.findById(req.params.id);
  
  if (!ward) {
    return next(new ErrorResponse('Ward not found', 404));
  }

  // Check if there are active beds in this ward
  const bedsCount = await Bed.countDocuments({ ward: req.params.id, isActive: true });
  if (bedsCount > 0) {
    return next(new ErrorResponse(`Cannot delete ward with ${bedsCount} active beds. Please deactivate all beds first.`, 400));
  }

  await Ward.findByIdAndDelete(req.params.id);
  res.status(200).json({ success: true, message: 'Ward deleted successfully' });
});