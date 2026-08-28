const Patient = require('../models/Patient');
const OPRegistration = require('../models/OPRegistration');
const IPAdmission = require('../models/IPAdmission');
const LabTest = require('../models/LabTest');
const Prescription = require('../models/Prescription');
const Medicine = require('../models/Medicine');
const Bill = require('../models/Bill');
const Bed = require('../models/Bed');
const { EMERGENCY_SURCHARGE, resolveOpConsultationFee, resolveBilledConsultationFee } = require('../utils/opConsultationFee');
const { filterChargesForBillType, labBillableTestLines } = require('../utils/billingChargeRules');

const ADMISSION_FEE = 500;
const NURSING_CHARGE_PER_NOTE = 200;
const REGISTRATION_FEE = 100;
const DOCTOR_ROUND_FEE = 500;

const daysBetween = (start, end) => {
  const ms = Math.max(new Date(end) - new Date(start), 0);
  return Math.max(Math.ceil(ms / (1000 * 60 * 60 * 24)), 1);
};

const makeCharge = ({
  id, category, type, description, quantity, unitPrice, gstPercent = 0,
  referenceId, referenceModel, medicine, batch, batchNumber, meta = {},
}) => {
  const qty = Number(quantity) || 1;
  const price = Number(unitPrice) || 0;
  const gst = Number(gstPercent) || 0;
  const lineSubtotal = qty * price;
  const gstAmount = lineSubtotal * (gst / 100);
  const lot = batchNumber || batch;
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
    batch: lot || undefined,
    batchNumber: lot || undefined,
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
  const labMode = billType === 'lab';
  const opOnly = billType === 'op' || labMode || (billType === 'auto' && await isOpOnlyPatient(patientId));
  const includeIp = billType === 'ip' || (billType === 'auto' && !opOnly);

  const billedRefs = await getBilledReferenceIds(patientId);
  const charges = [];
  let primaryDoctor = null;
  let primaryDepartment = null;

  // ── OP Consultation ──
  const opVisits = await OPRegistration.find({
    patient: patientId,
    status: { $in: ['completed', 'consultation_completed', 'in_consultation', 'sent_to_pharmacy', 'pharmacy_completed', 'sent_to_lab', 'admitted', 'discharged'] },
    $or: [
      { bill: { $exists: false } },
      { bill: null },
      { 'serviceUsages.0': { $exists: true } },
    ],
  })
    .populate('doctor', 'name consultationFee followUpFee specialization')
    .populate('department', 'name consultationFee')
    .sort('-tokenDate');

  for (const op of opVisits) {
    const consultAlreadyBilled = isBilled(billedRefs, 'OPRegistration', op._id);

    if (!consultAlreadyBilled) {
    const isFollowUp = op.appointmentType === 'followup';
    const fee = resolveBilledConsultationFee(
      resolveOpConsultationFee(op.doctor, op.department, op.appointmentType),
      null,
      op.billedConsultationFee,
    );

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
    } // consultation line already billed at OP registration

    // ── OP equipment / procedure usage (ECG, Nebulizer, dressing, injections, etc.) ──
    // Logged via opController.addServiceUsage. Each entry is its own billable line,
    // keyed by its own subdocument _id, so re-generating a bill never double-charges
    // an entry that was already invoiced. Medicines are NOT included here - pharmacy
    // charges only enter the bill when a prescription is actually dispensed (below),
    // which stays a manual pharmacist action by design.
    const opServiceCategoryMap = {
      Equipment: 'Procedure',
      Procedure: 'Procedure',
      Nursing: 'Nursing',
      Injection: 'Procedure',
      Laboratory: 'Laboratory',
      Other: 'Miscellaneous',
    };
    for (const usage of op.serviceUsages || []) {
      if (isBilled(billedRefs, 'OPRegistration', usage._id)) continue;

      const unitLabel = usage.chargeType === 'per_hour' ? 'hr' : usage.chargeType === 'per_day' ? 'day' : 'use';
      charges.push(makeCharge({
        id: `op-service-${usage._id}`,
        category: opServiceCategoryMap[usage.category] || 'Procedure',
        type: 'procedure',
        description: `${usage.serviceName} × ${usage.quantity} ${unitLabel}(s)${usage.notes ? ` - ${usage.notes}` : ''} · Token ${op.tokenNumber || ''}`,
        quantity: usage.quantity,
        unitPrice: usage.unitPrice,
        referenceId: usage._id,
        referenceModel: 'OPRegistration',
        meta: {
          tokenNumber: op.tokenNumber,
          serviceName: usage.serviceName,
          chargeType: usage.chargeType,
          usedAt: usage.usedAt,
        },
      }));
    }
  }

  // ── IP Admission & Room Charges (only for admitted/discharged IP patients) ──
  const admissions = includeIp ? await IPAdmission.find({ patient: patientId })
    .populate('doctor', 'name consultationFee')
    .populate('department', 'name')
    .populate('bed', 'bedNumber type dailyRate')
    .populate('ward', 'name type')
    .populate('medications.medicine', 'name sellingPrice gstPercent')
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
      Laboratory: 'Laboratory',
      Other: 'Miscellaneous',
    };
    for (const usage of adm.serviceUsages || []) {
      if (isBilled(billedRefs, 'IPAdmission', usage._id)) continue;

      const unitLabel = usage.chargeType === 'per_hour' ? 'hr' : usage.chargeType === 'per_day' ? 'day' : 'use';
      const billCategory = serviceCategoryMap[usage.category] || 'Procedure';
      charges.push(makeCharge({
        id: `ip-service-${usage._id}`,
        category: billCategory,
        type: usage.category === 'Laboratory' ? 'lab' : 'procedure',
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

    // ── Pharmacy medicines given during this IP stay ──
    // Logged via ipController.addMedication (stock already deducted at that point).
    // Billed individually by subdocument _id so re-generating a bill mid-stay never
    // double-charges an entry that was already invoiced.
    for (const med of adm.medications || []) {
      if (isBilled(billedRefs, 'IPAdmission', med._id)) continue;

      const medDoc = med.medicine;
      const unitPrice = med.unitPrice || medDoc?.sellingPrice || 0;
      charges.push(makeCharge({
        id: `ip-medication-${med._id}`,
        category: 'Pharmacy',
        type: 'medicine',
        description: `${med.medicineName || medDoc?.name || 'Medicine'} ${med.dosage || ''} ${med.frequency || ''}`.trim(),
        quantity: med.quantity,
        unitPrice,
        gstPercent: med.gstPercent || medDoc?.gstPercent || 5,
        referenceId: med._id,
        referenceModel: 'IPAdmission',
        medicine: medDoc?._id,
        batchNumber: med.batchNumber,
        meta: {
          admissionNumber: adm.admissionNumber,
          administeredAt: med.administeredAt,
          route: med.route,
        },
      }));
    }
  }

  // ── Laboratory (bill as soon as the order is created, not only after results) ──
  const labTests = await LabTest.find({
    patient: patientId,
    status: { $nin: ['cancelled'] },
    ...notBilledFilter,
  })
    .populate('doctor', 'name')
    .sort('-createdAt');

  for (const lab of labTests) {
    if (isBilled(billedRefs, 'LabTest', lab._id)) continue;
    if (lab.ipAdmission && !includeIp) continue;

    const lines = labBillableTestLines(lab);
    lines.forEach((line, idx) => {
      charges.push(makeCharge({
        id: `lab-${lab._id}-${line.name || idx}`,
        category: line.category,
        type: line.type,
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        gstPercent: line.gstPercent,
        referenceId: lab._id,
        referenceModel: 'LabTest',
        meta: { labNumber: lab.labNumber, labStatus: lab.status },
      }));
    });
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
  if (!labMode && priorBills === 0 && !isBilled(billedRefs, 'Patient', patientId)) {
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

  const filteredCharges = filterChargesForBillType(
    charges.filter((c) => {
      if (c.amount <= 0) return false;
      if (opOnly && isIpCharge(c)) return false;
      return true;
    }),
    billType,
  );

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
  // Admitted (in-stay) + discharged-but-not-yet-billed IP admissions
  const admissions = await IPAdmission.find({
    status: { $in: ['admitted', 'discharged'] },
  })
    .populate('patient', 'patientId name phone age gender')
    .populate('doctor', 'name')
    .populate('department', 'name')
    .populate('bed', 'bedNumber type dailyRate')
    .sort('-admissionDate')
    .limit(100);

  const results = [];
  for (const adm of admissions) {
    // Broken / deleted patient refs must not crash the whole list
    if (!adm.patient?._id) continue;

    const billedRefs = await getBilledReferenceIds(adm.patient._id);
    const admissionAlreadyBilled = isBilled(billedRefs, 'IPAdmission', adm._id);

    // Discharged: only show if this admission is not yet billed
    // Admitted: always show so staff can preview usage & amount during stay
    if (adm.status === 'discharged' && admissionAlreadyBilled) continue;

    const endDate = adm.dischargeDate || new Date();
    const stayDays = daysBetween(adm.admissionDate, endDate);
    const dailyRate = adm.bed?.dailyRate || (adm.bed?.type === 'icu' ? 3000 : 500);
    const estimatedRoomCharges = stayDays * dailyRate;

    // Quick estimate of logged service usages (exact total comes from charges API on open)
    const serviceEstimate = (adm.serviceUsages || []).reduce((sum, u) => {
      if (isBilled(billedRefs, 'IPAdmission', u._id)) return sum;
      return sum + (Number(u.quantity) || 0) * (Number(u.unitPrice) || 0);
    }, 0);

    results.push({
      admissionId: adm._id,
      admissionNumber: adm.admissionNumber,
      patient: adm.patient,
      doctor: adm.doctor,
      department: adm.department,
      bed: adm.bed,
      admissionDate: adm.admissionDate,
      dischargeDate: adm.dischargeDate || null,
      stayDays,
      estimatedRoomCharges,
      estimatedServiceCharges: serviceEstimate,
      estimatedTotal: estimatedRoomCharges + (admissionAlreadyBilled ? 0 : ADMISSION_FEE) + serviceEstimate,
      admissionBilled: admissionAlreadyBilled,
      status: adm.status === 'admitted' ? 'admitted' : 'pending_billing',
      admissionStatus: adm.status,
    });
  }

  // Admitted first, then discharged pending billing
  results.sort((a, b) => {
    if (a.admissionStatus !== b.admissionStatus) {
      return a.admissionStatus === 'admitted' ? -1 : 1;
    }
    return new Date(b.admissionDate) - new Date(a.admissionDate);
  });

  return results;
};

exports.filterChargesForBillType = filterChargesForBillType;
exports.labBillableTestLines = labBillableTestLines;

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

  const bill = billId ? await Bill.findById(billId).select('billType').lean() : null;
  // Reception consult slip lives on OPRegistration.bill. Pharmacy/lab bills
  // also tag OPRegistration on some lines — never overwrite that pointer.
  const setOpBill = bill?.billType === 'op';

  await Promise.all([
    setOpBill && opIds.size && OPRegistration.updateMany({ _id: { $in: [...opIds] } }, { bill: billId }),
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
    opIds.length && billId && OPRegistration.updateMany({ _id: { $in: opIds }, bill: billId }, { $unset: { bill: 1 } }),
    labIds.length && LabTest.updateMany({ _id: { $in: labIds } }, { $unset: { bill: 1 } }),
    rxIds.length && Prescription.updateMany({ _id: { $in: rxIds } }, { $unset: { bill: 1 } }),
  ];
  if (ipIds.length && billId) {
    updates.push(IPAdmission.updateMany({ _id: { $in: ipIds } }, { $pull: { bills: billId } }));
  }
  await Promise.all(updates.filter(Boolean));
};