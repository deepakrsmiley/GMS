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
    <section className="pur-card">
      <div className="pur-toolbar">
        <h2>Return history</h2>
        <input className="input-field text-sm" placeholder="Return no, invoice, medicine" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
      </div>
      <div className="pur-table-wrap">
        <table className="pur-table">
          <thead>
            <tr>{['Return', 'Supplier', 'Invoice', 'Date', 'Medicine', 'Batch', 'Qty', 'Value', 'Reason', 'Created by', ''].map((h) => <th key={h}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={11} className="pur-empty">Loading returns…</td></tr>}
            {rows.map((row) => (
              <tr key={row._id}>
                <td className="font-semibold">{row.returnNumber}</td>
                <td>{row.supplierName}</td>
                <td>{row.originalInvoice}</td>
                <td>{fmtDate(row.returnDate)}</td>
                <td>{row.medicineSummary}</td>
                <td>{row.batchSummary}</td>
                <td className="tabular-nums">{row.totalReturnQuantity}</td>
                <td className="tabular-nums">{inr(row.totalReturnValue)}</td>
                <td>{row.reason}</td>
                <td>{row.createdByName}</td>
                <td>
                  <div className="pur-row-actions">
                  <button type="button" className="pur-link" onClick={() => view(row._id)}>View / Print</button>
                  {row.status === 'active' && (
                    <button
                      type="button"
                      className="pur-link pur-link--muted"
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
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-3">
        <Pager page={data?.page || 1} pages={data?.pages || 1} onPage={setPage} />
      </div>
    </section>
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
    <section className="pur-card">
      <div className="pur-toolbar">
        <h2>Stock ledger</h2>
        <div className="flex flex-wrap gap-2">
        <input className="input-field text-sm" placeholder="Medicine or batch" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
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
      </div>
      <div className="pur-table-wrap">
        <table className="pur-table">
          <thead>
            <tr>{['Date', 'Type', 'Medicine', 'Batch', 'Reference', 'Qty', 'Balance'].map((h) => <th key={h}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={7} className="pur-empty">Loading ledger…</td></tr>}
            {rows.map((row) => (
              <tr key={row._id}>
                <td>{fmtDate(row.date)}</td>
                <td>{row.label}</td>
                <td>{row.medicineName}</td>
                <td>{row.batchNumber || '—'}</td>
                <td className="max-w-[220px] truncate">{row.reference}</td>
                <td className={`tabular-nums font-semibold ${row.quantityChanged < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                  {row.quantityChanged > 0 ? `+${row.quantityChanged}` : row.quantityChanged}
                </td>
                <td className="tabular-nums">{row.balance}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-3">
        <Pager page={data?.page || 1} pages={data?.pages || 1} onPage={setPage} />
      </div>
    </section>
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
    <section className="pur-card">
      <div className="pur-toolbar">
        <h2>Stock value</h2>
        <input className="input-field text-sm" placeholder="Medicine or batch" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="pur-table-wrap">
        <table className="pur-table">
          <thead>
            <tr>{['Medicine', 'Batch', 'Expiry', 'Quantity', 'Purchase rate', 'Stock value'].map((h) => <th key={h}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="pur-empty">Calculating stock value…</td></tr>}
            {rows.map((row) => (
              <tr key={`${row.medicineId}-${row.batchNumber}`}>
                <td className="font-semibold">{row.medicineName}</td>
                <td>{row.batchNumber}</td>
                <td>{fmtDate(row.expiryDate)}</td>
                <td className="tabular-nums">{row.quantity}</td>
                <td className="tabular-nums">{inr(row.purchaseRate)}</td>
                <td className="tabular-nums font-semibold">{inr(row.stockValue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-4 py-3 text-sm font-semibold text-slate-800">Total stock value {inr(data?.totalInventoryPurchaseValue)}</p>
    </section>
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
      <section className="pur-card">
      <div className="pur-card__body pur-grid">
        <label className="pur-field">Report
          <select className="input-field text-sm" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="daily">Daily purchase</option>
            <option value="monthly">Monthly purchase</option>
            <option value="supplier">Supplier-wise</option>
            <option value="medicine">Medicine-wise</option>
            <option value="returns">Purchase return</option>
            <option value="net">Net purchase</option>
          </select>
        </label>
        <label className="pur-field">From
          <input type="date" className="input-field text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="pur-field">To
          <input type="date" className="input-field text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>
      </section>
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
    <div className="pur-stat">
      <span>{label}</span>
      <strong className="tabular-nums">{value}</strong>
    </div>
  );
}

function SimpleTable({ headers, rows }) {
  return (
    <div className="pur-card pur-table-wrap">
      <table className="pur-table">
        <thead>
          <tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={headers.length} className="pur-empty">No rows in this period.</td></tr>}
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => <td key={j} className="tabular-nums">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
