const PDFDocument = require('pdfkit');
const { fetchImageBuffer } = require('./pdfBranding');
const brandingService = require('../services/brandingService');

const BLUE = '#1e40af';
const BLUE_LIGHT = '#eff6ff';
const BLUE_BORDER = '#bfdbfe';
const TEXT_DARK = '#111827';
const TEXT_MUTED = '#374151';

/** Readable layouts for both paper sizes */
const LAYOUTS = {
  A4: {
    size: 'A4',
    width: 595.28,
    height: 841.89,
    margin: 42,
    logo: 52,
    fonts: {
      hospital: 16,
      tagline: 10,
      contact: 9,
      title: 13,
      section: 11,
      boxTitle: 10,
      body: 10.5,
      table: 10.5,
      small: 9.5,
      total: 12,
      watermark: 64,
    },
    rowH: 17,
    thH: 20,
    summaryW: 230,
    labelW: 92,
  },
  A5: {
    size: 'A5',
    width: 419.53,
    height: 595.28,
    margin: 26,
    logo: 40,
    fonts: {
      hospital: 13,
      tagline: 9,
      contact: 8,
      title: 11,
      section: 10,
      boxTitle: 9,
      body: 9.5,
      table: 9.5,
      small: 8.5,
      total: 11,
      watermark: 42,
    },
    rowH: 15,
    thH: 18,
    summaryW: 175,
    labelW: 78,
  },
};

const resolveLayout = (size) => {
  const key = String(size || 'A4').toUpperCase() === 'A5' ? 'A5' : 'A4';
  const L = LAYOUTS[key];
  return {
    ...L,
    contentWidth: L.width - L.margin * 2,
    bottomLimit: L.height - (key === 'A5' ? 44 : 56),
  };
};

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
const fmtTime = (d) => (d ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }) : 'N/A');
const fmtDateTime = (d) => (d ? `${fmtDate(d)} ${fmtTime(d)}` : 'N/A');

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

const renderWatermark = (doc, L, text, rgb) => {
  doc.save();
  doc.opacity(0.06);
  doc.rotate(-35, { origin: [L.width / 2, L.height / 2] });
  doc.fontSize(L.fonts.watermark).font('Helvetica-Bold').fillColor(rgb);
  doc.text(text, L.width / 2 - 160, L.height / 2 - 24, { width: 320, align: 'center' });
  doc.opacity(1);
  doc.restore();
  doc.fillColor('black');
};

const ensureSpace = (doc, L, needed, onNewPage) => {
  if (doc.y + needed > L.bottomLimit) {
    doc.addPage({ size: L.size, margin: L.margin });
    doc.y = L.margin;
    if (onNewPage) onNewPage();
    return true;
  }
  return false;
};

/** Compact header for page 2+ so remaining line items / balance stay clear */
const renderContinuationHeader = (doc, L, ctx, rgb) => {
  doc.y = L.margin;
  doc.fontSize(L.fonts.section).font('Helvetica').fillColor(rgb)
    .text('TAX INVOICE — CONTINUED', L.margin, doc.y, { width: L.contentWidth });
  doc.moveDown(0.2);
  doc.fontSize(L.fonts.body).font('Helvetica').fillColor(TEXT_DARK)
    .text(`Bill No: ${ctx.billNumber}`, L.margin, doc.y, { width: L.contentWidth * 0.48 });
  const lineY = doc.y - (L.fonts.body + 2);
  doc.font('Helvetica').fillColor(TEXT_MUTED)
    .text(`Date & Time: ${ctx.dateTime}`, L.margin + L.contentWidth * 0.48, lineY, {
      width: L.contentWidth * 0.52,
      align: 'right',
    });
  doc.y = Math.max(doc.y, lineY + L.fonts.body + 4);
  doc.fontSize(L.fonts.body).font('Helvetica').fillColor(TEXT_DARK)
    .text(`Patient: ${ctx.patientName}   |   UHID: ${ctx.uhid}   |   Phone: ${ctx.phone}`, L.margin, doc.y, {
      width: L.contentWidth,
    });
  doc.moveDown(0.3);
  doc.moveTo(L.margin, doc.y).lineTo(L.width - L.margin, doc.y).lineWidth(1.5).strokeColor(rgb).stroke();
  doc.moveDown(0.4);
  doc.fillColor('black');
};

const drawSectionTitle = (doc, L, title, rgb) => {
  doc.fontSize(L.fonts.section).font('Helvetica').fillColor(rgb).text(title.toUpperCase(), L.margin);
  doc.moveDown(0.2);
  doc.fillColor('black');
};

