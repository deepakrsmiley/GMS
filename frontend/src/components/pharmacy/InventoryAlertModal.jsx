import React from 'react';
import { Download, FileSpreadsheet, Bell, ShoppingCart } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import Modal from '../common/Modal';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN') : 'N/A');
const fmtCurrency = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const urgencyClass = {
  warning: 'bg-orange-100 text-orange-800 border-orange-200',
  high: 'bg-orange-200 text-orange-900 border-orange-300',
  critical: 'bg-red-100 text-red-800 border-red-200',
};

export default function InventoryAlertModal({ type, isOpen, onClose, data = [], onRefresh }) {
  const reportType = {
    low_stock: 'low-stock',
    out_of_stock: 'out-of-stock',
    expiring: 'expiry',
    expired: 'expired',
  }[type];

  const titles = {
    low_stock: 'Low Stock Medicines',
    out_of_stock: 'Out Of Stock Medicines',
    expiring: 'Expiring Soon (30 Days)',
    expired: 'Expired Medicines',
  };

  const downloadReport = async (format) => {
    try {
      const res = await api.get(`/pharmacy/reports/${reportType}?format=${format}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${reportType}-report.${format === 'excel' ? 'xlsx' : 'pdf'}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to download report');
    }
  };

  const notifyRoles = async (roles, row) => {
    try {
      await api.post('/pharmacy/notify', {
        type: type === 'out_of_stock' ? 'Out of Stock' : 'Inventory Alert',
        medicineName: row.medicineName,
        message: `${row.medicineName} requires immediate attention (${type.replace('_', ' ')})`,
        roles,
      });
      toast.success('Notification sent');
    } catch {
      toast.error('Failed to send notification');
    }
  };

  const disposeBatch = async (row) => {
    if (!window.confirm(`Mark ${row.medicineName} batch ${row.batchNumber} as disposed?`)) return;
    try {
      await api.post(`/pharmacy/${row.medicineId}/batches/${row.batchId}/dispose`, { remarks: 'Expired stock disposed' });
      toast.success('Batch marked as disposed');
      onRefresh?.();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Dispose failed');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={titles[type] || 'Inventory Alert'} size="xl">
      <div className="p-4 space-y-4">
        <div className="flex flex-wrap gap-2">
          {reportType && (
            <>
              <button type="button" onClick={() => downloadReport('pdf')} className="btn-secondary text-sm py-1.5">
                <Download size={14} /> Print PDF
              </button>
              <button type="button" onClick={() => downloadReport('excel')} className="btn-secondary text-sm py-1.5">
                <FileSpreadsheet size={14} /> Export Excel
              </button>
            </>
          )}
        </div>

        <div className="overflow-x-auto max-h-[55vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0">
              <tr>
                {type === 'low_stock' && (
                  <>
                    <th className="text-left p-2">Medicine</th>
                    <th className="text-right p-2">Current</th>
                    <th className="text-right p-2">Minimum</th>
                    <th className="text-left p-2">Supplier</th>
                    <th className="text-left p-2">Last Purchase</th>
                    <th className="p-2">Status</th>
                  </>
                )}
                {type === 'out_of_stock' && (
                  <>
                    <th className="text-left p-2">Medicine</th>
                    <th className="text-left p-2">Last Supplier</th>
                    <th className="text-left p-2">Last Purchase</th>
                    <th className="text-right p-2">Avg Monthly Usage</th>
                    <th className="p-2">Actions</th>
                  </>
                )}
                {type === 'expiring' && (
                  <>
                    <th className="text-left p-2">Medicine</th>
                    <th className="text-left p-2">Batch</th>
                    <th className="text-left p-2">Expiry</th>
                    <th className="text-right p-2">Days Left</th>
                    <th className="text-right p-2">Qty</th>
                  </>
                )}
                {type === 'expired' && (
                  <>
                    <th className="text-left p-2">Medicine</th>
                    <th className="text-left p-2">Batch</th>
                    <th className="text-left p-2">Expiry</th>
                    <th className="text-right p-2">Qty</th>
                    <th className="text-right p-2">Value</th>
                    <th className="p-2">Actions</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={row._id || row.batchId || i} className="border-t border-gray-100 dark:border-gray-700">
                  {type === 'low_stock' && (
                    <>
                      <td className="p-2 font-medium">{row.medicineName}</td>
                      <td className="p-2 text-right">{row.currentStock}</td>
                      <td className="p-2 text-right">{row.minimumStock}</td>
                      <td className="p-2">{row.supplier?.name || 'N/A'}</td>
                      <td className="p-2">{fmtDate(row.lastPurchaseDate)}</td>
                      <td className="p-2"><span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800">🟡 Low Stock</span></td>
                    </>
                  )}
                  {type === 'out_of_stock' && (
                    <>
                      <td className="p-2 font-medium">{row.medicineName}</td>
                      <td className="p-2">{row.lastSupplier?.name || 'N/A'}</td>
                      <td className="p-2">{fmtDate(row.lastPurchaseDate)}</td>
                      <td className="p-2 text-right">{row.averageMonthlyUsage}</td>
                      <td className="p-2">
                        <div className="flex gap-1 flex-wrap">
                          <button type="button" onClick={() => notifyRoles(['Pharmacist'], row)} className="text-xs text-blue-600 hover:underline flex items-center gap-1"><ShoppingCart size={12} />Reorder</button>
                          <button type="button" onClick={() => notifyRoles(['Pharmacist', 'Admin'], row)} className="text-xs text-purple-600 hover:underline flex items-center gap-1"><Bell size={12} />Notify</button>
                        </div>
                      </td>
                    </>
                  )}
                  {type === 'expiring' && (
                    <>
                      <td className="p-2 font-medium">{row.medicineName}</td>
                      <td className="p-2">{row.batchNumber}</td>
                      <td className="p-2">{fmtDate(row.expiryDate)}</td>
                      <td className="p-2 text-right">
                        <span className={`text-xs px-2 py-0.5 rounded border ${urgencyClass[row.urgency] || urgencyClass.warning}`}>
                          {row.remainingDays}d
                        </span>
                      </td>
                      <td className="p-2 text-right">{row.quantity}</td>
                    </>
                  )}
                  {type === 'expired' && (
                    <>
                      <td className="p-2 font-medium">{row.medicineName}</td>
                      <td className="p-2">{row.batchNumber}</td>
                      <td className="p-2">{fmtDate(row.expiryDate)}</td>
                      <td className="p-2 text-right">{row.quantity}</td>
                      <td className="p-2 text-right">{fmtCurrency(row.stockValue)}</td>
                      <td className="p-2">
                        <button type="button" onClick={() => disposeBatch(row)} className="text-xs text-red-600 hover:underline">Mark Disposed</button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {!data.length && (
                <tr><td colSpan={8} className="p-8 text-center text-gray-400">No records found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}
