const Ward = require('../models/Ward');
const Bed = require('../models/Bed');
const Room = require('../models/Room');

const syncWardCounters = async (wardId) => {
  if (!wardId) return;
  const beds = await Bed.find({ ward: wardId, isActive: { $ne: false } });
  const totalBeds = beds.length;
  const availableBeds = beds.filter((b) => b.status === 'available').length;
  await Ward.findByIdAndUpdate(wardId, { totalBeds, availableBeds });
};

const occupyBedAndRoom = async ({ bedId, roomId, patientId, admissionId }) => {
  const updates = { status: 'occupied', currentPatient: patientId, currentAdmission: admissionId };
  if (bedId) {
    const bed = await Bed.findByIdAndUpdate(bedId, updates, { new: true });
    if (bed?.room) {
      await Room.findByIdAndUpdate(bed.room, {
        status: 'occupied',
        currentPatient: patientId,
        currentAdmission: admissionId,
        admissionDate: new Date(),
      });
    }
    if (bed?.ward) await syncWardCounters(bed.ward);
    return bed;
  }
  if (roomId) {
    const room = await Room.findById(roomId).populate('bed');
    if (!room) return null;
    await Room.findByIdAndUpdate(roomId, {
      status: 'occupied',
      currentPatient: patientId,
      currentAdmission: admissionId,
      admissionDate: new Date(),
    });
    if (room.bed) {
      await Bed.findByIdAndUpdate(room.bed, updates);
      const bed = await Bed.findById(room.bed);
      if (bed?.ward) await syncWardCounters(bed.ward);
      return bed;
    }
  }
  return null;
};

const releaseBedAndRoom = async ({ bedId, roomId }) => {
  const release = { status: 'available', currentPatient: null, currentAdmission: null };
  let wardId = null;

  if (bedId) {
    const bed = await Bed.findByIdAndUpdate(bedId, release, { new: true });
    wardId = bed?.ward;
    if (bed?.room) await Room.findByIdAndUpdate(bed.room, { ...release, admissionDate: null });
  }
  if (roomId) {
    const room = await Room.findByIdAndUpdate(roomId, { ...release, admissionDate: null }, { new: true });
    if (room?.bed) {
      const bed = await Bed.findByIdAndUpdate(room.bed, release, { new: true });
      wardId = bed?.ward || wardId;
    }
  }
  if (wardId) await syncWardCounters(wardId);
};

module.exports = { syncWardCounters, occupyBedAndRoom, releaseBedAndRoom };
