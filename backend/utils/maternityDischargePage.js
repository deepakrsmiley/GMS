/**
 * Maternity discharge advice page (page 2 of discharge summary).
 * Matches the hospital paper form: mother/baby condition, advice checkboxes,
 * danger symptoms, discharge drugs, referral block.
 */

const MOTHER_CONDITIONS = ['Live and Healthy', 'Maternal Death', 'Referral'];
const BABY_CONDITIONS = ['Live and Healthy', 'Still Birth', 'Newborn Death', 'Referral'];

const ADVICE_ITEMS = [
  'Rest',
  'Nutritious diet',
  'Plenty of oral fluids',
  'Continue previous medications, if had been prescribed',
  'Exclusive Breast feeding for six months',
  "No Water / honey / cow's milk for baby",
  'Dry cord care',
  'Burping after breastfeeding',
  'Maintaining warmth for baby',
  'Counselling on danger symptoms for mother and baby',
  'Hand hygiene and Perineal hygiene',
  'Maintain ambulation and COVID Appropriate Behaviour',
  'Regular Immunization for baby as per schedule',
  'Step down admission to CHC / PHC',
];

const DANGER_MOTHER = [
  'Excessive bleeding / Severe abdominal pain',
  'Severe headache or visual disturbance',
  'Breathing difficulty / Cough',
  'Fever or chills',
  'Breast Swelling / Pain / unable to feed baby',
  'Difficulty in passing urine / decreased urine output',
  'Foul smelling vaginal discharge',
  'Leg Pain or Swelling',
  'Feels unhappy / cries easily / Sleep Disturbance',
  'Excessive tiredness and not feeling well',
];

const DANGER_BABY = [
  'Fast / Difficulty breathing',
  'Fever / Unusually cold',
  'Stops feeding / Poor feeding',
  'Less activity than normal / Lethargy',
  'Palms / Soles becomes yellow or blue',
  'Vomiting / Diarrhoea / Abdomen distension',
  'Swollen, Red / Purulent eyes',
  'Redness / Discharge from umbilicus',
  'Skin boils / Infection',
  'Convulsions',
];

const drawBox = (doc, x, y, w, h) => {
  doc.rect(x, y, w, h).lineWidth(0.7).strokeColor('#111').stroke();
};

const drawCheckbox = (doc, x, y, checked) => {
  doc.rect(x, y, 7, 7).lineWidth(0.6).strokeColor('#111').stroke();
  if (checked) {
    doc.moveTo(x + 1.2, y + 3.5).lineTo(x + 3, y + 5.5).lineTo(x + 5.8, y + 1.5)
      .lineWidth(1).strokeColor('#111').stroke();
  }
};

const markCondition = (selected, options) =>
  options.map((o) => (o === selected ? `[✓] ${o}` : `[ ] ${o}`)).join('  /  ');

const fmtReviewDate = (v) => {
  if (!v) return '_______________';
  const s = String(v);
  // yyyy-mm-dd from <input type="date">
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return s;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
};

/**
 * Draws the full maternity advice page on a new PDF page.
 */
