const PDFDocument = require('pdfkit');
const { fetchImageBuffer } = require('./pdfBranding');
const brandingService = require('../services/brandingService');

const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = 45;
const CONTENT_WIDTH = PAGE.width - MARGIN * 2;
const BOTTOM_LIMIT = PAGE.height - 70;
const BLUE = '#1e40af';
const BLUE_LIGHT = '#eff6ff';
const BLUE_BORDER = '#bfdbfe';
const TEXT_DARK = '#1e3a5f';
const TEXT_MUTED = '#64748b';

const CATEGORY_LABELS = {
  Consultation: 'Consultation',
  Pharmacy: 'Pharmacy Charges',
  Laboratory: 'Lab Charges',
  Admission: 'Admission',
  Room: 'Room Charges',
  ICU: 'ICU Charges',
  Procedure: 'Procedures',
  Nursing: 'Nursing Charges',
  Miscellaneous: 'Miscellaneous',
};

const TYPE_CATEGORY_MAP = {
  consultation: 'Consultation',
  medicine: 'Pharmacy',
  lab: 'Laboratory',
  admission: 'Admission',
  room: 'Room',
  nursing: 'Nursing',
  procedure: 'Procedure',
  other: 'Miscellaneous',
};

const fmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A');
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A');

const hexToRgb = (hex) => {
  const h = (hex || BLUE).replace('#', '');
  if (h.length !== 6) return [0.12, 0.25, 0.69];
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
};

const getItemCategory = (item) => {
  if (item.category) return CATEGORY_LABELS[item.category] || item.category;
  const cat = TYPE_CATEGORY_MAP[item.type] || 'Miscellaneous';
  if (item.type === 'room' && /icu/i.test(item.description || '')) return 'ICU Charges';
  return CATEGORY_LABELS[cat] || cat;
};

const getPaymentStatusLabel = (bill) => {
  if (bill.status === 'paid') return 'PAID';
  if (bill.status === 'partial') return 'PARTIAL';
  if (bill.status === 'cancelled') return 'CANCELLED';
  return 'UNPAID';
};

const renderWatermark = (doc, text, rgb) => {
  doc.save();
  doc.opacity(0.06);
  doc.rotate(-35, { origin: [PAGE.width / 2, PAGE.height / 2] });
  doc.fontSize(70).font('Helvetica-Bold').fillColor(rgb);
  doc.text(text, PAGE.width / 2 - 170, PAGE.height / 2 - 28, { width: 380, align: 'center' });
  doc.opacity(1);
  doc.restore();
  doc.fillColor('black');
};

const ensureSpace = (doc, needed, onNewPage) => {
  if (doc.y + needed > BOTTOM_LIMIT) {
    doc.addPage();
    if (onNewPage) onNewPage();
    return true;
  }
  return false;
};

const drawSectionTitle = (doc, title, rgb) => {
  doc.fontSize(8).font('Helvetica-Bold').fillColor(rgb).text(title.toUpperCase(), MARGIN);
  doc.moveDown(0.25);
  doc.fillColor('black');
};

const drawInfoBox = (doc, x, y, width, title, rows, rgb) => {
  const labelW = 88;
  const rowH = 14;
  const bodyH = rows.length * rowH + 12;
  const boxH = 20 + bodyH;

  doc.roundedRect(x, y, width, boxH, 3).lineWidth(0.75).strokeColor(BLUE_BORDER).stroke();
  doc.rect(x, y, width, 18).fill(rgb);
  doc.fontSize(7.5).font('Helvetica-Bold').fillColor('white')
    .text(title.toUpperCase(), x + 10, y + 5, { width: width - 20 });

  let rowY = y + 24;
  rows.forEach(([label, value]) => {
    doc.fontSize(7.5).font('Helvetica-Bold').fillColor(TEXT_MUTED)
      .text(`${label}`, x + 10, rowY, { width: labelW, lineBreak: false });
    doc.font('Helvetica').fillColor(TEXT_DARK)
      .text(String(value || 'N/A'), x + 10 + labelW, rowY, { width: width - labelW - 20, lineBreak: false });
    rowY += rowH;
  });

  doc.fillColor('black');
  return boxH;
};

