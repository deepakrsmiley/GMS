const asyncHandler = require('../utils/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const ChangeRequest = require('../models/ChangeRequest');
const Medicine = require('../models/Medicine');
const Counter = require('../models/Counter');
const { logActivity } = require('../utils/activityLogger');
const { notifyRoles, notifyUser } = require('../utils/notify');
const { normalizeRole } = require('../utils/roles');
const { syncCurrentStock, normalizeBatchNumber } = require('../utils/pharmacyStockHelper');

const CATEGORY_LABELS = {
  medicine_edit: 'Medicine Edit',
  patient_data: 'Patient Data',
  billing: 'Billing',
  lab: 'Lab',
  ip_admission: 'IP Admission',
  pharmacy: 'Pharmacy',
  staff_access: 'Staff / Access',
  masters: 'Masters',
  other: 'Other',
};

/** Medicine-master fields that Approve & Apply can write */
const MEDICINE_APPLY_FIELDS = [
  'name', 'genericName', 'category', 'barcode',
  'sellingPrice', 'purchasePrice', 'gstPercent',
  'minimumStock', 'manufacturer', 'supplier',
];

/** Batch subdocument fields that Approve & Apply can write */
const BATCH_APPLY_FIELDS = [
  'batchNumber', 'expiryDate', 'quantity',
  'sellingPrice', 'purchasePrice', 'mrp', 'manufacturer',
];

const canReview = (user) => {
  const role = normalizeRole(user?.role);
  return role === 'Super Admin' || role === 'Admin';
};

const generateRequestNo = async () => {
  const seq = await Counter.getNextSeq('changeRequest');
  const y = new Date().getFullYear().toString().slice(-2);
  return `CR${y}${String(seq).padStart(5, '0')}`;
};

const populateRequest = (q) => q
  .populate('requestedBy', 'name email role')
  .populate('reviewedBy', 'name email role')
  .populate('medicine', 'name gstPercent sellingPrice purchasePrice genericName category batches');

const fmtBatchDate = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d);
  return dt.toISOString().slice(0, 10);
};

/** POST /api/change-requests — any authenticated staff */
exports.createChangeRequest = asyncHandler(async (req, res, next) => {
  const {
    category,
    title,
    whatIsWrong,
    requestedChange,
    reason,
    priority,
    medicine,
    medicineName,
    batchId,
    batchNumber,
    fieldChanges,
    relatedId,
    relatedModel,
  } = req.body;

  if (!whatIsWrong?.trim() || !requestedChange?.trim() || !reason?.trim()) {
    return next(new ErrorResponse('What is wrong, what should be changed, and reason are required', 400));
  }

  const cat = category || 'other';
  if (!CATEGORY_LABELS[cat]) {
    return next(new ErrorResponse('Invalid request category', 400));
  }

  let resolvedMedicineName = medicineName;
  let medId = medicine || undefined;
  let resolvedBatchId = batchId || undefined;
  let resolvedBatchNumber = batchNumber || undefined;

  if (cat === 'medicine_edit' && medId) {
    const med = await Medicine.findById(medId).select('name gstPercent sellingPrice purchasePrice batches');
    if (!med) return next(new ErrorResponse('Medicine not found', 404));
    resolvedMedicineName = resolvedMedicineName || med.name;

    if (resolvedBatchId) {
      const batch = med.batches.id(resolvedBatchId);
      if (!batch || batch.isDisposed) {
        return next(new ErrorResponse('Selected batch not found on this medicine', 404));
      }
      resolvedBatchNumber = batch.batchNumber;
    } else {
      resolvedBatchId = undefined;
      resolvedBatchNumber = undefined;
    }

    // Medicine-level pending blocks any new medicine_edit on this SKU
    const medLevelPending = await ChangeRequest.findOne({
      medicine: medId,
      category: 'medicine_edit',
      status: 'pending',
      $or: [{ batchId: null }, { batchId: { $exists: false } }],
    }).select('requestNumber');

    if (medLevelPending) {
      return next(new ErrorResponse(
        `Edit already locked — pending medicine request ${medLevelPending.requestNumber}. Wait for Super Admin.`,
        409,
      ));
    }

    if (resolvedBatchId) {
      const batchPending = await ChangeRequest.findOne({
        medicine: medId,
        batchId: resolvedBatchId,
        category: 'medicine_edit',
        status: 'pending',
      }).select('requestNumber batchNumber');
      if (batchPending) {
        return next(new ErrorResponse(
          `Batch "${batchPending.batchNumber || resolvedBatchNumber}" already has pending ${batchPending.requestNumber}.`,
          409,
        ));
      }
    }
  }

  const autoTitle = title?.trim()
    || (cat === 'medicine_edit'
      ? (resolvedBatchNumber
        ? `Batch edit: ${resolvedMedicineName || 'Unknown'} · ${resolvedBatchNumber}`
        : `Medicine edit: ${resolvedMedicineName || 'Unknown'}`)
      : `${CATEGORY_LABELS[cat]} request`);

  const doc = await ChangeRequest.create({
    requestNumber: await generateRequestNo(),
    category: cat,
    title: autoTitle,
    whatIsWrong: String(whatIsWrong).trim(),
    requestedChange: String(requestedChange).trim(),
    reason: String(reason).trim(),
    priority: priority || 'normal',
    medicine: medId,
    medicineName: resolvedMedicineName,
    batchId: resolvedBatchId,
    batchNumber: resolvedBatchNumber,
    fieldChanges: Array.isArray(fieldChanges)
      ? fieldChanges.filter((f) => f?.field && f?.requestedValue != null && String(f.requestedValue).trim() !== '')
      : [],
    relatedId,
    relatedModel,
    requestedBy: req.user._id,
    status: 'pending',
  });

  const populated = await populateRequest(ChangeRequest.findById(doc._id));

  await logActivity(req, {
    action: 'Change Request Created',
    module: 'Change Requests',
    description: `${req.user.name} raised ${populated.requestNumber}: ${populated.title}`,
    relatedId: populated._id,
    relatedModel: 'ChangeRequest',
    metadata: {
      category: populated.category,
      medicineName: populated.medicineName,
      batchNumber: populated.batchNumber,
      fieldChanges: populated.fieldChanges,
    },
  });

  try {
    await notifyRoles(req, {
      roles: ['Super Admin', 'Admin'],
      title: 'New change request',
      message: `${populated.requestNumber} — ${populated.title} (by ${req.user.name})`,
      type: 'system',
      link: '/change-requests',
      relatedId: populated._id,
      relatedModel: 'ChangeRequest',
      excludeUserId: req.user._id,
    });
  } catch (_) { /* ignore */ }

  res.status(201).json({ success: true, data: populated });
});

