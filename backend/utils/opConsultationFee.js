const EMERGENCY_SURCHARGE = 300;

/** Treat 0 as a real fee. Only skip when the value is missing or invalid. */
const finiteFee = (value) => {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

const resolveOpConsultationFee = (doctor, department, appointmentType) => {
  const isFollowUp = appointmentType === 'followup';
  const consult = finiteFee(doctor?.consultationFee) ?? finiteFee(department?.consultationFee) ?? 0;
  const follow = finiteFee(doctor?.followUpFee) ?? 0;
  if (isFollowUp) {
    if (follow > 0) return follow;
    if (consult > 0) return Math.round(consult * 0.5);
    return 0;
  }
  return consult;
};

const parseFeeOverride = (value) => {
  if (value === '' || value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
};

/** Reception override first, then stored visit fee, then doctor/department master. */
const resolveBilledConsultationFee = (masterFee, override, stored) => {
  const fromOverride = parseFeeOverride(override);
  if (fromOverride != null) return fromOverride;
  const fromStored = parseFeeOverride(stored);
  if (fromStored != null) return fromStored;
  const master = Number(masterFee);
  return Number.isFinite(master) && master >= 0 ? master : 0;
};

const defaultPaymentPurpose = (appointmentType) => {
  if (appointmentType === 'followup') return 'Follow-up consultation fee';
  if (appointmentType === 'emergency') return 'Emergency consultation fee';
  return 'Doctor consultation fee';
};

module.exports = {
  EMERGENCY_SURCHARGE,
  resolveOpConsultationFee,
  parseFeeOverride,
  resolveBilledConsultationFee,
  defaultPaymentPurpose,
};
