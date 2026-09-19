import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileSpreadsheet, Printer, Search } from 'lucide-react';
import api from '../../services/api';
import { exportToCSV, printSection } from '../../utils/exportUtils';
import { addIstCalendarDays, istCalendarDate, istMonthStart } from '../../utils/istDate';

export const LAB_DATE_PRESETS = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'month', label: 'This month' },
  { id: 'custom', label: 'Custom dates' },
];

export function labRangeFromPreset(preset, customFrom, customTo) {
  const today = istCalendarDate();
  if (preset === 'yesterday') {
    const yesterday = addIstCalendarDays(today, -1);
    return { from: yesterday, to: yesterday };
  }
  if (preset === 'month') return { from: istMonthStart(today), to: today };
  if (preset === 'custom') {
    const from = customFrom || today;
    return { from, to: customTo || from };
  }
  return { from: today, to: today };
}

const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`;
const fmtWhen = (v) => (v ? new Date(v).toLocaleString('en-IN', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
}) : '—');

export function LabDateRangeBar({
  preset,
  onPreset,
  customFrom,
  customTo,
  onCustom,
  search,
  onSearchChange,
  onSearchSubmit,
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-wrap gap-2">
        {LAB_DATE_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onPreset(p.id)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
              preset === p.id
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {preset === 'custom' && (
        <div className="flex items-center gap-2">
          <input type="date" className="input-field py-1.5 text-sm" value={customFrom} onChange={(e) => onCustom(e.target.value, customTo)} />
          <span className="text-xs text-slate-400">to</span>
          <input type="date" className="input-field py-1.5 text-sm" value={customTo} onChange={(e) => onCustom(customFrom, e.target.value)} />
        </div>
      )}
      <form
        className="flex items-center gap-2 ml-auto"
        onSubmit={(e) => { e.preventDefault(); onSearchSubmit?.(); }}
      >
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input-field py-1.5 pl-8 text-sm w-56"
            placeholder="Name / phone / lab no"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
        <button type="submit" className="btn-secondary text-xs py-1.5">Search</button>
      </form>
    </div>
  );
}

export default function LabDayReport({ branding, onOpenReport }) {
  const today = istCalendarDate();
  const [preset, setPreset] = useState('today');
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');

  const range = useMemo(
    () => labRangeFromPreset(preset, customFrom, customTo),
    [preset, customFrom, customTo],
  );

  const { data, isLoading } = useQuery({
    queryKey: ['labCollection', range.from, range.to, q],
    queryFn: () => api.get('/lab/collection-report', {
      params: { from: range.from, to: range.to, q: q || undefined },
    }).then((r) => r.data),
  });

  const rows = data?.data || [];
  const summary = data?.summary || { count: 0, amount: 0, paid: 0, completed: 0, pending: 0 };
  const hospital = branding?.hospitalName || 'Hospital';
  const rangeLabel = range.from === range.to
    ? range.from
    : `${range.from} to ${range.to}`;

  const handlePrint = () => {
    printSection('lab-day-report-print', `${hospital} — Lab report ${rangeLabel}`);
  };

  const handleCsv = () => {
    exportToCSV(
      rows.map((r) => ({
        date: fmtWhen(r.createdAt),
        labNumber: r.labNumber,
        uhid: r.patient?.patientId,
        name: r.patient?.name,
        phone: r.patient?.phone,
        tests: r.testProfile,
        amount: r.amount,
        paid: r.paid,
        status: r.status,
      })),
      [
        { key: 'date', header: 'Date' },
        { key: 'labNumber', header: 'Lab No' },
        { key: 'uhid', header: 'UHID' },
        { key: 'name', header: 'Patient' },
        { key: 'phone', header: 'Phone' },
        { key: 'tests', header: 'Tests' },
        { key: 'amount', header: 'Amount' },
        { key: 'paid', header: 'Paid' },
        { key: 'status', header: 'Status' },
      ],
      `lab-report-${range.from}-${range.to}`,
    );
  };

  return (
    <div className="space-y-4">
      <LabDateRangeBar
        preset={preset}
        onPreset={setPreset}
        customFrom={customFrom}
        customTo={customTo}
        onCustom={(from, to) => { setCustomFrom(from); setCustomTo(to || from); }}
        search={search}
        onSearchChange={setSearch}
        onSearchSubmit={() => setQ(search.trim())}
      />
      <p className="text-xs text-slate-500">
        Daily / monthly / custom register of patients who came for lab. Print this list, or open a row to print that patient’s result report.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Labs', value: summary.count, color: 'text-blue-700' },
          { label: 'Amount', value: money(summary.amount), color: 'text-emerald-700' },
          { label: 'Collected', value: money(summary.paid), color: 'text-indigo-700' },
          { label: 'Reports ready', value: summary.completed, color: 'text-green-700' },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-slate-100 bg-white p-4">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 justify-end">
        <button type="button" className="btn-secondary text-sm" onClick={handleCsv} disabled={!rows.length}>
          <FileSpreadsheet size={14} /> Excel
        </button>
        <button type="button" className="btn-primary text-sm" onClick={handlePrint} disabled={!rows.length}>
          <Printer size={14} /> Print report
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 overflow-auto">
        {isLoading ? (
          <p className="p-6 text-sm text-slate-500">Loading lab report…</p>
        ) : !rows.length ? (
          <p className="p-6 text-sm text-slate-500 text-center">No lab patients in this date range.</p>
        ) : (
          <div id="lab-day-report-print">
            <div className="px-4 pt-4 pb-2 print:block">
              <h2 className="text-lg font-bold">{hospital}</h2>
              {branding?.address && <p className="text-xs text-slate-500">{branding.address}</p>}
              <p className="text-sm font-semibold mt-1">Lab collection report — {rangeLabel}</p>
              <p className="text-xs text-slate-500">
                {summary.count} labs · {money(summary.amount)} amount · {money(summary.paid)} collected
              </p>
            </div>
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-4 py-2">#</th>
                  <th className="px-4 py-2">Date / time</th>
                  <th className="px-4 py-2">Lab No</th>
                  <th className="px-4 py-2">UHID</th>
                  <th className="px-4 py-2">Patient</th>
                  <th className="px-4 py-2">Phone</th>
                  <th className="px-4 py-2">Tests</th>
                  <th className="px-4 py-2">Amount</th>
                  <th className="px-4 py-2">Paid</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2 print:hidden" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r._id} className="border-t border-gray-100">
                    <td className="px-4 py-2 text-slate-400">{i + 1}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{fmtWhen(r.createdAt)}</td>
                    <td className="px-4 py-2 font-mono">{r.labNumber}</td>
                    <td className="px-4 py-2 font-mono text-blue-700">{r.patient?.patientId || '—'}</td>
                    <td className="px-4 py-2 font-medium">{r.patient?.name || '—'}</td>
                    <td className="px-4 py-2">{r.patient?.phone || '—'}</td>
                    <td className="px-4 py-2 text-xs">{r.testProfile || `${r.testsCount || 0} tests`}</td>
                    <td className="px-4 py-2 font-semibold">{money(r.amount)}</td>
                    <td className="px-4 py-2">{r.billed ? money(r.paid) : 'Unbilled'}</td>
                    <td className="px-4 py-2 capitalize">{String(r.status || '').replace(/_/g, ' ')}</td>
                    <td className="px-4 py-2 print:hidden">
                      {r.status === 'completed' && onOpenReport && (
                        <button type="button" className="text-xs font-semibold text-blue-700" onClick={() => onOpenReport(r)}>
                          Print result
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 font-bold">
                  <td className="px-4 py-2" colSpan={7}>Total — {summary.count} labs</td>
                  <td className="px-4 py-2">{money(summary.amount)}</td>
                  <td className="px-4 py-2">{money(summary.paid)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
