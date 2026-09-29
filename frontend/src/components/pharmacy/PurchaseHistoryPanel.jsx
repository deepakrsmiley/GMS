import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import Modal from '../common/Modal';
import { inr, printPurchase, purchaseUnitText } from '../../utils/purchaseMoney';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

export default function PurchaseHistoryPanel({ onReturn }) {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState(null);
  const [edit, setEdit] = useState(null);
  const [message, setMessage] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['purchases', q, page],
    queryFn: () => api.get('/pharmacy/purchases', { params: { q, page, limit: 15 } }).then((r) => r.data.data),
  });

  const detail = useQuery({
    queryKey: ['purchase', openId],
    enabled: !!openId,
    queryFn: () => api.get(`/pharmacy/purchases/${openId}`).then((r) => r.data.data),
  });

  const saveEdit = async () => {
    await api.patch(`/pharmacy/purchases/${edit._id}`, {
      paymentStatus: edit.paymentStatus,
      paymentType: edit.paymentType,
      amountPaid: Number(edit.amountPaid) || 0,
      dueDate: edit.dueDate ? String(edit.dueDate).slice(0, 10) : '',
      referenceNumber: edit.referenceNumber,
      notes: edit.notes,
    });
    setEdit(null);
    qc.invalidateQueries({ queryKey: ['purchases'] });
    qc.invalidateQueries({ queryKey: ['purchase', openId] });
  };

  const cancelPurchase = async (row) => {
    const reason = window.prompt('Cancellation reason');
    if (!reason) return;
    try {
      await api.post(`/pharmacy/purchases/${row._id}/cancel`, { reason });
      setMessage('Purchase cancelled. Stock was reversed.');
      setOpenId(null);
      qc.invalidateQueries({ queryKey: ['purchases'] });
    } catch (err) {
      setMessage(err.response?.data?.message || 'Could not cancel this purchase.');
    }
  };

  const rows = data?.data || [];

  return (
    <div className="space-y-3">
      <section className="pur-card">
        <div className="pur-toolbar">
          <h2>Purchase history</h2>
          <input className="input-field text-sm" placeholder="Invoice, supplier, or number" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        </div>
        {message && <p className="px-4 py-2 text-sm text-slate-600">{message}</p>}
        <div className="pur-table-wrap">
          <table className="pur-table">
            <thead>
              <tr>
                {['Invoice', 'Supplier', 'Date', 'Items', 'Stock qty', 'Value', 'Payment', 'Returns', 'Created by', ''].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td className="pur-empty" colSpan={10}>Loading purchases…</td></tr>}
              {!isLoading && rows.length === 0 && <tr><td className="pur-empty" colSpan={10}>No purchases yet.</td></tr>}
              {rows.map((row) => (
                <tr key={row._id}>
                  <td className="font-semibold">{row.supplierInvoiceNumber}</td>
                  <td>{row.supplierName || row.supplier?.name}</td>
                  <td>{fmtDate(row.purchaseDate)}</td>
                  <td className="tabular-nums">{row.itemCount}</td>
                  <td className="tabular-nums">{row.totalQuantity}</td>
                  <td className="tabular-nums font-semibold">{inr(row.grandTotal)}</td>
                  <td><span className={payBadge(row.paymentStatus)}>{row.paymentStatus}</span></td>
                  <td><span className={row.status === 'cancelled' ? 'badge-red' : 'badge-gray'}>{row.status === 'cancelled' ? 'Cancelled' : row.returnStatus}</span></td>
                  <td>{row.createdByName || row.createdBy?.name}</td>
                  <td>
                    <div className="pur-row-actions">
                      <button type="button" className="pur-link" onClick={() => setOpenId(row._id)}>View</button>
                      {row.status === 'active' && (
                        <>
                          <button type="button" className="pur-link pur-link--muted" onClick={async () => {
                        const full = await api.get(`/pharmacy/purchases/${row._id}`);
                        const doc = full.data.data;
                        setEdit({
                          _id: doc._id,
                          paymentType: doc.paymentType,
                          paymentStatus: doc.paymentStatus,
                          amountPaid: doc.amountPaid || 0,
                          dueDate: doc.dueDate ? String(doc.dueDate).slice(0, 10) : '',
                          referenceNumber: doc.referenceNumber || '',
                          notes: doc.notes || '',
                        });
                          }}>Edit</button>
                          <button type="button" className="pur-link pur-link--muted" onClick={async () => { const full = await api.get(`/pharmacy/purchases/${row._id}`); printPurchase(full.data.data); }}>Print</button>
                          <button type="button" className="pur-link pur-link--warn" onClick={() => onReturn?.(row._id)}>Return</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <Pager page={data?.page || 1} pages={data?.pages || 1} onPage={setPage} />

      <Modal isOpen={!!openId} onClose={() => setOpenId(null)} title="Purchase Information" size="xl">
        {detail.data && (
          <div className="p-5 space-y-4 text-sm max-h-[70vh] overflow-auto">
            <div className="grid sm:grid-cols-2 gap-2 text-xs">
              <Info label="Supplier" value={detail.data.supplier?.name || detail.data.supplierName} />
              <Info label="Invoice" value={detail.data.supplierInvoiceNumber} />
              <Info label="Date" value={fmtDate(detail.data.purchaseDate)} />
              <Info label="Created by" value={`${detail.data.createdByName || detail.data.createdBy?.name || '—'} · ${detail.data.createdByRole || ''}`} />
              <Info label="Payment" value={detail.data.paymentStatus} />
              <Info label="Status" value={detail.data.status} />
            </div>
            <div className="pur-table-wrap">
              <table className="pur-table">
                <thead>
                  <tr>{['Medicine', 'Batch', 'Expiry', 'Qty', 'Rate', 'MRP', 'Discount', 'GST', 'Total', 'Returned', 'Remaining'].map((h) => <th key={h}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {(detail.data.items || []).map((item) => (
                    <tr key={item._id} className="border-t border-slate-100">
                      <td className="py-2">{item.medicineName}</td>
                      <td>{item.batchNumber}</td>
                      <td>{fmtDate(item.expiryDate)}</td>
                      <td className="tabular-nums">{purchaseUnitText(item)}{item.freeQuantity ? ` + ${purchaseUnitText(item, item.freeQuantity)} free` : ''}</td>
                      <td className="tabular-nums">{inr(item.purchaseRate)}{item.quantityUnit === 'strip' ? ' / strip' : ''}</td>
                      <td className="tabular-nums">{item.mrp != null ? `${inr(item.mrp)}${item.quantityUnit === 'strip' ? ' / strip' : ''}` : '—'}</td>
                      <td className="tabular-nums">{inr(item.discountAmount)}</td>
                      <td>{item.gstPercent}%</td>
                      <td className="tabular-nums">{inr(item.lineTotal)}</td>
                      <td className="tabular-nums">{item.returnedQuantity || 0}</td>
                      <td className="tabular-nums">{item.remainingOnInvoice}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary text-xs" onClick={() => printPurchase(detail.data)}>Print</button>
              {detail.data.status === 'active' && (
                <button type="button" className="btn-secondary text-xs" onClick={() => cancelPurchase(detail.data)}>Cancel purchase</button>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={!!edit} onClose={() => setEdit(null)} title="Edit purchase" subtitle="Invoice lines stay locked. Change payment details only.">
        {edit && (
          <div className="p-5 space-y-3">
            <label className="block text-xs text-slate-500">Payment type
              <select className="input-field text-sm mt-1" value={edit.paymentType} onChange={(e) => setEdit({ ...edit, paymentType: e.target.value })}>
                {['credit', 'cash', 'upi', 'card', 'cheque', 'neft'].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label className="block text-xs text-slate-500">Payment status
              <select className="input-field text-sm mt-1" value={edit.paymentStatus} onChange={(e) => setEdit({ ...edit, paymentStatus: e.target.value })}>
                <option value="unpaid">Unpaid</option>
                <option value="partial">Partial</option>
                <option value="paid">Paid</option>
              </select>
            </label>
            <label className="block text-xs text-slate-500">Amount paid
              <input type="number" className="input-field text-sm mt-1" value={edit.amountPaid || ''} onChange={(e) => setEdit({ ...edit, amountPaid: e.target.value })} />
            </label>
            <label className="block text-xs text-slate-500">Notes
              <textarea className="input-field text-sm mt-1" rows={2} value={edit.notes || ''} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setEdit(null)}>Cancel</button>
              <button type="button" className="btn-primary" onClick={saveEdit}>Save</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function payBadge(status) {
  if (status === 'paid') return 'badge-green capitalize';
  if (status === 'partial') return 'badge-yellow capitalize';
  return 'badge-gray capitalize';
}

function Info({ label, value }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className="font-semibold text-slate-800 capitalize">{value || '—'}</p>
    </div>
  );
}

export function Pager({ page, pages, onPage }) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center gap-2 text-xs">
      <button type="button" className="btn-secondary text-xs" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
      <span className="text-slate-500">{page} / {pages}</span>
      <button type="button" className="btn-secondary text-xs" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
    </div>
  );
}
