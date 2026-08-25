import React, { useMemo } from 'react';
import { generateBarcodeSVG } from '../../utils/barcodeGenerator';
import '../../styles/ipAdmissionPrint.css';
import { GmsDevelopedPrintLine } from '../branding/GmsDevelopedBar';

/**
 * IPAdmissionPaperTemplate — A4 inpatient admission slip.
 * Letterhead from Hospital Branding; patient / bed / advance from admission.
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

function formatDoctor(doctor) {
  if (!doctor?.name) return '';
  const name = doctor.name.replace(/^dr\.?\s*/i, '').toUpperCase();
  const spec = doctor.specialization ? `. ${doctor.specialization}` : '';
  return `DR.${name}${spec}`;
}

function money(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return '—';
  return `₹${n.toLocaleString('en-IN')}`;
}

function paymentModeLabel(mode) {
  if (!mode) return '';
  const map = {
    cash: 'Cash',
    card: 'Card',
    upi: 'UPI',
    cheque: 'Cheque',
    bank_transfer: 'Bank Transfer',
    other: 'Other',
  };
  return map[mode] || String(mode);
}

function Field({ label, value }) {
  return (
    <div className="ip-field">
      <span className="ip-field-label">{label}</span>
      <span className="ip-field-colon">:</span>
      <span className="ip-field-value">{value || '—'}</span>
    </div>
  );
}

