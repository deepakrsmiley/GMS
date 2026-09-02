const PDFDocument = require('pdfkit');
const { renderBrandingHeader, fetchImageBuffer } = require('./pdfBranding');
const brandingService = require('../services/brandingService');
const { generatePremiumInvoicePDF, generatePremiumThermalPrint } = require('./invoicePdfGenerator');

const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = 45;
const BLUE = '#1e40af';
const TEXT_MUTED = '#64748b';
const TEXT_DARK = '#1e3a5f';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A');
const fmtDateTime = (dateValue) => {
  if (!dateValue) return '';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.toLocaleDateString('en-GB')} ${date.toLocaleTimeString('en-GB', { hour12: false })}`;
};

const getBrandColor = (branding) => /^#[0-9a-fA-F]{6}$/.test(branding?.primaryColor || '')
  ? branding.primaryColor
  : BLUE;

const getBrandLogoBuffer = async (logo) => {
  if (!logo) return null;
  if (logo.startsWith('data:')) {
    const base64 = logo.split(',')[1];
    return base64 ? Buffer.from(base64, 'base64') : null;
  }
  try {
    return await fetchImageBuffer(logo);
  } catch {
    return null;
  }
};

const contactParts = (branding) => [
  branding?.address,
  branding?.phone && `Ph: ${branding.phone}`,
  branding?.email,
  branding?.website,
].filter(Boolean);

const accreditationParts = (branding) => [
  branding?.nabhAccreditation && `NABH: ${branding.nabhAccreditation}`,
  branding?.nablAccreditation && `NABL: ${branding.nablAccreditation}`,
  branding?.gstNumber && `GST: ${branding.gstNumber}`,
].filter(Boolean);

const escapeReportText = (value, fallback = '') => String(value ?? fallback);

const splitNormalRange = (normalRange) => {
  const rangeText = String(normalRange || '');
  const values = rangeText.match(/[<>]?\s*\d+(?:\.\d+)?/g) || [];
  if (values.length >= 2) return [values[0].replace(/\s/g, ''), values[1].replace(/\s/g, '')];
  if (values.length === 1) return ['', values[0].replace(/\s/g, '')];
  return ['', ''];
};

const getLabFlag = (result) => {
  if (result.flag === 'High' || result.flag === 'Critical') return 'H';
  if (result.flag === 'Low') return 'L';
  return '';
};

const cleanLabUnit = (unit) => String(unit || '').replace(/^(H|L)\s+/, '');

const normalizeLabName = (name) => String(name || '').trim().toUpperCase();

const buildResultGroups = (results = []) => {
  const resultMap = new Map(results.map((result) => [normalizeLabName(result.testName), result]));
  const groupDefinitions = [
    { title: 'WBC', tests: ['WBC', 'LYM%', 'MON%', 'GRA%', 'LYM#', 'MON#', 'GRA#', 'GLR'] },
    { title: 'RBC', tests: ['RBC', 'HGB', 'HCT', 'MCV', 'MCH', 'MCHC', 'RDW-CV', 'RDW-SD'] },
    { title: 'PLT', tests: ['PLT', 'MPV', 'PCT', 'PDW', 'P-LCC', 'P-LCR'] },
  ];

  const groupedNames = new Set(groupDefinitions.flatMap((group) => group.tests));
  const groups = groupDefinitions.map((group) => ({
    ...group,
    rows: group.tests.map((testName) => resultMap.get(testName) || { testName }),
  }));

  const extraRows = results.filter((result) => !groupedNames.has(normalizeLabName(result.testName)));
  if (extraRows.length) groups.push({ title: 'OTHER', tests: [], rows: extraRows });
  return groups;
};

const drawReportText = (doc, text, x, y, options = {}) => {
  doc.text(escapeReportText(text), x, y, options);
};

const drawField = (doc, label, value, x, y, width) => {
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#24272c');
  drawReportText(doc, label, x, y, { width });
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#24272c');
  drawReportText(doc, value || '', x, y + 12, { width });
};

const drawSection = (doc, title, content, rgb = BLUE) => {
  if (!content) return;
  doc.fontSize(9).font('Helvetica-Bold').fillColor(rgb).text(title);
  doc.fontSize(8.5).font('Helvetica').fillColor(TEXT_DARK).text(content, { width: PAGE.width - MARGIN * 2 });
  doc.moveDown(0.5);
};

const generateInvoicePDF = async (bill, res, branding, options) =>
  generatePremiumInvoicePDF(bill, res, branding, options);
const generateThermalPrint = async (bill, res, branding) => generatePremiumThermalPrint(bill, res, branding);

const generateLabReportPDF = async (labTest, res, branding) => {
  const b = branding || await brandingService.getBranding();
  const brandColor = getBrandColor(b);
  const doc = new PDFDocument({ margin: 28, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=lab-${labTest.labNumber}.pdf`);
  doc.pipe(res);

  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const margin = 28;
  const contentWidth = pageWidth - margin * 2;
  const printedBy = labTest.reportVerifiedBy?.name || 'labtech';
  const reportDate = fmtDateTime(labTest.reportGeneratedAt || labTest.updatedAt || labTest.createdAt);
  const genderText = escapeReportText(labTest.patient?.gender).toLowerCase();
  const patientType = genderText.includes('female') || genderText.includes('woman')
    ? 'Woman'
    : genderText.includes('male') || genderText.includes('man')
      ? 'Man'
      : labTest.patient?.gender || '';

  const groupedRows = buildResultGroups(labTest.results || [])
    .map((group) => ({ ...group, rows: group.rows.filter((row) => String(row.value ?? '').trim()) }))
    .filter((group) => group.rows.length);
  const resultGroups = groupedRows.length
    ? groupedRows
    : [{ title: labTest.tests?.[0]?.testName || 'RESULTS', rows: [] }];
  const totalRows = resultGroups.reduce((count, group) => count + group.rows.length + 1, 0);
  const rowHeight = totalRows > 28 ? 10.4 : totalRows > 24 ? 11.2 : 12.2;

  const logoBuffer = await getBrandLogoBuffer(b.logo);
  const headerTop = doc.y;
  if (logoBuffer) {
    try {
      doc.image(logoBuffer, margin, headerTop, { fit: [44, 44], align: 'center', valign: 'center' });
    } catch { /* skip invalid logo */ }
  }

  const headerTextX = logoBuffer ? margin + 54 : margin;
  const headerTextWidth = logoBuffer ? contentWidth - 54 : contentWidth;
  doc.font('Helvetica-Bold').fontSize(15.5).fillColor(brandColor)
    .text(b.hospitalName || 'Hospital Name', headerTextX, headerTop, { width: headerTextWidth, align: logoBuffer ? 'left' : 'center' });
  if (b.tagline) {
    doc.font('Helvetica-Oblique').fontSize(7.2).fillColor('#475569')
      .text(b.tagline, headerTextX, doc.y + 1, { width: headerTextWidth, align: logoBuffer ? 'left' : 'center' });
  }
  const contactLine = contactParts(b).join(' | ');
  if (contactLine) {
    doc.font('Helvetica').fontSize(6.8).fillColor('#475569')
      .text(contactLine, headerTextX, doc.y + 1, { width: headerTextWidth, align: logoBuffer ? 'left' : 'center' });
  }
  const accreditationLine = accreditationParts(b).join(' | ');
  if (accreditationLine) {
    doc.font('Helvetica-Bold').fontSize(6.6).fillColor('#0f766e')
      .text(accreditationLine, headerTextX, doc.y + 1, { width: headerTextWidth, align: logoBuffer ? 'left' : 'center' });
  }

  doc.y = Math.max(doc.y, headerTop + (logoBuffer ? 46 : 36)) + 6;
  doc.roundedRect(margin, doc.y, contentWidth, 20, 4).fillAndStroke(brandColor, brandColor);
  doc.font('Helvetica-Bold').fontSize(10.5).fillColor('white')
    .text('LABORATORY RESULT REPORT', margin, doc.y + 5.5, { width: contentWidth, align: 'center' });
  doc.y += 28;

  const infoTop = doc.y;
  doc.roundedRect(margin, infoTop, contentWidth, 64, 4).lineWidth(0.7).strokeColor('#cbd5e1').stroke();
  doc.rect(margin, infoTop, contentWidth, 16).fill('#f8fafc');
  doc.font('Helvetica-Bold').fontSize(7.6).fillColor(brandColor).text('PATIENT DETAILS', margin + 9, infoTop + 5);
  const fields = [
    ['Patient ID', labTest.patient?.patientId || '-'],
    ['Name', labTest.patient?.name || '-'],
    ['Type / Gender', patientType || labTest.patient?.gender || '-'],
    ['Sample ID', labTest.labNumber || '-'],
    ...(labTest.showReportEnteredTime !== false ? [['Analysis Date', reportDate || '-']] : []),
    ['Operator', printedBy],
    ['Department', labTest.labType || '-'],
    ['Physician', labTest.doctor?.name ? `Dr. ${labTest.doctor.name}` : '-'],
  ];
  const colWidth = contentWidth / 4;
  fields.forEach(([label, value], index) => {
    const col = index % 4;
    const row = Math.floor(index / 4);
    const x = margin + 9 + col * colWidth;
    const y = infoTop + 23 + row * 19;
    doc.font('Helvetica-Bold').fontSize(6.2).fillColor('#64748b').text(label.toUpperCase(), x, y, { width: colWidth - 14 });
    doc.font('Helvetica-Bold').fontSize(7.6).fillColor('#111827').text(escapeReportText(value), x, y + 8, { width: colWidth - 14 });
  });
  doc.y = infoTop + 72;

  const tableLeft = margin;
  const tableWidth = contentWidth;
  const col = { test: 165, result: 78, flag: 34, unit: 92, range: 142 };
  const headerY = doc.y;
  doc.rect(tableLeft, headerY, tableWidth, 17).fill(brandColor);
  doc.font('Helvetica-Bold').fontSize(7).fillColor('white');
  doc.text('TEST', tableLeft + 7, headerY + 5, { width: col.test });
  doc.text('RESULT', tableLeft + 176, headerY + 5, { width: col.result, align: 'right' });
  doc.text('FLAG', tableLeft + 260, headerY + 5, { width: col.flag, align: 'center' });
  doc.text('UNIT', tableLeft + 302, headerY + 5, { width: col.unit });
  doc.text('NORMAL RANGE', tableLeft + 402, headerY + 5, { width: col.range, align: 'center' });
  doc.y = headerY + 17;

  let visualIndex = 0;
  resultGroups.forEach((group) => {
    const groupY = doc.y;
    doc.rect(tableLeft, groupY, tableWidth, rowHeight).fill('#eef2ff');
    doc.font('Helvetica-Bold').fontSize(7.2).fillColor(brandColor).text(group.title, tableLeft + 7, groupY + 3, { width: tableWidth - 14 });
    doc.y = groupY + rowHeight;
    group.rows.forEach((result) => {
      const rowY = doc.y;
      const [rangeLow, rangeHigh] = splitNormalRange(result.normalRange);
      const flag = getLabFlag(result);
      const abnormal = flag === 'H' || flag === 'L';
      if (visualIndex % 2 === 0) doc.rect(tableLeft, rowY, tableWidth, rowHeight).fill('#f8fafc');
      doc.moveTo(tableLeft, rowY + rowHeight).lineTo(tableLeft + tableWidth, rowY + rowHeight).lineWidth(0.25).strokeColor('#e2e8f0').stroke();
      doc.font('Helvetica-Bold').fontSize(7.25).fillColor('#111827').text(result.testName || '', tableLeft + 7, rowY + 3.2, { width: col.test });
      doc.font(abnormal ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.25).fillColor(abnormal ? '#b91c1c' : '#111827')
        .text(result.value || '', tableLeft + 176, rowY + 3.2, { width: col.result, align: 'right' });
      doc.font('Helvetica-Bold').fontSize(7).fillColor(flag === 'H' ? '#b91c1c' : flag === 'L' ? '#2563eb' : '#16a34a')
        .text(flag || '-', tableLeft + 260, rowY + 3.2, { width: col.flag, align: 'center' });
      doc.font('Helvetica').fontSize(7).fillColor('#334155').text(cleanLabUnit(result.unit), tableLeft + 302, rowY + 3.2, { width: col.unit });
      doc.text(rangeLow && rangeHigh ? `${rangeLow} - ${rangeHigh}` : result.normalRange || '-', tableLeft + 402, rowY + 3.2, { width: col.range, align: 'center' });
      doc.y = rowY + rowHeight;
      visualIndex += 1;
    });
  });

  if (labTest.remarks && doc.y < pageHeight - 116) {
    doc.y += 7;
    doc.roundedRect(margin, doc.y, contentWidth, 30, 4).fillAndStroke('#fffbeb', '#fde68a');
    doc.font('Helvetica-Bold').fontSize(7).fillColor('#92400e').text('Remarks', margin + 9, doc.y + 6);
    doc.font('Helvetica').fontSize(6.8).fillColor('#451a03').text(labTest.remarks, margin + 58, doc.y + 6, { width: contentWidth - 68 });
  }

  const signatureY = pageHeight - 116;
  doc.font('Helvetica').fontSize(7).fillColor('#64748b').text('Authorized Signatory', pageWidth - margin - 160, signatureY, { width: 160, align: 'right' });
  doc.moveTo(pageWidth - margin - 145, signatureY + 20).lineTo(pageWidth - margin, signatureY + 20).strokeColor('#94a3b8').stroke();
  const signName = labTest.reportApprovedBy?.name || '';
  if (signName) {
    doc.font('Helvetica-Bold').fontSize(7).fillColor('#111827').text(signName, pageWidth - margin - 160, signatureY + 24, { width: 160, align: 'right' });
  }

  doc.end();
};