/** GET /api/change-requests — mine, or all if reviewer + ?scope=all */
exports.getChangeRequests = asyncHandler(async (req, res) => {
  const filter = {};
  const scope = req.query.scope || 'mine';
  const status = req.query.status;
  const category = req.query.category;

  if (scope === 'all' && canReview(req.user)) {
    // all requests
  } else if (scope === 'pending' && canReview(req.user)) {
    filter.status = 'pending';
  } else {
    filter.requestedBy = req.user._id;
  }

  if (status) filter.status = status;
  if (category) filter.category = category;

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 30));
  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    populateRequest(
      ChangeRequest.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    ),
    ChangeRequest.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    count: data.length,
    total,
    page,
    pages: Math.ceil(total / limit) || 1,
    data,
    canReview: canReview(req.user),
  });
});

/** GET /api/change-requests/:id */
exports.getChangeRequest = asyncHandler(async (req, res, next) => {
  const doc = await populateRequest(ChangeRequest.findById(req.params.id));
  if (!doc) return next(new ErrorResponse('Request not found', 404));

  const isOwner = String(doc.requestedBy?._id || doc.requestedBy) === String(req.user._id);
  if (!isOwner && !canReview(req.user)) {
    return next(new ErrorResponse('Not authorized to view this request', 403));
  }

  res.status(200).json({ success: true, data: doc });
});

/**
 * PUT /api/change-requests/:id/review
 * body: { decision: 'approve'|'reject'|'apply', reviewNotes, applyMedicine?: boolean }
 */
