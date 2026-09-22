const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const round4 = (n) => Math.round((Number(n) + Number.EPSILON) * 10000) / 10000;

const RETURN_REASONS = [
  'Expired',
  'Damaged',
  'Wrong Medicine',
  'Wrong Quantity',
  'Supplier Replacement',
  'Quality Issue',
  'Near Expiry',
  'Other',
];

const PAYMENT_TYPES = ['cash', 'credit', 'upi', 'card', 'cheque', 'neft'];
const PAYMENT_STATUSES = ['unpaid', 'partial', 'paid'];
const GST_MODES = ['intra', 'inter'];

const fail = (message, statusCode = 400) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

const splitTax = (tax, gstMode = 'intra') => {
  const amount = round2(tax);
  if (gstMode === 'inter') return { cgst: 0, sgst: 0, igst: amount };
  const cgst = round2(amount / 2);
  const sgst = round2(amount - cgst);
  return { cgst, sgst, igst: 0 };
};

/**
 * Last calendar day of a month. Accepts YYYY-MM, YYYY-MM-DD, MM/YYYY, or a Date.
 */
const parseExpiry = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const s = String(value || '').trim();
  if (!s) throw fail('Expiry date is required');

  const isoMonth = s.match(/^(\d{4})-(\d{2})$/);
  const slash = s.match(/^(\d{1,2})\/(\d{4})$/);
  let year;
  let month;
  if (isoMonth) {
    year = Number(isoMonth[1]);
    month = Number(isoMonth[2]);
  } else if (slash) {
    month = Number(slash[1]);
    year = Number(slash[2]);
  } else {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) throw fail('Invalid expiry date');
    return d;
  }
  if (month < 1 || month > 12) throw fail('Invalid expiry date');
  return new Date(year, month, 0, 12, 0, 0, 0);
};

const calcLine = ({
  quantity,
  purchaseRate,
  discount = 0,
  gstPercent = 0,
  gstMode = 'intra',
} = {}) => {
  const qty = Number(quantity);
  const rate = Number(purchaseRate);
  if (!Number.isFinite(qty) || qty <= 0) throw fail('Quantity must be greater than zero');
  if (!Number.isFinite(rate) || rate < 0) throw fail('Purchase rate cannot be negative');

  const gross = round2(qty * rate);
  const requestedDisc = Number(discount) || 0;
  if (requestedDisc < 0) throw fail('Discount cannot be negative');
  if (requestedDisc > gross) throw fail('Discount cannot exceed the line amount');
  const disc = round2(requestedDisc);
  const taxable = round2(gross - disc);
  const gst = Number(gstPercent) || 0;
  if (gst < 0 || gst > 100) throw fail('GST percent must be between 0 and 100');
  const tax = round2(taxable * (gst / 100));
  const split = splitTax(tax, gstMode === 'inter' ? 'inter' : 'intra');
  return {
    quantity: qty,
    purchaseRate: round2(rate),
    grossAmount: gross,
    discountAmount: disc,
    taxableAmount: taxable,
    gstPercent: gst,
    taxAmount: tax,
    ...split,
    lineTotal: round2(taxable + tax),
  };
};

const applyOverallDiscount = (lines, overallDiscount = 0, gstMode = 'intra') => {
  const base = round2(lines.reduce((sum, line) => sum + line.taxableAmount, 0));
  const requested = Number(overallDiscount) || 0;
  if (requested < 0) throw fail('Overall discount cannot be negative');
  if (requested > base) throw fail('Overall discount cannot exceed the taxable amount');
  const overall = round2(requested);
  let allocated = 0;

  const next = lines.map((line, index) => {
    const isLast = index === lines.length - 1;
    const share = !base
      ? 0
      : (isLast
        ? round2(overall - allocated)
        : round2(overall * (line.taxableAmount / base)));
    allocated = round2(allocated + share);
    const taxable = round2(line.taxableAmount - share);
    const tax = round2(taxable * ((line.gstPercent || 0) / 100));
    const split = splitTax(tax, gstMode === 'inter' ? 'inter' : 'intra');
    return {
      ...line,
      overallDiscountShare: share,
      taxableAmount: taxable,
      taxAmount: tax,
      ...split,
      lineTotal: round2(taxable + tax),
    };
  });

  return { lines: next, overallDiscount: overall };
};

