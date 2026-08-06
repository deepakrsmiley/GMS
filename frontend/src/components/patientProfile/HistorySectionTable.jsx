import React, { useMemo, useState } from 'react';
import { Search, Download, Printer, Inbox } from 'lucide-react';
import LoadingSpinner from '../common/LoadingSpinner';
import { exportToCSV, printSection } from '../../utils/exportUtils';

/**
 * Generic, reusable table for every Patient 360 history section.
 * columns: [{ key, header, render? }]
 * rows: array of plain objects
 */
export default function HistorySectionTable({
  title,
  columns,
  rows = [],
  loading,
  emptyText = 'No records found',
  filename = 'export',
  extraActions = null,
  onRowClick = null,
}) {
  const [search, setSearch] = useState('');
  const domId = useMemo(() => `section-${title?.replace(/\s+/g, '-').toLowerCase()}-${Math.random().toString(36).slice(2, 7)}`, [title]);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((row) => columns.some((c) => {
      const val = row[c.key];
      return val !== undefined && val !== null && String(val).toLowerCase().includes(q);
    }));
  }, [rows, search, columns]);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-blue-100 dark:border-gray-700 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-blue-50/70 dark:bg-slate-900/40 border-b border-blue-100 dark:border-gray-700">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">{title}</h3>
          <p className="text-[11px] text-slate-500 mt-0.5">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="input-field pl-8 py-1.5 text-sm w-48"
            />
          </div>
          {extraActions}
          <button
            type="button"
            title="Export Excel/CSV"
            onClick={() => exportToCSV(filtered, columns, filename)}
            className="p-2 rounded-md border border-blue-100 dark:border-gray-700 hover:bg-white dark:hover:bg-gray-700 text-slate-500"
          >
            <Download size={15} />
          </button>
          <button
            type="button"
            title="Print"
            onClick={() => printSection(domId, title)}
            className="p-2 rounded-md border border-blue-100 dark:border-gray-700 hover:bg-white dark:hover:bg-gray-700 text-slate-500"
          >
            <Printer size={15} />
          </button>
        </div>
      </div>

      <div id={domId} className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              {columns.map((col) => (
                <th key={col.key} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-gray-400">
                  <div className="flex flex-col items-center gap-2">
                    <Inbox size={22} />
                    <span>{emptyText}</span>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((row, i) => (
                <tr
                  key={row._id || row.id || i}
                  onClick={() => onRowClick?.(row)}
                  className={`transition-colors ${onRowClick ? 'cursor-pointer hover:bg-blue-50/60 dark:hover:bg-gray-700/60' : ''}`}
                >
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-2.5 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      {col.render ? col.render(row) : (row[col.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
