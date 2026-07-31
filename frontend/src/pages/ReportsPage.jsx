import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Users, BedDouble, LogIn, LogOut, Wallet, Receipt, FlaskConical, Pill,
  ShieldCheck, FileDown, FileSpreadsheet, Printer, RefreshCw, Search, ChevronDown,
  Clock, Stethoscope, TestTube2, IndianRupee, ClipboardList, CalendarDays,
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import {
  startOfDay, endOfDay, subDays, startOfMonth, endOfMonth, subMonths, startOfYear, format,
} from 'date-fns';
import api from '../services/api';
import reportsApi from '../services/reportsApi';
import patientProfileApi from '../services/patientProfileApi';
import DataTable from '../components/common/DataTable';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { exportToCSV, printSection } from '../utils/exportUtils';

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4'];
const PAYMENT_COLORS = { cash: '#3b82f6', upi: '#22c55e', card: '#f59e0b', insurance: '#8b5cf6', cheque: '#ef4444', online: '#06b6d4' };

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const shortDate = (d) => format(new Date(d), 'd MMM');

const PRESETS = ['Today', 'Yesterday', 'Last 7 Days', 'This Month', 'Last Month', 'This Year', 'Custom Range'];

const presetRange = (preset) => {
  const now = new Date();
  switch (preset) {
    case 'Today': return [startOfDay(now), endOfDay(now)];
    case 'Yesterday': { const y = subDays(now, 1); return [startOfDay(y), endOfDay(y)]; }
    case 'Last 7 Days': return [startOfDay(subDays(now, 6)), endOfDay(now)];
    case 'This Month': return [startOfMonth(now), endOfDay(now)];
    case 'Last Month': { const lm = subMonths(now, 1); return [startOfMonth(lm), endOfMonth(lm)]; }
    case 'This Year': return [startOfYear(now), endOfDay(now)];
    default: return [startOfDay(subDays(now, 6)), endOfDay(now)];
  }
};