const summarizePurchase = (rawLines, overallDiscount = 0, gstMode = 'intra') => {
  const priced = rawLines.map((line) => calcLine({ ...line, gstMode }));
  const adjusted = applyOverallDiscount(priced, overallDiscount, gstMode);
  const lines = adjusted.lines;
  const grossPurchaseValue = round2(lines.reduce((s, l) => s + l.grossAmount, 0));
  const itemDiscountTotal = round2(lines.reduce((s, l) => s + l.discountAmount, 0));
  const taxableAmount = round2(lines.reduce((s, l) => s + l.taxableAmount, 0));
  const taxAmount = round2(lines.reduce((s, l) => s + l.taxAmount, 0));
  const cgstTotal = round2(lines.reduce((s, l) => s + l.cgst, 0));
  const sgstTotal = round2(lines.reduce((s, l) => s + l.sgst, 0));
  const igstTotal = round2(lines.reduce((s, l) => s + l.igst, 0));
  const netPurchaseValue = taxableAmount;
  const grandTotal = round2(taxableAmount + taxAmount);
  return {
    lines,
    grossPurchaseValue,
    itemDiscountTotal,
    overallDiscount: adjusted.overallDiscount,
    taxableAmount,
    taxAmount,
    cgstTotal,
    sgstTotal,
    igstTotal,
    netPurchaseValue,
    grandTotal,
  };
};

const physicalQty = (paid, free = 0) => {
  const p = Number(paid) || 0;
  const f = Number(free) || 0;
  if (f < 0) throw fail('Free quantity cannot be negative');
  return round2(p + f);
};

const effectiveUnitCost = (netValue, units) => {
  const u = Number(units) || 0;
  if (u <= 0) return 0;
  return round4(Number(netValue) / u);
};

const stockValue = (quantity, purchaseRate) =>
  round2((Number(quantity) || 0) * (Number(purchaseRate) || 0));

const returnValue = (quantity, purchaseRate) => stockValue(quantity, purchaseRate);

const returnableQuantity = ({
  purchasedQty = 0,
  freeQty = 0,
  returnedQty = 0,
  batchQty = 0,
} = {}) => {
  const received = physicalQty(purchasedQty, freeQty);
  const remainingOnInvoice = Math.max(0, round2(received - (Number(returnedQty) || 0)));
  const onHand = Math.max(0, Number(batchQty) || 0);
  const available = Math.max(0, Math.min(remainingOnInvoice, onHand));
  return { received, remainingOnInvoice, onHand, available };
};

const assertReturnQuantity = (requested, available, { remainingOnInvoice = available } = {}) => {
  const qty = Number(requested);
  if (!Number.isFinite(qty) || qty <= 0) throw fail('Return quantity must be greater than zero');
  if (remainingOnInvoice <= 0) throw fail('This batch has already been fully returned.');
  if (qty > available) throw fail('Return quantity cannot exceed available quantity.');
  return qty;
};

const creditPortion = (grandTotal, paymentStatus, amountPaid = 0) => {
  const total = round2(grandTotal);
  if (paymentStatus === 'paid') return { amountPaid: total, credit: 0 };
  const paid = round2(Math.min(Math.max(Number(amountPaid) || 0, 0), total));
  return { amountPaid: paid, credit: round2(total - paid) };
};

const returnStatusOf = (items = []) => {
  const received = items.reduce((s, item) => s + physicalQty(item.quantity, item.freeQuantity), 0);
  const returned = items.reduce((s, item) => s + (Number(item.returnedQuantity) || 0), 0);
  if (returned <= 0) return 'none';
  if (returned + 0.0001 >= received) return 'full';
  return 'partial';
};

module.exports = {
  round2,
  round4,
  RETURN_REASONS,
  PAYMENT_TYPES,
  PAYMENT_STATUSES,
  GST_MODES,
  parseExpiry,
  calcLine,
  applyOverallDiscount,
  summarizePurchase,
  physicalQty,
  effectiveUnitCost,
  stockValue,
  returnValue,
  returnableQuantity,
  assertReturnQuantity,
  creditPortion,
  returnStatusOf,
};
