import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Clock, CheckCircle2, Stethoscope, AlertCircle, RefreshCw, Pill,
  FlaskConical, Bed, Home, ChevronRight, Building2, ListFilter, User,
  Users, ClipboardList, Calendar, Timer, XCircle, ArrowRight,
  Search, UserPlus, Footprints, Flag, Link2, RotateCcw, Send, Info,
  Hourglass, Phone, CreditCard, X, Printer,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import api from '../services/api';
import Modal from '../components/common/Modal';
import { getSocket } from '../services/socket';
import { useBranding } from '../hooks/useBranding';
import OPPaperTemplate from '../components/op/OPPaperTemplate';
import { hasRole } from '../utils/roles';

const statusConfig = {
  waiting: { label: 'Waiting', color: 'badge-yellow', icon: Clock },
  in_consultation: { label: 'In Consultation', color: 'badge-blue', icon: Stethoscope },
  consultation_completed: { label: 'Consultation Done', color: 'badge-green', icon: CheckCircle2 },
  completed: { label: 'Completed', color: 'badge-green', icon: CheckCircle2 },
  sent_to_pharmacy: { label: 'Sent To Pharmacy', color: 'badge-blue', icon: Pill },
  pharmacy_completed: { label: 'Pharmacy Done', color: 'badge-green', icon: CheckCircle2 },
  sent_to_lab: { label: 'Sent To Lab', color: 'badge-blue', icon: FlaskConical },
  admitted: { label: 'Admitted', color: 'badge-blue', icon: Bed },
  discharged: { label: 'Discharged', color: 'badge-gray', icon: CheckCircle2 },
  cancelled: { label: 'Cancelled', color: 'badge-gray', icon: AlertCircle },
  no_show: { label: 'No Show', color: 'badge-red', icon: AlertCircle },
};

const fmtTime = (d) => d ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '-';
const fmtDate = (d) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

const TABS = [
  { key: 'waiting', label: 'Waiting' },
  { key: 'in_consultation', label: 'In Consultation' },
  { key: 'completed', label: 'Completed' },
  { key: 'admitted', label: 'Admitted' },
];