const drawInfoBox = (doc, L, x, y, width, title, rows, rgb) => {
  const labelW = L.labelW;
  const rowH = L.rowH;
  const headH = 20;
  const boxH = headH + rows.length * rowH + 12;

  doc.roundedRect(x, y, width, boxH, 3).lineWidth(0.75).strokeColor(BLUE_BORDER).stroke();
  doc.rect(x, y, width, headH).fill(rgb);
  doc.fontSize(L.fonts.boxTitle).font('Helvetica').fillColor('white')
    .text(title.toUpperCase(), x + 8, y + 5, { width: width - 16 });

  let rowY = y + headH + 6;
  rows.forEach(([label, value]) => {
    doc.fontSize(L.fonts.body).font('Helvetica').fillColor(TEXT_MUTED)
      .text(`${label}`, x + 8, rowY, { width: labelW, lineBreak: false });
    doc.font('Helvetica').fillColor(TEXT_DARK)
      .text(String(value || 'N/A'), x + 8 + labelW, rowY, { width: width - labelW - 16, lineBreak: false });
    rowY += rowH;
  });

  doc.fillColor('black');
  return boxH;
};

const renderCorporateHeader = async (doc, L, branding, rgb) => {
  const headerY = doc.y;
  const logoSize = L.logo;

  if (branding.logo) {
    try {
      const imageBuffer = await fetchImageBuffer(branding.logo);
      doc.image(imageBuffer, L.margin, headerY, { fit: [logoSize, logoSize] });
    } catch { /* skip */ }
  }

  const textX = branding.logo ? L.margin + logoSize + 10 : L.margin;
  const textW = L.width - textX - L.margin;

  doc.fontSize(L.fonts.hospital).font('Helvetica').fillColor(rgb)
    .text(branding.hospitalName, textX, headerY + 1, { width: textW });
  if (branding.tagline) {
    doc.fontSize(L.fonts.tagline).font('Helvetica-Oblique').fillColor(TEXT_MUTED)
      .text(branding.tagline, textX, doc.y + 2, { width: textW });
  }

  const contactParts = [];
  if (branding.address) contactParts.push(branding.address);
  if (branding.phone) contactParts.push(`Ph: ${branding.phone}`);
  if (branding.email) contactParts.push(branding.email);
  if (branding.website) contactParts.push(branding.website);
  if (contactParts.length) {
    doc.fontSize(L.fonts.contact).font('Helvetica').fillColor(TEXT_MUTED)
      .text(contactParts.join('  |  '), textX, doc.y + 3, { width: textW });
  }

  const regParts = [];
  if (branding.gstNumber) regParts.push(`GST: ${branding.gstNumber}`);
  if (branding.nabhAccreditation) regParts.push(`NABH: ${branding.nabhAccreditation}`);
  if (branding.nablAccreditation) regParts.push(`NABL: ${branding.nablAccreditation}`);
  if (regParts.length) {
    doc.fontSize(L.fonts.small).font('Helvetica').fillColor(rgb)
      .text(regParts.join('  |  '), textX, doc.y + 2, { width: textW });
  }

  doc.y = Math.max(doc.y, headerY + logoSize) + 8;
  doc.moveTo(L.margin, doc.y).lineTo(L.width - L.margin, doc.y).lineWidth(2).strokeColor(rgb).stroke();
  doc.moveDown(0.4);

  doc.fontSize(L.fonts.title).font('Helvetica').fillColor(rgb)
    .text('TAX INVOICE / BILL OF SUPPLY', L.margin, doc.y, { width: L.contentWidth, align: 'center' });
  doc.moveDown(0.35);
  doc.fillColor('black');
};

