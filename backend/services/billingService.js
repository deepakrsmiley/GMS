const Patient = require('../models/Patient');
const OPRegistration = require('../models/OPRegistration');
const IPAdmission = require('../models/IPAdmission');
const LabTest = require('../models/LabTest');
const Prescription = require('../models/Prescription');
const Medicine = require('../models/Medicine');
const Bill = require('../models/Bill');
const Bed = require('../models/Bed');

const ADMISSION_FEE = 500;
const NURSING_CHARGE_PER_NOTE = 200;
const REGISTRATION_FEE = 100;
const EMERGENCY_SURCHARGE = 300;
const DOCTOR_ROUND_FEE = 500;

const daysBetween = (start, end) => {
  const ms = Math.max(new Date(end) - new Date(start), 0);
  return Math.max(Math.ceil(ms / (1000 * 60 * 60 * 24)), 1);
};

const makeCharge = ({
  id, category, type, description, quantity, unitPrice, gstPercent = 0,
  referenceId, referenceModel, medicine, meta = {},
}) => {
  const qty = Number(quantity) || 1;
  const price = Number(unitPrice) || 0;
  const gst = Number(gstPercent) || 0;
  const lineSubtotal = qty * price;
  const gstAmount = lineSubtotal * (gst / 100);
  return {
    id,
    category,
    type,
    description,
    quantity: qty,
    unitPrice: price,
    gstPercent: gst,
    gstAmount,
    amount: lineSubtotal + gstAmount,
    referenceId,
    referenceModel,
    medicine: medicine || undefined,
    meta,
    included: true,
  };
};

const getBilledReferenceIds = async (patientId) => {
  const bills = await Bill.find({
    patient: patientId,
    status: { $nin: ['cancelled', 'refunded'] },
  }).select('items.referenceId items.referenceModel');

  const refs = new Set();
  bills.forEach((bill) => {
    bill.items.forEach((item) => {
      if (item.referenceId) refs.add(`${item.referenceModel}:${item.referenceId}`);
    });
  });
  return refs;
};

const isBilled = (refs, model, id) => refs.has(`${model}:${id}`);

const notBilledFilter = { $or: [{ bill: { $exists: false } }, { bill: null }] };

const IP_CHARGE_TYPES = new Set(['admission', 'room', 'nursing', 'procedure']);
const IP_CHARGE_CATEGORIES = new Set(['Admission', 'Room', 'Procedure', 'Nursing']);

const isIpCharge = (charge) =>
  IP_CHARGE_TYPES.has(charge.type)
  || IP_CHARGE_CATEGORIES.has(charge.category)
  || (charge.type === 'procedure' && charge.id?.startsWith('ip-'));

const isOpOnlyPatient = async (patientId) => {
  const ipCount = await IPAdmission.countDocuments({ patient: patientId });
  return ipCount === 0;
};