exports.reviewChangeRequest = asyncHandler(async (req, res, next) => {
  if (!canReview(req.user)) {
    return next(new ErrorResponse('Only Super Admin / Admin can review requests', 403));
  }

  const doc = await ChangeRequest.findById(req.params.id);
  if (!doc) return next(new ErrorResponse('Request not found', 404));
  if (doc.status !== 'pending') {
    return next(new ErrorResponse(`Request is already ${doc.status}`, 400));
  }

  const { decision, reviewNotes, applyMedicine } = req.body;
  if (!['approve', 'reject', 'apply'].includes(decision)) {
    return next(new ErrorResponse('decision must be approve, reject, or apply', 400));
  }

  doc.reviewedBy = req.user._id;
  doc.reviewedAt = new Date();
  doc.reviewNotes = reviewNotes || '';

  if (decision === 'reject') {
    doc.status = 'rejected';
  } else if (decision === 'apply' || (decision === 'approve' && applyMedicine)) {
    if (doc.category === 'medicine_edit' && doc.medicine && (doc.fieldChanges || []).length) {
      const medicine = await Medicine.findById(doc.medicine);
      if (!medicine) return next(new ErrorResponse('Linked medicine no longer exists', 404));

      const applied = {};

      if (doc.batchId) {
        const batch = medicine.batches.id(doc.batchId);
        if (!batch || batch.isDisposed) {
          return next(new ErrorResponse('Linked batch no longer exists', 404));
        }

        for (const fc of doc.fieldChanges) {
          if (!BATCH_APPLY_FIELDS.includes(fc.field)) continue;
          let val = fc.requestedValue;

          if (fc.field === 'expiryDate') {
            const d = new Date(val);
            if (Number.isNaN(d.getTime())) continue;
            batch.expiryDate = d;
            applied[fc.field] = fmtBatchDate(d);
            continue;
          }

          if (['sellingPrice', 'purchasePrice', 'mrp', 'quantity'].includes(fc.field)) {
            val = Number(val);
            if (Number.isNaN(val) || val < 0) continue;
            batch[fc.field] = val;
            applied[fc.field] = val;
            continue;
          }

          if (fc.field === 'batchNumber') {
            const nextNo = normalizeBatchNumber(val);
            if (!nextNo) continue;
            const clash = (medicine.batches || []).find(
              (b) => !b.isDisposed
                && String(b._id) !== String(batch._id)
                && normalizeBatchNumber(b.batchNumber).toLowerCase() === nextNo.toLowerCase(),
            );
            if (clash) {
              return next(new ErrorResponse(
                `Cannot apply — batch "${nextNo}" already exists on this medicine`,
                400,
              ));
            }
            batch.batchNumber = nextNo;
            doc.batchNumber = nextNo;
            applied.batchNumber = nextNo;
            continue;
          }

          batch[fc.field] = String(val).trim();
          applied[fc.field] = batch[fc.field];
        }

        syncCurrentStock(medicine);
        medicine.markModified('batches');
        await medicine.save();

        doc.status = 'applied';
        doc.appliedAt = new Date();
        doc.appliedChanges = { scope: 'batch', batchId: String(doc.batchId), batchNumber: batch.batchNumber, ...applied };

        await logActivity(req, {
          action: 'Batch Updated via Change Request',
          module: 'Pharmacy',
          description: `${req.user.name} applied ${doc.requestNumber} on batch ${batch.batchNumber} of "${medicine.name}"`,
          relatedId: medicine._id,
          relatedModel: 'Medicine',
          metadata: { changeRequestId: doc._id, applied: doc.appliedChanges },
        });
      } else {
        for (const fc of doc.fieldChanges) {
          if (!MEDICINE_APPLY_FIELDS.includes(fc.field)) continue;
          let val = fc.requestedValue;
          if (['sellingPrice', 'purchasePrice', 'gstPercent', 'minimumStock'].includes(fc.field)) {
            val = Number(val);
            if (Number.isNaN(val)) continue;
          }
          medicine[fc.field] = val;
          applied[fc.field] = val;
        }
        await medicine.save();
        doc.status = 'applied';
        doc.appliedAt = new Date();
        doc.appliedChanges = { scope: 'medicine', ...applied };

        await logActivity(req, {
          action: 'Medicine Updated via Change Request',
          module: 'Pharmacy',
          description: `${req.user.name} applied ${doc.requestNumber} on "${medicine.name}"`,
          relatedId: medicine._id,
          relatedModel: 'Medicine',
          metadata: { changeRequestId: doc._id, applied },
        });
      }
    } else {
      doc.status = 'approved';
    }
  } else {
    doc.status = 'approved';
  }

  await doc.save();
  const populated = await populateRequest(ChangeRequest.findById(doc._id));

  await logActivity(req, {
    action: `Change Request ${populated.status === 'rejected' ? 'Rejected' : populated.status === 'applied' ? 'Applied' : 'Approved'}`,
    module: 'Change Requests',
    description: `${req.user.name} ${populated.status} ${populated.requestNumber}: ${populated.title}`,
    relatedId: populated._id,
    relatedModel: 'ChangeRequest',
    metadata: {
      status: populated.status,
      reviewNotes: populated.reviewNotes,
      appliedChanges: populated.appliedChanges,
    },
  });

  try {
    const requesterId = populated.requestedBy?._id || populated.requestedBy;
    if (requesterId) {
      await notifyUser(req, {
        userId: requesterId,
        title: `Request ${populated.status}`,
        message: `${populated.requestNumber} was ${populated.status}${populated.reviewNotes ? `: ${populated.reviewNotes}` : ''}`,
        type: populated.status === 'rejected' ? 'warning' : 'success',
        link: '/change-requests',
        relatedId: populated._id,
        relatedModel: 'ChangeRequest',
      });
    }
  } catch (_) { /* ignore */ }

  res.status(200).json({ success: true, data: populated });
});

exports.CATEGORY_LABELS = CATEGORY_LABELS;

/**
 * GET /api/change-requests/medicine-locks
 * Pending medicine_edit locks — medicine-level and/or per-batch.
 */
exports.getPendingMedicineLocks = asyncHandler(async (req, res) => {
  const rows = await ChangeRequest.find({
    category: 'medicine_edit',
    status: 'pending',
    medicine: { $ne: null },
  })
    .select('requestNumber medicine medicineName batchId batchNumber createdAt requestedBy')
    .populate('requestedBy', 'name role')
    .lean();

  const data = rows.map((r) => ({
    medicineId: String(r.medicine),
    batchId: r.batchId ? String(r.batchId) : null,
    batchNumber: r.batchNumber || null,
    scope: r.batchId ? 'batch' : 'medicine',
    requestNumber: r.requestNumber,
    medicineName: r.medicineName,
    createdAt: r.createdAt,
    requestedBy: r.requestedBy,
  }));

  res.status(200).json({ success: true, count: data.length, data });
});
