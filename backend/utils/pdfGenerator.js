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

const generateInvoicePDF = async (bill, res, branding) => generatePremiumInvoicePDF(bill, res, branding);
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
    .map((group) => ({ ...group, rows: group.rows.filter((row) => row.value || row.unit || row.normalRange) }))
    .filter((group) => group.rows.length);
  const resultGroups = groupedRows.length
    ? groupedRows
    : [{ title: labTest.tests?.[0]?.testName || 'RESULTS', rows: labTest.results || [] }];
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
    ['Analysis Date', reportDate || '-'],
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
  doc.font('Helvetica').fontSize(7).fillColor('#64748b').text('Verified by', margin, signatureY, { width: 150 });
  doc.moveTo(margin, signatureY + 20).lineTo(margin + 145, signatureY + 20).strokeColor('#94a3b8').stroke();
  doc.font('Helvetica-Bold').fontSize(7).fillColor('#111827').text(printedBy, margin, signatureY + 24, { width: 150 });
  doc.font('Helvetica').fontSize(7).fillColor('#64748b').text('Authorized Signatory', pageWidth - margin - 160, signatureY, { width: 160, align: 'right' });
  doc.moveTo(pageWidth - margin - 145, signatureY + 20).lineTo(pageWidth - margin, signatureY + 20).strokeColor('#94a3b8').stroke();

  const footerY = pageHeight - 66;
  doc.moveTo(margin, footerY).lineTo(pageWidth - margin, footerY).lineWidth(0.6).strokeColor('#d1d5db').stroke();
  doc.font('Helvetica').fontSize(6.7).fillColor('#4b5563');
  doc.text(b.footerNote || 'Thank you for choosing our hospital.', margin, footerY + 5, { width: contentWidth, align: 'center' });
  doc.text(`Printed on ${fmtDateTime(new Date())} | Printed by ${printedBy}`, margin, footerY + 17, { width: contentWidth / 2 });
  doc.text(`Lab No: ${labTest.labNumber || '-'}`, margin + contentWidth / 2, footerY + 17, { width: contentWidth / 2, align: 'right' });

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

/** Date like paper: 08/07/26 AT 12:00PM */
const fmtDischargeDT = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  const timePretty = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase().replace(/\s/g, '');
  return `${dd}/${mm}/${yy} AT ${timePretty}`;
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
  return `${dd}.${mm}.${yyyy}`;
};

// Bordered patient grid matching the printed discharge form (4 rows × 2 cols)
const drawInfoGrid = (doc, rows) => {
  const width = PAGE.width - MARGIN * 2;
  const rowH = 20;
  const top = doc.y;
  const colLabelW = 88;
  const col1X = MARGIN;
  const col2X = MARGIN + width / 2;

  doc.rect(MARGIN, top, width, rowH * rows.length).lineWidth(1).strokeColor('#111111').stroke();
  doc.moveTo(col2X, top).lineTo(col2X, top + rowH * rows.length).lineWidth(0.7).strokeColor('#111111').stroke();
  for (let i = 1; i < rows.length; i += 1) {
    const y = top + rowH * i;
    doc.moveTo(MARGIN, y).lineTo(MARGIN + width, y).lineWidth(0.6).strokeColor('#333333').stroke();
  }

  rows.forEach((row, i) => {
    const y = top + i * rowH + 6;
    doc.font('Times-Bold').fontSize(9).fillColor('#111').text(`${row[0]}:`, col1X + 6, y, { width: colLabelW, lineBreak: false });
    doc.font('Times-Roman').fontSize(9).fillColor('#111').text(row[1] || '', col1X + 6 + colLabelW, y, {
      width: width / 2 - colLabelW - 14,
      lineBreak: false,
    });
    if (row[2]) {
      doc.font('Times-Bold').fontSize(9).fillColor('#111').text(`${row[2]}:`, col2X + 6, y, { width: colLabelW, lineBreak: false });
      doc.font('Times-Roman').fontSize(9).fillColor('#111').text(row[3] || '', col2X + 6 + colLabelW, y, {
        width: width / 2 - colLabelW - 14,
        lineBreak: false,
      });
    }
  });

  doc.y = top + rowH * rows.length + 12;
};

