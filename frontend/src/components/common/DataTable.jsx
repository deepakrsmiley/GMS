import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import LoadingSpinner from './LoadingSpinner';

export default function DataTable({ columns, data, loading, page, pages, onPageChange, onRowClick }) {
  if (loading) return <LoadingSpinner />;
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              {columns.map((col) => (
                <th key={col.key} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {data.length === 0 ? (
              <tr><td colSpan={columns.length} className="px-4 py-12 text-center text-gray-400">No data found</td></tr>
            ) : (
              data.map((row, i) => (
                <tr key={row._id || i} onClick={() => onRowClick?.(row)} className={`table-row-hover transition-colors duration-100 ${onRowClick ? 'cursor-pointer' : ''}`}>
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3 text-gray-700 dark:text-gray-300">
                      {col.render ? col.render(row) : row[col.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-500">Page {page} of {pages}</p>
          <div className="flex gap-2">
            <button onClick={() => onPageChange(page - 1)} disabled={page === 1} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 transition-colors">
              <ChevronLeft size={16} />
            </button>
            <button onClick={() => onPageChange(page + 1)} disabled={page === pages} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 transition-colors">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
