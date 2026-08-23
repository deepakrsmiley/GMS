import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Package, AlertTriangle, TrendingDown, TrendingUp, Clock, XCircle,
  IndianRupee, BarChart3, Activity, Download, FileSpreadsheet,
  RefreshCw, ShieldAlert, Boxes, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import toast from 'react-hot-toast';
import api from '../../services/api';
import LoadingSpinner from '../common/LoadingSpinner';
import InventoryAlertModal from './InventoryAlertModal';
import {
  CorpChartCard,
  CorpEmptyChart,
  CorpAreaGradient,
  CorpBarGradient,
  corpTooltipStyle,
  axisProps,
  CORP_BLUE,
  CORP_EMERALD,
  CORP_AMBER,
  CORP_ROSE,
  CORP_INDIGO,
} from '../common/CorpCharts';

const fmtCurrency = (n) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const fmtNum = (n) => Number(n || 0).toLocaleString('en-IN');
const fmtTime = (d) =>
  new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
const fmtDateTime = (d) =>
  d
    ? new Date(d).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

const STOCK_HEALTH = [
  {
    key: 'totalMedicines',
    label: 'SKU Count',
    sub: 'Active medicines',
    icon: Package,
    accent: 'border-l-blue-500',
    iconBg: 'bg-slate-100 text-slate-700',
  },
  {
    key: 'availableStock',
    label: 'Units In Stock',
    sub: 'Available quantity',
    icon: Boxes,
    accent: 'border-l-emerald-500',
    iconBg: 'bg-emerald-50 text-emerald-700',
  },
  {
    key: 'lowStock',
    label: 'Low Stock',
    sub: 'Below minimum',
    icon: AlertTriangle,
    accent: 'border-l-amber-500',
    iconBg: 'bg-amber-50 text-amber-700',
    alert: 'low_stock',
  },
  {
    key: 'outOfStock',
    label: 'Out Of Stock',
    sub: 'Needs reorder',
    icon: XCircle,
    accent: 'border-l-red-500',
    iconBg: 'bg-red-50 text-red-700',
    alert: 'out_of_stock',
  },
  {
    key: 'expiringSoon',
    label: 'Expiring (30d)',
    sub: 'Near expiry batches',
    icon: Clock,
    accent: 'border-l-orange-500',
    iconBg: 'bg-orange-50 text-orange-700',
    alert: 'expiring',
  },
  {
    key: 'expired',
    label: 'Expired',
    sub: 'Dispose / quarantine',
    icon: TrendingDown,
    accent: 'border-l-rose-600',
    iconBg: 'bg-rose-50 text-rose-700',
    alert: 'expired',
  },
];

const FINANCIAL_OPS = [
  {
    key: 'totalInventoryValue',
    label: 'Inventory Value',
    icon: IndianRupee,
    format: fmtCurrency,
    tone: 'text-slate-900',
  },
  {
    key: 'monthlyPurchaseValue',
    label: 'Purchases (MTD)',
    icon: TrendingUp,
    format: fmtCurrency,
    tone: 'text-blue-700',
  },
  {
    key: 'monthlyDispensingValue',
    label: 'Dispensed (MTD)',
    icon: TrendingDown,
    format: fmtCurrency,
    tone: 'text-indigo-700',
  },
  {
    key: 'todayDispensed',
    label: "Today's Issues",
    icon: Activity,
    format: fmtNum,
    tone: 'text-slate-800',
  },
  {
    key: 'todayStockAdded',
    label: "Today's Receipts",
    icon: Package,
    format: fmtNum,
    tone: 'text-slate-800',
  },
];

const REPORT_TYPES = [
  { id: 'today-stock-in', label: "Today's Stock Added", desc: 'Batches received today' },
  { id: 'today-dispensing', label: 'Daily Dispensed', desc: "Medicines issued today" },
  { id: 'low-stock', label: 'Low Stock', desc: 'Below reorder level' },
  { id: 'out-of-stock', label: 'Out Of Stock', desc: 'Zero balance SKUs' },
  { id: 'expiry', label: 'Near Expiry', desc: 'Next 30 days' },
  { id: 'expired', label: 'Expired', desc: 'Past expiry batches' },
  { id: 'valuation', label: 'Valuation', desc: 'Stock value summary' },
  { id: 'supplier-purchase', label: 'Purchases', desc: 'By supplier' },
  { id: 'dispensing', label: 'Dispensing', desc: 'Issue register' },
  { id: 'stock-movement', label: 'Movements', desc: 'In / out ledger' },
];

