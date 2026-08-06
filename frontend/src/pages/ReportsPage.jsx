import React, { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  FileSpreadsheet, Printer, RefreshCw, CalendarRange,
  LayoutDashboard, Users, UserRound, CalendarDays, Stethoscope, Pill,
  Package, Receipt, Wallet, FlaskConical, Scan, BedDouble, HeartPulse,
  Scissors, IndianRupee, ShieldCheck, UserCog, Lock, Server,
  TrendingUp, TrendingDown, AlertCircle,
} from 'lucide-react';
import {
  startOfDay, endOfDay, subDays, startOfMonth, endOfMonth, subMonths, format,
} from 'date-fns';
import reportsApi from '../services/reportsApi';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { exportToCSV, printSection } from '../utils/exportUtils';
import '../styles/auditReports.css';

const PRESETS = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: '7 Days' },
  { id: 'thisMonth', label: 'This Month' },
  { id: 'lastMonth', label: 'Last Month' },
];

const NAV_GROUPS = [
  {
    title: 'Overview',
    items: [
      { id: 'executive', label: 'Executive Summary', icon: LayoutDashboard },
    ],
  },
  {
    title: 'Operations',
    items: [
      { id: 'patient', label: 'Patient', icon: UserRound },
      { id: 'appointment', label: 'Appointment', icon: CalendarDays },
      { id: 'doctor', label: 'Doctor', icon: Stethoscope },
      { id: 'bed', label: 'Bed Management', icon: BedDouble },
      { id: 'ot', label: 'Operation Theatre', icon: Scissors },
      { id: 'nurse', label: 'Nurse', icon: HeartPulse },
    ],
  },
  {
    title: 'Clinical',
    items: [
      { id: 'laboratory', label: 'Laboratory', icon: FlaskConical },
      { id: 'radiology', label: 'Radiology', icon: Scan },
      { id: 'pharmacy', label: 'Pharmacy & Medicines', icon: Pill },
      { id: 'inventory', label: 'Inventory', icon: Package },
    ],
  },
  {
    title: 'Finance',
    items: [
      { id: 'billing', label: 'Billing', icon: Receipt },
      { id: 'payment', label: 'Payments', icon: Wallet },
      { id: 'financial', label: 'Financial', icon: IndianRupee },
      { id: 'insurance', label: 'Insurance', icon: ShieldCheck },
    ],
  },
  {
    title: 'Governance',
    items: [
      { id: 'user-activity', label: 'User Activity', icon: Users },
      { id: 'employee', label: 'Employee', icon: UserCog },
      { id: 'security', label: 'Security', icon: Lock },
      { id: 'system', label: 'System', icon: Server },
    ],
  },
];

const ALL_SECTIONS = NAV_GROUPS.flatMap((g) => g.items);

