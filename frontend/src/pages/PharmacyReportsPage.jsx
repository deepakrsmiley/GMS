import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileSpreadsheet, Package, Pill, AlertTriangle, Receipt, Scale } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import PharmacyExpiryReportPage from './PharmacyExpiryReportPage';
import PharmacyBillingPage from './PharmacyBilling';

const TABS = [
  { id: 'stock', label: "Today's Stock", icon: Package, type: 'today-stock-in' },
  { id: 'dispense', label: 'Daily Dispensed', icon: Pill, type: 'today-dispensing' },
  { id: 'expiry', label: 'Expiry', icon: AlertTriangle },
  { id: 'sales', label: 'Sales', icon: Receipt },
  { id: 'audit', label: 'Stock vs Bill', icon: Scale, type: 'stock-vs-bill' },
];

const todayISO = () => new Date().toISOString().slice(0, 10);

const downloadReport = async (type, format, date) => {
  const res = await api.get(`/pharmacy/reports/${type}`, {
    params: { format, date },
    responseType: format === 'json' ? 'json' : 'blob',
  });
  if (format === 'json') return res.data;
  const blob = new Blob([res.data]);
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${type}.${format === 'excel' ? 'xlsx' : 'pdf'}`;
  a.click();
  window.URL.revokeObjectURL(url);
  return null;
};

function ReportTable({ type, date }) {
  const { data, isLoading } = useQuery({
    queryKey: ['pharmacy-report', type, date],
    queryFn: () => api.get(`/pharmacy/reports/${type}`, { params: { format: 'json', date } }).then((r) => r.data),
  });
  const rows = data?.rows || [];

  const exportFile = async (format) => {
    try {
      await downloadReport(type, format, date);
    } catch {
      toast.error('Could not download this report');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 justify-end">
        <button type="button" className="btn-secondary text-sm" onClick={() => exportFile('pdf')}>
          <Download size={14} /> PDF
        </button>
        <button type="button" className="btn-secondary text-sm" onClick={() => exportFile('excel')}>
          <FileSpreadsheet size={14} /> Excel
        </button>
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-2xl border overflow-auto">
        {isLoading ? (
          <p className="p-6 text-sm text-gray-500">Loading report…</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">No records for this date.</p>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 dark:bg-gray-900 text-left">
              <tr>
                {type === 'stock-vs-bill' ? (
                  <>
                    <th className="px-4 py-2">Medicine</th>
                    <th className="px-4 py-2">Billed</th>
                    <th className="px-4 py-2">Stock deducted</th>
                    <th className="px-4 py-2">Difference</th>
                    <th className="px-4 py-2">Status</th>
                  </>
                ) : (
                  <>
                    <th className="px-4 py-2">Time</th>
                    <th className="px-4 py-2">Medicine</th>
                    <th className="px-4 py-2">Batch</th>
                    <th className="px-4 py-2">Qty</th>
                    <th className="px-4 py-2">By</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-t border-gray-100 dark:border-gray-700">
                  {type === 'stock-vs-bill' ? (
                    <>
                      <td className="px-4 py-2">{row.medicineName}</td>
                      <td className="px-4 py-2">{row.billedQty}</td>
                      <td className="px-4 py-2">{row.stockQty}</td>
                      <td className="px-4 py-2">{row.difference}</td>
                      <td className={`px-4 py-2 font-medium ${row.matched ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {row.matched ? 'Matched' : 'Check'}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-2 whitespace-nowrap">{row.transactionDate ? new Date(row.transactionDate).toLocaleString('en-IN') : '—'}</td>
                      <td className="px-4 py-2">{row.medicineName}</td>
                      <td className="px-4 py-2">{row.batchNumber || '—'}</td>
                      <td className="px-4 py-2">{Math.abs(row.quantityChanged || 0)}</td>
                      <td className="px-4 py-2">{row.addedBy?.name || '—'}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default function PharmacyReportsPage() {
  const [tab, setTab] = useState('stock');
  const [date, setDate] = useState(todayISO());
  const active = useMemo(() => TABS.find((t) => t.id === tab) || TABS[0], [tab]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Pharmacy Reports</h1>
        <p className="text-sm text-slate-500">Today’s stock added, daily dispensed, expiry, sales, and stock-vs-bill audit — in one place.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border ${
                  tab === t.id
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white dark:bg-gray-800 text-slate-600 border-gray-200 dark:border-gray-700'
                }`}
              >
                <Icon size={15} /> {t.label}
              </button>
            );
          })}
        </div>
        {active.type && (
          <label className="ml-auto text-sm text-slate-500 flex items-center gap-2">
            Date
            <input type="date" className="input-field py-1.5" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        )}
      </div>

      {active.type && <ReportTable type={active.type} date={date} />}
      {tab === 'expiry' && <PharmacyExpiryReportPage />}
      {tab === 'sales' && <PharmacyBillingPage />}
    </div>
  );
}
