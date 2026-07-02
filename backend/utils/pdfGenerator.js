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
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=prescription-${prescription._id}.pdf`);
  doc.pipe(res);

  await renderBrandingHeader(doc, b, { title: 'PRESCRIPTION' });

  const y = doc.y;
  doc.fontSize(10).font('Helvetica');
  doc.text(`Date: ${new Date(prescription.createdAt).toLocaleDateString('en-IN')}`, 50, y);
  doc.text(`Patient: ${prescription.patient?.name || ''}`, 50, y + 18);
  doc.text(`Patient ID: ${prescription.patient?.patientId || ''}`, 350, y + 18);
  doc.text(`Doctor: Dr. ${prescription.doctor?.name || 'N/A'}`, 50, y + 36);
  if (prescription.diagnosis) doc.text(`Diagnosis: ${prescription.diagnosis}`, 50, y + 54);
  doc.moveDown(4);

  doc.font('Helvetica-Bold').fontSize(10).text('Medicines');
  doc.moveDown(0.3);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();f
  doc.moveDown(0.3);

  (prescription.medicines || []).forEach((med, i) => {
    const medY = doc.y;
    doc.font('Helvetica-Bold').fontSize(9).text(`${i + 1}. ${med.medicineName || med.medicine?.name || 'Medicine'}`, 50, medY);
    doc.font('Helvetica').fontSize(9);
    const details = [
      med.dosage && `Dosage: ${med.dosage}`,
      med.frequency && `Frequency: ${med.frequency}`,
      med.duration && `Duration: ${med.duration}`,
      med.route && `Route: ${med.route}`,
      med.quantity && `Qty: ${med.quantity}`,
    ].filter(Boolean).join(' | ');
    if (details) doc.text(details, 60, medY + 14, { width: 480 });
    if (med.instructions) doc.text(`Instructions: ${med.instructions}`, 60, doc.y + 4, { width: 480 });
    doc.moveDown(1);
  });

  if (prescription.advice) {
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').text('Advice:');
    doc.font('Helvetica').text(prescription.advice);
  }
  if (prescription.followUpDate) {
    doc.moveDown(0.5);
    doc.text(`Follow-up Date: ${new Date(prescription.followUpDate).toLocaleDateString('en-IN')}`);
  }

  doc.moveDown(2);
  doc.text('Doctor Signature: ___________________', 350);

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

const generateDischargeSummaryPDF = async (admission, res, branding) => {
  const b = branding || await brandingService.getBranding();
  const doc = new PDFDocument({ margin: MARGIN, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=discharge-${admission.admissionNumber || admission._id}.pdf`);
  doc.pipe(res);

  await renderBrandingHeader(doc, b, { title: 'DISCHARGE SUMMARY', compact: true });

  const d = admission.dischargeDetails || {};
  const py = doc.y;
  doc.roundedRect(MARGIN, py, PAGE.width - MARGIN * 2, 88, 4).lineWidth(0.75).strokeColor('#bfdbfe').stroke();
  doc.fontSize(8.5).font('Helvetica-Bold').fillColor(TEXT_MUTED);
  const info = [
    ['Patient Name', admission.patient?.name, 'UHID', admission.patient?.patientId],
    ['Age / Gender', `${admission.patient?.age || 'N/A'} / ${admission.patient?.gender || 'N/A'}`, 'Admission No.', admission.admissionNumber],
    ['Consultant Doctor', `Dr. ${admission.doctor?.name || 'N/A'}`, 'Department', admission.department?.name],
    ['Admission Date', fmtDate(admission.admissionDate), 'Discharge Date', fmtDate(admission.dischargeDate)],
  ];
  info.forEach((row, i) => {
    const yPos = py + 10 + i * 18;
    doc.text(`${row[0]}:`, MARGIN + 10, yPos, { width: 90 });
    doc.font('Helvetica').fillColor(TEXT_DARK).text(row[1] || 'N/A', MARGIN + 100, yPos, { width: 150 });
    doc.font('Helvetica-Bold').fillColor(TEXT_MUTED).text(`${row[2]}:`, MARGIN + 270, yPos, { width: 90 });
    doc.font('Helvetica').fillColor(TEXT_DARK).text(row[3] || 'N/A', MARGIN + 360, yPos, { width: 150 });
    doc.font('Helvetica-Bold').fillColor(TEXT_MUTED);
  });
  doc.y = py + 96;
  doc.moveDown(0.3);

  const sections = [
    ['Diagnosis', d.diagnosis || admission.finalDiagnosis],
    ['Treatment Given', d.treatmentGiven],
    ['Procedures', d.procedures],
    ['Clinical Findings', d.clinicalFindings],
    ['Hospital Course', d.hospitalCourse],
    ['Medications On Discharge', d.medicationsOnDischarge],
    ['Follow-up Advice', d.followUpAdvice],
    ['Discharge Instructions', d.dischargeInstructions],
  ];
  sections.forEach(([title, content]) => drawSection(doc, title, content || (title === 'Diagnosis' ? admission.admissionDiagnosis : null)));

  if (!d.diagnosis && admission.dischargeSummary) {
    drawSection(doc, 'Discharge Summary', admission.dischargeSummary);
  }

  const sigY = doc.y + 20;
  doc.moveTo(MARGIN, sigY).lineTo(MARGIN + 160, sigY).strokeColor('#94a3b8').stroke();
  doc.fontSize(8).font('Helvetica-Bold').fillColor(TEXT_DARK).text('Consultant Doctor Signature', MARGIN, sigY + 4);
  doc.fontSize(7).font('Helvetica').fillColor(TEXT_MUTED).text(`Dr. ${admission.doctor?.name || ''}`, MARGIN, sigY + 16);

  doc.roundedRect(MARGIN + 220, sigY - 10, 100, 50, 3).dash(3).strokeColor('#94a3b8').stroke().undash();
  doc.fontSize(7).fillColor(TEXT_MUTED).text('Hospital Seal', MARGIN + 248, sigY + 8);

  doc.fontSize(8).text(`Date: ${fmtDate(admission.dischargeDate || new Date())}`, MARGIN + 360, sigY + 4);

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
