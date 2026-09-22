import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import Modal from '../common/Modal';
import { inr, printPurchase } from '../../utils/purchaseMoney';

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
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Purchase History</h2>
        <input className="input-field text-sm sm:w-64" placeholder="Invoice, supplier, number" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
      </div>
      {message && <p className="text-xs text-slate-600">{message}</p>}
      <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl overflow-x-auto">
        <table className="w-full text-xs min-w-[860px]">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              {['Invoice', 'Supplier', 'Date', 'Items', 'Quantity', 'Value', 'Payment', 'Returns', 'Created by', ''].map((h) => (
                <th key={h} className="px-3 py-2 text-left font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td className="px-3 py-6 text-slate-400" colSpan={10}>Loading purchases…</td></tr>}
            {!isLoading && rows.length === 0 && <tr><td className="px-3 py-6 text-slate-400" colSpan={10}>No purchases yet.</td></tr>}
            {rows.map((row) => (
              <tr key={row._id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-semibold">{row.supplierInvoiceNumber}</td>
                <td className="px-3 py-2">{row.supplierName || row.supplier?.name}</td>
                <td className="px-3 py-2">{fmtDate(row.purchaseDate)}</td>
                <td className="px-3 py-2 tabular-nums">{row.itemCount}</td>
                <td className="px-3 py-2 tabular-nums">{row.totalQuantity}</td>
                <td className="px-3 py-2 tabular-nums">{inr(row.grandTotal)}</td>
                <td className="px-3 py-2 capitalize">{row.paymentStatus}</td>
                <td className="px-3 py-2 capitalize">{row.status === 'cancelled' ? 'Cancelled' : row.returnStatus}</td>
                <td className="px-3 py-2">{row.createdByName || row.createdBy?.name}</td>
                <td className="px-3 py-2 whitespace-nowrap space-x-2">
                  <button type="button" className="text-blue-700 font-semibold" onClick={() => setOpenId(row._id)}>View</button>
                  {row.status === 'active' && (
                    <>
                      <button type="button" className="text-slate-600 font-semibold" onClick={async () => {
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
                      <button type="button" className="text-slate-600 font-semibold" onClick={async () => { const full = await api.get(`/pharmacy/purchases/${row._id}`); printPurchase(full.data.data); }}>Print</button>
                      <button type="button" className="text-amber-700 font-semibold" onClick={() => onReturn?.(row._id)}>Return</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[720px]">
                <thead className="text-slate-500">
                  <tr>{['Medicine', 'Batch', 'Expiry', 'Qty', 'Rate', 'Discount', 'GST', 'Total', 'Returned', 'Remaining'].map((h) => <th key={h} className="py-1 text-left">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {(detail.data.items || []).map((item) => (
                    <tr key={item._id} className="border-t border-slate-100">
                      <td className="py-2">{item.medicineName}</td>
                      <td>{item.batchNumber}</td>
                      <td>{fmtDate(item.expiryDate)}</td>
                      <td className="tabular-nums">{item.quantity}{item.freeQuantity ? ` +${item.freeQuantity} free` : ''}</td>
                      <td className="tabular-nums">{inr(item.purchaseRate)}</td>
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