const DETAIL_COLUMNS = {
  executive: [],
  'user-activity': [
    { key: 'name', header: 'Name' },
    { key: 'email', header: 'Email' },
    { key: 'role', header: 'Role' },
    { key: 'lastLogin', header: 'Last Login' },
    { key: 'failedLoginAttempts', header: 'Failed' },
    { key: 'locked', header: 'Locked' },
  ],
  patient: [
    { key: 'patientId', header: 'UHID' },
    { key: 'name', header: 'Name' },
    { key: 'gender', header: 'Gender' },
    { key: 'age', header: 'Age' },
    { key: 'phone', header: 'Phone' },
    { key: 'registeredAt', header: 'Registered' },
  ],
  appointment: [
    { key: 'date', header: 'Date' },
    { key: 'patient', header: 'Patient' },
    { key: 'patientId', header: 'UHID' },
    { key: 'doctor', header: 'Doctor' },
    { key: 'status', header: 'Status' },
  ],
  doctor: [
    { key: 'doctor', header: 'Doctor' },
    { key: 'opCount', header: 'OP' },
    { key: 'ipCount', header: 'IP' },
    { key: 'bills', header: 'Bills' },
    { key: 'revenue', header: 'Revenue', align: 'right' },
    { key: 'labCount', header: 'Lab' },
    { key: 'rxCount', header: 'Rx' },
  ],
  pharmacy: [
    { key: 'name', header: 'Medicine' },
    { key: 'qty', header: 'Qty Sold', align: 'right' },
    { key: 'revenue', header: 'Sales', align: 'right' },
    { key: 'cost', header: 'Cost', align: 'right' },
    { key: 'profit', header: 'Profit / Loss', align: 'right' },
    { key: 'margin', header: 'Margin', align: 'right' },
  ],
  inventory: [
    { key: 'name', header: 'Medicine' },
    { key: 'category', header: 'Category' },
    { key: 'currentStock', header: 'Stock', align: 'right' },
    { key: 'minimumStock', header: 'Minimum', align: 'right' },
    { key: 'reorderLevel', header: 'Reorder', align: 'right' },
  ],
  billing: [
    { key: 'billNumber', header: 'Bill #' },
    { key: 'type', header: 'Type' },
    { key: 'status', header: 'Status' },
    { key: 'total', header: 'Total', align: 'right' },
    { key: 'paid', header: 'Paid', align: 'right' },
    { key: 'due', header: 'Due', align: 'right' },
    { key: 'discount', header: 'Discount', align: 'right' },
    { key: 'date', header: 'Date' },
  ],
  payment: [
    { key: 'mode', header: 'Mode' },
    { key: 'count', header: 'Count', align: 'right' },
    { key: 'amount', header: 'Amount', align: 'right' },
  ],
  laboratory: [
    { key: 'labNumber', header: 'Lab #' },
    { key: 'patient', header: 'Patient' },
    { key: 'labType', header: 'Type' },
    { key: 'status', header: 'Status' },
    { key: 'priority', header: 'Priority' },
    { key: 'amount', header: 'Amount', align: 'right' },
    { key: 'date', header: 'Date' },
  ],
  radiology: [
    { key: 'labNumber', header: 'Order #' },
    { key: 'patient', header: 'Patient' },
    { key: 'modality', header: 'Modality' },
    { key: 'status', header: 'Status' },
    { key: 'amount', header: 'Amount', align: 'right' },
    { key: 'date', header: 'Date' },
  ],
  bed: [
    { key: 'bedNumber', header: 'Bed' },
    { key: 'ward', header: 'Ward' },
    { key: 'type', header: 'Type' },
    { key: 'status', header: 'Status' },
    { key: 'patient', header: 'Patient' },
    { key: 'dailyRate', header: 'Daily Rate', align: 'right' },
  ],
  nurse: [
    { key: 'admission', header: 'Admission' },
    { key: 'patient', header: 'Patient' },
    { key: 'medicine', header: 'Medicine' },
    { key: 'quantity', header: 'Qty', align: 'right' },
    { key: 'administeredAt', header: 'Administered' },
  ],
  ot: [
    { key: 'operationNumber', header: 'OT #' },
    { key: 'patient', header: 'Patient' },
    { key: 'surgeon', header: 'Surgeon' },
    { key: 'status', header: 'Status' },
    { key: 'scheduledDate', header: 'Scheduled' },
    { key: 'charges', header: 'Charges', align: 'right' },
  ],
  financial: [],
  insurance: [
    { key: 'billNumber', header: 'Bill #' },
    { key: 'patient', header: 'Patient' },
    { key: 'provider', header: 'Provider' },
    { key: 'claimNumber', header: 'Claim #' },
    { key: 'claimStatus', header: 'Status' },
    { key: 'approved', header: 'Approved', align: 'right' },
    { key: 'date', header: 'Date' },
  ],
  employee: [
    { key: 'name', header: 'Name' },
    { key: 'email', header: 'Email' },
    { key: 'role', header: 'Role' },
    { key: 'department', header: 'Department' },
    { key: 'isActive', header: 'Active' },
    { key: 'lastLogin', header: 'Last Login' },
  ],
  security: [
    { key: 'action', header: 'Action' },
    { key: 'user', header: 'User' },
    { key: 'email', header: 'Email' },
    { key: 'description', header: 'Description' },
    { key: 'ip', header: 'IP' },
    { key: 'date', header: 'Date' },
  ],
  system: [],
};

