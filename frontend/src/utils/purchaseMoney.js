export const inr = (n) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const RETURN_REASONS = [
  'Expired',
  'Damaged',
  'Wrong Medicine',
  'Wrong Quantity',
  'Supplier Replacement',
  'Quality Issue',
  'Near Expiry',
  'Other',
];

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export const previewLine = (line, gstMode = 'intra') => {
  const qty = Number(line.quantity) || 0;
  const rate = Number(line.purchaseRate) || 0;
  const gross = round2(qty * rate);
  const discount = Math.min(Math.max(Number(line.discount) || 0, 0), gross);
  const taxable = round2(gross - discount);
  const gst = Number(line.gstPercent) || 0;
  const tax = round2(taxable * (gst / 100));
  const cgst = gstMode === 'inter' ? 0 : round2(tax / 2);
  const sgst = gstMode === 'inter' ? 0 : round2(tax - cgst);
  const igst = gstMode === 'inter' ? tax : 0;
  return {
    gross,
    discount,
    taxable,
    tax,
    cgst,
    sgst,
    igst,
    total: round2(taxable + tax),
    physical: qty + (Number(line.freeQuantity) || 0),
  };
};

export const previewInvoice = (lines, overallDiscount = 0, gstMode = 'intra') => {
  const priced = lines.map((line) => previewLine(line, gstMode));
  const base = round2(priced.reduce((s, line) => s + line.taxable, 0));
  const overall = Math.min(Math.max(Number(overallDiscount) || 0, 0), base);
  let allocated = 0;
  const adjusted = priced.map((line, index) => {
    const isLast = index === priced.length - 1;
    const share = !base ? 0 : (isLast ? round2(overall - allocated) : round2(overall * (line.taxable / base)));
    allocated = round2(allocated + share);
    const taxable = round2(line.taxable - share);
    const gst = Number(lines[index].gstPercent) || 0;
    const tax = round2(taxable * (gst / 100));
    const cgst = gstMode === 'inter' ? 0 : round2(tax / 2);
    const sgst = gstMode === 'inter' ? 0 : round2(tax - cgst);
    return { ...line, taxable, tax, cgst, sgst, igst: gstMode === 'inter' ? tax : 0, total: round2(taxable + tax) };
  });
  const gross = round2(adjusted.reduce((s, line) => s + line.gross, 0));
  const taxable = round2(adjusted.reduce((s, line) => s + line.taxable, 0));
  const tax = round2(adjusted.reduce((s, line) => s + line.tax, 0));
  return {
    lines: adjusted,
    gross,
    taxable,
    tax,
    cgst: round2(adjusted.reduce((s, line) => s + line.cgst, 0)),
    sgst: round2(adjusted.reduce((s, line) => s + line.sgst, 0)),
    igst: round2(adjusted.reduce((s, line) => s + line.igst, 0)),
    grand: round2(taxable + tax),
    overall,
  };
};

const esc = (v) => String(v ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

const openPrint = (title, body) => {
  const win = window.open('', '_blank', 'noopener,noreferrer');
  if (!win) return;
  win.document.write(`<!doctype html><html><head><title>${esc(title)}</title>
    <style>
      body { font-family: Segoe UI, sans-serif; color: #0f172a; padding: 24px; }
      h1 { font-size: 20px; margin: 0 0 4px; }
      p { margin: 0; color: #475569; font-size: 13px; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12px; }
      th, td { border-bottom: 1px solid #e2e8f0; padding: 8px 6px; text-align: left; }
      th { font-size: 11px; text-transform: uppercase; color: #64748b; }
      .right { text-align: right; }
      .totals { margin-top: 16px; width: 280px; margin-left: auto; font-size: 13px; }
      .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
    </style></head><body>${body}</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 250);
};

export const printPurchase = (purchase) => {
  const rows = (purchase.items || []).map((item) => `<tr>
    <td>${esc(item.medicineName)}</td>
    <td>${esc(item.batchNumber)}</td>
    <td>${item.expiryDate ? new Date(item.expiryDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : ''}</td>
    <td class="right">${item.quantity}</td>
    <td class="right">${item.freeQuantity || 0}</td>
    <td class="right">${inr(item.purchaseRate)}</td>
    <td class="right">${inr(item.discountAmount)}</td>
    <td class="right">${item.gstPercent || 0}%</td>
    <td class="right">${inr(item.lineTotal)}</td>
  </tr>`).join('');
  openPrint(purchase.supplierInvoiceNumber, `
    <h1>Purchase Invoice</h1>
    <p>${esc(purchase.supplier?.name || purchase.supplierName)} · ${esc(purchase.supplierInvoiceNumber)}</p>
    <p>${purchase.purchaseDate ? new Date(purchase.purchaseDate).toLocaleDateString('en-IN') : ''} · ${esc(purchase.purchaseNumber || '')}</p>
    <table>
      <thead><tr><th>Medicine</th><th>Batch</th><th>Expiry</th><th class="right">Qty</th><th class="right">Free</th><th class="right">Rate</th><th class="right">Discount</th><th class="right">GST</th><th class="right">Total</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="totals">
      <div><span>Gross</span><strong>${inr(purchase.grossPurchaseValue)}</strong></div>
      <div><span>Taxable</span><strong>${inr(purchase.taxableAmount)}</strong></div>
      <div><span>Tax</span><strong>${inr(purchase.taxAmount)}</strong></div>
      <div><span>Grand total</span><strong>${inr(purchase.grandTotal)}</strong></div>
    </div>
  `);
};

export const printReturn = (doc) => {
  const rows = (doc.items || []).map((item) => `<tr>
    <td>${esc(item.medicineName)}</td>
    <td>${esc(item.batchNumber)}</td>
    <td class="right">${item.returnQuantity}</td>
    <td class="right">${inr(item.purchaseRate)}</td>
    <td class="right">${inr(item.returnValue)}</td>
  </tr>`).join('');
  openPrint(doc.returnNumber, `
    <h1>Purchase Return</h1>
    <p>${esc(doc.returnNumber)} · ${esc(doc.supplierName)} · Invoice ${esc(doc.originalInvoice)}</p>
    <p>${doc.returnDate ? new Date(doc.returnDate).toLocaleDateString('en-IN') : ''} · ${esc(doc.reason)}</p>
    <p>${esc(doc.notes || '')}</p>
    <table>
      <thead><tr><th>Medicine</th><th>Batch</th><th class="right">Returned</th><th class="right">Purchase rate</th><th class="right">Return value</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="totals"><div><span>Return value</span><strong>${inr(doc.totalReturnValue)}</strong></div></div>
  `);
};
