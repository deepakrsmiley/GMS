import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import InvoicePrint from '../billing/InvoicePrint';
import { hasPermission } from '../../constants/permissions';
import { istCalendarDate } from '../../utils/istDate';

const PAYMENT_MODES = [
  { id: 'cash', label: 'Cash' },
  { id: 'card', label: 'Card' },
  { id: 'upi', label: 'UPI' },
];

export const medicineLineAmount = (med) =>
  (Number(med?.quantity) || 0) * (Number(med?.unitPrice) || 0);

export const isUnbilledPricedMedicine = (med) =>
  !med?.dailyBill && medicineLineAmount(med) > 0;

export function groupMedicationsByIstDay(entries = []) {
  const groups = new Map();
  entries.forEach((entry) => {
    const iso = istCalendarDate(entry.administeredAt);
    if (!groups.has(iso)) groups.set(iso, []);
    groups.get(iso).push(entry);
  });
  return [...groups.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
}

export function formatMedicineDay(value) {
  const iso = istCalendarDate(value);
  const date = new Date(`${iso}T12:00:00+05:30`);
  if (Number.isNaN(date.getTime())) return String(value || '');
  return date.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function unbilledMedicineDays(medications = []) {
  return groupMedicationsByIstDay(medications.filter(isUnbilledPricedMedicine)).map(([iso]) => iso);
}

const money = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const downloadBillPdf = async (id, thermal = false, size = 'A4') => {
  try {
    const endpoint = thermal
      ? `/billing/${id}/thermal`
      : `/billing/${id}/print?size=${encodeURIComponent(size)}`;
    const response = await api.get(endpoint, { responseType: 'blob' });
    const blob = new Blob([response.data], { type: 'application/pdf' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = thermal ? `thermal-${id}.pdf` : `invoice-${id}-${size}.pdf`;
    link.click();
    setTimeout(() => window.URL.revokeObjectURL(url), 60000);
  } catch {
    toast.error('Unable to download invoice');
  }
};

export default function DailyMedicineBilling({ admission, showEmpty = false }) {
  const queryClient = useQueryClient();
  const { user } = useSelector((s) => s.auth);
  const canBill = hasPermission(user, 'CREATE_BILLING');
  const canReprint = hasPermission(user, 'VIEW_BILLING');
  const [modes, setModes] = useState({});
  const [printBill, setPrintBill] = useState(null);

  const bills = (admission?.bills || []).filter((bill) => bill && bill.ipDailyMedicine);
  const unbilledDays = unbilledMedicineDays(admission?.medications || []);

  const refresh = () => {
    if (!admission?._id) return;
    queryClient.invalidateQueries({ queryKey: ['ip-admission', admission._id] });
    queryClient.invalidateQueries({ queryKey: ['admission', admission._id] });
    queryClient.invalidateQueries({ queryKey: ['admissions'] });
  };

  const generate = useMutation({
    mutationFn: ({ day, paymentMode }) => api.post(`/ip/${admission._id}/daily-medicine-bill`, { day, paymentMode }),
    onSuccess: (response) => {
      toast.success(response.data?.message || 'Daily medicine bill created');
      refresh();
      if (response.data?.data) setPrintBill(response.data.data);
    },
    onError: (error) => toast.error(error.response?.data?.message || 'Could not create the daily medicine bill'),
  });

  const reprint = async (billId) => {
    try {
      const { data } = await api.get(`/billing/${billId}`);
      setPrintBill(data.data);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not open this bill');
    }
  };

  if (!showEmpty && !canBill && bills.length === 0 && unbilledDays.length === 0) return null;
  if (!showEmpty && !canBill && bills.length === 0) return null;

  return (
    <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-700 space-y-4">
      <div>
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Daily medicine bills</h4>
        <p className="text-xs text-gray-500 mt-1">
          Each day is collected separately. The admission advance stays on the final IP bill, which does not include these medicines.
        </p>
      </div>

      {canBill && unbilledDays.map((iso) => {
        const lines = (admission.medications || []).filter(
          (med) => isUnbilledPricedMedicine(med) && istCalendarDate(med.administeredAt) === iso,
        );
        const total = lines.reduce((sum, med) => sum + medicineLineAmount(med), 0);
        const mode = modes[iso] || 'cash';
        return (
          <div key={iso} className="flex flex-wrap items-end gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
            <div className="min-w-[180px] flex-1">
              <p className="text-sm font-medium text-amber-950">{formatMedicineDay(iso)}</p>
              <p className="text-xs text-amber-800">{lines.length} medicine line(s) · {money(total)}</p>
            </div>
            <label className="text-xs text-amber-900">
              Payment
              <select
                className="mt-1 block border border-amber-200 rounded-lg px-2 py-1.5 text-sm bg-white"
                value={mode}
                onChange={(e) => setModes((current) => ({ ...current, [iso]: e.target.value }))}
              >
                {PAYMENT_MODES.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={generate.isPending}
              onClick={() => generate.mutate({ day: iso, paymentMode: mode })}
              className="bg-blue-600 text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {generate.isPending ? 'Generating...' : 'Generate bill'}
            </button>
          </div>
        );
      })}

      {!canBill && unbilledDays.length > 0 && (
        <p className="text-xs text-amber-700">
          {unbilledDays.length} day(s) of medicine are not billed yet. Billing staff can generate those bills.
        </p>
      )}

      {bills.length === 0 && (
        <p className="text-sm text-gray-400">No daily medicine bills stored on this admission yet.</p>
      )}

      {bills.length > 0 && (
        <div className="space-y-2">
          {bills.map((bill) => (
            <div key={bill._id} className="flex items-center justify-between gap-3 border border-gray-100 dark:border-gray-700 rounded-lg px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="font-medium text-gray-900 dark:text-white">{bill.billNumber}</p>
                <p className="text-xs text-gray-500">
                  {formatMedicineDay(bill.dailyMedicineDate || bill.createdAt)}
                  {' · '}{money(bill.totalAmount)}
                  {' · '}{(bill.paymentMode || 'cash').toUpperCase()}
                  {' · '}{bill.status || 'paid'}
                </p>
              </div>
              {canReprint && (
                <button
                  type="button"
                  onClick={() => reprint(bill._id)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline shrink-0"
                >
                  <Printer size={14} /> Reprint
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {printBill && createPortal(
        <InvoicePrint
          bill={printBill}
          onClose={() => setPrintBill(null)}
          onDownloadPdf={(id) => downloadBillPdf(id, false, 'A4')}
          onDownloadPdfA5={(id) => downloadBillPdf(id, false, 'A5')}
          onDownloadThermal={(id) => downloadBillPdf(id, true)}
        />,
        document.body,
      )}
    </div>
  );
}