function Panel({ title, action, children, className = '' }) {
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900 dark:text-white text-sm">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function KpiCard({ icon: Icon, color, label, value, change, sub }) {
  const up = change >= 0;
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
      <div className="flex items-center justify-between">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${color}1a`, color }}>
          <Icon size={18} />
        </div>
        {change !== undefined && change !== null && (
          <span className={`text-xs font-semibold ${up ? 'text-green-600' : 'text-red-500'}`}>
            {up ? '↑' : '↓'} {Math.abs(change)}%
          </span>
        )}
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mt-3">{label}</p>
      <p className="text-xl font-bold text-gray-900 dark:text-white mt-0.5">{value}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function ReportsPage() {
  const [preset, setPreset] = useState('This Month');
  const [applied, setApplied] = useState(() => {
    const [f, t] = presetRange('This Month');
    return { from: f, to: t };
  });
  const [draft, setDraft] = useState(applied);
  const [detailPage, setDetailPage] = useState(1);

  const [patientQuery, setPatientQuery] = useState('');
  const [selectedPatient, setSelectedPatient] = useState(null);

  const handlePreset = (p) => {
    setPreset(p);
    if (p !== 'Custom Range') {
      const [f, t] = presetRange(p);
      setDraft({ from: f, to: t });
      setApplied({ from: f, to: t });
      setDetailPage(1);
    }
  };

  const generateReport = () => {
    setApplied(draft);
    setDetailPage(1);
  };

  const { data: summary, isLoading: loadingSummary, refetch: refetchSummary } = useQuery({
    queryKey: ['reportsSummary', applied.from, applied.to],
    queryFn: () => reportsApi.getSummary(applied.from, applied.to),
  });

  const { data: detailed, isLoading: loadingDetailed, refetch: refetchDetailed } = useQuery({
    queryKey: ['reportsDetailed', applied.from, applied.to, detailPage],
    queryFn: () => reportsApi.getDetailed(applied.from, applied.to, detailPage, 10),
  });

  const { data: patientResults } = useQuery({
    queryKey: ['reportsPatientSearch', patientQuery],
    queryFn: () => api.get(`/patients/search?q=${encodeURIComponent(patientQuery)}`).then((r) => r.data.data),
    enabled: patientQuery.trim().length >= 2,
  });

  const { data: selectedSummary } = useQuery({
    queryKey: ['reportsPatientSummary', selectedPatient?._id],
    queryFn: () => patientProfileApi.getSummary(selectedPatient._id),
    enabled: !!selectedPatient,
  });

  const { data: selectedTimeline, isLoading: loadingTimeline } = useQuery({
    queryKey: ['reportsPatientTimeline', selectedPatient?._id],
    queryFn: () => patientProfileApi.getTimeline(selectedPatient._id),
    enabled: !!selectedPatient,
  });

  const k = summary?.kpis || {};
  const bedOcc = summary?.bedOccupancy || {};

  const kpiCards = [
    { icon: Users, color: '#3b82f6', label: 'OP Count', value: k.opCount?.value ?? 0, change: k.opCount?.change },
    { icon: BedDouble, color: '#06b6d4', label: 'IP Count', value: k.ipCount?.value ?? 0, change: k.ipCount?.change },
    { icon: LogIn, color: '#22c55e', label: 'Admissions', value: k.admissions?.value ?? 0, change: k.admissions?.change },
    { icon: LogOut, color: '#f59e0b', label: 'Discharges', value: k.discharges?.value ?? 0, change: k.discharges?.change },
    { icon: Wallet, color: '#2563eb', label: 'Revenue', value: inr(k.revenue?.value), change: k.revenue?.change },
    { icon: Receipt, color: '#eab308', label: 'Pending Bills', value: inr(k.pendingBills?.value) },
    { icon: FlaskConical, color: '#8b5cf6', label: 'Lab Tests', value: k.labTests?.value ?? 0, change: k.labTests?.change },
    { icon: Pill, color: '#10b981', label: 'Pharmacy Sales', value: inr(k.pharmacySales?.value), change: k.pharmacySales?.change },
    { icon: BedDouble, color: '#ef4444', label: 'Bed Occupancy', value: `${k.bedOccupancy?.value ?? 0}%`, sub: `${k.bedOccupancy?.occupied ?? 0}/${k.bedOccupancy?.total ?? 0} beds` },
    { icon: ShieldCheck, color: '#0ea5e9', label: 'Insurance Claims', value: inr(k.insuranceClaims?.value), change: k.insuranceClaims?.change },
  ];

  const detailColumns = [
    { key: 'date', header: 'Date', render: (r) => format(new Date(r.date), 'dd MMM yyyy') },
    { key: 'opCount', header: 'OP Count' },
    { key: 'admissions', header: 'Admissions' },
    { key: 'discharges', header: 'Discharges' },
    { key: 'revenue', header: 'Revenue', render: (r) => inr(r.revenue) },
    { key: 'labTests', header: 'Lab Tests' },
    { key: 'pharmacySales', header: 'Pharmacy Sales', render: (r) => inr(r.pharmacySales) },
    { key: 'pendingBills', header: 'Pending Bills', render: (r) => inr(r.pendingBills) },
  ];

  const handleExportExcel = () => {
    exportToCSV(detailed?.data || [], [
      { key: 'date', header: 'Date' },
      { key: 'opCount', header: 'OP Count' },
      { key: 'admissions', header: 'Admissions' },
      { key: 'discharges', header: 'Discharges' },
      { key: 'revenue', header: 'Revenue' },
      { key: 'labTests', header: 'Lab Tests' },
      { key: 'pharmacySales', header: 'Pharmacy Sales' },
      { key: 'pendingBills', header: 'Pending Bills' },
    ], `reports-${format(applied.from, 'yyyy-MM-dd')}_to_${format(applied.to, 'yyyy-MM-dd')}`);
  };

  const handlePrint = () => printSection('reports-print-area', 'Reports & Business Intelligence');

  const handleRefresh = () => { refetchSummary(); refetchDetailed(); };

  const timelineByDay = useMemo(() => {
    const groups = {};
    (selectedTimeline || []).forEach((ev) => {
      const day = format(new Date(ev.date), 'd MMM yyyy');
      groups[day] = groups[day] || [];
      groups[day].push(ev);
    });
    return groups;
  }, [selectedTimeline]);

  const eventIcon = (type) => {
    switch (type) {
      case 'OP Visit': return Stethoscope;
      case 'Admission': case 'Discharge': case 'Room Transfer': return BedDouble;
      case 'Lab Test': return TestTube2;
      case 'Medicine': return Pill;
      case 'Bill': case 'Payment': return IndianRupee;
      case 'Operation': return ClipboardList;
      default: return Clock;
    }
  };

  return (
    <div className="space-y-6" id="reports-print-area">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Reports &amp; Business Intelligence</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Real-time analytics and comprehensive reporting</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={handlePrint} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
            <FileDown size={15} /> Export PDF
          </button>
          <button onClick={handleExportExcel} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
            <FileSpreadsheet size={15} /> Export Excel
          </button>
          <button onClick={handlePrint} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
            <Printer size={15} /> Print
          </button>
          <button onClick={handleRefresh} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
            <RefreshCw size={15} /> Refresh
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl p-3 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => handlePreset(p)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${preset === p ? 'bg-blue-600 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
          >
            {p}
          </button>
        ))}
        <div className="flex items-center gap-2 ml-auto flex-wrap">
          <label className="text-xs text-gray-500">From</label>
          <input
            type="date"
            value={format(draft.from, 'yyyy-MM-dd')}
            onChange={(e) => { setPreset('Custom Range'); setDraft((d) => ({ ...d, from: startOfDay(new Date(e.target.value)) })); }}
            className="input-field w-40 !py-1.5 text-sm"
          />
          <label className="text-xs text-gray-500">To</label>
          <input
            type="date"
            value={format(draft.to, 'yyyy-MM-dd')}
            onChange={(e) => { setPreset('Custom Range'); setDraft((d) => ({ ...d, to: endOfDay(new Date(e.target.value)) })); }}
            className="input-field w-40 !py-1.5 text-sm"
          />
          <button onClick={generateReport} className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
            Generate Report
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6 items-start">
        <div className="space-y-6 min-w-0">
          {loadingSummary ? <LoadingSpinner /> : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                {kpiCards.map((c) => <KpiCard key={c.label} {...c} />)}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Panel title={`Revenue Trend (${format(applied.from, 'd MMM')} - ${format(applied.to, 'd MMM')})`} className="lg:col-span-1">
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={summary?.revenueTrend || []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={shortDate} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
                      <Tooltip formatter={(v) => inr(v)} labelFormatter={shortDate} />
                      <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </Panel>

                <Panel title="OP vs IP Trend">
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={summary?.opVsIpTrend || []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={shortDate} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip labelFormatter={shortDate} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Area type="monotone" dataKey="opCount" name="OP Count" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.25} />
                      <Area type="monotone" dataKey="ipCount" name="IP Count" stroke="#22c55e" fill="#22c55e" fillOpacity={0.25} />
                    </AreaChart>
                  </ResponsiveContainer>
                </Panel>

                <Panel title="Department Revenue" action={<span className="text-xs text-gray-400 flex items-center gap-1">This Range <ChevronDown size={12} /></span>}>
                  <div className="space-y-3">
                    {(summary?.departmentRevenue || []).length === 0 && <p className="text-sm text-gray-400 text-center py-8">No data</p>}
                    {(summary?.departmentRevenue || []).map((d, i) => {
                      const max = summary.departmentRevenue[0]?.revenue || 1;
                      return (
                        <div key={d.name}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-gray-600 dark:text-gray-300 font-medium">{d.name}</span>
                            <span className="text-gray-900 dark:text-white font-semibold">{inr(d.revenue)}</span>
                          </div>
                          <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${(d.revenue / max) * 100}%`, background: COLORS[i % COLORS.length] }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Panel>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Panel title="Doctor Performance (Consultations)" action={<span className="text-xs text-gray-400 flex items-center gap-1">This Range <ChevronDown size={12} /></span>}>
                  <div className="space-y-3">
                    {(summary?.doctorPerformance || []).length === 0 && <p className="text-sm text-gray-400 text-center py-8">No data</p>}
                    {(summary?.doctorPerformance || []).map((d, i) => (
                      <div key={d._id || i} className="flex items-center gap-3">
                        <span className="w-5 text-xs text-gray-400 font-semibold">{i + 1}</span>
                        <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
                          {(d.doctorName || '?').split(' ').map((w) => w[0]).slice(0, 2).join('')}
                        </div>
                        <span className="flex-1 text-sm text-gray-700 dark:text-gray-200 truncate">{d.doctorName}</span>
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">{d.count}</span>
                      </div>
                    ))}
                  </div>
                </Panel>

                <Panel title="Payment Mode Distribution">
                  <div className="flex items-center gap-4">
                    <ResponsiveContainer width="55%" height={180}>
                      <PieChart>
                        <Pie
                          data={summary?.paymentModeDistribution || []}
                          dataKey="amount" nameKey="mode" innerRadius={45} outerRadius={75} paddingAngle={2}
                        >
                          {(summary?.paymentModeDistribution || []).map((p, i) => (
                            <Cell key={p.mode} fill={PAYMENT_COLORS[p.mode] || COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v) => inr(v)} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-2 flex-1 min-w-0">
                      {(summary?.paymentModeDistribution || []).map((p, i) => (
                        <div key={p.mode} className="flex items-center gap-2 text-xs">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: PAYMENT_COLORS[p.mode] || COLORS[i % COLORS.length] }} />
                          <span className="capitalize text-gray-600 dark:text-gray-300 flex-1 truncate">{p.mode}</span>
                          <span className="text-gray-400">{p.percent}%</span>
                        </div>
                      ))}
                      {(summary?.paymentModeDistribution || []).length === 0 && <p className="text-sm text-gray-400">No data</p>}
                    </div>
                  </div>
                </Panel>

                <Panel title="Admissions vs Discharges">
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={summary?.admissionsVsDischarges || []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={shortDate} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip labelFormatter={shortDate} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="admissions" name="Admissions" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="discharges" name="Discharges" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Panel>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <Panel title="Pharmacy Sales">
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={summary?.pharmacySalesTrend || []}>
                      <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={shortDate} />
                      <YAxis tick={{ fontSize: 9 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
                      <Tooltip formatter={(v) => inr(v)} labelFormatter={shortDate} />
                      <Bar dataKey="sales" fill="#10b981" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Panel>

                <Panel title="Lab Tests Trend">
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={summary?.labTestsTrend || []}>
                      <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={shortDate} />
                      <YAxis tick={{ fontSize: 9 }} />
                      <Tooltip labelFormatter={shortDate} />
                      <Line type="monotone" dataKey="tests" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 2 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </Panel>

                <Panel title="Monthly Patient Growth">
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={summary?.monthlyPatientGrowth || []}>
                      <XAxis dataKey="month" tick={{ fontSize: 9 }} tickFormatter={(v) => format(new Date(`${v}-01`), 'MMM')} />
                      <YAxis tick={{ fontSize: 9 }} />
                      <Tooltip labelFormatter={(v) => format(new Date(`${v}-01`), 'MMM yyyy')} />
                      <Line type="monotone" dataKey="count" stroke="#f59e0b" strokeWidth={2} dot={{ r: 2 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </Panel>

                <Panel title="Bed Occupancy">
                  <div className="relative flex items-center justify-center">
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie
                          data={[
                            { name: 'Occupied', value: bedOcc.occupied || 0 },
                            { name: 'Available', value: bedOcc.available || 0 },
                            { name: 'Other', value: (bedOcc.cleaning || 0) + (bedOcc.maintenance || 0) + (bedOcc.reserved || 0) },
                          ]}
                          dataKey="value" innerRadius={50} outerRadius={75} paddingAngle={2}
                        >
                          <Cell fill="#3b82f6" />
                          <Cell fill="#22c55e" />
                          <Cell fill="#e5e7eb" />
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute text-center">
                      <p className="text-xl font-bold text-gray-900 dark:text-white">{bedOcc.occupiedPercent ?? 0}%</p>
                      <p className="text-[10px] text-gray-400">Occupied</p>
                    </div>
                  </div>
                </Panel>
              </div>
            </>
          )}

          <Panel title="Detailed Report - OP Summary" action={
            <div className="flex items-center gap-2">
              <button onClick={handleExportExcel} className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-1">
                <FileSpreadsheet size={13} /> Export
              </button>
            </div>
          }>
            {loadingDetailed ? <LoadingSpinner /> : (
              <DataTable
                columns={detailColumns}
                data={detailed?.data || []}
                page={detailed?.pagination?.page || 1}
                pages={detailed?.pagination?.totalPages || 1}
                onPageChange={setDetailPage}
              />
            )}
          </Panel>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 xl:sticky xl:top-4 space-y-4">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white text-sm">History Center</h3>
            <p className="text-xs text-gray-400">Patient Activity Timeline</p>
          </div>

          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={patientQuery}
              onChange={(e) => { setPatientQuery(e.target.value); setSelectedPatient(null); }}
              placeholder="Search by Name / UHID / Mobile"
              className="input-field !pl-9 w-full text-sm"
            />
          </div>

          {patientQuery.trim().length >= 2 && !selectedPatient && (
            <div className="border border-gray-100 dark:border-gray-700 rounded-xl divide-y divide-gray-50 dark:divide-gray-700 max-h-56 overflow-y-auto">
              {(patientResults || []).length === 0 && (
                <p className="text-xs text-gray-400 text-center py-4">No patients found</p>
              )}
              {(patientResults || []).map((p) => (
                <button
                  key={p._id}
                  onClick={() => { setSelectedPatient(p); setPatientQuery(p.name); }}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-between"
                >
                  <span>
                    <span className="block text-sm font-medium text-gray-800 dark:text-gray-100">{p.name}</span>
                    <span className="block text-[11px] text-gray-400">{p.patientId} · {p.phone}</span>
                  </span>
                  <span className="text-[11px] text-gray-400">{p.age}{p.gender?.[0]}</span>
                </button>
              ))}
            </div>
          )}

          {selectedPatient && (
            <>
              <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {(selectedPatient.name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('')}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{selectedPatient.name}</p>
                    <p className="text-[11px] text-gray-500">UHID: {selectedPatient.patientId}{selectedSummary?.currentStatus ? ` · ${selectedSummary.currentStatus}` : ''}</p>
                  </div>
                </div>
                <a href={`/patients/${selectedPatient._id}/profile`} className="text-[11px] font-medium bg-white dark:bg-gray-800 border border-blue-200 dark:border-gray-600 text-blue-600 px-2.5 py-1.5 rounded-lg flex-shrink-0 whitespace-nowrap hover:bg-blue-50">
                  View Patient
                </a>
              </div>

              <div>
                <p className="text-xs font-semibold text-blue-600 mb-2">Timeline</p>
                {loadingTimeline ? <LoadingSpinner /> : (
                  <div className="space-y-4 max-h-[520px] overflow-y-auto pr-1">
                    {Object.keys(timelineByDay).length === 0 && (
                      <p className="text-xs text-gray-400 text-center py-6">No activity recorded</p>
                    )}
                    {Object.entries(timelineByDay).map(([day, events]) => (
                      <div key={day}>
                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">{day}</p>
                        <div className="space-y-3 border-l border-gray-100 dark:border-gray-700 ml-3">
                          {events.map((ev, i) => {
                            const Icon = eventIcon(ev.type);
                            return (
                              <div key={i} className="relative pl-5">
                                <span className="absolute -left-[9px] top-0.5 w-4 h-4 rounded-full bg-blue-50 dark:bg-blue-900/40 text-blue-600 flex items-center justify-center">
                                  <Icon size={9} />
                                </span>
                                <p className="text-[11px] text-gray-400">{format(new Date(ev.date), 'hh:mm a')}</p>
                                <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{ev.title}</p>
                                {ev.subtitle && <p className="text-[11px] text-gray-400">{ev.subtitle}</p>}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {!selectedPatient && patientQuery.trim().length < 2 && (
            <div className="text-center py-10">
              <CalendarDays className="mx-auto text-gray-300 dark:text-gray-600" size={30} />
              <p className="text-xs text-gray-400 mt-2">Search a patient to view their activity timeline</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
