import React from 'react';
import {
  Printer, Download, Receipt, Pill, Edit3, CreditCard, Ban, History, Loader2,
} from 'lucide-react';
import '../../styles/invoiceDetail.css';

const fmt = (n) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const MONEY_KEYS = /amount|price|due|paid|total|subtotal|discount|gst|rate/i;

const prettyKey = (key) =>
  String(key || '')
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();

const formatScalar = (key, value) => {
  if (value == null || value === '') return '—';
  if (typeof value === 'number' && MONEY_KEYS.test(key)) return fmt(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return null;
  return String(value);
};

/** Turn previous/new JSON blobs into readable change rows */
export function buildChangeRows(previousValue, newValue) {
  const prev = previousValue && typeof previousValue === 'object' && !Array.isArray(previousValue)
    ? previousValue
    : null;
  const next = newValue && typeof newValue === 'object' && !Array.isArray(newValue)
    ? newValue
    : null;

  if (!prev && !next) {
    const p = previousValue != null ? String(previousValue) : null;
    const n = newValue != null ? String(newValue) : null;
    if (p == null && n == null) return [];
    return [{ key: 'Value', old: p ?? '—', neu: n ?? '—' }];
  }

  const keys = [...new Set([...Object.keys(prev || {}), ...Object.keys(next || {})])];
  return keys
    .map((key) => {
      const oldRaw = prev ? prev[key] : undefined;
      const newRaw = next ? next[key] : undefined;
      if (JSON.stringify(oldRaw) === JSON.stringify(newRaw)) return null;
      const old = formatScalar(key, oldRaw) ?? (oldRaw != null ? JSON.stringify(oldRaw) : '—');
      const neu = formatScalar(key, newRaw) ?? (newRaw != null ? JSON.stringify(newRaw) : '—');
      return { key: prettyKey(key), old, neu };
    })
    .filter(Boolean)
    .slice(0, 8);
}

const STATUS_CLASS = {
  paid: 'paid',
  partial: 'partial',
  pending: 'pending',
  cancelled: 'cancelled',
};

export default function InvoiceDetailPanel({
  detailData,
  detailLoading,
  canEditBill,
  onEditBill,
  onPrintPreview,
  onDownloadPdf,
  onDownloadPdfA5,
  onThermalPdf,
  onRecordPayment,
  onCancelBill,
}) {
  if (detailLoading) {
    return (
      <div className="inv-detail">
        <div className="inv-detail__loading">
          <Loader2 size={20} className="animate-spin inline mr-2" />
          Loading invoice…
        </div>
      </div>
    );
  }

  if (!detailData) return null;

  const status = detailData.status || 'pending';
  const billType = (detailData.billType || 'unified').replace(/_/g, ' ');

  return (
    <div className="inv-detail">
      <div className="inv-detail__hero">
        <div>
          <p className="inv-detail__bill-no">{detailData.billNumber}</p>
          <p className="inv-detail__meta">
            {billType} invoice
            {detailData.createdAt
              ? ` · ${new Date(detailData.createdAt).toLocaleDateString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })} · ${new Date(detailData.createdAt).toLocaleTimeString('en-IN', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: true,
                })}`
              : ''}
          </p>
        </div>
        <span className={`inv-detail__status ${STATUS_CLASS[status] || ''}`}>
          {status}
        </span>
      </div>

      <div className="inv-detail__body">
        <div className="inv-detail__cards">
          <div className="inv-detail__card">
            <p className="inv-detail__label">Patient</p>
            <p className="inv-detail__value">{detailData.patient?.name || '—'}</p>
            <p className="inv-detail__sub">
              UHID{' '}
              <span className="inv-detail__uhid">{detailData.patient?.patientId || '—'}</span>
            </p>
            <p className="inv-detail__sub" style={{ marginTop: 4 }}>
              Age {detailData.patient?.age ?? '—'}
              {detailData.patient?.gender ? ` · ${detailData.patient.gender}` : ''}
              {detailData.patient?.phone ? ` · Ph ${detailData.patient.phone}` : ' · Phone —'}
            </p>
          </div>
          <div className="inv-detail__card">
            <p className="inv-detail__label">Clinical</p>
            <p className="inv-detail__value">
              {detailData.doctor ? `Dr. ${detailData.doctor.name}` : 'No doctor assigned'}
            </p>
            <p className="inv-detail__sub">
              {detailData.department?.name || detailData.paymentMode
                ? [
                    detailData.department?.name,
                    detailData.paymentMode
                      ? `Paid via ${String(detailData.paymentMode).toUpperCase()}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : '—'}
            </p>
          </div>
        </div>

        <div className="inv-detail__table-wrap">
          <table className="inv-detail__table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Item</th>
                <th className="c">Qty</th>
                <th className="r">Rate</th>
                <th className="r">Total</th>
              </tr>
            </thead>
            <tbody>
              {(detailData.items || []).map((item, idx) => (
                <tr key={idx}>
                  <td>
                    <span className="inv-detail__chip">{item.category || item.type || 'Item'}</span>
                  </td>
                  <td>
                    <p className="inv-detail__item-name">{item.description || item.name || '—'}</p>
                    {item.type === 'medicine' && (
                      <p className="inv-detail__item-hint">
                        <Pill size={11} /> Pharmacy item
                      </p>
                    )}
                  </td>
                  <td className="c">{item.quantity}</td>
                  <td className="r">{fmt(item.unitPrice)}</td>
                  <td className="r" style={{ fontWeight: 700 }}>{fmt(item.totalAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="inv-detail__totals-row">
          <div className="inv-detail__totals">
            <div className="inv-detail__tot-line">
              <span>Subtotal</span>
              <span>{fmt(detailData.subtotal)}</span>
            </div>
            <div className="inv-detail__tot-line">
              <span>GST</span>
              <span>{fmt(detailData.totalGST)}</span>
            </div>
            {detailData.discount > 0 && (
              <div className="inv-detail__tot-line is-disc">
                <span>Discount ({detailData.discount}%)</span>
                <span>-{fmt(detailData.discountAmount)}</span>
              </div>
            )}
            <div className="inv-detail__tot-line is-grand">
              <span>Grand Total</span>
              <span>{fmt(detailData.totalAmount)}</span>
            </div>
            <div className="inv-detail__tot-line is-paid">
              <span>Paid</span>
              <span>{fmt(detailData.paidAmount)}</span>
            </div>
            {detailData.dueAmount > 0 && (
              <div className="inv-detail__tot-line is-due">
                <span>Due</span>
                <span>{fmt(detailData.dueAmount)}</span>
              </div>
            )}
          </div>
        </div>

        <div className="inv-detail__actions">
          {canEditBill?.(detailData) && (
            <button type="button" className="inv-detail__btn" onClick={() => onEditBill?.(detailData)}>
              <Edit3 size={15} /> Edit Bill
            </button>
          )}
          <button type="button" className="inv-detail__btn inv-detail__btn--primary" onClick={() => onPrintPreview?.(detailData._id)}>
            <Printer size={15} /> Print Preview
          </button>
          <button type="button" className="inv-detail__btn" onClick={() => onDownloadPdf?.(detailData._id)}>
            <Download size={15} /> PDF A4
          </button>
          <button type="button" className="inv-detail__btn" onClick={() => (onDownloadPdfA5 || onDownloadPdf)?.(detailData._id)}>
            <Download size={15} /> PDF A5
          </button>
          <button type="button" className="inv-detail__btn" onClick={() => onThermalPdf?.(detailData._id)}>
            <Receipt size={15} /> Thermal PDF
          </button>
          {detailData.status !== 'cancelled' && detailData.dueAmount > 0 && (
            <button type="button" className="inv-detail__btn inv-detail__btn--primary" onClick={() => onRecordPayment?.(detailData)}>
              <CreditCard size={15} /> Record Payment
            </button>
          )}
          {detailData.status !== 'cancelled' && detailData.status !== 'paid' && (
            <button type="button" className="inv-detail__btn inv-detail__btn--danger" onClick={() => onCancelBill?.(detailData)}>
              <Ban size={15} /> Cancel
            </button>
          )}
        </div>

        <div className="inv-detail__history">
          <div className="inv-detail__hist-card">
            <div className="inv-detail__hist-head">
              <History size={15} color="#2563eb" />
              <h3>Edit History</h3>
              <span className="inv-detail__hist-count">{detailData.editHistory?.length || 0}</span>
            </div>
            <div className="inv-detail__hist-list">
              {detailData.editHistory?.length ? (
                detailData.editHistory.slice().reverse().map((h) => {
                  const changes = buildChangeRows(h.previousValue, h.newValue);
                  return (
                    <div key={h._id || `${h.editTime}-${h.actionType}`} className="inv-detail__hist-item">
                      <div className="inv-detail__hist-top">
                        <p className="inv-detail__hist-action">{h.actionType || 'Update'}</p>
                        <p className="inv-detail__hist-time">
                          {h.editTime
                            ? new Date(h.editTime).toLocaleString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : ''}
                        </p>
                      </div>
                      <p className="inv-detail__hist-by">
                        {[h.userName || h.user?.name || 'User', h.reason].filter(Boolean).join(' · ')}
                      </p>
                      {changes.length > 0 && (
                        <div className="inv-detail__changes">
                          {changes.map((c) => (
                            <div key={c.key} className="inv-detail__change">
                              <span className="inv-detail__change-key">{c.key}</span>
                              <span className="inv-detail__change-old">{c.old}</span>
                              <span className="inv-detail__change-arrow">→</span>
                              <span className="inv-detail__change-new">{c.neu}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <p className="inv-detail__empty">No edits recorded</p>
              )}
            </div>
          </div>

          <div className="inv-detail__hist-card">
            <div className="inv-detail__hist-head">
              <Printer size={15} color="#2563eb" />
              <h3>Reprint History</h3>
              <span className="inv-detail__hist-count">{detailData.printCount || 0}</span>
            </div>
            <div className="inv-detail__hist-list">
              {detailData.printHistory?.length ? (
                detailData.printHistory.slice().reverse().map((p) => (
                  <div key={p._id || `${p.printedAt}-${p.printCount}`} className="inv-detail__hist-item">
                    <div className="inv-detail__hist-top">
                      <p className="inv-detail__hist-action">
                        {(p.format || 'invoice').toString().toUpperCase()} print #{p.printCount}
                      </p>
                      <p className="inv-detail__hist-time">
                        {p.printedAt
                          ? new Date(p.printedAt).toLocaleString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : ''}
                      </p>
                    </div>
                    <p className="inv-detail__hist-by">
                      {[p.printedByName || p.printedBy?.name || 'User', p.reason].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                ))
              ) : (
                <p className="inv-detail__empty">No print activity recorded</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