const generatePrescriptionPDF = async (prescription, res, branding) => {
  const b = branding || await brandingService.getBranding();
  const doc = new PDFDocument({ margin: MARGIN, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=prescription-${prescription._id}.pdf`);
  doc.pipe(res);

  const width = PAGE.width - MARGIN * 2;
  const op = prescription.opRegistration || {};
  const patient = prescription.patient || {};
  const vitals = op.vitals || {};

  await renderBrandingHeader(doc, b, { compact: true });
  doc.moveDown(0.2);

  // ── Top row: UHID / Date / Token ──────────────────────────────
  const topY = doc.y;
  doc.font('Helvetica-Bold').fontSize(8).fillColor(TEXT_MUTED).text('UHID', MARGIN, topY, { width: 100 });
  doc.font('Helvetica').fontSize(8.5).fillColor(TEXT_DARK).text(patient.patientId || '-', MARGIN, topY + 11, { width: 150 });
  doc.font('Helvetica-Bold').fontSize(8).fillColor(TEXT_MUTED).text('DATE', MARGIN + 190, topY, { width: 120, align: 'right' });
  doc.font('Helvetica').fontSize(8.5).fillColor(TEXT_DARK).text(fmtDate(op.tokenDate || prescription.createdAt), MARGIN + 190, topY + 11, { width: 120, align: 'right' });
  doc.font('Helvetica-Bold').fontSize(8).fillColor(TEXT_MUTED).text('TOKEN', MARGIN + 320, topY, { width: width - 320, align: 'right' });
  doc.font('Helvetica').fontSize(8.5).fillColor(TEXT_DARK).text(op.tokenNumber || '-', MARGIN + 320, topY + 11, { width: width - 320, align: 'right' });
  doc.y = topY + 26;
  doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + width, doc.y).lineWidth(0.5).strokeColor('#cbd5e1').stroke();
  doc.moveDown(0.4);

  // ── Patient / consultant / address row ────────────────────────
  const infoY = doc.y;
  doc.font('Helvetica-Bold').fontSize(8).fillColor(TEXT_MUTED).text('PATIENT NAME', MARGIN, infoY, { width: 220 });
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(TEXT_DARK).text(patient.name || '-', MARGIN, infoY + 11, { width: 220 });
  doc.font('Helvetica-Bold').fontSize(8).fillColor(TEXT_MUTED).text('AGE/GENDER', MARGIN + 240, infoY, { width: width - 240 });
  doc.font('Helvetica').fontSize(9).fillColor(TEXT_DARK).text(`${patient.age || 'N/A'} / ${patient.gender || 'N/A'}`, MARGIN + 240, infoY + 11, { width: width - 240 });
  doc.y = infoY + 28;

  const consY = doc.y;
  doc.font('Helvetica-Bold').fontSize(8).fillColor(TEXT_MUTED).text('CONSULTANT', MARGIN, consY, { width: 220 });
  doc.font('Helvetica').fontSize(8.5).fillColor(TEXT_DARK).text(prescription.doctor?.name ? `Dr. ${prescription.doctor.name}` : 'N/A', MARGIN, consY + 11, { width: 220 });
  doc.font('Helvetica-Bold').fontSize(8).fillColor(TEXT_MUTED).text('DEPARTMENT', MARGIN + 240, consY, { width: width - 240 });
  doc.font('Helvetica').fontSize(8.5).fillColor(TEXT_DARK).text(op.department?.name || '-', MARGIN + 240, consY + 11, { width: width - 240 });
  doc.y = consY + 24;

  const addr = patient.address;
  const addressLine = [addr?.street, addr?.city, addr?.state, addr?.pincode].filter(Boolean).join(', ');
  if (addressLine || patient.phone) {
    doc.font('Helvetica-Bold').fontSize(8).fillColor(TEXT_MUTED).text('ADDRESS', MARGIN, doc.y, { width });
    doc.font('Helvetica').fontSize(8).fillColor(TEXT_DARK).text([addressLine, patient.phone && `Ph: ${patient.phone}`].filter(Boolean).join('   |   '), MARGIN, doc.y + 10, { width });
  }
  doc.moveDown(0.6);
  doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + width, doc.y).lineWidth(0.5).strokeColor('#cbd5e1').stroke();
  doc.moveDown(0.4);

  // ── Vitals row ─────────────────────────────────────────────────
  const vitalItems = [
    ['Weight', vitals.weight ? `${vitals.weight} kg` : '-'],
    ['BP', vitals.bloodPressure || '-'],
    ['Temp', vitals.temperature ? `${vitals.temperature} °F` : '-'],
    ['SpO2', vitals.oxygenSaturation ? `${vitals.oxygenSaturation}%` : '-'],
    ['PR', vitals.pulse ? `${vitals.pulse}/min` : '-'],
    ['RR', vitals.respiratoryRate || '-'],
  ];
  const vColW = width / vitalItems.length;
  const vY = doc.y;
  vitalItems.forEach(([label, value], i) => {
    doc.font('Helvetica-Bold').fontSize(7).fillColor(TEXT_MUTED).text(label.toUpperCase(), MARGIN + i * vColW, vY, { width: vColW - 4 });
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(TEXT_DARK).text(value, MARGIN + i * vColW, vY + 10, { width: vColW - 4 });
  });
  doc.y = vY + 26;
  doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + width, doc.y).lineWidth(0.5).strokeColor('#cbd5e1').stroke();
  doc.moveDown(0.5);

  // ── Imp / C/O / O/E ──────────────────────────────────────────
  drawSection(doc, 'Imp', op.diagnosis || prescription.diagnosis, '#0f172a');
  drawSection(doc, 'C/O (Complaints)', op.chiefComplaint, '#0f172a');
  drawSection(doc, 'O/E (Examination)', op.examinationFindings, '#0f172a');

  // ── Rx (medicines) ─────────────────────────────────────────────
  if (prescription.medicines?.length) {
    doc.font('Helvetica-Bold').fontSize(11).fillColor(BLUE).text('Rx', MARGIN, doc.y);
    doc.moveDown(0.3);
    prescription.medicines.forEach((med, i) => {
      const medY = doc.y;
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#111827')
        .text(`${i + 1}. ${med.medicineName || med.medicine?.name || 'Medicine'}`, MARGIN, medY, { width });
      doc.font('Helvetica').fontSize(8.5).fillColor(TEXT_DARK);
      const details = [
        med.dosage,
        med.frequency,
        med.duration && `x ${med.duration}`,
        med.route && med.route !== 'oral' ? med.route : null,
      ].filter(Boolean).join('   ');
      if (details) doc.text(details, MARGIN + 14, doc.y + 2, { width: width - 14 });
      if (med.instructions) doc.font('Helvetica-Oblique').fontSize(8).fillColor(TEXT_MUTED).text(med.instructions, MARGIN + 14, doc.y + 2, { width: width - 14 });
      doc.moveDown(0.5);
    });
  }

  drawSection(doc, 'Investigations Advised', op.investigationsAdvised, '#0f172a');
  drawSection(doc, 'Adv', prescription.advice, '#0f172a');

  if (prescription.followUpDate) {
    doc.moveDown(0.2);
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(TEXT_MUTED).text(`Follow-up Date: `, MARGIN, doc.y, { continued: true });
    doc.font('Helvetica').fillColor(TEXT_DARK).text(fmtDate(prescription.followUpDate));
  }

  const sigY = Math.max(doc.y + 30, PAGE.height - 130);
  doc.moveTo(PAGE.width - MARGIN - 160, sigY).lineTo(PAGE.width - MARGIN, sigY).strokeColor('#94a3b8').stroke();
  doc.fontSize(8).font('Helvetica-Bold').fillColor(TEXT_DARK).text('Doctor Signature', PAGE.width - MARGIN - 160, sigY + 4, { width: 160, align: 'center' });
  doc.fontSize(7.5).font('Helvetica').fillColor(TEXT_MUTED).text(prescription.doctor?.name ? `Dr. ${prescription.doctor.name}` : '', PAGE.width - MARGIN - 160, sigY + 16, { width: 160, align: 'center' });

  doc.end();
};

const generateAppointmentSlipPDF = async (appointment, res, branding) => {
  const b = branding || await brandingService.getBranding();
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=appointment-${appointment._id}.pdf`);
  doc.pipe(res);

  await renderBrandingHeader(doc, b, { title: 'APPOINTMENT SLIP' });

  const y = doc.y;
  doc.fontSize(10).font('Helvetica');
  doc.text(`Patient: ${appointment.patient?.name || ''}`, 50, y);
  doc.text(`Patient ID: ${appointment.patient?.patientId || ''}`, 350, y);
  doc.text(`Doctor: Dr. ${appointment.doctor?.name || 'N/A'}`, 50, y + 18);
  doc.text(`Department: ${appointment.department?.name || 'N/A'}`, 350, y + 18);
  doc.text(`Date: ${new Date(appointment.appointmentDate).toLocaleDateString('en-IN')}`, 50, y + 36);
  doc.text(`Time: ${appointment.appointmentTime || 'N/A'}`, 350, y + 36);
  doc.text(`Type: ${appointment.type || 'new'}`, 50, y + 54);
  doc.text(`Status: ${appointment.status || 'scheduled'}`, 350, y + 54);
  if (appointment.reason) {
    doc.moveDown(2);
    doc.font('Helvetica-Bold').text('Reason:');
    doc.font('Helvetica').text(appointment.reason);
  }
  if (appointment.notes) {
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').text('Notes:');
    doc.font('Helvetica').text(appointment.notes);
  }

  doc.moveDown(2);
  doc.fontSize(9).text('Please arrive 15 minutes before your appointment time.', { align: 'center' });

  doc.end();
};

/** Date like paper: 08/07/2026 AT 12:00PM (date/month/year) */
const fmtDischargeDT = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const timePretty = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase().replace(/\s/g, '');
  return `${dd}/${mm}/${yyyy} AT ${timePretty}`;
};