function drawMaternityDischargeAdvicePage(doc, page, margin, maternityAdvice = {}) {
  const m = maternityAdvice || {};
  const checkedSet = new Set((m.adviceChecked || []).map((v) => Number(v)));
  const width = page.width - margin * 2;
  const colGap = 0;
  const leftW = (width - colGap) * 0.52;
  const rightW = width - leftW;
  const leftX = margin;
  const rightX = margin + leftW;

  doc.addPage({ size: 'A4', margin });
  let y = margin - 8;

  // Outer full-page border
  const pageBottom = page.height - margin + 8;
  drawBox(doc, margin, y, width, pageBottom - y);

  // ── Top: Condition mother / baby ──────────────────────────────────
  const topH = 38;
  doc.moveTo(rightX, y).lineTo(rightX, y + topH).lineWidth(0.7).strokeColor('#111').stroke();
  doc.moveTo(margin, y + topH).lineTo(margin + width, y + topH).stroke();

  doc.font('Helvetica-Bold').fontSize(8).fillColor('#111')
    .text('Condition of mother at discharge:', leftX + 4, y + 4, { width: leftW - 8 });
  doc.font('Helvetica').fontSize(7)
    .text(markCondition(m.motherCondition, MOTHER_CONDITIONS), leftX + 4, y + 16, { width: leftW - 8 });
  doc.font('Helvetica-Bold').fontSize(8)
    .text('Condition of baby at discharge:', rightX + 4, y + 4, { width: rightW - 8 });
  doc.font('Helvetica').fontSize(7)
    .text(markCondition(m.babyCondition, BABY_CONDITIONS), rightX + 4, y + 16, { width: rightW - 8 });
  y += topH;

  // ── Main two-column advice / danger ───────────────────────────────
  const midTop = y;
  const midH = 420;
  doc.moveTo(rightX, midTop).lineTo(rightX, midTop + midH).lineWidth(0.7).strokeColor('#111').stroke();
  doc.moveTo(margin, midTop + midH).lineTo(margin + width, midTop + midH).stroke();

  // Left column content
  let ly = midTop + 5;
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#111')
    .text('Advice on discharge / Referral:', leftX + 4, ly, { width: leftW - 8 });
  ly += 12;

  ADVICE_ITEMS.forEach((item, idx) => {
    drawCheckbox(doc, leftX + 5, ly + 0.5, checkedSet.has(idx));
    doc.font('Helvetica').fontSize(7).fillColor('#111')
      .text(item, leftX + 15, ly, { width: leftW - 20 });
    ly += 12;
  });

  ly += 3;
  doc.font('Helvetica').fontSize(7)
    .text(`Review date ${fmtReviewDate(m.reviewDate)} / Immediately if any danger symptoms present`, leftX + 4, ly, { width: leftW - 8 });
  ly += 14;

  doc.font('Helvetica-Bold').fontSize(8)
    .text('Discharge Drugs for Mother', leftX + 4, ly, { width: leftW - 8 });
  ly += 12;

  const drugs = m.dischargeDrugs || {};
  const drugLines = [
    `6. Tab. Iron ${drugs.iron || '___ - ___ - ___'} x ${drugs.ironDays || '___'} days (Before food)`,
    `7. Tab. Calcium & Vit. D3 ${drugs.calcium || '1 - 1 - 0'} x ${drugs.calciumDays || '___'} days (After food)`,
    `8. ${drugs.line8 || '_______________________________________________'}`,
    `9. ${drugs.line9 || '_______________________________________________'}`,
    `10. ${drugs.line10 || '______________________________________________'}`,
  ];
  drugLines.forEach((line) => {
    doc.font('Helvetica').fontSize(7).text(line, leftX + 4, ly, { width: leftW - 8 });
    ly += 11;
  });

  // Right column — danger symptoms
  let ry = midTop + 5;
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#111')
    .text('Danger Symptoms for mother', rightX + 4, ry, { width: rightW - 8 });
  ry += 12;
  DANGER_MOTHER.forEach((item) => {
    doc.font('Helvetica').fontSize(7).text(`•  ${item}`, rightX + 4, ry, { width: rightW - 8 });
    ry += 12.5;
  });
  ry += 6;
  doc.font('Helvetica-Bold').fontSize(8)
    .text('Danger Symptoms for Baby', rightX + 4, ry, { width: rightW - 8 });
  ry += 12;
  DANGER_BABY.forEach((item) => {
    doc.font('Helvetica').fontSize(7).text(`•  ${item}`, rightX + 4, ry, { width: rightW - 8 });
    ry += 12.5;
  });

  y = midTop + midH;

  // ── If referred ───────────────────────────────────────────────────
  const ref = m.referral || {};
  const refH = 72;
  doc.moveTo(margin, y + refH).lineTo(margin + width, y + refH).lineWidth(0.7).strokeColor('#111').stroke();
  doc.font('Helvetica-Bold').fontSize(8).text('If referred:', margin + 4, y + 4);
  const half = width * 0.55;
  let rfy = y + 16;
  [
    `Name of facility referred to : ${ref.facility || '.............................................'}`,
    `Mode of Referral : ${ref.mode || '.............................................................'}`,
    `Reason for referral : ${ref.reason || '...........................................................'}`,
  ].forEach((line) => {
    doc.font('Helvetica').fontSize(7).text(line, margin + 4, rfy, { width: half - 8 });
    rfy += 14;
  });
  const yesNo = (v) => (v === 'Yes' || v === 'No' ? v : 'Yes / No');
  doc.font('Helvetica').fontSize(7)
    .text(`Advance notification given – ${yesNo(ref.advanceNotification)}`, margin + half, y + 16, { width: width - half - 8 });
  doc.font('Helvetica').fontSize(7)
    .text(`Accompanied by Health Care Provider with Emergency Drug tray / Delivery tray – ${yesNo(ref.accompanied)}`, margin + half, y + 40, { width: width - half - 8 });
  y += refH;

  // ── Condition at Referral ─────────────────────────────────────────
  const vitH = 68;
  doc.moveTo(margin, y + vitH).lineTo(margin + width, y + vitH).lineWidth(0.7).strokeColor('#111').stroke();
  doc.font('Helvetica-Bold').fontSize(8)
    .text('Condition at Referral  Consciousness / Temperature / Pulse / RR / BP / Others', margin + 4, y + 4, { width: width - 8 });
  if (m.referralVitals) {
    doc.font('Helvetica').fontSize(8).text(String(m.referralVitals), margin + 6, y + 18, { width: width - 12 });
  }
  y += vitH;

  // ── Treatment given with time ─────────────────────────────────────
  doc.font('Helvetica-Bold').fontSize(8)
    .text('Treatment given with time:', margin + 4, y + 4);
  if (m.treatmentGivenAtReferral) {
    doc.font('Helvetica').fontSize(8)
      .text(String(m.treatmentGivenAtReferral), margin + 6, y + 18, { width: width - 12 });
  }
}

module.exports = {
  MOTHER_CONDITIONS,
  BABY_CONDITIONS,
  ADVICE_ITEMS,
  DANGER_MOTHER,
  DANGER_BABY,
  drawMaternityDischargeAdvicePage,
};
