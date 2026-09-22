import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import Modal from '../common/Modal';
import { inr, RETURN_REASONS } from '../../utils/purchaseMoney';

const todayInput = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

export default function PurchaseReturnPanel({ purchaseId }) {
  const qc = useQueryClient();
  const [supplier, setSupplier] = useState('');
  const [selectedId, setSelectedId] = useState(purchaseId || '');
  const [returnDate, setReturnDate] = useState(todayInput());
  const [reason, setReason] = useState('Near Expiry');
  const [notes, setNotes] = useState('');
  const [qty, setQty] = useState({});
  const [confirm, setConfirm] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => api.get('/suppliers?limit=200').then((r) => r.data),
  });

  const invoices = useQuery({
    queryKey: ['purchase-invoices', supplier],
    enabled: !!supplier,
    queryFn: () => api.get('/pharmacy/purchases', { params: { supplier, status: 'active', limit: 50 } }).then((r) => r.data.data),
  });

  const purchase = useQuery({
    queryKey: ['purchase', selectedId],
    enabled: !!selectedId,
    queryFn: () => api.get(`/pharmacy/purchases/${selectedId}`).then((r) => r.data.data),
  });

  useEffect(() => {
    if (purchaseId) setSelectedId(purchaseId);
  }, [purchaseId]);

  useEffect(() => {
    if (purchase.data?.supplier?._id || purchase.data?.supplier) {
      const id = purchase.data.supplier?._id || purchase.data.supplier;
      if (id && !supplier) setSupplier(String(id));
    }
  }, [purchase.data, supplier]);

  const lines = purchase.data?.items || [];
  const draft = useMemo(() => lines.map((item) => {
    const returnQuantity = Number(qty[item._id]) || 0;
    const value = Math.round(returnQuantity * (Number(item.purchaseRate) || 0) * 100) / 100;
    return { item, returnQuantity, value };
  }).filter((row) => row.returnQuantity > 0), [lines, qty]);

  const summary = draft.reduce((acc, row) => {
    acc.returnedQuantity += row.returnQuantity;
    acc.returnedValue += row.value;
    acc.originalQuantity += row.item.quantity + (row.item.freeQuantity || 0);
    acc.originalValue += (row.item.quantity || 0) * (row.item.purchaseRate || 0);
    acc.remainingQuantity += Math.max(0, (row.item.remainingOnInvoice || 0) - row.returnQuantity);
    acc.remainingStockValue += Math.max(0, (row.item.remainingOnInvoice || 0) - row.returnQuantity) * (row.item.purchaseRate || 0);
    return acc;
  }, { returnedQuantity: 0, returnedValue: 0, originalQuantity: 0, originalValue: 0, remainingQuantity: 0, remainingStockValue: 0 });

  const askConfirm = () => {
    setError('');
    for (const row of draft) {
      if (row.returnQuantity > (row.item.availableToReturn || 0)) {
        setError('Return quantity cannot exceed available quantity.');
        return;
      }
    }
    if (!draft.length) {
      setError('Enter a return quantity.');
      return;
    }
    if (!reason) {
      setError('Select a return reason.');
      return;
    }
    setConfirm(true);
  };

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await api.post('/pharmacy/purchases/returns', {
        purchaseId: selectedId,
        returnDate,
        reason,
        notes,
        items: draft.map((row) => ({ purchaseItemId: row.item._id, returnQuantity: row.returnQuantity })),
      });
      setConfirm(false);
      setQty({});
      setNotes('');
      qc.invalidateQueries({ queryKey: ['purchase', selectedId] });
      qc.invalidateQueries({ queryKey: ['purchase-returns'] });
      qc.invalidateQueries({ queryKey: ['purchases'] });
      setError('');
      window.alert(`Return ${res.data.data.returnNumber} saved. Stock has been reduced.`);
    } catch (err) {
      setConfirm(false);
      setError(err.response?.data?.message || 'Could not save this return.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Purchase Return</h2>
        <p className="text-xs text-slate-500">Return value uses the invoice purchase rate, not the selling price.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="text-xs text-slate-500">Supplier
            <select className="input-field text-sm mt-1" value={supplier} onChange={(e) => { setSupplier(e.target.value); setSelectedId(''); }}>
              <option value="">Select supplier</option>
              {(suppliersData?.data || []).map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-500">Original purchase invoice
            <select className="input-field text-sm mt-1" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
              <option value="">Select invoice</option>
              {(invoices.data?.data || []).map((row) => (
                <option key={row._id} value={row._id}>{row.supplierInvoiceNumber} · {inr(row.grandTotal)}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-500">Return date
            <input type="date" className="input-field text-sm mt-1" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
          </label>
          <label className="text-xs text-slate-500">Return reason
            <select className="input-field text-sm mt-1" value={reason} onChange={(e) => setReason(e.target.value)}>
              {RETURN_REASONS.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-500 sm:col-span-2 lg:col-span-4">Notes
            <input className="input-field text-sm mt-1" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Supplier agreed to replace this batch." />
          </label>
        </div>
      </div>

      {lines.length > 0 && (
        <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl overflow-x-auto">
          <table className="w-full text-xs min-w-[760px]">
            <thead className="bg-slate-50 text-slate-500">
              <tr>{['Medicine', 'Batch', 'Available', 'Return qty', 'Purchase rate', 'Return value'].map((h) => <th key={h} className="px-3 py-2 text-left">{h}</th>)}</tr>
            </thead>
            <tbody>
              {lines.map((item) => {
                const entered = Number(qty[item._id]) || 0;
                const bad = entered > (item.availableToReturn || 0);
                return (
                  <tr key={item._id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-semibold">{item.medicineName}</td>
                    <td className="px-3 py-2">{item.batchNumber}</td>
                    <td className="px-3 py-2 tabular-nums">{item.availableToReturn}</td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        className={`input-field text-xs w-24 ${bad ? 'border-red-400' : ''}`}
                        value={qty[item._id] || ''}
                        onChange={(e) => setQty({ ...qty, [item._id]: e.target.value })}
                      />
                      {bad && <p className="text-red-600 mt-1">Return quantity cannot exceed available quantity.</p>}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{inr(item.purchaseRate)}</td>
                    <td className="px-3 py-2 tabular-nums font-semibold">{inr(entered * (item.purchaseRate || 0))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {draft.length > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-slate-800">Return Summary</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3 text-xs">
            <Sum label="Original quantity" value={summary.originalQuantity} />
            <Sum label="Returned quantity" value={summary.returnedQuantity} />
            <Sum label="Remaining quantity" value={summary.remainingQuantity} />
            <Sum label="Original value" value={inr(summary.originalValue)} />
            <Sum label="Returned value" value={inr(summary.returnedValue)} />
            <Sum label="Remaining stock value" value={inr(summary.remainingStockValue)} />
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="button" className="btn-primary" onClick={askConfirm}>Review return</button>

      <Modal isOpen={!!confirm} onClose={() => setConfirm(false)} title="Confirm Purchase Return">
        <div className="p-5 space-y-3 text-sm">
          <p>Supplier: <strong>{purchase.data?.supplier?.name || purchase.data?.supplierName}</strong></p>
          <p>Invoice: <strong>{purchase.data?.supplierInvoiceNumber}</strong></p>
          {draft.map((row) => (
            <p key={row.item._id}>
              {row.item.medicineName} · {row.item.batchNumber} · Return {row.returnQuantity} · {inr(row.value)}
            </p>
          ))}
          <p className="text-slate-600">Are you sure you want to process this return?</p>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setConfirm(false)}>Cancel</button>
            <button type="button" className="btn-primary" disabled={saving} onClick={submit}>Confirm Return</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Sum({ label, value }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className="font-semibold tabular-nums text-slate-800">{value}</p>
    </div>
  );
}
