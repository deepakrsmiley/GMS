import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { hasRole } from '../utils/roles';
import { Plus, Printer, FlaskConical, Clock, CheckCircle, Eye, ChevronDown } from 'lucide-react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import api from '../services/api';
import Modal from '../components/common/Modal';
import DataTable from '../components/common/DataTable';

// ─── Lab Profiles ─────────────────────────────────────────────────────────────
// Each lab has sub-tests with unit + normalRange pre-filled.
// Lab technician picks from the LAB_PROFILES dropdown.
const LAB_PROFILES = {
  'CBC (Complete Blood Count)': [
    { testName: 'WBC', unit: '10³/mm³', normalRange: '4.1 – 11.1' },
    { testName: 'LYM%', unit: '%', normalRange: '16.0 – 46.0' },
    { testName: 'MON%', unit: '%', normalRange: '2.3 – 8.5' },
    { testName: 'GRA%', unit: '%', normalRange: '48.7 – 81.2' },
    { testName: 'LYM#', unit: '10³/mm³', normalRange: '1.20 – 3.70' },
    { testName: 'MON#', unit: '10³/mm³', normalRange: '0.10 – 0.60' },
    { testName: 'GRA#', unit: '10³/mm³', normalRange: '2.30 – 8.20' },
    { testName: 'GLR', unit: '', normalRange: '' },
    { testName: 'RBC', unit: '10⁶/mm³', normalRange: '3.90 – 5.20' },
    { testName: 'HGB', unit: 'g/dl', normalRange: '12.0 – 15.1' },
    { testName: 'HCT', unit: '%', normalRange: '36.4 – 46.0' },
    { testName: 'MCV', unit: 'μm³', normalRange: '83 – 96' },
    { testName: 'MCH', unit: 'pg', normalRange: '26.4 – 32.3' },
    { testName: 'MCHC', unit: 'g/dl', normalRange: '31.8 – 34.2' },
    { testName: 'RDW-CV', unit: '%', normalRange: '11.9 – 14.4' },
    { testName: 'RDW-SD', unit: 'μm³', normalRange: '38 – 49' },
    { testName: 'PLT', unit: '10³/mm³', normalRange: '168 – 418' },
    { testName: 'MPV', unit: 'μm³', normalRange: '7.0 – 10.5' },
    { testName: 'PCT', unit: 'L %', normalRange: '0.150 – 0.500' },
    { testName: 'PDW', unit: '%', normalRange: '11.0 – 18.0' },
    { testName: 'P-LCC', unit: '10³/mm³', normalRange: '44 – 140' },
    { testName: 'P-LCR', unit: '%', normalRange: '18.0 – 50.0' },
  ],
  'LFT (Liver Function Test)': [
    { testName: 'Total Bilirubin', unit: 'mg/dL', normalRange: '0.2 – 1.2' },
    { testName: 'Direct Bilirubin', unit: 'mg/dL', normalRange: '0.0 – 0.3' },
    { testName: 'Indirect Bilirubin', unit: 'mg/dL', normalRange: '0.2 – 0.9' },
    { testName: 'SGOT (AST)', unit: 'U/L', normalRange: '10 – 40' },
    { testName: 'SGPT (ALT)', unit: 'U/L', normalRange: '7 – 56' },
    { testName: 'ALP', unit: 'U/L', normalRange: '44 – 147' },
    { testName: 'Total Protein', unit: 'g/dL', normalRange: '6.0 – 8.3' },
    { testName: 'Albumin', unit: 'g/dL', normalRange: '3.5 – 5.0' },
    { testName: 'Globulin', unit: 'g/dL', normalRange: '2.3 – 3.5' },
    { testName: 'A/G Ratio', unit: '', normalRange: '1.0 – 2.5' },
  ],
  'RFT (Renal Function Test)': [
    { testName: 'Blood Urea', unit: 'mg/dL', normalRange: '15 – 45' },
    { testName: 'Serum Creatinine', unit: 'mg/dL', normalRange: '0.6 – 1.2' },
    { testName: 'Uric Acid', unit: 'mg/dL', normalRange: '2.4 – 7.0' },
    { testName: 'Sodium (Na+)', unit: 'mEq/L', normalRange: '136 – 145' },
    { testName: 'Potassium (K+)', unit: 'mEq/L', normalRange: '3.5 – 5.0' },
    { testName: 'Chloride (Cl-)', unit: 'mEq/L', normalRange: '98 – 107' },
    { testName: 'Bicarbonate', unit: 'mEq/L', normalRange: '22 – 29' },
    { testName: 'BUN', unit: 'mg/dL', normalRange: '7 – 21' },
    { testName: 'eGFR', unit: 'mL/min/1.73m²', normalRange: '>60' },
  ],
  'Lipid Profile': [
    { testName: 'Total Cholesterol', unit: 'mg/dL', normalRange: '<200' },
    { testName: 'HDL Cholesterol', unit: 'mg/dL', normalRange: '>40' },
    { testName: 'LDL Cholesterol', unit: 'mg/dL', normalRange: '<100' },
    { testName: 'VLDL Cholesterol', unit: 'mg/dL', normalRange: '5 – 40' },
    { testName: 'Triglycerides', unit: 'mg/dL', normalRange: '<150' },
    { testName: 'Total/HDL Ratio', unit: '', normalRange: '<5.0' },
  ],
  'Blood Glucose': [
    { testName: 'Fasting Blood Glucose', unit: 'mg/dL', normalRange: '70 – 100' },
    { testName: 'Post Prandial (PP)', unit: 'mg/dL', normalRange: '<140' },
    { testName: 'Random Blood Glucose', unit: 'mg/dL', normalRange: '70 – 140' },
    { testName: 'HbA1c', unit: '%', normalRange: '4.0 – 5.6' },
  ],
  'Thyroid Profile': [
    { testName: 'T3 (Total)', unit: 'ng/dL', normalRange: '80 – 200' },
    { testName: 'T4 (Total)', unit: 'μg/dL', normalRange: '5.1 – 14.1' },
    { testName: 'TSH', unit: 'μIU/mL', normalRange: '0.4 – 4.0' },
    { testName: 'Free T3 (FT3)', unit: 'pg/mL', normalRange: '2.0 – 4.4' },
    { testName: 'Free T4 (FT4)', unit: 'ng/dL', normalRange: '0.8 – 1.8' },
  ],
  'Urine Routine': [
    { testName: 'Colour', unit: '', normalRange: 'Pale Yellow' },
    { testName: 'Appearance', unit: '', normalRange: 'Clear' },
    { testName: 'pH', unit: '', normalRange: '4.5 – 8.5' },
    { testName: 'Specific Gravity', unit: '', normalRange: '1.005 – 1.030' },
    { testName: 'Protein', unit: '', normalRange: 'Nil' },
    { testName: 'Glucose', unit: '', normalRange: 'Nil' },
    { testName: 'Ketones', unit: '', normalRange: 'Nil' },
    { testName: 'Blood', unit: '', normalRange: 'Nil' },
    { testName: 'Bilirubin', unit: '', normalRange: 'Nil' },
    { testName: 'Pus Cells (WBC)', unit: '/HPF', normalRange: '0 – 5' },
    { testName: 'RBC', unit: '/HPF', normalRange: '0 – 2' },
    { testName: 'Epithelial Cells', unit: '/HPF', normalRange: 'Few' },
    { testName: 'Casts', unit: '', normalRange: 'Nil' },
    { testName: 'Crystals', unit: '', normalRange: 'Nil' },
    { testName: 'Bacteria', unit: '', normalRange: 'Nil' },
  ],
  'Bio Chemistry': [
    { testName: 'Calcium', unit: 'mg/dL', normalRange: '8.5 – 10.5' },
    { testName: 'Phosphorus', unit: 'mg/dL', normalRange: '2.5 – 4.5' },
    { testName: 'Magnesium', unit: 'mEq/L', normalRange: '1.5 – 2.5' },
    { testName: 'Iron (Serum)', unit: 'μg/dL', normalRange: '60 – 170' },
    { testName: 'TIBC', unit: 'μg/dL', normalRange: '250 – 370' },
    { testName: 'Ferritin', unit: 'ng/mL', normalRange: '12 – 300' },
    { testName: 'Vitamin B12', unit: 'pg/mL', normalRange: '200 – 900' },
    { testName: 'Vitamin D (25-OH)', unit: 'ng/mL', normalRange: '30 – 100' },
    { testName: 'CRP (C-Reactive Protein)', unit: 'mg/L', normalRange: '<5' },
    { testName: 'ESR', unit: 'mm/hr', normalRange: '0 – 20' },
  ],
  'ECG': [
    { testName: 'Heart Rate', unit: 'bpm', normalRange: '60 – 100' },
    { testName: 'PR Interval', unit: 'ms', normalRange: '120 – 200' },
    { testName: 'QRS Duration', unit: 'ms', normalRange: '60 – 100' },
    { testName: 'QT Interval', unit: 'ms', normalRange: '350 – 440' },
    { testName: 'QTc', unit: 'ms', normalRange: '<450' },
    { testName: 'Rhythm', unit: '', normalRange: 'Normal Sinus Rhythm' },
    { testName: 'Axis', unit: '', normalRange: '-30° to +90°' },
  ],
  'Custom / Manual': [],
};

