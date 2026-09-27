import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import api from '../../services/api';
import { inr, previewInvoice } from '../../utils/purchaseMoney';

const todayInput = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

const blankLine = () => ({
  key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  medicineId: '',
  medicineName: '',
  sellingPrice: '',
  batchNumber: '',
  expiry: '',
  quantityUnit: 'pcs',
  packSize: '',
  quantity: '',
  freeQuantity: '',
  purchaseRate: '',
  discount: '',
  gstPercent: '',
  search: '',
  open: false,
});

export default function PurchaseEntry({ onSaved }) {
  const [header, setHeader] = useState({
    supplier: '',
    supplierInvoiceNumber: '',
    purchaseDate: todayInput(),
    dueDate: '',
    paymentType: 'credit',
    paymentStatus: 'unpaid',
    referenceNumber: '',
    notes: '',
    gstMode: 'intra',
    overallDiscount: '',
  });
  const [lines, setLines] = useState([blankLine()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => api.get('/suppliers?limit=200').then((r) => r.data),
  });
  const suppliers = (suppliersData?.data || []).filter((s) => s.isActive !== false);

  const setLine = (key, patch) => {
    setLines((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const totals = useMemo(
    () => previewInvoice(lines, header.overallDiscount, header.gstMode),
    [lines, header.overallDiscount, header.gstMode],
  );

  const searchMedicine = async (key, value) => {
    setLine(key, { search: value, open: true, medicineId: '', medicineName: '' });
    if (value.trim().length < 2) {
      setLine(key, { results: [] });
      return;
    }
    const res = await api.get('/pharmacy/search', { params: { q: value.trim(), catalog: 1 } });
    setLine(key, { results: res.data.data || [], open: true });
  };

  const pickMedicine = (key, medicine) => {
    setLine(key, {
      medicineId: medicine._id,
      medicineName: medicine.name,
      sellingPrice: medicine.sellingPrice,
      gstPercent: medicine.gstPercent ?? 0,
      packSize: medicine.unitsPerStrip || '',
      search: medicine.name,
      open: false,
      results: [],
    });
  };

  const payload = () => ({
    ...header,
    overallDiscount: Number(header.overallDiscount) || 0,
    items: lines.filter((line) => line.medicineId).map((line) => ({
      medicineId: line.medicineId,
      batchNumber: line.batchNumber,
      expiryDate: line.expiry,
      quantityUnit: line.quantityUnit === 'strip' ? 'strip' : 'pcs',
      packSize: line.quantityUnit === 'strip' ? Number(line.packSize) : 1,
      quantity: Number(line.quantity),
      freeQuantity: Number(line.freeQuantity) || 0,
      purchaseRate: Number(line.purchaseRate),
      discountAmount: Number(line.discount) || 0,
      gstPercent: Number(line.gstPercent) || 0,
    })),
  });

  const save = async (print) => {
    setError('');
    const body = payload();
    if (!body.supplier || !body.supplierInvoiceNumber.trim()) {
      setError('Supplier and invoice number are required.');
      return;
    }
    if (!body.items.length) {
      setError('Add a medicine from the medicine master.');
      return;
    }
    const stripMissing = lines.some((line) => {
      if (!line.medicineId || line.quantityUnit !== 'strip') return false;
      const pack = Number(line.packSize);
      return !Number.isInteger(pack) || pack < 1;
    });
    if (stripMissing) {
      setError('For a strip, enter how many pcs are in one strip.');
      return;
    }
    setSaving(true);
    try {
      const res = await api.post('/pharmacy/purchases', body);
      setHeader((h) => ({
        ...h,
        supplierInvoiceNumber: '',
        referenceNumber: '',
        notes: '',
        overallDiscount: '',
      }));
      setLines([blankLine()]);
      onSaved?.(res.data.data, print);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save this purchase.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="pur-card">
        <header className="pur-card__head">
          <div>
            <h2>Supplier invoice</h2>
            <p>Enter the bill first. Each medicine can be added as pieces or as strips. Selling price on the bill stays unchanged.</p>
          </div>
        </header>
        <div className="pur-card__body">
          <div className="pur-grid">
            <Field label="Supplier" className="pur-field--wide">
              <select className="input-field text-sm" value={header.supplier} onChange={(e) => setHeader({ ...header, supplier: e.target.value })}>
                <option value="">Select supplier</option>
                {suppliers.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Invoice number">
              <input className="input-field text-sm" value={header.supplierInvoiceNumber} onChange={(e) => setHeader({ ...header, supplierInvoiceNumber: e.target.value })} placeholder="INV-10245" />
            </Field>
            <Field label="Purchase date">
              <input type="date" className="input-field text-sm" value={header.purchaseDate} onChange={(e) => setHeader({ ...header, purchaseDate: e.target.value })} />
            </Field>
            <Field label="Due date">
              <input type="date" className="input-field text-sm" value={header.dueDate} onChange={(e) => setHeader({ ...header, dueDate: e.target.value })} />
            </Field>
            <Field label="Payment type">
              <select className="input-field text-sm" value={header.paymentType} onChange={(e) => setHeader({ ...header, paymentType: e.target.value })}>
                <option value="credit">Credit</option>
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="card">Card</option>
                <option value="cheque">Cheque</option>
                <option value="neft">NEFT</option>
              </select>
            </Field>
            <Field label="Payment status">
              <select className="input-field text-sm" value={header.paymentStatus} onChange={(e) => setHeader({ ...header, paymentStatus: e.target.value })}>
                <option value="unpaid">Unpaid</option>
                <option value="partial">Partial</option>
                <option value="paid">Paid</option>
              </select>
            </Field>
            <Field label="GST">
              <select className="input-field text-sm" value={header.gstMode} onChange={(e) => setHeader({ ...header, gstMode: e.target.value })}>
                <option value="intra">Within state (CGST + SGST)</option>
                <option value="inter">Other state (IGST)</option>
              </select>
            </Field>
            <details className="pur-more">
              <summary>Reference and notes</summary>
              <div className="pur-more__grid">
                <Field label="Reference number">
                  <input className="input-field text-sm" value={header.referenceNumber} onChange={(e) => setHeader({ ...header, referenceNumber: e.target.value })} />
                </Field>
                <Field label="Notes">
                  <input className="input-field text-sm" value={header.notes} onChange={(e) => setHeader({ ...header, notes: e.target.value })} />
                </Field>
              </div>
            </details>
          </div>
        </div>
      </section>

      <section className="pur-card">
        <header className="pur-card__head">
          <div>
            <h2>Medicines</h2>
            <p>Strip quantity is stored as pieces. Example: 10 strips × 10 pcs adds 100 pcs to stock. Rate follows the unit you choose.</p>
          </div>
        </header>
        <div className="pur-card__body">
          <div className="pur-lines">
            {lines.map((line, index) => {
              const priced = totals.lines[index];
              const stockPcs = line.quantityUnit === 'strip' && Number(line.packSize) >= 1
                ? (Number(line.quantity) + (Number(line.freeQuantity) || 0)) * Number(line.packSize)
                : 0;
              return (
                <article key={line.key} className="pur-line">
                  <div className="pur-line__top">
                    <span className="pur-line__num">{index + 1}</span>
                    <div className="pur-line__search">
                      <Field label="Medicine">
                        <input
                          className="input-field text-sm"
                          value={line.search}
                          placeholder="Search medicine name"
                          onChange={(e) => searchMedicine(line.key, e.target.value)}
                          onFocus={() => line.results?.length && setLine(line.key, { open: true })}
                        />
                      </Field>
                      {line.medicineName && (
                        <p className="pur-hint">Billing price {inr(line.sellingPrice)} stays unchanged</p>
                      )}
                      {line.open && line.results?.length > 0 && (
                        <div className="pur-suggest">
                          {line.results.map((med) => (
                            <button type="button" key={med._id} onClick={() => pickMedicine(line.key, med)}>
                              <strong>{med.name}</strong>
                              <span>{med.genericName || 'Medicine master'}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      className="pur-icon-btn"
                      aria-label="Remove medicine"
                      onClick={() => setLines((rows) => (rows.length === 1 ? [blankLine()] : rows.filter((r) => r.key !== line.key)))}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <div className="pur-line__grid">
                    <Field label="Batch">
                      <input className="input-field text-sm" value={line.batchNumber} onChange={(e) => setLine(line.key, { batchNumber: e.target.value })} />
                    </Field>
                    <Field label="Expiry">
                      <input type="month" className="input-field text-sm" value={line.expiry} onChange={(e) => setLine(line.key, { expiry: e.target.value })} />
                    </Field>
                    <Field label="Unit">
                      <div className="pur-unit">
                        <button type="button" className={line.quantityUnit === 'pcs' ? 'is-on' : ''} onClick={() => setLine(line.key, { quantityUnit: 'pcs' })}>Pcs</button>
                        <button type="button" className={line.quantityUnit === 'strip' ? 'is-on' : ''} onClick={() => setLine(line.key, { quantityUnit: 'strip' })}>Strip</button>
                      </div>
                    </Field>
                    <Field label={line.quantityUnit === 'strip' ? 'Strips' : 'Quantity'}>
                      <input type="number" min="0" className="input-field text-sm" value={line.quantity} onChange={(e) => setLine(line.key, { quantity: e.target.value })} />
                      {stockPcs > 0 && <p className="pur-hint">Adds {stockPcs} pcs to stock</p>}
                    </Field>
                    {line.quantityUnit === 'strip' && (
                      <Field label="Pcs in one strip">
                        <input type="number" min="1" step="1" className="input-field text-sm" value={line.packSize} placeholder="10" onChange={(e) => setLine(line.key, { packSize: e.target.value })} />
                      </Field>
                    )}
                    <Field label={line.quantityUnit === 'strip' ? 'Free strips' : 'Free pcs'}>
                      <input type="number" min="0" className="input-field text-sm" value={line.freeQuantity} onChange={(e) => setLine(line.key, { freeQuantity: e.target.value })} />
                    </Field>
                    <Field label={line.quantityUnit === 'strip' ? 'Rate per strip' : 'Rate per pc'}>
                      <input type="number" min="0" step="0.01" className="input-field text-sm" value={line.purchaseRate} onChange={(e) => setLine(line.key, { purchaseRate: e.target.value })} />
                    </Field>
                    <Field label="Discount">
                      <input type="number" min="0" step="0.01" className="input-field text-sm" value={line.discount} onChange={(e) => setLine(line.key, { discount: e.target.value })} />
                    </Field>
                    <Field label="GST %">
                      <input type="number" min="0" step="0.01" className="input-field text-sm" value={line.gstPercent} onChange={(e) => setLine(line.key, { gstPercent: e.target.value })} />
                    </Field>
                  </div>
                  <div className="pur-line__foot">
                    <span>Line total</span>
                    <strong className="tabular-nums">{inr(priced?.total)}</strong>
                  </div>
                </article>
              );
            })}
          </div>
          <button type="button" className="pur-add" onClick={() => setLines((rows) => [...rows, blankLine()])}>
            <Plus size={16} /> Add medicine
          </button>
        </div>
      </section>

      <section className="pur-card pur-summary">
        {error && <p className="pur-error">{error}</p>}
        <Field label="Overall discount">
          <input type="number" min="0" className="input-field text-sm" value={header.overallDiscount} onChange={(e) => setHeader({ ...header, overallDiscount: e.target.value })} />
        </Field>
        <div className="pur-stats">
          <Stat label="Gross" value={inr(totals.gross)} />
          <Stat label="Taxable" value={inr(totals.taxable)} />
          <Stat label={header.gstMode === 'inter' ? 'IGST' : 'CGST + SGST'} value={inr(totals.tax)} />
          <Stat label="Grand total" value={inr(totals.grand)} total />
        </div>
        <div className="pur-actions">
          <button type="button" className="btn-primary" disabled={saving} onClick={() => save(false)}>Save purchase</button>
          <button type="button" className="btn-secondary" disabled={saving} onClick={() => save(true)}>Save and print</button>
          <button type="button" className="btn-secondary" onClick={() => { setLines([blankLine()]); setError(''); }}>Clear</button>
        </div>
      </section>
    </div>
  );
}

function Field({ label, children, className = '' }) {
  return (
    <label className={`pur-field ${className}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value, total }) {
  return (
    <div className={`pur-stat ${total ? 'pur-stat--total' : ''}`}>
      <span>{label}</span>
      <strong className="tabular-nums">{value}</strong>
    </div>
  );
}
