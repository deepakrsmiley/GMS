import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, UserCheck, ChevronRight, ChevronLeft, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import Modal from '../components/common/Modal';
import DataTable from '../components/common/DataTable';
import DischargeSummaryModal from '../components/ip/DischargeSummaryModal';
import ServiceUsageModal from '../components/ip/ServiceUsageModal';
import { hasRole } from '../utils/roles';

const ROOM_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'general', label: 'General Ward' },
  { value: 'semi_private', label: 'Semi Private' },
  { value: 'private', label: 'Private Room' },
  { value: 'icu', label: 'ICU' },
  { value: 'nicu', label: 'NICU' },
  { value: 'emergency', label: 'Emergency' },
];

const statusColors = {
  available: 'border-green-400 bg-green-50 text-green-800',
  occupied: 'border-red-400 bg-red-50 text-red-800',
  reserved: 'border-yellow-400 bg-yellow-50 text-yellow-800',
  maintenance: 'border-gray-400 bg-gray-100 text-gray-600',
};

export default function IPAdmissionsPage() {
  const [searchParams] = useSearchParams();
  const { user } = useSelector((s) => s.auth);
  const canAdmit = hasRole(user?.role, ['Super Admin', 'Receptionist']);
  const canWriteSummary = hasRole(user?.role, ['Super Admin', 'Doctor']);
  const canDischarge = hasRole(user?.role, ['Super Admin', 'Receptionist', 'Doctor']);
  const viewOnly = hasRole(user?.role, ['Admin', 'Doctor']) && !canAdmit;

  const [tab, setTab] = useState(searchParams.get('tab') === 'discharge' ? 'discharge' : 'admitted');
  const [page, setPage] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [step, setStep] = useState(1);
  const [patientSearch, setPatientSearch] = useState('');
  const [patients, setPatients] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [summaryAdmission, setSummaryAdmission] = useState(null);
  const [summaryMode, setSummaryMode] = useState('summary');
  const [serviceAdmission, setServiceAdmission] = useState(null);
  const [form, setForm] = useState({
    patient: '', doctor: '', department: '', admissionType: 'elective',
    admissionDiagnosis: '', attendant: { name: '', phone: '' },
    roomType: '', selectedRoom: null, opRegistration: '',
  });
  const qc = useQueryClient();

  useEffect(() => {
    if (searchParams.get('tab') === 'discharge') setTab('discharge');
  }, [searchParams]);

  const statusFilter = tab === 'discharge' ? 'admitted' : 'admitted';

  const { data, isLoading } = useQuery({
    queryKey: ['admissions', page, statusFilter],
    queryFn: () => api.get(`/ip?page=${page}&limit=20&status=${statusFilter}`).then((r) => r.data),
  });

  const { data: availableRooms } = useQuery({
    queryKey: ['availableRooms', form.roomType],
    queryFn: () => api.get(`/rooms/available${form.roomType ? `?type=${form.roomType}` : ''}`).then((r) => r.data.data),
    enabled: step === 3 && canAdmit,
  });

  const { data: dashboard } = useQuery({
    queryKey: ['roomDashboard'],
    queryFn: () => api.get('/rooms/dashboard').then((r) => r.data.data),
    enabled: canAdmit,
  });

  useEffect(() => {
    api.get('/staff/doctors').then((r) => setDoctors(r.data.data || []));
    api.get('/departments').then((r) => setDepartments(r.data.data || []));
  }, []);

  useEffect(() => {
    const pid = searchParams.get('patient');
    const op = searchParams.get('op');
    if (pid && canAdmit) {
      api.get(`/patients/${pid}`).then((r) => {
        const p = r.data.data;
        setForm((f) => ({ ...f, patient: p._id, opRegistration: op || '' }));
        setPatientSearch(`${p.name} (${p.patientId})`);
        setShowAdd(true);
        setStep(2);
      }).catch(() => {});
    }
  }, [searchParams, canAdmit]);

  useEffect(() => {
    if (patientSearch.length >= 2 && !form.patient) {
      api.get(`/patients/search?q=${patientSearch}`).then((r) => setPatients(r.data.data || []));
    }
  }, [patientSearch, form.patient]);

  const admitMut = useMutation({
    mutationFn: (payload) => api.post('/ip', payload),
    onSuccess: () => {
      toast.success('Patient admitted successfully!');
      qc.invalidateQueries(['admissions']);
      qc.invalidateQueries(['roomDashboard']);
      qc.invalidateQueries(['beds']);
      setShowAdd(false);
      resetForm();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Admission failed'),
  });

  const resetForm = () => {
    setStep(1);
    setForm({
      patient: '', doctor: '', department: '', admissionType: 'elective',
      admissionDiagnosis: '', attendant: { name: '', phone: '' },
      roomType: '', selectedRoom: null, opRegistration: '',
    });
    setPatientSearch('');
  };

  const openSummary = (admission, mode = 'summary') => {
    setSummaryAdmission(admission);
    setSummaryMode(mode);
  };

  const handleAdmit = () => {
    const room = form.selectedRoom;
    if (!room) { toast.error('Please select a room/bed'); return; }
    const payload = {
      patient: form.patient,
      doctor: form.doctor,
      department: form.department,
      admissionType: form.admissionType,
      admissionDiagnosis: form.admissionDiagnosis,
      attendant: form.attendant,
      opRegistration: form.opRegistration || undefined,
      bed: room.bed?._id || room.bed || room._id,
      room: room.bed ? room._id : undefined,
    };
    admitMut.mutate(payload);
  };

  const columns = [
    { key: 'admissionNumber', header: 'Admission No', render: (r) => <span className="font-mono font-semibold text-blue-600">{r.admissionNumber}</span> },
    { key: 'patient', header: 'Patient', render: (r) => <div><p className="font-medium">{r.patient?.name}</p><p className="text-xs text-gray-400">{r.patient?.patientId}</p></div> },
    { key: 'doctor', header: 'Doctor', render: (r) => <span>Dr. {r.doctor?.name}</span> },
    { key: 'department', header: 'Dept', render: (r) => r.department?.name },
    { key: 'bed', header: 'Room/Bed', render: (r) => r.room?.roomNumber || r.bed?.roomNumber || r.bed?.bedNumber || 'N/A' },
    { key: 'admissionDate', header: 'Admitted', render: (r) => new Date(r.admissionDate).toLocaleDateString('en-IN') },
    { key: 'status', header: 'Status', render: (r) => <span className="badge-blue">{r.status}</span> },
    { key: 'actions', header: '', render: (r) => r.status === 'admitted' && (
      <div className="flex gap-2 flex-wrap">
        {canWriteSummary && (
          <button type="button" onClick={() => openSummary(r, 'summary')} className="text-xs text-blue-600 hover:underline font-medium flex items-center gap-1">
            <FileText size={12} /> Summary
          </button>
        )}
        <button type="button" onClick={() => setServiceAdmission(r)} className="text-xs text-purple-600 hover:underline font-medium">
          Services / Equipment
        </button>
        {canDischarge && tab === 'discharge' && (
          <button type="button" onClick={() => openSummary(r, 'discharge')} className="text-xs text-green-600 hover:underline font-medium">
            Discharge
          </button>
        )}
      </div>
    )},
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {tab === 'discharge' ? 'Discharge Processing' : viewOnly ? 'IP Patients' : 'IP Admissions'}
          </h1>
          <p className="text-sm text-gray-500">{data?.total || 0} currently admitted</p>
        </div>
        {canAdmit && tab !== 'discharge' && (
          <button type="button" onClick={() => { resetForm(); setShowAdd(true); }} className="btn-primary"><Plus size={16} /> Admit Patient</button>
        )}
      </div>

      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700">
        {[
          { id: 'admitted', label: canAdmit ? 'Admissions' : 'IP Patients' },
          { id: 'discharge', label: 'Discharge Summary' },
        ].map(({ id, label }) => (
          <button key={id} type="button" onClick={() => setTab(id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}>
            {label}
          </button>
        ))}
      </div>

      {dashboard && canAdmit && tab !== 'discharge' && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { label: 'Total Rooms', value: dashboard.totalRooms, color: 'text-blue-600' },
            { label: 'Available', value: dashboard.available, color: 'text-green-600' },
            { label: 'Occupied', value: dashboard.occupied, color: 'text-red-600' },
            { label: 'Reserved', value: dashboard.reserved, color: 'text-yellow-600' },
            { label: 'Maintenance', value: dashboard.maintenance, color: 'text-gray-600' },
            { label: 'ICU Occupied', value: `${dashboard.icuOccupancy?.occupied || 0}/${dashboard.icuOccupancy?.total || 0}`, color: 'text-purple-600' },
            { label: 'Ward Occupied', value: `${dashboard.wardOccupancy?.occupied || 0}/${dashboard.wardOccupancy?.total || 0}`, color: 'text-indigo-600' },
          ].map((s) => (
            <div key={s.label} className="kpi-card text-center py-4">
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
        <DataTable columns={columns} data={data?.data || []} loading={isLoading} page={page} pages={data?.pages || 1} onPageChange={setPage} />
      </div>

      <DischargeSummaryModal
        admission={summaryAdmission}
        isOpen={!!summaryAdmission}
        onClose={() => setSummaryAdmission(null)}
        onSaved={() => qc.invalidateQueries(['admissions'])}
        mode={summaryMode}
      />

      <ServiceUsageModal
        admission={serviceAdmission}
        isOpen={!!serviceAdmission}
        onClose={() => setServiceAdmission(null)}
      />

      {canAdmit && (
      <Modal isOpen={showAdd} onClose={() => { setShowAdd(false); resetForm(); }} title={`Admit Patient — Step ${step}/4`} size="lg">
        <div className="p-6 space-y-5">
          <div className="flex gap-2 mb-4">
            {[1, 2, 3, 4].map((s) => (
              <div key={s} className={`flex-1 h-1.5 rounded-full ${step >= s ? 'bg-blue-600' : 'bg-gray-200'}`} />
            ))}
          </div>

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Select Patient *</label>
                <input type="text" placeholder="Search patient..." value={patientSearch} onChange={(e) => { setPatientSearch(e.target.value); setForm({ ...form, patient: '' }); }} className="input-field" />
                {patients.length > 0 && (
                  <div className="mt-1 border rounded-xl overflow-hidden max-h-36 overflow-y-auto">
                    {patients.map((p) => (
                      <button key={p._id} type="button" onClick={() => { setForm({ ...form, patient: p._id }); setPatientSearch(`${p.name} (${p.patientId})`); setPatients([]); }}
                        className="w-full text-left px-4 py-2 hover:bg-blue-50 text-sm border-b last:border-0">{p.name} — {p.patientId}</button>
                    ))}
                  </div>
                )}
              </div>
              <button type="button" disabled={!form.patient} onClick={() => setStep(2)} className="btn-primary w-full justify-center">Next <ChevronRight size={16} /></button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Doctor *</label>
                  <select value={form.doctor} onChange={(e) => setForm({ ...form, doctor: e.target.value })} className="input-field">
                    <option value="">Select doctor</option>
                    {doctors.map((d) => <option key={d._id} value={d._id}>Dr. {d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Department *</label>
                  <select value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} className="input-field">
                    <option value="">Select department</option>
                    {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Admission Type</label>
                  <select value={form.admissionType} onChange={(e) => setForm({ ...form, admissionType: e.target.value })} className="input-field">
                    <option value="elective">Elective</option>
                    <option value="emergency">Emergency</option>
                    <option value="transfer">Transfer</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Room Type</label>
                  <select value={form.roomType} onChange={(e) => setForm({ ...form, roomType: e.target.value })} className="input-field">
                    {ROOM_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1">Admission Diagnosis *</label>
                  <textarea value={form.admissionDiagnosis} onChange={(e) => setForm({ ...form, admissionDiagnosis: e.target.value })} className="input-field" rows={2} />
                </div>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setStep(1)} className="btn-secondary"><ChevronLeft size={16} /> Back</button>
                <button type="button" disabled={!form.doctor || !form.department || !form.admissionDiagnosis} onClick={() => setStep(3)} className="btn-primary flex-1 justify-center">Next <ChevronRight size={16} /></button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">Select an available room/bed</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-64 overflow-y-auto">
                {(availableRooms || []).map((room) => (
                  <button key={room._id} type="button" onClick={() => setForm({ ...form, selectedRoom: room })}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${form.selectedRoom?._id === room._id ? 'border-blue-600 ring-2 ring-blue-200' : statusColors.available}`}>
                    <p className="font-bold text-sm">Room {room.roomNumber}</p>
                    <p className="text-xs mt-1">Bed: {room.bedNumber || room.bed?.bedNumber || 'N/A'}</p>
                    <p className="text-xs capitalize">{room.type?.replace('_', ' ')} · Floor {room.floor || '—'}</p>
                    <p className="text-xs font-semibold mt-1">₹{room.dailyCharge || room.bed?.dailyRate}/day</p>
                  </button>
                ))}
                {!availableRooms?.length && <p className="col-span-full text-center text-gray-400 py-8">No available rooms for selected type</p>}
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setStep(2)} className="btn-secondary"><ChevronLeft size={16} /> Back</button>
                <button type="button" disabled={!form.selectedRoom} onClick={() => setStep(4)} className="btn-primary flex-1 justify-center">Next <ChevronRight size={16} /></button>
              </div>
            </div>
          )}

          {step === 4 && form.selectedRoom && (
            <div className="space-y-4">
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 text-sm space-y-2">
                <p><strong>Patient:</strong> {patientSearch}</p>
                <p><strong>Room:</strong> {form.selectedRoom.roomNumber} · Bed {form.selectedRoom.bedNumber || form.selectedRoom.bed?.bedNumber}</p>
                <p><strong>Daily Charge:</strong> ₹{form.selectedRoom.dailyCharge || form.selectedRoom.bed?.dailyRate}</p>
                <p><strong>Diagnosis:</strong> {form.admissionDiagnosis}</p>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setStep(3)} className="btn-secondary"><ChevronLeft size={16} /> Back</button>
                <button type="button" onClick={handleAdmit} disabled={admitMut.isPending} className="btn-primary flex-1 justify-center">
                  <UserCheck size={16} /> {admitMut.isPending ? 'Admitting...' : 'Confirm Admission'}
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>
      )}
    </div>
  );
}