const MONEY_KEYS = new Set([
  'revenue', 'amount', 'total', 'paid', 'due', 'discount', 'charges', 'approved', 'dailyRate',
  'cost', 'profit',
]);
const DATE_KEYS = new Set([
  'date', 'lastLogin', 'registeredAt', 'administeredAt', 'scheduledDate',
]);
const RIGHT_ALIGN_KEYS = new Set([
  ...MONEY_KEYS, 'qty', 'count', 'opCount', 'ipCount', 'bills', 'labCount', 'rxCount',
  'currentStock', 'minimumStock', 'reorderLevel', 'quantity', 'failedLoginAttempts', 'margin',
]);

const presetRange = (id) => {
  const now = new Date();
  switch (id) {
    case 'today': return [startOfDay(now), endOfDay(now)];
    case '7d': return [startOfDay(subDays(now, 6)), endOfDay(now)];
    case 'thisMonth': return [startOfMonth(now), endOfDay(now)];
    case 'lastMonth': {
      const lm = subMonths(now, 1);
      return [startOfMonth(lm), endOfMonth(lm)];
    }
    default: return [startOfMonth(now), endOfDay(now)];
  }
};

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const formatKpiValue = (item) => {
  if (!item?.tracked || item.format === 'text') return item?.value ?? 'Not tracked yet';
  if (item.format === 'currency') return inr(item.value);
  if (item.format === 'percent') return `${item.value ?? 0}%`;
  return Number(item.value ?? 0).toLocaleString('en-IN');
};

const formatCell = (key, value) => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (DATE_KEYS.has(key) && value) {
    try { return format(new Date(value), 'dd MMM yyyy HH:mm'); } catch { return String(value); }
  }
  if (MONEY_KEYS.has(key) && typeof value === 'number') return inr(value);
  return String(value);
};

function Panel({ title, subtitle, children, flush }) {
  return (
    <section className="audit-panel">
      {(title || subtitle) && (
        <header className="audit-panel__head">
          <h3 className="audit-panel__title">{title}</h3>
          {subtitle && <p className="audit-panel__sub">{subtitle}</p>}
        </header>
      )}
      <div className={flush ? 'audit-panel__body--flush' : 'audit-panel__body'}>
        {children}
      </div>
    </section>
  );
}

