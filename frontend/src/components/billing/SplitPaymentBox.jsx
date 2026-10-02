import React, { useEffect } from 'react';

export const PAYMENT_MODE_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'GPay / UPI' },
  { value: 'card', label: 'Card' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'online', label: 'Online' },
  { value: 'insurance', label: 'Insurance' },
];

export const emptySplitParts = () => [
  { mode: 'upi', amount: '' },
  { mode: 'cash', amount: '' },
];

export const splitPartsTotal = (parts) =>
  Number((parts || []).reduce((sum, row) => sum + (Number(row.amount) || 0), 0).toFixed(2));

export const splitPartsPayload = (parts) =>
  (parts || [])
    .map((row) => ({ mode: row.mode, amount: Number(row.amount) || 0 }))
    .filter((row) => row.amount > 0);

const money = (n) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Single mode, or split across modes (example: bill ₹2000 = GPay ₹1800 + cash ₹200).
 */
export default function SplitPaymentBox({
  split,
  onSplitChange,
  mode,
  onModeChange,
  parts,
  onPartsChange,
  paidAmount,
  onPaidAmountChange,
  billTotal = 0,
}) {
  const entered = split ? splitPartsTotal(parts) : Number(paidAmount) || 0;
  const remaining = Math.max(Number(billTotal) - entered, 0);

  const updatePart = (index, patch) => {
    onPartsChange(parts.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const fillFull = () => {
    if (!split) {
      onPaidAmountChange(Number(billTotal) || 0);
      return;
    }
    const next = parts.map((row, i) => ({
      ...row,
      amount: i === 0 ? (Number(billTotal) || 0) : '',
    }));
    onPartsChange(next.length ? next : emptySplitParts());
  };

  return (
    <div className="space-y-3">
      <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-200">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={split}
          onChange={(e) => onSplitChange(e.target.checked)}
        />
        <span>
          Split payment
          <span className="block text-xs text-gray-500">Example: ₹1800 GPay and ₹200 cash on the same bill</span>
        </span>
      </label>

      {split ? (
        <div className="space-y-2">
          {parts.map((row, index) => (
            <div key={index} className="flex gap-2">
              <select
                className="input-field text-sm flex-1"
                value={row.mode}
                onChange={(e) => updatePart(index, { mode: e.target.value })}
              >
                {PAYMENT_MODE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                step="0.01"
                className="input-field text-sm w-28"
                placeholder="Amount"
                value={row.amount}
                onChange={(e) => updatePart(index, { amount: e.target.value })}
              />
              {parts.length > 1 && (
                <button
                  type="button"
                  className="text-xs text-red-600 px-1"
                  onClick={() => onPartsChange(parts.filter((_, i) => i !== index))}
                >
                  Remove
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            className="text-xs text-blue-600 hover:underline"
            onClick={() => onPartsChange([...parts, { mode: 'cash', amount: '' }])}
          >
            + Add another mode
          </button>
        </div>
      ) : (
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Payment Mode</label>
          <select value={mode} onChange={(e) => onModeChange(e.target.value)} className="input-field text-sm">
            {PAYMENT_MODE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      )}

      {!split && (
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Amount Paid Now</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={paidAmount}
            onChange={(e) => onPaidAmountChange(e.target.value === '' ? '' : Number(e.target.value))}
            className="input-field text-sm"
            placeholder="0.00"
          />
        </div>
      )}

      <div className="flex items-center justify-between gap-2 text-xs">
        <button type="button" onClick={fillFull} className="text-blue-600 hover:underline">
          Pay full amount
        </button>
        <span className="text-gray-500">
          Entered {money(entered)}
          {Number(billTotal) > 0 ? ` · Left ${money(remaining)}` : ''}
        </span>
      </div>
    </div>
  );
}

export function RecordPaymentForm({ dueAmount, pending, onSubmit }) {
  const [split, setSplit] = React.useState(false);
  const [parts, setParts] = React.useState(emptySplitParts);
  const [mode, setMode] = React.useState('cash');
  const [amount, setAmount] = React.useState(dueAmount ?? '');

  useEffect(() => {
    if (split) setAmount(splitPartsTotal(parts));
  }, [split, parts]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const lines = split ? splitPartsPayload(parts) : [];
        const paid = split ? splitPartsTotal(parts) : Number(amount) || 0;
        const payMode = split
          ? (new Set(lines.map((row) => row.mode)).size > 1 ? 'multiple' : (lines[0]?.mode || 'cash'))
          : mode;
        onSubmit({
          amount: paid,
          mode: payMode,
          payments: lines.length ? lines : undefined,
        });
      }}
      className="p-6 space-y-4"
    >
      <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl text-sm">
        <p className="text-gray-400">Outstanding</p>
        <p className="text-2xl font-bold text-red-600">{money(dueAmount)}</p>
      </div>
      <SplitPaymentBox
        split={split}
        onSplitChange={setSplit}
        mode={mode}
        onModeChange={setMode}
        parts={parts}
        onPartsChange={setParts}
        paidAmount={amount}
        onPaidAmountChange={setAmount}
        billTotal={dueAmount}
      />
      <button type="submit" disabled={pending} className="btn-primary w-full justify-center">
        {pending ? 'Saving...' : 'Confirm Payment'}
      </button>
    </form>
  );
}
