const idString = (value) => {
  if (!value) return '';
  const raw = value._id || value.$oid || value;
  const str = String(raw);
  return /^[a-fA-F0-9]{24}$/.test(str) ? str : '';
};

const medicineIdentity = (line = {}) => {
  const medId = idString(line.medicine);
  if (medId) return medId;
  return String(line.name || line.description || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
};

/** Same medicine at the same rate becomes one line. A different rate stays separate. */
const medicineMergeKey = (line = {}) => {
  if (line.type !== 'medicine' && line.category !== 'Pharmacy') return null;
  const identity = medicineIdentity(line);
  if (!identity) return null;
  const price = Number(line.unitPrice);
  const gst = Number(line.gstPercent) || 0;
  if (!Number.isFinite(price)) return null;
  return `${line.referenceModel || ''}|${identity}|${price.toFixed(2)}|${gst.toFixed(2)}`;
};

const collectSourceIds = (line = {}) => {
  const ids = [];
  if (Array.isArray(line.sourceIds)) {
    line.sourceIds.forEach((id) => {
      const value = idString(id);
      if (value) ids.push(value);
    });
  }
  const ref = idString(line.referenceId);
  if (ref) ids.push(ref);
  return [...new Set(ids)];
};

const money = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Nurse station logs the same medicine once per day. Billing should show
 * one row: Dolo 250, quantity 2 — not two separate Dolo 250 rows.
 * Every source medication id is kept so those days are not billed again.
 */
const mergeSameMedicineLines = (lines = []) => {
  const out = [];
  const index = new Map();

  for (const line of lines) {
    const key = medicineMergeKey(line);
    if (!key) {
      out.push(line);
      continue;
    }

    const existing = index.get(key);
    if (!existing) {
      const copy = {
        ...line,
        sourceIds: collectSourceIds(line),
      };
      index.set(key, copy);
      out.push(copy);
      continue;
    }

    const quantity = money(existing.quantity) + money(line.quantity);
    const price = money(existing.unitPrice);
    const gstPercent = money(existing.gstPercent);
    const gstAmount = quantity * price * (gstPercent / 100);
    const amount = quantity * price + gstAmount;

    existing.quantity = quantity;
    existing.gstAmount = gstAmount;
    existing.amount = amount;
    existing.totalAmount = amount;
    existing.sourceIds = [...new Set([
      ...collectSourceIds(existing),
      ...collectSourceIds(line),
    ])];

    const existingName = String(existing.name || existing.description || '');
    const nextName = String(line.name || line.description || '');
    if (nextName && (!existingName || nextName.length < existingName.length)) {
      existing.description = line.description || line.name;
      existing.name = line.name || line.description;
    }
  }

  return out;
};

module.exports = {
  mergeSameMedicineLines,
  medicineMergeKey,
};
