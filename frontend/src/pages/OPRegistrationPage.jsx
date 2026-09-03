import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import {
  Activity, Building2, Calendar, ClipboardList, Clock, CreditCard, Flag, Footprints,
  Hourglass, Info, Link2, Pencil, Phone, RotateCcw, Search, Send, Stethoscope,
  User, UserPlus, Users,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import Modal from '../components/common/Modal';
import { useBranding } from '../hooks/useBranding';
import OPPaperTemplate from '../components/op/OPPaperTemplate';
import OPConsultationReceipt from '../components/op/OPConsultationReceipt';
import { istCalendarDate } from '../utils/istDate';
import '../styles/opRegistration.css';

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

const todayStr = () => istCalendarDate();
const nowStr = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const fmtTime = (d) => (d ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—');

export default function OPRegistrationPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { branding } = useBranding();
  const patientSearchTimer = useRef(null);

  const [patientSearch, setPatientSearch] = useState('');
  const [patients, setPatients] = useState([]);
  const [patientSearchDone, setPatientSearchDone] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [printData, setPrintData] = useState(null);
  const [billPrint, setBillPrint] = useState(null);
  const [selectedDoctor, setSelectedDoctor] = useState(null);

  const defaultRegForm = {
    patient: '', doctor: '', department: '', appointmentType: 'walkin',
    priority: 'normal', queueFor: 'Consultation', chiefComplaint: '', referredBy: '',
    visitDate: todayStr(), visitTime: nowStr(), mobileNumber: '', uhid: '',
    paidAmount: '', consultationFee: '', paymentMode: 'cash', paymentPurpose: 'Doctor consultation fee',
  };

  const { register, handleSubmit, reset, watch, setValue } = useForm({ defaultValues: defaultRegForm });
  const { register: registerQuick, handleSubmit: handleQuickSubmit, reset: resetQuick } = useForm();

  const selectedDoctorId = watch('doctor');
  const appointmentType = watch('appointmentType');
  const selectedDeptId = watch('department');
  const queueFor = watch('queueFor');

  useEffect(() => {
    api.get('/departments').then((r) => setDepartments(r.data.data || [])).catch(() => {});
    api.get('/staff/doctors').then((r) => setDoctors(r.data.data || [])).catch(() => {});
  }, []);

  const { data: queueData } = useQuery({
    queryKey: ['opQueue', 'today-reg'],
    queryFn: () => api.get(`/op/queue?date=${todayStr()}`).then((r) => r.data),
    refetchInterval: 20000,
  });

  const todayRegs = useMemo(() => {
    const list = queueData?.data || [];
    return [...list].sort((a, b) => new Date(b.createdAt || b.tokenDate) - new Date(a.createdAt || a.tokenDate)).slice(0, 12);
  }, [queueData]);

  const waitingCount = queueData?.stats?.waiting ?? todayRegs.filter((q) => q.status === 'waiting').length;

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

  const departmentQueueCount = useMemo(() => {
    if (!selectedDeptId) return null;
    return (queueData?.data || []).filter(
      (q) => (q.department?._id || q.department) === selectedDeptId && q.status === 'waiting',
    ).length;
  }, [queueData, selectedDeptId]);

  const expectedWait = useMemo(() => {
    const n = departmentQueueCount ?? 0;
    const low = 5 + n * 5;
    return `${low} - ${low + 10} mins`;
  }, [departmentQueueCount]);

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

  const resetRegForm = () => {
    setPatientSearch('');
    setPatients([]);
    setPatientSearchDone(false);
    setSelectedPatient(null);
    reset({ ...defaultRegForm, visitDate: todayStr(), visitTime: nowStr() });
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
      return api.post('/op', {
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
      });
    },
    onSuccess: async (r) => {
      qc.invalidateQueries(['opQueue']);
      let op = r?.data?.data;
      let bill = r?.data?.bill || op?.bill;
      if (op && selectedPatient?.address && !op.patient?.address) {
        op.patient = { ...op.patient, address: selectedPatient.address };
      }
      resetRegForm();
      const hasBill = bill && typeof bill === 'object' && (bill.items || bill.billNumber);
      if (!hasBill && op?._id) {
        try {
          const r2 = await api.get(`/op/${op._id}`, { params: { ensureBill: 1 } });
          op = r2?.data?.data || op;
          bill = op?.bill;
        } catch (_) { /* ignore */ }
      }
      if (bill && typeof bill === 'object' && (bill.items || bill.billNumber)) {
        toast.success('Registered — printing A5 consultation receipt');
        setBillPrint({ bill, op });
      } else {
        toast.success('Patient registered to doctor queue');
        if (op) setPrintData({ branding, op });
      }
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Failed to register patient'),
  });

  const quickAddMut = useMutation({
    mutationFn: (d) => api.post('/patients', d),
    onSuccess: (r) => {
      toast.success('Patient created');
      qc.invalidateQueries(['patients']);
      pickPatient(r.data.data);
      setShowQuickAdd(false);
      resetQuick();
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Failed to add patient'),
  });

  useEffect(() => {
    if (!printData) return undefined;
    let cancelled = false;
    const handleAfterPrint = () => setPrintData(null);
    window.addEventListener('afterprint', handleAfterPrint);
    const runPrint = async () => {
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

  useEffect(() => {
    if (!billPrint) return undefined;
    let cancelled = false;
    const handleAfterPrint = () => setBillPrint(null);
    window.addEventListener('afterprint', handleAfterPrint);
    const timer = setTimeout(() => {
      if (!cancelled) window.print();
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, [billPrint]);

  return (
    <div className="opr">
      <div className="opr-head">
        <div>
          <h1 className="opr-title">
            <Activity size={22} />
            OP Registration
          </h1>
          <p className="opr-sub">
            Register outpatient visits, collect consultation fee, and send patients to the doctor queue
          </p>
        </div>
        <Link to="/op-queue" className="opr-link-queue">
          <Stethoscope size={15} /> Open Doctor Queue
        </Link>
      </div>

      <div className="opr-kpis">
        <div className="opr-kpi">
          <div className="opr-kpi-ico"><Users size={18} /></div>
          <div>
            <div className="opr-kpi-n">{queueData?.stats?.total ?? todayRegs.length}</div>
            <div className="opr-kpi-l">Registered today</div>
          </div>
        </div>
        <div className="opr-kpi">
          <div className="opr-kpi-ico opr-kpi-ico--wait"><Clock size={18} /></div>
          <div>
            <div className="opr-kpi-n">{waitingCount}</div>
            <div className="opr-kpi-l">Waiting in queue</div>
          </div>
        </div>
        <div className="opr-kpi">
          <div className="opr-kpi-ico opr-kpi-ico--done"><Stethoscope size={18} /></div>
          <div>
            <div className="opr-kpi-n">{queueData?.stats?.completed ?? 0}</div>
            <div className="opr-kpi-l">Completed today</div>
          </div>
        </div>
      </div>

      <div className="opr-layout">
        <form className="opr-card opr-form" onSubmit={handleSubmit((d) => registerMut.mutate(d))}>
          <div className="opr-card-head">
            <h2>Register patient for OP</h2>
            <span>Consultation fee · Token · Doctor queue</span>
          </div>

          <div className="opr-card-body">
            <div className="opr-section">
              <label className="opr-label">Search patient</label>
              <div className="opr-search-row">
                <div className="opr-search">
                  <input
                    type="text"
                    placeholder="Name, UHID, phone…"
                    value={patientSearch}
                    onChange={handlePatientSearchChange}
                  />
                  <button
                    type="button"
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
                    <Search size={15} />
                  </button>
                  {patients.length > 0 && (
                    <div className="opr-suggest">
                      {patients.map((p) => (
                        <button key={p._id} type="button" onClick={() => pickPatient(p)}>
                          <strong>{p.name}</strong>
                          <span>{p.patientId} · {p.phone}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {patientSearchDone && patientSearch.trim().length >= 2 && !selectedPatient && patients.length === 0 && (
                    <div className="opr-suggest opr-suggest--empty">No match — use Add New Patient</div>
                  )}
                </div>
                <button type="button" className="opr-btn-ghost" onClick={() => setShowQuickAdd(true)}>
                  <UserPlus size={15} /> New patient
                </button>
              </div>
              <input type="hidden" {...register('patient', { required: true })} />
              {selectedPatient && (
                <div className="opr-patient-chip">
                  Selected: <strong>{selectedPatient.name}</strong> · {selectedPatient.patientId} · {selectedPatient.age}Y / {selectedPatient.gender}
                </div>
              )}
            </div>

            <div className="opr-section">
              <div className="opr-section-title"><Stethoscope size={15} /> Consultation</div>
              <div className="opr-grid-3">
                <div>
                  <label className="opr-label">Doctor *</label>
                  <div className="opr-field-icon">
                    <User size={14} />
                    <select {...register('doctor', { required: true })}>
                      <option value="">Select doctor</option>
                      {doctors.map((d) => (
                        <option key={d._id} value={d._id}>{formatDoctorName(d.name)}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="opr-label">Department *</label>
                  <input type="hidden" {...register('department', { required: true })} />
                  <div className="opr-field-icon">
                    <Building2 size={14} />
                    <select
                      value={watch('department') || ''}
                      onChange={(e) => setValue('department', e.target.value)}
                      disabled={!!selectedDoctorId}
                    >
                      <option value="">Select department</option>
                      {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="opr-label">Visit type *</label>
                  <div className="opr-field-icon">
                    <Footprints size={14} />
                    <select {...register('appointmentType', { required: true })}>
                      <option value="walkin">Walk-in</option>
                      <option value="appointment">Appointment</option>
                      <option value="followup">Follow-up</option>
                      <option value="emergency">Emergency</option>
                    </select>
                  </div>
                </div>
              </div>

              {selectedDoctor && (
                <div className="opr-doctor-box">
                  <strong>{formatDoctorName(selectedDoctor.name)}</strong>
                  <span>
                    Consult ₹{finiteFee(selectedDoctor.consultationFee) ?? finiteFee(selectedDept?.consultationFee) ?? 0}
                    {' · '}
                    Follow-up ₹{finiteFee(selectedDoctor.followUpFee) ?? Math.round((finiteFee(selectedDoctor.consultationFee) ?? finiteFee(selectedDept?.consultationFee) ?? 0) * 0.5)}
                  </span>
                </div>
              )}

              <div className="opr-pay-box">
                <div className="opr-section-title" style={{ border: 0, margin: 0, padding: 0, color: '#047857' }}>
                  <CreditCard size={15} /> Consultation amount
                </div>
                <div className="opr-grid-2" style={{ marginTop: 12 }}>
                  <div>
                    <label className="opr-label"><Pencil size={11} /> Amount (editable)</label>
                    <div className="opr-rupee">
                      <span>₹</span>
                      <input
                        type="number"
                        min="0"
                        {...register('consultationFee', { onChange: (e) => applyConsultFee(e.target.value) })}
                      />
                      {feeIsEdited && (
                        <button type="button" onClick={resetConsultFeeToMaster}>Reset</button>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="opr-label">Amount paid</label>
                    <div className="opr-rupee">
                      <span>₹</span>
                      <input type="number" min="0" {...register('paidAmount')} />
                    </div>
                    <p className="opr-hint">Total billed: ₹{billTotal.toLocaleString('en-IN')}</p>
                  </div>
                  <div>
                    <label className="opr-label">Payment mode</label>
                    <select {...register('paymentMode')} className="opr-select">
                      <option value="cash">Cash</option>
                      <option value="upi">UPI</option>
                      <option value="card">Card</option>
                      <option value="online">Online</option>
                      <option value="cheque">Cheque</option>
                      <option value="insurance">Insurance</option>
                    </select>
                  </div>
                  <div>
                    <label className="opr-label">Purpose</label>
                    <input className="opr-input" {...register('paymentPurpose')} placeholder="Doctor consultation fee" />
                  </div>
                </div>
              </div>

              <div className="opr-grid-3" style={{ marginTop: 14 }}>
                <div>
                  <label className="opr-label">Priority *</label>
                  <div className="opr-field-icon">
                    <Flag size={14} />
                    <select {...register('priority', { required: true })}>
                      <option value="normal">Normal</option>
                      <option value="urgent">Urgent</option>
                      <option value="emergency">Emergency</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="opr-label">Queue for *</label>
                  <div className="opr-field-icon">
                    <ClipboardList size={14} />
                    <select {...register('queueFor', { required: true })}>
                      <option value="Consultation">Consultation</option>
                      <option value="Procedure">Procedure</option>
                      <option value="Lab">Lab (after doctor)</option>
                      <option value="Pharmacy">Pharmacy</option>
                      <option value="Follow-up">Follow-up</option>
                    </select>
                  </div>
                  {queueFor === 'Lab' && (
                    <p className="opr-hint" style={{ color: '#b45309' }}>
                      Still creates a consultation bill. Lab-only: Patients → Lab Orders.
                    </p>
                  )}
                </div>
                <div className="opr-wait-pill">
                  <Hourglass size={18} />
                  <div>
                    <div className="opr-wait-k">Expected wait</div>
                    <div className="opr-wait-v">{expectedWait}</div>
                  </div>
                </div>
              </div>

              <div className="opr-grid-2" style={{ marginTop: 14 }}>
                <div>
                  <label className="opr-label">Chief complaint (optional)</label>
                  <textarea className="opr-textarea" rows={3} {...register('chiefComplaint')} placeholder="Reason for visit…" />
                </div>
                <div>
                  <label className="opr-label">Referred by (optional)</label>
                  <div className="opr-field-icon">
                    <User size={14} />
                    <input {...register('referredBy')} placeholder="Referrer name" />
                  </div>
                </div>
              </div>
            </div>

            <div className="opr-section">
              <div className="opr-section-title"><Link2 size={15} /> Visit details</div>
              <div className="opr-grid-4">
                <div>
                  <label className="opr-label">Date</label>
                  <div className="opr-field-icon">
                    <Calendar size={14} />
                    <input type="date" {...register('visitDate')} />
                  </div>
                </div>
                <div>
                  <label className="opr-label">Time</label>
                  <div className="opr-field-icon">
                    <Clock size={14} />
                    <input type="time" {...register('visitTime')} />
                  </div>
                </div>
                <div>
                  <label className="opr-label">Mobile</label>
                  <div className="opr-field-icon">
                    <Phone size={14} />
                    <input {...register('mobileNumber')} placeholder="Mobile number" />
                  </div>
                </div>
                <div>
                  <label className="opr-label">UHID</label>
                  <div className="opr-field-icon">
                    <CreditCard size={14} />
                    <input {...register('uhid')} placeholder="UHID" />
                  </div>
                </div>
              </div>
            </div>

            <div className="opr-info">
              <Info size={15} />
              Patient is added to Doctor Queue after save. A5 receipt prints consultation fee only.
            </div>
          </div>

          <div className="opr-foot">
            <button type="button" className="opr-btn-ghost" onClick={resetRegForm}>
              <RotateCcw size={15} /> Reset
            </button>
            <div className="opr-foot-right">
              <button type="button" className="opr-btn-ghost" onClick={() => navigate('/op-queue')}>
                Go to Doctor Queue
              </button>
              <button type="submit" className="opr-btn-primary" disabled={registerMut.isPending}>
                <Send size={15} />
                {registerMut.isPending ? 'Registering…' : 'Add to queue & print A5'}
              </button>
            </div>
          </div>
        </form>

        <aside className="opr-side">
          <div className="opr-card">
            <div className="opr-card-head">
              <h2>Today&apos;s registrations</h2>
              <span>Latest first</span>
            </div>
            <div className="opr-side-list">
              {todayRegs.length === 0 ? (
                <p className="opr-empty">No OP registrations yet today.</p>
              ) : todayRegs.map((item) => (
                <div key={item._id} className="opr-side-row">
                  <div>
                    <div className="opr-side-name">{item.patient?.name || '—'}</div>
                    <div className="opr-side-meta">
                      {tokenLabel(item.tokenNumber)} · {fmtTime(item.tokenDate || item.createdAt)}
                      {' · '}
                      {formatDoctorName(item.doctor?.name)}
                    </div>
                  </div>
                  <span className={`opr-side-status opq-status--${item.status === 'waiting'}`}>
                    {item.status === 'waiting' ? 'Waiting' : item.status?.replace(/_/g, ' ')}
                  </span>
                </div>
              ))}
            </div>
            <button type="button" className="opr-side-more" onClick={() => navigate('/op-queue')}>
              View full doctor queue →
            </button>
          </div>
        </aside>
      </div>

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
              <input {...registerQuick('age', { required: true, min: 0 })} type="number" className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Gender *</label>
              <select {...registerQuick('gender', { required: true })} className="input-field">
                <option value="">Select</option>
                <option>Male</option>
                <option>Female</option>
                <option>Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input {...registerQuick('email')} type="email" className="input-field" />
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-4 border-t">
            <button type="button" onClick={() => setShowQuickAdd(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={quickAddMut.isPending} className="btn-primary">
              {quickAddMut.isPending ? 'Adding…' : 'Add Patient'}
            </button>
          </div>
        </form>
      </Modal>

      {printData && createPortal(
        <OPPaperTemplate branding={printData.branding || branding} op={printData.op} />,
        document.body,
      )}
      {billPrint && createPortal(
        <OPConsultationReceipt bill={billPrint.bill} op={billPrint.op} onClose={() => setBillPrint(null)} />,
        document.body,
      )}
    </div>
  );
}
