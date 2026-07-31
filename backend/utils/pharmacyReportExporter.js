const PDFDocument = require('pdfkit');
const XLSX = require('xlsx');

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN') : 'N/A');
const fmtCurrency = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

const rowToCells = (row, reportType) => {
  switch (reportType) {
    case 'low-stock':
      return [row.medicineName, row.currentStock, row.minimumStock, row.supplier?.name || 'N/A', fmtDate(row.lastPurchaseDate)];
    case 'out-of-stock':
      return [row.medicineName, row.lastSupplier?.name || 'N/A', fmtDate(row.lastPurchaseDate), row.averageMonthlyUsage];
    case 'expiry':
      return [row.medicineName, row.batchNumber, fmtDate(row.expiryDate), row.remainingDays, row.quantity];
    case 'expired':
      return [row.medicineName, row.batchNumber, fmtDate(row.expiryDate), row.quantity, fmtCurrency(row.stockValue)];
    case 'valuation':
      return [row.medicineName, row.currentStock, fmtCurrency(row.unitPrice), fmtCurrency(row.stockValue), row.supplier || 'N/A'];
    case 'supplier-purchase':
      return [fmtDate(row.transactionDate), row.medicineName, row.batchNumber || '', row.quantityChanged, fmtCurrency(row.totalValue), row.supplier?.name || 'N/A', row.addedBy?.name || ''];
    case 'dispensing':
      return [fmtDate(row.transactionDate), row.medicineName, Math.abs(row.quantityChanged), fmtCurrency(row.totalValue), row.addedBy?.name || ''];
    case 'stock-movement':
      return [fmtDate(row.transactionDate), row.medicineName, row.type, row.quantityBefore, row.quantityAfter, row.quantityChanged, row.addedBy?.name || '', row.remarks || ''];
    default:
      return Object.values(row).map(String);
  }
};

const getHeaders = (reportType) => {
  const headers = {
    'low-stock': ['Medicine', 'Current Stock', 'Minimum Stock', 'Supplier', 'Last Purchase'],
    'out-of-stock': ['Medicine', 'Last Supplier', 'Last Purchase', 'Avg Monthly Usage'],
    expiry: ['Medicine', 'Batch', 'Expiry Date', 'Days Remaining', 'Quantity'],
    expired: ['Medicine', 'Batch', 'Expiry Date', 'Quantity', 'Stock Value'],
    valuation: ['Medicine', 'Stock', 'Unit Price', 'Stock Value', 'Supplier'],
    'supplier-purchase': ['Date', 'Medicine', 'Batch', 'Qty', 'Value', 'Supplier', 'Added By'],
    dispensing: ['Date', 'Medicine', 'Qty Dispensed', 'Value', 'By'],
    'stock-movement': ['Date', 'Medicine', 'Type', 'Qty Before', 'Qty After', 'Change', 'By', 'Remarks'],
  };
  return headers[reportType] || ['Data'];
};

exports.exportExcel = (reportType, reportData, res) => {
  const headers = getHeaders(reportType);
  const rows = (reportData.rows || []).map((row) => rowToCells(row, reportType));
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Report');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=${reportType}-report.xlsx`);
  res.send(buffer);
};

exports.exportPdf = (reportType, reportData, res) => {
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=${reportType}-report.pdf`);
  doc.pipe(res);

  doc.fontSize(16).font('Helvetica-Bold').text(reportData.title || 'Pharmacy Report', { align: 'center' });
  doc.fontSize(9).font('Helvetica').text(`Generated: ${new Date().toLocaleString('en-IN')}`, { align: 'center' });
  doc.moveDown(1);

  const headers = getHeaders(reportType);
  const colWidth = (doc.page.width - 80) / headers.length;

  let y = doc.y;
  doc.font('Helvetica-Bold').fontSize(8);
  headers.forEach((h, i) => doc.text(h, 40 + i * colWidth, y, { width: colWidth - 4 }));
  y += 16;
  doc.moveTo(40, y).lineTo(doc.page.width - 40, y).stroke();
  y += 6;

  doc.font('Helvetica').fontSize(7.5);
  (reportData.rows || []).forEach((row) => {
    if (y > doc.page.height - 60) {
      doc.addPage();
      y = 40;
    }
    const cells = rowToCells(row, reportType);
    cells.forEach((cell, i) => doc.text(String(cell), 40 + i * colWidth, y, { width: colWidth - 4 }));
    y += 14;
  });

  doc.end();
};