const LAB_PROFILE_OPTIONS = Object.keys(LAB_PROFILES);

// ─── Print Lab Report (matches CBC format in image) ────────────────────────────
function printLabReport(test, branding = {}) {
  const win = window.open('', '_blank', 'width=800,height=900');
  if (!win) return;

  const escapeHtml = (value = '') => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
  const fmtDateTime = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return `${date.toLocaleDateString('en-GB')} ${date.toLocaleTimeString('en-GB', { hour12: false })}`;
  };
  const splitNormalRange = (range) => {
    const values = String(range || '').match(/[<>]?\s*\d+(?:\.\d+)?/g) || [];
    if (values.length >= 2) return `${values[0].replace(/\s/g, '')} - ${values[1].replace(/\s/g, '')}`;
    return range || '-';
  };
  const getFlag = (result) => result.flag === 'High' || result.flag === 'Critical' ? 'H' : result.flag === 'Low' ? 'L' : '';
  const cleanUnit = (unit) => String(unit || '').replace(/^(H|L)\s+/, '');
  const normalizeName = (name) => String(name || '').trim().toUpperCase();
  const brandColor = /^#[0-9a-fA-F]{6}$/.test(branding?.primaryColor || '') ? branding.primaryColor : '#1e40af';
  const genderText = String(test.patient?.gender || '').toLowerCase();
  const patientType = genderText.includes('female') || genderText.includes('woman')
    ? 'Woman'
    : genderText.includes('male') || genderText.includes('man')
      ? 'Man'
      : test.patient?.gender || '';
  const resultMap = new Map((test.results || []).map(result => [normalizeName(result.testName), result]));
  const groupDefinitions = [
    { title: 'WBC', tests: ['WBC', 'LYM%', 'MON%', 'GRA%', 'LYM#', 'MON#', 'GRA#', 'GLR'] },
    { title: 'RBC', tests: ['RBC', 'HGB', 'HCT', 'MCV', 'MCH', 'MCHC', 'RDW-CV', 'RDW-SD'] },
    { title: 'PLT', tests: ['PLT', 'MPV', 'PCT', 'PDW', 'P-LCC', 'P-LCR'] },
  ];
  const groupedNames = new Set(groupDefinitions.flatMap(group => group.tests));
  const groups = groupDefinitions.map(group => ({
    ...group,
    rows: group.tests.map(testName => resultMap.get(testName) || { testName }).filter(row => row.value || row.unit || row.normalRange),
  })).filter(group => group.rows.length);
  const extraRows = (test.results || []).filter(result => !groupedNames.has(normalizeName(result.testName)));
  if (extraRows.length) groups.push({ title: 'OTHER', rows: extraRows });
  const finalGroups = groups.length ? groups : [{ title: test.tests?.[0]?.testName || 'Lab Results', rows: test.results || [] }];
  const contactLine = [
    branding?.address,
    branding?.phone && `Ph: ${branding.phone}`,
    branding?.email,
    branding?.website,
  ].filter(Boolean).join(' | ');
  const accreditationLine = [
    branding?.nabhAccreditation && `NABH: ${branding.nabhAccreditation}`,
    branding?.nablAccreditation && `NABL: ${branding.nablAccreditation}`,
    branding?.gstNumber && `GST: ${branding.gstNumber}`,
  ].filter(Boolean).join(' | ');

  const rowsHtml = (rows) => rows.map((result, index) => {
    const flag = getFlag(result);
    return `<tr class="${index % 2 === 0 ? 'soft' : ''}">
      <td>${escapeHtml(result.testName)}</td>
      <td class="result ${flag ? 'abnormal' : ''}">${escapeHtml(result.value)}</td>
      <td class="flag ${flag === 'H' ? 'high' : flag === 'L' ? 'low' : ''}">${flag || '-'}</td>
      <td>${escapeHtml(cleanUnit(result.unit))}</td>
      <td>${escapeHtml(splitNormalRange(result.normalRange))}</td>
    </tr>`;
  }).join('');

  const groupsHtml = finalGroups.map(group => `
    <section class="result-section">
      <h3>${escapeHtml(group.title)}</h3>
      <table>
        <thead><tr><th>Test</th><th>Result</th><th>Flag</th><th>Unit</th><th>Normal Range</th></tr></thead>
        <tbody>${rowsHtml(group.rows)}</tbody>
      </table>
    </section>`).join('');

  win.document.write(`<!DOCTYPE html><html><head><title>Lab Report</title>
  <style>
    * { box-sizing:border-box; }
    body { margin:0; background:#fff; color:#111827; font-family:Arial, Helvetica, sans-serif; font-size:12px; }
    .page { width:210mm; height:297mm; margin:0 auto; padding:8mm 10mm 13mm; overflow:hidden; }
    .brand { display:flex; gap:10px; align-items:flex-start; border-bottom:1.5px solid ${brandColor}; padding-bottom:5px; }
    .logo { width:42px; height:42px; object-fit:contain; border:1px solid #e5e7eb; border-radius:8px; padding:3px; }
    .brand-text { flex:1; text-align:${branding?.logo ? 'left' : 'center'}; }
    .hospital { color:${brandColor}; font-size:18px; font-weight:800; line-height:1.05; }
    .tagline { margin-top:1px; color:#475569; font-style:italic; font-size:9px; }
    .contact { margin-top:2px; color:#475569; font-size:8px; line-height:1.2; }
    .accreditation { margin-top:1px; color:#0f766e; font-size:8px; font-weight:700; }
    .title { margin-top:7px; background:${brandColor}; color:white; border-radius:6px; text-align:center; font-size:12px; font-weight:800; padding:6px; letter-spacing:.5px; }
    .info-card { margin-top:7px; border:1px solid #cbd5e1; border-radius:8px; overflow:hidden; }
    .info-head { background:#f8fafc; color:${brandColor}; font-weight:800; padding:5px 9px; border-bottom:1px solid #e2e8f0; font-size:9px; }
    .info-grid { display:grid; grid-template-columns:repeat(4, 1fr); gap:0; padding:6px 8px 7px; }
    .field { padding:4px 6px; }
    .field label { display:block; color:#64748b; font-size:7px; font-weight:800; text-transform:uppercase; }
    .field span { display:block; margin-top:1px; color:#111827; font-weight:700; font-size:8.5px; }
    .result-section { margin-top:7px; border:1px solid #cbd5e1; border-radius:8px; overflow:hidden; page-break-inside:avoid; }
    .result-section h3 { margin:0; background:#eef2ff; color:${brandColor}; padding:4px 8px; font-size:8.5px; text-transform:uppercase; letter-spacing:.2px; }
    table { width:100%; border-collapse:collapse; }
    .result-section + .result-section { margin-top:4px; }
    th { background:${brandColor}; color:white; text-align:left; padding:4px 6px; font-size:7.5px; text-transform:uppercase; }
    td { padding:3px 6px; border-bottom:1px solid #e2e8f0; font-size:8.5px; line-height:1.08; }
    tr.soft td { background:#f8fafc; }
    td.result { text-align:right; font-weight:800; }
    td.abnormal { color:#b91c1c; }
    td.flag { text-align:center; font-weight:800; color:#16a34a; }
    td.flag.high { color:#b91c1c; }
    td.flag.low { color:#2563eb; }
    th:nth-child(2), th:nth-child(3), td:nth-child(2), td:nth-child(3) { text-align:center; }
    .remarks { margin-top:7px; background:#fffbeb; border:1px solid #fde68a; border-radius:8px; padding:6px 8px; color:#451a03; font-size:8px; }
    .signatures { margin-top:10px; display:flex; justify-content:space-between; color:#64748b; font-size:8px; }
    .sig-line { width:145px; border-top:1px solid #94a3b8; padding-top:4px; color:#111827; font-weight:700; }
    .footer { position:fixed; left:10mm; right:10mm; bottom:5mm; border-top:1px solid #d1d5db; padding-top:4px; color:#4b5563; font-size:7px; text-align:center; }
    .footer-meta { margin-top:2px; display:flex; justify-content:space-between; }
    @page { size:A4; margin:0; }
    @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } .page { margin:0; } }
  </style>
  </head><body>
  <main class="page">
    <header class="brand">
      ${branding?.logo ? `<img class="logo" src="${escapeHtml(branding.logo)}" alt="logo" />` : ''}
      <div class="brand-text">
        <div class="hospital">${escapeHtml(branding?.hospitalName || 'Hospital Name')}</div>
        ${branding?.tagline ? `<div class="tagline">${escapeHtml(branding.tagline)}</div>` : ''}
        ${contactLine ? `<div class="contact">${escapeHtml(contactLine)}</div>` : ''}
        ${accreditationLine ? `<div class="accreditation">${escapeHtml(accreditationLine)}</div>` : ''}
      </div>
    </header>
    <div class="title">LABORATORY RESULT REPORT</div>
    <section class="info-card">
      <div class="info-head">PATIENT DETAILS</div>
      <div class="info-grid">
        <div class="field"><label>Patient ID</label><span>${escapeHtml(test.patient?.patientId || '-')}</span></div>
        <div class="field"><label>Patient Name</label><span>${escapeHtml(test.patient?.name || '-')}</span></div>
        <div class="field"><label>Type / Gender</label><span>${escapeHtml(patientType || test.patient?.gender || '-')}</span></div>
        <div class="field"><label>Sample ID</label><span>${escapeHtml(test.labNumber || '-')}</span></div>
        <div class="field"><label>Analysis Date</label><span>${escapeHtml(fmtDateTime(test.reportGeneratedAt || test.updatedAt || test.createdAt) || '-')}</span></div>
        <div class="field"><label>Operator</label><span>${escapeHtml(test.reportVerifiedBy?.name || 'labtech')}</span></div>
        <div class="field"><label>Department</label><span>${escapeHtml(test.labType || '-')}</span></div>
        <div class="field"><label>Physician</label><span>${escapeHtml(test.doctor?.name ? `Dr. ${test.doctor.name}` : '-')}</span></div>
        <div class="field"><label>Status</label><span>${escapeHtml(test.status || 'completed')}</span></div>
      </div>
    </section>
    ${groupsHtml}
    ${test.remarks ? `<div class="remarks"><b>Remarks:</b> ${escapeHtml(test.remarks)}</div>` : ''}
    <section class="signatures"><div><div class="sig-line">${escapeHtml(test.reportVerifiedBy?.name || 'labtech')}</div>Verified by</div><div><div class="sig-line">Authorized Signatory</div></div></section>
    <footer class="footer"><div>${escapeHtml(branding?.footerNote || 'Thank you for choosing our hospital.')}</div><div class="footer-meta"><span>Printed on ${escapeHtml(fmtDateTime(new Date()))}</span><span>Lab No: ${escapeHtml(test.labNumber || '-')}</span></div></footer>
  </main>
  <script>window.onload=()=>{window.print();}<!/script>
  </body></html>`.replace('<!/script>', '<\/script>'));
  win.document.close();
}


