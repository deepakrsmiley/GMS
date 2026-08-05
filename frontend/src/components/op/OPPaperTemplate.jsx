import React, { useMemo } from 'react';
import { generateBarcodeSVG } from '../../utils/barcodeGenerator';
import '../../styles/opPaperPrint.css';

/**
 * OPPaperTemplate — A4 OP consultation / prescription slip.
 * Automatically lists used labs, procedures, machine/equipment, and
 * pharmacy medicines (entered by search) for this OP visit.
 */

function fmtDateTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${date} ${time}`;
}

function formatAddress(address) {
  if (!address) return '';
  if (typeof address === 'string') return address;
  return [address.street, address.city, address.state, address.pincode].filter(Boolean).join(', ');
}

function formatConsultant(doctor) {
  if (!doctor?.name) return '';
  const name = doctor.name.replace(/^dr\.?\s*/i, '').toUpperCase();
  const spec = doctor.specialization ? `. ${doctor.specialization}` : '';
  return `DR.${name}${spec}`;
}

function formatToken(token) {
  if (token == null || token === '') return '';
  const n = Number(token);
  return Number.isFinite(n) ? String(n) : String(token);
}

function Field({ label, value, className = '' }) {
  return (
    <div className={`op-field ${className}`}>
      <span className="op-field-label">{label}</span>
      <span className="op-field-colon">:</span>
      <span className="op-field-value">{value || ''}</span>
    </div>
  );
}

function Vital({ label, value, unit }) {
  const text = value != null && value !== '' ? `${value}${unit ? unit : ''}` : '';
  return (
    <div className="op-vital">
      <span className="op-vital-label">{label}</span>
      <span className="op-vital-colon">:</span>
      <span className="op-vital-value">{text}</span>
    </div>
  );
}

function UsedSection({ title, children }) {
  return (
    <div className="op-used-block">
      <div className="op-used-title">{title}</div>
      {children}
    </div>
  );
}

export default function OPPaperTemplate({ branding, op }) {
  const patient = op?.patient || {};
  const doctor = op?.doctor || {};
  const vitals = op?.vitals || {};
  const uhid = patient.patientId || '';

  const hospitalName = branding?.hospitalName || 'Hospital Name';
  const hospitalAddress = branding?.address || '';
  const hospitalPhone = branding?.phone || '';
  const logo = branding?.logo || '';

  const taglineLines = useMemo(() => {
    const raw =
      branding?.labReport?.hospitalSubtitle ||
      branding?.labReport?.hospitalTagline ||
      branding?.tagline ||
      '';
    return String(raw)
      .split(/\r?\n|\s*\|\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
  }, [branding]);

  const barcodeMarkup = useMemo(() => {
    if (!uhid) return null;
    const { svg, width, height } = generateBarcodeSVG(uhid, { barWidth: 1.2, height: 36 });
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={Math.min(width, 150)}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        className="op-barcode-svg"
        aria-label={uhid}
      >
        <g dangerouslySetInnerHTML={{ __html: svg }} />
      </svg>
    );
  }, [uhid]);

  const bmi = useMemo(() => {
    if (vitals.bmi != null && vitals.bmi !== '') return vitals.bmi;
    const w = Number(vitals.weight);
    const hCm = Number(vitals.height);
    if (!w || !hCm) return '';
    const hM = hCm / 100;
    return (w / (hM * hM)).toFixed(1);
  }, [vitals]);

  const ageGender =
    patient.age != null || patient.gender
      ? `${patient.age ?? ''}${patient.age != null && patient.gender ? ' / ' : ''}${(patient.gender || '').toUpperCase()}`
      : '';

  const hasClinical =
    op?.diagnosis ||
    op?.chiefComplaint ||
    op?.examinationFindings ||
    op?.investigationsAdvised ||
    op?.consultationNotes;

  const serviceUsages = op?.serviceUsages || [];
  const procedures = serviceUsages.filter((u) => u.category === 'Procedure');
  const machines = serviceUsages.filter((u) => u.category === 'Equipment');
  const otherServices = serviceUsages.filter(
    (u) => u.category !== 'Procedure' && u.category !== 'Equipment',
  );
  const labs = op?.labs || [];
  const medicines = op?.pharmacyMedicines || [];

  const hasUsedItems =
    procedures.length > 0 ||
    machines.length > 0 ||
    otherServices.length > 0 ||
    labs.length > 0 ||
    medicines.length > 0;

  const formatServiceLine = (u) => {
    const qty = u.quantity > 1 ? ` × ${u.quantity}` : '';
    const notes = u.notes ? ` (${u.notes})` : '';
    return `${u.serviceName}${qty}${notes}`;
  };

  const formatLabLine = (lab) => {
    const profile = lab.testProfile || lab.labType || 'Lab';
    const tests = (lab.tests || []).map((t) => t.testName).filter(Boolean);
    if (tests.length) return `${profile}: ${tests.join(', ')}`;
    return profile;
  };

  const formatMedLine = (m, i) => {
    const drug = m.drugName && m.drugName !== m.name ? ` [${m.drugName}]` : '';
    const dose = m.dosage ? ` — ${m.dosage}` : '';
    const freq = m.frequency ? ` ${m.frequency}` : '';
    const dur = m.duration ? ` × ${m.duration}` : '';
    const qty = m.quantity ? ` (Qty ${m.quantity})` : '';
    const instr = m.instructions ? ` — ${m.instructions}` : '';
    return `${i + 1}. ${m.name}${drug}${dose}${freq}${dur}${qty}${instr}`;
  };

  return (
    <div id="op-paper-print-root" className="op-paper-root">
      <style>{`
        @page { size: A4 portrait; margin: 8mm 10mm; }
        @media print {
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body * { visibility: hidden !important; }
          #op-paper-print-root,
          #op-paper-print-root * {
            visibility: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          #op-paper-print-root {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            right: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 6mm 8mm !important;
            background: #fff !important;
            box-shadow: none !important;
            display: block !important;
            z-index: 99999 !important;
          }
        }
      `}</style>

      {/* ── Letterhead from Hospital Branding ───────────────────────── */}
      <header className="op-header">
        <div className="op-header-top">
          {logo ? (
            <img src={logo} alt="" className="op-logo" />
          ) : (
            <div className="op-logo-fallback" aria-hidden>H</div>
          )}
          <div className="op-header-titles">
            <div className="op-hospital-name">{hospitalName}</div>
            {taglineLines.length > 0 && (
              <div className="op-taglines">
                {taglineLines.map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="op-header-rule" />
        <div className="op-header-contact">
          <span className="op-header-address">{hospitalAddress}</span>
          {hospitalPhone && <span className="op-header-phone">Ph : {hospitalPhone}</span>}
        </div>
      </header>

      <div className="op-rule" />

      {/* ── Patient block ───────────────────────────────────────────── */}
      <section className="op-patient">
        <div className="op-patient-grid">
          <div className="op-patient-left">
            <Field label="UHID" value={uhid} />
            <Field label="PATIENT NAME" value={(patient.name || '').toUpperCase()} />
            <Field label="CONSULTANT" value={formatConsultant(doctor)} />
            <Field label="ADDRESS" value={formatAddress(patient.address)} />
            <Field label="Ph" value={patient.phone || ''} />
          </div>
          <div className="op-patient-right">
            <div className="op-barcode-wrap">{barcodeMarkup}</div>
            <Field label="DATE" value={fmtDateTime(op?.tokenDate || op?.scheduledTime || op?.createdAt)} />
            <Field label="AGE/GENDER" value={ageGender} />
            <Field label="TOKEN" value={formatToken(op?.tokenNumber)} />
          </div>
        </div>
      </section>

      <div className="op-rule" />

      {/* ── Vitals (exact order from sample paper) ──────────────────── */}
      <section className="op-vitals">
        <Vital label="Temp" value={vitals.temperature} unit={vitals.temperature ? '°F' : ''} />
        <Vital label="Weight" value={vitals.weight} unit={vitals.weight ? 'kg' : ''} />
        <Vital label="SpO2" value={vitals.oxygenSaturation ?? vitals.spo2} unit={(vitals.oxygenSaturation ?? vitals.spo2) ? '%' : ''} />
        <Vital label="BMI" value={bmi} />
        <Vital label="PR" value={vitals.pulse} unit={vitals.pulse ? ' bpm' : ''} />
        <Vital label="BP" value={vitals.bloodPressure || vitals.bp} />
        <Vital label="RR" value={vitals.respiratoryRate ?? vitals.rr} />
      </section>

      <div className="op-rule" />

      {/* ── Clinical notes + auto-listed used services / Rx ─────────── */}
      <section className="op-clinical">
        {hasClinical ? (
          <div className="op-clinical-filled">
            {op.diagnosis && (
              <div className="op-note"><b>Imp:</b> {op.diagnosis}</div>
            )}
            {op.chiefComplaint && (
              <div className="op-note"><b>c/o</b> {op.chiefComplaint}</div>
            )}
            {op.examinationFindings && (
              <div className="op-note"><b>O/E</b> {op.examinationFindings}</div>
            )}
            {op.investigationsAdvised && (
              <div className="op-note"><b>Adv:</b> {op.investigationsAdvised}</div>
            )}
            {op.consultationNotes && (
              <div className="op-note">{op.consultationNotes}</div>
            )}
          </div>
        ) : !hasUsedItems ? (
          <div className="op-clinical-blank" />
        ) : null}

        {hasUsedItems && (
          <div className="op-used">
            {labs.length > 0 && (
              <UsedSection title="Lab">
                <ol className="op-used-list">
                  {labs.map((lab) => (
                    <li key={lab._id || lab.labNumber}>{formatLabLine(lab)}</li>
                  ))}
                </ol>
              </UsedSection>
            )}

            {procedures.length > 0 && (
              <UsedSection title="Procedure">
                <ol className="op-used-list">
                  {procedures.map((u) => (
                    <li key={u._id}>{formatServiceLine(u)}</li>
                  ))}
                </ol>
              </UsedSection>
            )}

            {machines.length > 0 && (
              <UsedSection title="Machine / Equipment">
                <ol className="op-used-list">
                  {machines.map((u) => (
                    <li key={u._id}>{formatServiceLine(u)}</li>
                  ))}
                </ol>
              </UsedSection>
            )}

            {otherServices.length > 0 && (
              <UsedSection title="Other Services">
                <ol className="op-used-list">
                  {otherServices.map((u) => (
                    <li key={u._id}>
                      <span className="op-used-cat">[{u.category}]</span> {formatServiceLine(u)}
                    </li>
                  ))}
                </ol>
              </UsedSection>
            )}

            {medicines.length > 0 && (
              <UsedSection title="Rx (Medicines)">
                <ol className="op-used-list op-rx-list">
                  {medicines.map((m, i) => (
                    <li key={`${m.name}-${i}`}>{formatMedLine(m, i)}</li>
                  ))}
                </ol>
              </UsedSection>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
