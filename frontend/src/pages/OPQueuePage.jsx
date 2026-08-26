import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Clock, CheckCircle2, Stethoscope, AlertCircle, RefreshCw, Pill,
  FlaskConical, Bed, Building2, User,
  Users, ClipboardList, Calendar, Timer, XCircle,
  Search, UserPlus, Footprints, Flag, Link2, RotateCcw, Send, Info,
  Hourglass, Phone, CreditCard, X, Printer, Settings2, MoreVertical,
  FileText, UserSearch, CalendarDays, BarChart3,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import api from '../services/api';
import Modal from '../components/common/Modal';
import { getSocket } from '../services/socket';
import { useBranding } from '../hooks/useBranding';
import OPPaperTemplate from '../components/op/OPPaperTemplate';
import OPConsultationReceipt from '../components/op/OPConsultationReceipt';
import OPServiceUsageModal from '../components/op/OPServiceUsageModal';
import { hasPermission } from '../constants/permissions';
import { SYSTEM_NAME } from '../constants/branding';
import { istCalendarDate } from '../utils/istDate';
import '../styles/opQueue.css';

const EMERGENCY_SURCHARGE = 300;

const resolveOpConsultationFee = (doctor, department, appointmentType) => {
  const consult = Number(doctor?.consultationFee) || Number(department?.consultationFee) || 0;
  const follow = Number(doctor?.followUpFee) || 0;
  if (appointmentType === 'followup') {
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

const PAGE_SIZE = 5;
const AVATAR_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-violet-100 text-violet-700',
  'bg-rose-100 text-rose-700',
  'bg-amber-100 text-amber-700',
  'bg-emerald-100 text-emerald-700',
  'bg-sky-100 text-sky-700',
];

const initials = (name) => (name || '?').split(' ').filter(Boolean).slice(0, 2).map((n) => n[0]).join('').toUpperCase();
const avatarColor = (id) => {
  const str = String(id || '');
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};
const formatDoctorName = (name) => {
  if (!name) return 'Unassigned';
  const cleaned = String(name).replace(/^(dr\.?\s*)+/i, '').trim();
  return cleaned ? `Dr. ${cleaned}` : 'Unassigned';
};
const tokenLabel = (n) => {
  const raw = String(n || '').replace(/^T-?/i, '');
  if (!raw) return '—';
  return `T-${raw.padStart(4, '0')}`;
};
const formatWait = (mins) => {
  if (mins == null || mins <= 0) return '—';
  if (mins >= 60) return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
  return `${mins} mins`;
};
const waitClass = (mins) => {
  if (mins == null || mins <= 0) return 'opq-wait--muted';
  if (mins >= 20) return 'opq-wait--long';
  if (mins >= 11) return 'opq-wait--mid';
  return 'opq-wait--short';
};
const statusPill = (status) => {
  if (status === 'waiting') return { cls: 'opq-status--waiting', Icon: Clock, label: 'Waiting' };
  if (status === 'in_consultation') return { cls: 'opq-status--consult', Icon: Stethoscope, label: 'In Consultation' };
  if (status === 'admitted') return { cls: 'opq-status--admitted', Icon: Bed, label: 'Admitted' };
  if (['cancelled', 'no_show'].includes(status)) return { cls: 'opq-status--danger', Icon: AlertCircle, label: statusConfig[status]?.label || status };
  if (['completed', 'consultation_completed', 'sent_to_pharmacy', 'pharmacy_completed', 'sent_to_lab', 'discharged'].includes(status)) {
    return { cls: 'opq-status--done', Icon: CheckCircle2, label: statusConfig[status]?.label || 'Completed' };
  }
  return { cls: 'opq-status--muted', Icon: Clock, label: statusConfig[status]?.label || status };
};

function MiniSpark({ color }) {
  return (
    <svg width="72" height="28" viewBox="0 0 72 28" fill="none" aria-hidden>
      <path d="M1 18 C12 16 16 8 24 11 S38 24 46 15 S60 6 71 12" stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export default function OPQueuePage() {
  const navigate = useNavigate();
  const { user } = useSelector((s) => s.auth);
  const { branding } = useBranding();
  const canAdmit = hasPermission(user, 'CREATE_IP_ADMISSION');
  const canLogServices = hasPermission(user, 'CREATE_SERVICE_USAGE');
  const canRegister = hasPermission(user, 'CREATE_OP_QUEUE');
  const [showAdd, setShowAdd] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [patientSearch, setPatientSearch] = useState('');
  const [patients, setPatients] = useState([]);
  const [patientSearchDone, setPatientSearchDone] = useState(false);
  const [queueSearch, setQueueSearch] = useState('');
  const [selectedPatient, setSelectedPatient] = useState(null);
  const patientSearchTimer = useRef(null);
  const skipVisibleReset = useRef(false);
  const [departments, setDepartments] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [deptFilter, setDeptFilter] = useState('');
  const [doctorFilter, setDoctorFilter] = useState(user?.role === 'Doctor' ? user?.id : '');
  const [typeFilter, setTypeFilter] = useState('');
  const [queueDate, setQueueDate] = useState(() => istCalendarDate());
  const [followLiveDay, setFollowLiveDay] = useState(true);
  const [activeTab, setActiveTab] = useState('waiting');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [printData, setPrintData] = useState(null); // { branding, op } for OPPaperTemplate
  const [billPrint, setBillPrint] = useState(null); // { bill, op }
  const [serviceOp, setServiceOp] = useState(null);
  const qc = useQueryClient();

  const { data: queue, isLoading, refetch } = useQuery({
    queryKey: ['opQueue', deptFilter, doctorFilter, queueDate],
    queryFn: () => {
      const params = new URLSearchParams();
      if (deptFilter) params.set('department', deptFilter);
      if (doctorFilter) params.set('doctor', doctorFilter);
      if (queueDate) params.set('date', queueDate);
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
    if (!followLiveDay) return undefined;
    const syncToday = () => {
      const today = istCalendarDate();
      setQueueDate((prev) => (prev === today ? prev : today));
    };
    syncToday();
    const id = setInterval(syncToday, 15000);
    return () => clearInterval(id);
  }, [followLiveDay]);

  useEffect(() => {
    api.get('/departments').then(r => setDepartments(r.data.data || [])).catch(() => {});
    api.get('/staff/doctors').then(r => setDoctors(r.data.data || [])).catch(() => {});
  }, []);

  const todayStr = () => istCalendarDate();
  const nowStr = () => new Date().toTimeString().slice(0, 5);

  const defaultRegForm = {
    patient: '', doctor: '', department: '', appointmentType: 'walkin',
    priority: 'normal', queueFor: 'Consultation', chiefComplaint: '', referredBy: '',
    visitDate: todayStr(), visitTime: nowStr(), mobileNumber: '', uhid: '',
    paidAmount: '', paymentMode: 'cash', paymentPurpose: 'Doctor consultation fee',
  };

  const { register, handleSubmit, reset, watch, setValue } = useForm({ defaultValues: defaultRegForm });

  const closeRegForm = () => {
    setShowAdd(false);
    setPatientSearch('');
    setPatients([]);
    setPatientSearchDone(false);
    setSelectedPatient(null);
    reset(defaultRegForm);
  };

  const resetRegForm = () => {
    setPatientSearch('');
    setPatients([]);
    setPatientSearchDone(false);
    setSelectedPatient(null);
    reset(defaultRegForm);
  };

  const handlePatientSearchChange = (e) => {
    const val = e.target.value;
    setPatientSearch(val);
    setValue('patient', '');
    setSelectedPatient(null);
    setPatientSearchDone(false);
    if (patientSearchTimer.current) clearTimeout(patientSearchTimer.current);
    const term = val.trim();
    if (term.length < 2) {
      setPatients([]);
      return;
    }
    patientSearchTimer.current = setTimeout(async () => {
      try {
        const r = await api.get(`/patients/search?q=${encodeURIComponent(term)}`);
        setPatients(r.data.data || []);
      } catch (err) {
        setPatients([]);
        toast.error(err?.response?.data?.message || 'Patient search failed');
      } finally {
        setPatientSearchDone(true);
      }
    }, 250);
  };

  useEffect(() => () => {
    if (patientSearchTimer.current) clearTimeout(patientSearchTimer.current);
  }, []);

  const pickPatient = (p) => {
    setValue('patient', p._id);
    setPatientSearch(`${p.name} (${p.patientId})`);
    setSelectedPatient(p);
    setValue('mobileNumber', p.phone || '');
    setValue('uhid', p.patientId || '');
    setPatients([]);
    setPatientSearchDone(false);
  };

  const selectedDoctorId = watch('doctor');
  const appointmentType = watch('appointmentType');
  const selectedDeptId = watch('department');
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const selectedDept = useMemo(
    () => departments.find((d) => d._id === selectedDeptId) || selectedDoctor?.department || null,
    [departments, selectedDeptId, selectedDoctor],
  );
  const consultFee = useMemo(
    () => resolveOpConsultationFee(selectedDoctor, selectedDept, appointmentType),
    [selectedDoctor, selectedDept, appointmentType],
  );
  const surcharge = appointmentType === 'emergency' ? EMERGENCY_SURCHARGE : 0;
  const billTotal = consultFee + surcharge;

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

  useEffect(() => {
    setValue('paidAmount', billTotal);
    setValue('paymentPurpose', defaultPaymentPurpose(appointmentType));
  }, [billTotal, appointmentType, setValue]);

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
        paidAmount: d.paidAmount === '' || d.paidAmount == null ? billTotal : Number(d.paidAmount),
        paymentMode: d.paymentMode || 'cash',
        paymentPurpose: d.paymentPurpose || defaultPaymentPurpose(d.appointmentType),
      };
      return api.post('/op', payload);
    },
    onSuccess: async (r) => {
      qc.invalidateQueries(['opQueue']);
      setActiveTab('waiting');
      setQueueSearch('');
      skipVisibleReset.current = true;
      setVisibleCount(Math.max(PAGE_SIZE, 50));
      let op = r?.data?.data;
      let bill = r?.data?.bill || op?.bill;
      if (op && selectedPatient?.address && !op.patient?.address) {
        op.patient = { ...op.patient, address: selectedPatient.address };
      }
      closeRegForm();
      const hasBill = bill && typeof bill === 'object' && (bill.items || bill.billNumber);
      if (!hasBill && op?._id) {
        try {
          const r2 = await api.get(`/op/${op._id}`, { params: { ensureBill: 1 } });
          op = r2?.data?.data || op;
          bill = op?.bill;
        } catch (_) { /* print can still be retried from the queue */ }
      }
      if (bill && typeof bill === 'object' && (bill.items || bill.billNumber)) {
        toast.success('Patient added to doctor queue — print A5 consultation receipt');
        setBillPrint({ bill, op });
      } else {
        toast.success('Patient registered to queue');
        if (op) setPrintData({ branding, op });
      }
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Failed to register patient'),
  });

  const printOPPaper = async (item) => {
    try {
      const r = await api.get(`/op/${item._id}`);
      const op = r?.data?.data || item;
      setPrintData({ branding, op: { ...op, labs: [], pharmacyMedicines: [], serviceUsages: [] } });
    } catch {
      setPrintData({ branding, op: item });
    }
  };

  const printConsultationBill = async (item) => {
    try {
      const r = await api.get(`/op/${item._id}`, { params: { ensureBill: 1 } });
      const op = r?.data?.data || item;
      const bill = r?.data?.bill || op?.bill;
      if (bill && typeof bill === 'object' && (bill.items || bill.billNumber)) {
        setBillPrint({ bill, op });
        return;
      }
      toast.error('No consultation bill for this visit');
    } catch {
      toast.error('Could not load consultation bill');
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
  const queueSearchTerm = queueSearch.trim().toLowerCase();
  const matchesQueueSearch = (item) => {
    if (!queueSearchTerm) return true;
    const p = item.patient || {};
    return [p.name, p.patientId, p.phone, item.tokenNumber, item.doctor?.name]
      .some((v) => String(v || '').toLowerCase().includes(queueSearchTerm));
  };

  const waiting = typeFiltered.filter((q) => q.status === 'waiting');
  const inConsult = typeFiltered.filter((q) => q.status === 'in_consultation');
  const completed = typeFiltered.filter((q) => ['completed', 'consultation_completed', 'sent_to_pharmacy', 'pharmacy_completed', 'sent_to_lab', 'discharged'].includes(q.status));
  const admitted = typeFiltered.filter((q) => q.status === 'admitted');

  const tabData = { waiting, in_consultation: inConsult, completed, admitted };
  const activeItems = (tabData[activeTab] || []).filter(matchesQueueSearch);
  const visibleItems = queueSearchTerm ? activeItems : activeItems.slice(0, visibleCount);

  useEffect(() => {
    if (skipVisibleReset.current) {
      skipVisibleReset.current = false;
      setOpenMenuId(null);
      return;
    }
    setVisibleCount(PAGE_SIZE);
    setOpenMenuId(null);
  }, [activeTab, deptFilter, doctorFilter, typeFilter, queueDate]);

  useEffect(() => {
    const close = () => setOpenMenuId(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  const summary = useMemo(() => {
    const waitTimes = waiting.map((q) => q.waitingMinutes || 0).filter((n) => n > 0);
    const avg = waitTimes.length ? Math.round(waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length) : null;
    const longest = waitTimes.length ? Math.max(...waitTimes) : null;
    const cancelled = typeFiltered.filter((q) => ['cancelled', 'no_show'].includes(q.status)).length;
    return {
      total: typeFiltered.length,
      avg: avg !== null ? formatWait(avg) : '—',
      longest: longest !== null ? formatWait(longest) : '—',
      completedToday: completed.length,
      cancelled,
    };
  }, [typeFiltered, waiting, completed]);

  const doctorSchedule = useMemo(() => {
    const map = new Map();
    typeFiltered.forEach((q) => {
      const id = q.doctor?._id || q.doctor || 'unassigned';
      if (!map.has(id)) {
        map.set(id, {
          id,
          name: formatDoctorName(q.doctor?.name),
          spec: q.doctor?.specialization || q.department?.name || 'OPD',
          count: 0,
        });
      }
      map.get(id).count += 1;
    });
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 6);
  }, [typeFiltered]);

  const exportQueue = () => {
    const rows = [
      ['#', 'Patient', 'UHID', 'Age', 'Gender', 'Token', 'Doctor', 'Department', 'Time', 'Wait (mins)', 'Status'],
      ...typeFiltered.map((item, i) => [
        i + 1,
        item.patient?.name || '',
        item.patient?.patientId || '',
        item.patient?.age ?? '',
        item.patient?.gender || '',
        item.tokenNumber || '',
        formatDoctorName(item.doctor?.name),
        item.department?.name || '',
        item.tokenDate || item.createdAt || '',
        item.waitingMinutes || 0,
        statusConfig[item.status]?.label || item.status,
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `op-queue-${queueDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const statCards = [
    { key: 'waiting', label: 'Waiting', sub: 'Patients in queue', count: waiting.length, icon: Clock, tone: 'blue', spark: '#3b82f6' },
    { key: 'in_consultation', label: 'In Consultation', sub: 'Currently with doctor', count: inConsult.length, icon: User, tone: 'orange', spark: '#f97316' },
    { key: 'completed', label: 'Completed', sub: 'Today completed', count: completed.length, icon: CheckCircle2, tone: 'green', spark: '#10b981' },
    { key: 'admitted', label: 'Admitted', sub: 'Today admitted', count: admitted.length, icon: Users, tone: 'purple', spark: '#8b5cf6' },
  ];

  const viewItem = (item) => {
    if (item.status === 'admitted') navigate('/ip-admissions');
    else navigate(`/consultation/${item._id}`);
  };

  const activeTabMeta = TABS.find((t) => t.key === activeTab);
  const showingTo = queueSearchTerm ? activeItems.length : Math.min(visibleCount, activeItems.length);

  return (
    <div className="opq">
      <div className="opq-toolbar">
        <div className="opq-search-wrap">
          <Search size={15} />
          <input
            type="search"
            className="opq-search"
            placeholder="Search name, UHID, phone, token…"
            value={queueSearch}
            onChange={(e) => setQueueSearch(e.target.value)}
          />
        </div>
        <select className="opq-select" value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
          <option value="">All Departments</option>
          {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
        </select>
        {user?.role !== 'Doctor' && (
          <select className="opq-select" value={doctorFilter} onChange={(e) => setDoctorFilter(e.target.value)}>
            <option value="">All Doctors</option>
            {doctors.map((d) => <option key={d._id} value={d._id}>{formatDoctorName(d.name)}</option>)}
          </select>
        )}
        <select className="opq-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">All Consultation Types</option>
          <option value="walkin">Walk-in</option>
          <option value="appointment">Appointment</option>
          <option value="followup">Follow-up</option>
          <option value="emergency">Emergency</option>
        </select>
        <input
          type="date"
          className="opq-date"
          value={queueDate}
          onChange={(e) => {
            const next = e.target.value;
            setQueueDate(next);
            setFollowLiveDay(next === istCalendarDate());
          }}
        />
        <div className="opq-toolbar-actions">
          <button type="button" className="opq-btn-export" onClick={exportQueue}>
            <FileText size={15} /> Export Report
          </button>
          <button type="button" className="opq-btn-icon" onClick={() => refetch()} title="Refresh">
            <RefreshCw size={16} />
          </button>
          {canRegister && (
            <button
              type="button"
              className="opq-btn-add"
              onClick={() => { resetRegForm(); setShowAdd(true); }}
            >
              <Plus size={16} /> Add Patient
            </button>
          )}
        </div>
      </div>

      <div className="opq-stats">
        {statCards.map((s) => (
          <button
            key={s.key}
            type="button"
            className={`opq-stat${activeTab === s.key ? ' is-active' : ''}`}
            onClick={() => setActiveTab(s.key)}
          >
            <div className={`opq-stat-icon opq-stat-icon--${s.tone}`}>
              <s.icon size={18} />
            </div>
            <div className="opq-stat-copy">
              <div className="opq-stat-count">{s.count}</div>
              <div className="opq-stat-label">{s.label}</div>
              <div className="opq-stat-sub">{s.sub}</div>
            </div>
            <MiniSpark color={s.spark} />
          </button>
        ))}
      </div>

      <div className="opq-layout">
        <div className="opq-panel">
          <div className="opq-tabs">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                className={`opq-tab${activeTab === t.key ? ' is-active' : ''}`}
                onClick={() => setActiveTab(t.key)}
              >
                {t.label} ({tabData[t.key]?.length || 0})
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="opq-empty">Loading queue...</div>
          ) : activeItems.length === 0 ? (
            <div className="opq-empty">
              <div className="opq-empty-icon"><ClipboardList size={26} /></div>
              <p>
                {queueSearchTerm
                  ? `No patients matching “${queueSearch.trim()}”`
                  : `No patients in ${activeTabMeta?.label.toLowerCase()} queue`}
              </p>
              <span>
                {queueSearchTerm
                  ? 'Try another name, UHID, phone, or token number.'
                  : 'All caught up. Great job.'}
              </span>
            </div>
          ) : (
            <>
              <div className="opq-table-wrap">
                <table className="opq-table">
                  <thead>
                    <tr>
                      {['#', 'Patient Details', 'Token No.', 'Doctor', 'Time', 'Wait Time', 'Status', 'Actions'].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleItems.map((item, i) => {
                      const pill = statusPill(item.status);
                      const waitMins = item.status === 'waiting' ? (item.waitingMinutes || 0) : 0;
                      const when = item.tokenDate || item.createdAt;
                      return (
                        <tr key={item._id}>
                          <td className="opq-idx">{i + 1}</td>
                          <td>
                            <div className="opq-patient">
                              <div className={`opq-avatar ${avatarColor(item.patient?._id || item._id)}`}>
                                {initials(item.patient?.name)}
                              </div>
                              <div>
                                <div className="opq-patient-name">{item.patient?.name || '—'}</div>
                                <div className="opq-patient-meta">
                                  {item.patient?.age != null ? `${item.patient.age} Y` : '—'}
                                  {item.patient?.gender ? ` / ${item.patient.gender}` : ''}
                                  {'  '}
                                  {item.patient?.patientId || ''}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td><span className="opq-token">{tokenLabel(item.tokenNumber)}</span></td>
                          <td>
                            <div className="opq-doc-name">{formatDoctorName(item.doctor?.name)}</div>
                            <div className="opq-doc-spec">{item.doctor?.specialization || item.department?.name || '—'}</div>
                          </td>
                          <td>
                            <div className="opq-time">{fmtTime(when)}</div>
                            <div className="opq-date-sub">{when ? fmtDate(new Date(when)) : '—'}</div>
                          </td>
                          <td>
                            <span className={`opq-wait ${waitClass(waitMins)}`}>
                              {item.status === 'waiting' ? formatWait(waitMins) : '—'}
                            </span>
                          </td>
                          <td>
                            <span className={`opq-status ${pill.cls}`}>
                              <pill.Icon size={13} />
                              {pill.label}
                            </span>
                          </td>
                          <td>
                            <div className="opq-actions">
                              <button type="button" className="opq-view" onClick={() => viewItem(item)}>View</button>
                              <div className="relative">
                                <button
                                  type="button"
                                  className="opq-kebab"
                                  title="More actions"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenMenuId((id) => (id === item._id ? null : item._id));
                                  }}
                                >
                                  <MoreVertical size={16} />
                                </button>
                                {openMenuId === item._id && (
                                  <div className="opq-menu" onClick={(e) => e.stopPropagation()}>
                                    <button type="button" onClick={() => { setOpenMenuId(null); printConsultationBill(item); }}>
                                      <Printer size={14} /> Print A5 receipt
                                    </button>
                                    <button type="button" onClick={() => { setOpenMenuId(null); printOPPaper(item); }}>
                                      <FileText size={14} /> Print OP paper
                                    </button>
                                    {item.status === 'waiting' && (
                                      <button type="button" onClick={() => { setOpenMenuId(null); navigate(`/consultation/${item._id}`); }}>
                                        <Stethoscope size={14} /> Open consultation
                                      </button>
                                    )}
                                    {item.status === 'in_consultation' && (
                                      <button type="button" onClick={() => { setOpenMenuId(null); navigate(`/consultation/${item._id}`); }}>
                                        <Stethoscope size={14} /> Continue
                                      </button>
                                    )}
                                    {canLogServices && item.status !== 'cancelled' && item.status !== 'no_show' && (
                                      <button type="button" onClick={() => { setOpenMenuId(null); setServiceOp(item); }}>
                                        <Settings2 size={14} /> Services
                                      </button>
                                    )}
                                    {item.patient?._id && item.status !== 'cancelled' && item.status !== 'no_show' && (
                                      <button type="button" onClick={() => { setOpenMenuId(null); navigate(`/lab?patient=${item.patient._id}&op=${item._id}`); }}>
                                        <FlaskConical size={14} /> Lab
                                      </button>
                                    )}
                                    {canAdmit && item.status !== 'admitted' && item.patient?._id && (
                                      <button type="button" onClick={() => { setOpenMenuId(null); navigate(`/ip-admissions?patient=${item.patient._id}&op=${item._id}`); }}>
                                        <Bed size={14} /> Admit to IP
                                      </button>
                                    )}
                                    {item.status === 'waiting' && (
                                      <button
                                        type="button"
                                        className="is-danger"
                                        onClick={() => { setOpenMenuId(null); statusMut.mutate({ id: item._id, status: 'no_show' }); }}
                                      >
                                        <XCircle size={14} /> No show
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="opq-foot">
                <span className="opq-foot-count">
                  Showing 1 to {showingTo} of {activeItems.length} entries
                </span>
                {showingTo < activeItems.length && (
                  <button type="button" className="opq-load" onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}>
                    Load More
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        <div className="opq-side">
          <div className="opq-card">
            <div className="opq-card-head">
              <h3 className="opq-card-title">Queue Summary</h3>
              <span className="opq-card-date"><Calendar size={13} /> {fmtDate(new Date(queueDate))}</span>
            </div>
            {[
              { icon: Users, label: 'Total Patients Today', value: summary.total, bg: 'bg-blue-50', color: 'text-blue-600' },
              { icon: Clock, label: 'Average Wait Time', value: summary.avg, bg: 'bg-amber-50', color: 'text-amber-600' },
              { icon: Timer, label: 'Longest Wait Time', value: summary.longest, bg: 'bg-purple-50', color: 'text-purple-600' },
              { icon: CheckCircle2, label: 'Completed Today', value: summary.completedToday, bg: 'bg-emerald-50', color: 'text-emerald-600' },
              { icon: XCircle, label: 'Cancelled', value: summary.cancelled, bg: 'bg-red-50', color: 'text-red-600' },
            ].map((row) => (
              <div key={row.label} className="opq-sum-row">
                <div className={`opq-sum-ico ${row.bg} ${row.color}`}><row.icon size={15} /></div>
                <span className="opq-sum-label">{row.label}</span>
                <span className="opq-sum-val">{row.value}</span>
              </div>
            ))}
          </div>

          <div className="opq-card">
            <div className="opq-card-head">
              <h3 className="opq-card-title">Quick Actions</h3>
            </div>
            <div className="opq-quick">
              <button type="button" onClick={() => { if (canRegister) { resetRegForm(); setShowAdd(true); } else navigate('/patients'); }}>
                <span className="opq-quick-ico bg-blue-50 text-blue-600"><UserPlus size={16} /></span>
                New Registration
              </button>
              <button type="button" onClick={() => navigate('/patients')}>
                <span className="opq-quick-ico bg-emerald-50 text-emerald-600"><UserSearch size={16} /></span>
                Find Patient
              </button>
              <button type="button" onClick={() => navigate('/appointments')}>
                <span className="opq-quick-ico bg-violet-50 text-violet-600"><CalendarDays size={16} /></span>
                Today&apos;s Appointments
              </button>
              <button type="button" onClick={() => navigate('/reports')}>
                <span className="opq-quick-ico bg-orange-50 text-orange-600"><BarChart3 size={16} /></span>
                Queue Analytics
              </button>
            </div>
          </div>

          <div className="opq-card">
            <div className="opq-card-head">
              <h3 className="opq-card-title">Today&apos;s Schedule</h3>
            </div>
            {doctorSchedule.length === 0 ? (
              <p className="text-xs text-slate-400 py-2">No doctors on this date&apos;s queue.</p>
            ) : doctorSchedule.map((d) => (
              <div key={d.id} className="opq-sched">
                <div className={`opq-avatar ${avatarColor(d.id)}`}>{initials(d.name)}</div>
                <div>
                  <div className="opq-sched-name">{d.name}</div>
                  <div className="opq-sched-spec">{d.spec}</div>
                </div>
                <span className="opq-sched-count">{d.count}</span>
              </div>
            ))}
            <button type="button" className="opq-sched-more" onClick={() => navigate('/appointments')}>
              View Full Schedule
            </button>
          </div>
        </div>
      </div>

      <div className="opq-page-foot">
        <span>© {new Date().getFullYear()} {branding.systemName || SYSTEM_NAME}. All rights reserved.</span>
        <span>Version 2.0.0</span>
      </div>

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
                  <p className="text-sm text-slate-400 mt-0.5">Collect doctor consultation fee, add to queue, print A5 receipt</p>
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
                        <button
                          type="button"
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center justify-center transition-colors"
                          onClick={() => {
                            const term = patientSearch.trim();
                            if (term.length < 2) return;
                            if (patientSearchTimer.current) clearTimeout(patientSearchTimer.current);
                            api.get(`/patients/search?q=${encodeURIComponent(term)}`)
                              .then((r) => setPatients(r.data.data || []))
                              .catch((err) => {
                                setPatients([]);
                                toast.error(err?.response?.data?.message || 'Patient search failed');
                              })
                              .finally(() => setPatientSearchDone(true));
                          }}
                        >
                          <Search size={15} className="text-white" />
                        </button>
                        {patients.length > 0 && (
                          <div className="absolute mt-1 w-full border border-slate-200 rounded-xl overflow-hidden shadow-lg bg-white z-30">
                            {patients.map((p) => (
                              <button key={p._id} type="button" onClick={() => pickPatient(p)}
                                className="w-full text-left px-4 py-2.5 hover:bg-blue-50 text-sm transition-colors border-b border-slate-100 last:border-0">
                                <span className="font-medium text-slate-900">{p.name}</span>
                                <span className="text-slate-400 ml-2">{p.patientId} • {p.phone}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        {patientSearchDone && patientSearch.trim().length >= 2 && !selectedPatient && patients.length === 0 && (
                          <div className="absolute mt-1 w-full border border-slate-200 rounded-xl shadow-lg bg-white z-30 px-4 py-3 text-sm text-slate-500">
                            No matching patient. Check the name, UHID, or phone, or use Add New Patient.
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
                            <p className="text-slate-500">Consultation Fee (master)</p>
                            <p className="font-semibold text-sm text-slate-900">₹{selectedDoctor.consultationFee || selectedDept?.consultationFee || 0}</p>
                          </div>
                          <div>
                            <p className="text-slate-500">Follow-up Fee (master)</p>
                            <p className="font-semibold text-sm text-slate-900">
                              ₹{selectedDoctor.followUpFee > 0 ? selectedDoctor.followUpFee : Math.round((selectedDoctor.consultationFee || selectedDept?.consultationFee || 0) * 0.5)}
                            </p>
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

                    <div className="mt-4 bg-emerald-50 rounded-xl p-4 border border-emerald-100">
                      <div className="flex items-center gap-2 text-emerald-700 mb-3">
                        <CreditCard size={15} />
                        <h4 className="text-sm font-semibold">Consultation payment</h4>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-medium text-slate-500 block mb-1.5">Fee from master (auto)</label>
                          <div className="px-3 py-2.5 text-sm bg-white border border-emerald-200 rounded-xl font-semibold text-slate-900">
                            ₹{consultFee.toLocaleString('en-IN')}
                            {surcharge > 0 && (
                              <span className="ml-2 text-xs font-medium text-amber-700">+ ₹{surcharge} emergency</span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 mt-1">
                            Total billed: ₹{billTotal.toLocaleString('en-IN')} · from doctor / department master
                          </p>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-slate-500 block mb-1.5">Amount paid</label>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            {...register('paidAmount')}
                            className="w-full px-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-slate-500 block mb-1.5">Payment mode</label>
                          <select {...register('paymentMode')} className="w-full px-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500">
                            <option value="cash">Cash</option>
                            <option value="upi">UPI</option>
                            <option value="card">Card</option>
                            <option value="online">Online</option>
                            <option value="cheque">Cheque</option>
                            <option value="insurance">Insurance</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-slate-500 block mb-1.5">Purpose of payment</label>
                          <input
                            {...register('paymentPurpose')}
                            placeholder="Doctor consultation fee"
                            className="w-full px-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                      </div>
                    </div>

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
                        <label className="text-xs font-medium text-slate-500 block mb-1.5">Chief Complaint / Diagnosis (Optional)</label>
                        <textarea {...register('chiefComplaint')} rows={3}
                          placeholder="Enter main complaint, diagnosis, or reason for visit..."
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
                        <p className="text-[11px] text-slate-400 mt-1">Past dates allowed (e.g. yesterday).</p>
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
                    Patient is added to the doctor queue. Consultation fee comes from the doctor master. After payment, an A5 receipt prints with consultation only (no medicines or scans).
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
                      <Send size={15} /> {registerMut.isPending ? 'Adding...' : 'Add to Queue & Print A5'}
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

      <OPServiceUsageModal
        registration={serviceOp}
        isOpen={!!serviceOp}
        onClose={() => setServiceOp(null)}
      />

      {/* A4 OP paper portaled to body so print CSS always finds it */}
      {printData &&
        createPortal(
          <OPPaperTemplate branding={printData.branding || branding} op={printData.op} />,
          document.body,
        )}
      {billPrint &&
        createPortal(
          <OPConsultationReceipt
            bill={billPrint.bill}
            op={billPrint.op}
            onClose={() => setBillPrint(null)}
          />,
          document.body,
        )}
    </div>
  );
}
