import React, { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Modal from '../common/Modal';
import patientProfileApi from '../../services/patientProfileApi';
import api from '../../services/api';

export default function OperationFormModal({ patientId, isOpen, onClose }) {
  const [form, setForm] = useState({
    operationName: '', ot: '', surgeon: '', anesthetist: '', anesthesiaType: 'general',
    startTime: '', endTime: '', preOpDiagnosis: '', postOpDiagnosis: '', ipAdmission: '',
  });
  const qc = useQueryClient();

  const { data: admissions } = useQuery({
    queryKey: ['patientProfile', 'ipHistoryOptions', patientId],
    queryFn: () => patientProfileApi.getIPHistory(patientId),
    enabled: isOpen,
  });

  const { data: doctors } = useQuery({
    queryKey: ['staffDoctorOptions'],
    queryFn: () => api.get('/staff/doctors').then((r) => r.data.data || []),
    enabled: isOpen,
  });

  const createMut = useMutation({
    mutationFn: () => patientProfileApi.createOperation(patientId, form),
    onSuccess: () => {
      toast.success('Operation recorded');
      qc.invalidateQueries({ queryKey: ['patientProfile', 'operation-history', patientId] });
      qc.invalidateQueries({ queryKey: ['patientProfile', 'timeline', patientId] });
      onClose();
    },
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Record Operation" size="lg">
      <form onSubmit={(e) => { e.preventDefault(); createMut.mutate(); }} className="p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Operation Name *</label>
            <input required value={form.operationName} onChange={(e) => setForm({ ...form, operationName: e.target.value })} className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Admission *</label>
            <select required value={form.ipAdmission} onChange={(e) => setForm({ ...form, ipAdmission: e.target.value })} className="input-field">
              <option value="">Select admission</option>
              {(admissions || []).map((a) => <option key={a._id} value={a._id}>{a.admissionNumber}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">OT / Theatre</label>
            <input value={form.ot} onChange={(e) => setForm({ ...form, ot: e.target.value })} className="input-field" placeholder="OT-1" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Surgeon *</label>
            <select required value={form.surgeon} onChange={(e) => setForm({ ...form, surgeon: e.target.value })} className="input-field">
              <option value="">Select surgeon</option>
              {(doctors || []).map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Anesthetist</label>
            <select value={form.anesthetist} onChange={(e) => setForm({ ...form, anesthetist: e.target.value })} className="input-field">
              <option value="">Select</option>
              {(doctors || []).map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start Time</label>
            <input type="datetime-local" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End Time</label>
            <input type="datetime-local" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} className="input-field" />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Pre-Op Diagnosis</label>
            <input value={form.preOpDiagnosis} onChange={(e) => setForm({ ...form, preOpDiagnosis: e.target.value })} className="input-field" />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Post-Op Diagnosis</label>
            <input value={form.postOpDiagnosis} onChange={(e) => setForm({ ...form, postOpDiagnosis: e.target.value })} className="input-field" />
          </div>
        </div>
        <div className="flex gap-3 justify-end pt-2 border-t border-gray-200 dark:border-gray-700">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={createMut.isPending} className="btn-primary">{createMut.isPending ? 'Saving...' : 'Save Operation'}</button>
        </div>
      </form>
    </Modal>
  );
}