exports.getPatientBillableCharges = async (patientId, options = {}) => {
  const patient = await Patient.findById(patientId).select('patientId name age gender phone email');
  if (!patient) return null;

  const billType = options.billType || 'auto';
  const opOnly = billType === 'op' || (billType === 'auto' && await isOpOnlyPatient(patientId));
  const includeIp = billType === 'ip' || (billType === 'auto' && !opOnly);

  const billedRefs = await getBilledReferenceIds(patientId);
  const charges = [];
  let primaryDoctor = null;
  let primaryDepartment = null;

  // ── OP Consultation ──
  const opVisits = await OPRegistration.find({
    patient: patientId,
    status: { $in: ['completed', 'consultation_completed', 'in_consultation', 'sent_to_pharmacy', 'pharmacy_completed', 'sent_to_lab', 'admitted', 'discharged'] },
    ...notBilledFilter,
  })
    .populate('doctor', 'name consultationFee specialization')
    .populate('department', 'name consultationFee')
    .sort('-tokenDate');

  for (const op of opVisits) {
    if (isBilled(billedRefs, 'OPRegistration', op._id)) continue;

    const isFollowUp = op.appointmentType === 'followup';
    const baseFee = op.doctor?.consultationFee || op.department?.consultationFee || 300;
    const fee = isFollowUp ? Math.round(baseFee * 0.5) : baseFee;

    if (!primaryDoctor && op.doctor) primaryDoctor = op.doctor;
    if (!primaryDepartment && op.department) primaryDepartment = op.department;

    charges.push(makeCharge({
      id: `op-consult-${op._id}`,
      category: 'Consultation',
      type: 'consultation',
      description: `${isFollowUp ? 'Follow-up' : 'Consultation'} - Dr. ${op.doctor?.name || 'N/A'} (${op.department?.name || 'OPD'}) · Token ${op.tokenNumber || ''}`,
      quantity: 1,
      unitPrice: fee,
      referenceId: op._id,
      referenceModel: 'OPRegistration',
      meta: { tokenDate: op.tokenDate, appointmentType: op.appointmentType },
    }));

    if (op.appointmentType === 'emergency') {
      charges.push(makeCharge({
        id: `op-emergency-${op._id}`,
        category: 'Procedure',
        type: 'procedure',
        description: `Emergency consultation surcharge - Token ${op.tokenNumber || ''}`,
        quantity: 1,
        unitPrice: EMERGENCY_SURCHARGE,
        referenceId: op._id,
        referenceModel: 'OPRegistration',
      }));
    }
  }

  // ── IP Admission & Room Charges (only for admitted/discharged IP patients) ──
  const admissions = includeIp ? await IPAdmission.find({ patient: patientId })
    .populate('doctor', 'name consultationFee')
    .populate('department', 'name')
    .populate('bed', 'bedNumber type dailyRate')
    .populate('ward', 'name type')
    .sort('-admissionDate') : [];

  for (const adm of admissions) {
    const admBilled = isBilled(billedRefs, 'IPAdmission', adm._id);
    const endDate = adm.dischargeDate || new Date();
    const stayDays = daysBetween(adm.admissionDate, endDate);
    const dailyRate = adm.bed?.dailyRate || (adm.bed?.type === 'icu' ? 3000 : 500);

    if (!primaryDoctor && adm.doctor) primaryDoctor = adm.doctor;
    if (!primaryDepartment && adm.department) primaryDepartment = adm.department;

    if (!admBilled) {
      charges.push(makeCharge({
        id: `ip-admission-${adm._id}`,
        category: 'Admission',
        type: 'admission',
        description: `Admission charges - ${adm.admissionNumber} (${adm.department?.name || 'IPD'})`,
        quantity: 1,
        unitPrice: ADMISSION_FEE,
        referenceId: adm._id,
        referenceModel: 'IPAdmission',
        meta: { admissionNumber: adm.admissionNumber, status: adm.status },
      }));

      charges.push(makeCharge({
        id: `ip-room-${adm._id}`,
        category: 'Room',
        type: 'room',
        description: `Room/Bed charges - ${adm.bed?.bedNumber || 'N/A'} (${adm.bed?.type || 'general'}) × ${stayDays} day(s)`,
        quantity: stayDays,
        unitPrice: dailyRate,
        referenceId: adm._id,
        referenceModel: 'IPAdmission',
        meta: { stayDays, bedType: adm.bed?.type, status: adm.status },
      }));

      if (adm.bed?.type === 'icu') {
        charges.push(makeCharge({
          id: `ip-icu-${adm._id}`,
          category: 'Procedure',
          type: 'procedure',
          description: `ICU monitoring charges - ${stayDays} day(s)`,
          quantity: stayDays,
          unitPrice: 1500,
          referenceId: adm._id,
          referenceModel: 'IPAdmission',
        }));
      }

      const nursingCount = adm.nursingNotes?.length || 0;
      if (nursingCount > 0) {
        charges.push(makeCharge({
          id: `ip-nursing-${adm._id}`,
          category: 'Procedure',
          type: 'nursing',
          description: `Nursing care charges - ${nursingCount} note(s)`,
          quantity: nursingCount,
          unitPrice: NURSING_CHARGE_PER_NOTE,
          referenceId: adm._id,
          referenceModel: 'IPAdmission',
        }));
      }

      const roundCount = adm.doctorRounds?.length || 0;
      if (roundCount > 0) {
        charges.push(makeCharge({
          id: `ip-rounds-${adm._id}`,
          category: 'Consultation',
          type: 'consultation',
          description: `Doctor round charges - Dr. ${adm.doctor?.name || 'N/A'} × ${roundCount}`,
          quantity: roundCount,
          unitPrice: DOCTOR_ROUND_FEE,
          referenceId: adm._id,
          referenceModel: 'IPAdmission',
        }));
      }
    }

    // ── Bedside services / equipment usage (Nebulizer, Ventilator, O2, Injections, etc.) ──
    // Each entry is its own billable line, keyed by its own subdocument _id so it is
    // only pulled into a bill once, no matter how many times billing is generated
    // during the stay.
    const serviceCategoryMap = {
      Equipment: 'Procedure',
      Procedure: 'Procedure',
      Nursing: 'Nursing',
      Injection: 'Procedure',
      Other: 'Miscellaneous',
    };
    for (const usage of adm.serviceUsages || []) {
      if (isBilled(billedRefs, 'IPAdmission', usage._id)) continue;

      const unitLabel = usage.chargeType === 'per_hour' ? 'hr' : usage.chargeType === 'per_day' ? 'day' : 'use';
      charges.push(makeCharge({
        id: `ip-service-${usage._id}`,
        category: serviceCategoryMap[usage.category] || 'Procedure',
        type: usage.category === 'Injection' ? 'procedure' : 'procedure',
        description: `${usage.serviceName} × ${usage.quantity} ${unitLabel}(s)${usage.notes ? ` - ${usage.notes}` : ''}`,
        quantity: usage.quantity,
        unitPrice: usage.unitPrice,
        referenceId: usage._id,
        referenceModel: 'IPAdmission',
        meta: {
          admissionNumber: adm.admissionNumber,
          serviceName: usage.serviceName,
          chargeType: usage.chargeType,
          usedAt: usage.usedAt,
        },
      }));
    }
  }

  // ── Laboratory (completed tests with results only) ──
  const labTests = await LabTest.find({
    patient: patientId,
    status: 'completed',
    ...notBilledFilter,
  })
    .populate('doctor', 'name')
    .sort('-createdAt');

  for (const lab of labTests) {
    if (isBilled(billedRefs, 'LabTest', lab._id)) continue;

    const hasResults = (lab.results?.length > 0) || lab.status === 'completed';
    if (!hasResults) continue;

    if (lab.tests?.length) {
      for (const test of lab.tests) {
        if (test.status === 'cancelled') continue;
        if ((test.price || 0) <= 0) continue;
        charges.push(makeCharge({
          id: `lab-${lab._id}-${test.testName}`,
          category: 'Laboratory',
          type: 'lab',
          description: `Lab: ${test.testName} (${lab.labNumber || ''})`,
          quantity: 1,
          unitPrice: test.price || 0,
          referenceId: lab._id,
          referenceModel: 'LabTest',
          meta: { labNumber: lab.labNumber, testStatus: test.status, labStatus: lab.status },
        }));
      }
    } else if (lab.totalAmount > 0) {
      charges.push(makeCharge({
        id: `lab-${lab._id}`,
        category: 'Laboratory',
        type: 'lab',
        description: `Lab tests (${lab.labNumber || ''})`,
        quantity: 1,
        unitPrice: lab.totalAmount,
        referenceId: lab._id,
        referenceModel: 'LabTest',
        meta: { labNumber: lab.labNumber, labStatus: lab.status },
      }));
    }
  }

  // ── Pharmacy (dispensed prescriptions) ──
  const prescriptions = await Prescription.find({
    patient: patientId,
    status: { $in: ['dispensed', 'partially_dispensed'] },
    ...notBilledFilter,
  })
    .populate('doctor', 'name')
    .populate('medicines.medicine', 'name sellingPrice gstPercent')
    .sort('-dispensedAt');

  for (const rx of prescriptions) {
    if (isBilled(billedRefs, 'Prescription', rx._id)) continue;

    for (const item of rx.medicines) {
      if (!item.dispensed) continue;
      const med = item.medicine;
      const unitPrice = med?.sellingPrice || 0;
      const qty = item.quantity || 1;
      charges.push(makeCharge({
        id: `rx-${rx._id}-${item._id}`,
        category: 'Pharmacy',
        type: 'medicine',
        description: `${item.medicineName || med?.name || 'Medicine'} ${item.dosage || ''} ${item.frequency || ''}`.trim(),
        quantity: qty,
        unitPrice,
        gstPercent: med?.gstPercent || 5,
        referenceId: rx._id,
        referenceModel: 'Prescription',
        medicine: med?._id,
        meta: { prescriptionId: rx._id, dispensedAt: rx.dispensedAt },
      }));
    }
  }

  // ── Registration fee (first-time, no prior bills) ──
  const priorBills = await Bill.countDocuments({
    patient: patientId,
    status: { $nin: ['cancelled', 'refunded'] },
  });
  if (priorBills === 0 && !isBilled(billedRefs, 'Patient', patientId)) {
    charges.push(makeCharge({
      id: `reg-${patientId}`,
      category: 'Miscellaneous',
      type: 'other',
      description: 'Patient registration fee',
      quantity: 1,
      unitPrice: REGISTRATION_FEE,
      referenceId: patientId,
      referenceModel: 'Patient',
    }));
  }

  const filteredCharges = charges.filter((c) => {
    if (c.amount <= 0) return false;
    if (opOnly && isIpCharge(c)) return false;
    return true;
  });

  const summary = filteredCharges.reduce((acc, c) => {
    const key = c.category.toLowerCase();
    acc[key] = (acc[key] || 0) + c.amount;
    acc.total = (acc.total || 0) + c.amount;
    return acc;
  }, {});

  const categoriesUsed = [...new Set(filteredCharges.map((c) => c.category))];

  return {
    patient,
    doctor: primaryDoctor,
    department: primaryDepartment,
    charges: filteredCharges,
    summary,
    chargeCount: filteredCharges.length,
    patientType: opOnly ? 'op' : 'ip',
    categoriesUsed,
  };
};