const fmtDischargeDate = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

const fmtDotDate = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

/** Strip chars PDFKit Times (WinAnsi) can't encode cleanly */
const pdfSafe = (value) => String(value == null ? '' : value)
  .replace(/[\u2010-\u2015\u2212]/g, '-')
  .replace(/[\u2018\u2019]/g, "'")
  .replace(/[\u201C\u201D]/g, '"')
  .replace(/\u2026/g, '...')
  .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '');

const DS_MARGIN = 32;
const DS_INNER = 8;
const DS_FOOTER_H = 14;
const DS_CONTENT_TOP = DS_MARGIN + DS_INNER + 4;
const DS_CONTENT_BOTTOM = PAGE.height - DS_MARGIN - DS_INNER - DS_FOOTER_H;

const fitPdfText = (doc, s, maxW) => {
  let t = pdfSafe(s || '');
  while (t.length > 1 && doc.widthOfString(t) > maxW) t = t.slice(0, -1);
  return t;
};

const drawDischargePageFrame = (doc) => {
  const x = DS_MARGIN;
  const y = DS_MARGIN;
  const w = PAGE.width - DS_MARGIN * 2;
  const h = PAGE.height - DS_MARGIN * 2;
  doc.save();
  doc.lineWidth(1.5).strokeColor('#1e3a8a').rect(x, y, w, h).stroke();
  doc.lineWidth(0.6).strokeColor('#93c5fd').rect(x + 3.5, y + 3.5, w - 7, h - 7).stroke();
  doc.restore();
  doc.x = DS_MARGIN + DS_INNER;
  doc.y = DS_CONTENT_TOP;
};

