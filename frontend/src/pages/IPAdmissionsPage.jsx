import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, UserCheck, ChevronRight, ChevronLeft, Eye, Search, UserPlus, X, Check, Info, Stethoscope, Building2, Phone, ClipboardList, Activity, Home, User, Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import Modal from '../components/common/Modal';
import DataTable from '../components/common/DataTable';
import ServiceUsageModal from '../components/ip/ServiceUsageModal';
import MedicationLogModal from '../components/ip/MedicationLogModal';
import IPAdmissionPaperTemplate from '../components/ip/IPAdmissionPaperTemplate';
import { useBranding } from '../hooks/useBranding';
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

const AVATAR_COLORS = [
  'bg-emerald-100 text-emerald-700',
  'bg-purple-100 text-purple-700',
  'bg-amber-100 text-amber-700',
  'bg-blue-100 text-blue-700',
  'bg-rose-100 text-rose-700',
  'bg-teal-100 text-teal-700',
];
const avatarColor = (id) => {
  const str = String(id || '');
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};
const initials = (name) => (name || '').split(' ').filter(Boolean).slice(0, 2).map((n) => n[0]).join('').toUpperCase();

export default function IPAdmissionsPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useSelector((s) => s.auth);
  const { branding } = useBranding();
  const canAdmit = hasRole(user?.role, ['Super Admin', 'Admin', 'Receptionist']);
  const viewOnly = hasRole(user?.role, ['Doctor', 'Pharmacist']) && !canAdmit;

  const [tab, setTab] = useState(searchParams.get('tab') === 'discharge' ? 'discharge' : 'admitted');
  const [page, setPage] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [step, setStep] = useState(1);
  const [patientSearch, setPatientSearch] = useState('');
  const [patients, setPatients] = useState([]);
  const [recentPatients, setRecentPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [doctors, setDoctors] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [serviceAdmission, setServiceAdmission] = useState(null);
  const [medicationAdmission, setMedicationAdmission] = useState(null);
  const [printData, setPrintData] = useState(null); // { branding, admission }
  const [form, setForm] = useState({
    patient: '', doctor: '', department: '', admissionType: 'elective',
    admissionDiagnosis: '', attendant: { name: '', relation: '', phone: '' },
    roomType: '', selectedRoom: null, opRegistration: '',
    knownAllergies: '', bloodPressure: '', pulse: '', temperature: '', weight: '',
    advanceAmount: '', advancePaymentMode: 'cash',
  });
  const qc = useQueryClient();

  const STEP_LABELS = ['Select Patient', 'Admission Details', 'Clinical Details', 'Review & Confirm'];

  useEffect(() => {
    if (searchParams.get('tab') === 'discharge') setTab('discharge');
  }, [searchParams]);

  const statusFilter = tab === 'discharge' ? 'discharged' : 'admitted';

  const { data, isLoading } = useQuery({
    queryKey: ['admissions', page, statusFilter],
    queryFn: () => api.get(`/ip?page=${page}&limit=20&status=${statusFilter}`).then((r) => r.data),
  });

  const { data: availableRooms } = useQuery({
    queryKey: ['availableRooms', form.roomType],
    queryFn: () => api.get(`/rooms/available${form.roomType ? `?type=${form.roomType}` : ''}`).then((r) => r.data.data),
    enabled: (step === 2 || step === 3) && canAdmit && showAdd,
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
    if (showAdd && canAdmit) {
      api.get('/patients?limit=4&sort=-updatedAt').then((r) => setRecentPatients(r.data.data || [])).catch(() => {});
    }
  }, [showAdd, canAdmit]);

  useEffect(() => {
    const pid = searchParams.get('patient');
    const op = searchParams.get('op');
    if (pid && canAdmit) {
      api.get(`/patients/${pid}`).then((r) => {
        const p = r.data.data;
        setForm((f) => ({ ...f, patient: p._id, opRegistration: op || '' }));
        setSelectedPatient(p);
        setPatientSearch(`${p.name} (${p.patientId})`);
        setShowAdd(true);
        setStep(2);
      }).catch(() => {});
    }
  }, [searchParams, canAdmit]);

  useEffect(() => {
    if (patientSearch.length >= 2 && !form.patient) {
      api.get(`/patients/search?q=${patientSearch}`).then((r) => setPatients(r.data.data || []));
    } else {
      setPatients([]);
    }
  }, [patientSearch, form.patient]);

  const admitMut = useMutation({
    mutationFn: (payload) => api.post('/ip', payload),
    onSuccess: (r) => {
      toast.success('Patient admitted — printing admission slip…');
      qc.invalidateQueries(['admissions']);
      qc.invalidateQueries(['roomDashboard']);
      qc.invalidateQueries(['beds']);
      const admission = r?.data?.data;
      if (admission && selectedPatient?.address && !admission.patient?.address) {
        admission.patient = { ...admission.patient, address: selectedPatient.address, bloodGroup: selectedPatient.bloodGroup };
      }
      setShowAdd(false);
      resetForm();
      if (admission) setPrintData({ branding, admission });
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Admission failed'),
  });

  const printAdmissionSlip = async (item) => {
    try {
      const r = await api.get(`/ip/${item._id}`);
      setPrintData({ branding, admission: r?.data?.data || item });
    } catch {
      setPrintData({ branding, admission: item });
    }
  };

  useEffect(() => {
    if (!printData) return undefined;
    let cancelled = false;
    const handleAfterPrint = () => setPrintData(null);
    window.addEventListener('afterprint', handleAfterPrint);

    const runPrint = async () => {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const root = document.getElementById('ip-admission-print-root');
      const img = root?.querySelector('img.ip-logo');
      if (img && !img.complete) {
        await Promise.race([
          new Promise((res) => { img.onload = res; img.onerror = res; }),
          new Promise((res) => setTimeout(res, 1200)),
        ]);
      }
      if (!cancelled) window.print();
    };

    const timer = setTimeout(runPrint, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, [printData]);

  const resetForm = () => {
    setStep(1);
    setForm({
      patient: '', doctor: '', department: '', admissionType: 'elective',
      admissionDiagnosis: '', attendant: { name: '', relation: '', phone: '' },
      roomType: '', selectedRoom: null, opRegistration: '',
      knownAllergies: '', bloodPressure: '', pulse: '', temperature: '', weight: '',
      advanceAmount: '', advancePaymentMode: 'cash',
    });
    setPatientSearch('');
    setPatients([]);
    setSelectedPatient(null);
  };

  const pickPatient = (p) => {
    setForm((f) => ({ ...f, patient: p._id }));
    setSelectedPatient(p);
    setPatientSearch(`${p.name} (${p.patientId})`);
    setPatients([]);
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
      knownAllergies: form.knownAllergies,
      admissionVitals: {
        bloodPressure: form.bloodPressure,
        pulse: form.pulse ? Number(form.pulse) : undefined,
        temperature: form.temperature ? Number(form.temperature) : undefined,
        weight: form.weight ? Number(form.weight) : undefined,
      },
      opRegistration: form.opRegistration || undefined,
      bed: room.bed?._id || room.bed || room._id,
      room: room.bed ? room._id : undefined,
      advanceAmount: form.advanceAmount !== '' ? Number(form.advanceAmount) : 0,
      advancePaymentMode: form.advancePaymentMode || '',
    };
    admitMut.mutate(payload);
  };

  const EMPTY_QUICK_PATIENT = {
    name: '', phone: '', age: '', gender: '', email: '', bloodGroup: '',
    rchId: '', allergies: '',
    address: { street: '', city: '', state: '', pincode: '' },
    emergencyContact: { name: '', phone: '' },
  };
  const [quickForm, setQuickForm] = useState(EMPTY_QUICK_PATIENT);
  const quickAddMut = useMutation({
    mutationFn: (d) => {
      const allergies = String(d.allergies || '')
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean);
      return api.post('/patients', {
        name: d.name,
        phone: d.phone,
        age: Number(d.age),
        gender: d.gender,
        email: d.email || undefined,
        bloodGroup: d.bloodGroup || undefined,
        rchId: d.rchId || undefined,
        address: {
          street: d.address?.street || undefined,
          city: d.address?.city || undefined,
          state: d.address?.state || undefined,
          pincode: d.address?.pincode || undefined,
        },
        emergencyContact: {
          name: d.emergencyContact?.name || undefined,
          phone: d.emergencyContact?.phone || undefined,
        },
        allergies,
      });
    },
    onSuccess: (r) => {
      toast.success(`Patient registered — UHID ${r.data.data?.patientId || ''}`);
      const p = r.data.data;
      pickPatient(p);
      setShowQuickAdd(false);
      setQuickForm(EMPTY_QUICK_PATIENT);
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Failed to add patient'),
  });

  const runPatientSearch = async () => {
    if (patientSearch.trim().length < 2) {
      toast.error('Type at least 2 characters to search');
      return;
    }
    try {
      const r = await api.get(`/patients/search?q=${encodeURIComponent(patientSearch.trim())}`);
      setPatients(r.data.data || []);
      if (!(r.data.data || []).length) toast.error('No patient found — use New Patient to register');
    } catch {
      toast.error('Search failed');
    }
  };

  const columns = [
    { key: 'uhid', header: 'UHID', render: (r) => <span className="font-mono font-semibold text-blue-700" title="Patient ID from registration">{r.patient?.patientId || '—'}</span> },
    { key: 'admissionNumber', header: 'Admission No', render: (r) => <span className="font-mono text-sm text-slate-600">{r.admissionNumber}</span> },
    { key: 'patient', header: 'Patient', render: (r) => <div><p className="font-medium">{r.patient?.name}</p><p className="text-xs text-gray-400">{r.patient?.age}yr · {r.patient?.gender}</p></div> },
    { key: 'doctor', header: 'Doctor', render: (r) => <span>Dr. {r.doctor?.name}</span> },
    { key: 'department', header: 'Dept', render: (r) => r.department?.name },
    { key: 'bed', header: 'Room/Bed', render: (r) => r.room?.roomNumber || r.bed?.roomNumber || r.bed?.bedNumber || 'N/A' },
    { key: 'admissionDate', header: 'Admitted', render: (r) => new Date(r.admissionDate).toLocaleDateString('en-IN') },
    { key: 'status', header: 'Status', render: (r) => <span className="badge-blue">{r.status}</span> },
    { key: 'actions', header: '', render: (r) => (
      <div className="flex gap-2 flex-wrap">
        <button type="button" onClick={() => printAdmissionSlip(r)} className="text-xs text-slate-600 hover:underline font-medium flex items-center gap-1">
          <Printer size={12} /> Print
        </button>
        <button type="button" onClick={() => navigate(`/ip-admissions/${r._id}`)} className="text-xs text-blue-600 hover:underline font-medium flex items-center gap-1">
          <Eye size={12} /> View
        </button>
        {r.status === 'admitted' && (
          <button type="button" onClick={() => setServiceAdmission(r)} className="text-xs text-purple-600 hover:underline font-medium">
            Services / Equipment
          </button>
        )}
        <button type="button" onClick={() => setMedicationAdmission(r)} className="text-xs text-teal-600 hover:underline font-medium">
          {r.status === 'admitted' ? 'Medicines' : 'Medicine History'}
        </button>
      </div>
    )},
  ];

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-400 flex items-center gap-1.5">
        <Home size={13} /> IP Management <ChevronRight size={13} /> <span className="text-slate-500">IP Admissions</span>
      </p>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {tab === 'discharge' ? 'Discharge Processing' : viewOnly ? 'IP Patients' : 'IP Admissions'}
          </h1>
          <p className="text-sm text-gray-500">
            {data?.total || 0} currently admitted
            {canAdmit ? ' — use Admit Patient to start a new IP stay' : ''}
          </p>
        </div>
        {canAdmit && tab !== 'discharge' && (
          <button type="button" onClick={() => { resetForm(); setShowAdd(true); }}
            className="flex items-center gap-2 text-sm font-semibold px-5 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors shadow-sm shadow-emerald-600/25">
            <UserCheck size={18} /> Admit Patient
          </button>
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

      <ServiceUsageModal
        admission={serviceAdmission}
        isOpen={!!serviceAdmission}
        onClose={() => setServiceAdmission(null)}
      />

      <MedicationLogModal
        admission={medicationAdmission}
        isOpen={!!medicationAdmission}
        onClose={() => setMedicationAdmission(null)}
      />

      {canAdmit && (
      <AnimatePresence>
        {showAdd && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => { setShowAdd(false); resetForm(); }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 16 }}
              className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-hidden z-10 flex flex-col"
            >
              {/* Header */}
              <div className="flex items-start justify-between px-6 py-5 border-b border-slate-100 flex-shrink-0">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <UserCheck size={18} className="text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">Admit Patient</h2>
                    <p className="text-sm text-slate-400 mt-0.5">Step {step} of 4: {STEP_LABELS[step - 1]}</p>
                  </div>
                </div>
                <button type="button" onClick={() => { setShowAdd(false); resetForm(); }} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                  <X size={20} />
                </button>
              </div>

              {/* Stepper */}
              <div className="flex items-start px-8 pt-5 pb-4 flex-shrink-0">
                {STEP_LABELS.map((label, i) => {
                  const num = i + 1;
                  const state = num < step ? 'done' : num === step ? 'active' : 'pending';
                  return (
                    <React.Fragment key={label}>
                      <div className="flex flex-col items-center w-20 flex-shrink-0">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                          state === 'active' ? 'bg-blue-600 text-white' :
                          state === 'done' ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'
                        }`}>
                          {state === 'done' ? <Check size={15} /> : num}
                        </div>
                        <p className={`text-[11px] font-medium mt-1.5 text-center leading-tight ${state === 'active' ? 'text-blue-600' : state === 'done' ? 'text-slate-600' : 'text-slate-400'}`}>{label}</p>
                      </div>
                      {num < 4 && <div className={`flex-1 h-0.5 mt-4 ${num < step ? 'bg-blue-600' : 'bg-slate-200'}`} />}
                    </React.Fragment>
                  );
                })}
              </div>

              <div className="overflow-y-auto px-6 pb-2 flex-1">
                {/* Step 1: Select Patient */}
                {step === 1 && (
                  <div className="space-y-5 pb-4">
                    <div>
                      <label className="text-sm font-bold text-slate-800 block mb-2">Search & Select Patient</label>
                      <div className="flex gap-3">
                        <div className="relative flex-1">
                          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text" placeholder="Search by name, UHID, phone number, email or scan ID"
                            value={patientSearch}
                            onChange={(e) => { setPatientSearch(e.target.value); setForm({ ...form, patient: '' }); setSelectedPatient(null); }}
                            className="w-full pl-10 pr-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          {patients.length > 0 && (
                            <div className="absolute mt-1 w-full border border-slate-200 rounded-xl overflow-hidden shadow-lg bg-white z-20 max-h-48 overflow-y-auto">
                              {patients.map((p) => (
                                <button key={p._id} type="button" onClick={() => pickPatient(p)}
                                  className="w-full text-left px-4 py-2.5 hover:bg-blue-50 text-sm transition-colors border-b border-slate-100 last:border-0">
                                  <span className="font-medium text-slate-900">{p.name}</span>
                                  <span className="text-slate-400 ml-2">{p.patientId} • {p.phone}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <button type="button" onClick={runPatientSearch}
                          className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors whitespace-nowrap flex-shrink-0">
                          <Search size={15} /> Search
                        </button>
                        <button type="button" onClick={() => { setQuickForm(EMPTY_QUICK_PATIENT); setShowQuickAdd(true); }}
                          className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-blue-600 bg-white border border-blue-200 rounded-xl hover:bg-blue-50 transition-colors whitespace-nowrap flex-shrink-0">
                          <UserPlus size={16} /> New Patient
                        </button>
                      </div>
                    </div>

                    <div>
                      <p className="text-sm font-bold text-slate-800 mb-2">Recent Patients</p>
                      <div className="space-y-2.5">
                        {recentPatients.map((p) => (
                          <button key={p._id} type="button" onClick={() => pickPatient(p)}
                            className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl border-2 text-left transition-all ${
                              form.patient === p._id ? 'border-blue-500 ring-2 ring-blue-100 bg-blue-50/40' : 'border-slate-100 hover:border-slate-200 bg-white'
                            }`}>
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${avatarColor(p._id)}`}>
                              {initials(p.name)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-slate-900 truncate">{p.name}</p>
                              <p className="text-xs text-slate-400">{p.age} Y / {p.gender} <span className="mx-1">·</span> UHID: {p.patientId}</p>
                            </div>
                            <div className="hidden sm:block text-xs text-slate-500 min-w-[120px]">
                              <p>{p.phone}</p>
                            </div>
                            <div className="hidden md:block text-xs text-slate-500 min-w-[110px]">
                              <p className="text-slate-400">Last Visit:</p>
                              <p>{new Date(p.updatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                            </div>
                            <ChevronRight size={18} className="text-slate-300 flex-shrink-0" />
                          </button>
                        ))}
                        {!recentPatients.length && <p className="text-sm text-slate-400 py-4 text-center">No recent patients</p>}
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 2: Admission Details */}
                {step === 2 && (
                  <div className="space-y-5 pb-4">
                    <div className="flex items-center gap-2 text-blue-600 pb-2 border-b-2 border-blue-100">
                      <Stethoscope size={16} />
                      <h3 className="text-sm font-bold">Admission Details</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-medium text-slate-500 block mb-1.5">Doctor *</label>
                        <div className="relative">
                          <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                          <select value={form.doctor} onChange={(e) => setForm({ ...form, doctor: e.target.value })}
                            className="w-full pl-9 pr-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none">
                            <option value="">Select doctor</option>
                            {doctors.map((d) => <option key={d._id} value={d._id}>Dr. {d.name}</option>)}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-500 block mb-1.5">Department *</label>
                        <div className="relative">
                          <Building2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                          <select value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}
                            className="w-full pl-9 pr-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none">
                            <option value="">Select department</option>
                            {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-500 block mb-1.5">Admission Type</label>
                        <select value={form.admissionType} onChange={(e) => setForm({ ...form, admissionType: e.target.value })} className="input-field">
                          <option value="elective">Elective</option>
                          <option value="emergency">Emergency</option>
                          <option value="transfer">Transfer</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-500 block mb-1.5">Room Type</label>
                        <select value={form.roomType} onChange={(e) => setForm({ ...form, roomType: e.target.value, selectedRoom: null })} className="input-field">
                          {ROOM_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-medium text-slate-500 mb-2">Select an available room/bed *</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-52 overflow-y-auto">
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
                    </div>
                  </div>
                )}

                {/* Step 3: Clinical Details */}
                {step === 3 && (
                  <div className="space-y-5 pb-4">
                    <div className="flex items-center gap-2 text-blue-600 pb-2 border-b-2 border-blue-100">
                      <Activity size={16} />
                      <h3 className="text-sm font-bold">Clinical Details</h3>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-500 block mb-1.5">Admission Diagnosis *</label>
                      <textarea value={form.admissionDiagnosis} onChange={(e) => setForm({ ...form, admissionDiagnosis: e.target.value })}
                        rows={3} placeholder="Enter provisional diagnosis..."
                        className="w-full px-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-500 block mb-1.5">Known Allergies (Optional)</label>
                      <input value={form.knownAllergies} onChange={(e) => setForm({ ...form, knownAllergies: e.target.value })}
                        placeholder="e.g. Penicillin, Peanuts" className="input-field" />
                    </div>
                    <div className="grid grid-cols-4 gap-4">
                      <div>
                        <label className="text-xs font-medium text-slate-500 block mb-1.5">BP (mmHg)</label>
                        <input value={form.bloodPressure} onChange={(e) => setForm({ ...form, bloodPressure: e.target.value })} placeholder="120/80" className="input-field" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-500 block mb-1.5">Pulse</label>
                        <input value={form.pulse} onChange={(e) => setForm({ ...form, pulse: e.target.value })} type="number" placeholder="78" className="input-field" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-500 block mb-1.5">Temp (°F)</label>
                        <input value={form.temperature} onChange={(e) => setForm({ ...form, temperature: e.target.value })} type="number" placeholder="98.6" className="input-field" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-500 block mb-1.5">Weight (kg)</label>
                        <input value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} type="number" placeholder="65" className="input-field" />
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-blue-600 pb-2 border-b-2 border-blue-100 pt-2">
                      <Phone size={16} />
                      <h3 className="text-sm font-bold">Attendant Details</h3>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="text-xs font-medium text-slate-500 block mb-1.5">Attendant Name</label>
                        <input value={form.attendant.name} onChange={(e) => setForm({ ...form, attendant: { ...form.attendant, name: e.target.value } })} className="input-field" placeholder="Full name" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-500 block mb-1.5">Relation</label>
                        <input value={form.attendant.relation} onChange={(e) => setForm({ ...form, attendant: { ...form.attendant, relation: e.target.value } })} className="input-field" placeholder="e.g. Spouse" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-500 block mb-1.5">Attendant Phone</label>
                        <input value={form.attendant.phone} onChange={(e) => setForm({ ...form, attendant: { ...form.attendant, phone: e.target.value } })} className="input-field" placeholder="Mobile number" />
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 4: Review & Confirm */}
                {step === 4 && (
                  <div className="space-y-5 pb-4">
                    <div className="flex items-center gap-2 text-blue-600 pb-2 border-b-2 border-blue-100">
                      <ClipboardList size={16} />
                      <h3 className="text-sm font-bold">Review & Confirm</h3>
                    </div>
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm space-y-2 text-blue-900">
                      <p><strong>Patient:</strong> {patientSearch}</p>
                      <p><strong>Doctor:</strong> Dr. {doctors.find((d) => d._id === form.doctor)?.name}</p>
                      <p><strong>Department:</strong> {departments.find((d) => d._id === form.department)?.name}</p>
                      <p><strong>Admission Type:</strong> <span className="capitalize">{form.admissionType}</span></p>
                      {form.selectedRoom && (
                        <p><strong>Room:</strong> {form.selectedRoom.roomNumber} · Bed {form.selectedRoom.bedNumber || form.selectedRoom.bed?.bedNumber} — ₹{form.selectedRoom.dailyCharge || form.selectedRoom.bed?.dailyRate}/day</p>
                      )}
                      <p><strong>Diagnosis:</strong> {form.admissionDiagnosis}</p>
                      {form.knownAllergies && <p><strong>Allergies:</strong> {form.knownAllergies}</p>}
                      {(form.bloodPressure || form.pulse || form.temperature || form.weight) && (
                        <p><strong>Vitals:</strong> {[form.bloodPressure && `BP ${form.bloodPressure}`, form.pulse && `Pulse ${form.pulse}`, form.temperature && `Temp ${form.temperature}°F`, form.weight && `${form.weight}kg`].filter(Boolean).join(' · ')}</p>
                      )}
                      {form.attendant.name && <p><strong>Attendant:</strong> {form.attendant.name} {form.attendant.relation && `(${form.attendant.relation})`} — {form.attendant.phone}</p>}
                    </div>

                    <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                      <p className="text-sm font-bold text-slate-800">Advance Payment (printed on admission slip)</p>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-medium text-slate-500 block mb-1.5">Advance Amount (₹)</label>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={form.advanceAmount}
                            onChange={(e) => setForm({ ...form, advanceAmount: e.target.value })}
                            placeholder="e.g. 5000"
                            className="input-field"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-slate-500 block mb-1.5">Payment Mode</label>
                          <select
                            value={form.advancePaymentMode}
                            onChange={(e) => setForm({ ...form, advancePaymentMode: e.target.value })}
                            className="input-field"
                          >
                            <option value="cash">Cash</option>
                            <option value="upi">UPI</option>
                            <option value="card">Card</option>
                            <option value="cheque">Cheque</option>
                            <option value="bank_transfer">Bank Transfer</option>
                            <option value="other">Other</option>
                          </select>
                        </div>
                      </div>
                      <p className="text-xs text-slate-500 flex items-start gap-1.5">
                        <Info size={13} className="mt-0.5 flex-shrink-0" />
                        A4 admission slip will print automatically after confirm (hospital branding + patient, bed & advance details).
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              {step === 1 && (
                <div className="flex items-center justify-between gap-4 px-6 py-4 border-t border-slate-100 flex-shrink-0">
                  <div className="flex items-start gap-2.5 text-sm text-blue-700 flex-1 min-w-0">
                    <Info size={16} className="mt-0.5 flex-shrink-0" />
                    <span><span className="font-semibold">Can't find the patient?</span><br className="hidden sm:block" /> You can add a new patient to the system and proceed with admission.</span>
                  </div>
                  <button type="button" disabled={!form.patient} onClick={() => setStep(2)}
                    className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 flex-shrink-0 shadow-sm shadow-blue-600/20">
                    Next Step <ChevronRight size={15} />
                  </button>
                </div>
              )}
              {step === 2 && (
                <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 flex-shrink-0">
                  <button type="button" onClick={() => setStep(1)}
                    className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors">
                    <ChevronLeft size={15} /> Back
                  </button>
                  <button type="button" disabled={!form.doctor || !form.department || !form.selectedRoom} onClick={() => setStep(3)}
                    className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 shadow-sm shadow-blue-600/20">
                    Next Step <ChevronRight size={15} />
                  </button>
                </div>
              )}
              {step === 3 && (
                <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 flex-shrink-0">
                  <button type="button" onClick={() => setStep(2)}
                    className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors">
                    <ChevronLeft size={15} /> Back
                  </button>
                  <button type="button" disabled={!form.admissionDiagnosis} onClick={() => setStep(4)}
                    className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 shadow-sm shadow-blue-600/20">
                    Next Step <ChevronRight size={15} />
                  </button>
                </div>
              )}
              {step === 4 && (
                <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 flex-shrink-0">
                  <button type="button" onClick={() => setStep(3)}
                    className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors">
                    <ChevronLeft size={15} /> Back
                  </button>
                  <button type="button" onClick={handleAdmit} disabled={admitMut.isPending}
                    className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 shadow-sm shadow-blue-600/20">
                    <UserCheck size={16} /> {admitMut.isPending ? 'Admitting...' : 'Confirm Admission'}
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      )}

      {/* New Patient for IP admission — creates UHID then selects for admit */}
      <Modal isOpen={showQuickAdd} onClose={() => setShowQuickAdd(false)} title="Register New Patient for IP" size="lg">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            quickAddMut.mutate(quickForm);
          }}
          className="p-6 space-y-4 max-h-[75vh] overflow-y-auto"
        >
          <p className="text-xs text-slate-500 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
            Patient gets a lifelong <strong>UHID</strong> on save, then is selected for this admission automatically.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
              <input required value={quickForm.name} onChange={(e) => setQuickForm({ ...quickForm, name: e.target.value })} className="input-field" placeholder="Mrs. Name / Patient full name" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
              <input required value={quickForm.phone} onChange={(e) => setQuickForm({ ...quickForm, phone: e.target.value })} className="input-field" placeholder="Mobile number" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Age *</label>
              <input required value={quickForm.age} onChange={(e) => setQuickForm({ ...quickForm, age: e.target.value })} type="number" min="0" className="input-field" placeholder="Age in years" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Gender *</label>
              <select required value={quickForm.gender} onChange={(e) => setQuickForm({ ...quickForm, gender: e.target.value })} className="input-field">
                <option value="">Select gender</option>
                <option>Male</option>
                <option>Female</option>
                <option>Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Blood Group</label>
              <select value={quickForm.bloodGroup} onChange={(e) => setQuickForm({ ...quickForm, bloodGroup: e.target.value })} className="input-field">
                <option value="">Unknown</option>
                {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((b) => <option key={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input value={quickForm.email} onChange={(e) => setQuickForm({ ...quickForm, email: e.target.value })} type="email" className="input-field" placeholder="Email (optional)" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">RCH ID</label>
              <input value={quickForm.rchId} onChange={(e) => setQuickForm({ ...quickForm, rchId: e.target.value })} className="input-field" placeholder="Maternity RCH ID (if any)" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Allergies</label>
              <input value={quickForm.allergies} onChange={(e) => setQuickForm({ ...quickForm, allergies: e.target.value })} className="input-field" placeholder="e.g. Inj. Xone (comma separated)" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Street Address *</label>
              <textarea
                required
                rows={2}
                value={quickForm.address.street}
                onChange={(e) => setQuickForm({ ...quickForm, address: { ...quickForm.address, street: e.target.value } })}
                className="input-field"
                placeholder="House / street address (shown on discharge summary)"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">City *</label>
              <input
                required
                value={quickForm.address.city}
                onChange={(e) => setQuickForm({ ...quickForm, address: { ...quickForm.address, city: e.target.value } })}
                className="input-field"
                placeholder="City"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
              <input
                value={quickForm.address.state}
                onChange={(e) => setQuickForm({ ...quickForm, address: { ...quickForm.address, state: e.target.value } })}
                className="input-field"
                placeholder="State"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pincode</label>
              <input
                value={quickForm.address.pincode}
                onChange={(e) => setQuickForm({ ...quickForm, address: { ...quickForm.address, pincode: e.target.value } })}
                className="input-field"
                placeholder="Pincode"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Emergency Contact</label>
              <input
                value={quickForm.emergencyContact.name}
                onChange={(e) => setQuickForm({ ...quickForm, emergencyContact: { ...quickForm.emergencyContact, name: e.target.value } })}
                className="input-field"
                placeholder="Contact name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Emergency Phone</label>
              <input
                value={quickForm.emergencyContact.phone}
                onChange={(e) => setQuickForm({ ...quickForm, emergencyContact: { ...quickForm.emergencyContact, phone: e.target.value } })}
                className="input-field"
                placeholder="Contact phone"
              />
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-4 border-t border-gray-200">
            <button type="button" onClick={() => setShowQuickAdd(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={quickAddMut.isPending} className="btn-primary">
              <UserPlus size={15} /> {quickAddMut.isPending ? 'Registering...' : 'Register & Select for Admit'}
            </button>
          </div>
        </form>
      </Modal>

      {printData &&
        createPortal(
          <IPAdmissionPaperTemplate branding={printData.branding || branding} admission={printData.admission} />,
          document.body,
        )}
    </div>
  );
}