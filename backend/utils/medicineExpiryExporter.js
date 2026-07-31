const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const { renderBrandingHeader } = require('./pdfBranding');
const brandingService = require('../services/brandingService');

// ────────────────────────────────────────────────────────────────────────────
// Medicine Expiry Report — PDF & Excel exporters
// New file for the Medicine Expiry Report module. Existing pharmacy report
// exporter (utils/pharmacyReportExporter.js) is untouched.
// ────────────────────────────────────────────────────────────────────────────

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN') : 'N/A');
const fmtDateTime = (d) => new Date(d).toLocaleString('en-IN');
const fmtCurrency = (n) => `Rs. ${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtCurrencyShort = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_LABELS = {
  expired: 'Expired',
  near_expiry: 'Near Expiry',
  expiring_soon: 'Expiring Soon',
  healthy: 'Healthy',
  zero_stock: 'Zero Stock',
  low_stock: 'Low Stock',
};

const daysRemainingLabel = (days) => {
  if (days === 0) return 'Expires Today';
  if (days === 1) return '1 Day Left';
  if (days > 1) return `${days} Days Left`;
  if (days === -1) return 'Expired Yesterday';
  return `Expired ${Math.abs(days)} Days Ago`;
};

const describeFilters = (filters = {}) => {
  const parts = [];
  if (filters.fromDate || filters.toDate) {
    parts.push(`Date Range: ${filters.fromDate ? fmtDate(filters.fromDate) : 'Any'} to ${filters.toDate ? fmtDate(filters.toDate) : 'Any'}`);
  }
  if (filters.status && filters.status !== 'all') parts.push(`Status: ${STATUS_LABELS[filters.status] || filters.status}`);
  if (filters.category) parts.push(`Category: ${filters.category}`);
  if (filters.manufacturer) parts.push(`Manufacturer: ${filters.manufacturer}`);
  if (filters.supplierName) parts.push(`Supplier: ${filters.supplierName}`);
  if (filters.batch) parts.push(`Batch: ${filters.batch}`);
  if (filters.search) parts.push(`Search: "${filters.search}"`);
  if (filters.groupBy && filters.groupBy !== 'none') parts.push(`Grouped By: ${filters.groupBy}`);
  return parts.length ? parts.join('   |   ') : 'All Medicines';
};

const COLUMNS = [
  { key: 'si', label: 'SI', width: 26 },
  { key: 'medicineName', label: 'Medicine Name', width: 110 },
  { key: 'genericName', label: 'Generic Name', width: 90 },
  { key: 'category', label: 'Category', width: 60 },
  { key: 'batchNumber', label: 'Batch No.', width: 65 },
  { key: 'manufacturer', label: 'Manufacturer', width: 85 },
  { key: 'supplierName', label: 'Supplier', width: 85 },
  { key: 'expiryDate', label: 'Expiry Date', width: 60 },
  { key: 'daysRemaining', label: 'Days Remaining', width: 75 },
  { key: 'purchaseRate', label: 'Purchase Rate', width: 65 },
  { key: 'mrp', label: 'MRP', width: 55 },
  { key: 'currentStock', label: 'Stock', width: 45 },
  { key: 'unit', label: 'Unit', width: 40 },
  { key: 'stockValue', label: 'Stock Value', width: 70 },
  { key: 'status', label: 'Status', width: 65 },
];

const rowCells = (row, si) => ({
  si,
  medicineName: row.medicineName,
  genericName: row.genericName || '-',
  category: row.category || '-',
  batchNumber: row.batchNumber || '-',
  manufacturer: row.manufacturer || '-',
  supplierName: row.supplierName || '-',
  expiryDate: fmtDate(row.expiryDate),
  daysRemaining: daysRemainingLabel(row.daysRemaining),
  purchaseRate: fmtCurrencyShort(row.purchaseRate),
  mrp: fmtCurrencyShort(row.mrp),
  currentStock: row.currentStock,
  unit: row.unit || 'Nos',
  stockValue: fmtCurrencyShort(row.stockValue),
  status: STATUS_LABELS[row.status] || row.status,
});

const STATUS_COLOR_HEX = {
  expired: '8B0000', // dark red
  near_expiry: 'D97706', // orange
  expiring_soon: 'CA8A04', // yellow/amber
  healthy: '16A34A', // green
  zero_stock: '6B7280', // gray
  low_stock: '9333EA', // purple
};

/**
 * Flattens either a grouped report ({ groups: [...] }) or a flat report
 * ({ rows: [...] }) into a single list of "sections" for rendering.
 * A flat (ungrouped) report renders as one section with no heading.
 */
function toSections(reportData) {
  if (reportData.groups) {
    return reportData.groups.map((g) => ({
      heading: String(g.groupName),
      medicines: g.medicines,
      totals: {
        totalMedicines: g.totalMedicines,
        totalStock: g.totalStock,
        totalStockValue: g.totalStockValue,
      },
    }));
  }
  return [{ heading: null, medicines: reportData.rows, totals: null }];
}

function computeGrandTotal(sections) {
  const grand = {
    totalCategories: sections.length,
    totalMedicines: 0,
    totalStock: 0,
    totalStockValue: 0,
    expiredCount: 0,
    nearExpiryCount: 0,
  };
  sections.forEach((s) => {
    s.medicines.forEach((m) => {
      grand.totalMedicines += 1;
      grand.totalStock += m.currentStock || 0;
      grand.totalStockValue += m.stockValue || 0;
      if (m.status === 'expired') grand.expiredCount += 1;
      if (m.status === 'near_expiry') grand.nearExpiryCount += 1;
    });
  });
  return grand;
}

// ── PDF EXPORT ───────────────────────────────────────────────────────────────
exports.exportExpiryPdf = async (reportData, { filters, generatedBy, res }) => {
  const branding = await brandingService.getBranding();
  const doc = new PDFDocument({ margin: 28, size: 'A4', layout: 'landscape', bufferPages: true });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename=medicine-expiry-report.pdf');
  doc.pipe(res);

  await renderBrandingHeader(doc, branding, { compact: true, title: 'Medicine Expiry Report' });

  const margin = doc.page.margins.left;
  const pageWidth = doc.page.width;
  const contentWidth = pageWidth - margin * 2;

  doc.fontSize(8).font('Helvetica').fillColor('#374151');
  doc.text(`Filters Applied: ${describeFilters(filters)}`, margin, doc.y, { width: contentWidth });
  const now = new Date();
  doc.text(
    `Generated: ${fmtDateTime(now)}   |   Generated By: ${generatedBy || 'System'}`,
    margin,
    doc.y + 2,
    { width: contentWidth },
  );
  doc.moveDown(0.6);
  doc.fillColor('#000');

  const sections = toSections(reportData);
  const grand = computeGrandTotal(sections);

  const totalWidthUnits = COLUMNS.reduce((s, c) => s + c.width, 0);
  const scale = contentWidth / totalWidthUnits;
  const colWidths = COLUMNS.map((c) => c.width * scale);

  const rowHeight = 16;
  let y = doc.y;

  const drawTableHeader = () => {
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#fff');
    doc.rect(margin, y, contentWidth, rowHeight).fill('#1e3a5f');
    let x = margin;
    COLUMNS.forEach((col, i) => {
      doc.fillColor('#fff').text(col.label, x + 3, y + 4, { width: colWidths[i] - 6 });
      x += colWidths[i];
    });
    y += rowHeight;
    doc.fillColor('#000');
  };

  const ensureSpace = (needed) => {
    if (y + needed > doc.page.height - doc.page.margins.bottom - 30) {
      doc.addPage();
      y = doc.page.margins.top;
      drawTableHeader();
    }
  };

  drawTableHeader();

  let rowIndex = 0;
  sections.forEach((section) => {
    if (section.heading) {
      ensureSpace(rowHeight + 4);
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#1e3a5f');
      doc.rect(margin, y, contentWidth, rowHeight + 2).fill('#e5edf5');
      doc.fillColor('#1e3a5f').text(section.heading.toUpperCase(), margin + 4, y + 4, { width: contentWidth - 8 });
      y += rowHeight + 2;
      doc.fillColor('#000');
    }

    section.medicines.forEach((m) => {
      ensureSpace(rowHeight);
      rowIndex += 1;
      if (rowIndex % 2 === 0) {
        doc.rect(margin, y, contentWidth, rowHeight).fill('#f8fafc');
      }
      const cells = rowCells(m, rowIndex);
      let x = margin;
      doc.font('Helvetica').fontSize(7).fillColor('#111827');
      COLUMNS.forEach((col, i) => {
        if (col.key === 'status') {
          doc.fillColor(`#${STATUS_COLOR_HEX[m.status] || '111827'}`).font('Helvetica-Bold');
        } else {
          doc.fillColor('#111827').font('Helvetica');
        }
        doc.text(String(cells[col.key]), x + 3, y + 4, { width: colWidths[i] - 6, ellipsis: true });
        x += colWidths[i];
      });
      // borders
      doc.strokeColor('#e2e8f0').lineWidth(0.5);
      doc.moveTo(margin, y + rowHeight).lineTo(margin + contentWidth, y + rowHeight).stroke();
      y += rowHeight;
    });

    if (section.totals) {
      ensureSpace(rowHeight + 2);
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#000');
      doc.rect(margin, y, contentWidth, rowHeight + 2).fill('#eef2ff');
      doc.fillColor('#1e3a5f').text(
        `Category Total  —  Medicines: ${section.totals.totalMedicines}   Stock: ${section.totals.totalStock}   Value: ${fmtCurrencyShort(section.totals.totalStockValue)}`,
        margin + 4,
        y + 4,
        { width: contentWidth - 8 },
      );
      y += rowHeight + 6;
      doc.fillColor('#000');
    }
  });

  // Grand total
  ensureSpace(rowHeight + 8);
  doc.font('Helvetica-Bold').fontSize(9);
  doc.rect(margin, y, contentWidth, rowHeight + 4).fill('#1e3a5f');
  doc.fillColor('#fff').text(
    `GRAND TOTAL  —  Categories: ${grand.totalCategories}   Medicines: ${grand.totalMedicines}   Stock: ${grand.totalStock}   Value: ${fmtCurrencyShort(grand.totalStockValue)}   Expired: ${grand.expiredCount}   Near Expiry: ${grand.nearExpiryCount}`,
    margin + 6,
    y + 5,
    { width: contentWidth - 12 },
  );
  doc.fillColor('#000');

  // Footer with page numbers on every buffered page
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    doc.fontSize(7).font('Helvetica').fillColor('#6b7280');
    doc.text(
      `Generated By: ${generatedBy || 'System'}   |   Printed: ${fmtDateTime(now)}`,
      margin,
      doc.page.height - doc.page.margins.bottom + 6,
      { width: contentWidth / 2 },
    );
    doc.text(
      `Page ${i - range.start + 1} of ${range.count}`,
      margin + contentWidth / 2,
      doc.page.height - doc.page.margins.bottom + 6,
      { width: contentWidth / 2, align: 'right' },
    );
  }

  doc.end();
};

