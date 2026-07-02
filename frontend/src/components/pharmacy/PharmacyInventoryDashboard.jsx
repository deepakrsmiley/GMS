import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Package, AlertTriangle, TrendingDown, TrendingUp, Clock, XCircle,
  DollarSign, BarChart3, Activity, Download, FileSpreadsheet,
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import toast from 'react-hot-toast';
import api from '../../services/api';
import LoadingSpinner from '../common/LoadingSpinner';
import InventoryAlertModal from './InventoryAlertModal';

const fmtCurrency = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const fmtTime = (d) => new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

const CARD_CONFIG = [
  { key: 'totalMedicines', label: 'Total Medicines', icon: Package, color: 'text-blue-600', bg: 'bg-blue-50' },
  { key: 'totalInventoryValue', label: 'Inventory Value', icon: DollarSign, color: 'text-indigo-600', bg: 'bg-indigo-50', format: fmtCurrency },
  { key: 'availableStock', label: 'Available Stock', icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-50' },
  { key: 'lowStock', label: 'Low Stock', icon: AlertTriangle, color: 'text-yellow-600', bg: 'bg-yellow-50', alert: 'low_stock' },
  { key: 'outOfStock', label: 'Out Of Stock', icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', alert: 'out_of_stock' },
  { key: 'expiringSoon', label: 'Expiring Soon', icon: Clock, color: 'text-orange-600', bg: 'bg-orange-50', alert: 'expiring' },
  { key: 'expired', label: 'Expired', icon: TrendingDown, color: 'text-red-700', bg: 'bg-red-100', alert: 'expired' },
  { key: 'todayDispensed', label: "Today's Dispensed", icon: Activity, color: 'text-purple-600', bg: 'bg-purple-50' },
  { key: 'todayStockAdded', label: "Today's Stock Added", icon: Package, color: 'text-teal-600', bg: 'bg-teal-50' },
  { key: 'monthlyPurchaseValue', label: 'Monthly Purchases', icon: BarChart3, color: 'text-blue-700', bg: 'bg-blue-50', format: fmtCurrency },
  { key: 'monthlyDispensingValue', label: 'Monthly Dispensing', icon: BarChart3, color: 'text-violet-600', bg: 'bg-violet-50', format: fmtCurrency },
];

const REPORT_TYPES = [
  { id: 'low-stock', label: 'Low Stock' },
  { id: 'out-of-stock', label: 'Out Of Stock' },
  { id: 'expiry', label: 'Expiry (30d)' },
  { id: 'expired', label: 'Expired' },
  { id: 'valuation', label: 'Valuation' },
  { id: 'supplier-purchase', label: 'Supplier Purchase' },
  { id: 'dispensing', label: 'Dispensing' },
  { id: 'stock-movement', label: 'Stock Movement' },
];

export default function PharmacyInventoryDashboard({ children }) {
  const qc = useQueryClient();
  const [alertModal, setAlertModal] = useState(null);
  const [alertData, setAlertData] = useState([]);

  const { data: dash, isLoading } = useQuery({
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
    try {
      const res = await api.get(`/pharmacy/reports/${type}?format=${format}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type}-report.${format === 'excel' ? 'xlsx' : 'pdf'}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Report download failed');
    }
  };

  if (isLoading) return <LoadingSpinner />;

  const cards = dash?.cards || {};
  const charts = dash?.charts || {};
  const consumptionData = (charts.monthlyConsumption || []).map((r) => ({
    month: r._id,
    consumption: r.qty,
    value: r.value,
  }));
  const purchaseData = (charts.monthlyPurchases || []).map((r) => ({
    month: r._id,
    purchases: r.qty,
    value: r.value,
  }));
  const topDispensed = charts.topDispensedMedicines || [];

  return (
    <div className="space-y-6">
      {/* Notification Center */}
      {(dash?.alerts || []).length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4">
          <h3 className="font-semibold text-amber-800 dark:text-amber-300 mb-3 flex items-center gap-2">
            <AlertTriangle size={18} /> Notification Center
          </h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {dash.alerts.map((alert) => (
              <button
                key={alert.type}
                type="button"
                onClick={() => openAlert(alert.type)}
                className="text-left text-sm bg-white dark:bg-gray-800 rounded-xl p-3 border border-amber-100 dark:border-amber-900 hover:shadow-md transition-shadow"
              >
                <span className="font-medium">{alert.icon} {alert.message}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        {CARD_CONFIG.map(({ key, label, icon: Icon, color, bg, format, alert }) => (
          <button
            key={key}
            type="button"
            onClick={() => alert && openAlert(alert)}
            className={`kpi-card text-left p-4 transition-all hover:shadow-md ${alert ? 'cursor-pointer hover:ring-2 hover:ring-blue-200' : 'cursor-default'}`}
          >
            <div className={`w-9 h-9 rounded-xl ${bg} dark:bg-opacity-20 flex items-center justify-center mb-2`}>
              <Icon size={18} className={color} />
            </div>
            <p className={`text-xl font-bold ${color}`}>{format ? format(cards[key]) : cards[key] ?? 0}</p>
            <p className="text-xs text-gray-500 mt-1">{label}</p>
          </button>
        ))}
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Monthly Stock Consumption</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={consumptionData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="consumption" fill="#8b5cf6" name="Units" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Monthly Purchases</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={purchaseData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="purchases" stroke="#3b82f6" name="Units" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Top Dispensed Medicines (This Month)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={topDispensed} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="qty" fill="#22c55e" name="Qty" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Recent Activity</h3>
          <div className="space-y-2 max-h-[220px] overflow-y-auto">
            {(dash?.activity || []).map((item) => (
              <div key={item.id} className="flex gap-3 text-sm border-b border-gray-50 dark:border-gray-700 pb-2 last:border-0">
                <span className="text-gray-400 text-xs whitespace-nowrap pt-0.5">{fmtTime(item.time)}</span>
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">{item.medicineName}</p>
                  <p className={`text-xs ${item.quantityChanged > 0 ? 'text-green-600' : 'text-red-600'}`}>{item.label}</p>
                </div>
              </div>
            ))}
            {!dash?.activity?.length && <p className="text-gray-400 text-sm text-center py-8">No recent activity</p>}
          </div>
        </div>
      </div>

      {/* Reports */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Advanced Reports</h3>
        <div className="flex flex-wrap gap-2">
          {REPORT_TYPES.map((r) => (
            <div key={r.id} className="flex gap-1">
              <button type="button" onClick={() => downloadReport(r.id, 'pdf')} className="btn-secondary text-xs py-1.5">
                <Download size={12} /> {r.label} PDF
              </button>
              <button type="button" onClick={() => downloadReport(r.id, 'excel')} className="btn-secondary text-xs py-1.5">
                <FileSpreadsheet size={12} /> Excel
              </button>
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
        onRefresh={() => { qc.invalidateQueries(['pharmaInventoryDash']); openAlert(alertModal); }}
      />
    </div>
  );
}
