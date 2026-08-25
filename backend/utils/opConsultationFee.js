const EMERGENCY_SURCHARGE = 300;

const resolveOpConsultationFee = (doctor, department, appointmentType) => {
  const isFollowUp = appointmentType === 'followup';
  const consult = Number(doctor?.consultationFee) || Number(department?.consultationFee) || 0;
  const follow = Number(doctor?.followUpFee) || 0;
  if (isFollowUp) {
    if (follow > 0) return follow;
    if (consult > 0) return Math.round(consult * 0.5);
    return 0;
  }
  return consult;
};

const defaultPaymentPurpose = (appointmentType) => {
  if (appointmentType === 'followup') return 'Follow-up consultation fee';
  if (appointmentType === 'emergency') return 'Emergency consultation fee';
  return 'Doctor consultation fee';
};

module.exports = { EMERGENCY_SURCHARGE, resolveOpConsultationFee, defaultPaymentPurpose };