const ALERT_META = {
  low_stock: { label: 'Low Stock', color: 'bg-amber-500', text: 'text-amber-800', bg: 'bg-amber-50 border-amber-200' },
  out_of_stock: { label: 'Out Of Stock', color: 'bg-red-500', text: 'text-red-800', bg: 'bg-red-50 border-red-200' },
  expiring: { label: 'Expiring Soon', color: 'bg-orange-500', text: 'text-orange-800', bg: 'bg-orange-50 border-orange-200' },
  expired: { label: 'Expired Stock', color: 'bg-rose-600', text: 'text-rose-800', bg: 'bg-rose-50 border-rose-200' },
};

export default function PharmacyInventoryDashboard({ children }) {
  const qc = useQueryClient();
  const [alertModal, setAlertModal] = useState(null);
  const [alertData, setAlertData] = useState([]);
  const [downloading, setDownloading] = useState(null);

  const { data: dash, isLoading, dataUpdatedAt, refetch, isFetching } = useQuery({
    queryKey: ['pharmaInventoryDash'],
    queryFn: () => api.get('/pharmacy/dashboard').then((r) => r.data.data),
    refetchInterval: 60000,
  });

  const openAlert = async (type) => {
    const endpoints = {
      low_stock: '/pharmacy/low-stock',
      out_of_stock: '/pharmacy/out-of-stock',
      expiring: '/pharmacy/expiring?days=30',
      expired: '/pharmacy/expired',
    };
    try {
      const res = await api.get(endpoints[type]);
      setAlertData(res.data.data || []);
      setAlertModal(type);
    } catch {
      toast.error('Failed to load alert data');
    }
  };

  const downloadReport = async (type, format) => {
    const key = `${type}-${format}`;
    setDownloading(key);
    try {
      const res = await api.get(`/pharmacy/reports/${type}?format=${format}`, {
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type}-report.${format === 'excel' ? 'xlsx' : 'pdf'}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Report download failed');
    } finally {
      setDownloading(null);
    }
  };

  if (isLoading) return <LoadingSpinner />;

  const cards = dash?.cards || {};
  const charts = dash?.charts || {};
  const alerts = dash?.alerts || [];
  const criticalCount =
    Number(cards.outOfStock || 0) +
    Number(cards.expired || 0) +
    Number(cards.lowStock || 0) +
    Number(cards.expiringSoon || 0);

  const consumptionData = (charts.monthlyConsumption || []).map((r) => ({
    month: String(r._id || '').slice(5) || r._id,
    consumption: r.qty,
    value: r.value,
  }));
  const purchaseData = (charts.monthlyPurchases || []).map((r) => ({
    month: String(r._id || '').slice(5) || r._id,
    purchases: r.qty,
    value: r.value,
  }));
  const topDispensed = (charts.topDispensedMedicines || []).slice(0, 8).map((r) => ({
    ...r,
    name: r.name?.length > 18 ? `${r.name.slice(0, 16)}…` : r.name,
  }));

  const stockMix = [
    { name: 'Healthy', value: Math.max(0, Number(cards.totalMedicines || 0) - Number(cards.lowStock || 0) - Number(cards.outOfStock || 0)), color: CORP_EMERALD },
    { name: 'Low Stock', value: Number(cards.lowStock || 0), color: CORP_AMBER },
    { name: 'Out of Stock', value: Number(cards.outOfStock || 0), color: CORP_ROSE },
  ].filter((d) => d.value > 0);
  const stockMixTotal = stockMix.reduce((s, d) => s + d.value, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white dark:bg-gray-800 border border-blue-100 dark:border-gray-700 rounded-xl px-5 py-4">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center">
            <BarChart3 size={18} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white tracking-tight">
              Inventory Control Center
            </h2>
            <p className="text-xs text-slate-500">
              Stock health · valuation · expiry · movements
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {criticalCount > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md bg-red-50 text-red-700 border border-red-200">
              <ShieldAlert size={13} />
              {criticalCount} items need attention
            </span>
          )}
          <span className="text-xs text-slate-400">
            Updated {fmtDateTime(dataUpdatedAt)}
          </span>
          <button
            type="button"
            onClick={() => refetch()}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
          >
            <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 dark:border-gray-700 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-white flex items-center gap-2">
            <AlertTriangle size={15} className="text-amber-600" />
            Critical Alerts
            <span className="text-[11px] font-normal text-slate-400">Mandatory review</span>
          </h3>
        </div>
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-0 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 dark:divide-gray-700">
          {['out_of_stock', 'low_stock', 'expiring', 'expired'].map((type) => {
            const meta = ALERT_META[type];
            const alert = alerts.find((a) => a.type === type);
            const countKey = {
              out_of_stock: 'outOfStock',
              low_stock: 'lowStock',
              expiring: 'expiringSoon',
              expired: 'expired',
            }[type];
            const count = Number(cards[countKey] || 0);
            return (
              <button
                key={type}
                type="button"
                onClick={() => openAlert(type)}
                className={`text-left px-5 py-4 hover:bg-slate-50 dark:hover:bg-gray-700/40 transition-colors ${count > 0 ? meta.bg : ''}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs font-semibold uppercase tracking-wide ${count > 0 ? meta.text : 'text-slate-400'}`}>
                    {meta.label}
                  </span>
                  <span className={`w-2 h-2 rounded-full ${count > 0 ? meta.color : 'bg-slate-300'}`} />
                </div>
                <p className={`text-2xl font-bold tabular-nums ${count > 0 ? meta.text : 'text-slate-700 dark:text-slate-200'}`}>
                  {count}
                </p>
                <p className="text-xs text-slate-500 mt-1 truncate">
                  {alert?.message || (count > 0 ? 'Click to review & act' : 'All clear')}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2 px-0.5">
          Stock Health
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {STOCK_HEALTH.map(({ key, label, sub, icon: Icon, accent, iconBg, alert }) => (
            <button
              key={key}
              type="button"
              onClick={() => alert && openAlert(alert)}
              disabled={!alert}
              className={`bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl p-4 text-left border-l-4 ${accent} ${
                alert ? 'hover:shadow-md hover:border-slate-300 cursor-pointer' : 'cursor-default'
              } transition-all`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconBg}`}>
                  <Icon size={16} />
                </div>
                {alert && (
                  <span className="text-[10px] font-medium text-slate-400 uppercase">View</span>
                )}
              </div>
              <p className="text-xl font-bold text-slate-900 dark:text-white tabular-nums">
                {fmtNum(cards[key])}
              </p>
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mt-0.5">{label}</p>
              <p className="text-[11px] text-slate-400">{sub}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-3">
          Valuation & Daily Operations
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          {FINANCIAL_OPS.map(({ key, label, icon: Icon, format, tone }) => {
            const dailyReport = key === 'todayStockAdded'
              ? 'today-stock-in'
              : key === 'todayDispensed'
                ? 'today-dispensing'
                : null;
            return (
            <div
              key={key}
              className="rounded-lg bg-slate-50 dark:bg-gray-900/50 border border-slate-100 dark:border-gray-700 px-4 py-3"
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon size={14} className="text-slate-400" />
                <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
                  {label}
                </span>
              </div>
              <p className={`text-lg font-bold tabular-nums ${tone} dark:text-white`}>
                {format(cards[key])}
              </p>
              {dailyReport && (
                <div className="flex gap-1.5 mt-2">
                  <button
                    type="button"
                    disabled={downloading === `${dailyReport}-pdf`}
                    onClick={() => downloadReport(dailyReport, 'pdf')}
                    className="flex-1 inline-flex items-center justify-center gap-1 text-[10px] font-medium py-1 rounded-md bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                  >
                    <Download size={10} /> PDF
                  </button>
                  <button
                    type="button"
                    disabled={downloading === `${dailyReport}-excel`}
                    onClick={() => downloadReport(dailyReport, 'excel')}
                    className="flex-1 inline-flex items-center justify-center gap-1 text-[10px] font-medium py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    <FileSpreadsheet size={10} /> Excel
                  </button>
                </div>
              )}
            </div>
            );
          })}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <CorpChartCard
          className="lg:col-span-2"
          title="Stock Consumption"
          subtitle="Monthly units issued from pharmacy"
          action={<span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-md bg-blue-50 text-blue-700 border border-blue-100">Issues</span>}
        >
          {consumptionData.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={consumptionData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CorpBarGradient id="invConsumeBar" color={CORP_BLUE} />
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="month" {...axisProps} />
                <YAxis {...axisProps} width={40} />
                <Tooltip
                  {...corpTooltipStyle}
                  formatter={(v, name) => [fmtNum(v), name === 'consumption' ? 'Units' : name]}
                />
                <Bar dataKey="consumption" name="Units" fill="url(#invConsumeBar)" radius={[6, 6, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <CorpEmptyChart message="No consumption trend yet" />
          )}
        </CorpChartCard>

        <CorpChartCard title="SKU Health Mix" subtitle="Distribution of medicine status">
          {stockMixTotal > 0 ? (
            <div className="relative">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={stockMix}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={74}
                    paddingAngle={3}
                    stroke="#fff"
                    strokeWidth={2}
                  >
                    {stockMix.map((d) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip {...corpTooltipStyle} formatter={(v, n) => [fmtNum(v), n]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pt-1">
                <p className="text-xl font-bold text-slate-800 tabular-nums">{fmtNum(stockMixTotal)}</p>
                <p className="text-[10px] text-slate-400 uppercase tracking-wide">SKUs</p>
              </div>
              <div className="px-3 pb-2 space-y-1.5">
                {stockMix.map((d) => (
                  <div key={d.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 text-slate-600">
                      <span className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                      {d.name}
                    </span>
                    <span className="font-semibold text-slate-800 tabular-nums">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <CorpEmptyChart message="No SKU data" />
          )}
        </CorpChartCard>

        <CorpChartCard
          className="lg:col-span-2"
          title="Purchase Trend"
          subtitle="Monthly stock receipts (units)"
          action={<span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-100">Inflow</span>}
        >
          {purchaseData.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={purchaseData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CorpAreaGradient id="invPurchaseFill" />
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="month" {...axisProps} />
                <YAxis {...axisProps} width={40} />
                <Tooltip
                  {...corpTooltipStyle}
                  formatter={(v) => [fmtNum(v), 'Units received']}
                />
                <Area
                  type="monotone"
                  dataKey="purchases"
                  name="Units"
                  stroke={CORP_BLUE}
                  strokeWidth={2.5}
                  fill="url(#invPurchaseFill)"
                  dot={{ r: 3, fill: '#fff', stroke: CORP_BLUE, strokeWidth: 2 }}
                  activeDot={{ r: 5, fill: CORP_BLUE }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <CorpEmptyChart message="No purchase trend yet" />
          )}
        </CorpChartCard>

        <CorpChartCard title="Top Dispensed (MTD)" subtitle="Highest moving SKUs">
          {topDispensed.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={topDispensed} layout="vertical" margin={{ left: 4, right: 12, top: 4, bottom: 4 }}>
                <CorpBarGradient id="invTopBar" color={CORP_INDIGO} />
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" {...axisProps} />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={100}
                  tick={{ fontSize: 10, fill: '#475569' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip {...corpTooltipStyle} formatter={(v) => [fmtNum(v), 'Qty']} />
                <Bar dataKey="qty" name="Qty" fill="url(#invTopBar)" radius={[0, 6, 6, 0]} maxBarSize={16} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <CorpEmptyChart message="No dispensing data this month" />
          )}
        </CorpChartCard>
      </div>

      <CorpChartCard title="Recent Stock Activity" subtitle="Latest receipts & issues">
        <div className="px-2 pb-2 grid sm:grid-cols-2 lg:grid-cols-3 gap-0 max-h-[240px] overflow-y-auto divide-y sm:divide-y-0 divide-slate-100">
          {(dash?.activity || []).map((item) => (
            <div key={item.id} className="flex gap-3 py-2.5 px-2 sm:border-b sm:border-slate-50">
              <div
                className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  item.quantityChanged > 0
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-red-50 text-red-700'
                }`}
              >
                {item.quantityChanged > 0 ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-slate-800 dark:text-white truncate">
                    {item.medicineName}
                  </p>
                  <span className="text-[11px] text-slate-400 whitespace-nowrap">{fmtTime(item.time)}</span>
                </div>
                <p className={`text-xs ${item.quantityChanged > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {item.label}
                </p>
              </div>
            </div>
          ))}
          {!dash?.activity?.length && (
            <p className="text-sm text-slate-400 text-center py-12 col-span-full">No recent activity</p>
          )}
        </div>
      </CorpChartCard>

      <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Compliance Reports</h3>
            <p className="text-xs text-slate-400">Export PDF or Excel for audit & purchasing</p>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {REPORT_TYPES.map((r) => (
            <div
              key={r.id}
              className="rounded-lg border border-slate-200 dark:border-gray-700 bg-slate-50/80 dark:bg-gray-900/40 px-3.5 py-3 flex flex-col"
            >
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{r.label}</p>
              <p className="text-[11px] text-slate-400 mb-3">{r.desc}</p>
              <div className="mt-auto flex gap-1.5">
                <button
                  type="button"
                  disabled={downloading === `${r.id}-pdf`}
                  onClick={() => downloadReport(r.id, 'pdf')}
                  className="flex-1 inline-flex items-center justify-center gap-1 text-[11px] font-medium py-1.5 rounded-md bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                >
                  <Download size={11} /> PDF
                </button>
                <button
                  type="button"
                  disabled={downloading === `${r.id}-excel`}
                  onClick={() => downloadReport(r.id, 'excel')}
                  className="flex-1 inline-flex items-center justify-center gap-1 text-[11px] font-medium py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  <FileSpreadsheet size={11} /> Excel
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {children}

      <InventoryAlertModal
        type={alertModal}
        isOpen={!!alertModal}
        onClose={() => setAlertModal(null)}
        data={alertData}
        onRefresh={() => {
          qc.invalidateQueries(['pharmaInventoryDash']);
          if (alertModal) openAlert(alertModal);
        }}
      />
    </div>
  );
}
