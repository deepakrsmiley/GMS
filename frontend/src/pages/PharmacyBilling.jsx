import { useState, useEffect, useMemo, useRef } from 'react';
import { Printer, RefreshCw, FileBarChart2, Search, Download, Filter } from 'lucide-react';
import '../styles/pharmacyBillingReports.css';

const API = '/api/billing';

const fmt = (n) =>
  `₹${(+n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const today = () => new Date().toLocaleDateString('en-CA');
const yesterday = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString('en-CA');
};

const authFetch = (url, options = {}) => {
  const token = localStorage.getItem('hms_token');
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
};

function ModeBadge({ mode }) {
  const key = String(mode || '').toLowerCase();
  const label = key === 'upi' ? 'UPI' : key ? key : '—';
  return <span className={`pbr-mode pbr-mode--${key || 'other'}`}>{label}</span>;
}

function openPrintWindow(title, html) {
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
    <style>
      body{font-family:'IBM Plex Sans',Arial,sans-serif;font-size:12px;color:#0f172a;margin:0;padding:20px}
      h1,h2{font-size:16px;margin:0 0 8px;letter-spacing:-.02em}
      table{width:100%;border-collapse:collapse;margin-bottom:14px}
      th{background:#f1f5f9;padding:8px 10px;text-align:left;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;border-bottom:1px solid #e2e8f0}
      td{padding:7px 10px;border-top:1px solid #e2e8f0;font-size:12px}
      .pbr-pos{color:#047857;font-weight:700}.pbr-neg{color:#b91c1c;font-weight:700}
      .pbr-badge{display:inline-block;padding:2px 8px;font-size:10px;font-weight:700;text-transform:uppercase;border:1px solid #e2e8f0}
      .pbr-summary{display:flex;gap:20px;background:#0b1f3a;color:#fff;padding:12px 16px;margin-bottom:14px}
      .pbr-mode{display:inline-block;padding:2px 8px;font-size:10px;font-weight:700;text-transform:uppercase;border-radius:10px}
      .pbr-mode--cash{background:#dcfce7;color:#15803d}
      .pbr-mode--card{background:#dbeafe;color:#3730a3}
      .pbr-mode--upi{background:#ede9fe;color:#6d28d9}
      .no-print{display:none !important}
      .print-only{display:table-row-group}
      .print-only.pbr-summary,.pbr-summary.print-only{display:flex}
      @media print{button{display:none}}
    </style></head><body>${html}</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); win.close(); }, 350);
}

export default function PharmacyBilling() {
  const [tab, setTab] = useState('shift');
  const [headerStats, setHeaderStats] = useState(null);

  const TABS = [
    { id: 'shift', label: 'Sales Report' },
    { id: 'daily', label: 'Daily' },
    { id: 'weekly', label: 'Weekly' },
    { id: 'monthly', label: 'Monthly' },
    { id: 'staff', label: 'Staff Report' },
  ];

  return (
    <div className="pbr">
      <header className="pbr-masthead">
        <div>
          <div className="pbr-masthead__eyebrow">Pharmacy · Finance</div>
          <h1 className="pbr-masthead__title">Pharmacy Sales Reports</h1>
          <p className="pbr-masthead__sub">Only amounts paid in Billing for pharmacy / medicines — unpaid bills are not included</p>
        </div>
        {headerStats && (
          <div className="pbr-masthead__kpis">
            <div className="pbr-kpi">
              <div className="pbr-kpi__value">{headerStats.totalBills ?? 0}</div>
              <div className="pbr-kpi__label">Bills</div>
            </div>
            <div className="pbr-kpi">
              <div className="pbr-kpi__value">{fmt(headerStats.totalPaid ?? 0)}</div>
              <div className="pbr-kpi__label">Paid in Billing</div>
            </div>
            <div className="pbr-kpi">
              <div className={`pbr-kpi__value ${(headerStats.totalDue || 0) > 0 ? 'pbr-kpi__value--warn' : ''}`}>
                {fmt(headerStats.totalDue ?? 0)}
              </div>
              <div className="pbr-kpi__label">Due</div>
            </div>
          </div>
        )}
      </header>

      <nav className="pbr-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`pbr-tab ${tab === t.id ? 'is-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="pbr-body">
        {tab === 'shift' && <ShiftReport onSummary={setHeaderStats} />}
        {tab === 'daily' && <DailyReport />}
        {tab === 'weekly' && <WeeklyReport />}
        {tab === 'monthly' && <MonthlyReport />}
        {tab === 'staff' && <StaffReport />}
      </div>
    </div>
  );
}