const drawDischargePageNumbers = (doc) => {
  const range = doc.bufferedPageRange();
  const w = PAGE.width - DS_MARGIN * 2;
  const footerY = PAGE.height - DS_MARGIN - DS_FOOTER_H + 2;
  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(range.start + i);
    doc.save();
    doc.font('Helvetica').fontSize(7).fillColor('#64748b')
      .text(`Page ${i + 1} of ${range.count}`, DS_MARGIN, footerY, {
        width: w,
        align: 'center',
        lineBreak: false,
      });
    doc.restore();
  }
};

/** New page only when content cannot fit — no forced blank pages. */
const ensureDischargeSpace = (doc, need, state) => {
  if (doc.y + need <= DS_CONTENT_BOTTOM) return;
  doc.addPage({ size: 'A4', margin: 0 });
  state.pageNo += 1;
  drawDischargePageFrame(doc);
};

/**
 * Pack tightly: fill remaining page, then continue from top of next page.
 */
const drawDischargeSection = (doc, title, content, state) => {
  const text = pdfSafe(content).trim();
  if (!text || text === '-') return;
  const left = DS_MARGIN + DS_INNER;
  const width = PAGE.width - (DS_MARGIN + DS_INNER) * 2;
  const label = `${String(title).toUpperCase()}:`;

  ensureDischargeSpace(doc, 26, state);
  const headerY = doc.y;
  doc.font('Times-Bold').fontSize(9).fillColor('#111').text(label, left, headerY, { width, lineBreak: false });
  const underlineW = Math.min(doc.widthOfString(label), width);
  doc.moveTo(left, headerY + 10).lineTo(left + underlineW, headerY + 10)
    .lineWidth(0.65).strokeColor('#111').stroke();
  doc.y = headerY + 12;

  let remaining = text;
  doc.font('Times-Roman').fontSize(8.5).fillColor('#111');
  while (remaining) {
    let avail = DS_CONTENT_BOTTOM - doc.y;
    if (avail < 12) {
      ensureDischargeSpace(doc, 40, state);
      avail = DS_CONTENT_BOTTOM - doc.y;
    }

    let lo = 0;
    let hi = remaining.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      const h = doc.heightOfString(remaining.slice(0, mid), { width, lineGap: 1.1 });
      if (h <= avail) lo = mid;
      else hi = mid - 1;
    }
    let fitLen = lo;
    if (fitLen <= 0) {
      ensureDischargeSpace(doc, avail + 20, state);
      continue;
    }
    if (fitLen < remaining.length) {
      const slice = remaining.slice(0, fitLen);
      const breakAt = Math.max(slice.lastIndexOf('\n'), slice.lastIndexOf(' '));
      if (breakAt > fitLen * 0.4) fitLen = breakAt + 1;
    }

    const chunk = remaining.slice(0, fitLen).replace(/\s+$/, '');
    remaining = remaining.slice(fitLen).replace(/^\s+/, '');
    if (chunk) {
      doc.text(chunk, left, doc.y, { width, align: 'left', lineGap: 1.1 });
    }
  }
  doc.moveDown(0.22);
};