const renderChargesTable = (doc, L, items, rgb, onNewPage) => {
  const m = L.margin;
  const cw = L.contentWidth;
  const cols = {
    sno: { x: m, w: Math.round(cw * 0.06) },
    cat: { x: m + Math.round(cw * 0.06), w: Math.round(cw * 0.18) },
    desc: { x: m + Math.round(cw * 0.24), w: Math.round(cw * 0.34) },
    qty: { x: m + Math.round(cw * 0.58), w: Math.round(cw * 0.08) },
    rate: { x: m + Math.round(cw * 0.66), w: Math.round(cw * 0.16) },
    amt: { x: m + Math.round(cw * 0.82), w: Math.round(cw * 0.18) },
  };

  const drawHeader = () => {
    const thY = doc.y;
    doc.rect(m, thY, cw, L.thH).fill(rgb);
    doc.fontSize(L.fonts.table).font('Helvetica').fillColor('white');
    const ty = thY + 5;
    doc.text('No', cols.sno.x + 2, ty, { width: cols.sno.w });
    doc.text('Category', cols.cat.x, ty, { width: cols.cat.w });
    doc.text('Description', cols.desc.x, ty, { width: cols.desc.w });
    doc.text('Qty', cols.qty.x, ty, { width: cols.qty.w, align: 'center' });
    doc.text('Rate', cols.rate.x, ty, { width: cols.rate.w, align: 'right' });
    doc.text('Amount', cols.amt.x, ty, { width: cols.amt.w - 2, align: 'right' });
    doc.fillColor('black');
    doc.y = thY + L.thH + 2;
  };

  drawHeader();
  doc.font('Helvetica').fontSize(L.fonts.table);

  (items || []).forEach((item, i) => {
    const rowH = L.rowH;
    // Keep room so last rows + balance block can move together when needed
    ensureSpace(doc, L, rowH + 4, () => {
      onNewPage?.();
      drawHeader();
      doc.font('Helvetica').fontSize(L.fonts.table);
    });

    const y = doc.y;
    if (i % 2 === 0) doc.rect(m, y - 1, cw, rowH).fill(BLUE_LIGHT);

    const lineAmount = (item.quantity || 1) * (item.unitPrice || 0);
    doc.fillColor(TEXT_DARK);
    doc.text(String(i + 1), cols.sno.x + 2, y, { width: cols.sno.w });
    doc.text(getItemCategory(item), cols.cat.x, y, { width: cols.cat.w });
    doc.text(item.genericName || item.description || item.name || '', cols.desc.x, y, { width: cols.desc.w });
    doc.text(String(item.quantity || 1), cols.qty.x, y, { width: cols.qty.w, align: 'center' });
    doc.text(fmt(item.unitPrice), cols.rate.x, y, { width: cols.rate.w, align: 'right' });
    doc.font('Helvetica').text(fmt(lineAmount), cols.amt.x, y, { width: cols.amt.w - 2, align: 'right' });
    doc.font('Helvetica');
    doc.y = y + rowH;
  });

  doc.moveTo(m, doc.y).lineTo(L.width - m, doc.y).strokeColor(BLUE_BORDER).stroke();
  doc.moveDown(0.45);
};

const renderSummary = (doc, L, bill, subtotal, totalGST, rgb, onNewPage) => {
  const boxW = L.summaryW;
  const boxX = L.width - L.margin - boxW;
  const rows = [
    ['Subtotal', fmt(subtotal)],
    ['Discount', bill.discount > 0 ? `-${fmt(bill.discountAmount)} (${bill.discount}%)` : fmt(0)],
    ['Tax / GST', fmt(totalGST)],
    ['Advance Paid', fmt(bill.advanceAmount)],
    ['Amount Paid', fmt(bill.paidAmount)],
    ['Balance Due', fmt(bill.dueAmount)],
  ];
  const lineH = L.rowH;
  const boxH = 14 + rows.length * lineH + 26;

  // If balance/totals won't fit, continue on next page
  ensureSpace(doc, L, boxH + 90, onNewPage);

  const boxY = doc.y;

  doc.roundedRect(boxX, boxY, boxW, boxH, 3).fill(BLUE_LIGHT);
  doc.roundedRect(boxX, boxY, boxW, boxH, 3).lineWidth(0.75).strokeColor(BLUE_BORDER).stroke();

  let rowY = boxY + 10;
  rows.forEach(([label, value]) => {
    doc.fontSize(L.fonts.body).font('Helvetica').fillColor(TEXT_MUTED).text(label, boxX + 10, rowY, { width: 90 });
    doc.font('Helvetica').fillColor(TEXT_DARK).text(value, boxX + 10, rowY, { width: boxW - 20, align: 'right' });
    rowY += lineH;
  });

  doc.moveTo(boxX + 8, rowY + 2).lineTo(boxX + boxW - 8, rowY + 2).strokeColor(rgb).lineWidth(1).stroke();
  rowY += 8;
  doc.fontSize(L.fonts.total).font('Helvetica').fillColor(rgb).text('Grand Total', boxX + 10, rowY);
  doc.text(fmt(bill.totalAmount), boxX + 10, rowY, { width: boxW - 20, align: 'right' });
  doc.fillColor('black');
  doc.y = boxY + boxH + 10;
};

