const asyncHandler = require('../utils/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const Room = require('../models/Room');
const Bed = require('../models/Bed');
const Ward = require('../models/Ward');
const { syncWardCounters } = require('../utils/roomBedSync');

exports.getRoomDashboard = asyncHandler(async (req, res) => {
  const rooms = await Room.find({ isActive: { $ne: false } })
    .populate('ward', 'name type floor')
    .populate('bed', 'bedNumber status dailyRate')
    .populate('currentPatient', 'patientId name')
    .populate('currentAdmission', 'admissionNumber admissionDate')
    .sort('floor roomNumber');

  const beds = await Bed.find({ isActive: { $ne: false } });
  const countBy = (items, key, val) => items.filter((i) => i[key] === val).length;

  const icuRooms = rooms.filter((r) => r.type === 'icu' || r.type === 'nicu');
  const wardRooms = rooms.filter((r) => !['icu', 'nicu'].includes(r.type));

  res.status(200).json({
    success: true,
    data: {
      totalRooms: rooms.length || beds.length,
      occupied: countBy(rooms, 'status', 'occupied') || countBy(beds, 'status', 'occupied'),
      available: countBy(rooms, 'status', 'available') || countBy(beds, 'status', 'available'),
      reserved: countBy(rooms, 'status', 'reserved') || countBy(beds, 'status', 'reserved'),
      maintenance: countBy(rooms, 'status', 'maintenance') || countBy(beds, 'status', 'maintenance'),
      icuOccupancy: {
        total: icuRooms.length || beds.filter((b) => ['icu', 'nicu'].includes(b.type)).length,
        occupied: countBy(icuRooms, 'status', 'occupied'),
      },
      wardOccupancy: {
        total: wardRooms.length || beds.filter((b) => !['icu', 'nicu'].includes(b.type)).length,
        occupied: countBy(wardRooms, 'status', 'occupied'),
      },
      rooms,
    },
  });
});

exports.getAvailableRooms = asyncHandler(async (req, res) => {
  const filter = { status: 'available', isActive: { $ne: false } };
  if (req.query.type) filter.type = req.query.type;
  if (req.query.ward) filter.ward = req.query.ward;

  const rooms = await Room.find(filter)
    .populate('ward', 'name type floor')
    .populate('bed', 'bedNumber dailyRate floor')
    .sort('floor roomNumber');

  if (rooms.length) {
    return res.status(200).json({ success: true, count: rooms.length, data: rooms });
  }

  const bedFilter = { status: 'available', isActive: { $ne: false } };
  if (req.query.type) bedFilter.type = req.query.type;
  if (req.query.ward) bedFilter.ward = req.query.ward;

  const beds = await Bed.find(bedFilter)
    .populate('ward', 'name type floor')
    .sort('floor bedNumber');

  const mapped = beds.map((b) => ({
    _id: b._id,
    roomNumber: b.roomNumber || b.bedNumber,
    type: b.type,
    floor: b.floor || b.ward?.floor,
    dailyCharge: b.dailyRate,
    bedNumber: b.bedNumber,
    bed: b,
    ward: b.ward,
    status: 'available',
  }));

  res.status(200).json({ success: true, count: mapped.length, data: mapped });
});

exports.getRooms = asyncHandler(async (req, res) => {
  const filter = { isActive: { $ne: false } };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.type) filter.type = req.query.type;
  if (req.query.ward) filter.ward = req.query.ward;

  const rooms = await Room.find(filter)
    .populate('ward', 'name type')
    .populate('bed', 'bedNumber status dailyRate')
    .populate('currentPatient', 'patientId name age gender')
    .sort('floor roomNumber');

  res.status(200).json({ success: true, count: rooms.length, data: rooms });
});

exports.createRoom = asyncHandler(async (req, res, next) => {
  const ward = await Ward.findById(req.body.ward);
  if (!ward) return next(new ErrorResponse('Ward not found', 404));

  let bed = null;
  if (req.body.bed) {
    bed = await Bed.findById(req.body.bed);
  } else if (req.body.bedNumber) {
    bed = await Bed.create({
      bedNumber: req.body.bedNumber,
      roomNumber: req.body.roomNumber,
      ward: req.body.ward,
      type: req.body.type || 'general',
      floor: req.body.floor || ward.floor,
      dailyRate: req.body.dailyCharge || 1500,
      status: 'available',
    });
    await syncWardCounters(req.body.ward);
    req.body.bed = bed._id;
    req.body.bedNumber = req.body.bedNumber;
  }

  const room = await Room.create(req.body);
  if (bed) {
    bed.room = room._id;
    bed.roomNumber = room.roomNumber;
    await bed.save();
  }

  const populated = await Room.findById(room._id)
    .populate('ward', 'name')
    .populate('bed', 'bedNumber dailyRate');

  res.status(201).json({ success: true, data: populated });
});

exports.updateRoom = asyncHandler(async (req, res, next) => {
  const room = await Room.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
    .populate('ward', 'name')
    .populate('bed', 'bedNumber dailyRate');
  if (!room) return next(new ErrorResponse('Room not found', 404));

  if (req.body.dailyCharge != null && room.bed) {
    await Bed.findByIdAndUpdate(room.bed, { dailyRate: req.body.dailyCharge });
  }

  res.status(200).json({ success: true, data: room });
});

exports.deleteRoom = asyncHandler(async (req, res, next) => {
  const room = await Room.findById(req.params.id);
  if (!room) return next(new ErrorResponse('Room not found', 404));
  if (room.status === 'occupied') return next(new ErrorResponse('Cannot delete occupied room', 400));

  room.isActive = false;
  room.status = 'maintenance';
  await room.save();
  if (room.bed) await Bed.findByIdAndUpdate(room.bed, { isActive: false, status: 'maintenance' });

  res.status(200).json({ success: true, message: 'Room deactivated' });
});