export default function OPQueuePage() {
  const navigate = useNavigate();
  const { user } = useSelector((s) => s.auth);
  const { branding } = useBranding();
  const canAdmit = hasRole(user?.role, ['Super Admin', 'Admin', 'Receptionist']);
  const [showAdd, setShowAdd] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [patientSearch, setPatientSearch] = useState('');
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [deptFilter, setDeptFilter] = useState('');
  const [doctorFilter, setDoctorFilter] = useState(user?.role === 'Doctor' ? user?.id : '');
  const [typeFilter, setTypeFilter] = useState('');
  const [activeTab, setActiveTab] = useState('waiting');
  const [printData, setPrintData] = useState(null); // { branding, op } for OPPaperTemplate
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

  const todayStr = () => new Date().toISOString().slice(0, 10);
  const nowStr = () => new Date().toTimeString().slice(0, 5);

  const defaultRegForm = {
    patient: '', doctor: '', department: '', appointmentType: 'walkin',
    priority: 'normal', queueFor: 'Consultation', chiefComplaint: '', referredBy: '',
    visitDate: todayStr(), visitTime: nowStr(), mobileNumber: '', uhid: '',
  };

  const { register, handleSubmit, reset, watch, setValue } = useForm({ defaultValues: defaultRegForm });

  const closeRegForm = () => {
    setShowAdd(false);
    setPatientSearch('');
    setPatients([]);
    setSelectedPatient(null);
    reset(defaultRegForm);
  };

  const resetRegForm = () => {
    setPatientSearch('');
    setPatients([]);
    setSelectedPatient(null);
    reset(defaultRegForm);
  };

  const handlePatientSearchChange = async (e) => {
    const val = e.target.value;
    setPatientSearch(val);
    setValue('patient', '');
    setSelectedPatient(null);
    if (val.length >= 2) {
      try {
        const r = await api.get(`/patients/search?q=${val}`);
        setPatients(r.data.data || []);
      } catch (err) {}
    } else {
      setPatients([]);
    }
  };

  const pickPatient = (p) => {
    setValue('patient', p._id);
    setPatientSearch(`${p.name} (${p.patientId})`);
    setSelectedPatient(p);
    setValue('mobileNumber', p.phone || '');
    setValue('uhid', p.patientId || '');
    setPatients([]);
  };

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
    mutationFn: (d) => {
      const scheduledTime = d.visitDate && d.visitTime ? new Date(`${d.visitDate}T${d.visitTime}`) : undefined;
      const payload = {
        patient: d.patient,
        doctor: d.doctor,
        department: d.department,
        appointmentType: d.appointmentType,
        priority: d.priority,
        queueFor: d.queueFor,
        chiefComplaint: d.chiefComplaint,
        referredBy: d.referredBy,
        scheduledTime,
      };
      return api.post('/op', payload);
    },
    onSuccess: (r) => {
      toast.success('Patient registered — printing OP paper…');
      qc.invalidateQueries(['opQueue']);
      const op = r?.data?.data;
      // Prefer address from the selected patient if create response omitted it
      if (op && selectedPatient?.address && !op.patient?.address) {
        op.patient = { ...op.patient, address: selectedPatient.address };
      }
      closeRegForm();
      if (op) setPrintData({ branding, op });
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Failed to register patient'),
  });

  const printOPPaper = async (item) => {
    try {
      const r = await api.get(`/op/${item._id}`);
      const op = r?.data?.data || item;
      setPrintData({ branding, op });
    } catch {
      setPrintData({ branding, op: item });
    }
  };

  // Wait for logo image (if any), then open A4 print dialog
  useEffect(() => {
    if (!printData) return undefined;

    let cancelled = false;
    const handleAfterPrint = () => setPrintData(null);
    window.addEventListener('afterprint', handleAfterPrint);

    const runPrint = async () => {
      // Let React paint the portal first
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const root = document.getElementById('op-paper-print-root');
      const img = root?.querySelector('img.op-logo');
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

  const statusMut = useMutation({
    mutationFn: ({ id, status }) => api.put(`/op/${id}/status`, { status }),
    onSuccess: () => qc.invalidateQueries(['opQueue']),
  });

  // Quick "Add New Patient" mini-form used inside the registration modal
  const { register: registerQuick, handleSubmit: handleQuickSubmit, reset: resetQuick } = useForm();
  const quickAddMut = useMutation({
    mutationFn: (d) => api.post('/patients', d),
    onSuccess: (r) => {
      toast.success('Patient registered!');
      qc.invalidateQueries(['patients']);
      const p = r.data.data;
      pickPatient(p);
      setShowQuickAdd(false);
      resetQuick();
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Failed to add patient'),
  });

  const departmentQueueCount = useMemo(() => {
    const deptId = watch ? watch('department') : '';
    if (!deptId) return null;
    return (queue?.data || []).filter((q) => (q.department?._id || q.department) === deptId && q.status === 'waiting').length;
  }, [queue, watch('department')]);

  const expectedWait = useMemo(() => {
    const n = departmentQueueCount ?? 0;
    const low = 5 + n * 5;
    const high = low + 10;
    return `${low} - ${high} mins`;
  }, [departmentQueueCount]);

  const allItems = queue?.data || [];
  const typeFiltered = typeFilter ? allItems.filter((q) => q.appointmentType === typeFilter) : allItems;

  const waiting = typeFiltered.filter((q) => q.status === 'waiting');
  const inConsult = typeFiltered.filter((q) => q.status === 'in_consultation');
  const completed = typeFiltered.filter((q) => ['completed', 'consultation_completed', 'sent_to_pharmacy', 'pharmacy_completed', 'sent_to_lab', 'discharged'].includes(q.status));
  const admitted = typeFiltered.filter((q) => q.status === 'admitted');

  const tabData = { waiting, in_consultation: inConsult, completed, admitted };
  const activeItems = tabData[activeTab] || [];

  const summary = useMemo(() => {
    const waitTimes = waiting.map((q) => q.waitingMinutes || 0).filter((n) => n > 0);
    const avg = waitTimes.length ? Math.round(waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length) : null;
    const longest = waitTimes.length ? Math.max(...waitTimes) : null;
    const cancelled = typeFiltered.filter((q) => ['cancelled', 'no_show'].includes(q.status)).length;
    return {
      total: typeFiltered.length,
      avg: avg !== null ? `${avg} min` : '--',
      longest: longest !== null ? `${longest} min` : '--',
      completedToday: completed.length,
      cancelled,
    };
  }, [typeFiltered, waiting, completed]);

  const statCards = [
    { key: 'waiting', label: 'Waiting', sub: 'Patients in queue', count: waiting.length, icon: Clock, bg: 'bg-blue-600' },
    { key: 'in_consultation', label: 'In Consultation', sub: 'Currently with doctor', count: inConsult.length, icon: User, bg: 'bg-amber-500' },
    { key: 'completed', label: 'Completed', sub: 'Today completed', count: completed.length, icon: CheckCircle2, bg: 'bg-emerald-500' },
    { key: 'admitted', label: 'Admitted', sub: 'Today admitted', count: admitted.length, icon: Users, bg: 'bg-purple-500' },
  ];

  const printBtn = (item) => (
    <button
      type="button"
      title="Print OP Paper"
      onClick={() => printOPPaper(item)}
      className="inline-flex items-center gap-1 text-xs font-medium py-1.5 px-2.5 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50"
    >
      <Printer size={13} /> Print
    </button>
  );

  const admitBtn = (item) => {
    if (!canAdmit || item.status === 'admitted' || !item.patient?._id) return null;
    return (
      <button
        type="button"
        title="Admit this patient to IP"
        onClick={() => navigate(`/ip-admissions?patient=${item.patient._id}&op=${item._id}`)}
        className="inline-flex items-center gap-1 text-xs font-semibold py-1.5 px-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
      >
        <Bed size={13} /> Admit to IP
      </button>
    );
  };

  const actionFor = (item) => {
    if (item.status === 'waiting') {
      return (
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {printBtn(item)}
          {admitBtn(item)}
          <button type="button" onClick={() => navigate(`/consultation/${item._id}`)}
            className="text-xs font-medium py-1.5 px-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Open Consultation
          </button>
          <button type="button" onClick={() => statusMut.mutate({ id: item._id, status: 'no_show' })}
            className="text-xs font-medium py-1.5 px-3 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200">
            No Show
          </button>
        </div>
      );
    }
    if (item.status === 'in_consultation') {
      return (
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {printBtn(item)}
          {admitBtn(item)}
          <button type="button" onClick={() => navigate(`/consultation/${item._id}`)}
            className="text-xs font-medium py-1.5 px-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Continue
          </button>
        </div>
      );
    }
    if (item.status === 'admitted') {
      return (
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {printBtn(item)}
          <button type="button" onClick={() => navigate('/ip-admissions')}
            className="text-xs font-medium py-1.5 px-3 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100">
            View Details
          </button>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2 flex-wrap justify-end">
        {printBtn(item)}
        {admitBtn(item)}
        <button type="button" onClick={() => navigate(`/consultation/${item._id}`)}
          className="text-xs font-medium py-1.5 px-3 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100">
          View Details
        </button>
      </div>
    );
  };

  const TableRow = ({ item, index }) => {
    const cfg = statusConfig[item.status] || statusConfig.waiting;
    return (
      <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition-colors">
        <td className="px-4 py-3 text-sm text-slate-500">{String(index + 1).padStart(3, '0')}</td>
        <td className="px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">{item.patient?.name}</p>
          <p className="text-xs text-slate-500">
            <span className="font-semibold">UHID:</span>{' '}
            <span className="font-mono font-semibold text-blue-600">{item.patient?.patientId || '—'}</span>
            {' · '}{item.patient?.age}yr · {item.patient?.gender}
          </p>
        </td>
        <td className="px-4 py-3 text-sm text-slate-600">{item.tokenNumber}</td>
        <td className="px-4 py-3 text-sm text-slate-600">Dr. {item.doctor?.name || 'Unassigned'}</td>
        <td className="px-4 py-3 text-sm text-slate-600">{item.department?.name}</td>
        <td className="px-4 py-3 text-sm text-slate-600">{fmtTime(item.createdAt)}</td>
        <td className="px-4 py-3 text-sm text-slate-600">{item.status === 'waiting' && item.waitingMinutes > 0 ? `${item.waitingMinutes} min` : '-'}</td>
        <td className="px-4 py-3"><span className={cfg.color}>{cfg.label}</span></td>
        <td className="px-4 py-3">{actionFor(item)}</td>
      </tr>
    );
  };

  const activeTabMeta = TABS.find((t) => t.key === activeTab);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">OP Queue</h1>
          <p className="text-sm text-slate-400 flex items-center gap-1.5 mt-1">
            <Home size={13} /> Home <ChevronRight size={13} /> <span className="text-slate-500">OP Queue</span>
          </p>
          <p className="text-sm text-slate-500 flex items-center gap-2 mt-2">
            <span className="flex items-center gap-1.5 font-medium text-emerald-600">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" /> Live Queue
            </span>
            <span className="text-slate-300">|</span>
            {queue?.data?.length || 0} patients today
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => refetch()} className="flex items-center gap-2 text-sm font-medium px-4 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors">
            <RefreshCw size={16} /> Refresh
          </button>
          {canAdmit && (
            <button
              type="button"
              onClick={() => navigate('/ip-admissions')}
              className="flex items-center gap-2 text-sm font-semibold px-4 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors shadow-sm shadow-emerald-600/20"
            >
              <Bed size={16} /> Admit Patient (IP)
            </button>
          )}
          <button onClick={() => { resetRegForm(); setShowAdd(true); }} className="flex items-center gap-2 text-sm font-medium px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors shadow-sm shadow-blue-600/20">
            <Plus size={16} /> Register Patient
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Building2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}
            className="w-full pl-9 pr-8 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none">
            <option value="">All Departments</option>
            {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
          </select>
        </div>
        {user?.role !== 'Doctor' && (
          <div className="relative flex-1 min-w-[200px]">
            <Stethoscope size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <select value={doctorFilter} onChange={(e) => setDoctorFilter(e.target.value)}
              className="w-full pl-9 pr-8 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none">
              <option value="">All Doctors</option>
              {doctors.map((d) => <option key={d._id} value={d._id}>Dr. {d.name}</option>)}
            </select>
          </div>
        )}
        <div className="relative flex-1 min-w-[200px]">
          <ListFilter size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
            className="w-full pl-9 pr-8 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none">
            <option value="">All Consultation Types</option>
            <option value="walkin">Walk-in</option>
            <option value="appointment">Appointment</option>
            <option value="followup">Follow-up</option>
            <option value="emergency">Emergency</option>
          </select>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((s) => (
          <button
            key={s.key}
            onClick={() => setActiveTab(s.key)}
            className={`text-left bg-white rounded-2xl p-4 shadow-sm border transition-all ${
              activeTab === s.key ? 'border-blue-300 ring-2 ring-blue-100' : 'border-slate-100 hover:border-slate-200'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-11 h-11 ${s.bg} rounded-xl flex items-center justify-center flex-shrink-0`}>
                <s.icon size={20} className="text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-bold text-slate-900 leading-none">{s.count}</p>
                <p className="text-sm font-medium text-slate-700 mt-1.5 truncate">{s.label}</p>
                <p className="text-xs text-slate-400 truncate">{s.sub}</p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Main grid: table + summary sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Queue table */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="flex items-center gap-1 px-4 pt-3 border-b border-slate-100 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`relative px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
                  activeTab === t.key ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {t.label} ({tabData[t.key]?.length || 0})
                {activeTab === t.key && (
                  <motion.div layoutId="op-tab-underline" className="absolute left-0 right-0 -bottom-px h-0.5 bg-blue-600 rounded-full" />
                )}
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="p-10 text-center text-sm text-slate-400">Loading queue...</div>
          ) : activeItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4">
              <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
                <ClipboardList size={28} className="text-blue-300" />
              </div>
              <p className="text-sm font-semibold text-slate-600">No patients in {activeTabMeta?.label.toLowerCase()} queue</p>
              <p className="text-xs text-slate-400 mt-1">All caught up! Great job.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    {['#', 'Patient Details', 'Token No.', 'Doctor', 'Department', 'Arrival Time', 'Wait Time', 'Status', 'Action'].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence>
                    {activeItems.map((item, i) => <TableRow key={item._id} item={item} index={i} />)}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          )}

          {/* Completed patients quick list */}
          {completed.length > 0 && (
            <div className="border-t border-slate-100 p-4">
              <p className="text-sm font-semibold text-slate-700 mb-3">Completed Patients ({completed.length})</p>
              <div className="space-y-2">
                {completed.map((item) => (
                  <div key={item._id} className="flex items-center gap-3 border-l-4 border-emerald-500 bg-slate-50/60 rounded-r-xl px-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{item.patient?.name}</p>
                      <p className="text-xs text-slate-500 truncate">
                        <span className="font-semibold">UHID:</span>{' '}
                        <span className="font-mono font-semibold text-blue-600">{item.patient?.patientId || '—'}</span>
                        {' · '}{item.patient?.age}yr · {item.patient?.gender}
                      </p>
                    </div>
                    <div className="hidden sm:block text-xs text-slate-500 min-w-[140px]">
                      <p>Dr. {item.doctor?.name || 'Unassigned'}</p>
                      <p className="text-slate-400">{item.department?.name}</p>
                    </div>
                    <div className="hidden md:block text-xs text-slate-500 min-w-[70px]">{fmtTime(item.createdAt)}</div>
                    <span className="badge-green flex-shrink-0">Completed</span>
                    {printBtn(item)}
                    <button onClick={() => navigate(`/consultation/${item._id}`)}
                      className="text-xs font-medium py-1.5 px-3 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 flex-shrink-0">
                      View Details
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Queue summary sidebar */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-900">Queue Summary</h3>
            <span className="flex items-center gap-1.5 text-xs text-slate-400">
              <Calendar size={13} /> {fmtDate(new Date())}
            </span>
          </div>
          <div className="space-y-1">
            {[
              { icon: Users, label: 'Total Patients Today', value: summary.total, bg: 'bg-blue-50', color: 'text-blue-600' },
              { icon: Clock, label: 'Average Wait Time', value: summary.avg, bg: 'bg-amber-50', color: 'text-amber-600' },
              { icon: Timer, label: 'Longest Wait Time', value: summary.longest, bg: 'bg-purple-50', color: 'text-purple-600' },
              { icon: CheckCircle2, label: 'Completed Today', value: summary.completedToday, bg: 'bg-emerald-50', color: 'text-emerald-600' },
              { icon: XCircle, label: 'Cancelled', value: summary.cancelled, bg: 'bg-red-50', color: 'text-red-600' },
            ].map((row) => (
              <div key={row.label} className="flex items-center gap-3 py-2.5 border-b border-slate-50 last:border-0">
                <div className={`w-8 h-8 ${row.bg} rounded-lg flex items-center justify-center flex-shrink-0`}>
                  <row.icon size={15} className={row.color} />
                </div>
                <span className="text-sm text-slate-600 flex-1">{row.label}</span>
                <span className="text-sm font-bold text-slate-900">{row.value}</span>
              </div>
            ))}
          </div>
          <button onClick={() => navigate('/reports')}
            className="w-full flex items-center justify-center gap-2 mt-4 text-sm font-medium py-2.5 bg-blue-50 text-blue-700 rounded-xl hover:bg-blue-100 transition-colors">
            View Queue Analytics <ArrowRight size={15} />
          </button>
        </div>
      </div>

      <p className="text-center text-xs text-slate-400 pt-2">
        © {new Date().getFullYear()} {branding.hospitalName}. All rights reserved.
      </p>

      {/* Register Patient in OP Queue Modal */}
      <AnimatePresence>
        {showAdd && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={closeRegForm}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 16 }}
              className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-hidden z-10 flex flex-col"
            >
              {/* Header */}
              <div className="flex items-start justify-between px-6 py-5 border-b border-slate-100 flex-shrink-0">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Register Patient in OP Queue</h2>
                  <p className="text-sm text-slate-400 mt-0.5">Add patient to queue for outpatient consultation</p>
                </div>
                <button type="button" onClick={closeRegForm} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSubmit((d) => registerMut.mutate(d))} className="flex flex-col overflow-hidden flex-1">
                <div className="overflow-y-auto px-6 py-5 space-y-6">
                  {/* Search Patient */}
                  <div>
                    <label className="text-sm font-bold text-slate-800 block mb-2">Search Patient</label>
                    <div className="flex gap-3">
                      <div className="relative flex-1">
                        <input
                          type="text" placeholder="Search by Name, UHID, Phone, Email..."
                          value={patientSearch} onChange={handlePatientSearchChange}
                          className="w-full pl-4 pr-11 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button type="button" className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center justify-center transition-colors">
                          <Search size={15} className="text-white" />
                        </button>
                        {patients.length > 0 && (
                          <div className="absolute mt-1 w-full border border-slate-200 rounded-xl overflow-hidden shadow-lg bg-white z-20">
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
                      <button type="button" onClick={() => setShowQuickAdd(true)}
                        className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-blue-600 bg-white border border-blue-200 rounded-xl hover:bg-blue-50 transition-colors whitespace-nowrap flex-shrink-0">
                        <UserPlus size={16} /> Add New Patient
                      </button>
                    </div>
                    <input type="hidden" {...register('patient', { required: true })} />
                  </div>

                  {/* Consultation Details */}
                  <div>
                    <div className="flex items-center gap-2 text-blue-600 mb-4 pb-2 border-b-2 border-blue-100">
                      <Stethoscope size={16} />
                      <h3 className="text-sm font-bold">Consultation Details</h3>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="text-xs font-medium text-slate-500 block mb-1.5">Doctor *</label>
                        <div className="relative">
                          <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                          <select {...register('doctor', { required: true })} className="w-full pl-9 pr-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none">
                            <option value="">Select Doctor</option>
                            {doctors.map((d) => <option key={d._id} value={d._id}>Dr. {d.name}</option>)}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-500 block mb-1.5">Department *</label>
                        <input type="hidden" {...register('department', { required: true })} />
                        <div className="relative">
                          <Building2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                          <select value={watch('department') || ''} onChange={(e) => setValue('department', e.target.value)} disabled={!!selectedDoctorId}
                            className="w-full pl-9 pr-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none disabled:bg-slate-50 disabled:cursor-not-allowed">
                            <option value="">Select Department</option>
                            {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-500 block mb-1.5">Visit Type *</label>
                        <div className="relative">
                          <Footprints size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                          <select {...register('appointmentType', { required: true })} className="w-full pl-9 pr-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none">
                            <option value="walkin">Walk-in</option>
                            <option value="appointment">Appointment</option>
                            <option value="followup">Follow-up</option>
                            <option value="emergency">Emergency</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {selectedDoctor && (
                      <div className="mt-4 bg-blue-50 rounded-xl p-4 border border-blue-100 space-y-2 text-sm text-blue-900">
                        <h4 className="font-semibold flex items-center gap-1.5"><Stethoscope size={15} /> Doctor Consultation Details</h4>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <p className="text-slate-500">Consultation Fee</p>
                            <p className="font-semibold text-sm text-slate-900">₹{selectedDoctor.consultationFee || 0}</p>
                          </div>
                          <div>
                            <p className="text-slate-500">Follow-up Fee</p>
                            <p className="font-semibold text-sm text-slate-900">₹{selectedDoctor.followUpFee || 0}</p>
                          </div>
                          {selectedDoctor.qualification && (
                            <div className="col-span-2">
                              <p className="text-slate-500">Qualification & Specialization</p>
                              <p className="font-medium text-slate-900">{selectedDoctor.qualification} {selectedDoctor.specialization && `(${selectedDoctor.specialization})`}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-4 mt-4">
                      <div>
                        <label className="text-xs font-medium text-slate-500 block mb-1.5">Priority *</label>
                        <div className="relative">
                          <Flag size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                          <select {...register('priority', { required: true })} className="w-full pl-9 pr-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none">
                            <option value="normal">Normal</option>
                            <option value="urgent">Urgent</option>
                            <option value="emergency">Emergency</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-500 block mb-1.5">Queue For *</label>
                        <div className="relative">
                          <ClipboardList size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                          <select {...register('queueFor', { required: true })} className="w-full pl-9 pr-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none">
                            <option value="Consultation">Consultation</option>
                            <option value="Procedure">Procedure</option>
                            <option value="Lab">Lab</option>
                            <option value="Pharmacy">Pharmacy</option>
                            <option value="Follow-up">Follow-up</option>
                          </select>
                        </div>
                      </div>
                      <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 flex items-center gap-2.5">
                        <Hourglass size={22} className="text-blue-500 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-[11px] text-blue-500 leading-tight">Expected Wait Time</p>
                          <p className="text-sm font-bold text-blue-700 leading-tight truncate">{expectedWait}</p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mt-4">
                      <div>
                        <label className="text-xs font-medium text-slate-500 block mb-1.5">Chief Complaint / Reason for Visit *</label>
                        <textarea {...register('chiefComplaint', { required: true })} rows={3}
                          placeholder="Enter main complaint or reason for visit..."
                          className="w-full px-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-500 block mb-1.5">Ref By (Optional)</label>
                        <div className="relative">
                          <User size={15} className="absolute left-3 top-3 text-slate-400 pointer-events-none" />
                          <input {...register('referredBy')} placeholder="Select referrer"
                            className="w-full pl-9 pr-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Additional Information */}
                  <div>
                    <div className="flex items-center gap-2 text-blue-600 mb-4 pb-2 border-b-2 border-blue-100">
                      <Link2 size={16} />
                      <h3 className="text-sm font-bold">Additional Information</h3>
                    </div>
                    <div className="grid grid-cols-4 gap-4">
                      <div>
                        <label className="text-xs font-medium text-slate-500 block mb-1.5">Date</label>
                        <div className="relative">
                          <Calendar size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                          <input type="date" {...register('visitDate')} className="w-full pl-9 pr-2 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-500 block mb-1.5">Time</label>
                        <div className="relative">
                          <Clock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                          <input type="time" {...register('visitTime')} className="w-full pl-9 pr-2 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-500 block mb-1.5">Mobile Number</label>
                        <div className="relative">
                          <Phone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                          <input {...register('mobileNumber')} placeholder="Enter mobile number"
                            className="w-full pl-9 pr-2 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-500 block mb-1.5">UHID (Optional)</label>
                        <div className="relative">
                          <CreditCard size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                          <input {...register('uhid')} placeholder="Enter UHID"
                            className="w-full pl-9 pr-2 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Info banner */}
                  <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-700">
                    <Info size={16} className="mt-0.5 flex-shrink-0" />
                    Patient will be added to the queue and the A4 OP consultation paper will print automatically.
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 flex-shrink-0">
                  <button type="button" onClick={resetRegForm}
                    className="flex items-center gap-2 text-sm font-medium px-4 py-2.5 text-slate-500 hover:bg-slate-50 rounded-xl transition-colors">
                    <RotateCcw size={15} /> Reset Form
                  </button>
                  <div className="flex gap-3">
                    <button type="button" onClick={closeRegForm}
                      className="px-5 py-2.5 text-sm font-medium border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors">
                      Cancel
                    </button>
                    <button type="submit" disabled={registerMut.isPending}
                      className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 shadow-sm shadow-blue-600/20">
                      <Send size={15} /> {registerMut.isPending ? 'Adding...' : 'Add to Queue'}
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Quick Add New Patient Modal (nested) */}
      <Modal isOpen={showQuickAdd} onClose={() => setShowQuickAdd(false)} title="Add New Patient" size="md">
        <form onSubmit={handleQuickSubmit((d) => quickAddMut.mutate(d))} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
              <input {...registerQuick('name', { required: true })} className="input-field" placeholder="Patient full name" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
              <input {...registerQuick('phone', { required: true })} className="input-field" placeholder="Mobile number" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Age *</label>
              <input {...registerQuick('age', { required: true, min: 0 })} type="number" className="input-field" placeholder="Age in years" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Gender *</label>
              <select {...registerQuick('gender', { required: true })} className="input-field">
                <option value="">Select gender</option>
                <option>Male</option>
                <option>Female</option>
                <option>Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input {...registerQuick('email')} type="email" className="input-field" placeholder="Email address" />
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-4 border-t border-gray-200">
            <button type="button" onClick={() => setShowQuickAdd(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={quickAddMut.isPending} className="btn-primary">
              {quickAddMut.isPending ? 'Adding...' : 'Add Patient'}
            </button>
          </div>
        </form>
      </Modal>

      {/* A4 OP paper portaled to body so print CSS always finds it */}
      {printData &&
        createPortal(
          <OPPaperTemplate branding={printData.branding || branding} op={printData.op} />,
          document.body,
        )}
    </div>
  );
}
