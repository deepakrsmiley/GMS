import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Clock, CheckCircle2, Stethoscope, AlertCircle, RefreshCw, Pill,
  FlaskConical, Bed, User,
  Users, ClipboardList, Calendar, Timer, XCircle,
  Search, UserPlus, Footprints, Flag, Link2, RotateCcw, Send, Info,
  Hourglass, Phone, CreditCard, X, Printer, Settings2, MoreVertical,
  FileText, Eye,
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

const finiteFee = (value) => {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

const resolveOpConsultationFee = (doctor, department, appointmentType) => {
  const consult = finiteFee(doctor?.consultationFee) ?? finiteFee(department?.consultationFee) ?? 0;
  const follow = finiteFee(doctor?.followUpFee) ?? 0;
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
  if (status === 'sent_to_pharmacy') return { cls: 'opq-status--pharmacy', Icon: Pill, label: 'Pharmacy' };
  if (status === 'sent_to_lab') return { cls: 'opq-status--lab', Icon: FlaskConical, label: 'Lab' };
  if (status === 'admitted') return { cls: 'opq-status--admitted', Icon: Bed, label: 'Admitted' };
  if (['cancelled', 'no_show'].includes(status)) return { cls: 'opq-status--danger', Icon: AlertCircle, label: statusConfig[status]?.label || status };
  if (['completed', 'consultation_completed', 'pharmacy_completed', 'discharged'].includes(status)) {
    return { cls: 'opq-status--done', Icon: CheckCircle2, label: statusConfig[status]?.label || 'Completed' };
  }
  return { cls: 'opq-status--muted', Icon: Clock, label: statusConfig[status]?.label || status };
};

const fmtInr = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '₹0';
  return `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
};

/** Consultation bill payment state for Doctor Queue cards. */
const billPayPill = (bill) => {
  if (!bill || typeof bill !== 'object' || Array.isArray(bill)) {
    return { state: 'none', cls: 'opq-pay--none', label: 'No bill', detail: 'Consultation bill not created' };
  }
  if (bill.status === 'cancelled' || bill.status === 'refunded') {
    return { state: 'cancelled', cls: 'opq-pay--none', label: 'Bill cancelled', detail: bill.billNumber || '' };
  }
  const total = Number(bill.totalAmount) || 0;
  const paid = Number(bill.paidAmount) || 0;
  const dueRaw = Number(bill.dueAmount);
  const due = Number.isFinite(dueRaw) ? dueRaw : Math.max(0, total - paid - (Number(bill.advanceAmount) || 0));

  if (bill.status === 'paid' || due <= 0) {
    return {
      state: 'paid',
      cls: 'opq-pay--paid',
      label: 'Paid',
      detail: total ? `${fmtInr(paid)} / ${fmtInr(total)}` : (bill.billNumber || 'Settled'),
    };
  }
  if (paid > 0 || bill.status === 'partial') {
    return {
      state: 'partial',
      cls: 'opq-pay--partial',
      label: 'Partial',
      detail: `Paid ${fmtInr(paid)} · Due ${fmtInr(due)}`,
    };
  }
  return {
    state: 'unpaid',
    cls: 'opq-pay--unpaid',
    label: 'Unpaid',
    detail: total ? `Due ${fmtInr(due || total)}` : (bill.billNumber || 'Pending payment'),
  };
};

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
  const [detailsItem, setDetailsItem] = useState(null);
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

  const loadFeeMasters = () => {
    api.get('/departments').then((r) => setDepartments(r.data.data || [])).catch(() => {});
    api.get('/staff/doctors').then((r) => setDoctors(r.data.data || [])).catch(() => {});
  };

  useEffect(() => {
    loadFeeMasters();
  }, []);

  const todayStr = () => istCalendarDate();
  const nowStr = () => new Date().toTimeString().slice(0, 5);

  const defaultRegForm = {
    patient: '', doctor: '', department: '', appointmentType: 'walkin',
    priority: 'normal', queueFor: 'Consultation', chiefComplaint: '', referredBy: '',
    visitDate: todayStr(), visitTime: nowStr(), mobileNumber: '', uhid: '',
    paidAmount: '', consultationFee: '', paymentMode: 'cash', paymentPurpose: 'Doctor consultation fee',
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
  const queueFor = watch('queueFor');
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
  const watchedFee = watch('consultationFee');
  const billedConsult = (() => {
    const n = Number(watchedFee);
    return Number.isFinite(n) && n >= 0 ? n : consultFee;
  })();
  const billTotal = billedConsult + surcharge;
  const feeIsEdited = selectedDoctor && Number.isFinite(Number(watchedFee)) && Number(watchedFee) !== consultFee;

  useEffect(() => {
    if (selectedDoctorId) {
      const doc = doctors.find((d) => d._id === selectedDoctorId);
      setSelectedDoctor(doc || null);
      if (doc?.department?._id || doc?.department) {
        setValue('department', doc.department._id || doc.department);
      }
      const dept = departments.find((d) => d._id === (doc?.department?._id || doc?.department))
        || doc?.department
        || null;
      const fee = resolveOpConsultationFee(doc, dept, appointmentType);
      const extra = appointmentType === 'emergency' ? EMERGENCY_SURCHARGE : 0;
      setValue('consultationFee', fee);
      setValue('paidAmount', fee + extra);
    } else {
      setSelectedDoctor(null);
      setValue('department', '');
      setValue('consultationFee', '');
      setValue('paidAmount', '');
    }
    setValue('paymentPurpose', defaultPaymentPurpose(appointmentType));
  }, [selectedDoctorId, doctors, departments, appointmentType, setValue]);

  const applyConsultFee = (raw) => {
    const n = Number(raw);
    const fee = Number.isFinite(n) && n >= 0 ? n : 0;
    setValue('paidAmount', (raw === '' ? 0 : fee) + surcharge);
  };

  const resetConsultFeeToMaster = () => {
    setValue('consultationFee', consultFee);
    setValue('paidAmount', consultFee + surcharge);
  };

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
        consultationFee: d.consultationFee === '' || d.consultationFee == null ? consultFee : Number(d.consultationFee),
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

  const tokenNumeric = (n) => Number(String(n || '').replace(/\D/g, '')) || 0;
  const highestOpNumberFirst = (a, b) => tokenNumeric(b.tokenNumber) - tokenNumeric(a.tokenNumber);

  const waiting = typeFiltered.filter((q) => q.status === 'waiting').sort(highestOpNumberFirst);
  const inConsult = typeFiltered.filter((q) => q.status === 'in_consultation').sort(highestOpNumberFirst);
  const completed = typeFiltered.filter((q) => ['completed', 'consultation_completed', 'sent_to_pharmacy', 'pharmacy_completed', 'sent_to_lab', 'discharged'].includes(q.status)).sort(highestOpNumberFirst);
  const admitted = typeFiltered.filter((q) => q.status === 'admitted').sort(highestOpNumberFirst);

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

  const statCards = [
    { key: 'waiting', label: 'Waiting', sub: 'Patients in queue', count: waiting.length, icon: Clock, tone: 'blue' },
    { key: 'in_consultation', label: 'In Consultation', sub: 'Currently with doctor', count: inConsult.length, icon: User, tone: 'orange' },
    { key: 'completed', label: 'Completed', sub: 'Today completed', count: completed.length, icon: CheckCircle2, tone: 'green' },
    { key: 'admitted', label: 'Admitted', sub: 'Today admitted', count: admitted.length, icon: Users, tone: 'purple' },
  ];

  const isActiveConsult = (item) => ['waiting', 'in_consultation'].includes(item.status);

  const viewItem = (item) => {
    if (item.status === 'admitted') {
      navigate('/ip-admissions');
      return;
    }
    if (isActiveConsult(item)) {
      navigate(`/consultation/${item._id}`);
      return;
    }
    setDetailsItem(item);
  };

  const activeTabMeta = TABS.find((t) => t.key === activeTab);
  const showingTo = queueSearchTerm ? activeItems.length : Math.min(visibleCount, activeItems.length);

  const chipList = (items, empty = '—') => (
    items?.length
      ? items.map((n) => <span key={n} className="opq-chip">{n}</span>)
      : <span className="opq-chip opq-chip--empty">{empty}</span>
  );

  return (
    <div className="opq opq--corp">
      <div className="opq-hero">
        <div className="opq-hero-left">
          <div className="opq-hero-badge"><Stethoscope size={18} /></div>
          <div>
            <h1 className="opq-page-title">Doctor Queue</h1>
            <p className="opq-page-sub">
              {fmtDate(new Date(queueDate))} · {summary.total} patients today · Avg wait {summary.avg}
            </p>
          </div>
        </div>
        <button type="button" className="opq-btn-icon" onClick={() => refetch()} title="Refresh">
          <RefreshCw size={16} />
        </button>
      </div>

      <div className="opq-toolbar opq-toolbar--corp">
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
          <option value="">All Types</option>
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
      </div>

      <div className="opq-stats opq-stats--corp">
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
            </div>
          </button>
        ))}
      </div>

      <div className="opq-board">
        <div className="opq-board-head">
          <div className="opq-tabs">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                className={`opq-tab${activeTab === t.key ? ' is-active' : ''}`}
                onClick={() => setActiveTab(t.key)}
              >
                {t.label}
                <em>{tabData[t.key]?.length || 0}</em>
              </button>
            ))}
          </div>
          <div className="opq-board-meta">
            <span><Users size={13} /> {summary.total} today</span>
            <span><Clock size={13} /> Wait {summary.avg}</span>
            <span><Timer size={13} /> Longest {summary.longest}</span>
          </div>
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
                  : 'When reception registers a patient, they appear here instantly.'}
              </span>
            </div>
          ) : (
            <>
              <div className="opq-cards">
                {visibleItems.map((item, i) => {
                  const pill = statusPill(item.status);
                  const pay = billPayPill(item.bill);
                  const waitMins = item.status === 'waiting' ? (item.waitingMinutes || 0) : 0;
                  const when = item.tokenDate || item.createdAt;
                  const labs = item.labNames || [];
                  const procs = item.procedureNames || [];
                  const rxs = item.rxNames || [];
                  const active = isActiveConsult(item);
                  return (
                    <article key={item._id} className={`opq-visit${active ? ' is-active-visit' : ''}`}>
                      <div className="opq-visit-top">
                        <div className="opq-visit-id">
                          <span className="opq-visit-rank">#{i + 1}</span>
                          <span className="opq-token">{tokenLabel(item.tokenNumber)}</span>
                          <span className={`opq-status ${pill.cls}`}>
                            <pill.Icon size={13} />
                            {pill.label}
                          </span>
                          <span className={`opq-pay ${pay.cls}`} title={pay.detail}>
                            <CreditCard size={13} />
                            {pay.label}
                          </span>
                          {item.status === 'waiting' && (
                            <span className={`opq-wait ${waitClass(waitMins)}`}>
                              Wait {formatWait(waitMins)}
                            </span>
                          )}
                        </div>
                        <div className="opq-visit-actions">
                          <button type="button" className="opq-btn-ghost" onClick={() => setDetailsItem(item)}>
                            <Eye size={14} /> Details
                          </button>
                          <button
                            type="button"
                            className={active ? 'opq-btn-primary' : 'opq-btn-ghost'}
                            onClick={() => viewItem(item)}
                          >
                            {active ? (<><Stethoscope size={14} /> Consult</>) : 'Open'}
                          </button>
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
                                <button type="button" onClick={() => { setOpenMenuId(null); setDetailsItem(item); }}>
                                  <Eye size={14} /> View full details
                                </button>
                                {active && (
                                  <button type="button" onClick={() => { setOpenMenuId(null); navigate(`/consultation/${item._id}`); }}>
                                    <Stethoscope size={14} /> Open consultation
                                  </button>
                                )}
                                <button type="button" onClick={() => { setOpenMenuId(null); printConsultationBill(item); }}>
                                  <Printer size={14} /> Print A5 receipt
                                </button>
                                <button type="button" onClick={() => { setOpenMenuId(null); printOPPaper(item); }}>
                                  <FileText size={14} /> Print OP paper
                                </button>
                                {canLogServices && item.status !== 'cancelled' && item.status !== 'no_show' && (
                                  <button type="button" onClick={() => { setOpenMenuId(null); setServiceOp(item); }}>
                                    <Settings2 size={14} /> Add procedure
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
                      </div>

                      <div className="opq-visit-main">
                        <div className="opq-visit-patient">
                          <div className={`opq-avatar ${avatarColor(item.patient?._id || item._id)}`}>
                            {initials(item.patient?.name)}
                          </div>
                          <div>
                            <div className="opq-patient-name">{item.patient?.name || '—'}</div>
                            <div className="opq-patient-meta">
                              {item.patient?.patientId || '—'}
                              {' · '}
                              {item.patient?.age != null ? `${item.patient.age}Y` : '—'}
                              {item.patient?.gender ? ` / ${item.patient.gender}` : ''}
                            </div>
                            <div className="opq-patient-meta">
                              {formatDoctorName(item.doctor?.name)}
                              {item.department?.name ? ` · ${item.department.name}` : ''}
                            </div>
                          </div>
                        </div>
                        <div className="opq-visit-when">
                          <div className="opq-kv">
                            <span className="opq-k">OP date</span>
                            <span className="opq-v">{when ? fmtDate(new Date(when)) : '—'}</span>
                          </div>
                          <div className="opq-kv">
                            <span className="opq-k">Time</span>
                            <span className="opq-v">{fmtTime(when)}</span>
                          </div>
                          <div className="opq-kv">
                            <span className="opq-k">Type</span>
                            <span className="opq-v" style={{ textTransform: 'capitalize' }}>
                              {item.appointmentType || 'walkin'}
                            </span>
                          </div>
                          <div className="opq-kv">
                            <span className="opq-k">Bill</span>
                            <span className={`opq-v opq-v-pay ${pay.cls}`}>{pay.label}{pay.detail ? ` · ${pay.detail}` : ''}</span>
                          </div>
                        </div>
                      </div>

                      <div className="opq-visit-clinical">
                        <div className="opq-clin-block">
                          <span className="opq-clin-label">Diagnosis</span>
                          <div className="opq-clin-body">{item.diagnosis || <span className="opq-muted">Not entered</span>}</div>
                        </div>
                        <div className="opq-clin-block">
                          <span className="opq-clin-label">Prescription → Pharmacy</span>
                          <div className="opq-chip-row">{chipList(rxs, 'No Rx')}</div>
                        </div>
                        <div className="opq-clin-block">
                          <span className="opq-clin-label">Lab → Lab desk</span>
                          <div className="opq-chip-row">{chipList(labs, 'No lab')}</div>
                        </div>
                        <div className="opq-clin-block">
                          <span className="opq-clin-label">Procedure</span>
                          <div className="opq-chip-row">{chipList(procs, 'No procedure')}</div>
                        </div>
                      </div>

                      {item.chiefComplaint ? (
                        <div className="opq-visit-complaint">
                          <span>Complaint</span> {item.chiefComplaint}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
              <div className="opq-foot">
                <span className="opq-foot-count">
                  Showing 1 to {showingTo} of {activeItems.length}
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

      <div className="opq-page-foot">
        <span>© {new Date().getFullYear()} {branding.systemName || SYSTEM_NAME}. All rights reserved.</span>
        <span>Doctor Queue</span>
      </div>

      <Modal
        isOpen={!!detailsItem}
        onClose={() => setDetailsItem(null)}
        title="Visit full details"
        subtitle={detailsItem ? `${detailsItem.patient?.name || 'Patient'} · ${tokenLabel(detailsItem.tokenNumber)}` : ''}
        size="lg"
      >
        {detailsItem && (
          <div className="opq-details">
            <div className="opq-details-grid">
              <div>
                <div className="opq-details-k">Patient</div>
                <div className="opq-details-v">{detailsItem.patient?.name || '—'}</div>
              </div>
              <div>
                <div className="opq-details-k">Token</div>
                <div className="opq-details-v">{tokenLabel(detailsItem.tokenNumber)}</div>
              </div>
              <div>
                <div className="opq-details-k">OP date &amp; time</div>
                <div className="opq-details-v">
                  {detailsItem.tokenDate || detailsItem.createdAt
                    ? `${fmtDate(new Date(detailsItem.tokenDate || detailsItem.createdAt))} · ${fmtTime(detailsItem.tokenDate || detailsItem.createdAt)}`
                    : '—'}
                </div>
              </div>
              <div>
                <div className="opq-details-k">UHID · Age / Sex</div>
                <div className="opq-details-v">
                  {detailsItem.patient?.patientId || '—'} · {detailsItem.patient?.age ?? '—'} / {detailsItem.patient?.gender || '—'}
                </div>
              </div>
              <div>
                <div className="opq-details-k">Doctor</div>
                <div className="opq-details-v">{formatDoctorName(detailsItem.doctor?.name)}</div>
              </div>
              <div>
                <div className="opq-details-k">Department</div>
                <div className="opq-details-v">{detailsItem.department?.name || '—'}</div>
              </div>
              <div>
                <div className="opq-details-k">Status</div>
                <div className="opq-details-v">{statusConfig[detailsItem.status]?.label || detailsItem.status}</div>
              </div>
              <div>
                <div className="opq-details-k">Consultation bill</div>
                <div className="opq-details-v">
                  {(() => {
                    const pay = billPayPill(detailsItem.bill);
                    return (
                      <span className={`opq-pay ${pay.cls}`} title={pay.detail}>
                        <CreditCard size={13} />
                        {pay.label}
                        {pay.detail ? ` · ${pay.detail}` : ''}
                      </span>
                    );
                  })()}
                </div>
              </div>
              <div>
                <div className="opq-details-k">Complaint</div>
                <div className="opq-details-v">{detailsItem.chiefComplaint || '—'}</div>
              </div>
            </div>

            <div className="opq-details-block">
              <div className="opq-details-k">Diagnosis</div>
              <div className="opq-details-v">{detailsItem.diagnosis || 'Not recorded'}</div>
            </div>
            <div className="opq-details-block">
              <div className="opq-details-k">Clinical notes</div>
              <div className="opq-details-v">{detailsItem.consultationNotes || '—'}</div>
            </div>
            <div className="opq-details-block">
              <div className="opq-details-k">Prescription (Pharmacy)</div>
              {(detailsItem.rxNames || []).length ? (
                <div className="opq-details-tags">
                  {(detailsItem.rxNames || []).map((n) => (
                    <span key={n} className="opq-details-tag opq-details-tag--rx">{n}</span>
                  ))}
                </div>
              ) : (
                <div className="opq-details-v">None</div>
              )}
            </div>
            <div className="opq-details-block">
              <div className="opq-details-k">Lab orders (Lab desk)</div>
              {(detailsItem.labNames || []).length ? (
                <div className="opq-details-tags">
                  {(detailsItem.labNames || []).map((n) => <span key={n} className="opq-details-tag">{n}</span>)}
                </div>
              ) : (
                <div className="opq-details-v">None</div>
              )}
            </div>
            <div className="opq-details-block">
              <div className="opq-details-k">Procedures</div>
              {(detailsItem.procedureNames || []).length ? (
                <div className="opq-details-tags">
                  {(detailsItem.procedureNames || []).map((n) => (
                    <span key={n} className="opq-details-tag opq-details-tag--proc">{n}</span>
                  ))}
                </div>
              ) : (
                <div className="opq-details-v">None</div>
              )}
            </div>

            <div className="opq-details-actions">
              {isActiveConsult(detailsItem) && (
                <button
                  type="button"
                  className="opq-btn-add"
                  onClick={() => { setDetailsItem(null); navigate(`/consultation/${detailsItem._id}`); }}
                >
                  <Stethoscope size={15} /> Open consultation
                </button>
              )}
              <button type="button" className="opq-btn-export" onClick={() => setDetailsItem(null)}>
                Close
              </button>
            </div>
          </div>
        )}
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