// ── EXCEL EXPORT ─────────────────────────────────────────────────────────────
exports.exportExpiryExcel = async (reportData, { filters, generatedBy, res }) => {
  const branding = await brandingService.getBranding();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = branding.hospitalName;
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Medicine Expiry Report', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  });

  // ── Hospital header block ──
  const headerLines = [
    branding.hospitalName,
    [branding.address, branding.phone && `Ph: ${branding.phone}`, branding.gstNumber && `GST: ${branding.gstNumber}`].filter(Boolean).join('   |   '),
    'MEDICINE EXPIRY REPORT',
    `Filters Applied: ${describeFilters(filters)}`,
    `Generated: ${fmtDateTime(new Date())}   |   Generated By: ${generatedBy || 'System'}`,
  ];

  headerLines.forEach((line, idx) => {
    const row = sheet.addRow([line]);
    sheet.mergeCells(row.number, 1, row.number, COLUMNS.length);
    row.getCell(1).font = idx === 0
      ? { bold: true, size: 14 }
      : idx === 2 ? { bold: true, size: 12, color: { argb: 'FF1E3A5F' } } : { size: 9, italic: idx >= 3 };
    row.getCell(1).alignment = { horizontal: 'center' };
  });
  sheet.addRow([]);

  const headerRowIndex = sheet.lastRow.number + 1;
  const headerRow = sheet.addRow(COLUMNS.map((c) => c.label));
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' },
    };
  });

  // Freeze header (everything above + the column header row)
  sheet.views = [{ state: 'frozen', ySplit: headerRowIndex, xSplit: 0 }];

  // Auto width (column-by-column, doesn't touch existing row content/styles)
  COLUMNS.forEach((c, i) => {
    sheet.getColumn(i + 1).width = Math.max(10, Math.round(c.width / 5));
  });

  sheet.autoFilter = {
    from: { row: headerRowIndex, column: 1 },
    to: { row: headerRowIndex, column: COLUMNS.length },
  };

  const sections = toSections(reportData);
  const grand = computeGrandTotal(sections);
  let rowIndex = 0;

  const thinBorder = {
    top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  };

  sections.forEach((section) => {
    if (section.heading) {
      const hRow = sheet.addRow([section.heading.toUpperCase()]);
      sheet.mergeCells(hRow.number, 1, hRow.number, COLUMNS.length);
      hRow.getCell(1).font = { bold: true, color: { argb: 'FF1E3A5F' } };
      hRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5EDF5' } };
    }

    section.medicines.forEach((m) => {
      rowIndex += 1;
      const cells = rowCells(m, rowIndex);
      const dataRow = sheet.addRow(COLUMNS.map((c) => cells[c.key]));
      if (rowIndex % 2 === 0) {
        dataRow.eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        });
      }
      dataRow.eachCell((cell) => { cell.border = thinBorder; });
      const statusCell = dataRow.getCell(COLUMNS.length);
      statusCell.font = { bold: true, color: { argb: `FF${STATUS_COLOR_HEX[m.status] || '111827'}` } };
    });

    if (section.totals) {
      const tRow = sheet.addRow([
        `Category Total — Medicines: ${section.totals.totalMedicines}   Stock: ${section.totals.totalStock}   Value: ${fmtCurrencyShort(section.totals.totalStockValue)}`,
      ]);
      sheet.mergeCells(tRow.number, 1, tRow.number, COLUMNS.length);
      tRow.getCell(1).font = { bold: true };
      tRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2FF' } };
    }
  });

  const grandRow = sheet.addRow([
    `GRAND TOTAL — Categories: ${grand.totalCategories}   Medicines: ${grand.totalMedicines}   Stock: ${grand.totalStock}   Value: ${fmtCurrencyShort(grand.totalStockValue)}   Expired: ${grand.expiredCount}   Near Expiry: ${grand.nearExpiryCount}`,
  ]);
  sheet.mergeCells(grandRow.number, 1, grandRow.number, COLUMNS.length);
  grandRow.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  grandRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=medicine-expiry-report.xlsx');
  await workbook.xlsx.write(res);
  res.end();
};

exports.describeFilters = describeFilters;
exports.STATUS_LABELS = STATUS_LABELS;