const drawFinancialCard = (doc, x, y, width, label, value, rgb) => {
  doc.roundedRect(x, y, width, 40, 3).fill(BLUE_LIGHT);
  doc.roundedRect(x, y, width, 40, 3).lineWidth(0.75).strokeColor(BLUE_BORDER).stroke();
  doc.rect(x, y, width, 3).fill(rgb);
  doc.fontSize(7).font('Helvetica-Bold').fillColor(TEXT_MUTED)
    .text(label.toUpperCase(), x + 10, y + 12, { width: width - 20 });
  doc.fontSize(11).font('Helvetica-Bold').fillColor(rgb)
    .text(value, x + 10, y + 24, { width: width - 20 });
  doc.fillColor('black');
};

const renderCorporateHeader = async (doc, branding, rgb) => {
  const headerY = doc.y;
  const logoSize = 52;

  if (branding.logo) {
    try {
      const imageBuffer = await fetchImageBuffer(branding.logo);
      doc.image(imageBuffer, MARGIN, headerY, { fit: [logoSize, logoSize] });
    } catch { /* skip */ }
  }

  const textX = branding.logo ? MARGIN + logoSize + 14 : MARGIN;
  const textW = PAGE.width - textX - MARGIN;

  doc.fontSize(15).font('Helvetica-Bold').fillColor(rgb)
    .text(branding.hospitalName, textX, headerY + 2, { width: textW });
  if (branding.tagline) {
    doc.fontSize(8.5).font('Helvetica-Oblique').fillColor(TEXT_MUTED)
      .text(branding.tagline, textX, doc.y + 2, { width: textW });
  }

  const contactParts = [];
  if (branding.address) contactParts.push(branding.address);
  if (branding.phone) contactParts.push(`Ph: ${branding.phone}`);
  if (branding.email) contactParts.push(branding.email);
  if (branding.website) contactParts.push(branding.website);
  if (contactParts.length) {
    doc.fontSize(7).font('Helvetica').fillColor(TEXT_MUTED)
      .text(contactParts.join('  |  '), textX, doc.y + 3, { width: textW });
  }

  const regParts = [];
  if (branding.gstNumber) regParts.push(`GST: ${branding.gstNumber}`);
  if (branding.nabhAccreditation) regParts.push(`NABH: ${branding.nabhAccreditation}`);
  if (branding.nablAccreditation) regParts.push(`NABL: ${branding.nablAccreditation}`);
  if (regParts.length) {
    doc.fontSize(7).font('Helvetica-Bold').fillColor(rgb)
      .text(regParts.join('  |  '), textX, doc.y + 2, { width: textW });
  }

  doc.y = Math.max(doc.y, headerY + logoSize) + 10;
  doc.moveTo(MARGIN, doc.y).lineTo(PAGE.width - MARGIN, doc.y).lineWidth(2).strokeColor(rgb).stroke();
  doc.moveDown(0.6);

  doc.fontSize(12).font('Helvetica-Bold').fillColor(rgb)
    .text('TAX INVOICE / BILL OF SUPPLY', MARGIN, doc.y, { width: CONTENT_WIDTH, align: 'center' });
  doc.moveDown(0.5);
  doc.fillColor('black');
};

