import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Stethoscope, FlaskConical, Bed, Save, Play,
} from 'lucide-react';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import api from '../services/api';

export default function DoctorConsultationPage() {
  const { opId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useSelector((s) => s.auth);
  const isReceptionist = user?.role === 'Receptionist';

  const [diagnosis, setDiagnosis] = useState('');
  const [notes, setNotes] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [vitals, setVitals] = useState({
    bloodPressure: '',
    pulse: '',
    temperature: '',
    weight: '',
    oxygenSaturation: '',
  });

  const { data: op, isLoading } = useQuery({
    queryKey: ['op', opId],
    queryFn: () => api.get(`/op/${opId}`).then((r) => r.data.data),
    enabled: !!opId,
  });

  const patientId = op?.patient?._id;

  const { data: history } = useQuery({
    queryKey: ['patientHistory', patientId],
    queryFn: () => api.get(`/op/patient/${patientId}/history`).then((r) => r.data.data),
    enabled: !!patientId,
  });

  React.useEffect(() => {
    if (op) {
      setDiagnosis(op.diagnosis || '');
      setNotes(op.consultationNotes || '');
      setFollowUp(op.followUpDate ? op.followUpDate.slice(0, 10) : '');
      if (op.vitals) setVitals((prev) => ({ ...prev, ...op.vitals }));
    }
  }, [op]);

  const startMut = useMutation({
    mutationFn: () => api.put(`/op/${opId}/status`, { status: 'in_consultation' }),
    onSuccess: () => {
      toast.success('Consultation started');
      qc.invalidateQueries(['opQueue']);
    },
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const normalizedVitals = Object.fromEntries(
        Object.entries(vitals).map(([key, value]) => {
          if (value === '') return [key, undefined];
          if (key === 'bloodPressure') return [key, value];
          const numeric = Number.parseFloat(String(value).replace(/[^\d.]/g, ''));
          return [key, Number.isFinite(numeric) ? numeric : undefined];
        }),
      );

      await api.put(`/op/${opId}/consultation`, {
        diagnosis,
        consultationNotes: notes,
        vitals: normalizedVitals,
        followUpDate: followUp || undefined,
        status: 'sent_to_pharmacy',
      });
    },
    onSuccess: () => {
      toast.success('Consultation saved and sent to pharmacy');
      qc.invalidateQueries(['opQueue']);
      navigate('/op-queue');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Save failed'),
  });

  const orderLabMut = useMutation({
    mutationFn: () => api.post('/lab', {
      patient: patientId,
      doctor: op?.doctor?._id,
      department: op?.department?._id,
      tests: [{ testName: 'General Panel', price: 500 }],
      sampleType: 'blood',
    }),
    onSuccess: async () => {
      await api.put(`/op/${opId}/status`, { status: 'sent_to_lab' });
      toast.success('Lab test ordered');
      qc.invalidateQueries(['opQueue']);
    },
  });

  const admitMut = useMutation({
    mutationFn: () => navigate(`/ip-admissions?patient=${patientId}&op=${opId}`),
  });

  if (isLoading || !op) {
    return <div className="p-8 text-center text-gray-400">Loading consultation...</div>;
  }

  const patient = op.patient || history?.patient;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button type="button" onClick={() => navigate('/op-queue')} className="btn-secondary py-2">
          <ArrowLeft size={16} /> Back
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Stethoscope size={24} className="text-blue-600" />
            Doctor Consultation
          </h1>
          <p className="text-sm text-gray-500">Token {op.tokenNumber} - {patient?.name}</p>
        </div>
        {op.status === 'waiting' && (
          <button type="button" onClick={() => startMut.mutate()} className="btn-primary ml-auto">
            <Play size={16} /> Start Consultation
          </button>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Patient Information</h3>
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              <p><span className="text-gray-400">Name:</span> <strong>{patient?.name}</strong></p>
              <p><span className="text-gray-400">UHID:</span> {patient?.patientId}</p>
              <p><span className="text-gray-400">Age/Gender:</span> {patient?.age} / {patient?.gender}</p>
              <p><span className="text-gray-400">Phone:</span> {patient?.phone}</p>
              <p className="sm:col-span-2"><span className="text-gray-400">Complaint:</span> {op.chiefComplaint || 'N/A'}</p>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 space-y-4">
            <h3 className="font-semibold">Clinical Notes</h3>
            <div>
              <label className="text-xs font-medium text-gray-500">Diagnosis</label>
              <input value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} className="input-field mt-1" placeholder="Primary diagnosis" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500">Clinical Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="input-field mt-1" rows={3} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {Object.entries(vitals).map(([k, v]) => (
                <div key={k}>
                  <label className="text-xs text-gray-500 capitalize">{k.replace(/([A-Z])/g, ' $1')}</label>
                  <input value={v ?? ''} onChange={(e) => setVitals({ ...vitals, [k]: e.target.value })} className="input-field mt-1 text-sm" />
                </div>
              ))}
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500">Follow-up Date</label>
              <input type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} className="input-field mt-1" />
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => saveMut.mutate()} disabled={saveMut.isPending} className="btn-primary">
              <Save size={16} /> {saveMut.isPending ? 'Saving...' : 'Save Consultation'}
            </button>
            {!isReceptionist && (
              <button type="button" onClick={() => orderLabMut.mutate()} className="btn-secondary"><FlaskConical size={16} /> Order Lab</button>
            )}
            {!isReceptionist && (
              <button type="button" onClick={() => admitMut.mutate()} className="btn-secondary"><Bed size={16} /> Recommend Admission</button>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl border p-5">
            <h3 className="font-semibold mb-3">Medical History</h3>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs font-semibold text-red-500 uppercase">Allergies</p>
                <p>{history?.allergies?.length ? history.allergies.join(', ') : 'None recorded'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-amber-600 uppercase">Chronic Diseases</p>
                <p>{history?.chronicDiseases?.length ? history.chronicDiseases.join(', ') : 'None recorded'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Previous Visits</p>
                {(history?.previousVisits || []).slice(0, 5).map((v) => (
                  <p key={v._id} className="text-xs text-gray-500">{new Date(v.tokenDate).toLocaleDateString()} - Dr. {v.doctor?.name}</p>
                ))}
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Previous Admissions</p>
                {(history?.previousAdmissions || []).slice(0, 3).map((a) => (
                  <p key={a._id} className="text-xs text-gray-500">{a.admissionNumber} - {new Date(a.admissionDate).toLocaleDateString()}</p>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}