const drawDischargeInfoGrid = (doc, rows, state) => {
  const left = DS_MARGIN + DS_INNER;
  const width = PAGE.width - (DS_MARGIN + DS_INNER) * 2;
  const rowH = 16;
  const totalH = rowH * rows.length;
  ensureDischargeSpace(doc, totalH + 6, state);
  const top = doc.y;
  const col2X = left + width / 2;
  const labelW = 76;

  doc.rect(left, top, width, totalH).lineWidth(0.9).strokeColor('#111').stroke();
  doc.moveTo(col2X, top).lineTo(col2X, top + totalH).lineWidth(0.6).strokeColor('#333').stroke();
  for (let i = 1; i < rows.length; i += 1) {
    const y = top + rowH * i;
    doc.moveTo(left, y).lineTo(left + width, y).lineWidth(0.5).strokeColor('#555').stroke();
  }

  rows.forEach((row, i) => {
    const y = top + i * rowH + 4;
    const half = width / 2 - 10;
    const valW = half - labelW;
    doc.font('Times-Bold').fontSize(7.5).fillColor('#111')
      .text(pdfSafe(`${row[0]}:`), left + 4, y, { width: labelW, lineBreak: false });
    doc.font('Times-Roman').fontSize(7.5).fillColor('#111')
      .text(fitPdfText(doc, row[1], valW), left + 4 + labelW, y, { width: valW, lineBreak: false });
    if (row[2]) {
      doc.font('Times-Bold').fontSize(7.5).fillColor('#111')
        .text(pdfSafe(`${row[2]}:`), col2X + 4, y, { width: labelW, lineBreak: false });
      doc.font('Times-Roman').fontSize(7.5).fillColor('#111')
        .text(fitPdfText(doc, row[3], valW), col2X + 4 + labelW, y, { width: valW, lineBreak: false });
    }
  });

  doc.y = top + totalH + 6;
};

