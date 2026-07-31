import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, CheckCircle2, Circle, Printer, Download, LogOut,
  ClipboardList, Stethoscope, Pill, Activity, FlaskConical, FileBarChart,
  FileCheck2, FolderOpen, History as HistoryIcon, RotateCcw, Save, Eye,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import Modal from '../components/common/Modal';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { useBranding } from '../hooks/useBranding';
import IPAdmissionPaperTemplate from '../components/ip/IPAdmissionPaperTemplate';

const fmtDate = (v) => (v ? new Date(v).toLocaleDateString('en-IN') : '—');
const fmtDateTime = (v) => (v ? new Date(v).toLocaleString('en-IN') : '—');
const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`;

/** Paper-style: 08/07/26 AT 12:00PM */
const fmtPaperDT = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase().replace(/\s/g, '');
  return `${dd}/${mm}/${yy} AT ${time}`;
};
const fmtPaperDate = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};
const fmtDotDate = (v) => {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
};

// Converts a Date/ISO-string coming back from the API into the yyyy-MM-dd /
// yyyy-MM-ddTHH:mm shape that <input type="date"> / <input type="datetime-local">
// controlled inputs require. Returns '' for empty/invalid values.
const toDateInputValue = (v) => {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
};
const toDateTimeInputValue = (v) => {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const SECTIONS = [
  { key: 'admission', label: 'Admission Info', tabLabel: 'Admission Details', icon: ClipboardList },
  { key: 'vitals', label: 'Vitals & Notes', icon: Stethoscope },
  { key: 'medications', label: 'Medications', tabLabel: 'Medications', icon: Pill, countKey: 'medications' },
  { key: 'services', label: 'Services', tabLabel: 'Services', icon: Activity, countKey: 'serviceUsages' },
  { key: 'investigations', label: 'Investigations', tabLabel: 'Investigations', icon: FlaskConical, countKey: 'labTests' },
  { key: 'summary', label: 'Summary', tabLabel: 'Summary', icon: FileBarChart },
  { key: 'discharge', label: 'Discharge Summary', tabLabel: 'Discharge', icon: FileCheck2 },
  { key: 'documents', label: 'Documents', icon: FolderOpen },
  { key: 'history', label: 'History', icon: HistoryIcon },
];

const EMPTY_FORM = {
  diagnosis: '', clinicalFindings: '', procedures: '', treatmentGiven: '', hospitalCourse: '',
  dama: 'No', referred: 'No', referredTo: '', absconded: 'No', death: 'No',
  medicationsOnDischarge: '', followUpAdvice: '', dischargeInstructions: '', remarks: '',
  // ── fields matching the printed discharge summary form ──
  chiefComplaints: '', pastHistory: '', physicalExamination: '',
  deliveryDate: '',
  obstetricHistory: { rmp: '', lmp: '', edd: '' },
};

const YES_NO = [{ value: 'No', label: 'No' }, { value: 'Yes', label: 'Yes' }];

function InfoPill({ label, value }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{value ?? '—'}</p>
    </div>
  );
}

function NumberedField({ n, label, children }) {
  return (
    <div>
      <label className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1.5">
        <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] flex items-center justify-center shrink-0">{n}</span>
        {label}
      </label>
      {children}
    </div>
  );
}

function SimpleTable({ rows, columns, emptyText = 'No records found.' }) {
  if (!rows?.length) return <p className="text-sm text-gray-400 text-center py-10">{emptyText}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-400 border-b border-gray-100 dark:border-gray-700">
            {columns.map((c) => <th key={c.key} className="py-2 pr-4 font-medium">{c.header}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r._id || i} className="border-b border-gray-50 dark:border-gray-800 last:border-0">
              {columns.map((c) => <td key={c.key} className="py-2 pr-4 text-gray-700 dark:text-gray-200">{c.render ? c.render(r) : r[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function IPAdmissionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useSelector((s) => s.auth);
  const { branding } = useBranding();
  const qc = useQueryClient();

  const [section, setSection] = useState('discharge');
  const [form, setForm] = useState(EMPTY_FORM);
  const [showMore, setShowMore] = useState(false);
  const [showDischargeConfirm, setShowDischargeConfirm] = useState(false);
  const [printAdmission, setPrintAdmission] = useState(false);

  const { data: admission, isLoading } = useQuery({
    queryKey: ['admission', id],
    queryFn: () => api.get(`/ip/${id}`).then((r) => r.data.data),
  });

  const buildFormFromAdmission = (adm) => {
    const dd = adm?.dischargeDetails;
    if (!dd) return EMPTY_FORM;
    return {
      ...EMPTY_FORM,
      ...dd,
      deliveryDate: toDateTimeInputValue(dd.deliveryDate),
      obstetricHistory: {
        rmp: dd.obstetricHistory?.rmp || '',
        lmp: toDateInputValue(dd.obstetricHistory?.lmp),
        edd: toDateInputValue(dd.obstetricHistory?.edd),
      },
    };
  };

  useEffect(() => {
    if (admission?.dischargeDetails) {
      setForm(buildFormFromAdmission(admission));
    }
  }, [admission?._id, admission?.updatedAt]);

  const saveDraftMut = useMutation({
    mutationFn: (payload) => api.put(`/ip/${id}/discharge-summary`, payload).then((r) => r.data),
    onSuccess: () => {
      toast.success('Discharge summary saved');
      qc.invalidateQueries({ queryKey: ['admission', id] });
    },
  });

  const dischargeMut = useMutation({
    mutationFn: (payload) => api.put(`/ip/${id}/discharge`, payload).then((r) => r.data),
    onSuccess: () => {
      toast.success('Patient discharged successfully');
      qc.invalidateQueries({ queryKey: ['admission', id] });
      qc.invalidateQueries({ queryKey: ['admissions'] });
      qc.invalidateQueries({ queryKey: ['roomDashboard'] });
      qc.invalidateQueries({ queryKey: ['beds'] });
      setShowDischargeConfirm(false);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Discharge failed'),
  });

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const setNested = (parent, key) => (e) => setForm((f) => ({ ...f, [parent]: { ...f[parent], [key]: e.target.value } }));

  const computedDischargeType = () => {
    if (form.death === 'Yes') return 'death';
    if (form.absconded === 'Yes') return 'absconded';
    if (form.dama === 'Yes') return 'LAMA';
    if (form.referred === 'Yes') return 'transfer';
    return 'regular';
  };

  const handleReset = () => setForm(buildFormFromAdmission(admission));
  const handleSaveDraft = () => saveDraftMut.mutate(form);
  const handleSaveAndPreview = () => saveDraftMut.mutate(form);

  const handleConfirmDischarge = () => {
    dischargeMut.mutate({ dischargeDetails: form, dischargeType: computedDischargeType() });
  };

  const fetchPdfBlobUrl = async () => {
    const res = await api.get(`/ip/${id}/discharge-print`, { responseType: 'blob' });
    return window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
  };

  const handleDownloadPdf = async () => {
    try {
      const url = await fetchPdfBlobUrl();
      const a = document.createElement('a');
      a.href = url;
      a.download = `discharge-${admission?.admissionNumber || id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error('Could not generate PDF');
    }
  };

  const handlePrint = async () => {
    try {
      const url = await fetchPdfBlobUrl();
      window.open(url, '_blank');
    } catch {
      toast.error('Could not open print preview');
    }
  };

  useEffect(() => {
    if (!printAdmission || !admission) return undefined;
    let cancelled = false;
    const handleAfterPrint = () => setPrintAdmission(false);
    window.addEventListener('afterprint', handleAfterPrint);
    const timer = setTimeout(async () => {
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
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, [printAdmission, admission]);

  if (isLoading || !admission) return <LoadingSpinner fullScreen />;

  const patient = admission.patient || {};
  const isDischarged = admission.status === 'discharged';

  const counts = {
    medications: admission.medications?.length || 0,
    serviceUsages: admission.serviceUsages?.length || 0,
    labTests: admission.labTests?.length || 0,
  };

  const topTabs = SECTIONS.filter((s) => s.tabLabel);

  return (
    <div className="space-y-4">
      {/* Back */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <button onClick={() => navigate('/ip-admissions')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">
          <ArrowLeft size={15} /> Back to IP Admissions
        </button>
        {admission?.patient?._id && (
          <button onClick={() => navigate(`/patients/${admission.patient._id}/profile`)} className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
            <HistoryIcon size={15} /> View Full Patient History (OP + IP)
          </button>
        )}
      </div>

      {/* Header card */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-lg font-bold text-blue-700" title="UHID from patient registration">{patient.patientId || '—'}</span>
                <span className={isDischarged ? 'badge-gray' : 'badge-green'}>{isDischarged ? 'Discharged' : 'Admitted'}</span>
              </div>
              <p className="text-base font-semibold text-gray-900 dark:text-white">{patient.name}</p>
              <p className="text-xs text-gray-400">{patient.age} Y / {patient.gender} · IP No: {admission.admissionNumber}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 flex-1 lg:px-6">
            <InfoPill label="UHID" value={patient.patientId} />
            <InfoPill label="Admission No" value={admission.admissionNumber} />
            <InfoPill label="Admission Date" value={fmtDateTime(admission.admissionDate)} />
            <InfoPill label="Doctor" value={`Dr. ${admission.doctor?.name || '—'}`} />
            <InfoPill label="Department" value={admission.department?.name} />
            <InfoPill label="Room / Bed" value={`${admission.room?.roomNumber || admission.bed?.roomNumber || '—'} ${admission.bed?.bedNumber ? `/ ${admission.bed.bedNumber}` : ''}`} />
          </div>

          <div className="flex flex-col sm:flex-row gap-2 shrink-0">
            <button type="button" onClick={() => setPrintAdmission(true)} className="btn-secondary">
              <Printer size={16} /> Print Admission Slip
            </button>
            {!isDischarged && (
              <button type="button" onClick={() => setShowDischargeConfirm(true)} className="btn-primary">
                <LogOut size={16} /> Discharge Patient
              </button>
            )}
          </div>
        </div>

        {/* Top tab bar */}
        <div className="flex gap-5 border-b border-gray-200 dark:border-gray-700 mt-5 overflow-x-auto">
          {topTabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setSection(t.key)}
              className={`pb-2.5 -mb-px text-sm font-medium border-b-2 whitespace-nowrap ${section === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
            >
              {t.tabLabel}
            </button>
          ))}
        </div>
      </div>

      {/* Body: sidebar + content */}
      <div className="flex gap-4 flex-col lg:flex-row">
        {/* Left sidebar */}
        <div className="lg:w-56 shrink-0">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-2 lg:sticky lg:top-4 flex lg:flex-col gap-1 overflow-x-auto">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const active = section === s.key;
              const count = s.countKey ? counts[s.countKey] : undefined;
              const done = s.key === 'admission' || (s.key === 'vitals' && ((admission.doctorRounds?.length || 0) + (admission.nursingNotes?.length || 0) > 0));
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setSection(s.key)}
                  className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${active ? 'bg-blue-600 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                >
                  <span className="flex items-center gap-2">
                    {done ? <CheckCircle2 size={15} className={active ? 'text-white' : 'text-green-500'} /> : <Icon size={15} />}
                    {s.label}
                  </span>
                  {count !== undefined && (
                    <span className={`text-xs rounded-full px-1.5 ${active ? 'bg-white/20' : 'bg-gray-100 dark:bg-gray-700'}`}>{count}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-4">
          {section === 'admission' && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5 space-y-3">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Admission Info</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <InfoPill label="Admission Type" value={admission.admissionType} />
                <InfoPill label="Admission Diagnosis" value={admission.admissionDiagnosis} />
                <InfoPill label="Attendant" value={admission.attendant?.name ? `${admission.attendant.name} (${admission.attendant.phone || '—'})` : '—'} />
                <InfoPill label="Ward" value={admission.ward?.name} />
                <InfoPill label="Admitted By" value={admission.admittedBy?.name} />
                <InfoPill label="Advance Paid" value={money(admission.advanceAmount)} />
                <InfoPill label="Advance Mode" value={admission.advancePaymentMode || '—'} />
                <InfoPill label="Daily Rate" value={money(admission.room?.dailyCharge ?? admission.bed?.dailyRate)} />
                <InfoPill label="Total Charges" value={money(admission.totalCharges)} />
              </div>
            </div>
          )}

          {section === 'vitals' && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5 space-y-4">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">Doctor Rounds</h3>
              {(admission.doctorRounds || []).length === 0 && <p className="text-sm text-gray-400">No doctor rounds recorded yet.</p>}
              {(admission.doctorRounds || []).map((r, i) => (
                <div key={i} className="text-sm border-b border-gray-50 dark:border-gray-800 pb-2 last:border-0">
                  <p className="text-xs text-gray-400">{fmtDateTime(r.visitTime)} • Dr. {r.doctor?.name}</p>
                  <p>{r.notes}</p>
                </div>
              ))}
              <h3 className="text-base font-semibold text-gray-900 dark:text-white pt-2">Nursing Notes</h3>
              {(admission.nursingNotes || []).length === 0 && <p className="text-sm text-gray-400">No nursing notes recorded yet.</p>}
              {(admission.nursingNotes || []).map((n, i) => (
                <div key={i} className="text-sm border-b border-gray-50 dark:border-gray-800 pb-2 last:border-0">
                  <p className="text-xs text-gray-400">{fmtDateTime(n.recordedAt)} • {n.nurse?.name}</p>
                  <p>{n.note}</p>
                </div>
              ))}
            </div>
          )}

          {section === 'medications' && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">Medications ({counts.medications})</h3>
              <SimpleTable
                rows={admission.medications}
                emptyText="No medications logged for this admission."
                columns={[
                  { key: 'medicineName', header: 'Medicine' },
                  { key: 'dosage', header: 'Dosage' },
                  { key: 'frequency', header: 'Frequency' },
                  { key: 'route', header: 'Route' },
                  { key: 'administeredAt', header: 'Given At', render: (r) => fmtDateTime(r.administeredAt) },
                  { key: 'administeredBy', header: 'By', render: (r) => r.administeredBy?.name },
                ]}
              />
            </div>
          )}

          {section === 'services' && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">Services / Equipment ({counts.serviceUsages})</h3>
              <SimpleTable
                rows={admission.serviceUsages}
                emptyText="No services or equipment usage logged yet."
                columns={[
                  { key: 'serviceName', header: 'Service' },
                  { key: 'category', header: 'Category' },
                  { key: 'quantity', header: 'Qty' },
                  { key: 'unitPrice', header: 'Rate', render: (r) => money(r.unitPrice) },
                  { key: 'usedAt', header: 'Used At', render: (r) => fmtDateTime(r.usedAt) },
                ]}
              />
            </div>
          )}

          {section === 'investigations' && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">Investigations ({counts.labTests})</h3>
              <SimpleTable
                rows={admission.labTests}
                emptyText="No lab or radiology investigations ordered yet."
                columns={[
                  { key: 'labNumber', header: 'Ref #' },
                  { key: 'labType', header: 'Type' },
                  { key: 'status', header: 'Status', render: (r) => <span className="badge-blue">{r.status}</span> },
                  { key: 'createdAt', header: 'Date', render: (r) => fmtDate(r.createdAt) },
                ]}
              />
            </div>
          )}

          {section === 'summary' && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5 space-y-2 text-sm">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Stay Summary</h3>
              <InfoPill label="Admission Diagnosis" value={admission.admissionDiagnosis} />
              <InfoPill label="Final Diagnosis" value={admission.finalDiagnosis} />
              <InfoPill label="Medications Given" value={counts.medications} />
              <InfoPill label="Services Used" value={counts.serviceUsages} />
              <InfoPill label="Investigations Ordered" value={counts.labTests} />
              <InfoPill label="Total Charges" value={money(admission.totalCharges)} />
            </div>
          )}

          {section === 'documents' && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">Documents ({admission.documents?.length || 0})</h3>
              <SimpleTable
                rows={admission.documents}
                emptyText="No documents uploaded for this admission yet."
                columns={[
                  { key: 'title', header: 'Title' },
                  { key: 'fileUrl', header: 'File', render: (r) => <a className="text-blue-600 underline" href={r.fileUrl} target="_blank" rel="noreferrer">View</a> },
                ]}
              />
            </div>
          )}

          {section === 'history' && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">Bed Transfer History</h3>
              <SimpleTable
                rows={admission.transferHistory}
                emptyText="No bed transfers recorded for this admission."
                columns={[
                  { key: 'transferDate', header: 'Date', render: (r) => fmtDateTime(r.transferDate) },
                  { key: 'fromBed', header: 'From', render: (r) => r.fromBed?.bedNumber || '—' },
                  { key: 'toBed', header: 'To', render: (r) => r.toBed?.bedNumber || '—' },
                  { key: 'reason', header: 'Reason' },
                ]}
              />
            </div>
          )}

          {section === 'discharge' && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
              {/* Form */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5 space-y-5">
                <div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">Discharge Summary</h3>
                  <p className="text-xs text-gray-400">Fill the discharge summary details below</p>
                </div>

                <p className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                  Fill the same sections as the printed hospital discharge summary. Print / Download uses this exact layout.
                </p>

                <NumberedField n={1} label="Diagnosis">
                  <textarea rows={2} className="input-field" value={form.diagnosis} onChange={set('diagnosis')} placeholder="Primi 36 weeks 6 days gestation with Oligohydramnios admitted for safe confinement." />
                </NumberedField>

                <NumberedField n={2} label="Menstrual History">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <label className="text-[11px] text-gray-400 mb-1 block">RMP</label>
                      <input className="input-field" placeholder="3/28 DAYS CYCL" value={form.obstetricHistory.rmp} onChange={setNested('obstetricHistory', 'rmp')} />
                    </div>
                    <div>
                      <label className="text-[11px] text-gray-400 mb-1 block">LMP</label>
                      <input type="date" className="input-field" value={form.obstetricHistory.lmp} onChange={setNested('obstetricHistory', 'lmp')} />
                    </div>
                    <div>
                      <label className="text-[11px] text-gray-400 mb-1 block">EDD</label>
                      <input type="date" className="input-field" value={form.obstetricHistory.edd} onChange={setNested('obstetricHistory', 'edd')} />
                    </div>
                  </div>
                  <div className="mt-2">
                    <label className="text-[11px] text-gray-400 mb-1 block">D.O.DELIVERY (shown on summary)</label>
                    <input type="datetime-local" className="input-field" value={form.deliveryDate} onChange={set('deliveryDate')} />
                  </div>
                </NumberedField>

                <NumberedField n={3} label="Chief Complaints">
                  <textarea rows={4} className="input-field" value={form.chiefComplaints} onChange={set('chiefComplaints')} placeholder="Patient was admitted with 36 weeks 6 days gestation with C/O Pain Abdomen. No H/O Bleeding PV / No H/O draining PV. Fetal movements felt well." />
                </NumberedField>

                <NumberedField n={4} label="Past History">
                  <textarea rows={2} className="input-field" value={form.pastHistory} onChange={set('pastHistory')} placeholder="Nil relevant" />
                </NumberedField>

                <NumberedField n={5} label="Physical Examination">
                  <textarea rows={5} className="input-field" value={form.physicalExamination} onChange={set('physicalExamination')} placeholder={'Patient general condition fair, Not Pale, No P.E,\nBP-110/70mm/Hg, pulse-86/mint,\nCVS/RS- NAD,\nP/A- Uterus 36weeks, acting, Head unengaged, FHS - 140/min.\nP/V -Cx 25 %effaced/Osadmits 1 finger/memb +/ Vx at brim...\nFoleys induction done.'} />
                </NumberedField>

                <button type="button" onClick={() => setShowMore((v) => !v)} className="text-xs text-blue-600 hover:underline font-medium">
                  {showMore ? 'Hide' : 'Show'} additional sections (treatment, medications, DAMA, etc.)
                </button>

                {showMore && (
                  <div className="space-y-4 border-t border-gray-100 dark:border-gray-700 pt-4">
                    <NumberedField n={6} label="Clinical Findings">
                      <textarea rows={2} className="input-field" value={form.clinicalFindings} onChange={set('clinicalFindings')} />
                    </NumberedField>
                    <NumberedField n={7} label="Procedure">
                      <textarea rows={1} className="input-field" value={form.procedures} onChange={set('procedures')} placeholder="Nil" />
                    </NumberedField>
                    <NumberedField n={8} label="Treatment Given">
                      <textarea rows={2} className="input-field" value={form.treatmentGiven} onChange={set('treatmentGiven')} />
                    </NumberedField>
                    <NumberedField n={9} label="Course Given">
                      <textarea rows={2} className="input-field" value={form.hospitalCourse} onChange={set('hospitalCourse')} />
                    </NumberedField>
                    <div>
                      <label className="block text-sm font-medium mb-1">Medications on Discharge</label>
                      <textarea rows={2} className="input-field" value={form.medicationsOnDischarge} onChange={set('medicationsOnDischarge')} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Follow-up Advice</label>
                      <textarea rows={2} className="input-field" value={form.followUpAdvice} onChange={set('followUpAdvice')} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Discharge Instructions</label>
                      <textarea rows={2} className="input-field" value={form.dischargeInstructions} onChange={set('dischargeInstructions')} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium mb-1">DAMA</label>
                        <select className="input-field" value={form.dama} onChange={set('dama')}>
                          {YES_NO.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Absconded</label>
                        <select className="input-field" value={form.absconded} onChange={set('absconded')}>
                          {YES_NO.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Refer</label>
                        <select className="input-field" value={form.referred} onChange={set('referred')}>
                          <option value="No">Not Referred</option>
                          <option value="Yes">Referred</option>
                        </select>
                        {form.referred === 'Yes' && (
                          <input className="input-field mt-2" placeholder="Referred to" value={form.referredTo} onChange={set('referredTo')} />
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Death</label>
                        <select className="input-field" value={form.death} onChange={set('death')}>
                          {YES_NO.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Remarks</label>
                      <textarea rows={2} className="input-field" value={form.remarks} onChange={set('remarks')} />
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-3 pt-2">
                  <button type="button" onClick={handleReset} className="btn-secondary"><RotateCcw size={15} /> Reset</button>
                  <button type="button" disabled={saveDraftMut.isPending} onClick={handleSaveDraft} className="btn-secondary"><Save size={15} /> Save Draft</button>
                  <button type="button" disabled={saveDraftMut.isPending} onClick={handleSaveAndPreview} className="btn-primary flex-1 justify-center"><Eye size={15} /> Save & Preview</button>
                </div>
              </div>

              {/* Live preview */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">Discharge Summary Preview</h3>
                  <div className="flex gap-2">
                    <button type="button" onClick={handlePrint} className="btn-secondary text-xs py-1.5 px-3"><Printer size={13} /> Print</button>
                    <button type="button" onClick={handleDownloadPdf} className="btn-secondary text-xs py-1.5 px-3"><Download size={13} /> Download PDF</button>
                  </div>
                </div>

                {/* Exact paper-style preview */}
                <div className="border border-gray-300 bg-white text-black p-5 font-serif text-[12px] leading-snug space-y-3 max-h-[70vh] overflow-y-auto">
                  {(patient.allergies || []).length > 0 && (
                    <p className="text-center font-bold uppercase tracking-wide">
                      {(patient.allergies || []).join(', ').toUpperCase()} ALLERGY
                    </p>
                  )}

                  <div className="text-center">
                    <p className="text-xl font-bold uppercase tracking-wide">{branding.hospitalName || 'Hospital'}</p>
                    {branding.address && <p className="text-[11px] mt-0.5">{branding.address}</p>}
                    <p className="text-sm font-bold uppercase mt-2 tracking-wider">Discharge Summary</p>
                  </div>

                  <table className="w-full border border-black text-[11px]">
                    <tbody>
                      {[
                        ['PATIENT NAME', (patient.name || '').toUpperCase(), 'D.O.A', fmtPaperDT(admission.admissionDate)],
                        ['AGE/SEX', `${patient.age != null ? `${patient.age} YRS` : ''} / ${(patient.gender || '').toUpperCase()}`, 'D.O.DELIVERY', form.deliveryDate ? fmtPaperDT(form.deliveryDate) : '—'],
                        ['IP.NO', admission.admissionNumber || '—', 'D.O.D', admission.dischargeDate ? fmtPaperDate(admission.dischargeDate) : '—'],
                        ['CONSULTANT', admission.doctor?.name ? `DR.${admission.doctor.name.replace(/^dr\.?\s*/i, '').toUpperCase()}` : '—', 'DEPARTMENT', (admission.department?.name || '').toUpperCase()],
                      ].map(([l1, v1, l2, v2]) => (
                        <tr key={l1} className="border-b border-black last:border-0">
                          <td className="border-r border-black px-2 py-1.5 w-1/2 align-top">
                            <span className="font-bold">{l1}:</span> {v1}
                          </td>
                          <td className="px-2 py-1.5 w-1/2 align-top">
                            <span className="font-bold">{l2}:</span> {v2}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="flex justify-between gap-4 text-[11px]">
                    <div>
                      <p className="font-bold underline">ADDRESS:</p>
                      <p className="uppercase">{patient.address?.street || '—'}</p>
                      <p className="uppercase">{[patient.address?.city, patient.address?.state, patient.address?.pincode].filter(Boolean).join(', ')}</p>
                      {patient.phone && <p>PH: {patient.phone}</p>}
                    </div>
                    <div className="text-right font-bold whitespace-nowrap">
                      {patient.patientId && <p>UHID - {patient.patientId}</p>}
                      {patient.rchId && <p>RCH ID - {patient.rchId}</p>}
                    </div>
                  </div>

                  <div className="space-y-3 text-[11.5px]">
                    <div>
                      <p className="font-bold underline inline">DIAGNOSIS:</p>
                      <p className="mt-0.5 whitespace-pre-wrap">{form.diagnosis || '—'}</p>
                    </div>
                    {(form.obstetricHistory.rmp || form.obstetricHistory.lmp || form.obstetricHistory.edd) && (
                      <div>
                        <p className="font-bold underline inline">MENSTRUAL HISTORY:</p>
                        <p className="mt-0.5">
                          {form.obstetricHistory.rmp && <>RMP, {form.obstetricHistory.rmp}<br /></>}
                          {(form.obstetricHistory.lmp || form.obstetricHistory.edd) && (
                            <>LMP - {fmtDotDate(form.obstetricHistory.lmp) || '—'}&nbsp;&nbsp;&nbsp;EDD - {fmtDotDate(form.obstetricHistory.edd) || '—'}</>
                          )}
                        </p>
                      </div>
                    )}
                    <div>
                      <p className="font-bold underline inline">CHIEF COMPLAINTS:</p>
                      <p className="mt-0.5 whitespace-pre-wrap">{form.chiefComplaints || '—'}</p>
                    </div>
                    <div>
                      <p className="font-bold underline inline">PAST HISTORY:</p>
                      <p className="mt-0.5 whitespace-pre-wrap">{form.pastHistory || 'Nil relevant'}</p>
                    </div>
                    <div>
                      <p className="font-bold underline inline">PHYSICAL EXAMINATION:</p>
                      <p className="mt-0.5 whitespace-pre-wrap">{form.physicalExamination || '—'}</p>
                    </div>
                    {form.treatmentGiven && (
                      <div>
                        <p className="font-bold underline inline">TREATMENT GIVEN:</p>
                        <p className="mt-0.5 whitespace-pre-wrap">{form.treatmentGiven}</p>
                      </div>
                    )}
                    {form.medicationsOnDischarge && (
                      <div>
                        <p className="font-bold underline inline">MEDICATIONS ON DISCHARGE:</p>
                        <p className="mt-0.5 whitespace-pre-wrap">{form.medicationsOnDischarge}</p>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between items-end pt-8 text-[11px]">
                    <p>Date: {fmtPaperDate(admission.dischargeDate || new Date())}</p>
                    <div className="text-center w-40">
                      <div className="border-t border-black pt-1 font-bold">Consultant Signature</div>
                      <p>Dr. {admission.doctor?.name || '—'}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Confirm discharge modal */}
      <Modal isOpen={showDischargeConfirm} onClose={() => setShowDischargeConfirm(false)} title="Confirm Discharge" size="sm">
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            This will discharge <strong>{patient.name}</strong> and free up their room/bed. You can still edit and save the discharge summary later from this page after discharge.
          </p>
          <div className="flex gap-3">
            <button type="button" onClick={() => setShowDischargeConfirm(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="button" disabled={dischargeMut.isPending} onClick={handleConfirmDischarge} className="btn-primary flex-1 justify-center">
              <LogOut size={15} /> {dischargeMut.isPending ? 'Discharging...' : 'Confirm Discharge'}
            </button>
          </div>
        </div>
      </Modal>

      {printAdmission &&
        createPortal(
          <IPAdmissionPaperTemplate branding={branding} admission={admission} />,
          document.body,
        )}
    </div>
  );
}