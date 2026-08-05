/**
 * Flatten medicine search results into one selectable option per usable batch
 * so pharmacy/billing can pick the exact batch (price + qty + expiry).
 */
export function flattenMedicineBatchOptions(medicines = []) {
  const rows = [];

  for (const med of medicines) {
    const batches =
      med.usableBatches
      || (med.batches || []).filter(
        (b) => !b.isDisposed && Number(b.quantity) > 0 && (!b.expiryDate || new Date(b.expiryDate) >= new Date()),
      );

    if (!batches.length) {
      if (Number(med.currentStock) > 0) {
        rows.push({
          key: String(med._id),
          medicine: med,
          batch: null,
          batchNumber: '',
          expiryDate: null,
          available: Number(med.currentStock) || 0,
          unitPrice: Number(med.sellingPrice) || 0,
          mrp: Number(med.mrp ?? med.sellingPrice) || 0,
          purchasePrice: Number(med.purchasePrice) || 0,
        });
      }
      continue;
    }

    for (const b of batches) {
      rows.push({
        key: `${med._id}-${b._id || b.batchNumber}`,
        medicine: med,
        batch: b,
        batchNumber: b.batchNumber || '',
        expiryDate: b.expiryDate || null,
        available: Number(b.quantity) || 0,
        unitPrice: Number(
          b.sellingPrice != null ? b.sellingPrice : med.sellingPrice,
        ) || 0,
        mrp: Number(b.mrp != null ? b.mrp : med.mrp ?? med.sellingPrice) || 0,
        purchasePrice: Number(
          b.purchasePrice != null ? b.purchasePrice : med.purchasePrice,
        ) || 0,
      });
    }
  }

  return rows;
}

export function formatBatchExpiry(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
