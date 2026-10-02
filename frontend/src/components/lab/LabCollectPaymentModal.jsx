import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Wallet } from 'lucide-react';
import api from '../../services/api';
import Modal from '../common/Modal';
import SplitPaymentBox, { emptySplitParts, splitPartsPayload, splitPartsTotal } from '../billing/SplitPaymentBox';

const fmt = (n) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const orderTotal = (lab) => {
  if (!lab) return 0;
  const fromTests = (lab.tests || [])
    .filter((t) => t.status !== 'cancelled')
    .reduce((sum, t) => sum + (Number(t.price) || 0), 0);
  return fromTests > 0 ? fromTests : Number(lab.totalAmount) || 0;
};

export default function LabCollectPaymentModal({ isOpen, lab, onClose, onBilled }) {
  const qc = useQueryClient();
  const total = useMemo(() => orderTotal(lab), [lab]);
  const [paidAmount, setPaidAmount] = useState(total);
  const [paymentMode, setPaymentMode] = useState('cash');
  const [splitPay, setSplitPay] = useState(false);
  const [paymentParts, setPaymentParts] = useState(emptySplitParts);

  useEffect(() => {
    setPaidAmount(total);
    setPaymentMode('cash');
    setSplitPay(false);
    setPaymentParts(emptySplitParts());
  }, [lab?._id, total]);

  useEffect(() => {
    if (!splitPay) return;
    setPaidAmount(splitPartsTotal(paymentParts));
  }, [splitPay, paymentParts]);

  const billMut = useMutation({
    mutationFn: () => {
      const parts = splitPay ? splitPartsPayload(paymentParts) : [];
      const paidNow = splitPay ? splitPartsTotal(paymentParts) : (Number(paidAmount) || 0);
      if (paidNow - total > 0.05) {
        throw new Error('Paid amount cannot be more than the bill total');
      }
      const modes = [...new Set(parts.map((row) => row.mode))];
      return api.post(`/lab/${lab._id}/bill`, {
        paidAmount: paidNow,
        paymentMode: splitPay
          ? (modes.length > 1 ? 'multiple' : (modes[0] || 'cash'))
          : paymentMode,
        ...(parts.length ? { payments: parts } : {}),
      }, { skipErrorToast: true });
    },
    onSuccess: async (res) => {
      toast.success(res.data.message || 'Lab bill created');
      qc.invalidateQueries({ queryKey: ['labTests'] });
      qc.invalidateQueries({ queryKey: ['bills'] });
      qc.invalidateQueries({ queryKey: ['labBills'] });
      const bill = res.data.data?.bill;
      onBilled?.(res.data.data);
      onClose();
      if (bill?._id) {
        try {
          const pdf = await api.get(`/billing/${bill._id}/print?size=A5`, { responseType: 'blob' });
          const url = window.URL.createObjectURL(new Blob([pdf.data], { type: 'application/pdf' }));
          const link = document.createElement('a');
          link.href = url;
          link.download = `${bill.billNumber || 'lab-bill'}.pdf`;
          link.click();
          setTimeout(() => window.URL.revokeObjectURL(url), 60000);
        } catch {
          toast.error('Bill saved. Print it from Billing if the PDF did not download.');
        }
      }
    },
    onError: (err) => toast.error(err.response?.data?.message || err.message || 'Could not create lab bill'),
  });

  if (!lab) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Collect lab payment — ${lab.labNumber || ''}`}
      size="md"
    >
      <div className="p-5 space-y-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="font-semibold text-slate-900">{lab.patient?.name || 'Patient'}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {lab.patient?.patientId || ''}
            {lab.testProfile ? ` · ${lab.testProfile}` : ''}
          </p>
          <p className="text-lg font-bold text-slate-900 mt-2">{fmt(total)}</p>
        </div>
        <SplitPaymentBox
          split={splitPay}
          onSplitChange={setSplitPay}
          mode={paymentMode}
          onModeChange={setPaymentMode}
          parts={paymentParts}
          onPartsChange={setPaymentParts}
          paidAmount={paidAmount}
          onPaidAmountChange={setPaidAmount}
          billTotal={total}
        />
        <div className="flex gap-2 pt-2">
          <button type="button" className="btn-secondary flex-1" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn-primary flex-1 justify-center"
            disabled={billMut.isPending || total <= 0}
            onClick={() => billMut.mutate()}
          >
            <Wallet size={15} />
            {billMut.isPending ? 'Saving…' : 'Save & print bill'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
