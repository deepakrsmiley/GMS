import React, { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Download, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import Modal from '../common/Modal';

const FIELDS = [
  { key: 'diagnosis', label: 'Diagnosis', required: true, rows: 2 },
  { key: 'treatmentGiven', label: 'Treatment Given', required: true, rows: 3 },
  { key: 'procedures', label: 'Procedures', required: false, rows: 2 },
  { key: 'clinicalFindings', label: 'Clinical Findings', required: true, rows: 3 },
  { key: 'hospitalCourse', label: 'Hospital Course', required: true, rows: 3 },
  { key: 'medicationsOnDischarge', label: 'Medications On Discharge', required: true, rows: 3 },
  { key: 'followUpAdvice', label: 'Follow-up Advice', required: true, rows: 2 },
  { key: 'dischargeInstructions', label: 'Discharge Instructions', required: true, rows: 2 },
];

const emptyForm = () => Object.fromEntries(FIELDS.map((f) => [f.key, '']));

export default function DischargeSummaryModal({ admission, isOpen, onClose, onSaved, mode = 'summary' }) {
  const [form, setForm] = useState(emptyForm());
  const [dischargeType, setDischargeType] = useState('regular');

  useEffect(() => {
    if (!admission) return;
    const d = admission.dischargeDetails || {};
    setForm({
      diagnosis: d.diagnosis || admission.finalDiagnosis || admission.admissionDiagnosis || '',
      treatmentGiven: d.treatmentGiven || '',
      procedures: d.procedures || '',
      clinicalFindings: d.clinicalFindings || '',
      hospitalCourse: d.hospitalCourse || '',
      medicationsOnDischarge: d.medicationsOnDischarge || '',
      followUpAdvice: d.followUpAdvice || '',
      dischargeInstructions: d.dischargeInstructions || '',
    });
    setDischargeType(admission.dischargeType || 'regular');
  }, [admission, isOpen]);

  const saveMut = useMutation({
    mutationFn: (payload) => api.put(`/ip/${admission._id}/discharge-summary`, payload),
    onSuccess: () => {
      toast.success('Discharge summary saved');
      onSaved?.();
      if (mode === 'summary') onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to save summary'),
  });

  const dischargeMut = useMutation({
    mutationFn: (payload) => api.put(`/ip/${admission._id}/discharge`, payload),
    onSuccess: () => {
      toast.success('Patient discharged successfully');
      onSaved?.();
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Discharge failed'),
  });

  const handleSave = () => {
    const missing = FIELDS.filter((f) => f.required && !form[f.key]?.trim());
    if (missing.length) {
      toast.error(`Please fill: ${missing.map((f) => f.label).join(', ')}`);
      return;
    }
    saveMut.mutate(form);
  };

  const handleDischarge = () => {
    const missing = FIELDS.filter((f) => f.required && !form[f.key]?.trim());
    if (missing.length) {
      toast.error('Complete discharge summary before processing discharge');
      return;
    }
    if (!window.confirm('Confirm patient discharge? Bed will be released.')) return;
    dischargeMut.mutate({ dischargeType, dischargeDetails: form });
  };

  const handlePrint = async () => {
    try {
      const res = await api.get(`/ip/${admission._id}/discharge-print`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `discharge-${admission.admissionNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to download discharge summary PDF');
    }
  };

  if (!admission) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Discharge Summary — ${admission.patient?.name || ''} (${admission.admissionNumber})`}
      size="xl"
    >
      <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4">
          <div><span className="text-gray-500">Patient</span><p className="font-medium">{admission.patient?.name}</p></div>
          <div><span className="text-gray-500">UHID</span><p className="font-medium">{admission.patient?.patientId}</p></div>
          <div><span className="text-gray-500">Doctor</span><p className="font-medium">Dr. {admission.doctor?.name}</p></div>
          <div><span className="text-gray-500">Admitted</span><p className="font-medium">{new Date(admission.admissionDate).toLocaleDateString('en-IN')}</p></div>
        </div>

        {FIELDS.map((field) => (
          <div key={field.key}>
            <label className="block text-sm font-medium mb-1">
              {field.label}{field.required && <span className="text-red-500"> *</span>}
            </label>
            <textarea
              value={form[field.key]}
              onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
              rows={field.rows}
              className="input-field"
              disabled={admission.status === 'discharged' && mode === 'summary'}
            />
          </div>
        ))}

        {mode === 'discharge' && admission.status !== 'discharged' && (
          <div>
            <label className="block text-sm font-medium mb-1">Discharge Type</label>
            <select value={dischargeType} onChange={(e) => setDischargeType(e.target.value)} className="input-field w-48">
              <option value="regular">Regular</option>
              <option value="LAMA">LAMA</option>
              <option value="transfer">Transfer</option>
              <option value="death">Death</option>
              <option value="absconded">Absconded</option>
            </select>
          </div>
        )}

        <div className="flex flex-wrap gap-3 pt-2 border-t">
          {admission.status !== 'discharged' && (
            <button type="button" onClick={handleSave} disabled={saveMut.isPending} className="btn-primary">
              <Save size={16} /> {saveMut.isPending ? 'Saving...' : 'Save Summary'}
            </button>
          )}
          {mode === 'discharge' && admission.status !== 'discharged' && (
            <button type="button" onClick={handleDischarge} disabled={dischargeMut.isPending} className="btn-primary bg-green-600 hover:bg-green-700">
              Process Discharge
            </button>
          )}
          {(admission.dischargeDetails?.diagnosis || admission.status === 'discharged') && (
            <button type="button" onClick={handlePrint} className="btn-secondary">
              <Download size={16} /> Download PDF
            </button>
          )}
          <button type="button" onClick={onClose} className="btn-secondary ml-auto">Close</button>
        </div>
      </div>
    </Modal>
  );
}
