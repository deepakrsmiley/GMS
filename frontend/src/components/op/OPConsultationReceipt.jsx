import React, { useEffect, useMemo } from 'react';
import { Printer, X } from 'lucide-react';
import { useBranding } from '../../hooks/useBranding';

const fmtINR = (n) =>
  `₹ ${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDateTime = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '—';
  const day = String(dt.getDate()).padStart(2, '0');
  const mon = dt.toLocaleString('en-IN', { month: 'short' });
  const time = dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  return `${day} ${mon} ${dt.getFullYear()} ${time}`;
};

function formatAddress(address) {
  if (!address) return '—';
  if (typeof address === 'string') return address.trim() || '—';
  return [address.street, address.city, address.state, address.pincode].filter(Boolean).join(', ') || '—';
}

function formatDoctor(name) {
  if (!name) return '—';
  const cleaned = String(name).replace(/^(dr\.?\s*)+/i, '').trim();
  return cleaned ? `Dr. ${cleaned}` : '—';
}

const MODE_LABEL = {
  cash: 'CASH',
  card: 'CARD',
  upi: 'UPI',
  cheque: 'CHEQUE',
  insurance: 'INSURANCE',
  online: 'ONLINE',
  multiple: 'MULTIPLE',
};

const ones = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE',
  'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'];
const tens_ = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];
function conv(n) {
  if (n < 20) return ones[n];
  if (n < 100) return tens_[Math.floor(n / 10)] + (n % 10 ? ` ${ones[n % 10]}` : '');
  if (n < 1000) return `${ones[Math.floor(n / 100)]} HUNDRED${n % 100 ? ` ${conv(n % 100)}` : ''}`;
  if (n < 100000) return `${conv(Math.floor(n / 1000))} THOUSAND${n % 1000 ? ` ${conv(n % 1000)}` : ''}`;
  if (n < 10000000) return `${conv(Math.floor(n / 100000))} LAKH${n % 100000 ? ` ${conv(n % 100000)}` : ''}`;
  return `${conv(Math.floor(n / 10000000))} CRORE${n % 10000000 ? ` ${conv(n % 10000000)}` : ''}`;
}
function numberToWords(num) {
  if (!num || Number.isNaN(Number(num))) return 'ZERO RUPEES ONLY';
  const r = Math.floor(num);
  const p = Math.round((num - r) * 100);
  return `${conv(r)} RUPEES${p > 0 ? ` AND ${conv(p)} PAISA` : ''} ONLY`;
}

const isConsultationItem = (it) => {
  if (!it) return false;
  if (it.type === 'consultation' || it.category === 'Consultation') return true;
  const text = `${it.name || ''} ${it.description || ''}`;
  return /consult|follow-up|follow up|surcharge/i.test(text);
};

function Detail({ label, value, mono }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 5, alignItems: 'flex-start' }}>
      <span style={{
        width: 108,
        flexShrink: 0,
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: '0.4px',
        textTransform: 'uppercase',
        color: '#334155',
      }}
      >
        {label}
      </span>
      <span style={{
        flex: 1,
        fontSize: 12,
        fontWeight: 600,
        color: '#0f172a',
        fontFamily: mono ? "'Courier New', monospace" : 'inherit',
      }}
      >
        {value || '—'}
      </span>
    </div>
  );
}

/**
 * A5 OP consultation receipt for reception.
 * Prints doctor consultation fee only — medicines, scans and other charges stay off this slip.
 */
export default function OPConsultationReceipt({ bill, op, onClose }) {
  const { branding } = useBranding();

  const consultItems = useMemo(() => {
    const raw = bill?.items || [];
    const onlyConsult = raw.filter(isConsultationItem);
    if (onlyConsult.length) return onlyConsult;
    const doctorName = formatDoctor(bill?.doctor?.name || op?.doctor?.name);
    const fee = raw.length ? 0 : Number(bill?.totalAmount) || 0;
    if (!fee) return [];
    return [{
      name: 'Consultation Fee',
      description: doctorName !== '—' ? `Consultation Fee — ${doctorName}` : 'Doctor consultation fee',
      quantity: 1,
      unitPrice: fee,
      totalAmount: fee,
    }];
  }, [bill, op]);

  const grandTotal = consultItems.reduce(
    (s, i) => s + Number(i.totalAmount ?? (Number(i.unitPrice) * (i.quantity || 1))),
    0,
  );
  const paidAmount = Math.min(Number(bill?.paidAmount) || 0, grandTotal) || (bill?.status === 'paid' ? grandTotal : 0);
  const dueAmount = Math.max(grandTotal - paidAmount, 0);
  const paymentMode = MODE_LABEL[bill?.paymentMode] || String(bill?.paymentMode || 'CASH').toUpperCase();
  const paidLabel = dueAmount <= 0 ? 'PAID' : (paidAmount > 0 ? 'PARTIAL' : 'DUE');

  useEffect(() => {
    let cancelled = false;
    const handleAfterPrint = () => onClose?.();
    window.addEventListener('afterprint', handleAfterPrint);
    const run = async () => {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const root = document.getElementById('op-consult-receipt-root');
      const img = root?.querySelector('img');
      if (img && !img.complete) {
        await Promise.race([
          new Promise((res) => { img.onload = res; img.onerror = res; }),
          new Promise((res) => setTimeout(res, 1000)),
        ]);
      }
      if (!cancelled) window.print();
    };
    const timer = setTimeout(run, 280);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, [onClose]);

  if (!bill) return null;

  const patient = bill.patient || op?.patient || {};
  const doctor = bill.doctor || op?.doctor || {};
  const department = bill.department || op?.department || {};
  const visit = bill.opRegistration || op || {};
  const registeredAt = visit.tokenDate || op?.tokenDate || bill.createdAt;
  const hospitalName = branding.hospitalName || 'Hospital';

  const th = {
    padding: '7px 8px',
    fontSize: 9.5,
    fontWeight: 700,
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
    border: '1px solid #111',
    background: '#111',
    color: '#fff',
  };
  const td = {
    padding: '7px 8px',
    border: '1px solid #cbd5e1',
    verticalAlign: 'top',
    fontSize: 12,
  };

  return (
    <>
      <div className="no-print" style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 10001,
        background: '#0f172a',
        display: 'flex',
        gap: 10,
        padding: '10px 20px',
        justifyContent: 'flex-end',
        alignItems: 'center',
      }}
      >
        <span style={{ color: '#fff', fontSize: 12, fontWeight: 600, marginRight: 'auto' }}>
          Consultation receipt · A5 · consultation fee only
        </span>
        <button
          type="button"
          onClick={() => window.print()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 18px',
            background: '#fff',
            color: '#0f172a',
            border: 'none',
            borderRadius: 6,
            fontWeight: 700,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          <Printer size={16} />
          Print A5
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 14px',
            background: '#e2e8f0',
            color: '#334155',
            border: 'none',
            borderRadius: 6,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <X size={16} />
          Close
        </button>
      </div>

      <div
        id="op-consult-receipt-backdrop"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10000,
          background: 'rgba(15, 23, 42, 0.72)',
          overflowY: 'auto',
          paddingTop: 56,
          paddingBottom: 36,
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <div
          id="op-consult-receipt-root"
          style={{
            background: '#fff',
            width: 560,
            color: '#0f172a',
            fontFamily: "'IBM Plex Sans', 'Segoe UI', Arial, sans-serif",
            boxShadow: '0 8px 40px rgba(0,0,0,0.28)',
            padding: '14px 16px 12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            {branding.logo ? (
              <img src={branding.logo} alt="" style={{ width: 52, height: 52, objectFit: 'contain' }} />
            ) : (
              <div style={{
                width: 52,
                height: 52,
                border: '1.5px solid #111',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: 13,
              }}
              >
                {hospitalName.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily: "'Times New Roman', Times, serif",
                fontSize: 26,
                fontWeight: 700,
                lineHeight: 1.1,
                color: '#111',
              }}
              >
                {hospitalName}
              </div>
              <div style={{ fontSize: 11, color: '#334155', marginTop: 4 }}>
                {branding.address || ''}
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              {branding.tagline && (
                <div style={{ fontSize: 11, fontWeight: 600, color: '#334155' }}>{branding.tagline}</div>
              )}
              {branding.phone && (
                <div style={{ fontSize: 11, color: '#334155', marginTop: 4 }}>
                  Ph:
                  {' '}
                  {branding.phone}
                </div>
              )}
            </div>
          </div>

          <div style={{
            textAlign: 'center',
            fontSize: 15,
            fontWeight: 800,
            letterSpacing: '1.4px',
            textTransform: 'uppercase',
            margin: '10px 0 8px',
            padding: '6px 0',
            borderTop: '2px solid #111',
            borderBottom: '2px solid #111',
          }}
          >
            OP CONSULTATION RECEIPT
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, padding: '8px 0 10px' }}>
            <div>
              <Detail label="Patient Name" value={(patient.name || '').toUpperCase()} />
              <Detail label="UHID" value={patient.patientId} mono />
              <Detail
                label="Age / Gender"
                value={[
                  patient.age != null && patient.age !== '' ? `${patient.age} yrs` : null,
                  patient.gender,
                ].filter(Boolean).join(' / ')}
              />
              <Detail label="Phone" value={patient.phone} />
              <Detail label="Address" value={formatAddress(patient.address)} />
            </div>
            <div>
              <Detail label="Receipt No" value={bill.billNumber} mono />
              <Detail label="Date / Time" value={fmtDateTime(registeredAt)} />
              <Detail label="Token" value={visit.tokenNumber || op?.tokenNumber} mono />
              <Detail label="Consultant" value={formatDoctor(doctor.name)} />
              <Detail label="Department" value={department.name} />
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, width: 28, textAlign: 'center' }}>#</th>
                <th style={{ ...th, textAlign: 'left' }}>Particulars — what was paid for</th>
                <th style={{ ...th, width: 44, textAlign: 'center' }}>Qty</th>
                <th style={{ ...th, width: 88, textAlign: 'right' }}>Rate</th>
                <th style={{ ...th, width: 96, textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {consultItems.map((it, idx) => {
                const qty = Number(it.quantity) || 1;
                const rate = Number(it.unitPrice) || 0;
                const amount = Number(it.totalAmount ?? rate * qty);
                return (
                  <tr key={it._id || idx}>
                    <td style={{ ...td, textAlign: 'center' }}>{idx + 1}</td>
                    <td style={td}>
                      <div style={{ fontWeight: 700 }}>{String(it.name || 'Consultation Fee').replace(/\bDr\.\s*DR\.?\s*/gi, 'Dr. ')}</div>
                      {it.description && it.description !== it.name && (
                        <div style={{ fontSize: 10.5, color: '#475569', marginTop: 2 }}>
                          {String(it.description).replace(/\bDr\.\s*DR\.?\s*/gi, 'Dr. ')}
                        </div>
                      )}
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>{qty}</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: "'Courier New', monospace" }}>{fmtINR(rate)}</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: "'Courier New', monospace", fontWeight: 700 }}>{fmtINR(amount)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 0.85fr', marginTop: 0, border: '1px solid #cbd5e1', borderTop: 0 }}>
            <div style={{ padding: '10px 12px', borderRight: '1px solid #cbd5e1' }}>
              <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase', color: '#64748b' }}>
                Amount in words
              </div>
              <div style={{ marginTop: 4, fontWeight: 700, fontSize: 11.5, lineHeight: 1.35 }}>
                {numberToWords(grandTotal)}
              </div>
              <div style={{ marginTop: 10, fontSize: 12 }}>
                Payment Mode:
                {' '}
                <strong>
                  {paymentMode}
                  {' · '}
                  {paidLabel}
                </strong>
              </div>
            </div>
            <div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <tbody>
                  <tr>
                    <td style={{ padding: '6px 10px', color: '#475569' }}>Total</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: "'Courier New', monospace" }}>{fmtINR(grandTotal)}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '6px 10px', color: '#475569', borderTop: '1px solid #e2e8f0' }}>Amount paid</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: "'Courier New', monospace", borderTop: '1px solid #e2e8f0' }}>{fmtINR(paidAmount)}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '6px 10px', color: '#475569', borderTop: '1px solid #e2e8f0' }}>Balance due</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: "'Courier New', monospace", borderTop: '1px solid #e2e8f0' }}>{fmtINR(dueAmount)}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px 10px', background: '#111', color: '#fff', fontWeight: 700 }}>Received</td>
                    <td style={{
                      padding: '8px 10px',
                      background: '#111',
                      color: '#fff',
                      textAlign: 'right',
                      fontFamily: "'Courier New', monospace",
                      fontWeight: 800,
                    }}
                    >
                      {fmtINR(paidAmount)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 28 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ borderTop: '1px solid #111', margin: '0 18px', paddingTop: 6, fontSize: 11, fontWeight: 700 }}>
                Patient / Attender
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ borderTop: '1px solid #111', margin: '0 18px', paddingTop: 6, fontSize: 11, fontWeight: 700 }}>
                Cashier / Reception
              </div>
            </div>
          </div>

          <div style={{
            textAlign: 'center',
            marginTop: 14,
            fontSize: 11,
            color: '#475569',
            fontStyle: 'italic',
          }}
          >
            {branding.footerNote || `Thank you for Choosing ${hospitalName}.`}
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: A5 portrait; margin: 8mm; }
          html, body {
            height: auto !important;
            overflow: visible !important;
            background: #fff !important;
          }
          .no-print { display: none !important; }
          body * { visibility: hidden !important; }
          #op-consult-receipt-root,
          #op-consult-receipt-root * { visibility: visible !important; }
          #op-consult-receipt-backdrop {
            position: static !important;
            inset: auto !important;
            overflow: visible !important;
            height: auto !important;
            padding: 0 !important;
            margin: 0 !important;
            display: block !important;
            background: none !important;
          }
          #op-consult-receipt-root {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 148mm !important;
            box-shadow: none !important;
            padding: 0 !important;
          }
          #op-consult-receipt-root, #op-consult-receipt-root * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
    </>
  );
}