const renderChargesTable = (doc, items, rgb, onNewPage) => {
  const cols = {
    sno: { x: MARGIN, w: 28 },
    cat: { x: MARGIN + 28, w: 78 },
    desc: { x: MARGIN + 106, w: 200 },
    qty: { x: MARGIN + 306, w: 32 },
    rate: { x: MARGIN + 338, w: 72 },
    amt: { x: MARGIN + 410, w: CONTENT_WIDTH - 410 },
  };

  const drawHeader = () => {
    const thY = doc.y;
    doc.rect(MARGIN, thY, CONTENT_WIDTH, 17).fill(rgb);
    doc.fontSize(7.5).font('Helvetica-Bold').fillColor('white');
    doc.text('S.No', cols.sno.x + 4, thY + 5, { width: cols.sno.w });
    doc.text('Category', cols.cat.x, thY + 5, { width: cols.cat.w });
    doc.text('Description', cols.desc.x, thY + 5, { width: cols.desc.w });
    doc.text('Qty', cols.qty.x, thY + 5, { width: cols.qty.w, align: 'center' });
    doc.text('Rate', cols.rate.x, thY + 5, { width: cols.rate.w, align: 'right' });
    doc.text('Amount', cols.amt.x, thY + 5, { width: cols.amt.w - 4, align: 'right' });
    doc.fillColor('black');
    doc.y = thY + 19;
  };

  drawHeader();
  doc.font('Helvetica').fontSize(7.5);

  (items || []).forEach((item, i) => {
    const rowH = 15;
    ensureSpace(doc, rowH + 2, drawHeader);

    const y = doc.y;
    if (i % 2 === 0) doc.rect(MARGIN, y - 1, CONTENT_WIDTH, rowH).fill(BLUE_LIGHT);

    const lineAmount = (item.quantity || 1) * (item.unitPrice || 0);
    doc.fillColor(TEXT_DARK);
    doc.text(String(i + 1), cols.sno.x + 4, y, { width: cols.sno.w });
    doc.text(getItemCategory(item), cols.cat.x, y, { width: cols.cat.w });
    doc.text(item.description || item.name || '', cols.desc.x, y, { width: cols.desc.w });
    doc.text(String(item.quantity || 1), cols.qty.x, y, { width: cols.qty.w, align: 'center' });
    doc.text(fmt(item.unitPrice), cols.rate.x, y, { width: cols.rate.w, align: 'right' });
    doc.font('Helvetica-Bold').text(fmt(lineAmount), cols.amt.x, y, { width: cols.amt.w - 4, align: 'right' });
    doc.font('Helvetica');
    doc.y = y + rowH;
  });

  doc.moveTo(MARGIN, doc.y).lineTo(PAGE.width - MARGIN, doc.y).strokeColor(BLUE_BORDER).stroke();
  doc.moveDown(0.6);
};

const renderSummary = (doc, bill, subtotal, totalGST, rgb) => {
  const boxW = 220;
  const boxX = PAGE.width - MARGIN - boxW;
  const boxY = doc.y;
  const rows = [
    ['Subtotal', fmt(subtotal)],
    ['Discount', bill.discount > 0 ? `-${fmt(bill.discountAmount)} (${bill.discount}%)` : fmt(0)],
    ['Tax / GST', fmt(totalGST)],
    ['Previous Due', fmt(0)],
    ['Advance Paid', fmt(bill.advanceAmount)],
    ['Amount Paid', fmt(bill.paidAmount)],
    ['Balance Due', fmt(bill.dueAmount)],
  ];
  const boxH = 16 + rows.length * 14 + 22;

  doc.roundedRect(boxX, boxY, boxW, boxH, 3).fill(BLUE_LIGHT);
  doc.roundedRect(boxX, boxY, boxW, boxH, 3).lineWidth(0.75).strokeColor(BLUE_BORDER).stroke();

  let rowY = boxY + 10;
  rows.forEach(([label, value]) => {
    doc.fontSize(8).font('Helvetica').fillColor(TEXT_MUTED).text(label, boxX + 12, rowY, { width: 100 });
    doc.font('Helvetica-Bold').fillColor(TEXT_DARK).text(value, boxX + 12, rowY, { width: boxW - 24, align: 'right' });
    rowY += 14;
  });

  doc.moveTo(boxX + 10, rowY + 2).lineTo(boxX + boxW - 10, rowY + 2).strokeColor(rgb).lineWidth(1).stroke();
  rowY += 8;
  doc.fontSize(10).font('Helvetica-Bold').fillColor(rgb).text('Grand Total', boxX + 12, rowY);
  doc.text(fmt(bill.totalAmount), boxX + 12, rowY, { width: boxW - 24, align: 'right' });
  doc.fillColor('black');
  doc.y = boxY + boxH + 12;
};

