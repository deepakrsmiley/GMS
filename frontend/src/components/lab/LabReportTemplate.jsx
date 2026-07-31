import React, { useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { analyzeResult, FLAG_STYLES } from '../../utils/labResultAnalyzer';
import { generateBarcodeSVG } from '../../utils/barcodeGenerator';
import '../../styles/labReportPrint.css';

/**
 * LabReportTemplate
 * ------------------------------------------------------------------
 * ONE reusable, dynamic laboratory report template that renders ANY
 * lab investigation (CBC, LFT, RFT, Lipid Profile, Culture, PCR,
 * Histopathology, or any custom test) without any code changes.
 *
 * Everything visual — logo, hospital info, colors, fonts, signatures,
 * watermark, footer — comes from the `branding` prop (Hospital
 * Settings). Everything clinical — patient, tests, results, reference
 * ranges, comments — comes from the `labTest` prop. Change either one
 * and the same component re-renders correctly.
 *
 * Props:
 *  - branding: the Branding document from GET /api/branding (branding.labReport holds report-specific config)
 *  - labTest:  a populated LabTest document (patient, doctor, results[], etc.)
 *  - verificationBaseUrl: optional override for the QR "verify report" URL
 *
 * Usage:
 *  <div className="lab-report-print-only">
 *    <LabReportTemplate branding={branding} labTest={labTest} />
 *  </div>
 *  Then call window.print(). The @media print rules in labReportPrint.css
 *  and index.css (via .no-print / .lab-report-print-only) make sure only
 *  the report shows up on paper / "Save as PDF".
 * ------------------------------------------------------------------
 */

const DEFAULT_LAB_REPORT_CONFIG = {
  primaryColor: '#1e3a8a',
  secondaryColor: '#0f766e',
  accentColor: '#b91c1c',
  headerBackgroundColor: '#ffffff',
  headerTextColor: '#1e293b',
  tableHeaderBackgroundColor: '#e2e8f0',
  tableHeaderTextColor: '#1e293b',
  borderColor: '#94a3b8',
  bodyTextColor: '#0f172a',
  reportTitleColor: '#1e3a8a',
  highlightColor: '#fef3c7',
  criticalColor: '#dc2626',
  normalColor: '#16a34a',
  footerColor: '#475569',
  fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
  fontSize: '11px',
  paperSize: 'A4',
  printMarginMm: 10,
  footerText: 'This is a computer generated report and does not require a physical signature.',
  barcodeEnabled: true,
  qrCodeEnabled: true,
};

function fmtDateTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return `${d.toLocaleDateString('en-GB')} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
}

function Field({ label, value }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div className="px-2 py-1">
      <div className="text-[8.5px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-[10.5px] font-semibold text-slate-900 leading-tight">{value}</div>
    </div>
  );
}

function FlagBadge({ flag, cfg }) {
  if (!flag || flag === 'NA') return null;
  const isCritical = flag === 'CRITICAL_LOW' || flag === 'CRITICAL_HIGH';
  const isNormal = flag === 'NORMAL';
  const label = flag.replace('_', ' ');
  const style = isCritical
    ? { background: cfg.criticalColor, color: '#fff' }
    : isNormal
      ? { background: '#ecfdf5', color: cfg.normalColor, border: `1px solid ${cfg.normalColor}` }
      : { background: '#fef2f2', color: cfg.accentColor, border: `1px solid ${cfg.accentColor}` };
  return (
    <span
      className="inline-block rounded px-1.5 py-[1px] text-[7.5px] font-bold uppercase tracking-wide whitespace-nowrap"
      style={style}
    >
      {label}
    </span>
  );
}

function ResultRow({ row, patient, cfg, showMethod, showRemarks }) {
  const analysis = useMemo(
    () =>
      analyzeResult({
        value: row.value,
        referenceRange: row.referenceRange || row.normalRange,
        criticalLow: row.criticalLow,
        criticalHigh: row.criticalHigh,
        patient,
      }),
    [row, patient]
  );

  // Prefer server-persisted flag/status if present (keeps historical reports stable
  // even if reference-range logic evolves later); otherwise compute live.
  const flag = row.flag && row.flag !== 'NA' ? row.flag : analysis.flag;
  const displayRange = analysis.displayRange || row.normalRange || '-';
  const isCritical = flag === 'CRITICAL_LOW' || flag === 'CRITICAL_HIGH';
  const isAbnormal = isCritical || flag === 'HIGH' || flag === 'LOW' || flag === 'ABNORMAL';
  const arrow = flag === 'HIGH' || flag === 'CRITICAL_HIGH' ? '↑' : flag === 'LOW' || flag === 'CRITICAL_LOW' ? '↓' : '';

  const rowBg = isCritical ? '#fee2e2' : isAbnormal ? '#fef2f2' : flag === 'NORMAL' ? '#f0fdf4' : 'transparent';
  const resultColor = isCritical ? cfg.criticalColor : isAbnormal ? cfg.accentColor : flag === 'NORMAL' ? cfg.normalColor : cfg.bodyTextColor;

  return (
    <tr style={{ background: rowBg }} className="lab-report-section">
      <td className="border-b px-2 py-[3px] align-top" style={{ borderColor: cfg.borderColor }}>
        <div className="font-semibold" style={{ color: cfg.bodyTextColor }}>{row.testName}</div>
      </td>
      {showMethod && (
        <td className="border-b px-2 py-[3px] align-top text-slate-600" style={{ borderColor: cfg.borderColor }}>
          {row.method || '-'}
        </td>
      )}
      <td className="border-b px-2 py-[3px] align-top text-right font-bold whitespace-nowrap" style={{ borderColor: cfg.borderColor, color: resultColor }}>
        {row.value ?? '-'} {arrow && <span aria-hidden>{arrow}</span>}
      </td>
      <td className="border-b px-2 py-[3px] align-top text-slate-600 whitespace-nowrap" style={{ borderColor: cfg.borderColor }}>
        {row.unit || ''}
      </td>
      <td className="border-b px-2 py-[3px] align-top text-slate-600 whitespace-nowrap" style={{ borderColor: cfg.borderColor }}>
        {displayRange}
      </td>
      <td className="border-b px-2 py-[3px] align-top" style={{ borderColor: cfg.borderColor }}>
        <FlagBadge flag={flag} cfg={cfg} />
      </td>
      {showRemarks && (
        <td className="border-b px-2 py-[3px] align-top text-slate-600 italic" style={{ borderColor: cfg.borderColor }}>
          {row.remarks || ''}
        </td>
      )}
    </tr>
  );
}

export default function LabReportTemplate({ branding, labTest, verificationBaseUrl }) {
  const cfg = { ...DEFAULT_LAB_REPORT_CONFIG, ...(branding?.labReport || {}) };
  const patient = labTest?.patient || {};
  const doctor = labTest?.doctor || {};
  const results = labTest?.results || [];

  // Group rows by `section` (e.g. HAEMATOLOGY / BIO CHEMISTRY) so ANY
  // combination of tests renders correctly without special-case code.
  const sections = useMemo(() => {
    const map = new Map();
    results.forEach((row) => {
      const key = row.section || labTest?.labType || 'RESULTS';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    });
    return Array.from(map.entries()).map(([title, rows]) => ({ title, rows }));
  }, [results, labTest]);

  const showMethod = results.some((r) => r.method);
  const showRemarks = results.some((r) => r.remarks);

  const criticalRows = results.filter((r) => r.flag === 'CRITICAL_LOW' || r.flag === 'CRITICAL_HIGH');

  const contactLine = [branding?.address, branding?.phone && `Ph: ${branding.phone}`, branding?.email, branding?.website]
    .filter(Boolean)
    .join('   |   ');

  const accreditationLine = [
    cfg.registrationNumber && `Reg. No: ${cfg.registrationNumber}`,
    branding?.gstNumber && `GST: ${branding.gstNumber}`,
  ]
    .filter(Boolean)
    .join('   |   ');

  const sampleId = labTest?.labNumber || '-';
  const barcode = cfg.barcodeEnabled ? generateBarcodeSVG(sampleId, { barWidth: 1.4, height: 32 }) : null;
  const qrValue = `${cfg.qrCodeVerificationBaseUrl || verificationBaseUrl || ''}${sampleId}`
    || JSON.stringify({ uhid: patient.patientId, name: patient.name, lab: sampleId });

  const marginMm = cfg.printMarginMm ?? 10;

  return (
    <div
      className="lab-report-root lab-report-screen-frame"
      style={{
        fontFamily: cfg.fontFamily,
        fontSize: cfg.fontSize,
        color: cfg.bodyTextColor,
        width: '210mm',
        minHeight: '297mm',
        padding: `${marginMm}mm`,
        position: 'relative',
      }}
    >
      {/* Dynamic print-only page rules driven by settings */}
      <style>{`
        @page { size: ${cfg.paperSize || 'A4'}; margin: ${marginMm}mm; }
      `}</style>

      {cfg.watermarkLogo && (
        <div className="lab-report-watermark">
          <img src={cfg.watermarkLogo} alt="" />
        </div>
      )}

      <table className="lab-report-shell lab-report-content">
        <thead>
          <tr>
            <td>
              {/* ---------- HEADER (repeats on every printed page) ---------- */}
              <div
                className="flex items-start gap-3 pb-2 border-b-2"
                style={{ background: cfg.headerBackgroundColor, borderColor: cfg.primaryColor }}
              >
                {branding?.logo && (
                  <img src={branding.logo} alt="logo" className="h-14 w-14 object-contain rounded border border-slate-200 p-1 bg-white" />
                )}
                <div className="flex-1">
                  <div className="text-[19px] font-extrabold leading-tight" style={{ color: cfg.primaryColor }}>
                    {branding?.hospitalName || 'Hospital Name'}
                  </div>
                  {(cfg.hospitalSubtitle || branding?.tagline) && (
                    <div className="text-[9.5px] font-semibold" style={{ color: cfg.secondaryColor }}>
                      {cfg.hospitalSubtitle || branding?.tagline}
                    </div>
                  )}
                  {contactLine && <div className="text-[8px] text-slate-600 mt-0.5">{contactLine}</div>}
                  {accreditationLine && <div className="text-[8px] font-semibold mt-0.5" style={{ color: cfg.secondaryColor }}>{accreditationLine}</div>}
                </div>
                <div className="flex items-center gap-2">
                  {cfg.nablLogo && <img src={cfg.nablLogo} alt="NABL" className="h-9 object-contain" />}
                  {cfg.isoLogo && <img src={cfg.isoLogo} alt="ISO" className="h-9 object-contain" />}
                </div>
              </div>

              <div
                className="text-center text-[12px] font-extrabold tracking-wide py-1.5 mt-2 rounded"
                style={{ background: cfg.primaryColor, color: '#fff' }}
              >
                LABORATORY REPORT
                {labTest?.priority && labTest.priority !== 'routine' && (
                  <span className="ml-2 px-1.5 py-[1px] rounded text-[8px] font-bold" style={{ background: cfg.criticalColor }}>
                    {labTest.priority.toUpperCase()}
                  </span>
                )}
              </div>

              {/* ---------- PATIENT DETAILS ---------- */}
              <div className="mt-2 border rounded overflow-hidden" style={{ borderColor: cfg.borderColor }}>
                <div className="grid grid-cols-4 divide-x divide-y" style={{ borderColor: cfg.borderColor }}>
                  <Field label="Patient Name" value={patient.name} />
                  <Field label="UHID" value={patient.patientId} />
                  <Field label="Lab / Sample No" value={labTest?.labNumber} />
                  <Field label="Age / Gender" value={patient.age != null ? `${patient.age} / ${patient.gender || '-'}` : patient.gender} />

                  <Field label="Doctor / Consultant" value={doctor.name ? `Dr. ${doctor.name}` : null} />
                  <Field label="Department" value={labTest?.labType} />
                  <Field label="Ward / Bed" value={labTest?.ward || labTest?.bed ? `${labTest?.ward || ''} ${labTest?.bed || ''}`.trim() : null} />
                  <Field label="Mobile" value={patient.phone} />

                  <Field label="Collected On" value={fmtDateTime(labTest?.sampleCollectedAt)} />
                  <Field label="Received On" value={fmtDateTime(labTest?.sampleReceivedAt)} />
                  <Field label="Reported On" value={fmtDateTime(labTest?.reportGeneratedAt || labTest?.updatedAt)} />
                  <Field label="Status" value={labTest?.status?.replace('_', ' ')} />
                </div>
              </div>

              {/* Barcode + QR strip */}
              {(barcode || cfg.qrCodeEnabled) && (
                <div className="flex items-center justify-between mt-1.5 px-1">
                  {barcode && (
                    <div className="text-center" style={{ color: cfg.bodyTextColor }}>
                      <svg width={barcode.width} height={barcode.height} viewBox={`0 0 ${barcode.width} ${barcode.height}`}>
                        <g dangerouslySetInnerHTML={{ __html: barcode.svg }} />
                      </svg>
                      <div className="text-[7.5px] tracking-widest mt-[1px]">{sampleId}</div>
                    </div>
                  )}
                  {cfg.qrCodeEnabled && (
                    <QRCodeSVG value={qrValue} size={40} bgColor="transparent" fgColor={cfg.bodyTextColor} />
                  )}
                </div>
              )}
            </td>
          </tr>
        </thead>

        <tbody>
          <tr>
            <td>
              {/* ---------- CRITICAL ALERT BANNER ---------- */}
              {criticalRows.length > 0 && (
                <div
                  className="mt-2 rounded px-2 py-1 text-[9px] font-bold text-white lab-report-section"
                  style={{ background: cfg.criticalColor }}
                >
                  ⚠ CRITICAL VALUE ALERT: {criticalRows.map((r) => r.testName).join(', ')} — please notify the treating physician immediately.
                </div>
              )}

              {/* ---------- RESULT SECTIONS (any test type, any grouping) ---------- */}
              {sections.map((section) => (
                <div key={section.title} className="mt-2 rounded border overflow-hidden lab-report-section" style={{ borderColor: cfg.borderColor }}>
                  <div
                    className="text-[9.5px] font-extrabold uppercase tracking-wide px-2 py-1"
                    style={{ background: '#eef2ff', color: cfg.reportTitleColor }}
                  >
                    {section.title}
                  </div>
                  <table className="w-full border-collapse">
                    <thead>
                      <tr style={{ background: cfg.tableHeaderBackgroundColor, color: cfg.tableHeaderTextColor }}>
                        <th className="text-left px-2 py-1 text-[8.5px] font-bold uppercase">Test Name</th>
                        {showMethod && <th className="text-left px-2 py-1 text-[8.5px] font-bold uppercase">Method</th>}
                        <th className="text-right px-2 py-1 text-[8.5px] font-bold uppercase">Result</th>
                        <th className="text-left px-2 py-1 text-[8.5px] font-bold uppercase">Unit</th>
                        <th className="text-left px-2 py-1 text-[8.5px] font-bold uppercase">Reference Range</th>
                        <th className="text-left px-2 py-1 text-[8.5px] font-bold uppercase">Flag</th>
                        {showRemarks && <th className="text-left px-2 py-1 text-[8.5px] font-bold uppercase">Remarks</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {section.rows.map((row, idx) => (
                        <ResultRow key={row._id || `${section.title}-${idx}`} row={row} patient={patient} cfg={cfg} showMethod={showMethod} showRemarks={showRemarks} />
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}

              {/* ---------- COMMENTS / INTERPRETATION ---------- */}
              {(labTest?.interpretation || labTest?.impression || labTest?.conclusion || labTest?.doctorComments || labTest?.labComments || labTest?.recommendation || labTest?.remarks) && (
                <div className="mt-2 rounded border px-2 py-1.5 lab-report-section" style={{ borderColor: cfg.borderColor, background: cfg.highlightColor + '33' }}>
                  {labTest?.interpretation && <p className="text-[9px] mb-1"><span className="font-bold">Interpretation: </span>{labTest.interpretation}</p>}
                  {labTest?.impression && <p className="text-[9px] mb-1"><span className="font-bold">Impression: </span>{labTest.impression}</p>}
                  {labTest?.conclusion && <p className="text-[9px] mb-1"><span className="font-bold">Conclusion: </span>{labTest.conclusion}</p>}
                  {labTest?.doctorComments && <p className="text-[9px] mb-1"><span className="font-bold">Doctor's Comments: </span>{labTest.doctorComments}</p>}
                  {labTest?.labComments && <p className="text-[9px] mb-1"><span className="font-bold">Lab Comments: </span>{labTest.labComments}</p>}
                  {labTest?.recommendation && <p className="text-[9px] mb-1"><span className="font-bold">Recommendation: </span>{labTest.recommendation}</p>}
                  {labTest?.remarks && <p className="text-[9px]"><span className="font-bold">Remarks: </span>{labTest.remarks}</p>}
                </div>
              )}

              {/* ---------- SIGNATURES ---------- */}
              <div className="flex justify-between mt-6 px-2 lab-report-section">
                {[
                  { label: 'Lab Technician', name: labTest?.sampleCollectedBy?.name, sig: cfg.labTechnicianSignature },
                  { label: 'Pathologist', name: labTest?.reportVerifiedBy?.name, sig: cfg.pathologistSignature },
                  { label: 'Consultant', name: doctor.name ? `Dr. ${doctor.name}` : null, sig: cfg.doctorSignature },
                  { label: 'Authorized Signatory', name: labTest?.reportApprovedBy?.name, sig: cfg.authorizedSignature },
                ].map((sig) => (
                  <div key={sig.label} className="text-center">
                    {sig.sig ? (
                      <img src={sig.sig} alt={sig.label} className="h-8 object-contain mx-auto mb-0.5" />
                    ) : (
                      <div className="h-8" />
                    )}
                    <div className="w-32 border-t pt-0.5 text-[8px] font-semibold" style={{ borderColor: cfg.borderColor, color: cfg.bodyTextColor }}>
                      {sig.name || '\u00A0'}
                    </div>
                    <div className="text-[7.5px] text-slate-500">{sig.label}</div>
                  </div>
                ))}
              </div>
            </td>
          </tr>
        </tbody>

        <tfoot>
          <tr>
            <td>
              {/* ---------- FOOTER (repeats on every printed page) ---------- */}
              <div className="mt-3 pt-1 border-t flex items-center justify-between text-[7.5px]" style={{ borderColor: cfg.borderColor, color: cfg.footerColor }}>
                <span>{cfg.footerText}</span>
                <span>Printed on {fmtDateTime(new Date())} · Lab No: {sampleId}</span>
              </div>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}