import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowRight, FileEdit, Layers, Lock, Send } from 'lucide-react';
import api from '../../services/api';
import Modal from '../common/Modal';
import '../../styles/assetMaster.css';
import '../../styles/medicineEditRequest.css';

const MEDICINE_FIELDS = [
  { field: 'gstPercent', label: 'GST %' },
  { field: 'sellingPrice', label: 'Default selling price' },
  { field: 'purchasePrice', label: 'Default purchase price' },
  { field: 'name', label: 'Medicine name' },
  { field: 'genericName', label: 'Generic name' },
  { field: 'category', label: 'Category' },
  { field: 'minimumStock', label: 'Minimum stock' },
  { field: 'manufacturer', label: 'Manufacturer' },
];

const BATCH_FIELDS = [
  { field: 'batchNumber', label: 'Batch number' },
  { field: 'expiryDate', label: 'Expiry date' },
  { field: 'quantity', label: 'Quantity' },
  { field: 'sellingPrice', label: 'Selling price' },
  { field: 'purchasePrice', label: 'Purchase price' },
  { field: 'mrp', label: 'MRP' },
  { field: 'manufacturer', label: 'Manufacturer' },
];

const fmtDate = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d);
  return dt.toISOString().slice(0, 10);
};

const activeBatches = (medicine) =>
  (medicine?.batches || []).filter((b) => !b.isDisposed);

/**
 * Request Super Admin approval for:
 *  - Medicine master fields (name, GST, default prices…), OR
 *  - One specific batch (of many) — expiry, qty, batch prices, batch no.
 */
