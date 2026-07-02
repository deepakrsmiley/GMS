import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Clock, CheckCircle, Stethoscope, AlertCircle, RefreshCw, Pill, FlaskConical, Bed } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import api from '../services/api';
import Modal from '../components/common/Modal';
import { getSocket } from '../services/socket';

const statusConfig = {
  waiting: { label: 'Waiting', color: 'badge-yellow', icon: Clock },
  in_consultation: { label: 'In Consultation', color: 'badge-blue', icon: Stethoscope },
  consultation_completed: { label: 'Consultation Done', color: 'badge-green', icon: CheckCircle },
  completed: { label: 'Completed', color: 'badge-green', icon: CheckCircle },
  sent_to_pharmacy: { label: 'Sent To Pharmacy', color: 'badge-blue', icon: Pill },
  pharmacy_completed: { label: 'Pharmacy Done', color: 'badge-green', icon: CheckCircle },
  sent_to_lab: { label: 'Sent To Lab', color: 'badge-blue', icon: FlaskConical },
  admitted: { label: 'Admitted', color: 'badge-blue', icon: Bed },
  discharged: { label: 'Discharged', color: 'badge-gray', icon: CheckCircle },
  cancelled: { label: 'Cancelled', color: 'badge-gray', icon: AlertCircle },
  no_show: { label: 'No Show', color: 'badge-red', icon: AlertCircle },
};