function ShiftReport({ onSummary }) {
  const [preset, setPreset] = useState('today');
  const [date, setDate] = useState(today());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const printRef = useRef();

  const applyPreset = (id) => {
    setPreset(id);
    if (id === 'today') setDate(today());
    if (id === 'yesterday') setDate(yesterday());
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    setPage(1);
    try {
      const r = await authFetch(`${API}/report/shift?date=${date}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.message || 'Failed to load sales report');
      setData(d);
    } catch (e) {
      setError(e.message || 'Failed to load sales report');
      setData(null);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [date]);

  const bills = data?.bills || data?.data?.bills || [];
  const summary = data?.summary ?? data?.data?.summary ?? {};

  useEffect(() => {
    if (onSummary && data?.summary) onSummary(data.summary);
  }, [data, onSummary]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return bills;
    return bills.filter((b) =>
      [b.billNumber, b.patientName, b.patientId, b.phone, b.billedByName, b.paymentMode]
        .some((v) => String(v || '').toLowerCase().includes(q)),
    );
  }, [bills, search]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageSafe = Math.min(page, pages);
  const paged = filtered.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  const handlePrint = () => openPrintWindow(`Pharmacy Sales Report - ${date}`, printRef.current?.innerHTML || '');

  const handleExport = () => {
    const cols = ['Bill No', 'Patient', 'UHID', 'Mobile', 'Time', 'Items', 'Amount', 'Discount', 'Paid', 'Mode', 'Created By', 'Status'];
    const lines = [
      cols.join(','),
      ...filtered.map((b) => [
        b.billNumber,
        `"${String(b.patientName || '').replace(/"/g, '""')}"`,
        b.patientId || '',
        b.phone || '',
        b.createdAt ? new Date(b.createdAt).toLocaleString('en-IN') : '',
        b.items ?? 0,
        b.totalAmount ?? 0,
        b.discount ?? 0,
        b.paidAmount ?? 0,
        b.paymentMode || '',
        `"${String(b.billedByName || '').replace(/"/g, '""')}"`,
        b.status || '',
      ].join(',')),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pharmacy-sales-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="pbr-toolbar">
        <div className="pbr-presets">
          {[
            { id: 'today', label: 'Today' },
            { id: 'yesterday', label: 'Yesterday' },
            { id: 'custom', label: 'Custom Date' },
          ].map((p) => (
            <button
              key={p.id}
              type="button"
              className={`pbr-preset ${preset === p.id ? 'is-active' : ''}`}
              onClick={() => applyPreset(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="pbr-field">
          <label>Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => { setPreset('custom'); setDate(e.target.value); }}
          />
        </div>
        <button type="button" className="pbr-btn pbr-btn--primary" onClick={load}>
          <Filter size={14} /> View Report
        </button>
        {bills.length > 0 && (
          <>
            <button type="button" className="pbr-btn pbr-btn--print" onClick={handlePrint}>
              <Printer size={14} /> Print all bills
            </button>
            <button type="button" className="pbr-btn pbr-btn--ghost" onClick={handleExport}>
              <Download size={14} /> Export Report
            </button>
          </>
        )}
      </div>

      {loading && <div className="pbr-loading">Loading pharmacy sales…</div>}
      {error && <div className="pbr-alert pbr-alert--error">Error: {error}</div>}

      {data && !loading && (
        <>
          <div className="pbr-stat-grid">
            <div className="pbr-stat"><div className="pbr-stat__value">{summary.totalBills ?? 0}</div><div className="pbr-stat__label">Total Bills</div></div>
            <div className="pbr-stat"><div className="pbr-stat__value">{fmt(summary.totalAmount ?? 0)}</div><div className="pbr-stat__label">Total Amount</div></div>
            <div className="pbr-stat"><div className="pbr-stat__value pbr-pos">{fmt(summary.totalPaid ?? 0)}</div><div className="pbr-stat__label">Paid in Billing</div></div>
            <div className="pbr-stat"><div className="pbr-stat__value">{fmt(summary.totalDiscount ?? 0)}</div><div className="pbr-stat__label">Discount</div></div>
            <div className="pbr-stat"><div className="pbr-stat__value">{summary.totalItems ?? 0}</div><div className="pbr-stat__label">Total Items Sold</div></div>
          </div>

          <div className="pbr-settle pbr-settle--modes">
            <div className="pbr-settle__title">Collections by payment mode</div>
            <div className="pbr-settle__row">
              <div className="pbr-settle__item"><div className="val">{fmt(summary.cashAmount ?? 0)}</div><div className="lbl">Cash</div></div>
              <div className="pbr-settle__item"><div className="val">{fmt(summary.upiAmount ?? 0)}</div><div className="lbl">UPI</div></div>
              <div className="pbr-settle__item"><div className="val">{fmt(summary.cardAmount ?? 0)}</div><div className="lbl">Card</div></div>
              <div className="pbr-settle__item"><div className="val val--pos">{fmt(summary.totalPaid ?? 0)}</div><div className="lbl">Total Collected</div></div>
              <div className="pbr-settle__item"><div className="val val--neg">{fmt(summary.totalDue ?? 0)}</div><div className="lbl">Pending</div></div>
            </div>
          </div>

          <div className="pbr-table-tools no-print">
            <div className="pbr-search">
              <Search size={14} />
              <input
                type="search"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search by Bill No., Patient, Mobile…"
              />
            </div>
            <span className="pbr-table-count">Bill Details ({filtered.length})</span>
          </div>

          <div ref={printRef}>
            <div className="pbr-report-title">
              <h1>Pharmacy Sales Report</h1>
              <p>
                Date:{' '}
                <strong>
                  {new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}
                </strong>
                {' · '}Paid collections 12:00 AM – 11:59 PM
                {' · '}Generated: <strong>{new Date().toLocaleTimeString('en-IN')}</strong>
              </p>
            </div>

            <div className="pbr-summary print-only">
              <div className="pbr-summary__item"><div className="pbr-summary__value">{summary.totalBills ?? 0}</div><div className="pbr-summary__label">Bills</div></div>
              <div className="pbr-summary__item"><div className="pbr-summary__value">{fmt(summary.totalAmount ?? 0)}</div><div className="pbr-summary__label">Amount</div></div>
              <div className="pbr-summary__item"><div className="pbr-summary__value">{fmt(summary.totalPaid ?? 0)}</div><div className="pbr-summary__label">Paid in Billing</div></div>
              <div className="pbr-summary__item"><div className="pbr-summary__value">{fmt(summary.totalDiscount ?? 0)}</div><div className="pbr-summary__label">Discount</div></div>
              <div className="pbr-summary__item"><div className="pbr-summary__value">{summary.totalItems ?? 0}</div><div className="pbr-summary__label">Items</div></div>
            </div>

            <section className="pbr-panel">
              <div className="pbr-panel__body">
                <div className="pbr-table-wrap">
                  <table className="pbr-table">
                    <thead>
                      <tr>
                        {['#', 'Bill No.', 'Patient Name', 'Mobile', 'Bill Time', 'Items', 'Amount', 'Discount', 'Paid', 'Payment Mode', 'Created By'].map((h) => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="no-print">
                      {paged.length === 0 ? (
                        <tr><td colSpan={11} className="pbr-empty">No paid pharmacy collections for this date</td></tr>
                      ) : paged.map((b, i) => (
                        <tr key={b.id || i} className={b.cancelled ? 'is-cancelled' : ''}>
                          <td>{(pageSafe - 1) * pageSize + i + 1}</td>
                          <td className="pbr-strong">{b.billNumber}</td>
                          <td>{b.patientName || '—'}</td>
                          <td className="pbr-mono">{b.phone || '—'}</td>
                          <td>
                            {b.createdAt
                              ? new Date(b.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
                              : '—'}
                          </td>
                          <td>{b.items ?? 0}</td>
                          <td className="pbr-strong">{fmt(b.totalAmount)}</td>
                          <td>{fmt(b.discount)}</td>
                          <td className="pbr-pos">{fmt(b.paidAmount)}</td>
                          <td><ModeBadge mode={b.paymentMode} /></td>
                          <td>{b.billedByName || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tbody className="print-only">
                      {filtered.map((b, i) => (
                        <tr key={`p-${b.id || i}`} className={b.cancelled ? 'is-cancelled' : ''}>
                          <td>{i + 1}</td>
                          <td className="pbr-strong">{b.billNumber}</td>
                          <td>{b.patientName || '—'}</td>
                          <td className="pbr-mono">{b.phone || '—'}</td>
                          <td>
                            {b.createdAt
                              ? new Date(b.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
                              : '—'}
                          </td>
                          <td>{b.items ?? 0}</td>
                          <td className="pbr-strong">{fmt(b.totalAmount)}</td>
                          <td>{fmt(b.discount)}</td>
                          <td className="pbr-pos">{fmt(b.paidAmount)}</td>
                          <td><ModeBadge mode={b.paymentMode} /></td>
                          <td>{b.billedByName || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={5}>Grand total ({filtered.length} bills)</td>
                        <td>{filtered.reduce((s, b) => s + (b.cancelled ? 0 : (b.items || 0)), 0)}</td>
                        <td>{fmt(summary.totalAmount)}</td>
                        <td>{fmt(summary.totalDiscount)}</td>
                        <td className="pbr-pos">{fmt(summary.totalPaid)}</td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </section>
          </div>

          {filtered.length > 0 && (
            <div className="pbr-pager no-print">
              <span>
                Showing {(pageSafe - 1) * pageSize + 1} to {Math.min(pageSafe * pageSize, filtered.length)} of {filtered.length} entries
              </span>
              <div className="pbr-pager__btns">
                <button type="button" disabled={pageSafe <= 1} onClick={() => setPage(pageSafe - 1)}>Previous</button>
                <span>Page {pageSafe} of {pages}</span>
                <button type="button" disabled={pageSafe >= pages} onClick={() => setPage(pageSafe + 1)}>Next</button>
              </div>
              <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
                {[10, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>{n} / page</option>
                ))}
              </select>
            </div>
          )}

          <div className="pbr-footer-bar no-print">
            <span>Grand Total <strong>{fmt(summary.totalAmount)}</strong></span>
            <span>Paid in Billing <strong>{fmt(summary.totalPaid)}</strong></span>
            <span>Total Discount <strong>{fmt(summary.totalDiscount)}</strong></span>
            <span>Total Items <strong>{summary.totalItems ?? 0}</strong></span>
          </div>
        </>
      )}
    </div>
  );
}

function PeriodTableReport({
  title,
  selectLabel,
  selectValue,
  onSelectChange,
  options,
  optionSuffix,
  loadUrl,
  columns,
  mapRow,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const printRef = useRef();

  const load = async () => {
    setLoading(true);
    try {
      const r = await authFetch(loadUrl);
      setData(await r.json());
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return (
    <div>
      <div className="pbr-toolbar">
        <div className="pbr-field">
          <label>{selectLabel}</label>
          <select value={selectValue} onChange={onSelectChange}>
            {options.map((v) => (
              <option key={v} value={v}>{v} {optionSuffix}</option>
            ))}
          </select>
        </div>
        <button type="button" className="pbr-btn pbr-btn--primary" onClick={load}>
          <RefreshCw size={14} /> Load
        </button>
        {data && (
          <button
            type="button"
            className="pbr-btn pbr-btn--print"
            onClick={() => openPrintWindow(title, printRef.current?.innerHTML || '')}
          >
            <Printer size={14} /> Print
          </button>
        )}
      </div>

      {loading && <div className="pbr-loading">Loading report…</div>}

      {data && (
        <div ref={printRef} className="pbr-panel">
          <div className="pbr-panel__head">
            <h2 className="pbr-panel__title">{title}</h2>
            <span className="pbr-panel__meta">
              <FileBarChart2 size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
              Pharmacy collections
            </span>
          </div>
          <div className="pbr-table-wrap">
            <table className="pbr-table">
              <thead>
                <tr>{columns.map((h) => <th key={h}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {(data.data || []).map((row, i) => (
                  <tr key={row._id || i}>{mapRow(row, i)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          {!(data.data || []).length && <div className="pbr-empty">No records for this period</div>}
        </div>
      )}
    </div>
  );
}

function DailyReport() {
  const [days, setDays] = useState(30);
  return (
    <PeriodTableReport
      title={`Daily Pharmacy Billing Report — Last ${days} Days`}
      selectLabel="Show Last (Days)"
      selectValue={days}
      onSelectChange={(e) => setDays(e.target.value)}
      options={[7, 14, 30, 60, 90]}
      optionSuffix="Days"
      loadUrl={`${API}/report/daily?days=${days}`}
      columns={['Date', 'Bills', 'Total Amount', 'Collected', 'Due', 'Paid', 'Partial', 'Pending']}
      mapRow={(row) => (
        <>
          <td className="pbr-strong">{row._id}</td>
          <td>{row.totalBills}</td>
          <td className="pbr-strong">{fmt(row.totalAmount)}</td>
          <td className="pbr-pos">{fmt(row.totalPaid)}</td>
          <td className={row.totalDue > 0 ? 'pbr-neg' : 'pbr-pos'}>{fmt(row.totalDue)}</td>
          <td className="pbr-pos">{row.paidBills}</td>
          <td className="pbr-warn">{row.partialBills}</td>
          <td className="pbr-neg">{row.totalBills - row.paidBills - row.partialBills}</td>
        </>
      )}
    />
  );
}

function WeeklyReport() {
  const [weeks, setWeeks] = useState(8);
  return (
    <PeriodTableReport
      title="Weekly Pharmacy Billing Report"
      selectLabel="Show Last (Weeks)"
      selectValue={weeks}
      onSelectChange={(e) => setWeeks(e.target.value)}
      options={[4, 8, 12, 24, 52]}
      optionSuffix="Weeks"
      loadUrl={`${API}/report/weekly?weeks=${weeks}`}
      columns={['Week', 'Bills', 'Total', 'Collected', 'Due', 'Paid', 'Partial']}
      mapRow={(row) => (
        <>
          <td className="pbr-strong">{row._id}</td>
          <td>{row.totalBills}</td>
          <td className="pbr-strong">{fmt(row.totalAmount)}</td>
          <td className="pbr-pos">{fmt(row.totalPaid)}</td>
          <td className={row.totalDue > 0 ? 'pbr-neg' : 'pbr-pos'}>{fmt(row.totalDue)}</td>
          <td className="pbr-pos">{row.paidBills}</td>
          <td className="pbr-warn">{row.partialBills}</td>
        </>
      )}
    />
  );
}

function MonthlyReport() {
  const [months, setMonths] = useState(12);
  return (
    <PeriodTableReport
      title="Monthly Pharmacy Billing Report"
      selectLabel="Show Last (Months)"
      selectValue={months}
      onSelectChange={(e) => setMonths(e.target.value)}
      options={[3, 6, 12, 24]}
      optionSuffix="Months"
      loadUrl={`${API}/report/monthly?months=${months}`}
      columns={['Month', 'Bills', 'Total', 'Collected', 'Due', 'Paid', 'Partial']}
      mapRow={(row) => (
        <>
          <td className="pbr-strong">{row._id}</td>
          <td>{row.totalBills}</td>
          <td className="pbr-strong">{fmt(row.totalAmount)}</td>
          <td className="pbr-pos">{fmt(row.totalPaid)}</td>
          <td className={row.totalDue > 0 ? 'pbr-neg' : 'pbr-pos'}>{fmt(row.totalDue)}</td>
          <td className="pbr-pos">{row.paidBills}</td>
          <td className="pbr-warn">{row.partialBills}</td>
        </>
      )}
    />
  );
}

function StaffReport() {
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const printRef = useRef();

  const load = async () => {
    setLoading(true);
    try {
      const r = await authFetch(`${API}/report/staff?from=${from}&to=${to}`);
      setData(await r.json());
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const grouped = data?.data?.reduce((acc, row) => {
    const key = row.staffName || 'Unknown';
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});

  return (
    <div>
      <div className="pbr-toolbar">
        <div className="pbr-field">
          <label>From Date</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="pbr-field">
          <label>To Date</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button type="button" className="pbr-btn pbr-btn--primary" onClick={load}>
          <RefreshCw size={14} /> Load
        </button>
        {data && (
          <button
            type="button"
            className="pbr-btn pbr-btn--print"
            onClick={() => openPrintWindow('Staff Settlement', printRef.current?.innerHTML || '')}
          >
            <Printer size={14} /> Print Settlement
          </button>
        )}
      </div>

      {loading && <div className="pbr-loading">Loading staff settlement…</div>}

      {grouped && (
        <div ref={printRef}>
          <div className="pbr-report-title">
            <h2>Staff / Pharmacist Settlement</h2>
            <p>{from} to {to}</p>
          </div>

          {Object.entries(grouped).map(([name, rows]) => {
            const totBills = rows.reduce((s, r) => s + r.totalBills, 0);
            const totAmt = rows.reduce((s, r) => s + r.totalAmount, 0);
            const totPaid = rows.reduce((s, r) => s + r.totalPaid, 0);
            const totDue = rows.reduce((s, r) => s + r.totalDue, 0);
            const totCash = rows.reduce((s, r) => s + r.cashCollected, 0);
            const totUpi = rows.reduce((s, r) => s + r.upiCollected, 0);
            const totCard = rows.reduce((s, r) => s + r.cardCollected, 0);

            return (
              <div key={name} className="pbr-staff-card">
                <div className="pbr-staff-card__head">
                  <div>
                    <h3 className="pbr-staff-card__name">{name}</h3>
                    <p className="pbr-staff-card__sub">{totBills} bills · Total billed {fmt(totAmt)}</p>
                  </div>
                  <div className="pbr-staff-card__totals">
                    <div>
                      <div className="pbr-mini-stat__value pbr-mini-stat__value--pos">{fmt(totPaid)}</div>
                      <div className="pbr-mini-stat__label">Collected</div>
                    </div>
                    <div>
                      <div className="pbr-mini-stat__value pbr-mini-stat__value--neg">{fmt(totDue)}</div>
                      <div className="pbr-mini-stat__label">Pending</div>
                    </div>
                  </div>
                </div>

                <div className="pbr-mode-pills">
                  <div className="pbr-mode-pill pbr-mode-pill--cash">
                    <div className="val">{fmt(totCash)}</div>
                    <div className="lbl">Cash</div>
                  </div>
                  <div className="pbr-mode-pill pbr-mode-pill--upi">
                    <div className="val">{fmt(totUpi)}</div>
                    <div className="lbl">UPI</div>
                  </div>
                  <div className="pbr-mode-pill pbr-mode-pill--card">
                    <div className="val">{fmt(totCard)}</div>
                    <div className="lbl">Card</div>
                  </div>
                </div>

                <div className="pbr-table-wrap">
                  <table className="pbr-table">
                    <thead>
                      <tr>
                        {['Bills', 'Total Billed', 'Collected', 'Due', 'Cash', 'UPI', 'Card'].map((h) => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                          <tr key={i}>
                            <td>{r.totalBills}</td>
                            <td className="pbr-strong">{fmt(r.totalAmount)}</td>
                            <td className="pbr-pos">{fmt(r.totalPaid)}</td>
                            <td className={r.totalDue > 0 ? 'pbr-neg' : 'pbr-pos'}>{fmt(r.totalDue)}</td>
                            <td>{fmt(r.cashCollected)}</td>
                            <td>{fmt(r.upiCollected)}</td>
                            <td>{fmt(r.cardCollected || 0)}</td>
                          </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}

          {Object.keys(grouped).length === 0 && (
            <div className="pbr-empty">No data found for selected date range</div>
          )}
        </div>
      )}
    </div>
  );
}
