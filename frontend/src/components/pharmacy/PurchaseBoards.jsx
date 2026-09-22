import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { inr, printReturn } from '../../utils/purchaseMoney';
import { Pager } from './PurchaseHistoryPanel';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

export function PurchaseReturnHistory() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['purchase-returns', q, page],
    queryFn: () => api.get('/pharmacy/purchases/returns', { params: { q, page, limit: 15 } }).then((r) => r.data.data),
  });
  const rows = data?.data || [];

  const view = async (id) => {
    const res = await api.get(`/pharmacy/purchases/returns/${id}`);
    printReturn(res.data.data);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2 justify-between">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Purchase Return History</h2>
        <input className="input-field text-sm sm:w-64" placeholder="Return no, invoice, medicine" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
      </div>
      <div className="bg-white dark:bg-gray-800 border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-xs min-w-[900px]">
          <thead className="bg-slate-50 text-slate-500">
            <tr>{['Return', 'Supplier', 'Invoice', 'Date', 'Medicine', 'Batch', 'Qty', 'Value', 'Reason', 'Created by', ''].map((h) => <th key={h} className="px-3 py-2 text-left">{h}</th>)}</tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={11} className="px-3 py-6 text-slate-400">Loading returns…</td></tr>}
            {rows.map((row) => (
              <tr key={row._id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-semibold">{row.returnNumber}</td>
                <td className="px-3 py-2">{row.supplierName}</td>
                <td className="px-3 py-2">{row.originalInvoice}</td>
                <td className="px-3 py-2">{fmtDate(row.returnDate)}</td>
                <td className="px-3 py-2">{row.medicineSummary}</td>
                <td className="px-3 py-2">{row.batchSummary}</td>
                <td className="px-3 py-2 tabular-nums">{row.totalReturnQuantity}</td>
                <td className="px-3 py-2 tabular-nums">{inr(row.totalReturnValue)}</td>
                <td className="px-3 py-2">{row.reason}</td>
                <td className="px-3 py-2">{row.createdByName}</td>
                <td className="px-3 py-2 space-x-2 whitespace-nowrap">
                  <button type="button" className="text-blue-700 font-semibold" onClick={() => view(row._id)}>View / Print</button>
                  {row.status === 'active' && (
                    <button
                      type="button"
                      className="text-slate-600 font-semibold"
                      onClick={async () => {
                        const reason = window.prompt('Reason for reversing this return');
                        if (!reason) return;
                        try {
                          await api.post(`/pharmacy/purchases/returns/${row._id}/cancel`, { reason });
                          qc.invalidateQueries({ queryKey: ['purchase-returns'] });
                        } catch (err) {
                          window.alert(err.response?.data?.message || 'Could not reverse this return.');
                        }
                      }}
                    >
                      Reverse
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={data?.page || 1} pages={data?.pages || 1} onPage={setPage} />
    </div>
  );
}

export function StockLedgerPanel() {
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['stock-ledger', q, type, page],
    queryFn: () => api.get('/pharmacy/purchases/ledger', { params: { q, type, page, limit: 30 } }).then((r) => r.data.data),
  });
  const rows = data?.data || [];
  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex-1">Stock Ledger</h2>
        <input className="input-field text-sm sm:w-56" placeholder="Medicine or batch" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <select className="input-field text-sm sm:w-44" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
          <option value="">All movements</option>
          <option value="purchase">Purchase</option>
          <option value="purchase_return">Purchase return</option>
          <option value="dispense">Sale</option>
          <option value="bill_deduct">Bill sale</option>
          <option value="sale">Sale</option>
          <option value="stock_adjustment_increase">Adjustment in</option>
          <option value="stock_adjustment_reduce">Adjustment out</option>
          <option value="dispose">Expired / disposed</option>
        </select>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-xs min-w-[760px]">
          <thead className="bg-slate-50 text-slate-500">
            <tr>{['Date', 'Type', 'Medicine', 'Batch', 'Reference', 'Qty', 'Balance'].map((h) => <th key={h} className="px-3 py-2 text-left">{h}</th>)}</tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={7} className="px-3 py-6 text-slate-400">Loading ledger…</td></tr>}
            {rows.map((row) => (
              <tr key={row._id} className="border-t border-slate-100">
                <td className="px-3 py-2">{fmtDate(row.date)}</td>
                <td className="px-3 py-2">{row.label}</td>
                <td className="px-3 py-2">{row.medicineName}</td>
                <td className="px-3 py-2">{row.batchNumber || '—'}</td>
                <td className="px-3 py-2 max-w-[220px] truncate">{row.reference}</td>
                <td className={`px-3 py-2 tabular-nums font-semibold ${row.quantityChanged < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                  {row.quantityChanged > 0 ? `+${row.quantityChanged}` : row.quantityChanged}
                </td>
                <td className="px-3 py-2 tabular-nums">{row.balance}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={data?.page || 1} pages={data?.pages || 1} onPage={setPage} />
    </div>
  );
}

export function StockValuationPanel() {
  const [q, setQ] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['stock-valuation', q],
    queryFn: () => api.get('/pharmacy/purchases/valuation', { params: { q } }).then((r) => r.data.data),
  });
  const rows = data?.data || [];
  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2 justify-between">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Stock Valuation</h2>
        <input className="input-field text-sm sm:w-56" placeholder="Medicine or batch" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-xs min-w-[680px]">
          <thead className="bg-slate-50 text-slate-500">
            <tr>{['Medicine', 'Batch', 'Expiry', 'Quantity', 'Purchase rate', 'Stock value'].map((h) => <th key={h} className="px-3 py-2 text-left">{h}</th>)}</tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="px-3 py-6 text-slate-400">Calculating stock value…</td></tr>}
            {rows.map((row) => (
              <tr key={`${row.medicineId}-${row.batchNumber}`} className="border-t border-slate-100">
                <td className="px-3 py-2 font-semibold">{row.medicineName}</td>
                <td className="px-3 py-2">{row.batchNumber}</td>
                <td className="px-3 py-2">{fmtDate(row.expiryDate)}</td>
                <td className="px-3 py-2 tabular-nums">{row.quantity}</td>
                <td className="px-3 py-2 tabular-nums">{inr(row.purchaseRate)}</td>
                <td className="px-3 py-2 tabular-nums font-semibold">{inr(row.stockValue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm font-semibold text-slate-800">Total Inventory Purchase Value: {inr(data?.totalInventoryPurchaseValue)}</p>
    </div>
  );
}

export function PurchaseReportsPanel() {
  const [type, setType] = useState('daily');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['purchase-reports', type, from, to],
    queryFn: () => api.get('/pharmacy/purchases/reports', { params: { type, from, to } }).then((r) => r.data.data),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-col lg:flex-row gap-2 lg:items-end">
        <label className="text-xs text-slate-500">Report
          <select className="input-field text-sm mt-1" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="daily">Daily purchase</option>
            <option value="monthly">Monthly purchase</option>
            <option value="supplier">Supplier-wise</option>
            <option value="medicine">Medicine-wise</option>
            <option value="returns">Purchase return</option>
            <option value="net">Net purchase</option>
          </select>
        </label>
        <label className="text-xs text-slate-500">From
          <input type="date" className="input-field text-sm mt-1" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="text-xs text-slate-500">To
          <input type="date" className="input-field text-sm mt-1" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>
      {isLoading && <p className="text-xs text-slate-400">Loading report…</p>}
      {data?.type === 'net' && (
        <div className="grid sm:grid-cols-3 gap-3">
          <Card label="Purchases" value={inr(data.purchases)} />
          <Card label="Returns" value={inr(data.returns)} />
          <Card label="Net purchases" value={inr(data.netPurchases)} />
        </div>
      )}
      {data?.type === 'supplier' && (
        <SimpleTable headers={['Supplier', 'Invoices', 'Purchase value']} rows={(data.data || []).map((row) => [row.supplier, row.invoices, inr(row.purchaseValue)])} />
      )}
      {data?.type === 'medicine' && (
        <SimpleTable headers={['Medicine', 'Quantity', 'Free', 'Purchase value']} rows={(data.data || []).map((row) => [row.medicine, row.quantity, row.freeQuantity, inr(row.purchaseValue)])} />
      )}
      {data?.type === 'returns' && (
        <div className="space-y-2">
          <p className="text-sm">Returned quantity {data.returnedQuantity} · Returned value {inr(data.returnedValue)}</p>
          <SimpleTable headers={['Return', 'Invoice', 'Supplier', 'Qty', 'Value', 'Reason']} rows={(data.data || []).map((row) => [row.returnNumber, row.originalInvoice, row.supplierName, row.totalReturnQuantity, inr(row.totalReturnValue), row.reason])} />
        </div>
      )}
      {(data?.type === 'daily' || data?.type === 'monthly') && (
        <div className="space-y-2">
          <p className="text-sm font-semibold">{data.invoiceCount || 0} invoices · {inr(data.purchaseValue)}</p>
          <SimpleTable headers={['Invoice', 'Supplier', 'Items', 'Quantity', 'Value']} rows={(data.data || []).map((row) => [row.invoice, row.supplier, row.items, row.quantity, inr(row.value)])} />
        </div>
      )}
    </div>
  );
}

function Card({ label, value }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-lg font-bold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}

function SimpleTable({ headers, rows }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
      <table className="w-full text-xs min-w-[520px]">
        <thead className="bg-slate-50 text-slate-500">
          <tr>{headers.map((h) => <th key={h} className="px-3 py-2 text-left">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={headers.length} className="px-3 py-6 text-slate-400">No rows in this period.</td></tr>}
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-slate-100">
              {row.map((cell, j) => <td key={j} className="px-3 py-2 tabular-nums">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
