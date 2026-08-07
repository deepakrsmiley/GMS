import { useState, useEffect, useCallback, useRef } from 'react';
import { Printer, RefreshCw, FileBarChart2 } from 'lucide-react';
import '../styles/pharmacyBillingReports.css';

const API = '/api/billing';

const fmt = (n) =>
  `₹${(+n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const today = () => new Date().toISOString().slice(0, 10);

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

const SHIFT_LABELS = {
  morning: 'Morning  7AM - 7PM',
  night: 'Night  7PM - 7AM',
};

function ShiftBadge({ shift }) {
  const key = shift === 'night' ? 'night' : 'morning';
  const label = key === 'morning' ? 'Morning 7AM–7PM' : 'Night 7PM–7AM';
  return <span className={`pbr-badge pbr-badge--${key}`}>{label}</span>;
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
      .pbr-shift-card{border:1px solid #e2e8f0;padding:12px;margin-bottom:12px}
      @media print{button{display:none}}
    </style></head><body>${html}</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); win.close(); }, 350);
}

export default function PharmacyBilling() {
  const [tab, setTab] = useState('shift');
  const [stats, setStats] = useState(null);

  const fetchStats = useCallback(async () => {
    try {
      const r = await authFetch(`${API}/stats`);
      const d = await r.json();
      setStats(d.data || d);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const TABS = [
    { id: 'shift', label: 'Shift Report' },
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
          <h1 className="pbr-masthead__title">Pharmacy Billing Reports</h1>
          <p className="pbr-masthead__sub">Shift-wise account settlement · Daily / Weekly / Monthly collections</p>
        </div>
        {stats && (
          <div className="pbr-masthead__kpis">
            <div className="pbr-kpi">
              <div className="pbr-kpi__value">{stats.totalBills ?? stats.today?.totalBills ?? '—'}</div>
              <div className="pbr-kpi__label">Today Bills</div>
            </div>
            <div className="pbr-kpi">
              <div className="pbr-kpi__value">{fmt(stats.todayRevenue ?? stats.today?.totalPaid ?? 0)}</div>
              <div className="pbr-kpi__label">Collected</div>
            </div>
            <div className="pbr-kpi">
              <div className="pbr-kpi__value pbr-kpi__value--warn">{fmt(stats.today?.totalDue ?? 0)}</div>
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
        {tab === 'shift' && <ShiftReport />}
        {tab === 'daily' && <DailyReport />}
        {tab === 'weekly' && <WeeklyReport />}
        {tab === 'monthly' && <MonthlyReport />}
        {tab === 'staff' && <StaffReport />}
      </div>
    </div>
  );
}

function ShiftReport() {
  const [date, setDate] = useState(today());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const printRef = useRef();

  const load = async () => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const r = await authFetch(`${API}/report/shift?date=${date}`);
      const d = await r.json();
      setData(d);
    } catch (e) {
      setError(e.message || 'Failed to load shift report');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [date]);

  const shifts = (() => {
    if (!data) return [];
    if (Array.isArray(data.shifts)) return data.shifts;
    if (data.data && Array.isArray(data.data.shifts)) return data.data.shifts;
    if (Array.isArray(data.data)) return data.data;
    return [];
  })();

  const summary = data?.summary ?? data?.data?.summary ?? {};

  const handlePrint = () => openPrintWindow(`Shift Report - ${date}`, printRef.current?.innerHTML || '');

  return (
    <div>
      <div className="pbr-toolbar">
        <div className="pbr-field">
          <label>Select Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <button type="button" className="pbr-btn pbr-btn--primary" onClick={load}>
          <RefreshCw size={14} /> Load Shift Report
        </button>
        {data && shifts.length > 0 && (
          <button type="button" className="pbr-btn pbr-btn--print" onClick={handlePrint}>
            <Printer size={14} /> Print / Save PDF
          </button>
        )}
      </div>

      {loading && <div className="pbr-loading">Loading shift report…</div>}
      {error && <div className="pbr-alert pbr-alert--error">Error: {error}</div>}

      {data && shifts.length === 0 && !loading && (
        <div className="pbr-alert pbr-alert--warn">No shift data found for {date}.</div>
      )}

      {data && shifts.length > 0 && (
        <div ref={printRef}>
          <div className="pbr-report-title">
            <h1>Pharmacy Shift Report</h1>
            <p>
              Date:{' '}
              <strong>
                {new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}
              </strong>
              {' · '}Generated: <strong>{new Date().toLocaleTimeString('en-IN')}</strong>
            </p>
          </div>

          <div className="pbr-summary">
            <div className="pbr-summary__item">
              <div className="pbr-summary__value">{summary.totalBills ?? 0}</div>
              <div className="pbr-summary__label">Total Bills</div>
            </div>
            <div className="pbr-summary__item">
              <div className="pbr-summary__value">{fmt(summary.totalAmount ?? 0)}</div>
              <div className="pbr-summary__label">Total Amount</div>
            </div>
            <div className="pbr-summary__item">
              <div className="pbr-summary__value pbr-summary__value--pos">{fmt(summary.totalPaid ?? 0)}</div>
              <div className="pbr-summary__label">Collected</div>
            </div>
            <div className="pbr-summary__item">
              <div className="pbr-summary__value pbr-summary__value--neg">{fmt(summary.totalDue ?? 0)}</div>
              <div className="pbr-summary__label">Pending</div>
            </div>
          </div>

          <div className="pbr-shift-grid">
            {['morning', 'night'].map((shiftKey) => {
              const s = shifts.find((x) => x._id === shiftKey) || {
                _id: shiftKey, totalBills: 0, totalAmount: 0, totalPaid: 0, totalDue: 0,
                cashAmount: 0, upiAmount: 0, cardAmount: 0,
              };
              return (
                <div key={shiftKey} className={`pbr-shift-card pbr-shift-card--${shiftKey}`}>
                  <div className="pbr-shift-card__head">
                    <ShiftBadge shift={shiftKey} />
                    <span className="pbr-shift-card__time">
                      {shiftKey === 'morning' ? '07:00 AM – 07:00 PM' : '07:00 PM – 07:00 AM'}
                    </span>
                  </div>
                  <div className="pbr-shift-card__stats">
                    <div>
                      <div className="pbr-mini-stat__value">{s.totalBills}</div>
                      <div className="pbr-mini-stat__label">Bills</div>
                    </div>
                    <div>
                      <div className="pbr-mini-stat__value">{fmt(s.totalAmount)}</div>
                      <div className="pbr-mini-stat__label">Total</div>
                    </div>
                    <div>
                      <div className="pbr-mini-stat__value pbr-mini-stat__value--pos">{fmt(s.totalPaid)}</div>
                      <div className="pbr-mini-stat__label">Collected</div>
                    </div>
                    <div>
                      <div className={`pbr-mini-stat__value ${s.totalDue > 0 ? 'pbr-mini-stat__value--neg' : 'pbr-mini-stat__value--pos'}`}>
                        {fmt(s.totalDue)}
                      </div>
                      <div className="pbr-mini-stat__label">Due</div>
                    </div>
                  </div>
                  <div className="pbr-shift-card__modes">
                    <span>Cash: <strong>{fmt(s.cashAmount)}</strong></span>
                    <span>UPI: <strong>{fmt(s.upiAmount)}</strong></span>
                    <span>Card: <strong>{fmt(s.cardAmount)}</strong></span>
                  </div>
                </div>
              );
            })}
          </div>

          {['morning', 'night'].map((shiftKey) => {
            const s = shifts.find((x) => x._id === shiftKey);
            if (!s || !s.bills?.length) return null;
            return (
              <section key={shiftKey} className="pbr-panel">
                <div className="pbr-panel__head">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <ShiftBadge shift={shiftKey} />
                    <span className="pbr-panel__title">
                      {s.totalBills} Bills · Collected {fmt(s.totalPaid)} · Due {fmt(s.totalDue)}
                    </span>
                  </div>
                </div>
                <div className="pbr-panel__body">
                  <div className="pbr-table-wrap">
                    <table className="pbr-table">
                      <thead>
                        <tr>
                          {['#', 'Bill No', 'UHID', 'Patient', 'Time', 'Total', 'Paid', 'Due', 'Mode', 'Billed By'].map((h) => (
                            <th key={h}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {s.bills.map((b, i) => (
                          <tr key={b._id || i}>
                            <td>{i + 1}</td>
                            <td className="pbr-strong">{b.billNumber}</td>
                            <td className="pbr-mono">{b.patientId || '—'}</td>
                            <td>{b.patientName || '—'}</td>
                            <td>
                              {new Date(b.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td className="pbr-strong">{fmt(b.totalAmount)}</td>
                            <td className="pbr-pos">{fmt(b.paidAmount)}</td>
                            <td className={b.dueAmount > 0 ? 'pbr-neg' : 'pbr-pos'}>{fmt(b.dueAmount)}</td>
                            <td>{b.paymentMode?.toUpperCase() || '—'}</td>
                            <td>{b.billedByName || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={5}>Shift Total</td>
                          <td>{fmt(s.totalAmount)}</td>
                          <td className="pbr-pos">{fmt(s.totalPaid)}</td>
                          <td className="pbr-neg">{fmt(s.totalDue)}</td>
                          <td colSpan={2} />
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  <div className="pbr-settle">
                    <div className="pbr-settle__title">Account Settlement — {SHIFT_LABELS[shiftKey]}</div>
                    <div className="pbr-settle__row">
                      <div className="pbr-settle__item">
                        <div className="val">{fmt(s.cashAmount)}</div>
                        <div className="lbl">Cash</div>
                      </div>
                      <div className="pbr-settle__item">
                        <div className="val">{fmt(s.upiAmount)}</div>
                        <div className="lbl">UPI</div>
                      </div>
                      <div className="pbr-settle__item">
                        <div className="val">{fmt(s.cardAmount)}</div>
                        <div className="lbl">Card</div>
                      </div>
                      <div className="pbr-settle__item">
                        <div className="val val--pos">{fmt(s.totalPaid)}</div>
                        <div className="lbl">Total Collected</div>
                      </div>
                      <div className="pbr-settle__item">
                        <div className="val val--neg">{fmt(s.totalDue)}</div>
                        <div className="lbl">Total Pending</div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            );
          })}

          {shifts.every((s) => !s.bills?.length) && (
            <div className="pbr-empty">No pharmacy bills found for {date}</div>
          )}
        </div>
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
            <h2>Staff / Pharmacist Shift Settlement</h2>
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
                        {['Shift', 'Timing', 'Bills', 'Total Billed', 'Collected', 'Due', 'Cash', 'UPI', 'Card'].map((h) => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => {
                        const shift = r._id?.shift || r.shift;
                        return (
                          <tr key={i}>
                            <td><ShiftBadge shift={shift} /></td>
                            <td>{shift === 'morning' ? '7AM–7PM' : '7PM–7AM'}</td>
                            <td>{r.totalBills}</td>
                            <td className="pbr-strong">{fmt(r.totalAmount)}</td>
                            <td className="pbr-pos">{fmt(r.totalPaid)}</td>
                            <td className={r.totalDue > 0 ? 'pbr-neg' : 'pbr-pos'}>{fmt(r.totalDue)}</td>
                            <td>{fmt(r.cashCollected)}</td>
                            <td>{fmt(r.upiCollected)}</td>
                            <td>{fmt(r.cardCollected || 0)}</td>
                          </tr>
                        );
                      })}
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