export default function OPQueuePage() {
  const navigate = useNavigate();
  const { user } = useSelector((s) => s.auth);
  const [showAdd, setShowAdd] = useState(false);
  const [patientSearch, setPatientSearch] = useState('');
  const [patients, setPatients] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [deptFilter, setDeptFilter] = useState('');
  const [doctorFilter, setDoctorFilter] = useState(user?.role === 'Doctor' ? user?.id : '');
  const qc = useQueryClient();

  const { data: queue, isLoading, refetch } = useQuery({
    queryKey: ['opQueue', deptFilter, doctorFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (deptFilter) params.set('department', deptFilter);
      if (doctorFilter) params.set('doctor', doctorFilter);
      return api.get(`/op/queue?${params}`).then((r) => r.data);
    },
    refetchInterval: 15000,
  });

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    socket.on('queue:update', () => refetch());
    return () => socket.off('queue:update');
  }, [refetch]);

  useEffect(() => {
    api.get('/departments').then(r => setDepartments(r.data.data || [])).catch(() => {});
    api.get('/staff/doctors').then(r => setDoctors(r.data.data || [])).catch(() => {});
  }, []);

  const handlePatientSearchChange = async (e) => {
    const val = e.target.value;
    setPatientSearch(val);
    setValue('patient', ''); // Reset selected patient if user types
    if (val.length >= 2) {
      try {
        const r = await api.get(`/patients/search?q=${val}`);
        setPatients(r.data.data || []);
      } catch (err) {}
    } else {
      setPatients([]);
    }
  };

  const { register, handleSubmit, reset, watch, setValue } = useForm();
  const selectedDoctorId = watch('doctor');
  const [selectedDoctor, setSelectedDoctor] = useState(null);

  useEffect(() => {
    if (selectedDoctorId) {
      const doc = doctors.find((d) => d._id === selectedDoctorId);
      setSelectedDoctor(doc || null);
      if (doc?.department?._id || doc?.department) {
        setValue('department', doc.department._id || doc.department);
      }
    } else {
      setSelectedDoctor(null);
      setValue('department', '');
    }
  }, [selectedDoctorId, doctors, setValue]);

  const registerMut = useMutation({
    mutationFn: (d) => api.post('/op', d),
    onSuccess: () => { toast.success('Patient registered in queue!'); qc.invalidateQueries(['opQueue']); setShowAdd(false); reset(); },
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }) => api.put(`/op/${id}/status`, { status }),
    onSuccess: () => qc.invalidateQueries(['opQueue']),
  });

  const waiting = queue?.data?.filter((q) => q.status === 'waiting') || [];
  const inConsult = queue?.data?.filter((q) => q.status === 'in_consultation') || [];
  const completed = queue?.data?.filter((q) => ['completed', 'consultation_completed', 'sent_to_pharmacy', 'pharmacy_completed', 'sent_to_lab', 'admitted', 'discharged'].includes(q.status)) || [];

  const QueueCard = ({ item }) => {
    const cfg = statusConfig[item.status] || statusConfig.waiting;
    return (
      <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
        className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg ${
              item.priority === 'emergency' ? 'bg-red-100 dark:bg-red-900/30 text-red-600' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
            }`}>
              {item.tokenNumber}
            </div>
            <div>
              <p className="font-semibold text-gray-900 dark:text-white">{item.patient?.name}</p>
              <p className="text-xs text-gray-400">{item.patient?.patientId} • {item.patient?.age}yr • {item.patient?.gender}</p>
            </div>
          </div>
          <span className={cfg.color}>{cfg.label}</span>
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 mb-3 space-y-1">
          <p>Dept: {item.department?.name}</p>
          <p>Doctor: Dr. {item.doctor?.name || 'Unassigned'}</p>
          {item.waitingMinutes > 0 && item.status === 'waiting' && <p className="text-amber-600">Waiting: {item.waitingMinutes} min</p>}
          {item.chiefComplaint && <p>Complaint: {item.chiefComplaint}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {(item.status === 'waiting' || item.status === 'in_consultation') && (
            <button type="button" onClick={() => navigate(`/consultation/${item._id}`)}
              className="flex-1 text-xs py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
              {item.status === 'waiting' ? 'Open Consultation' : 'Continue'}
            </button>
          )}
          {item.status === 'waiting' && (
            <button type="button" onClick={() => statusMut.mutate({ id: item._id, status: 'no_show' })}
              className="text-xs py-1.5 px-2 bg-gray-100 text-gray-600 rounded-lg">No Show</button>
          )}
        </div>
      </motion.div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">OP Queue</h1>
          <p className="text-sm text-gray-500 flex items-center gap-2 mt-1">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            Live queue • {queue?.data?.length || 0} patients today
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => refetch()} className="btn-secondary"><RefreshCw size={16} /> Refresh</button>
          <button onClick={() => setShowAdd(true)} className="btn-primary"><Plus size={16} /> Register Patient</button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="input-field w-48">
          <option value="">All Departments</option>
          {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
        </select>
        {user?.role !== 'Doctor' && (
          <select value={doctorFilter} onChange={(e) => setDoctorFilter(e.target.value)} className="input-field w-48">
            <option value="">All Doctors</option>
            {doctors.map((d) => <option key={d._id} value={d._id}>Dr. {d.name}</option>)}
          </select>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Waiting', count: waiting.length, color: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800', textColor: 'text-yellow-700 dark:text-yellow-400' },
          { label: 'In Consultation', count: inConsult.length, color: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800', textColor: 'text-blue-700 dark:text-blue-400' },
          { label: 'Completed', count: completed.length, color: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800', textColor: 'text-green-700 dark:text-green-400' },
          { label: 'Admitted', count: queue?.stats?.admitted || 0, color: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200', textColor: 'text-purple-700' },
        ].map((s) => (
          <div key={s.label} className={`${s.color} border rounded-2xl p-4 text-center`}>
            <p className={`text-3xl font-bold ${s.textColor}`}>{s.count}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Queue Columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { title: 'Waiting', items: waiting, color: 'text-yellow-600' },
          { title: 'In Consultation', items: inConsult, color: 'text-blue-600' },
          { title: 'Completed', items: completed, color: 'text-green-600' },
        ].map(({ title, items, color }) => (
          <div key={title}>
            <h3 className={`font-semibold mb-3 ${color}`}>{title} ({items.length})</h3>
            <div className="space-y-3">
              <AnimatePresence>
                {items.map((item) => <QueueCard key={item._id} item={item} />)}
              </AnimatePresence>
              {items.length === 0 && (
                <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-6 text-center text-gray-400 text-sm border-2 border-dashed border-gray-200 dark:border-gray-700">
                  No patients
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Register Modal */}
      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Register Patient in Queue" size="lg">
        <form onSubmit={handleSubmit((d) => registerMut.mutate(d))} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Search Patient *</label>
            <input type="text" placeholder="Search by name, ID, phone..." value={patientSearch} onChange={handlePatientSearchChange} className="input-field" />
            {patients.length > 0 && (
              <div className="mt-1 border border-gray-200 dark:border-gray-600 rounded-xl overflow-hidden shadow-lg">
                {patients.map((p) => (
                  <button key={p._id} type="button" onClick={() => { setValue('patient', p._id); setPatientSearch(`${p.name} (${p.patientId})`); setPatients([]); }}
                    className="w-full text-left px-4 py-2.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-sm transition-colors border-b border-gray-100 dark:border-gray-700 last:border-0">
                    <span className="font-medium text-gray-900 dark:text-white">{p.name}</span>
                    <span className="text-gray-400 ml-2">{p.patientId} • {p.phone}</span>
                  </button>
                ))}
              </div>
            )}
            <input type="hidden" {...register('patient', { required: true })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Doctor *</label>
              <select {...register('doctor', { required: true })} className="input-field">
                <option value="">Select doctor</option>
                {doctors.map((d) => <option key={d._id} value={d._id}>Dr. {d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Department *</label>
              <input type="hidden" {...register('department', { required: true })} />
              <select value={watch('department') || ''} onChange={(e) => setValue('department', e.target.value)} disabled={!!selectedDoctorId} className="input-field bg-gray-50 dark:bg-gray-700/50 disabled:cursor-not-allowed">
                <option value="">Select department</option>
                {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
              </select>
            </div>
            
            {selectedDoctor && (
              <div className="col-span-2 bg-blue-50 dark:bg-blue-950/40 rounded-xl p-4 border border-blue-100 dark:border-blue-900/50 space-y-2 text-sm text-blue-900 dark:text-blue-200">
                <h4 className="font-semibold flex items-center gap-1.5"><Stethoscope size={16} /> Doctor Consultation Details</h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-gray-500 dark:text-gray-400">Consultation Fee</p>
                    <p className="font-semibold text-sm text-gray-900 dark:text-white">₹{selectedDoctor.consultationFee || 0}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 dark:text-gray-400">Follow-up Fee</p>
                    <p className="font-semibold text-sm text-gray-900 dark:text-white">₹{selectedDoctor.followUpFee || 0}</p>
                  </div>
                  {selectedDoctor.qualification && (
                    <div className="col-span-2">
                      <p className="text-gray-500 dark:text-gray-400">Qualification & Specialization</p>
                      <p className="font-medium text-gray-900 dark:text-white">{selectedDoctor.qualification} {selectedDoctor.specialization && `(${selectedDoctor.specialization})`}</p>
                    </div>
                  )}
                  <div className="col-span-2">
                    <p className="text-gray-500 dark:text-gray-400">Session Hours</p>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {selectedDoctor.morningSessionStart && `Morning: ${selectedDoctor.morningSessionStart} - ${selectedDoctor.morningSessionEnd}`}
                      {selectedDoctor.morningSessionStart && selectedDoctor.eveningSessionStart && ' | '}
                      {selectedDoctor.eveningSessionStart && `Evening: ${selectedDoctor.eveningSessionStart} - ${selectedDoctor.eveningSessionEnd}`}
                      {!selectedDoctor.morningSessionStart && !selectedDoctor.eveningSessionStart && 'Standard Hours'}
                    </p>
                  </div>
                  {selectedDoctor.availability && selectedDoctor.availability.length > 0 && (
                    <div className="col-span-2">
                      <p className="text-gray-500 dark:text-gray-400">Available Days</p>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {selectedDoctor.availability
                          .filter(a => a.isAvailable || a.day)
                          .map(a => typeof a === 'string' ? a : a.day)
                          .filter(Boolean)
                          .join(', ') || 'Not Configured'}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
              <select {...register('appointmentType')} className="input-field">
                <option value="walkin">Walk-in</option>
                <option value="appointment">Appointment</option>
                <option value="followup">Follow-up</option>
                <option value="emergency">Emergency</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Priority</label>
              <select {...register('priority')} className="input-field">
                <option value="normal">Normal</option>
                <option value="urgent">Urgent</option>
                <option value="emergency">Emergency</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Chief Complaint</label>
              <input {...register('chiefComplaint')} className="input-field" placeholder="Main complaint/reason for visit" />
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
            <button type="button" onClick={() => setShowAdd(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={registerMut.isPending} className="btn-primary">
              {registerMut.isPending ? 'Registering...' : 'Add to Queue'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