// Underlined bold section header + body text (exact paper style)
const drawUnderlinedSection = (doc, title, content) => {
  if (content === undefined || content === null || content === '') return;
  const width = PAGE.width - MARGIN * 2;
  const headerY = doc.y;
  const label = `${String(title).toUpperCase()}:`;
  doc.font('Times-Bold').fontSize(10).fillColor('#111').text(label, MARGIN, headerY, { continued: false });
  const headerWidth = doc.widthOfString(label);
  doc.moveTo(MARGIN, headerY + 12).lineTo(MARGIN + headerWidth, headerY + 12).lineWidth(0.8).strokeColor('#111').stroke();
  doc.moveDown(0.25);
  doc.font('Times-Roman').fontSize(9.5).fillColor('#111').text(String(content), MARGIN, doc.y, { width, align: 'left' });
  doc.moveDown(0.55);
};

const generateDischargeSummaryPDF = async (admission, res, branding) => {
  const b = branding || await brandingService.getBranding();
  const doc = new PDFDocument({ margin: MARGIN, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=discharge-${admission.admissionNumber || admission._id}.pdf`);
  doc.pipe(res);

  const d = admission.dischargeDetails || {};
  const patient = admission.patient || {};
  const width = PAGE.width - MARGIN * 2;

  // ── Allergy alert (top of paper) ──────────────────────────────────
  const allergyText = (patient.allergies || []).filter(Boolean).join(', ').toUpperCase();
  if (allergyText) {
    doc.font('Times-Bold').fontSize(10).fillColor('#111')
      .text(allergyText.includes('ALLERGY') ? allergyText : `${allergyText} ALLERGY`, MARGIN, doc.y, { width, align: 'center' });
    doc.moveDown(0.35);
  }

  // ── Hospital letterhead (name + address only — matches paper) ─────
  doc.font('Times-Bold').fontSize(18).fillColor('#111')
    .text((b.hospitalName || 'Hospital').toUpperCase(), MARGIN, doc.y, { width, align: 'center' });
  if (b.address) {
    doc.moveDown(0.15);
    doc.font('Times-Roman').fontSize(10).fillColor('#111')
      .text(b.address, MARGIN, doc.y, { width, align: 'center' });
  }
  doc.moveDown(0.45);
  doc.font('Times-Bold').fontSize(13).fillColor('#111')
    .text('DISCHARGE SUMMARY', MARGIN, doc.y, { width, align: 'center' });
  doc.moveDown(0.55);

  // ── Patient info grid (exact paper rows) ──────────────────────────
  const consultant = admission.doctor?.name
    ? `DR.${admission.doctor.name.replace(/^dr\.?\s*/i, '').toUpperCase()}${admission.doctor.specialization ? ` ${admission.doctor.specialization}` : ''}`
    : '';
  const ageSex = [
    patient.age != null ? `${patient.age} YRS` : '',
    patient.gender ? String(patient.gender).toUpperCase() : '',
  ].filter(Boolean).join(' / ');

  drawInfoGrid(doc, [
    ['PATIENT NAME', (patient.name || '').toUpperCase(), 'D.O.A', fmtDischargeDT(admission.admissionDate)],
    ['AGE/SEX', ageSex, 'D.O.DELIVERY', fmtDischargeDT(d.deliveryDate)],
    ['IP.NO', admission.admissionNumber || '', 'D.O.D', fmtDischargeDate(admission.dischargeDate)],
    ['CONSULTANT', consultant, 'DEPARTMENT', (admission.department?.name || '').toUpperCase()],
  ]);

  // ── Address (left) + UHID / RCH ID (right) ────────────────────────
  const addr = patient.address || {};
  const street = addr.street || '';
  const cityLine = [addr.city, addr.state, addr.pincode].filter(Boolean).join(', ');
  const addrTop = doc.y;
  doc.font('Times-Bold').fontSize(9.5).fillColor('#111').text('ADDRESS:', MARGIN, addrTop);
  doc.font('Times-Roman').fontSize(9.5).fillColor('#111');
  let ay = addrTop + 13;
  if (street) { doc.text(street.toUpperCase(), MARGIN, ay, { width: 300 }); ay = doc.y + 1; }
  if (cityLine) { doc.text(cityLine.toUpperCase(), MARGIN, ay, { width: 300 }); ay = doc.y + 1; }
  if (patient.phone) { doc.text(`PH: ${patient.phone}`, MARGIN, ay, { width: 300 }); ay = doc.y + 1; }

  let rightY = addrTop;
  if (patient.patientId) {
    doc.font('Times-Bold').fontSize(9.5).fillColor('#111')
      .text(`UHID - ${patient.patientId}`, MARGIN + 320, rightY, { width: 180, align: 'right' });
    rightY += 14;
  }
  if (patient.rchId) {
    doc.font('Times-Bold').fontSize(9.5).fillColor('#111')
      .text(`RCH ID - ${patient.rchId}`, MARGIN + 320, rightY, { width: 180, align: 'right' });
  }
  doc.y = Math.max(ay, rightY + 14) + 8;

  // ── Clinical sections (paper order) ───────────────────────────────
  drawUnderlinedSection(doc, 'Diagnosis', d.diagnosis || admission.finalDiagnosis || admission.admissionDiagnosis);

  const oh = d.obstetricHistory || {};
  if (oh.rmp || oh.lmp || oh.edd) {
    const lines = [];
    if (oh.rmp) lines.push(oh.rmp.toUpperCase().startsWith('RMP') ? oh.rmp : `RMP, ${oh.rmp}`);
    const lmpEdd = [
      oh.lmp ? `LMP - ${fmtDotDate(oh.lmp)}` : null,
      oh.edd ? `EDD - ${fmtDotDate(oh.edd)}` : null,
    ].filter(Boolean).join('    ');
    if (lmpEdd) lines.push(lmpEdd);
    drawUnderlinedSection(doc, 'Menstrual History', lines.join('\n'));
  }

  drawUnderlinedSection(doc, 'Chief Complaints', d.chiefComplaints);
  drawUnderlinedSection(doc, 'Past History', d.pastHistory || 'Nil relevant');
  drawUnderlinedSection(doc, 'Physical Examination', d.physicalExamination);

  // Optional extra clinical blocks (only if filled)
  [
    ['Clinical Findings', d.clinicalFindings],
    ['Procedure', d.procedures],
    ['Treatment Given', d.treatmentGiven],
    ['Course Given', d.hospitalCourse],
    ['Medications On Discharge', d.medicationsOnDischarge],
    ['Follow-up Advice', d.followUpAdvice],
    ['Discharge Instructions', d.dischargeInstructions],
  ].forEach(([title, content]) => {
    if (content) drawUnderlinedSection(doc, title, content);
  });

  if (d.dama === 'Yes' || d.referred === 'Yes' || d.absconded === 'Yes' || d.death === 'Yes') {
    const flags = [
      d.dama === 'Yes' ? 'DAMA: Yes' : null,
      d.referred === 'Yes' ? `Referred to ${d.referredTo || '—'}` : null,
      d.absconded === 'Yes' ? 'Absconded: Yes' : null,
      d.death === 'Yes' ? 'Death: Yes' : null,
    ].filter(Boolean).join('\n');
    if (flags) drawUnderlinedSection(doc, 'Remarks', [flags, d.remarks].filter(Boolean).join('\n'));
  } else if (d.remarks) {
    drawUnderlinedSection(doc, 'Remarks', d.remarks);
  }

  // ── Signature ─────────────────────────────────────────────────────
  const sigY = Math.max(doc.y + 28, 720);
  doc.font('Times-Roman').fontSize(9).fillColor('#111')
    .text(`Date: ${fmtDischargeDate(admission.dischargeDate || new Date())}`, MARGIN, sigY);
  doc.moveTo(PAGE.width - MARGIN - 170, sigY + 28).lineTo(PAGE.width - MARGIN, sigY + 28).strokeColor('#333').stroke();
  doc.font('Times-Bold').fontSize(8).text('Consultant Signature', PAGE.width - MARGIN - 170, sigY + 32, { width: 170, align: 'center' });
  if (admission.doctor?.name) {
    doc.font('Times-Roman').fontSize(8)
      .text(`Dr. ${admission.doctor.name}`, PAGE.width - MARGIN - 170, sigY + 44, { width: 170, align: 'center' });
  }

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