exports.getPendingDischargeBilling = async () => {
  const discharged = await IPAdmission.find({ status: 'discharged' })
    .populate('patient', 'patientId name phone age gender')
    .populate('doctor', 'name')
    .populate('department', 'name')
    .populate('bed', 'bedNumber type dailyRate')
    .sort('-dischargeDate')
    .limit(50);

  const results = [];
  for (const adm of discharged) {
    const billedRefs = await getBilledReferenceIds(adm.patient._id);
    if (!isBilled(billedRefs, 'IPAdmission', adm._id)) {
      const stayDays = daysBetween(adm.admissionDate, adm.dischargeDate);
      results.push({
        admissionId: adm._id,
        admissionNumber: adm.admissionNumber,
        patient: adm.patient,
        doctor: adm.doctor,
        department: adm.department,
        bed: adm.bed,
        admissionDate: adm.admissionDate,
        dischargeDate: adm.dischargeDate,
        stayDays,
        estimatedRoomCharges: stayDays * (adm.bed?.dailyRate || 500),
        status: 'pending_billing',
      });
    }
  }
  return results;
};

exports.markSourcesAsBilled = async (items, billId) => {
  const opIds = new Set();
  const ipIds = new Set();
  const labIds = new Set();
  const rxIds = new Set();

  items.forEach((item) => {
    if (!item.referenceId || !item.referenceModel) return;
    const id = item.referenceId;
    switch (item.referenceModel) {
      case 'OPRegistration': opIds.add(String(id)); break;
      case 'IPAdmission': ipIds.add(String(id)); break;
      case 'LabTest': labIds.add(String(id)); break;
      case 'Prescription': rxIds.add(String(id)); break;
      default: break;
    }
  });

  await Promise.all([
    opIds.size && OPRegistration.updateMany({ _id: { $in: [...opIds] } }, { bill: billId }),
    labIds.size && LabTest.updateMany({ _id: { $in: [...labIds] } }, { bill: billId }),
    rxIds.size && Prescription.updateMany({ _id: { $in: [...rxIds] } }, { bill: billId }),
    ipIds.size && IPAdmission.updateMany({ _id: { $in: [...ipIds] } }, { $addToSet: { bills: billId } }),
  ]);
};

exports.unmarkSourcesAsBilled = async (items, billId) => {
  const opIds = [];
  const labIds = [];
  const rxIds = [];
  const ipIds = [];

  items.forEach((item) => {
    if (!item.referenceId || !item.referenceModel) return;
    switch (item.referenceModel) {
      case 'OPRegistration': opIds.push(item.referenceId); break;
      case 'IPAdmission': ipIds.push(item.referenceId); break;
      case 'LabTest': labIds.push(item.referenceId); break;
      case 'Prescription': rxIds.push(item.referenceId); break;
      default: break;
    }
  });

  const updates = [
    opIds.length && OPRegistration.updateMany({ _id: { $in: opIds } }, { $unset: { bill: 1 } }),
    labIds.length && LabTest.updateMany({ _id: { $in: labIds } }, { $unset: { bill: 1 } }),
    rxIds.length && Prescription.updateMany({ _id: { $in: rxIds } }, { $unset: { bill: 1 } }),
  ];
  if (ipIds.length && billId) {
    updates.push(IPAdmission.updateMany({ _id: { $in: ipIds } }, { $pull: { bills: billId } }));
  }
  await Promise.all(updates.filter(Boolean));
};
