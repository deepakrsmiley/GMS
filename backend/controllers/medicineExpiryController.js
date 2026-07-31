const asyncHandler = require('../utils/asyncHandler');
const expiryService = require('../services/medicineExpiryService');
const { exportExpiryPdf, exportExpiryExcel } = require('../utils/medicineExpiryExporter');
const ActivityLog = require('../models/ActivityLog');
const Supplier = require('../models/Supplier');

// ────────────────────────────────────────────────────────────────────────────
// Medicine Expiry Report controller
// New controller — does not touch any existing pharmacy/inventory endpoints.
// Menu: Inventory → Pharmacy → Medicine Expiry Report
// ────────────────────────────────────────────────────────────────────────────

const pickFilters = (query) => ({
  fromDate: query.fromDate || undefined,
  toDate: query.toDate || undefined,
  category: query.category || undefined,
  supplier: query.supplier || undefined,
  manufacturer: query.manufacturer || undefined,
  batch: query.batch || undefined,
  status: query.status || undefined,
  search: query.search || undefined,
  sort: query.sort || undefined,
  groupBy: query.groupBy || undefined,
  page: query.page,
  limit: query.limit,
});

// GET /api/pharmacy/expiry-report
exports.getExpiryReport = asyncHandler(async (req, res) => {
  const filters = pickFilters(req.query);

  const [summary, report] = await Promise.all([
    expiryService.getSummary(filters),
    filters.groupBy && filters.groupBy !== 'none'
      ? expiryService.getGroupedReport(filters)
      : expiryService.getFlatReport(filters),
  ]);

  res.status(200).json({
    success: true,
    summary,
    ...report,
  });
});

// GET /api/pharmacy/expiry-report/meta
exports.getExpiryReportMeta = asyncHandler(async (req, res) => {
  const meta = await expiryService.getFilterMeta();
  res.status(200).json({ success: true, data: meta });
});

// GET /api/pharmacy/expiry-report/export?format=pdf|excel
exports.exportExpiryReport = asyncHandler(async (req, res) => {
  const filters = pickFilters(req.query);
  const format = (req.query.format || 'pdf').toLowerCase();

  // Export always uses the fully grouped, alphabetically-sorted dataset so
  // category totals & grand totals are accurate — even if the on-screen
  // grid is currently showing "No Group" / a single page.
  const report = await expiryService.getGroupedReport({
    ...filters,
    groupBy: filters.groupBy && filters.groupBy !== 'none' ? filters.groupBy : 'category',
  });

  // Resolve supplier name for the filter summary line on the PDF/Excel, if filtered by supplier
  let supplierName;
  if (filters.supplier) {
    const s = await Supplier.findById(filters.supplier).select('name').lean();
    supplierName = s?.name;
  }

  const exportMeta = {
    filters: { ...filters, supplierName },
    generatedBy: req.user?.name,
    res,
  };

  // Audit log — user, role, date/time, IP, export type & applied filters
  ActivityLog.create({
    user: req.user._id,
    action: `EXPORT_${format.toUpperCase()}`,
    module: 'Pharmacy-MedicineExpiryReport',
    description: `Medicine Expiry Report exported as ${format.toUpperCase()}`,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    metadata: { role: req.user.role, exportType: format, filters },
  }).catch(() => { /* audit logging must never block the export */ });

  if (format === 'excel' || format === 'xlsx') {
    return exportExpiryExcel(report, exportMeta);
  }
  return exportExpiryPdf(report, exportMeta);
});