export default function IPAdmissionPaperTemplate({ branding, admission }) {
  const patient = admission?.patient || {};
  const doctor = admission?.doctor || {};
  const bed = admission?.bed || {};
  const room = admission?.room || {};
  const ward = admission?.ward || {};
  const vitals = admission?.admissionVitals || {};
  const attendant = admission?.attendant || {};
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
    const code = admission?.admissionNumber || uhid;
    if (!code) return null;
    const { svg, width, height } = generateBarcodeSVG(code, { barWidth: 1.15, height: 34 });
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={Math.min(width, 160)}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        className="ip-barcode-svg"
        aria-label={code}
      >
        <g dangerouslySetInnerHTML={{ __html: svg }} />
      </svg>
    );
  }, [admission?.admissionNumber, uhid]);

  const roomNo = room.roomNumber || bed.roomNumber || '—';
  const bedNo = bed.bedNumber || '—';
  const roomType = (room.type || bed.type || '').replace(/_/g, ' ');
  const dailyRate = room.dailyCharge ?? bed.dailyRate;
  const ageGender =
    patient.age != null || patient.gender
      ? `${patient.age ?? ''}${patient.age != null && patient.gender ? ' / ' : ''}${(patient.gender || '').toUpperCase()}`
      : '—';

  return (
    <div id="ip-admission-print-root" className="ip-paper-root">
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
          #ip-admission-print-root,
          #ip-admission-print-root * {
            visibility: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          #ip-admission-print-root {
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
      <header className="ip-header">
        <div className="ip-header-top">
          {logo ? (
            <img src={logo} alt="" className="ip-logo" />
          ) : (
            <div className="ip-logo-fallback" aria-hidden>H</div>
          )}
          <div className="ip-header-titles">
            <GmsDevelopedPrintLine />
            <div className="ip-hospital-name">{hospitalName}</div>
            {taglineLines.length > 0 && (
              <div className="ip-taglines">
                {taglineLines.map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="ip-header-rule" />
        <div className="ip-header-contact">
          <span>{hospitalAddress}</span>
          {hospitalPhone && <span className="ip-header-phone">Ph : {hospitalPhone}</span>}
        </div>
      </header>

      <div className="ip-title-bar">INPATIENT ADMISSION SLIP</div>

      <div className="ip-rule" />

      {/* ── Admission identity ──────────────────────────────────────── */}
      <section className="ip-section">
        <div className="ip-row-between">
          <div className="ip-id-block">
            <Field label="ADMISSION NO" value={admission?.admissionNumber} />
            <Field label="UHID" value={uhid} />
            <Field label="DATE / TIME" value={fmtDateTime(admission?.admissionDate || admission?.createdAt)} />
          </div>
          <div className="ip-barcode-wrap">{barcodeMarkup}</div>
        </div>
      </section>

      <div className="ip-rule" />

      {/* ── Patient details ─────────────────────────────────────────── */}
      <section className="ip-section">
        <div className="ip-section-title">Patient Details</div>
        <div className="ip-two-col">
          <div>
            <Field label="PATIENT NAME" value={(patient.name || '').toUpperCase()} />
            <Field label="AGE / GENDER" value={ageGender} />
            <Field label="BLOOD GROUP" value={patient.bloodGroup} />
            <Field label="PHONE" value={patient.phone} />
            <Field label="ADDRESS" value={formatAddress(patient.address)} />
          </div>
          <div>
            <Field label="CONSULTANT" value={formatDoctor(doctor)} />
            <Field label="DEPARTMENT" value={admission?.department?.name} />
            <Field label="ADMISSION TYPE" value={(admission?.admissionType || '').toUpperCase()} />
            <Field label="DIAGNOSIS" value={admission?.admissionDiagnosis} />
            <Field label="ALLERGIES" value={admission?.knownAllergies || 'Nil'} />
          </div>
        </div>
      </section>

      <div className="ip-rule" />

      {/* ── Bed / Room / Ward ───────────────────────────────────────── */}
      <section className="ip-section">
        <div className="ip-section-title">Room / Bed Allotment</div>
        <div className="ip-bed-grid">
          <div className="ip-bed-cell">
            <span className="ip-bed-label">Ward</span>
            <span className="ip-bed-value">{ward.name || '—'}</span>
          </div>
          <div className="ip-bed-cell">
            <span className="ip-bed-label">Room</span>
            <span className="ip-bed-value">{roomNo}</span>
          </div>
          <div className="ip-bed-cell">
            <span className="ip-bed-label">Bed</span>
            <span className="ip-bed-value">{bedNo}</span>
          </div>
          <div className="ip-bed-cell">
            <span className="ip-bed-label">Room Type</span>
            <span className="ip-bed-value" style={{ textTransform: 'capitalize' }}>{roomType || '—'}</span>
          </div>
          <div className="ip-bed-cell">
            <span className="ip-bed-label">Floor</span>
            <span className="ip-bed-value">{room.floor != null ? room.floor : '—'}</span>
          </div>
          <div className="ip-bed-cell">
            <span className="ip-bed-label">Daily Rate</span>
            <span className="ip-bed-value">{money(dailyRate)}</span>
          </div>
        </div>
      </section>

      <div className="ip-rule" />

      {/* ── Advance payment ─────────────────────────────────────────── */}
      <section className="ip-section">
        <div className="ip-section-title">Advance Payment</div>
        <div className="ip-advance-row">
          <div className="ip-advance-box">
            <span className="ip-advance-label">Advance Paid</span>
            <span className="ip-advance-amount">{money(admission?.advanceAmount)}</span>
          </div>
          <div className="ip-advance-box">
            <span className="ip-advance-label">Payment Mode</span>
            <span className="ip-advance-amount">
              {paymentModeLabel(admission?.advancePaymentMode) || '—'}
            </span>
          </div>
          <div className="ip-advance-box">
            <span className="ip-advance-label">Daily Room Charge</span>
            <span className="ip-advance-amount">{money(dailyRate)}</span>
          </div>
        </div>
      </section>

      <div className="ip-rule" />

      {/* ── Attendant + Vitals ──────────────────────────────────────── */}
      <section className="ip-section">
        <div className="ip-two-col">
          <div>
            <div className="ip-section-title">Attendant</div>
            <Field label="NAME" value={attendant.name} />
            <Field label="RELATION" value={attendant.relation} />
            <Field label="PHONE" value={attendant.phone} />
          </div>
          <div>
            <div className="ip-section-title">Admission Vitals</div>
            <Field label="BP" value={vitals.bloodPressure} />
            <Field label="PULSE" value={vitals.pulse} />
            <Field label="TEMP" value={vitals.temperature != null ? `${vitals.temperature} °F` : ''} />
            <Field label="WEIGHT" value={vitals.weight != null ? `${vitals.weight} kg` : ''} />
            <Field
              label="SpO2"
              value={vitals.oxygenSaturation != null ? `${vitals.oxygenSaturation}%` : ''}
            />
          </div>
        </div>
      </section>

      <div className="ip-rule" />

      <footer className="ip-footer">
        <div className="ip-sig">
          <div className="ip-sig-line" />
          <div className="ip-sig-label">Patient / Attendant Sign</div>
        </div>
        <div className="ip-sig">
          <div className="ip-sig-line" />
          <div className="ip-sig-label">Authorized Signatory</div>
        </div>
      </footer>

      <p className="ip-footnote">
        This is a computer-generated admission slip. Please retain for billing reference.
      </p>
    </div>
  );
}
