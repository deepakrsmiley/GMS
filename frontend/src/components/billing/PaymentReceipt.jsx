import React from 'react';
import { Printer, X } from 'lucide-react';
import { useBranding } from '../../hooks/useBranding';

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const modeLabel = (mode) => ({
  cash: 'Cash',
  card: 'Card',
  upi: 'UPI',
  cheque: 'Cheque',
  insurance: 'Insurance',
  online: 'Online',
  bank_transfer: 'Bank transfer',
  multiple: 'Split',
}[mode] || (mode ? String(mode).replace(/_/g, ' ') : 'Cash'));

export default function PaymentReceipt({ receipt, onClose }) {
  const { branding } = useBranding();
  if (!receipt) return null;

  const bill = receipt.bill || {};
  const patient = bill.patient || {};
  const paidNow = Number(receipt.paidNow) || 0;
  const opening = Number(receipt.openingAmount);
  const remaining = Number(bill.dueAmount);
  const balance = Number.isFinite(remaining)
    ? remaining
    : Math.max((Number.isFinite(opening) ? opening : 0) - paidNow, 0);
  const when = new Date();
  const lines = Array.isArray(receipt.payments) && receipt.payments.length
    ? receipt.payments.filter((row) => Number(row.amount) > 0)
    : [{ amount: paidNow, mode: receipt.mode || 'cash' }];
  const hospital = branding.hospitalName && branding.hospitalName !== 'Your Hospital Name'
    ? branding.hospitalName
    : 'Hospital';

  return (
    <div id="payment-receipt-backdrop" style={{
      position: 'fixed', inset: 0, zIndex: 10020, background: 'rgba(15,23,42,0.45)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflow: 'auto', padding: 24,
    }}>
      <div style={{ width: 420, maxWidth: '100%' }}>
        <div className="payment-receipt-toolbar" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 8 }}>
          <button type="button" onClick={() => window.print()} style={{
            display: 'flex', alignItems: 'center', gap: 6, background: '#fff', border: 'none',
            borderRadius: 8, padding: '8px 14px', fontWeight: 700, cursor: 'pointer',
          }}>
            <Printer size={15} /> Print receipt
          </button>
          <button type="button" onClick={onClose} style={{
            display: 'flex', alignItems: 'center', gap: 6, background: '#fff', border: 'none',
            borderRadius: 8, padding: '8px 14px', cursor: 'pointer',
          }}>
            <X size={15} /> Close
          </button>
        </div>
        <article id="payment-receipt-root" style={{
          background: '#fff', color: '#111827', borderRadius: 12, padding: '28px 26px',
          fontFamily: "'IBM Plex Sans', 'Segoe UI', sans-serif", boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
        }}>
          <p style={{ textAlign: 'center', fontSize: 13, letterSpacing: '0.14em', color: '#4338ca', fontWeight: 700, margin: 0 }}>
            PAYMENT RECEIPT
          </p>
          <h1 style={{ textAlign: 'center', fontSize: 22, margin: '6px 0 0' }}>{hospital}</h1>
          {branding.address && (
            <p style={{ textAlign: 'center', fontSize: 12, color: '#4b5563', margin: '4px 0 0' }}>{branding.address}</p>
          )}
          {branding.phone && (
            <p style={{ textAlign: 'center', fontSize: 12, color: '#4b5563', margin: '2px 0 0' }}>Ph: {branding.phone}</p>
          )}
          <p style={{ textAlign: 'center', fontSize: 12, color: '#6b7280', marginTop: 10 }}>
            {when.toLocaleDateString('en-IN')} · {when.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
          </p>
          <hr style={{ border: 'none', borderTop: '1px dashed #d1d5db', margin: '14px 0' }} />
          <Row label="Patient" value={patient.name || receipt.patientName || '—'} />
          <Row label="UHID" value={patient.patientId || receipt.uhid || '—'} />
          <Row label="IP No." value={bill.ipAdmission?.admissionNumber || receipt.admissionNumber || '—'} />
          <Row label="Invoice" value={bill.billNumber || receipt.billNumber || '—'} />
          <hr style={{ border: 'none', borderTop: '1px dashed #d1d5db', margin: '14px 0' }} />
          <Row label="Bill total" value={money(bill.totalAmount)} />
          {Number(bill.advanceAmount) > 0 && <Row label="Advance already adjusted" value={money(bill.advanceAmount)} />}
          <Row label="Opening balance" value={money(Number.isFinite(opening) ? opening : bill.dueAmount)} />
          {lines.map((row, idx) => (
            <Row key={idx} label={`Paid now · ${modeLabel(row.mode)}`} value={money(row.amount)} strong />
          ))}
          <Row label="Balance remaining" value={money(balance)} strong />
          <div style={{
            marginTop: 22, textAlign: 'center', background: '#f0fdf4', borderRadius: 10, padding: '14px 12px',
          }}>
            <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#047857' }}>Thank you</p>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: '#065f46' }}>
              We have received {money(paidNow)}.
              {balance > 0.009
                ? ` Balance remaining is ${money(balance)}.`
                : ' This invoice is fully paid.'}
            </p>
          </div>
          <p style={{ textAlign: 'center', fontSize: 11, color: '#9ca3af', marginTop: 16 }}>
            Computer-generated receipt. No signature required.
          </p>
        </article>
      </div>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #payment-receipt-root, #payment-receipt-root * { visibility: visible !important; }
          #payment-receipt-backdrop {
            position: static !important;
            background: none !important;
            padding: 0 !important;
          }
          #payment-receipt-root {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            box-shadow: none !important;
          }
          .payment-receipt-toolbar { display: none !important; }
        }
      `}</style>
    </div>
  );
}

function Row({ label, value, strong }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, marginTop: 6, fontWeight: strong ? 700 : 400 }}>
      <span style={{ color: '#4b5563' }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}