// ─── IP Medicine Viewing Component ────────────────────────────────────────────
function IPMedicineView({ admission }) {
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ['ipMeds', admission?._id],
    queryFn: () => api.get(`/ip/${admission._id}`).then(r => r.data.data),
    enabled: open && !!admission?._id,
  });

  const meds = data?.prescriptions?.flatMap(p => p.medicines || []) || [];

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
      >
        <Eye size={14} /> {open ? 'Hide' : 'View'} IP Medicines <ChevronDown size={12} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
      </button>
      {open && (
        <div className="mt-2 rounded-xl border border-blue-100 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/30 overflow-x-auto">
          {meds.length === 0 ? (
            <p className="text-xs text-gray-400 px-4 py-3">No medicines prescribed yet.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left border-b border-blue-200 dark:border-blue-800">
                  <th className="px-3 py-2 text-blue-700 dark:text-blue-300 font-semibold">Medicine</th>
                  <th className="px-3 py-2 text-blue-700 dark:text-blue-300 font-semibold">Dosage</th>
                  <th className="px-3 py-2 text-blue-700 dark:text-blue-300 font-semibold">Frequency</th>
                  <th className="px-3 py-2 text-blue-700 dark:text-blue-300 font-semibold">Duration</th>
                  <th className="px-3 py-2 text-blue-700 dark:text-blue-300 font-semibold">Timing</th>
                  <th className="px-3 py-2 text-blue-700 dark:text-blue-300 font-semibold">Route</th>
                </tr>
              </thead>
              <tbody>
                {meds.map((m, i) => (
                  <tr key={i} className="border-b border-blue-100 dark:border-blue-900 last:border-0 hover:bg-blue-100 dark:hover:bg-blue-900/30">
                    <td className="px-3 py-2 font-medium text-gray-800 dark:text-gray-100">{m.name}</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{m.dosage || '-'}</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{m.frequency || '-'}</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{m.duration ? `${m.duration} days` : '-'}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex gap-1 flex-wrap">
                        {m.timing?.map(t => (
                          <span key={t} className="bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200 rounded px-1.5 py-0.5 text-xs">{t}</span>
                        )) || '-'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{m.route || 'Oral'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function LabPage() {
  const [searchParams] = useSearchParams();
  const { user } = useSelector((s) => s.auth);
  const canCreateOrders = hasRole(user?.role, ['Super Admin', 'Admin', 'Doctor', 'Nurse']);
  const isLabTech = hasRole(user?.role, ['Super Admin', 'Admin', 'Lab Technician']);
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [showResults, setShowResults] = useState(null);
  const [showViewResult, setShowViewResult] = useState(null);
  const [patientSearch, setPatientSearch] = useState('');
  const [patients, setPatients] = useState([]);
  const [selectedProfile, setSelectedProfile] = useState('');
  const [tab, setTab] = useState(searchParams.get('tab') === 'reports' ? 'reports' : 'orders');
  const qc = useQueryClient();

  // selected IP admission for medicine viewing
  const [selectedAdmission, setSelectedAdmission] = useState(null);

  useEffect(() => {
    const urlTab = searchParams.get('tab');
    if (urlTab === 'reports') setTab('reports');
    else if (urlTab === 'orders') setTab('orders');
  }, [searchParams]);

  const { data, isLoading } = useQuery({
    queryKey: ['labTests', page],
    queryFn: () => api.get(`/lab?page=${page}&limit=20&sort=-createdAt`).then(r => r.data),
  });

  const { data: dashData } = useQuery({
    queryKey: ['labDash'],
    queryFn: () => api.get('/lab/dashboard').then(r => r.data.data),
  });

  const { data: brandingData } = useQuery({
    queryKey: ['branding'],
    queryFn: () => api.get('/branding').then(r => r.data.data),
    staleTime: 1000 * 60 * 5,
  });

  const { register, handleSubmit, watch, setValue, reset } = useForm({
    defaultValues: { sampleType: 'blood', priority: 'routine', notes: '' },
  });

  const [testFields, setTestFields] = useState([]);
  const [resultFields, setResultFields] = useState([]);
  const { register: resReg, handleSubmit: resSubmit, reset: resReset } = useForm({
    defaultValues: { remarks: '' },
  });

  // Patient search
  useEffect(() => {
    if (patientSearch.length >= 2) {
      api.get(`/patients/search?q=${patientSearch}`).then(r => setPatients(r.data.data || []));
    } else {
      setPatients([]);
    }
  }, [patientSearch]);

  // When lab profile selected, auto-fill result fields template
  const handleProfileSelect = (profileName) => {
    setSelectedProfile(profileName);
    const fields = LAB_PROFILES[profileName] || [];
    setTestFields(fields.map(f => ({ testName: f.testName, price: 0 })));
  };

  // Mutations
  const createMut = useMutation({
    mutationFn: (d) => api.post('/lab', {
      ...d,
      tests: testFields.filter(t => t.testName).map(t => ({ testName: t.testName, price: Number(t.price) || 0 })),
      testProfile: selectedProfile,
      totalAmount: testFields.reduce((s, t) => s + (Number(t.price) || 0), 0),
    }),
    onSuccess: () => {
      toast.success('Lab test order created!');
      qc.invalidateQueries(['labTests']);
      qc.invalidateQueries(['labDash']);
      setShowCreate(false);
      reset();
      setTestFields([]);
      setSelectedProfile('');
      setPatientSearch('');
      setPatients([]);
      setSelectedAdmission(null);
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Failed to create'),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }) => api.put(`/lab/${id}/status`, { status }),
    onSuccess: () => {
      qc.invalidateQueries(['labTests']);
      qc.invalidateQueries(['labDash']);
    },
  });

  const resultsMut = useMutation({
    mutationFn: ({ id, data }) => api.put(`/lab/${id}/results`, data),
    onSuccess: () => {
      toast.success('Results saved!');
      qc.invalidateQueries(['labTests']);
      qc.invalidateQueries(['labDash']);
      setShowResults(null);
      resReset();
      setResultFields([]);
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Failed to save'),
  });

  const handlePrint = async (test) => {
    try {
      // Try PDF from backend first
      const response = await api.get(`/lab/${test._id}/print`, { responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const win = window.open(url, '_blank');
      if (!win) {
        const link = document.createElement('a');
        link.href = url;
        link.download = `lab-${test.labNumber}.pdf`;
        link.click();
      }
      setTimeout(() => window.URL.revokeObjectURL(url), 60000);
    } catch {
      // Fallback: client-side print
      const full = await api.get(`/lab/${test._id}`).then(r => r.data.data);
      printLabReport({ ...full, testProfile: selectedProfile }, brandingData);
    }
  };

  const statusColors = {
    pending: 'badge-gray',
    sample_collected: 'badge-yellow',
    processing: 'badge-blue',
    completed: 'badge-green',
    cancelled: 'badge-red',
  };

  const statusLabel = (s) => s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  const columns = [
    {
      key: 'labNumber',
      header: 'Lab No',
      render: r => <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">{r.labNumber}</span>,
    },
    {
      key: 'patient',
      header: 'Patient',
      render: r => (
        <div>
          <p className="font-medium text-gray-900 dark:text-white">{r.patient?.name}</p>
          <p className="text-xs text-gray-400">{r.patient?.patientId} · {r.patient?.age}yr {r.patient?.gender}</p>
        </div>
      ),
    },
    {
      key: 'tests',
      header: 'Profile / Tests',
      render: r => (
        <div>
          {r.testProfile && <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">{r.testProfile}</p>}
          <p className="text-xs text-gray-500 dark:text-gray-400">{r.tests?.length} test{r.tests?.length !== 1 ? 's' : ''}</p>
        </div>
      ),
    },
    {
      key: 'priority',
      header: 'Priority',
      render: r => (
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.priority === 'urgent' || r.priority === 'stat' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
          {r.priority}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: r => <span className={statusColors[r.status]}>{statusLabel(r.status)}</span>,
    },
    {
      key: 'createdAt',
      header: 'Date',
      render: r => <span className="text-xs text-gray-500">{new Date(r.createdAt).toLocaleDateString('en-IN')}</span>,
    },
    {
      key: 'actions',
      header: '',
      render: r => (
        <div className="flex gap-2 items-center">
          {r.status === 'pending' && isLabTech && (
            <button onClick={e => { e.stopPropagation(); statusMut.mutate({ id: r._id, status: 'sample_collected' }); }}
              className="text-xs bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 px-2.5 py-1 rounded-lg hover:bg-yellow-200 transition-colors font-medium">
              Collect Sample
            </button>
          )}
          {r.status === 'sample_collected' && isLabTech && (
            <button onClick={e => { e.stopPropagation(); statusMut.mutate({ id: r._id, status: 'processing' }); }}
              className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-2.5 py-1 rounded-lg hover:bg-blue-200 transition-colors font-medium">
              Start Processing
            </button>
          )}
          {r.status === 'processing' && isLabTech && (
            <button onClick={e => {
              e.stopPropagation();
              const profile = r.testProfile;
              const profileFields = LAB_PROFILES[profile] || [];
              const fields = r.tests?.map(t => {
                const meta = profileFields.find(p => p.testName === t.testName);
                return { testName: t.testName, value: '', unit: meta?.unit || '', normalRange: meta?.normalRange || '', flag: 'Normal' };
              }) || [];
              setResultFields(fields);
              setShowResults(r);
            }}
              className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2.5 py-1 rounded-lg hover:bg-green-200 transition-colors font-medium">
              Enter Results
            </button>
          )}
          {r.status === 'completed' && (
            <div className="flex gap-1">
              <button onClick={e => { e.stopPropagation(); setShowViewResult(r); }}
                className="text-xs bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 px-2.5 py-1 rounded-lg hover:bg-indigo-200 transition-colors font-medium flex items-center gap-1">
                <Eye size={11} /> View
              </button>
              <button onClick={e => { e.stopPropagation(); handlePrint(r); }}
                className="text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 px-2.5 py-1 rounded-lg hover:bg-purple-200 transition-colors font-medium flex items-center gap-1">
                <Printer size={11} /> Print
              </button>
            </div>
          )}
        </div>
      ),
    },
  ];

  const tableData = tab === 'reports'
    ? (data?.data || []).filter(r => r.status === 'completed')
    : (data?.data || []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Laboratory</h1>
        {tab === 'orders' && canCreateOrders && (
          <button type="button" onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> New Lab Order
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700">
        {[{ id: 'orders', label: 'Lab Orders' }, { id: 'reports', label: 'Lab Reports' }].map(({ id, label }) => (
          <button key={id} type="button" onClick={() => setTab(id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Dashboard Stats */}
      {dashData && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Today's Tests", value: dashData.todayTests, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20' },
            { label: 'Pending', value: dashData.pending, color: 'text-yellow-600', bg: 'bg-yellow-50 dark:bg-yellow-900/20' },
            { label: 'Completed Today', value: dashData.completed, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/20' },
            { label: 'Urgent', value: dashData.urgent, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-900/20' },
          ].map(s => (
            <div key={s.label} className={`kpi-card text-center ${s.bg} rounded-2xl p-4`}>
              <p className={`text-3xl font-bold ${s.color}`}>{s.value ?? '–'}</p>
              <p className="text-sm text-gray-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
        <DataTable columns={columns} data={tableData} loading={isLoading} page={page} pages={data?.pages || 1} onPageChange={setPage} />
      </div>

      {/* ── CREATE LAB ORDER MODAL ── */}
      <Modal isOpen={showCreate} onClose={() => { setShowCreate(false); reset(); setTestFields([]); setSelectedProfile(''); setPatientSearch(''); setPatients([]); setSelectedAdmission(null); }} title="New Lab Test Order" size="xl">
        <form onSubmit={handleSubmit(d => createMut.mutate(d))} className="p-6 space-y-5">

          {/* Patient Search */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Patient *</label>
            <input type="text" placeholder="Search by name or patient ID…" value={patientSearch}
              onChange={e => setPatientSearch(e.target.value)} className="input-field" />
            {patients.length > 0 && (
              <div className="mt-1 border border-gray-200 dark:border-gray-600 rounded-xl shadow-lg overflow-hidden z-10 bg-white dark:bg-gray-800">
                {patients.map(p => (
                  <button key={p._id} type="button"
                    onClick={() => {
                      setValue('patient', p._id);
                      setPatientSearch(`${p.name} (${p.patientId})`);
                      setPatients([]);
                      // If IP patient, set admission for medicine viewing
                      if (p.activeAdmission) setSelectedAdmission(p.activeAdmission);
                    }}
                    className="w-full text-left px-4 py-2.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-sm border-b border-gray-100 dark:border-gray-700 last:border-0 flex justify-between items-center">
                    <span>{p.name} — <span className="text-gray-400">{p.patientId}</span></span>
                    {p.activeAdmission && <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded">IP</span>}
                  </button>
                ))}
              </div>
            )}
            <input type="hidden" {...register('patient', { required: true })} />
          </div>

          {/* IP Medicine Viewer */}
          {selectedAdmission && <IPMedicineView admission={selectedAdmission} />}

          {/* Lab Profile Dropdown */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Lab Profile / Type *</label>
            <select
              value={selectedProfile}
              onChange={e => handleProfileSelect(e.target.value)}
              className="input-field"
              required
            >
              <option value="">— Select Lab Type —</option>
              {LAB_PROFILE_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          {/* Tests Preview */}
          {testFields.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Tests ({testFields.length}) — Edit names or price if needed
                </label>
                {selectedProfile === 'Custom / Manual' && (
                  <button type="button" onClick={() => setTestFields([...testFields, { testName: '', price: 0 }])}
                    className="text-xs text-blue-600 font-medium flex items-center gap-1 hover:underline">
                    <Plus size={12} /> Add Row
                  </button>
                )}
              </div>
              <div className="border border-gray-200 dark:border-gray-600 rounded-xl overflow-hidden">
                <div className="grid grid-cols-12 gap-0 bg-gray-50 dark:bg-gray-700 px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
                  <span className="col-span-8">Test Name</span>
                  <span className="col-span-3">Price (₹)</span>
                  <span className="col-span-1"></span>
                </div>
                <div className="max-h-52 overflow-y-auto">
                  {testFields.map((t, i) => (
                    <div key={i} className="grid grid-cols-12 gap-0 border-t border-gray-100 dark:border-gray-700 items-center">
                      <input className="col-span-8 px-3 py-1.5 text-sm bg-transparent border-r border-gray-100 dark:border-gray-700 focus:bg-blue-50 dark:focus:bg-blue-900/20 outline-none"
                        value={t.testName} placeholder="Test name"
                        onChange={e => setTestFields(testFields.map((f, fi) => fi === i ? { ...f, testName: e.target.value } : f))} />
                      <input type="number" className="col-span-3 px-3 py-1.5 text-sm bg-transparent border-r border-gray-100 dark:border-gray-700 focus:bg-blue-50 dark:focus:bg-blue-900/20 outline-none"
                        placeholder="0" value={t.price}
                        onChange={e => setTestFields(testFields.map((f, fi) => fi === i ? { ...f, price: Number(e.target.value) } : f))} />
                      <div className="col-span-1 flex justify-center">
                        {testFields.length > 1 && (
                          <button type="button" onClick={() => setTestFields(testFields.filter((_, fi) => fi !== i))} className="text-red-400 hover:text-red-600 text-xs px-1">✕</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="border-t border-gray-200 dark:border-gray-700 px-3 py-2 text-xs text-right font-semibold text-gray-700 dark:text-gray-300">
                  Total: ₹{testFields.reduce((s, t) => s + (Number(t.price) || 0), 0).toFixed(2)}
                </div>
              </div>
            </div>
          )}

          {/* Sample + Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Sample Type</label>
              <select {...register('sampleType')} className="input-field">
                {['blood', 'urine', 'stool', 'swab', 'sputum', 'tissue', 'other'].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Priority</label>
              <select {...register('priority')} className="input-field">
                <option value="routine">Routine</option>
                <option value="urgent">Urgent</option>
                <option value="stat">STAT</option>
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Notes (optional)</label>
            <textarea {...register('notes')} className="input-field" rows={2} placeholder="Clinical notes, relevant history…" />
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
            <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={createMut.isPending || !selectedProfile || testFields.length === 0} className="btn-primary flex items-center gap-2">
              <FlaskConical size={16} />{createMut.isPending ? 'Creating…' : 'Create Lab Order'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── ENTER RESULTS MODAL ── */}
      <Modal isOpen={!!showResults} onClose={() => { setShowResults(null); resReset(); setResultFields([]); }} title={`Enter Results — ${showResults?.labNumber}`} size="2xl">
        <form onSubmit={resSubmit(d => resultsMut.mutate({ id: showResults._id, data: { results: resultFields, remarks: d.remarks } }))} className="p-6 space-y-4">
          {showResults?.testProfile && (
            <div className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 px-3 py-1.5 rounded-lg inline-block">
              Profile: {showResults.testProfile}
            </div>
          )}
          <div className="border border-gray-200 dark:border-gray-600 rounded-xl overflow-hidden">
            <div className="grid grid-cols-12 gap-0 bg-gray-50 dark:bg-gray-700 px-3 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">
              <span className="col-span-3">Test Name</span>
              <span className="col-span-2">Value *</span>
              <span className="col-span-2">Unit</span>
              <span className="col-span-3">Normal Range</span>
              <span className="col-span-2">Flag</span>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {resultFields.map((r, i) => (
                <div key={i} className={`grid grid-cols-12 border-t border-gray-100 dark:border-gray-700 items-center ${r.flag === 'High' || r.flag === 'Critical' ? 'bg-red-50 dark:bg-red-900/10' : r.flag === 'Low' ? 'bg-blue-50 dark:bg-blue-900/10' : ''}`}>
                  <div className="col-span-3 px-3 py-1.5 text-sm font-medium text-gray-800 dark:text-gray-200 border-r border-gray-100 dark:border-gray-700">{r.testName}</div>
                  <input className="col-span-2 px-3 py-1.5 text-sm bg-transparent border-r border-gray-100 dark:border-gray-700 focus:bg-yellow-50 dark:focus:bg-yellow-900/20 outline-none font-semibold"
                    placeholder="Value" value={r.value}
                    onChange={e => setResultFields(resultFields.map((f, fi) => fi === i ? { ...f, value: e.target.value } : f))} />
                  <input className="col-span-2 px-3 py-1.5 text-sm bg-transparent border-r border-gray-100 dark:border-gray-700 focus:bg-blue-50 dark:focus:bg-blue-900/20 outline-none text-gray-500"
                    placeholder="unit" value={r.unit}
                    onChange={e => setResultFields(resultFields.map((f, fi) => fi === i ? { ...f, unit: e.target.value } : f))} />
                  <input className="col-span-3 px-3 py-1.5 text-sm bg-transparent border-r border-gray-100 dark:border-gray-700 focus:bg-green-50 dark:focus:bg-green-900/20 outline-none text-gray-500"
                    placeholder="e.g. 4.1 – 11.1" value={r.normalRange}
                    onChange={e => setResultFields(resultFields.map((f, fi) => fi === i ? { ...f, normalRange: e.target.value } : f))} />
                  <select className="col-span-2 px-2 py-1.5 text-xs bg-transparent outline-none focus:bg-gray-50 dark:focus:bg-gray-700 cursor-pointer"
                    value={r.flag || 'Normal'}
                    onChange={e => setResultFields(resultFields.map((f, fi) => fi === i ? { ...f, flag: e.target.value } : f))}>
                    <option value="Normal">Normal</option>
                    <option value="High">H – High</option>
                    <option value="Low">L – Low</option>
                    <option value="Critical">C! – Critical</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Remarks / Interpretation</label>
            <textarea {...resReg('remarks')} className="input-field" rows={2} placeholder="Optional clinical remarks…" />
          </div>
          <div className="flex gap-3 justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
            <button type="button" onClick={() => setShowResults(null)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={resultsMut.isPending} className="btn-primary flex items-center gap-2">
              <CheckCircle size={16} />{resultsMut.isPending ? 'Saving…' : 'Save & Complete'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── VIEW RESULT MODAL ── */}
      <Modal isOpen={!!showViewResult} onClose={() => setShowViewResult(null)} title={`Result — ${showViewResult?.labNumber}`} size="xl">
        {showViewResult && (
          <div className="p-6 space-y-4">
            <div className="flex flex-wrap gap-4 text-sm">
              <div><span className="text-gray-400">Patient:</span> <span className="font-semibold">{showViewResult.patient?.name}</span></div>
              <div><span className="text-gray-400">Profile:</span> <span className="font-semibold text-indigo-600 dark:text-indigo-400">{showViewResult.testProfile || '-'}</span></div>
              <div><span className="text-gray-400">Sample:</span> <span className="font-semibold">{showViewResult.sampleType || '-'}</span></div>
            </div>
            <div className="border border-gray-200 dark:border-gray-600 rounded-xl overflow-hidden">
              <div className="grid grid-cols-12 bg-gray-50 dark:bg-gray-700 px-3 py-2 text-xs font-bold text-gray-500 dark:text-gray-400">
                <span className="col-span-4">Test</span>
                <span className="col-span-2">Value</span>
                <span className="col-span-2">Unit</span>
                <span className="col-span-3">Normal Range</span>
                <span className="col-span-1">Flag</span>
              </div>
              {(showViewResult.results || []).map((r, i) => (
                <div key={i} className={`grid grid-cols-12 border-t border-gray-100 dark:border-gray-700 px-3 py-2 text-sm items-center ${r.flag === 'High' || r.flag === 'Critical' ? 'bg-red-50 dark:bg-red-900/10' : r.flag === 'Low' ? 'bg-blue-50 dark:bg-blue-900/10' : ''}`}>
                  <span className="col-span-4 font-medium text-gray-800 dark:text-gray-200">{r.testName}</span>
                  <span className={`col-span-2 font-bold ${r.flag === 'High' || r.flag === 'Critical' ? 'text-red-600' : r.flag === 'Low' ? 'text-blue-600' : 'text-gray-900 dark:text-white'}`}>{r.value}</span>
                  <span className="col-span-2 text-gray-500 dark:text-gray-400">{r.unit}</span>
                  <span className="col-span-3 text-gray-500 dark:text-gray-400">{r.normalRange}</span>
                  <span className={`col-span-1 text-xs font-bold ${r.flag === 'High' || r.flag === 'Critical' ? 'text-red-600' : r.flag === 'Low' ? 'text-blue-600' : 'text-green-600'}`}>
                    {r.flag === 'High' ? 'H' : r.flag === 'Low' ? 'L' : r.flag === 'Critical' ? 'C!' : '✓'}
                  </span>
                </div>
              ))}
            </div>
            {showViewResult.remarks && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-2 text-sm">
                <span className="font-semibold text-amber-700 dark:text-amber-400">Remarks:</span> {showViewResult.remarks}
              </div>
            )}
            <div className="flex gap-3 justify-end pt-2 border-t border-gray-200 dark:border-gray-700">
              <button type="button" onClick={() => setShowViewResult(null)} className="btn-secondary">Close</button>
              <button type="button" onClick={() => handlePrint(showViewResult)} className="btn-primary flex items-center gap-2">
                <Printer size={15} /> Print Report
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}