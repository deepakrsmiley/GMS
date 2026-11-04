import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import api from '../../services/api';
import { inr, previewBill } from '../../utils/purchaseMoney';

const todayInput = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

const blankLine = (kind = 'buy') => ({
  key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  kind,
  medicineId: '',
  medicineName: '',
  sellingPrice: '',
  mrp: '',
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
  batches: [],
  stockPieces: 0,
  pieceRate: '',
});

const monthValue = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 7);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${date.getFullYear()}-${month}`;
};

const rateForUnit = (pieceRate, unit, packSize) => {
  const piece = Number(pieceRate) || 0;
  if (!piece) return '';
  if (unit === 'strip') {
    const pack = Number(packSize) >= 1 ? Number(packSize) : 1;
    return String(Number((piece * pack).toFixed(2)));
  }
  return String(piece);
};

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
    () => previewBill(lines, header.overallDiscount, header.gstMode),
    [lines, header.overallDiscount, header.gstMode],
  );

  const searchMedicine = async (key, value, kind) => {
    setLine(key, { search: value, open: true, medicineId: '', medicineName: '' });
    if (value.trim().length < 2) {
      setLine(key, { results: [] });
      return;
    }
    const params = { q: value.trim() };
    if (kind !== 'return') params.catalog = 1;
    const res = await api.get('/pharmacy/search', { params });
    setLine(key, { results: res.data.data || [], open: true });
  };

  const applyReturnBatch = (row, batch) => {
    const piece = Number(batch?.purchasePrice) || Number(row.pieceRate) || 0;
    const pieceMrp = batch?.mrp != null && batch.mrp !== '' ? Number(batch.mrp) : '';
    const unit = row.quantityUnit === 'strip' ? 'strip' : 'pcs';
    const pack = unit === 'strip' ? (Number(row.packSize) >= 1 ? Number(row.packSize) : 1) : 1;
    const mrp = pieceMrp === '' ? row.mrp : (unit === 'strip' ? Number((pieceMrp * pack).toFixed(2)) : pieceMrp);
    return {
      batchNumber: batch?.batchNumber || '',
      expiry: monthValue(batch?.expiryDate),
      stockPieces: Number(batch?.quantity) || 0,
      pieceRate: piece,
      purchaseRate: rateForUnit(piece, unit, pack),
      mrp,
    };
  };

  const pickMedicine = (key, medicine) => {
    setLines((rows) => rows.map((row) => {
      if (row.key !== key) return row;
      if (row.kind === 'return') {
        const batches = medicine.usableBatches || [];
        if (!batches.length) {
          return {
            ...row,
            search: medicine.name,
            open: false,
            results: [],
            medicineId: '',
            medicineName: '',
            lineNote: `${medicine.name} is not in stock, so it cannot be returned on this bill.`,
          };
        }
        const unit = medicine.unitOfMeasure === 'strip' ? 'strip' : 'pcs';
        const pack = Number(medicine.unitsPerStrip) >= 1 ? String(medicine.unitsPerStrip) : '';
        const next = {
          ...row,
          medicineId: medicine._id,
          medicineName: medicine.name,
          sellingPrice: medicine.sellingPrice,
          gstPercent: medicine.gstPercent ?? 0,
          quantityUnit: unit,
          packSize: unit === 'strip' ? pack : '',
          batches,
          freeQuantity: '',
          search: medicine.name,
          open: false,
          results: [],
          lineNote: '',
        };
        return { ...next, ...applyReturnBatch(next, batches[0]) };
      }
      const pack = row.packSize || medicine.unitsPerStrip || '';
      const pieceMrp = medicine.mrp != null && medicine.mrp !== '' ? Number(medicine.mrp) : '';
      const stripQty = row.quantityUnit === 'strip' && Number(pack) >= 1;
      const mrp = pieceMrp === '' ? '' : (stripQty ? Number((pieceMrp * Number(pack)).toFixed(2)) : pieceMrp);
      return {
        ...row,
        medicineId: medicine._id,
        medicineName: medicine.name,
        sellingPrice: medicine.sellingPrice,
        mrp,
        gstPercent: medicine.gstPercent ?? 0,
        packSize: pack,
        search: medicine.name,
        open: false,
        results: [],
        lineNote: '',
      };
    }));
  };

  const payload = () => {
    const chosen = lines.filter((line) => line.medicineId);
    const mapMoney = (line) => ({
      medicineId: line.medicineId,
      medicineName: line.medicineName,
      batchNumber: line.batchNumber,
      quantityUnit: line.quantityUnit === 'strip' ? 'strip' : 'pcs',
      packSize: line.quantityUnit === 'strip' ? Number(line.packSize) : 1,
      quantity: Number(line.quantity),
      purchaseRate: Number(line.purchaseRate),
      discount: Number(line.discount) || 0,
      gstPercent: Number(line.gstPercent) || 0,
    });
    return {
      ...header,
      overallDiscount: Number(header.overallDiscount) || 0,
      items: chosen.filter((line) => line.kind !== 'return').map((line) => ({
        ...mapMoney(line),
        expiryDate: line.expiry,
        freeQuantity: Number(line.freeQuantity) || 0,
        discountAmount: Number(line.discount) || 0,
        mrp: line.mrp === '' || line.mrp == null ? undefined : Number(line.mrp),
      })),
      returns: chosen.filter((line) => line.kind === 'return').map(mapMoney),
    };
  };

  const save = async (print) => {
    setError('');
    const body = payload();
    if (!body.supplier || !body.supplierInvoiceNumber.trim()) {
      setError('Supplier and invoice number are required.');
      return;
    }
    if (!body.items.length) {
      setError('Add a medicine you are buying. Mark a line as Return to deduct it on this bill.');
      return;
    }
    const overReturn = lines.find((line) => {
      if (line.kind !== 'return' || !line.medicineId) return false;
      const qty = Number(line.quantity) || 0;
      if (!line.batchNumber || qty <= 0) return true;
      const pack = line.quantityUnit === 'strip' ? (Number(line.packSize) || 1) : 1;
      return qty * pack > (Number(line.stockPieces) || 0) + 0.001;
    });
    if (overReturn) {
      const qty = Number(overReturn.quantity) || 0;
      setError(qty <= 0 || !overReturn.batchNumber
        ? `Enter the batch and quantity to return for ${overReturn.medicineName}.`
        : `${overReturn.medicineName} batch ${overReturn.batchNumber} does not have enough stock to return.`);
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
            <p>Buy adds stock. Return takes that amount off this bill and reduces stock you already have.</p>
          </div>
        </header>
        <div className="pur-card__body">
          <div className="pur-lines">
            {lines.map((line, index) => {
              const lineTotal = totals.lineTotals[index];
              const isReturn = line.kind === 'return';
              const stockPcs = !isReturn && line.quantityUnit === 'strip' && Number(line.packSize) >= 1
                ? (Number(line.quantity) + (Number(line.freeQuantity) || 0)) * Number(line.packSize)
                : 0;
              const returnPieces = isReturn && line.quantityUnit === 'strip' && Number(line.packSize) >= 1
                ? Number(line.quantity || 0) * Number(line.packSize)
                : 0;
              return (
                <article key={line.key} className={`pur-line ${isReturn ? 'pur-line--return' : ''}`}>
                  <div className="pur-line__top">
                    <span className="pur-line__num">{index + 1}</span>
                    <div className="pur-line__search">
                      <div className="pur-line__kind">
                        <div className="pur-unit pur-kind" role="group" aria-label="Line type">
                          <button type="button" className={!isReturn ? 'is-on' : ''} onClick={() => setLines((rows) => rows.map((row) => (row.key === line.key ? { ...blankLine('buy'), key: line.key } : row)))}>Buy</button>
                          <button type="button" className={isReturn ? 'is-on' : ''} onClick={() => setLines((rows) => rows.map((row) => (row.key === line.key ? { ...blankLine('return'), key: line.key } : row)))}>Return</button>
                        </div>
                        {isReturn && <span className="pur-return-tag">Sales return</span>}
                      </div>
                      <Field label="Medicine">
                        <input
                          className="input-field text-sm"
                          value={line.search}
                          placeholder={isReturn ? 'Search medicine already in stock' : 'Search medicine name'}
                          onChange={(e) => searchMedicine(line.key, e.target.value, line.kind)}
                          onFocus={() => line.results?.length && setLine(line.key, { open: true })}
                        />
                      </Field>
                      {line.lineNote && <p className="pur-hint pur-hint--warn">{line.lineNote}</p>}
                      {line.medicineName && !isReturn && (
                        <p className="pur-hint">Billing price {inr(line.sellingPrice)} stays unchanged</p>
                      )}
                      {isReturn && line.medicineName && (
                        <p className="pur-hint">In stock: {line.stockPieces || 0} pcs. You cannot return more than this.</p>
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
                    <Field label={isReturn ? 'Batch in stock' : 'Batch'}>
                      {isReturn ? (
                        <select
                          className="input-field text-sm"
                          value={line.batchNumber}
                          disabled={!line.batches?.length}
                          onChange={(e) => {
                            const batch = (line.batches || []).find((item) => item.batchNumber === e.target.value);
                            setLine(line.key, applyReturnBatch(line, batch));
                          }}
                        >
                          {!line.batches?.length && <option value="">Select a medicine in stock</option>}
                          {(line.batches || []).map((batch) => (
                            <option key={batch.batchNumber} value={batch.batchNumber}>
                              {batch.batchNumber} · {batch.quantity} in stock
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input className="input-field text-sm" value={line.batchNumber} onChange={(e) => setLine(line.key, { batchNumber: e.target.value })} />
                      )}
                    </Field>
                    <Field label="Expiry">
                      <input type="month" className="input-field text-sm" value={line.expiry} disabled={isReturn} onChange={(e) => setLine(line.key, { expiry: e.target.value })} />
                    </Field>
                    <Field label="Unit">
                      <div className="pur-unit">
                        <button type="button" className={line.quantityUnit === 'pcs' ? 'is-on' : ''} onClick={() => setLine(line.key, { quantityUnit: 'pcs', purchaseRate: isReturn ? rateForUnit(line.pieceRate, 'pcs', line.packSize) : line.purchaseRate })}>Pcs</button>
                        <button type="button" className={line.quantityUnit === 'strip' ? 'is-on' : ''} onClick={() => setLine(line.key, { quantityUnit: 'strip', purchaseRate: isReturn ? rateForUnit(line.pieceRate, 'strip', line.packSize || 1) : line.purchaseRate })}>Strip</button>
                      </div>
                    </Field>
                    <Field label={line.quantityUnit === 'strip' ? 'Strips' : 'Quantity'}>
                      <input type="number" min="0" className="input-field text-sm" value={line.quantity} onChange={(e) => setLine(line.key, { quantity: e.target.value })} />
                      {stockPcs > 0 && <p className="pur-hint">Adds {stockPcs} pcs to stock</p>}
                      {returnPieces > 0 && <p className="pur-hint">Removes {returnPieces} pcs from stock</p>}
                    </Field>
                    {line.quantityUnit === 'strip' && (
                      <Field label="Pcs in one strip">
                        <input
                          type="number"
                          min="1"
                          step="1"
                          className="input-field text-sm"
                          value={line.packSize}
                          placeholder="10"
                          onChange={(e) => setLine(line.key, {
                            packSize: e.target.value,
                            purchaseRate: isReturn ? rateForUnit(line.pieceRate, 'strip', e.target.value) : line.purchaseRate,
                          })}
                        />
                      </Field>
                    )}
                    {!isReturn && (
                      <Field label={line.quantityUnit === 'strip' ? 'Free strips' : 'Free pcs'}>
                        <input type="number" min="0" className="input-field text-sm" value={line.freeQuantity} onChange={(e) => setLine(line.key, { freeQuantity: e.target.value })} />
                      </Field>
                    )}
                    <Field label={line.quantityUnit === 'strip' ? 'Rate per strip' : 'Rate per pc'}>
                      <input type="number" min="0" step="0.01" className="input-field text-sm" value={line.purchaseRate} onChange={(e) => setLine(line.key, { purchaseRate: e.target.value })} />
                    </Field>
                    <Field label={line.quantityUnit === 'strip' ? 'MRP per strip' : 'MRP per pc'}>
                      <input type="number" min="0" step="0.01" className="input-field text-sm" value={line.mrp} onChange={(e) => setLine(line.key, { mrp: e.target.value })} placeholder="Pack MRP" />
                    </Field>
                    <Field label="Discount">
                      <input type="number" min="0" step="0.01" className="input-field text-sm" value={line.discount} onChange={(e) => setLine(line.key, { discount: e.target.value })} />
                    </Field>
                    <Field label="GST %">
                      <input type="number" min="0" step="0.01" className="input-field text-sm" value={line.gstPercent} onChange={(e) => setLine(line.key, { gstPercent: e.target.value })} />
                    </Field>
                  </div>
                  <div className={`pur-line__foot ${isReturn ? 'pur-line__foot--return' : ''}`}>
                    <span>{isReturn ? 'Return' : 'Line total'}</span>
                    <strong className="tabular-nums">{isReturn ? `− ${inr(lineTotal)}` : inr(lineTotal)}</strong>
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
        <div className="pur-stats pur-stats--bill">
          <Stat label="Purchase" value={inr(totals.grand)} />
          <Stat label="Return" value={inr(totals.returnTotal)} credit />
          <Stat label="Net payable" value={inr(totals.netPayable)} total />
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

function Stat({ label, value, total, credit }) {
  return (
    <div className={`pur-stat ${total ? 'pur-stat--total' : ''} ${credit ? 'pur-stat--return' : ''}`}>
      <span>{label}</span>
      <strong className="tabular-nums">{value}</strong>
    </div>
  );
}
