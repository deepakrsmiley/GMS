import React, { useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { analyzeResult, FLAG_STYLES } from '../../utils/labResultAnalyzer';
import { generateBarcodeSVG } from '../../utils/barcodeGenerator';
import '../../styles/labReportPrint.css';
import { GmsDevelopedPrintLine } from '../branding/GmsDevelopedBar';

/**
 * LabReportTemplate
 * ------------------------------------------------------------------
 * ONE reusable, dynamic laboratory report template that renders ANY
 * lab investigation (CBC, LFT, RFT, Lipid Profile, Culture, PCR,
 * Histopathology, or any custom test) without any code changes.
 *
 * Design language: classic diagnostic-lab report (LabCorp / SRL /
 * Dr Lal PathLabs style) — flat, rectangular, high-contrast tables,
 * no gradients, no pill badges, no drop shadows. Structure over
 * decoration.
 *
 * Everything visual — logo, hospital info, colors, fonts, signatures,
 * watermark, footer — comes from the `branding` prop (Hospital
 * Settings). Everything clinical — patient, tests, results, reference
 * ranges, comments — comes from the `labTest` prop.
 *
 * Props:
 *  - branding: the Branding document from GET /api/branding (branding.labReport holds report-specific config)
 *  - labTest:  a populated LabTest document (patient, doctor, results[], etc.)
 *  - verificationBaseUrl: optional override for the QR "verify report" URL
 * ------------------------------------------------------------------
 */

const DEFAULT_LAB_REPORT_CONFIG = {
  primaryColor: '#14213d',
  secondaryColor: '#1e3a5f',
  accentColor: '#b91c1c',
  headerTextColor: '#14213d',
  tableHeaderBackgroundColor: '#14213d',
  tableHeaderTextColor: '#ffffff',
  borderColor: '#94a3b8',
  bodyTextColor: '#1a1a1a',
  reportTitleColor: '#14213d',
  criticalColor: '#b91c1c',
  normalColor: '#166534',
  footerColor: '#475569',
  fontFamily: "'Arial', 'Helvetica Neue', sans-serif",
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

function TrendArrow({ direction, color }) {
  if (!direction) return null;
  const points = direction === 'up' ? '5,1 9,9 1,9' : '1,1 9,1 5,9';
  return (
    <svg width="8" height="8" viewBox="0 0 10 10" style={{ display: 'inline-block', verticalAlign: 'middle', marginLeft: 4 }} aria-hidden="true">
      <polygon points={points} fill={color} />
    </svg>
  );
}

/* Plain rectangular flag label — no pill, no dot, just bold colored text
   in a thin bordered box, matching classic lab-report typography. */
function FlagLabel({ flag, cfg }) {
  if (!flag || flag === 'NA') return null;
  const isCritical = flag === 'CRITICAL_LOW' || flag === 'CRITICAL_HIGH';
  const isNormal = flag === 'NORMAL';
  const label = flag.replace('_', ' ');
  if (isNormal) return null; // classic reports leave normal rows unmarked
  const color = isCritical ? '#ffffff' : cfg.accentColor;
  const bg = isCritical ? cfg.criticalColor : 'transparent';
  return (
    <span
      className="inline-block text-[8px] font-bold uppercase tracking-wide px-1.5 py-[1px] border"
      style={{ color, background: bg, borderColor: isCritical ? cfg.criticalColor : cfg.accentColor }}
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

  const flag = row.flag && row.flag !== 'NA' ? row.flag : analysis.flag;
  const displayRange = analysis.displayRange || row.normalRange || '-';
  const isCritical = flag === 'CRITICAL_LOW' || flag === 'CRITICAL_HIGH';
  const isAbnormal = isCritical || flag === 'HIGH' || flag === 'LOW' || flag === 'ABNORMAL';
  const arrowDirection =
    flag === 'HIGH' || flag === 'CRITICAL_HIGH' ? 'up' :
    flag === 'LOW' || flag === 'CRITICAL_LOW' ? 'down' : null;

  const resultColor = isCritical ? cfg.criticalColor : isAbnormal ? cfg.accentColor : cfg.bodyTextColor;

  return (
    <tr className="lab-report-section">
      <td className="border px-2 py-[4px] align-top" style={{ borderColor: cfg.borderColor }}>
        <span className="font-bold" style={{ color: cfg.bodyTextColor }}>{row.testName}</span>
      </td>
      {showMethod && (
        <td className="border px-2 py-[4px] align-top" style={{ borderColor: cfg.borderColor, color: cfg.bodyTextColor }}>
          {row.method || '-'}
        </td>
      )}
      <td className="border px-2 py-[4px] align-top text-right whitespace-nowrap" style={{ borderColor: cfg.borderColor }}>
        <span className="inline-flex items-center justify-end font-bold" style={{ color: resultColor, fontVariantNumeric: 'tabular-nums' }}>
          {row.value ?? '-'}
          <TrendArrow direction={arrowDirection} color={resultColor} />
        </span>
      </td>
      <td className="border px-2 py-[4px] align-top whitespace-nowrap" style={{ borderColor: cfg.borderColor, color: cfg.bodyTextColor }}>
        {row.unit || ''}
      </td>
      <td className="border px-2 py-[4px] align-top whitespace-nowrap" style={{ borderColor: cfg.borderColor, color: cfg.bodyTextColor, fontVariantNumeric: 'tabular-nums' }}>
        {displayRange}
      </td>
      <td className="border px-2 py-[4px] align-top" style={{ borderColor: cfg.borderColor }}>
        <FlagLabel flag={flag} cfg={cfg} />
      </td>
      {showRemarks && (
        <td className="border px-2 py-[4px] align-top italic" style={{ borderColor: cfg.borderColor, color: cfg.bodyTextColor }}>
          {row.remarks || ''}
        </td>
      )}
    </tr>
  );
}

/* Patient info rendered as a genuine two-column label/value table row,
   the way printed lab requisition slips are laid out — not floating cards. */
function InfoRow({ pairs }) {
  return (
    <tr>
      {pairs.map(([label, value], i) => (
        <React.Fragment key={i}>
          <td className="border px-2 py-1 bg-slate-50 font-bold text-[8.5px] uppercase tracking-wide whitespace-nowrap" style={{ borderColor: '#94a3b8', color: '#334155' }}>
            {label}
          </td>
          <td className="border px-2 py-1 text-[10px] font-semibold" style={{ borderColor: '#94a3b8', color: '#0f172a' }}>
            {value || '-'}
          </td>
        </React.Fragment>
      ))}
    </tr>
  );
}

export default function LabReportTemplate({ branding, labTest, verificationBaseUrl, forPrint = false }) {
  const cfg = { ...DEFAULT_LAB_REPORT_CONFIG, ...(branding?.labReport || {}) };
  const patient = labTest?.patient || {};
  const doctor = labTest?.doctor || {};
  const results = useMemo(() => {
    if (labTest?.results?.length) return labTest.results;
    return (labTest?.tests || []).map((t) => ({
      testName: t.testName,
      section: t.profileName || labTest?.labType || 'RESULTS',
      value: t.result ?? t.value ?? '',
      unit: t.unit || '',
      normalRange: t.normalRange || t.referenceRange || '',
      method: t.method || '',
      remarks: t.remarks || '',
    }));
  }, [labTest]);

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
    .join('  |  ');

  const accreditationLine = [
    cfg.registrationNumber && `Reg. No: ${cfg.registrationNumber}`,
    branding?.gstNumber && `GST: ${branding.gstNumber}`,
  ]
    .filter(Boolean)
    .join('  |  ');

  const sampleId = labTest?.labNumber || '-';
  const barcode = cfg.barcodeEnabled ? generateBarcodeSVG(sampleId, { barWidth: 1.4, height: 30 }) : null;
  const qrValue = `${cfg.qrCodeVerificationBaseUrl || verificationBaseUrl || ''}${sampleId}`
    || JSON.stringify({ uhid: patient.patientId, name: patient.name, lab: sampleId });

  const marginMm = cfg.printMarginMm ?? 10;

  return (
    <div
      id={forPrint ? 'lab-report-print-root' : undefined}
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
      <style>{`@page { size: ${cfg.paperSize || 'A4'}; margin: ${marginMm}mm; }`}</style>

      {cfg.watermarkLogo && (
        <div className="lab-report-watermark">
          <img src={cfg.watermarkLogo} alt="" />
        </div>
      )}

      <table className="lab-report-shell lab-report-content">
        <thead>
          <tr>
            <td>
              {/* ---------- HEADER ---------- */}
              <table className="w-full border-collapse mb-2">
                <tbody>
                  <tr>
                    <td className="w-16 align-top pr-2">
                      {branding?.logo && <img src={branding.logo} alt="logo" className="h-14 w-14 object-contain" />}
                    </td>
                    <td className="align-top">
                      <GmsDevelopedPrintLine />
                      <div className="text-[20px] font-bold leading-tight" style={{ color: cfg.primaryColor }}>
                        {(branding?.hospitalName || 'HOSPITAL NAME').toUpperCase()}
                      </div>
                      {(cfg.hospitalSubtitle || branding?.tagline) && (
                        <div className="text-[9px] font-semibold" style={{ color: cfg.secondaryColor }}>
                          {cfg.hospitalSubtitle || branding?.tagline}
                        </div>
                      )}
                      {contactLine && <div className="text-[8px] text-slate-600 mt-0.5">{contactLine}</div>}
                      {accreditationLine && <div className="text-[8px] font-semibold mt-0.5" style={{ color: cfg.secondaryColor }}>{accreditationLine}</div>}
                    </td>
                    <td className="align-top text-right w-32">
                      {cfg.nablLogo && <img src={cfg.nablLogo} alt="NABL" className="h-8 object-contain inline-block ml-1" />}
                      {cfg.isoLogo && <img src={cfg.isoLogo} alt="ISO" className="h-8 object-contain inline-block ml-1" />}
                    </td>
                  </tr>
                </tbody>
              </table>

              <div className="border-t-2 border-b-2 py-1 text-center" style={{ borderColor: cfg.primaryColor }}>
                <span className="text-[13px] font-bold tracking-wide" style={{ color: cfg.primaryColor }}>
                  LABORATORY REPORT
                </span>
                {labTest?.priority && labTest.priority !== 'routine' && (
                  <span className="ml-2 px-1.5 py-[1px] text-[8px] font-bold border" style={{ color: cfg.criticalColor, borderColor: cfg.criticalColor }}>
                    {labTest.priority.toUpperCase()}
                  </span>
                )}
              </div>

              {/* ---------- PATIENT DETAILS (requisition-slip style table) ---------- */}
              <table className="w-full border-collapse mt-2">
                <tbody>
                  <InfoRow pairs={[
                    ['Patient Name', patient.name],
                    ['UHID', patient.patientId],
                  ]} />
                  <InfoRow pairs={[
                    ['Age / Gender', patient.age != null ? `${patient.age} / ${patient.gender || '-'}` : patient.gender],
                    ['Lab / Sample No', labTest?.labNumber],
                  ]} />
                  <InfoRow pairs={[
                    ['Referring Doctor', doctor.name ? `Dr. ${doctor.name}` : null],
                    ['Department', labTest?.labType],
                  ]} />
                  <InfoRow pairs={[
                    ['Collected On', fmtDateTime(labTest?.sampleCollectedAt)],
                    ['Received On', fmtDateTime(labTest?.sampleReceivedAt)],
                  ]} />
                  <InfoRow pairs={[
                    ['Reported On', fmtDateTime(labTest?.reportGeneratedAt || labTest?.updatedAt)],
                    ['Status', labTest?.status?.replace('_', ' ')],
                  ]} />
                </tbody>
              </table>

              {/* Barcode + QR strip */}
              {(barcode || cfg.qrCodeEnabled) && (
                <table className="w-full border-collapse mt-1">
                  <tbody>
                    <tr>
                      <td className="border px-2 py-1 align-middle" style={{ borderColor: cfg.borderColor }}>
                        {barcode && (
                          <div>
                            <svg width={barcode.width} height={barcode.height} viewBox={`0 0 ${barcode.width} ${barcode.height}`}>
                              <g dangerouslySetInnerHTML={{ __html: barcode.svg }} />
                            </svg>
                            <div className="text-[7.5px] tracking-widest mt-[1px]">{sampleId}</div>
                          </div>
                        )}
                      </td>
                      {cfg.qrCodeEnabled && (
                        <td className="border px-2 py-1 align-middle text-right w-16" style={{ borderColor: cfg.borderColor }}>
                          <QRCodeSVG value={qrValue} size={38} bgColor="transparent" fgColor={cfg.bodyTextColor} />
                        </td>
                      )}
                    </tr>
                  </tbody>
                </table>
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
                  className="mt-2 px-2 py-1 text-[9px] font-bold text-white text-center lab-report-section"
                  style={{ background: cfg.criticalColor }}
                >
                  CRITICAL VALUE ALERT: {criticalRows.map((r) => r.testName).join(', ')} — PLEASE NOTIFY THE TREATING PHYSICIAN IMMEDIATELY
                </div>
              )}

              {/* ---------- RESULT SECTIONS ---------- */}
              {sections.map((section) => (
                <div key={section.title} className="mt-2 lab-report-section">
                  <div
                    className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 border border-b-0"
                    style={{ background: cfg.tableHeaderBackgroundColor, color: cfg.tableHeaderTextColor, borderColor: cfg.borderColor }}
                  >
                    {section.title}
                  </div>
                  <table className="w-full border-collapse">
                    <thead>
                      <tr style={{ background: '#e2e8f0', color: '#1e293b' }}>
                        <th className="border text-left px-2 py-1 text-[8.5px] font-bold uppercase" style={{ borderColor: cfg.borderColor }}>Test Name</th>
                        {showMethod && <th className="border text-left px-2 py-1 text-[8.5px] font-bold uppercase" style={{ borderColor: cfg.borderColor }}>Method</th>}
                        <th className="border text-right px-2 py-1 text-[8.5px] font-bold uppercase" style={{ borderColor: cfg.borderColor }}>Result</th>
                        <th className="border text-left px-2 py-1 text-[8.5px] font-bold uppercase" style={{ borderColor: cfg.borderColor }}>Unit</th>
                        <th className="border text-left px-2 py-1 text-[8.5px] font-bold uppercase" style={{ borderColor: cfg.borderColor }}>Reference Range</th>
                        <th className="border text-left px-2 py-1 text-[8.5px] font-bold uppercase" style={{ borderColor: cfg.borderColor }}>Flag</th>
                        {showRemarks && <th className="border text-left px-2 py-1 text-[8.5px] font-bold uppercase" style={{ borderColor: cfg.borderColor }}>Remarks</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {section.rows.map((row, idx) => (
                        <ResultRow
                          key={row._id || `${section.title}-${idx}`}
                          row={row}
                          patient={patient}
                          cfg={cfg}
                          showMethod={showMethod}
                          showRemarks={showRemarks}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}

              {/* ---------- COMMENTS / INTERPRETATION ---------- */}
              {(labTest?.interpretation || labTest?.impression || labTest?.conclusion || labTest?.doctorComments || labTest?.labComments || labTest?.recommendation || labTest?.remarks) && (
                <div className="mt-2 border px-2 py-1.5 lab-report-section" style={{ borderColor: cfg.borderColor }}>
                  <div className="text-[8.5px] font-bold uppercase tracking-wide mb-1" style={{ color: cfg.primaryColor }}>Clinical Notes</div>
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
              <table className="w-full border-collapse mt-8 lab-report-section">
                <tbody>
                  <tr>
                    {[
                      { label: 'Lab Technician', name: labTest?.sampleCollectedBy?.name, sig: cfg.labTechnicianSignature },
                      { label: 'Pathologist', name: labTest?.reportVerifiedBy?.name, sig: cfg.pathologistSignature },
                      { label: 'Consultant', name: doctor.name ? `Dr. ${doctor.name}` : null, sig: cfg.doctorSignature },
                      { label: 'Authorized Signatory', name: labTest?.reportApprovedBy?.name, sig: cfg.authorizedSignature },
                    ].map((sig) => (
                      <td key={sig.label} className="text-center align-bottom" style={{ width: '25%' }}>
                        {sig.sig ? (
                          <img src={sig.sig} alt={sig.label} className="h-8 object-contain mx-auto mb-0.5" />
                        ) : (
                          <div className="h-8" />
                        )}
                        <div className="border-t pt-0.5 text-[8px] font-bold mx-4" style={{ borderColor: cfg.bodyTextColor }}>
                          {sig.name || '\u00A0'}
                        </div>
                        <div className="text-[7.5px] text-slate-600 uppercase tracking-wide">{sig.label}</div>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>

        <tfoot>
          <tr>
            <td>
              <div className="mt-3 pt-1 border-t-2 flex items-center justify-between text-[7.5px]" style={{ borderColor: cfg.primaryColor, color: cfg.footerColor }}>
                <span>{cfg.footerText}</span>
                <span>Printed on {fmtDateTime(new Date())} &middot; Lab No: {sampleId}</span>
              </div>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}