const generateDischargeSummaryPDF = async (admission, res, branding) => {
  const b = branding || await brandingService.getBranding();
  const d = admission.dischargeDetails || {};
  const patient = admission.patient || {};
  const ma = d.maternityAdvice || {};
  const ps = d.printSections;
  const sectionOn = (key) => {
    if (ps == null || typeof ps !== 'object' || Array.isArray(ps)) return true;
    return Boolean(ps[key]);
  };
  const includeMaternity = sectionOn('maternityAdvice') && !!(ma.motherCondition || ma.babyCondition || (ma.adviceChecked || []).length);
  const state = { pageNo: 1 };

  const doc = new PDFDocument({
    margin: 0,
    size: 'A4',
    autoFirstPage: true,
    bufferPages: true,
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=discharge-${admission.admissionNumber || admission._id}.pdf`);
  doc.pipe(res);

  drawDischargePageFrame(doc);
  const width = PAGE.width - (DS_MARGIN + DS_INNER) * 2;
  const left = DS_MARGIN + DS_INNER;

  const allergyText = sectionOn('allergyAlert')
    ? pdfSafe(d.allergyAlert || (patient.allergies || []).filter(Boolean).join(', ')).toUpperCase()
    : '';
  if (allergyText) {
    doc.font('Times-Bold').fontSize(8.5).fillColor('#b91c1c')
      .text(allergyText.includes('ALLERGY') ? allergyText : `${allergyText} ALLERGY`, left, doc.y, { width, align: 'center' });
    doc.moveDown(0.12);
  }

  doc.font('Times-Bold').fontSize(14).fillColor('#111')
    .text(pdfSafe((b.hospitalName || 'Hospital').toUpperCase()), left, doc.y, { width, align: 'center' });
  if (b.address) {
    doc.moveDown(0.05);
    doc.font('Times-Roman').fontSize(8).fillColor('#333')
      .text(pdfSafe(b.address), left, doc.y, { width, align: 'center' });
  }
  doc.moveDown(0.18);
  doc.font('Times-Bold').fontSize(10.5).fillColor('#111')
    .text('DISCHARGE SUMMARY', left, doc.y, { width, align: 'center' });
  const titleY = doc.y;
  const titleW = doc.widthOfString('DISCHARGE SUMMARY');
  doc.moveTo((PAGE.width - titleW) / 2, titleY + 1).lineTo((PAGE.width + titleW) / 2, titleY + 1)
    .lineWidth(0.75).strokeColor('#111').stroke();
  doc.moveDown(0.28);

  const consultant = admission.doctor?.name
    ? `DR.${pdfSafe(admission.doctor.name).replace(/^dr\.?\s*/i, '').toUpperCase()}${admission.doctor.specialization ? ` ${pdfSafe(admission.doctor.specialization)}` : ''}`
    : '';
  const ageSex = [
    patient.age != null ? `${patient.age} YRS` : '',
    patient.gender ? String(patient.gender).toUpperCase() : '',
  ].filter(Boolean).join(' / ');

  drawDischargeInfoGrid(doc, [
    ['PATIENT NAME', pdfSafe(patient.name || '').toUpperCase(), 'D.O.A', fmtDischargeDT(admission.admissionDate)],
    ['AGE/SEX', ageSex, 'D.O.DELIVERY', sectionOn('deliveryDate') ? fmtDischargeDT(d.deliveryDate) : ''],
    ['IP.NO', admission.admissionNumber || '', 'D.O.D', fmtDischargeDate(admission.dischargeDate)],
    ['CONSULTANT', consultant, 'DEPARTMENT', pdfSafe(admission.department?.name || '').toUpperCase()],
  ], state);

  const addr = patient.address || {};
  const street = d.addressNote || addr.street || '';
  const cityLine = d.addressNote ? '' : [addr.city, addr.state, addr.pincode].filter(Boolean).join(', ');
  ensureDischargeSpace(doc, 40, state);
  const addrTop = doc.y;
  doc.font('Times-Bold').fontSize(8).fillColor('#111').text('ADDRESS:', left, addrTop, { lineBreak: false });
  doc.font('Times-Roman').fontSize(8).fillColor('#111');
  let ay = addrTop + 10;
  if (street) {
    doc.text(pdfSafe(street).toUpperCase(), left, ay, { width: width * 0.62 });
    ay = doc.y + 1;
  }
  if (cityLine) {
    doc.text(pdfSafe(cityLine).toUpperCase(), left, ay, { width: width * 0.62 });
    ay = doc.y + 1;
  }
  if (!d.addressNote && patient.phone) {
    doc.text(`PH: ${pdfSafe(patient.phone)}`, left, ay, { width: width * 0.62 });
    ay = doc.y + 1;
  }
  let rightY = addrTop;
  if (patient.patientId) {
    doc.font('Times-Bold').fontSize(8)
      .text(`UHID - ${pdfSafe(patient.patientId)}`, left + width * 0.62, rightY, { width: width * 0.38, align: 'right', lineBreak: false });
    rightY += 11;
  }
  const rchId = sectionOn('rchId') ? (d.rchId || patient.rchId) : '';
  if (rchId) {
    doc.font('Times-Bold').fontSize(8)
      .text(`RCH ID - ${pdfSafe(rchId)}`, left + width * 0.62, rightY, { width: width * 0.38, align: 'right', lineBreak: false });
    rightY += 11;
  }
  doc.y = Math.max(ay, rightY) + 4;

  if (sectionOn('diagnosis')) {
    drawDischargeSection(doc, 'Diagnosis', d.diagnosis, state);
  }
  const oh = d.obstetricHistory || {};
  if (sectionOn('menstrualHistory') && (oh.rmp || oh.lmp || oh.edd)) {
    const lines = [];
    if (oh.rmp) lines.push(oh.rmp.toUpperCase().startsWith('RMP') ? oh.rmp : `RMP, ${oh.rmp}`);
    const lmpEdd = [
      oh.lmp ? `LMP - ${fmtDotDate(oh.lmp)}` : null,
      oh.edd ? `EDD - ${fmtDotDate(oh.edd)}` : null,
    ].filter(Boolean).join('    ');
    if (lmpEdd) lines.push(lmpEdd);
    drawDischargeSection(doc, 'Menstrual History', lines.join('\n'), state);
  }
  if (sectionOn('chiefComplaints')) drawDischargeSection(doc, 'Chief Complaints', d.chiefComplaints, state);
  if (sectionOn('pastHistory')) drawDischargeSection(doc, 'Past History', d.pastHistory, state);
  if (sectionOn('physicalExamination')) drawDischargeSection(doc, 'Physical Examination', d.physicalExamination, state);

  const labs = sectionOn('labInvestigations')
    ? (d.labInvestigations || []).filter((r) => r && String(r.report || '').trim())
    : [];
  if (labs.length) {
    ensureDischargeSpace(doc, 24, state);
    const labLabel = 'LABORATORY INVESTIGATION REPORTS:';
    const ly = doc.y;
    doc.font('Times-Bold').fontSize(9).fillColor('#111').text(labLabel, left, ly, { lineBreak: false });
    doc.moveTo(left, ly + 10).lineTo(left + doc.widthOfString(labLabel), ly + 10).lineWidth(0.65).strokeColor('#111').stroke();
    doc.y = ly + 12;
    const half = width / 2 - 4;
    for (let i = 0; i < labs.length; i += 2) {
      ensureDischargeSpace(doc, 12, state);
      const a = labs[i];
      const bRow = labs[i + 1];
      const y = doc.y;
      doc.font('Times-Roman').fontSize(7.5).fillColor('#111');
      doc.text(fitPdfText(doc, `NAME: ${pdfSafe(a.name || '')}   REPORT: ${pdfSafe(a.report || '')}`, half), left, y, { width: half, lineBreak: false });
      if (bRow) {
        doc.text(fitPdfText(doc, `NAME: ${pdfSafe(bRow.name || '')}   REPORT: ${pdfSafe(bRow.report || '')}`, half), left + half + 8, y, { width: half, lineBreak: false });
      }
      doc.y = y + 11;
    }
    doc.moveDown(0.15);
  }

  if (sectionOn('echoReport')) drawDischargeSection(doc, 'Echo / Imaging', d.echoReport, state);
  if (sectionOn('investigationsNote') && d.investigationsNote) {
    ensureDischargeSpace(doc, 16, state);
    doc.font('Times-Italic').fontSize(8).fillColor('#333')
      .text(pdfSafe(d.investigationsNote), left, doc.y, { width });
    doc.moveDown(0.18);
  }
  if (sectionOn('hospitalCourse')) drawDischargeSection(doc, 'Course of Treatment in Hospital', d.hospitalCourse, state);
  if (sectionOn('babyDetails')) drawDischargeSection(doc, 'Baby Details', d.babyDetails, state);
  if (sectionOn('postnatalPeriod') || sectionOn('hospitalMedications')) {
    const pn = [
      sectionOn('postnatalPeriod') ? d.postnatalPeriod : null,
      sectionOn('hospitalMedications') ? d.hospitalMedications : null,
    ].filter(Boolean).join('\n');
    if (pn) drawDischargeSection(doc, 'Postnatal Period', pn, state);
  }
  if (sectionOn('conditionOnDischarge')) drawDischargeSection(doc, 'Condition on Discharge', d.conditionOnDischarge, state);

  if (sectionOn('pvStatus') && d.pvStatus) {
    ensureDischargeSpace(doc, 14, state);
    doc.font('Times-Roman').fontSize(8.5).fillColor('#111').text(pdfSafe(d.pvStatus), left, doc.y, { width });
    doc.moveDown(0.18);
  }
  if (sectionOn('medicationsOnDischarge')) drawDischargeSection(doc, 'Further Advice on Discharge', d.medicationsOnDischarge, state);
  [sectionOn('motherWarnings') && d.motherWarnings, sectionOn('dietaryAdvice') && d.dietaryAdvice, sectionOn('babyWarnings') && d.babyWarnings].filter(Boolean).forEach((txt) => {
    ensureDischargeSpace(doc, 14, state);
    doc.font('Times-Roman').fontSize(8).fillColor('#111').text(pdfSafe(txt), left, doc.y, { width });
    doc.moveDown(0.15);
  });
  if (sectionOn('immunizationNote') && d.immunizationNote) {
    ensureDischargeSpace(doc, 12, state);
    doc.font('Times-Bold').fontSize(8).text(pdfSafe(d.immunizationNote), left, doc.y, { width });
    doc.moveDown(0.12);
  }
  if (sectionOn('supplementsAdvice') && d.supplementsAdvice) {
    ensureDischargeSpace(doc, 12, state);
    doc.font('Times-Bold').fontSize(8).text(pdfSafe(String(d.supplementsAdvice).toUpperCase()), left, doc.y, { width });
    doc.moveDown(0.12);
  }
  if (sectionOn('babyLabAdvice') && d.babyLabAdvice) {
    ensureDischargeSpace(doc, 14, state);
    doc.font('Times-Roman').fontSize(8).text(pdfSafe(d.babyLabAdvice), left, doc.y, { width });
    doc.moveDown(0.15);
  }
  if (sectionOn('customInstructions')) drawDischargeSection(doc, 'Additional Instructions', d.customInstructions, state);
  if (sectionOn('reviewAppointment') && d.reviewAppointment) {
    ensureDischargeSpace(doc, 12, state);
    doc.font('Times-Roman').fontSize(8).text(`• ${pdfSafe(d.reviewAppointment)}`, left, doc.y, { width });
    doc.moveDown(0.12);
  }
  if (sectionOn('emergencyContact') && d.emergencyContact) {
    ensureDischargeSpace(doc, 12, state);
    doc.font('Times-Roman').fontSize(8).text(`• ${pdfSafe(d.emergencyContact)}`, left, doc.y, { width });
    doc.moveDown(0.18);
  }

  [
    ['treatmentGiven', 'Treatment Given', d.treatmentGiven],
    ['clinicalFindings', 'Clinical Findings', d.clinicalFindings],
    ['procedures', 'Procedure', d.procedures],
    ['followUpAdvice', 'Follow-up Advice', d.followUpAdvice],
    ['dischargeInstructions', 'Discharge Instructions', d.dischargeInstructions],
  ].forEach(([key, title, content]) => {
    if (sectionOn(key)) drawDischargeSection(doc, title, content, state);
  });

  if (sectionOn('adminFlags') && (d.dama === 'Yes' || d.referred === 'Yes' || d.absconded === 'Yes' || d.death === 'Yes' || d.remarks)) {
    const flags = [
      d.dama === 'Yes' ? 'DAMA: Yes' : null,
      d.referred === 'Yes' ? `Referred to ${d.referredTo || '-'}` : null,
      d.absconded === 'Yes' ? 'Absconded: Yes' : null,
      d.death === 'Yes' ? 'Death: Yes' : null,
      d.remarks || null,
    ].filter(Boolean).join('\n');
    drawDischargeSection(doc, 'Remarks', flags, state);
  }

  ensureDischargeSpace(doc, 58, state);
  const sigY = doc.y + 10;
  doc.font('Times-Roman').fontSize(8).fillColor('#111')
    .text(`Date: ${fmtDischargeDate(admission.dischargeDate || new Date())}`, left, sigY, { lineBreak: false });
  doc.moveTo(PAGE.width - DS_MARGIN - DS_INNER - 140, sigY + 20)
    .lineTo(PAGE.width - DS_MARGIN - DS_INNER, sigY + 20)
    .strokeColor('#333').lineWidth(0.65).stroke();
  doc.font('Times-Bold').fontSize(7.5)
    .text('Consultant Signature', PAGE.width - DS_MARGIN - DS_INNER - 140, sigY + 24, { width: 140, align: 'center', lineBreak: false });
  if (admission.doctor?.name) {
    doc.font('Times-Roman').fontSize(7.5)
      .text(`Dr. ${pdfSafe(admission.doctor.name)}`, PAGE.width - DS_MARGIN - DS_INNER - 140, sigY + 35, { width: 140, align: 'center', lineBreak: false });
    if (admission.doctor.specialization) {
      doc.font('Times-Roman').fontSize(7)
        .text(pdfSafe(admission.doctor.specialization), PAGE.width - DS_MARGIN - DS_INNER - 140, sigY + 45, { width: 140, align: 'center', lineBreak: false });
    }
  }

  if (includeMaternity) {
    const { drawMaternityDischargeAdvicePage } = require('./maternityDischargePage');
    drawMaternityDischargeAdvicePage(doc, PAGE, DS_MARGIN, ma);
  }

  drawDischargePageNumbers(doc);
  doc.end();
};


module.exports = {
  generateInvoicePDF,
  generateThermalPrint,
  generateLabReportPDF,
  generatePrescriptionPDF,
  generateAppointmentSlipPDF,
  generateDischargeSummaryPDF,
};
