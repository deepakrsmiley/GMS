const round2 = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
};

/** One row per advance collected at admission. Older records only have a single amount. */
const linesFromAdmission = (admission) => {
  if (!admission) return [];
  const stored = Array.isArray(admission.advances) ? admission.advances : [];
  const rows = stored
    .filter((row) => round2(row?.amount) > 0)
    .map((row) => ({
      amount: round2(row.amount),
      paidAt: row.paidAt || admission.admissionDate || null,
      mode: row.mode || admission.advancePaymentMode || '',
    }));
  if (rows.length) return rows;
  const amount = round2(admission.advanceAmount);
  if (amount <= 0) return [];
  return [{
    amount,
    paidAt: admission.admissionDate || null,
    mode: admission.advancePaymentMode || '',
  }];
};

const sumLines = (lines) => round2((lines || []).reduce((sum, row) => sum + round2(row.amount), 0));

/** Lines saved on the bill, otherwise the admission advance that belongs on this bill. */
const advanceDisplayLines = (bill) => {
  if (!bill) return [];
  const saved = Array.isArray(bill.advanceLines) ? bill.advanceLines : [];
  const fromBill = saved
    .filter((row) => round2(row?.amount) > 0)
    .map((row) => ({
      amount: round2(row.amount),
      paidAt: row.paidAt || bill.ipAdmission?.admissionDate || null,
      mode: row.mode || '',
    }));
  if (fromBill.length) return fromBill;
  if (round2(bill.advanceAmount) > 0) {
    return [{
      amount: round2(bill.advanceAmount),
      paidAt: bill.ipAdmission?.admissionDate || bill.createdAt || null,
      mode: bill.ipAdmission?.advancePaymentMode || '',
    }];
  }
  return [];
};

const balanceAfterAdvance = (bill, lines = advanceDisplayLines(bill)) => {
  const total = round2(bill?.totalAmount);
  const paid = round2(bill?.paidAmount);
  return round2(Math.max(total - paid - sumLines(lines), 0));
};

module.exports = {
  round2,
  linesFromAdmission,
  sumLines,
  advanceDisplayLines,
  balanceAfterAdvance,
};
