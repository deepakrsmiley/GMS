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
import { hasPermission } from '../constants/permissions';
import IPAdmissionPaperTemplate from '../components/ip/IPAdmissionPaperTemplate';
import '../styles/dischargeSummary.css';

const fmtDate = (v) => (v ? new Date(v).toLocaleDateString('en-IN') : '—');
const fmtDateTime = (v) => (v ? new Date(v).toLocaleString('en-IN') : '—');
const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`;

/** Paper-style: 08/07/2026 AT 12:00PM (date/month/year) */
const fmtPaperDT = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase().replace(/\s/g, '');
  return `${dd}/${mm}/${yyyy} AT ${time}`;
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
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
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

const MOTHER_CONDITIONS = ['Live and Healthy', 'Maternal Death', 'Referral'];
const BABY_CONDITIONS = ['Live and Healthy', 'Still Birth', 'Newborn Death', 'Referral'];
const ADVICE_ITEMS = [
  'Rest',
  'Nutritious diet',
  'Plenty of oral fluids',
  'Continue previous medications, if had been prescribed',
  'Exclusive Breast feeding for six months',
  "No Water / honey / cow's milk for baby",
  'Dry cord care',
  'Burping after breastfeeding',
  'Maintaining warmth for baby',
  'Counselling on danger symptoms for mother and baby',
  'Hand hygiene and Perineal hygiene',
  'Maintain ambulation and COVID Appropriate Behaviour',
  'Regular Immunization for baby as per schedule',
  'Step down admission to CHC / PHC',
];
const DANGER_MOTHER = [
  'Excessive bleeding / Severe abdominal pain',
  'Severe headache or visual disturbance',
  'Breathing difficulty / Cough',
  'Fever or chills',
  'Breast Swelling / Pain / unable to feed baby',
  'Difficulty in passing urine / decreased urine output',
  'Foul smelling vaginal discharge',
  'Leg Pain or Swelling',
  'Feels unhappy / cries easily / Sleep Disturbance',
  'Excessive tiredness and not feeling well',
];
const DANGER_BABY = [
  'Fast / Difficulty breathing',
  'Fever / Unusually cold',
  'Stops feeding / Poor feeding',
  'Less activity than normal / Lethargy',
  'Palms / Soles becomes yellow or blue',
  'Vomiting / Diarrhoea / Abdomen distension',
  'Swollen, Red / Purulent eyes',
  'Redness / Discharge from umbilicus',
  'Skin boils / Infection',
  'Convulsions',
];

const EMPTY_MATERNITY = {
  motherCondition: '',
  babyCondition: '',
  adviceChecked: [],
  reviewDate: '',
  dischargeDrugs: {
    iron: '',
    ironDays: '',
    calcium: '1 - 1 - 0',
    calciumDays: '',
    line8: '',
    line9: '',
    line10: '',
  },
  referral: {
    facility: '',
    mode: '',
    reason: '',
    advanceNotification: '',
    accompanied: '',
  },
  referralVitals: '',
  treatmentGivenAtReferral: '',
};

const DEFAULT_LAB_ROWS = [
  { name: 'HB %', report: '' },
  { name: 'HBsAg', report: '' },
  { name: 'Bld Group', report: '' },
  { name: 'HIV/VDRL', report: '' },
  { name: 'Creatinine', report: '' },
  { name: 'Blood Sugar', report: '' },
  { name: 'BT', report: '' },
  { name: 'CT', report: '' },
];

const EMPTY_FORM = {
  allergyAlert: '',
  addressNote: '',
  rchId: '',
  diagnosis: '',
  chiefComplaints: '',
  pastHistory: 'Nil relevant',
  physicalExamination: '',
  deliveryDate: '',
  obstetricHistory: { rmp: '', lmp: '', edd: '' },
  labInvestigations: DEFAULT_LAB_ROWS.map((r) => ({ ...r })),
  echoReport: '',
  investigationsNote: 'Remaining reports all with patient including ECG, Scan etc...',
  hospitalCourse: '',
  babyDetails: '',
  postnatalPeriod: '',
  hospitalMedications: '',
  conditionOnDischarge: '',
  pvStatus: '',
  medicationsOnDischarge: '',
  motherWarnings: 'To report immediately to hospital in case of Fever, Headache, Vomiting, Blurring of vision, abdominal pain or foul smelling discharge or Bleeding P.V',
  dietaryAdvice: 'To take normal diet, High protein diet and plenty of oral fluids.',
  babyWarnings: 'To report immediately if Baby has Poor feeding, Fever, Yellowish discolouration of the baby.',
  immunizationNote: 'IMMUNISATION SCHEDULED.',
  supplementsAdvice: 'CONTINUE IRON AND CALCIUM SUPPLEMENTS THROUGHOUT LACTATION',
  babyLabAdvice: 'Advised to do BLOOD GROUPING, SERUM BILIRUBIN, FREE T3T4TSH to the baby after 5 days',
  customInstructions: '',
  reviewAppointment: '',
  emergencyContact: '',
  clinicalFindings: '',
  procedures: '',
  treatmentGiven: '',
  followUpAdvice: '',
  dischargeInstructions: '',
  dama: 'No',
  referred: 'No',
  referredTo: '',
  absconded: 'No',
  death: 'No',
  remarks: '',
  maternityAdvice: { ...EMPTY_MATERNITY, dischargeDrugs: { ...EMPTY_MATERNITY.dischargeDrugs }, referral: { ...EMPTY_MATERNITY.referral } },
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
  const [editReason, setEditReason] = useState('');
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);

  const { data: admission, isLoading } = useQuery({
    queryKey: ['admission', id],
    queryFn: () => api.get(`/ip/${id}`).then((r) => r.data.data),
  });

  const buildFormFromAdmission = (adm) => {
    const dd = adm?.dischargeDetails;
    if (!dd) {
      return {
        ...EMPTY_FORM,
        maternityAdvice: {
          ...EMPTY_MATERNITY,
          dischargeDrugs: { ...EMPTY_MATERNITY.dischargeDrugs },
          referral: { ...EMPTY_MATERNITY.referral },
        },
      };
    }
    const ma = dd.maternityAdvice || {};
    return {
      ...EMPTY_FORM,
      ...dd,
      deliveryDate: toDateTimeInputValue(dd.deliveryDate),
      labInvestigations: Array.isArray(dd.labInvestigations) && dd.labInvestigations.length
        ? dd.labInvestigations.map((r) => ({ name: r.name || '', report: r.report || '' }))
        : DEFAULT_LAB_ROWS.map((r) => ({ ...r })),
      obstetricHistory: {
        rmp: dd.obstetricHistory?.rmp || '',
        lmp: toDateInputValue(dd.obstetricHistory?.lmp),
        edd: toDateInputValue(dd.obstetricHistory?.edd),
      },
      maternityAdvice: {
        ...EMPTY_MATERNITY,
        ...ma,
        adviceChecked: Array.isArray(ma.adviceChecked) ? ma.adviceChecked.map(Number) : [],
        dischargeDrugs: { ...EMPTY_MATERNITY.dischargeDrugs, ...(ma.dischargeDrugs || {}) },
        referral: { ...EMPTY_MATERNITY.referral, ...(ma.referral || {}) },
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
    onSuccess: async () => {
      toast.success('Discharge summary saved');
      qc.invalidateQueries({ queryKey: ['admission', id] });
      try {
        const url = await fetchPdfBlobUrl();
        setPdfPreviewUrl((prev) => {
          if (prev) window.URL.revokeObjectURL(prev);
          return url;
        });
      } catch {
        /* PDF preview refreshes on next print */
      }
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Could not save discharge summary'),
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
  const setLabRow = (idx, field) => (e) => setForm((f) => {
    const rows = [...(f.labInvestigations || [])];
    rows[idx] = { ...rows[idx], [field]: e.target.value };
    return { ...f, labInvestigations: rows };
  });
  const addLabRow = () => setForm((f) => ({
    ...f,
    labInvestigations: [...(f.labInvestigations || []), { name: '', report: '' }],
  }));
  const removeLabRow = (idx) => setForm((f) => ({
    ...f,
    labInvestigations: (f.labInvestigations || []).filter((_, i) => i !== idx),
  }));
  const setMaternity = (key) => (e) => setForm((f) => ({
    ...f,
    maternityAdvice: { ...f.maternityAdvice, [key]: e.target.value },
  }));
  const setMaternityDrug = (key) => (e) => setForm((f) => ({
    ...f,
    maternityAdvice: {
      ...f.maternityAdvice,
      dischargeDrugs: { ...f.maternityAdvice.dischargeDrugs, [key]: e.target.value },
    },
  }));
  const setMaternityReferral = (key) => (e) => setForm((f) => ({
    ...f,
    maternityAdvice: {
      ...f.maternityAdvice,
      referral: { ...f.maternityAdvice.referral, [key]: e.target.value },
    },
  }));
  const toggleAdvice = (idx) => {
    setForm((f) => {
      const cur = new Set(f.maternityAdvice.adviceChecked || []);
      if (cur.has(idx)) cur.delete(idx);
      else cur.add(idx);
      return {
        ...f,
        maternityAdvice: { ...f.maternityAdvice, adviceChecked: [...cur].sort((a, b) => a - b) },
      };
    });
  };
  const ma = form.maternityAdvice || EMPTY_MATERNITY;
  const adviceChecked = new Set((ma.adviceChecked || []).map(Number));
  const labRows = form.labInvestigations || [];

  const computedDischargeType = () => {
    if (form.death === 'Yes') return 'death';
    if (form.absconded === 'Yes') return 'absconded';
    if (form.dama === 'Yes') return 'LAMA';
    if (form.referred === 'Yes') return 'transfer';
    return 'regular';
  };

  const handleReset = () => setForm(buildFormFromAdmission(admission));
  const handleSaveDraft = () => {
    if (admission?.status === 'discharged' && !editReason.trim()) {
      toast.error('Please enter a reason for changing the discharge summary');
      return;
    }
    saveDraftMut.mutate({ ...form, reason: editReason.trim() || 'Draft save' });
  };
  const handleSaveAndPreview = () => handleSaveDraft();

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
  const canWriteSummary = hasPermission(user, 'CREATE_DISCHARGE_SUMMARY');
  const canDischarge = hasPermission(user, 'PROCESS_DISCHARGE');
  const canEditDischargedSummary = isDischarged && canWriteSummary && (
    hasPermission(user, 'MANAGE_STAFF') || hasPermission(user, 'MANAGE_SETTINGS')
  );
  const canEditSummary = (!isDischarged && canWriteSummary) || canEditDischargedSummary;
  const allergyLine = form.allergyAlert
    || ((patient.allergies || []).length
      ? `${(patient.allergies || []).join(', ').toUpperCase()} ALLERGY`
      : '');
  const addressDisplay = form.addressNote
    || [
      patient.address?.street,
      [patient.address?.city, patient.address?.state, patient.address?.pincode].filter(Boolean).join(', '),
      patient.phone ? `PH: ${patient.phone}` : '',
    ].filter(Boolean).join('\n');
  const rchDisplay = form.rchId || patient.rchId || '';

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
            {!isDischarged && canDischarge && (
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
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start ds-paper">
              {/* Form — exact paper order */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-blue-100 dark:border-gray-700 p-5 space-y-3 max-h-[78vh] overflow-y-auto">
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white">Discharge Summary</h3>
                  <p className="text-xs text-slate-500">3 pages — same order as your printed discharge summary. Tamil → editable text box on page 3.</p>
                  {isDischarged && canEditDischargedSummary && (
                    <p className="mt-2 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      Patient is discharged. Super Admin / Admin can still edit and save this summary.
                    </p>
                  )}
                  {isDischarged && !canEditDischargedSummary && (
                    <p className="mt-2 text-xs font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                      Patient is discharged. Only Super Admin or Admin can edit this summary.
                    </p>
                  )}
                </div>

                <div className="ds-page-banner">Page 1 of 3 <span>Header → Physical Examination</span></div>

                <div className="ds-section">
                  <h4 className="ds-section__head">Allergy alert (top of paper)</h4>
                  <div className="ds-section__body">
                    <input className="input-field" value={form.allergyAlert} onChange={set('allergyAlert')} placeholder="INJ. XONE ALLERGY (leave blank to use patient allergies)" />
                  </div>
                </div>

                <div className="ds-section">
                  <h4 className="ds-section__head">Patient info (auto + delivery date)</h4>
                  <div className="ds-section__body space-y-2">
                    <p className="text-xs text-slate-500">Name, age/sex, IP no, DOA, DOD, consultant &amp; department come from admission. Set delivery date below.</p>
                    <div>
                      <label className="ds-label">D.O.Delivery</label>
                      <input type="datetime-local" className="input-field" value={form.deliveryDate} onChange={set('deliveryDate')} />
                    </div>
                  </div>
                </div>

                <div className="ds-section">
                  <h4 className="ds-section__head">Address / RCH ID</h4>
                  <div className="ds-section__body ds-grid-2">
                    <div>
                      <label className="ds-label">Address (override — blank uses patient address)</label>
                      <textarea rows={3} className="input-field" value={form.addressNote} onChange={set('addressNote')} placeholder="Street, village, PH: …" />
                    </div>
                    <div>
                      <label className="ds-label">RCH ID</label>
                      <input className="input-field" value={form.rchId} onChange={set('rchId')} placeholder="133011696962" />
                    </div>
                  </div>
                </div>

                <div className="ds-section">
                  <h4 className="ds-section__head">Diagnosis</h4>
                  <div className="ds-section__body">
                    <textarea rows={2} className="input-field" value={form.diagnosis} onChange={set('diagnosis')} placeholder="Primi 36 weeks 6 days gestation with Oligohydramnios admitted for safe confinement." />
                  </div>
                </div>

                <div className="ds-section">
                  <h4 className="ds-section__head">Menstrual History</h4>
                  <div className="ds-section__body">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <label className="ds-label">RMP</label>
                        <input className="input-field" placeholder="3/28 DAYS CYCL" value={form.obstetricHistory?.rmp || ''} onChange={setNested('obstetricHistory', 'rmp')} />
                      </div>
                      <div>
                        <label className="ds-label">LMP</label>
                        <input type="date" className="input-field" value={form.obstetricHistory?.lmp || ''} onChange={setNested('obstetricHistory', 'lmp')} />
                      </div>
                      <div>
                        <label className="ds-label">EDD</label>
                        <input type="date" className="input-field" value={form.obstetricHistory?.edd || ''} onChange={setNested('obstetricHistory', 'edd')} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="ds-section">
                  <h4 className="ds-section__head">Chief Complaints</h4>
                  <div className="ds-section__body">
                    <textarea rows={4} className="input-field" value={form.chiefComplaints} onChange={set('chiefComplaints')} placeholder="Patient was admitted with …" />
                  </div>
                </div>

                <div className="ds-section">
                  <h4 className="ds-section__head">Past History</h4>
                  <div className="ds-section__body">
                    <textarea rows={2} className="input-field" value={form.pastHistory} onChange={set('pastHistory')} />
                  </div>
                </div>

                <div className="ds-section">
                  <h4 className="ds-section__head">Physical Examination</h4>
                  <div className="ds-section__body">
                    <textarea rows={5} className="input-field" value={form.physicalExamination} onChange={set('physicalExamination')} placeholder="BP, pulse, CVS/RS, P/A, P/V…" />
                  </div>
                </div>

                <div className="ds-page-banner">Page 2 of 3 <span>Lab → Condition on Discharge</span></div>

                <div className="ds-section">
                  <h4 className="ds-section__head">Laboratory Investigation Reports</h4>
                  <div className="ds-section__body">
                    {labRows.map((row, idx) => (
                      <div key={idx} className="ds-lab-row">
                        <input className="input-field" placeholder="NAME" value={row.name} onChange={setLabRow(idx, 'name')} />
                        <input className="input-field" placeholder="REPORT" value={row.report} onChange={setLabRow(idx, 'report')} />
                        <button type="button" className="text-xs text-red-500 px-1" onClick={() => removeLabRow(idx)}>Remove</button>
                      </div>
                    ))}
                    <button type="button" className="text-xs text-blue-600 font-medium mt-1" onClick={addLabRow}>+ Add lab row</button>
                    <div className="mt-3">
                      <label className="ds-label">Echo / imaging report</label>
                      <textarea rows={4} className="input-field" value={form.echoReport} onChange={set('echoReport')} placeholder={'NO RWMA\nNORMAL LVSF EF 62 %\n…'} />
                    </div>
                    <div className="mt-2">
                      <label className="ds-label">Note under investigations</label>
                      <input className="input-field" value={form.investigationsNote} onChange={set('investigationsNote')} />
                    </div>
                  </div>
                </div>

                <div className="ds-section">
                  <h4 className="ds-section__head">Course of Treatment in Hospital</h4>
                  <div className="ds-section__body">
                    <textarea rows={4} className="input-field" value={form.hospitalCourse} onChange={set('hospitalCourse')} placeholder={'LABOUR NATURAL WITH EPISIOTOMY:\nWith good uterine contraction…'} />
                  </div>
                </div>

                <div className="ds-section">
                  <h4 className="ds-section__head">Baby Details</h4>
                  <div className="ds-section__body">
                    <textarea rows={3} className="input-field" value={form.babyDetails} onChange={set('babyDetails')} placeholder="Live late preterm male Baby, Date… Weight… Apgar… Birth dose Vaccination…" />
                  </div>
                </div>

                <div className="ds-section">
                  <h4 className="ds-section__head">Postnatal Period</h4>
                  <div className="ds-section__body space-y-2">
                    <div>
                      <label className="ds-label">Status / narrative</label>
                      <textarea rows={2} className="input-field" value={form.postnatalPeriod} onChange={set('postnatalPeriod')} placeholder="Uneventful. She received a course of antibiotics and analgesics." />
                    </div>
                    <div>
                      <label className="ds-label">Hospital medications (injections during stay)</label>
                      <textarea rows={4} className="input-field" value={form.hospitalMedications} onChange={set('hospitalMedications')} placeholder={'INJ. PIPTAZ 4.5 gm BD\nINJ. METROGYL I.V TDS\n…'} />
                    </div>
                  </div>
                </div>

                <div className="ds-section">
                  <h4 className="ds-section__head">Condition on Discharge</h4>
                  <div className="ds-section__body">
                    <textarea rows={5} className="input-field" value={form.conditionOnDischarge} onChange={set('conditionOnDischarge')} placeholder={'General conditions Fair,\nNot Pale,\nNo P.E;\nBP-110/70…'} />
                  </div>
                </div>

                <div className="ds-page-banner">Page 3 of 3 <span>Advice → Signature (Tamil → text box)</span></div>

                <div className="ds-section">
                  <h4 className="ds-section__head">P/V / clinical status (start of page 3)</h4>
                  <div className="ds-section__body">
                    <textarea rows={2} className="input-field" value={form.pvStatus} onChange={set('pvStatus')} placeholder="P/V - Lochia healthy, No undue bleeding p.v" />
                  </div>
                </div>

                <div className="ds-section">
                  <h4 className="ds-section__head">Further Advice on Discharge (medications)</h4>
                  <div className="ds-section__body">
                    <textarea rows={5} className="input-field" value={form.medicationsOnDischarge} onChange={set('medicationsOnDischarge')} placeholder={'TAB: TETRAFAST DSR 1-0-1 X 5days.\nTAB: CHYMORAL AP 1-0-1 X 5days.\n…'} />
                  </div>
                </div>

                <div className="ds-section">
                  <h4 className="ds-section__head">Patient instructions &amp; warnings</h4>
                  <div className="ds-section__body space-y-2">
                    <div>
                      <label className="ds-label">Mother warnings</label>
                      <textarea rows={2} className="input-field" value={form.motherWarnings} onChange={set('motherWarnings')} />
                    </div>
                    <div>
                      <label className="ds-label">Dietary advice</label>
                      <textarea rows={2} className="input-field" value={form.dietaryAdvice} onChange={set('dietaryAdvice')} />
                    </div>
                    <div>
                      <label className="ds-label">Baby warnings</label>
                      <textarea rows={2} className="input-field" value={form.babyWarnings} onChange={set('babyWarnings')} />
                    </div>
                    <div>
                      <label className="ds-label">Immunisation</label>
                      <input className="input-field" value={form.immunizationNote} onChange={set('immunizationNote')} />
                    </div>
                    <div>
                      <label className="ds-label">Supplements</label>
                      <input className="input-field" value={form.supplementsAdvice} onChange={set('supplementsAdvice')} />
                    </div>
                    <div>
                      <label className="ds-label">Baby lab advice</label>
                      <textarea rows={2} className="input-field" value={form.babyLabAdvice} onChange={set('babyLabAdvice')} />
                    </div>
                  </div>
                </div>

                <div className="ds-section" style={{ borderColor: '#93c5fd', boxShadow: '0 0 0 1px #dbeafe' }}>
                  <h4 className="ds-section__head">Custom instructions (replaces Tamil text)</h4>
                  <div className="ds-section__body">
                    <textarea rows={6} className="input-field" value={form.customInstructions} onChange={set('customInstructions')} placeholder="Type or paste any additional instructions for the patient / relatives here…" />
                    <p className="ds-hint">This free-text box prints where the Tamil paragraphs appeared on the paper form.</p>
                  </div>
                </div>

                <div className="ds-section">
                  <h4 className="ds-section__head">Follow-up &amp; emergency</h4>
                  <div className="ds-section__body space-y-2">
                    <div>
                      <label className="ds-label">Review appointment</label>
                      <textarea rows={2} className="input-field" value={form.reviewAppointment} onChange={set('reviewAppointment')} placeholder="Review with DR.… after 8 days in OPD. 17.07.2026 at 10:30am" />
                    </div>
                    <div>
                      <label className="ds-label">Emergency contact</label>
                      <input className="input-field" value={form.emergencyContact} onChange={set('emergencyContact')} placeholder="For emergency and for further appointment call …" />
                    </div>
                  </div>
                </div>

                <button type="button" onClick={() => setShowMore((v) => !v)} className="text-xs text-blue-600 hover:underline font-medium">
                  {showMore ? 'Hide' : 'Show'} admin flags (DAMA / refer / death) &amp; maternity page-2 form
                </button>

                {showMore && (
                  <div className="space-y-4 border-t border-gray-100 dark:border-gray-700 pt-4">
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

                    <div className="border-t border-gray-100 pt-4 space-y-3">
                      <h4 className="text-sm font-semibold">Optional maternity advice page (PDF page 2)</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium mb-1">Condition of mother at discharge</label>
                          <select className="input-field" value={ma.motherCondition} onChange={setMaternity('motherCondition')}>
                            <option value="">Select…</option>
                            {MOTHER_CONDITIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1">Condition of baby at discharge</label>
                          <select className="input-field" value={ma.babyCondition} onChange={setMaternity('babyCondition')}>
                            <option value="">Select…</option>
                            {BABY_CONDITIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Advice on discharge / Referral</label>
                        <div className="grid grid-cols-1 gap-1.5 max-h-40 overflow-y-auto border border-gray-100 rounded-lg p-3">
                          {ADVICE_ITEMS.map((item, idx) => (
                            <label key={item} className="flex items-start gap-2 text-xs cursor-pointer">
                              <input type="checkbox" className="mt-0.5" checked={adviceChecked.has(idx)} onChange={() => toggleAdvice(idx)} />
                              <span>{item}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Review date (page 2)</label>
                        <input type="date" className="input-field" value={ma.reviewDate} onChange={setMaternity('reviewDate')} />
                      </div>
                    </div>
                  </div>
                )}

                {isDischarged && canEditSummary && (
                  <div>
                    <label className="block text-sm font-medium mb-1">Reason for this change *</label>
                    <input className="input-field" value={editReason} onChange={(e) => setEditReason(e.target.value)} placeholder="Why is the discharge summary being changed?" />
                  </div>
                )}
                <div className="flex flex-wrap gap-3 pt-2 sticky bottom-0 bg-white dark:bg-gray-800 py-2">
                  <button type="button" onClick={handleReset} className="btn-secondary" disabled={!canEditSummary}><RotateCcw size={15} /> Reset</button>
                  {canEditSummary && (
                    <>
                      <button type="button" disabled={saveDraftMut.isPending} onClick={handleSaveDraft} className="btn-secondary"><Save size={15} /> {isDischarged ? 'Save changes' : 'Save Draft'}</button>
                      <button type="button" disabled={saveDraftMut.isPending} onClick={handleSaveAndPreview} className="btn-primary flex-1 justify-center"><Eye size={15} /> Save &amp; Preview</button>
                    </>
                  )}
                </div>
              </div>

              {/* Live preview — 3 paper pages */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-blue-100 dark:border-gray-700 p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900 dark:text-white">Discharge Summary Preview</h3>
                    <p className="text-xs text-slate-500">Print and download use this same PDF template</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={handlePrint} className="btn-secondary text-xs py-1.5 px-3"><Printer size={13} /> Print</button>
                    <button type="button" onClick={handleDownloadPdf} className="btn-secondary text-xs py-1.5 px-3"><Download size={13} /> Download PDF</button>
                  </div>
                </div>

                {pdfPreviewUrl ? (
                  <iframe title="Discharge summary PDF" src={pdfPreviewUrl} className="w-full h-[70vh] rounded-xl border border-slate-200" />
                ) : (
                <div className="max-h-[70vh] overflow-y-auto overflow-x-hidden ds-preview-stack">
                  <article className="ds-preview-sheet">
                    <span className="ds-preview-sheet__label">Live preview</span>
                    {allergyLine && <p className="ds-preview-allergy">{allergyLine}</p>}

                    <div className="text-center">
                      <h1>{branding.hospitalName || 'Hospital'}</h1>
                      {branding.address && <p className="text-[10.5px] mt-0.5 text-slate-600">{branding.address}</p>}
                      <p className="ds-title">Discharge Summary</p>
                    </div>

                    <table className="ds-info-table">
                      <tbody>
                        {[
                          ['PATIENT NAME', (patient.name || '').toUpperCase(), 'D.O.A', fmtPaperDT(admission.admissionDate)],
                          ['AGE/SEX', `${patient.age != null ? `${patient.age} YRS` : ''} / ${(patient.gender || '').toUpperCase()}`, 'D.O.DELIVERY', form.deliveryDate ? fmtPaperDT(form.deliveryDate) : '—'],
                          ['IP.NO', admission.admissionNumber || '—', 'D.O.D', admission.dischargeDate ? fmtPaperDate(admission.dischargeDate) : '—'],
                          ['CONSULTANT', admission.doctor?.name ? `DR.${admission.doctor.name.replace(/^dr\.?\s*/i, '').toUpperCase()}` : '—', 'DEPARTMENT', (admission.department?.name || '').toUpperCase()],
                        ].map(([l1, v1, l2, v2]) => (
                          <tr key={l1}>
                            <td><strong>{l1}:</strong> {v1}</td>
                            <td><strong>{l2}:</strong> {v2}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div className="ds-preview-addr">
                      <div>
                        <p className="font-bold underline">ADDRESS:</p>
                        <p className="ds-block uppercase">{addressDisplay || '—'}</p>
                      </div>
                      <div className="text-right font-bold whitespace-nowrap">
                        {patient.patientId && <p>UHID - {patient.patientId}</p>}
                        {rchDisplay && <p>RCH ID - {rchDisplay}</p>}
                      </div>
                    </div>

                    <p className="ds-ul-head">Diagnosis:</p>
                    <p className="ds-block">{form.diagnosis || '—'}</p>
                    {(form.obstetricHistory?.rmp || form.obstetricHistory?.lmp || form.obstetricHistory?.edd) && (
                      <>
                        <p className="ds-ul-head">Menstrual History:</p>
                        <p className="ds-block">
                          {form.obstetricHistory?.rmp && <>RMP, {form.obstetricHistory.rmp}<br /></>}
                          {(form.obstetricHistory?.lmp || form.obstetricHistory?.edd) && (
                            <>LMP - {fmtDotDate(form.obstetricHistory.lmp) || '—'}&nbsp;&nbsp;&nbsp;EDD - {fmtDotDate(form.obstetricHistory.edd) || '—'}</>
                          )}
                        </p>
                      </>
                    )}
                    <p className="ds-ul-head">Chief Complaints:</p>
                    <p className="ds-block">{form.chiefComplaints || '—'}</p>
                    <p className="ds-ul-head">Past History:</p>
                    <p className="ds-block">{form.pastHistory || 'Nil relevant'}</p>
                    <p className="ds-ul-head">Physical Examination:</p>
                    <p className="ds-block">{form.physicalExamination || '—'}</p>

                    <p className="ds-ul-head">Laboratory Investigation Reports:</p>
                    <table className="ds-info-table" style={{ fontSize: 11 }}>
                      <tbody>
                        {Array.from({ length: Math.max(1, Math.ceil((labRows.filter((r) => r.name || r.report).length || 1) / 2)) }).map((_, i) => {
                          const filled = labRows.filter((r) => r.name || r.report);
                          const a = filled[i * 2] || { name: '—', report: '—' };
                          const b = filled[i * 2 + 1];
                          return (
                            <tr key={i}>
                              <td><strong>NAME:</strong> {a.name} &nbsp; <strong>REPORT:</strong> {a.report}</td>
                              <td>{b ? <><strong>NAME:</strong> {b.name} &nbsp; <strong>REPORT:</strong> {b.report}</> : ''}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    <p className="ds-ul-head">Echo / Imaging:</p>
                    <p className="ds-block">{form.echoReport || '—'}</p>
                    {form.investigationsNote && <p className="ds-block italic">{form.investigationsNote}</p>}

                    <p className="ds-ul-head">Course of Treatment in Hospital:</p>
                    <p className="ds-block">{form.hospitalCourse || '—'}</p>
                    <p className="ds-ul-head">Baby Details:</p>
                    <p className="ds-block">{form.babyDetails || '—'}</p>
                    <p className="ds-ul-head">Postnatal Period:</p>
                    {form.postnatalPeriod && <p className="ds-block">{form.postnatalPeriod}</p>}
                    <p className="ds-block">{form.hospitalMedications || '—'}</p>
                    <p className="ds-ul-head">Condition on Discharge:</p>
                    <p className="ds-block">{form.conditionOnDischarge || '—'}</p>

                    {form.pvStatus && <p className="ds-block">{form.pvStatus}</p>}

                    <p className="ds-ul-head">Further Advice on Discharge:</p>
                    <p className="ds-block">{form.medicationsOnDischarge || '—'}</p>
                    {form.motherWarnings && <p className="ds-block">{form.motherWarnings}</p>}
                    {form.dietaryAdvice && <p className="ds-block">{form.dietaryAdvice}</p>}
                    {form.babyWarnings && <p className="ds-block">{form.babyWarnings}</p>}
                    {form.immunizationNote && <p className="ds-block font-bold">{form.immunizationNote}</p>}
                    {form.supplementsAdvice && <p className="ds-block font-bold uppercase">{form.supplementsAdvice}</p>}
                    {form.babyLabAdvice && <p className="ds-block">{form.babyLabAdvice}</p>}

                    <p className="ds-ul-head">Additional Instructions:</p>
                    <p className="ds-block">{form.customInstructions || '—'}</p>

                    {form.reviewAppointment && <p className="ds-block">• {form.reviewAppointment}</p>}
                    {form.emergencyContact && <p className="ds-block">• {form.emergencyContact}</p>}

                    <div className="ds-preview-sheet__footer">
                      <p>Date: {fmtPaperDate(admission.dischargeDate || new Date())}</p>
                      <div className="ds-preview-sheet__sig">
                        Consultant Signature
                        <p className="font-normal mt-0.5">Dr. {admission.doctor?.name || '—'}</p>
                        {admission.doctor?.specialization && <p className="font-normal text-[10px]">{admission.doctor.specialization}</p>}
                      </div>
                    </div>
                  </article>
                </div>
                )}
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