const renderFooterSection = (doc, branding, bill, rgb) => {
  ensureSpace(doc, 90);

  const sigY = doc.y;
  const sigW = (CONTENT_WIDTH - 16) / 2;
  doc.fontSize(7.5).font('Helvetica-Bold').fillColor(TEXT_DARK);
  doc.text('Authorized Signature', MARGIN, sigY);
  doc.text('Patient Signature', MARGIN + sigW + 16, sigY);
  doc.moveTo(MARGIN, sigY + 32).lineTo(MARGIN + sigW, sigY + 32).strokeColor(BLUE_BORDER).stroke();
  doc.moveTo(MARGIN + sigW + 16, sigY + 32).lineTo(PAGE.width - MARGIN, sigY + 32).strokeColor(BLUE_BORDER).stroke();
  doc.fontSize(7).font('Helvetica').fillColor(TEXT_MUTED).text('Hospital Seal Area', MARGIN, sigY + 35);

  doc.y = sigY + 52;
  doc.moveTo(MARGIN, doc.y).lineTo(PAGE.width - MARGIN, doc.y).lineWidth(1).strokeColor(rgb).stroke();
  doc.moveDown(0.5);
  doc.fontSize(8).font('Helvetica-Bold').fillColor(rgb)
    .text(branding.footerNote || 'Thank you for choosing our hospital.', MARGIN, doc.y, { width: CONTENT_WIDTH, align: 'center' });
  doc.fontSize(7).font('Helvetica').fillColor(TEXT_MUTED);
  doc.text(`For queries: Phone: ${branding.phone || 'N/A'}  |  Email: ${branding.email || 'N/A'}`, MARGIN, doc.y + 2, { width: CONTENT_WIDTH, align: 'center' });
  doc.text('This is a computer-generated invoice.', MARGIN, doc.y + 2, { width: CONTENT_WIDTH, align: 'center' });
  doc.fillColor('black');
};

const buildInvoiceContext = (bill) => {
  let watermark = 'UNPAID';
  if (bill.status === 'paid' || bill.dueAmount === 0) watermark = 'PAID';
  else if (bill.status === 'partial') watermark = 'PARTIAL';
  const opIp = bill.ipAdmission?.admissionNumber || bill.opRegistration?.tokenNumber
    || (bill.billType === 'ip' ? 'IP' : bill.billType === 'op' ? 'OP' : 'N/A');

  let subtotal = 0;
  let totalGST = 0;
  (bill.items || []).forEach((item) => {
    subtotal += (item.quantity || 1) * (item.unitPrice || 0);
    totalGST += item.gstAmount || ((item.quantity || 1) * (item.unitPrice || 0) * ((item.gstPercent || 0) / 100));
  });

  return { watermark, opIp, subtotal, totalGST };
};