function KpiGrid({ items }) {
  if (!items?.length) return null;
  return (
    <div className="audit-kpi-grid">
      {items.map((item) => {
        const muted = item.tracked === false;
        const isMoney = item.format === 'currency';
        const isNeg = isMoney && Number(item.value) < 0;
        const isPosMoney = isMoney && /profit|revenue|sales/i.test(item.label || '') && Number(item.value) > 0;
        return (
          <div key={item.key} className="audit-kpi">
            <p className="audit-kpi__label">{item.label}</p>
            <p
              className={`audit-kpi__value ${
                muted ? 'is-muted' : isNeg ? 'is-neg' : isPosMoney ? 'is-pos' : ''
              }`}
            >
              {formatKpiValue(item)}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function BreakdownPanel({ rows }) {
  if (!rows?.length) return null;
  return (
    <Panel title="Breakdown" subtitle="Period aggregates" flush>
      <div className="audit-table-wrap">
        <table className="audit-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Value</th>
              <th className="is-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.label}-${i}`}>
                <td>{r.label}</td>
                <td>
                  {r.format === 'currency' && typeof r.value === 'number' ? inr(r.value) : r.value}
                </td>
                <td className="is-right">{r.amount != null ? inr(r.amount) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function DetailTable({ columns, rows, title = 'Detail register' }) {
  if (!columns?.length) return null;
  return (
    <Panel title={title} subtitle={`${rows?.length || 0} record(s)`} flush>
      {!rows?.length ? (
        <p className="audit-empty">No records for this period</p>
      ) : (
        <div className="audit-table-wrap">
          <table className="audit-table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th
                    key={c.key}
                    className={c.align === 'right' || RIGHT_ALIGN_KEYS.has(c.key) ? 'is-right' : ''}
                  >
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  {columns.map((c) => {
                    const right = c.align === 'right' || RIGHT_ALIGN_KEYS.has(c.key);
                    const profitTone = c.key === 'profit' && typeof row[c.key] === 'number'
                      ? (row[c.key] >= 0 ? 'is-pos' : 'is-neg')
                      : '';
                    return (
                      <td key={c.key} className={`${right ? 'is-right' : ''} ${profitTone}`}>
                        {formatCell(c.key, row[c.key])}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function ExecutiveScorecard({ kpis = [] }) {
  if (!kpis.length) return null;
  return (
    <Panel title="Executive Scorecard" subtitle="Board-level hospital KPIs" flush>
      <div className="audit-table-wrap">
        <table className="audit-table">
          <thead>
            <tr>
              <th>Metric</th>
              <th className="is-right">Value</th>
            </tr>
          </thead>
          <tbody>
            {kpis.map((k) => (
              <tr key={k.key}>
                <td>{k.label}</td>
                <td className="is-right" style={{ fontWeight: 600 }}>{formatKpiValue(k)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function MedicinePnlCard({ pnl }) {
  if (!pnl) return null;
  const profit = Number(pnl.netProfit || 0);
  const isProfit = profit >= 0;
  return (
    <div className="audit-pnl">
      <div className="audit-pnl__head">
        <div>
          <div className="audit-pnl__head-title">Medicine Profit &amp; Loss Statement</div>
          <div className="audit-pnl__head-sub">Sales − COGS − expired / disposed loss</div>
        </div>
        <div className="audit-pnl__result">
          {isProfit ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
          {isProfit ? 'Net Profit' : 'Net Loss'} · {inr(Math.abs(profit))}
          <span style={{ opacity: 0.65, fontWeight: 500 }}>· Margin {pnl.marginPct ?? 0}%</span>
        </div>
      </div>
      <div className="audit-pnl__body">
        <div className="audit-pnl__row">
          <span>Medicine sales (revenue)</span>
          <span>{inr(pnl.revenue)}</span>
        </div>
        <div className="audit-pnl__row">
          <span>Less: Cost of goods sold</span>
          <span>{inr(pnl.cogs)}</span>
        </div>
        <div className="audit-pnl__row is-total">
          <span>Gross profit</span>
          <span className={pnl.grossProfit >= 0 ? 'is-pos' : 'is-neg'}>{inr(pnl.grossProfit)}</span>
        </div>
        <div className="audit-pnl__row">
          <span>Less: Expired / disposed loss</span>
          <span className="is-warn">{inr(pnl.expiredLoss)}</span>
        </div>
        <div className="audit-pnl__row is-net">
          <span>Net profit / (loss)</span>
          <span>{inr(pnl.netProfit)}</span>
        </div>
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const [section, setSection] = useState('executive');
  const [preset, setPreset] = useState('thisMonth');
  const [applied, setApplied] = useState(() => {
    const [from, to] = presetRange('thisMonth');
    return { from, to };
  });
  const [draft, setDraft] = useState(applied);

  const handlePreset = (id) => {
    setPreset(id);
    const [from, to] = presetRange(id);
    setDraft({ from, to });
    setApplied({ from, to });
  };

  const applyCustom = () => {
    setPreset('custom');
    setApplied(draft);
  };

  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ['auditReport', section, applied.from, applied.to],
    queryFn: () => reportsApi.getAuditSection(section, applied),
    placeholderData: keepPreviousData,
  });

  const columns = DETAIL_COLUMNS[section] || [];
  const sectionMeta = ALL_SECTIONS.find((s) => s.id === section);
  const groupTitle = NAV_GROUPS.find((g) => g.items.some((i) => i.id === section))?.title;

  const exportRows = useMemo(() => {
    if (data?.details?.length && columns.length) {
      return data.details.map((row) => {
        const out = {};
        columns.forEach((c) => { out[c.key] = formatCell(c.key, row[c.key]); });
        return out;
      });
    }
    return (data?.kpis || []).map((k) => ({
      metric: k.label,
      value: formatKpiValue(k),
    }));
  }, [data, columns]);

  const exportColumns = useMemo(() => {
    if (data?.details?.length && columns.length) return columns;
    return [
      { key: 'metric', header: 'Metric' },
      { key: 'value', header: 'Value' },
    ];
  }, [data, columns]);

  const handleExport = () => {
    const rangeLabel = `${format(applied.from, 'yyyy-MM-dd')}_to_${format(applied.to, 'yyyy-MM-dd')}`;
    exportToCSV(exportRows, exportColumns, `audit-${section}-${rangeLabel}`);
  };

  const handlePrint = () => {
    printSection('audit-print-area', `Audit Reports — ${sectionMeta?.label || section}`);
  };

  return (
    <div className="audit-shell space-y-3">
      <header className="audit-masthead">
        <div>
          <p className="audit-masthead__eyebrow">Sri Sanjeevi Hospital · Governance</p>
          <h1 className="audit-masthead__title">Audit Reports</h1>
          <p className="audit-masthead__sub">
            Institutional performance, clinical operations, pharmacy P&amp;L, and compliance controls
          </p>
        </div>
        <div className="audit-masthead__meta">
          <span className="audit-masthead__stamp">Confidential · Internal use</span>
          <div className="audit-actions">
            <button type="button" onClick={handleExport} className="audit-btn audit-btn--ghost">
              <FileSpreadsheet size={13} /> Export CSV
            </button>
            <button type="button" onClick={handlePrint} className="audit-btn audit-btn--ghost">
              <Printer size={13} /> Print
            </button>
            <button type="button" onClick={() => refetch()} className="audit-btn audit-btn--solid">
              <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
        </div>
      </header>

      <div className="audit-period">
        <div className="audit-period__label">
          <CalendarRange size={14} />
          Reporting period
        </div>
        <div className="audit-period__presets">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => handlePreset(p.id)}
              className={`audit-period__preset ${preset === p.id ? 'is-active' : ''}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="audit-period__dates">
          <input
            type="date"
            value={format(draft.from, 'yyyy-MM-dd')}
            onChange={(e) => {
              setPreset('custom');
              setDraft((d) => ({ ...d, from: startOfDay(new Date(e.target.value)) }));
            }}
          />
          <span style={{ fontSize: 11, color: 'var(--ar-muted)' }}>to</span>
          <input
            type="date"
            value={format(draft.to, 'yyyy-MM-dd')}
            onChange={(e) => {
              setPreset('custom');
              setDraft((d) => ({ ...d, to: endOfDay(new Date(e.target.value)) }));
            }}
          />
          <button type="button" onClick={applyCustom} className="audit-period__apply">
            Apply
          </button>
        </div>
      </div>

      <div className="audit-workspace">
        <aside className="audit-rail">
          <div className="audit-rail__head">
            <span>Audit modules</span>
          </div>
          <nav className="audit-rail__nav">
            {NAV_GROUPS.map((group) => (
              <div key={group.title} className="audit-rail__group">
                <p className="audit-rail__group-title">{group.title}</p>
                {group.items.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSection(id)}
                    className={`audit-rail__item ${section === id ? 'is-active' : ''}`}
                  >
                    <Icon size={13} strokeWidth={2} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            ))}
          </nav>
        </aside>

        <div id="audit-print-area" className="audit-content">
          <div className="audit-section-head">
            <div>
              <p className="audit-section-head__crumb">{groupTitle || 'Audit'}</p>
              <h2 className="audit-section-head__title">{sectionMeta?.label || section}</h2>
              <p className="audit-section-head__range">
                {format(applied.from, 'd MMM yyyy')} — {format(applied.to, 'd MMM yyyy')}
                {isFetching && <span className="audit-section-head__live">Updating…</span>}
              </p>
            </div>
            <span className="audit-section-head__badge">
              Generated {format(new Date(), 'd MMM yyyy · HH:mm')}
            </span>
          </div>

          {isLoading && !data ? (
            <div className="py-16 flex justify-center"><LoadingSpinner /></div>
          ) : error ? (
            <div className="audit-error">
              <AlertCircle className="mx-auto mb-2" size={22} color="#b91c1c" />
              <p>Failed to load audit data</p>
              <span>{error?.response?.data?.message || error.message}</span>
            </div>
          ) : (
            <>
              {section === 'executive' && <ExecutiveScorecard kpis={data?.kpis || []} />}
              {section === 'pharmacy' && <MedicinePnlCard pnl={data?.pnl} />}
              {section !== 'executive' && <KpiGrid items={data?.kpis || []} />}

              <div className="audit-split">
                <BreakdownPanel rows={data?.breakdown || []} />
                {(data?.footnotes || []).length > 0 && (
                  <Panel title="Data coverage notes">
                    <ul className="audit-notes">
                      {data.footnotes.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  </Panel>
                )}
              </div>

              <DetailTable
                columns={columns}
                rows={data?.details || []}
                title={section === 'pharmacy' ? 'Medicine-wise Profit / Loss' : 'Detail register'}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