const renderFooterSection = (doc, L, branding, rgb, onNewPage) => {
  ensureSpace(doc, L, 78, onNewPage);

  const sigY = doc.y;
  const sigW = (L.contentWidth - 12) / 2;
  doc.fontSize(L.fonts.body).font('Helvetica').fillColor(TEXT_DARK);
  doc.text('Authorized Signature', L.margin, sigY);
  doc.text('Patient Signature', L.margin + sigW + 12, sigY);
  doc.moveTo(L.margin, sigY + 26).lineTo(L.margin + sigW, sigY + 26).strokeColor(BLUE_BORDER).stroke();
  doc.moveTo(L.margin + sigW + 12, sigY + 26).lineTo(L.width - L.margin, sigY + 26).strokeColor(BLUE_BORDER).stroke();
  doc.fontSize(L.fonts.small).font('Helvetica').fillColor(TEXT_MUTED).text('Hospital Seal Area', L.margin, sigY + 28);

  doc.y = sigY + 42;
  doc.moveTo(L.margin, doc.y).lineTo(L.width - L.margin, doc.y).lineWidth(1).strokeColor(rgb).stroke();
  doc.moveDown(0.35);
  doc.fontSize(L.fonts.body).font('Helvetica').fillColor(rgb)
    .text(branding.footerNote || 'Thank you for choosing our hospital.', L.margin, doc.y, { width: L.contentWidth, align: 'center' });
  doc.fontSize(L.fonts.small).font('Helvetica').fillColor(TEXT_MUTED);
  doc.text(`For queries: Phone: ${branding.phone || 'N/A'}  |  Email: ${branding.email || 'N/A'}`, L.margin, doc.y + 2, { width: L.contentWidth, align: 'center' });
  doc.text('This is a computer-generated invoice.', L.margin, doc.y + 2, { width: L.contentWidth, align: 'center' });
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

/**
 * @param {object} bill
 * @param {object} res
 * @param {object} [branding]
 * @param {{ size?: 'A4'|'A5' }} [options]
 */
const generatePremiumInvoicePDF = async (bill, res, branding, options = {}) => {
  const L = resolveLayout(options.size || branding?.pageSize || 'A4');
  const b = branding || await brandingService.getBranding();
  const rgb = hexToRgb(b.primaryColor || BLUE);
  const { watermark, opIp, subtotal, totalGST } = buildInvoiceContext(bill);

  const doc = new PDFDocument({ margin: L.margin, size: L.size, bufferPages: true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=invoice-${bill.billNumber}-${L.size}.pdf`);
  doc.pipe(res);

  renderWatermark(doc, L, watermark, rgb);
  await renderCorporateHeader(doc, L, b, rgb);

  const isIpBill = bill.billType === 'ip' || !!bill.ipAdmission?.admissionNumber;
  const boxY = doc.y;
  const halfW = (L.contentWidth - 12) / 2;

  // Required patient identity fields — always shown
  const patientRows = [
    ['Patient Name', bill.patient?.name || 'N/A'],
    ['UHID', bill.patient?.patientId || 'N/A'],
    ['Age / Gender', `${bill.patient?.age ?? 'N/A'} / ${bill.patient?.gender || 'N/A'}`],
    ['Phone', bill.patient?.phone || 'N/A'],
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
    ['Invoice Date', fmtDate(bill.createdAt)],
    ['Invoice Time', fmtTime(bill.createdAt)],
    ['Payment Status', getPaymentStatusLabel(bill)],
    ['Payment Mode', (bill.paymentMode || 'N/A').toUpperCase()],
    ['Bill Type', (bill.billType || 'unified').toUpperCase()],
  ];

  const patientH = drawInfoBox(doc, L, L.margin, boxY, halfW, 'Patient Information', patientRows, rgb);
  const invoiceH = drawInfoBox(doc, L, L.margin + halfW + 12, boxY, halfW, 'Invoice Information', invoiceRows, rgb);
  doc.y = boxY + Math.max(patientH, invoiceH) + 8;

  const continueCtx = {
    billNumber: bill.billNumber,
    patientName: bill.patient?.name || 'N/A',
    uhid: bill.patient?.patientId || 'N/A',
    phone: bill.patient?.phone || 'N/A',
    dateTime: fmtDateTime(bill.createdAt),
  };
  const onContinuePage = () => {
    renderWatermark(doc, L, watermark, rgb);
    renderContinuationHeader(doc, L, continueCtx, rgb);
  };

  drawSectionTitle(doc, L, 'Service Details', rgb);
  doc.moveDown(0.15);
  const invoiceItems = (bill.items || []).filter((item) => {
    const amt = (item.quantity || 1) * (item.unitPrice || 0);
    return amt > 0;
  });
  renderChargesTable(doc, L, invoiceItems, rgb, onContinuePage);
  renderSummary(doc, L, bill, subtotal, totalGST, rgb, onContinuePage);
  renderFooterSection(doc, L, b, rgb, onContinuePage);

  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    doc.fontSize(L.fonts.small).font('Helvetica').fillColor(TEXT_MUTED)
      .text(`Page ${i + 1} of ${range.count}`, L.margin, L.height - 26);
    doc.text(`${b.hospitalName} · ${L.size}`, 0, L.height - 26, { align: 'center', width: L.width });
    if (range.count > 1 && i < range.count - 1) {
      doc.text('Continued on next page →', L.width - L.margin - 140, L.height - 26, {
        width: 140,
        align: 'right',
      });
    }
  }

  doc.end();
};

const generatePremiumThermalPrint = async (bill, res, branding) => {
  const b = branding || await brandingService.getBranding();
  const rgb = hexToRgb(b.primaryColor || BLUE);
  const { opIp, subtotal, totalGST, watermark } = buildInvoiceContext(bill);

  const doc = new PDFDocument({ margin: 10, size: [226, 780] });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=thermal-${bill.billNumber}.pdf`);
  doc.pipe(res);

  doc.fontSize(10).font('Helvetica').fillColor(rgb)
    .text(b.hospitalName, { align: 'center', width: 206 });
  if (b.phone) doc.fontSize(8).font('Helvetica').fillColor(TEXT_MUTED).text(`Ph: ${b.phone}`, { align: 'center' });
  doc.moveDown(0.2);
  doc.moveTo(10, doc.y).lineTo(216, doc.y).strokeColor(rgb).stroke();
  doc.moveDown(0.3);

  doc.fontSize(9).font('Helvetica').fillColor(rgb).text(watermark, { align: 'center' });
  doc.fontSize(8).font('Helvetica').fillColor(TEXT_DARK);
  doc.text(`Bill: ${bill.billNumber}`);
  doc.text(`Date: ${fmtDate(bill.createdAt)}`);
  doc.text(`Time: ${fmtTime(bill.createdAt)}`);
  doc.text(`Patient: ${bill.patient?.name || 'N/A'}`);
  doc.text(`UHID: ${bill.patient?.patientId || 'N/A'}`);
  doc.text(`Age/Sex: ${bill.patient?.age ?? 'N/A'} / ${bill.patient?.gender || 'N/A'}`);
  doc.text(`Phone: ${bill.patient?.phone || 'N/A'}`);
  doc.text(`OP/IP: ${opIp}`);
  doc.moveDown(0.2);
  doc.moveTo(10, doc.y).lineTo(216, doc.y).dash(2).stroke().undash();
  doc.moveDown(0.2);

  (bill.items || []).forEach((item, i) => {
    const amt = (item.quantity || 1) * (item.unitPrice || 0);
    doc.fontSize(8).font('Helvetica').fillColor(rgb).text(`${i + 1}. ${getItemCategory(item)}`);
    doc.font('Helvetica').fillColor(TEXT_DARK).text(`${item.genericName || item.description || item.name || ''}`);
    doc.text(`  ${item.quantity || 1} x ${fmt(item.unitPrice)} = ${fmt(amt)}`);
  });

  doc.moveDown(0.2);
  doc.moveTo(10, doc.y).lineTo(216, doc.y).dash(2).stroke().undash();
  doc.moveDown(0.2);
  doc.fontSize(8).fillColor(TEXT_DARK);
  doc.text(`Subtotal: ${fmt(subtotal)}`);
  doc.text(`GST: ${fmt(totalGST)}`);
  if (bill.discount > 0) doc.text(`Discount: -${fmt(bill.discountAmount)}`);
  doc.fontSize(10).font('Helvetica').fillColor(rgb).text(`TOTAL: ${fmt(bill.totalAmount)}`);
  doc.fontSize(8).font('Helvetica').fillColor(TEXT_DARK);
  doc.text(`Paid: ${fmt(bill.paidAmount)} | Due: ${fmt(bill.dueAmount)}`);
  doc.text(`Mode: ${(bill.paymentMode || 'N/A').toUpperCase()}`);
  doc.moveDown(0.4);
  doc.fontSize(8).fillColor(TEXT_MUTED).text(b.footerNote || 'Thank you!', { align: 'center' });

  doc.end();
};

module.exports = {
  generatePremiumInvoicePDF,
  generatePremiumThermalPrint,
  CATEGORY_LABELS,
  getItemCategory,
  getPaymentStatusLabel,
  resolveLayout,
  fmt,
  fmtDate,
  fmtTime,
  fmtDateTime,
};