const generatePremiumInvoicePDF = async (bill, res, branding) => {
  const b = branding || await brandingService.getBranding();
  const rgb = hexToRgb(b.primaryColor || BLUE);
  const { watermark, opIp, subtotal, totalGST } = buildInvoiceContext(bill);
  const totalPaid = (bill.paidAmount || 0) + (bill.advanceAmount || 0);

  const doc = new PDFDocument({ margin: MARGIN, size: 'A4', bufferPages: true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=invoice-${bill.billNumber}.pdf`);
  doc.pipe(res);

  renderWatermark(doc, watermark, rgb);
  await renderCorporateHeader(doc, b, rgb);

  const isIpBill = bill.billType === 'ip' || !!bill.ipAdmission?.admissionNumber;
  const boxY = doc.y;
  const halfW = (CONTENT_WIDTH - 12) / 2;
  const patientRows = [
    ['Patient Name', bill.patient?.name],
    ['UHID / ID', bill.patient?.patientId],
    ['Age / Gender', `${bill.patient?.age || 'N/A'} / ${bill.patient?.gender || 'N/A'}`],
    ['Mobile', bill.patient?.phone],
    ['OP / IP No.', opIp],
    ['Doctor', bill.doctor?.name ? `Dr. ${bill.doctor.name}` : 'N/A'],
    ['Department', bill.department?.name || 'N/A'],
  ];
  if (isIpBill) {
    patientRows.splice(5, 0,
      ['Admission', fmtDate(bill.ipAdmission?.admissionDate)],
      ['Discharge', fmtDate(bill.ipAdmission?.dischargeDate)],
    );
  }
  const invoiceRows = [
    ['Invoice No.', bill.billNumber],
    ['Invoice Date', fmtDateTime(bill.createdAt)],
    ['Payment Status', getPaymentStatusLabel(bill)],
    ['Payment Mode', (bill.paymentMode || 'N/A').toUpperCase()],
    ['Bill Type', (bill.billType || 'unified').toUpperCase()],
  ];

  const patientH = drawInfoBox(doc, MARGIN, boxY, halfW, 'Patient Information', patientRows, rgb);
  const invoiceH = drawInfoBox(doc, MARGIN + halfW + 12, boxY, halfW, 'Invoice Information', invoiceRows, rgb);
  doc.y = boxY + Math.max(patientH, invoiceH) + 8;

  drawSectionTitle(doc, 'Service Details', rgb);
  doc.moveDown(0.2);
  const invoiceItems = (bill.items || []).filter((item) => {
    const amt = (item.quantity || 1) * (item.unitPrice || 0);
    return amt > 0;
  });
  renderChargesTable(doc, invoiceItems, rgb, () => renderWatermark(doc, watermark, rgb));
  renderSummary(doc, bill, subtotal, totalGST, rgb);
  renderFooterSection(doc, b, bill, rgb);

  const range = doc.bufferedPageRange();
  const pageCount = Math.min(range.count, 1);
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);
    doc.fontSize(7).font('Helvetica').fillColor(TEXT_MUTED)
      .text('Page 1 of 1', MARGIN, PAGE.height - 28);
    doc.text(b.hospitalName, 0, PAGE.height - 28, { align: 'center', width: PAGE.width });
  }

  doc.end();
};

const generatePremiumThermalPrint = async (bill, res, branding) => {
  const b = branding || await brandingService.getBranding();
  const rgb = hexToRgb(b.primaryColor || BLUE);
  const { opIp, subtotal, totalGST, watermark } = buildInvoiceContext(bill);

  const doc = new PDFDocument({ margin: 10, size: [226, 720] });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=thermal-${bill.billNumber}.pdf`);
  doc.pipe(res);

  doc.fontSize(9).font('Helvetica-Bold').fillColor(rgb)
    .text(b.hospitalName, { align: 'center', width: 206 });
  if (b.phone) doc.fontSize(6).font('Helvetica').fillColor(TEXT_MUTED).text(`Ph: ${b.phone}`, { align: 'center' });
  doc.moveDown(0.2);
  doc.moveTo(10, doc.y).lineTo(216, doc.y).strokeColor(rgb).stroke();
  doc.moveDown(0.3);

  doc.fontSize(8).font('Helvetica-Bold').fillColor(rgb).text(watermark, { align: 'center' });
  doc.fontSize(7).font('Helvetica').fillColor(TEXT_DARK);
  doc.text(`Bill: ${bill.billNumber}`);
  doc.text(`Date: ${fmtDateTime(bill.createdAt)}`);
  doc.text(`Patient: ${bill.patient?.name || ''}`);
  doc.text(`ID: ${bill.patient?.patientId || ''}`);
  doc.text(`OP/IP: ${opIp}`);
  doc.moveDown(0.2);
  doc.moveTo(10, doc.y).lineTo(216, doc.y).dash(2).stroke().undash();
  doc.moveDown(0.2);

  (bill.items || []).forEach((item, i) => {
    const amt = (item.quantity || 1) * (item.unitPrice || 0);
    doc.fontSize(6).font('Helvetica-Bold').fillColor(rgb).text(`${i + 1}. ${getItemCategory(item)}`);
    doc.font('Helvetica').fillColor(TEXT_DARK).text(`${item.description || item.name || ''}`);
    doc.text(`  ${item.quantity || 1} x ${fmt(item.unitPrice)} = ${fmt(amt)}`);
  });

  doc.moveDown(0.2);
  doc.moveTo(10, doc.y).lineTo(216, doc.y).dash(2).stroke().undash();
  doc.moveDown(0.2);
  doc.fontSize(7).fillColor(TEXT_DARK);
  doc.text(`Subtotal: ${fmt(subtotal)}`);
  doc.text(`GST: ${fmt(totalGST)}`);
  if (bill.discount > 0) doc.text(`Discount: -${fmt(bill.discountAmount)}`);
  doc.fontSize(9).font('Helvetica-Bold').fillColor(rgb).text(`TOTAL: ${fmt(bill.totalAmount)}`);
  doc.fontSize(7).font('Helvetica').fillColor(TEXT_DARK);
  doc.text(`Paid: ${fmt(bill.paidAmount)} | Due: ${fmt(bill.dueAmount)}`);
  doc.text(`Mode: ${(bill.paymentMode || 'N/A').toUpperCase()}`);
  doc.moveDown(0.4);
  doc.fontSize(6).fillColor(TEXT_MUTED).text(b.footerNote || 'Thank you!', { align: 'center' });

  doc.end();
};

module.exports = {
  generatePremiumInvoicePDF,
  generatePremiumThermalPrint,
  CATEGORY_LABELS,
  getItemCategory,
  getPaymentStatusLabel,
  fmt,
  fmtDate,
  fmtDateTime,
};
