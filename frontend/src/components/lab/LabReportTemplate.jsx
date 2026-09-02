import React, { useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { analyzeResult } from '../../utils/labResultAnalyzer';
import { generateBarcodeSVG } from '../../utils/barcodeGenerator';
import '../../styles/labReportPrint.css';
import { GmsDevelopedPrintLine } from '../branding/GmsDevelopedBar';

const DEFAULT_LAB_REPORT_CONFIG = {
  primaryColor: '#14213d',
  secondaryColor: '#1e3a5f',
  accentColor: '#b91c1c',
  headerTextColor: '#14213d',
  tableHeaderBackgroundColor: '#14213d',
  tableHeaderTextColor: '#ffffff',
  borderColor: '#64748b',
  bodyTextColor: '#111827',
  reportTitleColor: '#14213d',
  criticalColor: '#b91c1c',
  normalColor: '#166534',
  footerColor: '#475569',
  fontFamily: "'IBM Plex Sans', Calibri, 'Segoe UI', Arial, Helvetica, sans-serif",
  fontSize: '11pt',
  paperSize: 'A4',
  printMarginMm: 12,
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

function flagLetter(flag) {
  if (!flag || flag === 'NA' || flag === 'NORMAL' || flag === 'Normal') return '';
  if (flag === 'CRITICAL_HIGH' || flag === 'CRITICAL_LOW' || flag === 'Critical') return 'C';
  if (flag === 'HIGH' || flag === 'High') return 'H';
  if (flag === 'LOW' || flag === 'Low') return 'L';
  if (flag === 'ABNORMAL') return 'A';
  return '';
}

function FlagMark({ flag, cfg }) {
  const letter = flagLetter(flag);
  if (!letter) return null;
  const isCritical = letter === 'C';
  return (
    <span
      className="lab-report-flag"
      style={{
        color: isCritical ? '#ffffff' : cfg.accentColor,
        background: isCritical ? cfg.criticalColor : 'transparent',
        borderColor: isCritical ? cfg.criticalColor : cfg.accentColor,
      }}
    >
      {letter}
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
    [row, patient],
  );

  const flag = row.flag && row.flag !== 'NA' ? row.flag : analysis.flag;
  const displayRange = analysis.displayRange || row.normalRange || '-';
  const isCritical = flag === 'CRITICAL_LOW' || flag === 'CRITICAL_HIGH' || flag === 'Critical';
  const isAbnormal = isCritical || flag === 'HIGH' || flag === 'LOW' || flag === 'ABNORMAL' || flag === 'High' || flag === 'Low';
  const resultColor = isCritical ? cfg.criticalColor : isAbnormal ? cfg.accentColor : cfg.bodyTextColor;
  const mark = flagLetter(flag) === 'H' || flag === 'CRITICAL_HIGH' ? ' ↑' : flagLetter(flag) === 'L' || flag === 'CRITICAL_LOW' ? ' ↓' : '';

  return (
    <tr>
      <td className="td-test">{row.testName}</td>
      {showMethod && <td className="td-method">{row.method || '-'}</td>}
      <td className="td-result" style={{ color: resultColor }}>
        {row.value ?? '-'}{isAbnormal ? mark : ''}
      </td>
      <td className="td-unit">{row.unit || ''}</td>
      <td className="td-range">{displayRange}</td>
      <td className="td-flag"><FlagMark flag={flag} cfg={cfg} /></td>
      {showRemarks && <td className="td-remarks">{row.remarks || ''}</td>}
    </tr>
  );
}

function InfoRow({ pairs }) {
  return (
    <tr>
      {pairs.map(([label, value], i) => (
        <React.Fragment key={i}>
          <td className="lbl">{label}</td>
          <td className="val">{value || '-'}</td>
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
    const source = labTest?.results?.length
      ? labTest.results
      : (labTest?.tests || []).map((t) => ({
        testName: t.testName,
        section: t.profileName || labTest?.labType || 'RESULTS',
        value: t.result ?? t.value ?? '',
        unit: t.unit || '',
        normalRange: t.normalRange || t.referenceRange || '',
        method: t.method || '',
        remarks: t.remarks || '',
      }));
    return source.filter((row) => String(row.value ?? '').trim() !== '');
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
  const resultTableClass = [
    'lab-report-results',
    showMethod ? 'has-method' : '',
    showRemarks ? 'has-remarks' : '',
  ].filter(Boolean).join(' ');

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
  const barcode = cfg.barcodeEnabled ? generateBarcodeSVG(sampleId, { barWidth: 1.4, height: 28 }) : null;
  const qrValue = `${cfg.qrCodeVerificationBaseUrl || verificationBaseUrl || ''}${sampleId}`
    || JSON.stringify({ uhid: patient.patientId, name: patient.name, lab: sampleId });

  const marginMm = cfg.printMarginMm ?? 12;
  const border = cfg.borderColor || '#64748b';
  const reportFont = /Arial|Helvetica Neue/i.test(cfg.fontFamily || '')
    ? DEFAULT_LAB_REPORT_CONFIG.fontFamily
    : (cfg.fontFamily || DEFAULT_LAB_REPORT_CONFIG.fontFamily);

  return (
    <div
      id={forPrint ? 'lab-report-print-root' : undefined}
      className="lab-report-root lab-report-screen-frame"
      style={{
        fontFamily: reportFont,
        fontSize: '11pt',
        color: cfg.bodyTextColor,
        width: '210mm',
        minHeight: forPrint ? undefined : '297mm',
        padding: forPrint ? undefined : `${marginMm}mm`,
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
              <table className="lab-report-brand">
                <colgroup>
                  <col className="lab-report-logo" />
                  <col className="lab-report-brand-copy" />
                  <col className="lab-report-marks" />
                </colgroup>
                <tbody>
                  <tr>
                    <td className="lab-report-logo">
                      {branding?.logo && <img src={branding.logo} alt="" />}
                    </td>
                    <td className="lab-report-brand-copy">
                      <GmsDevelopedPrintLine />
                      <div className="lab-report-hospital-name" style={{ color: cfg.primaryColor }}>
                        {(branding?.hospitalName || 'HOSPITAL NAME').toUpperCase()}
                      </div>
                      {(cfg.hospitalSubtitle || branding?.tagline) && (
                        <div className="lab-report-tagline" style={{ color: cfg.secondaryColor }}>
                          {cfg.hospitalSubtitle || branding?.tagline}
                        </div>
                      )}
                      {contactLine && <div className="lab-report-contact">{contactLine}</div>}
                      {accreditationLine && (
                        <div className="lab-report-accred" style={{ color: cfg.secondaryColor }}>{accreditationLine}</div>
                      )}
                    </td>
                    <td className="lab-report-marks">
                      {cfg.nablLogo && <img src={cfg.nablLogo} alt="NABL" />}
                      {cfg.isoLogo && <img src={cfg.isoLogo} alt="ISO" />}
                    </td>
                  </tr>
                </tbody>
              </table>

              <div className="lab-report-title-bar" style={{ borderColor: cfg.primaryColor }}>
                <span style={{ color: cfg.primaryColor }}>LABORATORY REPORT</span>
                {labTest?.priority && labTest.priority !== 'routine' && (
                  <span style={{
                    marginLeft: 8,
                    padding: '1px 6px',
                    fontSize: '8pt',
                    fontWeight: 700,
                    border: `0.8pt solid ${cfg.criticalColor}`,
                    color: cfg.criticalColor,
                  }}
                  >
                    {labTest.priority.toUpperCase()}
                  </span>
                )}
              </div>

              <table className="lab-report-info">
                <colgroup>
                  <col className="c-label" />
                  <col className="c-value" />
                  <col className="c-label" />
                  <col className="c-value" />
                </colgroup>
                <tbody>
                  <InfoRow pairs={[
                    ['Patient Name', patient.name],
                    ['UHID', patient.patientId],
                  ]}
                  />
                  <InfoRow pairs={[
                    ['Age / Gender', patient.age != null ? `${patient.age} / ${patient.gender || '-'}` : patient.gender],
                    ['Lab / Sample No', labTest?.labNumber],
                  ]}
                  />
                  <InfoRow pairs={[
                    ['Referring Doctor', doctor.name ? `Dr. ${doctor.name}` : null],
                    ['Department', labTest?.labType],
                  ]}
                  />
                  <InfoRow pairs={[
                    ['Collected On', fmtDateTime(labTest?.sampleCollectedAt)],
                    ['Received On', fmtDateTime(labTest?.sampleReceivedAt)],
                  ]}
                  />
                  <InfoRow pairs={
                    labTest?.showReportEnteredTime !== false
                      ? [
                        ['Reported On', fmtDateTime(labTest?.reportGeneratedAt || labTest?.updatedAt)],
                        ['Status', labTest?.status?.replace('_', ' ')],
                      ]
                      : [
                        ['Status', labTest?.status?.replace('_', ' ')],
                        ['Priority', labTest?.priority && labTest.priority !== 'routine' ? labTest.priority : 'Routine'],
                      ]
                  }
                  />
                </tbody>
              </table>

              {(barcode || cfg.qrCodeEnabled) && (
                <table className="lab-report-idstrip">
                  <tbody>
                    <tr>
                      <td className="barcode-cell">
                        {barcode && (
                          <>
                            <svg width={barcode.width} height={barcode.height} viewBox={`0 0 ${barcode.width} ${barcode.height}`}>
                              <g dangerouslySetInnerHTML={{ __html: barcode.svg }} />
                            </svg>
                            <div className="sid">{sampleId}</div>
                          </>
                        )}
                      </td>
                      {cfg.qrCodeEnabled && (
                        <td className="qr-cell">
                          <QRCodeSVG value={qrValue} size={42} bgColor="transparent" fgColor={cfg.bodyTextColor} />
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
              {sections.map((section) => (
                <div key={section.title} className="lab-report-block lab-report-section">
                  <div
                    className="lab-report-dept"
                    style={{
                      background: cfg.tableHeaderBackgroundColor,
                      color: cfg.tableHeaderTextColor,
                      borderColor: border,
                    }}
                  >
                    {section.title}
                  </div>
                  <table className={resultTableClass}>
                    <colgroup>
                      <col className="c-test" />
                      {showMethod && <col className="c-method" />}
                      <col className="c-result" />
                      <col className="c-unit" />
                      <col className="c-range" />
                      <col className="c-flag" />
                      {showRemarks && <col className="c-remarks" />}
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Investigation</th>
                        {showMethod && <th>Method</th>}
                        <th className="th-result">Result</th>
                        <th className="th-unit">Unit</th>
                        <th className="th-range">Biological Ref. Interval</th>
                        <th className="th-flag">Flag</th>
                        {showRemarks && <th>Remarks</th>}
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

              {(labTest?.interpretation || labTest?.impression || labTest?.conclusion || labTest?.doctorComments || labTest?.labComments || labTest?.recommendation || labTest?.remarks) && (
                <div className="lab-report-notes lab-report-section" style={{ borderColor: border }}>
                  <h4 style={{ color: cfg.primaryColor }}>Clinical notes</h4>
                  {labTest?.interpretation && <p><strong>Interpretation: </strong>{labTest.interpretation}</p>}
                  {labTest?.impression && <p><strong>Impression: </strong>{labTest.impression}</p>}
                  {labTest?.conclusion && <p><strong>Conclusion: </strong>{labTest.conclusion}</p>}
                  {labTest?.doctorComments && <p><strong>Doctor&apos;s comments: </strong>{labTest.doctorComments}</p>}
                  {labTest?.labComments && <p><strong>Lab comments: </strong>{labTest.labComments}</p>}
                  {labTest?.recommendation && <p><strong>Recommendation: </strong>{labTest.recommendation}</p>}
                  {labTest?.remarks && <p><strong>Remarks: </strong>{labTest.remarks}</p>}
                </div>
              )}

              <table className="lab-report-signs lab-report-section">
                <tbody>
                  <tr>
                    <td className="lab-report-sign-spacer" />
                    <td className="lab-report-sign-only">
                      {cfg.authorizedSignature ? (
                        <img src={cfg.authorizedSignature} alt="" />
                      ) : (
                        <div style={{ height: 28 }} />
                      )}
                      <div className="sig-line">{labTest?.reportApprovedBy?.name || '\u00A0'}</div>
                      <div className="sig-role">Authorized Signatory</div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