export default function MedicineEditRequestModal({ medicine, isOpen, onClose, initialBatchId = null }) {
  const qc = useQueryClient();
  const batches = useMemo(() => activeBatches(medicine), [medicine]);

  const [scope, setScope] = useState('medicine'); // medicine | batch
  const [batchId, setBatchId] = useState('');
  const [field, setField] = useState('gstPercent');
  const [requestedValue, setRequestedValue] = useState('');
  const [whatIsWrong, setWhatIsWrong] = useState('');
  const [requestedChange, setRequestedChange] = useState('');
  const [reason, setReason] = useState('');

  const selectedBatch = useMemo(
    () => batches.find((b) => String(b._id) === String(batchId)) || null,
    [batches, batchId],
  );

  const fieldOptions = scope === 'batch' ? BATCH_FIELDS : MEDICINE_FIELDS;
  const opt = fieldOptions.find((f) => f.field === field) || fieldOptions[0];

  const currentVal = useMemo(() => {
    if (scope === 'batch') {
      if (!selectedBatch) return '';
      if (field === 'expiryDate') return fmtDate(selectedBatch.expiryDate);
      return selectedBatch[field] ?? '';
    }
    return medicine?.[field] ?? '';
  }, [scope, selectedBatch, field, medicine]);

  useEffect(() => {
    if (!isOpen || !medicine) return;
    setReason('');
    setRequestedValue('');
    const preferBatch = initialBatchId && batches.some((b) => String(b._id) === String(initialBatchId));
    if (preferBatch) {
      setScope('batch');
      setBatchId(String(initialBatchId));
      setField('expiryDate');
    } else if (batches.length > 0 && !preferBatch) {
      setScope('medicine');
      setBatchId(batches[0] ? String(batches[0]._id) : '');
      setField('gstPercent');
    } else {
      setScope('medicine');
      setBatchId('');
      setField('gstPercent');
    }
  }, [isOpen, medicine, initialBatchId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!medicine) return;
    const label = opt?.label || field;
    const cur = currentVal === '' || currentVal == null ? '—' : currentVal;
    const batchTag = scope === 'batch' && selectedBatch
      ? `Batch ${selectedBatch.batchNumber}`
      : 'Medicine master';
    setWhatIsWrong(`Current (${batchTag}):\n${label}: ${cur}`);
    if (requestedValue !== '') {
      setRequestedChange(`Requested (${batchTag}):\n${label}: ${requestedValue}`);
    } else {
      setRequestedChange('');
    }
  }, [field, scope, selectedBatch, medicine, currentVal]); // eslint-disable-line react-hooks/exhaustive-deps

  const mut = useMutation({
    mutationFn: (body) => api.post('/change-requests', body),
    onSuccess: () => {
      toast.success(
        scope === 'batch'
          ? 'Batch change request sent — that batch is locked until Super Admin decides'
          : 'Request sent — medicine edit is locked until Super Admin decides',
      );
      qc.invalidateQueries(['change-requests']);
      qc.invalidateQueries(['medicine-edit-locks']);
      onClose();
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed to submit'),
  });

  if (!medicine) return null;

  const submit = (e) => {
    e.preventDefault();
    if (scope === 'batch' && !selectedBatch) {
      return toast.error('Select which batch to change');
    }
    if (!requestedValue.trim()) return toast.error('Enter the requested new value');
    if (!reason.trim()) return toast.error('Reason is required');

    const label = opt.label;
    const cur = currentVal === '' || currentVal == null ? '—' : currentVal;
    const batchTag = scope === 'batch'
      ? `Batch ${selectedBatch.batchNumber}`
      : 'Medicine master';
    const wrong = whatIsWrong.trim() || `Current (${batchTag}):\n${label}: ${cur}`;
    const change = requestedChange.trim() || `Requested (${batchTag}):\n${label}: ${requestedValue}`;

    mut.mutate({
      category: 'medicine_edit',
      title: scope === 'batch'
        ? `Batch edit: ${medicine.name} · ${selectedBatch.batchNumber}`
        : `Medicine edit: ${medicine.name}`,
      medicine: medicine._id,
      medicineName: medicine.name,
      batchId: scope === 'batch' ? selectedBatch._id : undefined,
      batchNumber: scope === 'batch' ? selectedBatch.batchNumber : undefined,
      whatIsWrong: wrong,
      requestedChange: change,
      reason: reason.trim(),
      priority: 'normal',
      fieldChanges: [{
        field: opt.field,
        fieldLabel: scope === 'batch' ? `${label} (batch ${selectedBatch.batchNumber})` : label,
        currentValue: String(cur),
        requestedValue: String(requestedValue).trim(),
      }],
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Request Medicine / Batch Edit"
      subtitle="Pick medicine master OR one batch · Super Admin approval required"
      size="lg"
    >
      <div className="am-shell mer-modal">
        <form onSubmit={submit} className="am-form" style={{ paddingTop: '0.85rem' }}>
          <div className="mer-hero">
            <div className="mer-hero__icon">
              <FileEdit size={18} strokeWidth={2} />
            </div>
            <div className="mer-hero__body">
              <p className="mer-hero__eyebrow">Inventory change request</p>
              <h3 className="mer-hero__name">{medicine.name}</h3>
              <p className="mer-hero__meta">
                {[medicine.genericName, medicine.category].filter(Boolean).join(' · ') || 'Medicine'}
                {batches.length ? ` · ${batches.length} batch${batches.length === 1 ? '' : 'es'}` : ''}
              </p>
            </div>
            <span className="am-badge am-badge--warn mer-hero__badge">
              <Lock size={10} style={{ marginRight: 4 }} /> Approval
            </span>
          </div>

          <div className="mer-notice">
            <strong>Medicine master</strong> = name, GST, default prices (all batches keep their own prices).
            {' '}
            <strong>One batch</strong> = pick from your {batches.length || 0} batch(es) to change expiry, qty, or that batch&apos;s price.
            Other batches stay unchanged.
          </div>

          <div className="am-form__section">
            <p className="am-form__section-title">What do you want to change?</p>
            <div className="mer-scope">
              <button
                type="button"
                className={`mer-scope__btn ${scope === 'medicine' ? 'mer-scope__btn--active' : ''}`}
                onClick={() => {
                  setScope('medicine');
                  setField('gstPercent');
                  setRequestedValue('');
                }}
              >
                <FileEdit size={14} /> Medicine master
              </button>
              <button
                type="button"
                className={`mer-scope__btn ${scope === 'batch' ? 'mer-scope__btn--active' : ''}`}
                disabled={!batches.length}
                onClick={() => {
                  setScope('batch');
                  setField('expiryDate');
                  setRequestedValue('');
                  if (!batchId && batches[0]) setBatchId(String(batches[0]._id));
                }}
              >
                <Layers size={14} /> One batch
                {batches.length ? ` (${batches.length})` : ''}
              </button>
            </div>

            {scope === 'batch' && (
              <div className="mt-3">
                <label className="am-label">Select batch *</label>
                <select
                  className="am-field"
                  value={batchId}
                  onChange={(e) => {
                    setBatchId(e.target.value);
                    setRequestedValue('');
                  }}
                  required
                >
                  {!batches.length && <option value="">No batches</option>}
                  {batches.map((b) => (
                    <option key={b._id} value={b._id}>
                      {b.batchNumber}
                      {b.expiryDate ? ` · Exp ${fmtDate(b.expiryDate)}` : ''}
                      {` · Qty ${Number(b.quantity) || 0}`}
                      {b.sellingPrice != null ? ` · Sell ₹${b.sellingPrice}` : ''}
                    </option>
                  ))}
                </select>
                {selectedBatch && (
                  <p className="am-hint mt-1">
                    Only this batch will be updated after Approve &amp; Apply. The other{' '}
                    {Math.max(0, batches.length - 1)} batch(es) stay as they are.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="am-form__section">
            <p className="am-form__section-title">Change details</p>
            <div className="am-form__grid">
              <div className="am-form__span-2">
                <label className="am-label">Field to change *</label>
                <select
                  className="am-field"
                  value={field}
                  onChange={(e) => {
                    setField(e.target.value);
                    setRequestedValue('');
                  }}
                >
                  {fieldOptions.map((f) => (
                    <option key={f.field} value={f.field}>{f.label}</option>
                  ))}
                </select>
              </div>

              <div className="am-form__span-2">
                <div className="mer-compare">
                  <div className="mer-compare__col mer-compare__col--current">
                    <span className="mer-compare__label">Current</span>
                    <span className="mer-compare__field">{opt.label}</span>
                    <input
                      className="am-field mer-compare__value"
                      value={String(currentVal === '' || currentVal == null ? '—' : currentVal)}
                      readOnly
                      tabIndex={-1}
                    />
                  </div>
                  <div className="mer-compare__arrow" aria-hidden>
                    <ArrowRight size={16} />
                  </div>
                  <div className="mer-compare__col mer-compare__col--next">
                    <span className="mer-compare__label mer-compare__label--accent">Requested *</span>
                    <span className="mer-compare__field">{opt.label}</span>
                    {field === 'expiryDate' && scope === 'batch' ? (
                      <input
                        type="date"
                        className="am-field mer-compare__value"
                        value={requestedValue}
                        onChange={(e) => {
                          setRequestedValue(e.target.value);
                          setRequestedChange(`Requested:\n${opt.label}: ${e.target.value}`);
                        }}
                        required
                      />
                    ) : (
                      <input
                        className="am-field mer-compare__value"
                        value={requestedValue}
                        onChange={(e) => {
                          setRequestedValue(e.target.value);
                          setRequestedChange(`Requested:\n${opt.label}: ${e.target.value}`);
                        }}
                        placeholder={
                          field === 'gstPercent' ? 'e.g. 5'
                            : field === 'quantity' ? 'e.g. 100'
                              : 'New value'
                        }
                        required
                        autoFocus
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="am-form__section">
            <p className="am-form__section-title">Justification</p>
            <div className="am-form__grid">
              <div>
                <label className="am-label">What is wrong?</label>
                <textarea
                  className="am-field"
                  rows={3}
                  value={whatIsWrong}
                  onChange={(e) => setWhatIsWrong(e.target.value)}
                />
              </div>
              <div>
                <label className="am-label">What should be changed?</label>
                <textarea
                  className="am-field"
                  rows={3}
                  value={requestedChange}
                  onChange={(e) => setRequestedChange(e.target.value)}
                />
              </div>
              <div className="am-form__span-2">
                <label className="am-label">Reason *</label>
                <textarea
                  className="am-field"
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={
                    scope === 'batch'
                      ? 'e.g. Invoice corrected — batch B12 expiry and sell price wrong'
                      : 'e.g. Supplier revised GST to 5% on this SKU'
                  }
                  required
                />
              </div>
            </div>
          </div>

          <div className="am-form__footer">
            <button type="button" className="am-btn am-btn--ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="am-btn am-btn--primary" disabled={mut.isPending}>
              <Send size={14} />
              {mut.isPending ? 'Submitting…' : 'Submit to Super Admin'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
