import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import api from '../../services/api';
import { inr, previewInvoice } from '../../utils/purchaseMoney';

const todayInput = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

const blankLine = () => ({
  key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  medicineId: '',
  medicineName: '',
  sellingPrice: '',
  batchNumber: '',
  expiry: '',
  quantity: '',
  freeQuantity: '',
  purchaseRate: '',
  discount: '',
  gstPercent: '',
  search: '',
  open: false,
});

export default function PurchaseEntry({ onSaved }) {
  const [header, setHeader] = useState({
    supplier: '',
    supplierInvoiceNumber: '',
    purchaseDate: todayInput(),
    dueDate: '',
    paymentType: 'credit',
    paymentStatus: 'unpaid',
    referenceNumber: '',
    notes: '',
    gstMode: 'intra',
    overallDiscount: '',
  });
  const [lines, setLines] = useState([blankLine()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => api.get('/suppliers?limit=200').then((r) => r.data),
  });
  const suppliers = (suppliersData?.data || []).filter((s) => s.isActive !== false);

  const setLine = (key, patch) => {
    setLines((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const totals = useMemo(
    () => previewInvoice(lines, header.overallDiscount, header.gstMode),
    [lines, header.overallDiscount, header.gstMode],
  );

  const searchMedicine = async (key, value) => {
    setLine(key, { search: value, open: true, medicineId: '', medicineName: '' });
    if (value.trim().length < 2) {
      setLine(key, { results: [] });
      return;
    }
    const res = await api.get('/pharmacy/search', { params: { q: value.trim(), catalog: 1 } });
    setLine(key, { results: res.data.data || [], open: true });
  };

  const pickMedicine = (key, medicine) => {
    setLine(key, {
      medicineId: medicine._id,
      medicineName: medicine.name,
      sellingPrice: medicine.sellingPrice,
      gstPercent: medicine.gstPercent ?? 0,
      search: medicine.name,
      open: false,
      results: [],
    });
  };

  const payload = () => ({
    ...header,
    overallDiscount: Number(header.overallDiscount) || 0,
    items: lines.filter((line) => line.medicineId).map((line) => ({
      medicineId: line.medicineId,
      batchNumber: line.batchNumber,
      expiryDate: line.expiry,
      quantity: Number(line.quantity),
      freeQuantity: Number(line.freeQuantity) || 0,
      purchaseRate: Number(line.purchaseRate),
      discountAmount: Number(line.discount) || 0,
      gstPercent: Number(line.gstPercent) || 0,
    })),
  });

  const save = async (print) => {
    setError('');
    const body = payload();
    if (!body.supplier || !body.supplierInvoiceNumber.trim()) {
      setError('Supplier and invoice number are required.');
      return;
    }
    if (!body.items.length) {
      setError('Add a medicine from the medicine master.');
      return;
    }
    setSaving(true);
    try {
      const res = await api.post('/pharmacy/purchases', body);
      setHeader((h) => ({
        ...h,
        supplierInvoiceNumber: '',
        referenceNumber: '',
        notes: '',
        overallDiscount: '',
      }));
      setLines([blankLine()]);
      onSaved?.(res.data.data, print);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save this purchase.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Purchase Entry</h2>
        <p className="text-xs text-slate-500 mt-0.5">Supplier invoice increases batch stock at the purchase rate. Selling price stays as it is.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
          <label className="text-xs text-slate-500 sm:col-span-2">
            Supplier
            <select className="input-field text-sm mt-1" value={header.supplier} onChange={(e) => setHeader({ ...header, supplier: e.target.value })}>
              <option value="">Select supplier</option>
              {suppliers.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-500">
            Supplier invoice number
            <input className="input-field text-sm mt-1" value={header.supplierInvoiceNumber} onChange={(e) => setHeader({ ...header, supplierInvoiceNumber: e.target.value })} placeholder="INV-10245" />
          </label>
          <label className="text-xs text-slate-500">
            Purchase date
            <input type="date" className="input-field text-sm mt-1" value={header.purchaseDate} onChange={(e) => setHeader({ ...header, purchaseDate: e.target.value })} />
          </label>
          <label className="text-xs text-slate-500">
            Due date
            <input type="date" className="input-field text-sm mt-1" value={header.dueDate} onChange={(e) => setHeader({ ...header, dueDate: e.target.value })} />
          </label>
          <label className="text-xs text-slate-500">
            Payment type
            <select className="input-field text-sm mt-1" value={header.paymentType} onChange={(e) => setHeader({ ...header, paymentType: e.target.value })}>
              <option value="credit">Credit</option>
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="card">Card</option>
              <option value="cheque">Cheque</option>
              <option value="neft">NEFT</option>
            </select>
          </label>
          <label className="text-xs text-slate-500">
            Payment status
            <select className="input-field text-sm mt-1" value={header.paymentStatus} onChange={(e) => setHeader({ ...header, paymentStatus: e.target.value })}>
              <option value="unpaid">Unpaid</option>
              <option value="partial">Partial</option>
              <option value="paid">Paid</option>
            </select>
          </label>
          <label className="text-xs text-slate-500">
            GST
            <select className="input-field text-sm mt-1" value={header.gstMode} onChange={(e) => setHeader({ ...header, gstMode: e.target.value })}>
              <option value="intra">Intra-state (CGST + SGST)</option>
              <option value="inter">Inter-state (IGST)</option>
            </select>
          </label>
          <label className="text-xs text-slate-500 sm:col-span-2">
            Reference number
            <input className="input-field text-sm mt-1" value={header.referenceNumber} onChange={(e) => setHeader({ ...header, referenceNumber: e.target.value })} />
          </label>
          <label className="text-xs text-slate-500 sm:col-span-2">
            Notes
            <input className="input-field text-sm mt-1" value={header.notes} onChange={(e) => setHeader({ ...header, notes: e.target.value })} />
          </label>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[980px]">
            <thead className="bg-slate-50 dark:bg-gray-900/40 text-slate-500">
              <tr>
                {['Medicine', 'Batch', 'Expiry', 'Qty', 'Free', 'Purchase rate', 'Discount', 'GST %', 'Total', ''].map((h) => (
                  <th key={h} className="px-2 py-2 text-left font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => {
                const priced = totals.lines[index];
                return (
                  <tr key={line.key} className="border-t border-slate-100 dark:border-gray-700 align-top">
                    <td className="px-2 py-2 min-w-[180px] relative">
                      <input
                        className="input-field text-xs"
                        value={line.search}
                        placeholder="Search Dolo…"
                        onChange={(e) => searchMedicine(line.key, e.target.value)}
                        onFocus={() => line.results?.length && setLine(line.key, { open: true })}
                      />
                      {line.medicineName && (
                        <p className="mt-1 text-[11px] text-slate-500">Billing price {inr(line.sellingPrice)} stays unchanged</p>
                      )}
                      {line.open && line.results?.length > 0 && (
                        <div className="absolute z-20 mt-1 w-64 bg-white dark:bg-gray-800 border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-auto">
                          {line.results.map((med) => (
                            <button
                              type="button"
                              key={med._id}
                              className="block w-full text-left px-3 py-2 hover:bg-slate-50 text-xs"
                              onClick={() => pickMedicine(line.key, med)}
                            >
                              <span className="font-semibold text-slate-800">{med.name}</span>
                              <span className="block text-slate-400">{med.genericName || 'Medicine master'}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2"><input className="input-field text-xs w-28" value={line.batchNumber} onChange={(e) => setLine(line.key, { batchNumber: e.target.value })} /></td>
                    <td className="px-2 py-2"><input type="month" className="input-field text-xs w-32" value={line.expiry} onChange={(e) => setLine(line.key, { expiry: e.target.value })} /></td>
                    <td className="px-2 py-2"><input type="number" min="0" className="input-field text-xs w-20 text-right" value={line.quantity} onChange={(e) => setLine(line.key, { quantity: e.target.value })} /></td>
                    <td className="px-2 py-2"><input type="number" min="0" className="input-field text-xs w-16 text-right" value={line.freeQuantity} onChange={(e) => setLine(line.key, { freeQuantity: e.target.value })} /></td>
                    <td className="px-2 py-2"><input type="number" min="0" step="0.01" className="input-field text-xs w-24 text-right" value={line.purchaseRate} onChange={(e) => setLine(line.key, { purchaseRate: e.target.value })} /></td>
                    <td className="px-2 py-2"><input type="number" min="0" step="0.01" className="input-field text-xs w-20 text-right" value={line.discount} onChange={(e) => setLine(line.key, { discount: e.target.value })} /></td>
                    <td className="px-2 py-2"><input type="number" min="0" step="0.01" className="input-field text-xs w-16 text-right" value={line.gstPercent} onChange={(e) => setLine(line.key, { gstPercent: e.target.value })} /></td>
                    <td className="px-2 py-2 text-right font-semibold tabular-nums text-slate-800">{inr(priced?.total)}</td>
                    <td className="px-2 py-2">
                      <button type="button" className="text-slate-400 hover:text-red-600" onClick={() => setLines((rows) => rows.length === 1 ? [blankLine()] : rows.filter((r) => r.key !== line.key))}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-3 py-3 border-t border-slate-100 flex flex-col lg:flex-row lg:items-end gap-3 justify-between">
          <button type="button" className="btn-secondary text-xs" onClick={() => setLines((rows) => [...rows, blankLine()])}>
            <Plus size={14} /> Add Medicine
          </button>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs min-w-[280px]">
            <label className="text-slate-500 col-span-2 sm:col-span-3">
              Overall discount
              <input type="number" min="0" className="input-field text-xs mt-1" value={header.overallDiscount} onChange={(e) => setHeader({ ...header, overallDiscount: e.target.value })} />
            </label>
            <Stat label="Gross" value={inr(totals.gross)} />
            <Stat label="Taxable" value={inr(totals.taxable)} />
            <Stat label={header.gstMode === 'inter' ? 'IGST' : 'CGST + SGST'} value={inr(totals.tax)} />
            <Stat label="Grand total" value={inr(totals.grand)} strong />
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" disabled={saving} onClick={() => save(false)}>Save Purchase</button>
        <button type="button" className="btn-secondary" disabled={saving} onClick={() => save(true)}>Save & Print</button>
        <button type="button" className="btn-secondary" onClick={() => { setLines([blankLine()]); setError(''); }}>Cancel</button>
      </div>
    </div>
  );
}

function Stat({ label, value, strong }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`tabular-nums ${strong ? 'font-bold text-slate-900' : 'font-semibold text-slate-700'}`}>{value}</p>
    </div>
  );
}
