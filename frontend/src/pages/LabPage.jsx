import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { hasRole } from '../utils/roles';
import { Plus, Printer, FlaskConical, Clock, CheckCircle, Eye, ChevronDown } from 'lucide-react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import api from '../services/api';
import Modal from '../components/common/Modal';
import DataTable from '../components/common/DataTable';
import LabReportTemplate from '../components/lab/LabReportTemplate';
import TestMasterModal from '../components/lab/TestMasterModal';

// ─── Lab Profiles ─────────────────────────────────────────────────────────────
// Each lab has sub-tests with unit + normalRange pre-filled.
// Lab technician picks from the LAB_PROFILES dropdown.
const LAB_PROFILES = {
  'CBC (Complete Blood Count)': [
    { testName: 'WBC', unit: '10³/mm³', normalRange: '4.1 – 11.1' },
    { testName: 'LYM%', unit: '%', normalRange: '16.0 – 46.0' },
    { testName: 'MON%', unit: '%', normalRange: '2.3 – 8.5' },
    { testName: 'GRA%', unit: '%', normalRange: '48.7 – 81.2' },
    { testName: 'LYM#', unit: '10³/mm³', normalRange: '1.20 – 3.70' },
    { testName: 'MON#', unit: '10³/mm³', normalRange: '0.10 – 0.60' },
    { testName: 'GRA#', unit: '10³/mm³', normalRange: '2.30 – 8.20' },
    { testName: 'GLR', unit: '', normalRange: '' },
    { testName: 'RBC', unit: '10⁶/mm³', normalRange: '3.90 – 5.20' },
    { testName: 'HGB', unit: 'g/dl', normalRange: '12.0 – 15.1' },
    { testName: 'HCT', unit: '%', normalRange: '36.4 – 46.0' },
    { testName: 'MCV', unit: 'μm³', normalRange: '83 – 96' },
    { testName: 'MCH', unit: 'pg', normalRange: '26.4 – 32.3' },
    { testName: 'MCHC', unit: 'g/dl', normalRange: '31.8 – 34.2' },
    { testName: 'RDW-CV', unit: '%', normalRange: '11.9 – 14.4' },
    { testName: 'RDW-SD', unit: 'μm³', normalRange: '38 – 49' },
    { testName: 'PLT', unit: '10³/mm³', normalRange: '168 – 418' },
    { testName: 'MPV', unit: 'μm³', normalRange: '7.0 – 10.5' },
    { testName: 'PCT', unit: 'L %', normalRange: '0.150 – 0.500' },
    { testName: 'PDW', unit: '%', normalRange: '11.0 – 18.0' },
    { testName: 'P-LCC', unit: '10³/mm³', normalRange: '44 – 140' },
    { testName: 'P-LCR', unit: '%', normalRange: '18.0 – 50.0' },
  ],
  'LFT (Liver Function Test)': [
    { testName: 'Total Bilirubin', unit: 'mg/dL', normalRange: '0.2 – 1.2' },
    { testName: 'Direct Bilirubin', unit: 'mg/dL', normalRange: '0.0 – 0.3' },
    { testName: 'Indirect Bilirubin', unit: 'mg/dL', normalRange: '0.2 – 0.9' },
    { testName: 'SGOT (AST)', unit: 'U/L', normalRange: '10 – 40' },
    { testName: 'SGPT (ALT)', unit: 'U/L', normalRange: '7 – 56' },
    { testName: 'ALP', unit: 'U/L', normalRange: '44 – 147' },
    { testName: 'Total Protein', unit: 'g/dL', normalRange: '6.0 – 8.3' },
    { testName: 'Albumin', unit: 'g/dL', normalRange: '3.5 – 5.0' },
    { testName: 'Globulin', unit: 'g/dL', normalRange: '2.3 – 3.5' },
    { testName: 'A/G Ratio', unit: '', normalRange: '1.0 – 2.5' },
  ],
  'RFT (Renal Function Test)': [
    { testName: 'Blood Urea', unit: 'mg/dL', normalRange: '15 – 45' },
    { testName: 'Serum Creatinine', unit: 'mg/dL', normalRange: '0.6 – 1.2' },
    { testName: 'Uric Acid', unit: 'mg/dL', normalRange: '2.4 – 7.0' },
    { testName: 'Sodium (Na+)', unit: 'mEq/L', normalRange: '136 – 145' },
    { testName: 'Potassium (K+)', unit: 'mEq/L', normalRange: '3.5 – 5.0' },
    { testName: 'Chloride (Cl-)', unit: 'mEq/L', normalRange: '98 – 107' },
    { testName: 'Bicarbonate', unit: 'mEq/L', normalRange: '22 – 29' },
    { testName: 'BUN', unit: 'mg/dL', normalRange: '7 – 21' },
    { testName: 'eGFR', unit: 'mL/min/1.73m²', normalRange: '>60' },
  ],
  'Lipid Profile': [
    { testName: 'Total Cholesterol', unit: 'mg/dL', normalRange: '<200' },
    { testName: 'HDL Cholesterol', unit: 'mg/dL', normalRange: '>40' },
    { testName: 'LDL Cholesterol', unit: 'mg/dL', normalRange: '<100' },
    { testName: 'VLDL Cholesterol', unit: 'mg/dL', normalRange: '5 – 40' },
    { testName: 'Triglycerides', unit: 'mg/dL', normalRange: '<150' },
    { testName: 'Total/HDL Ratio', unit: '', normalRange: '<5.0' },
  ],
  'Blood Glucose': [
    { testName: 'Fasting Blood Glucose', unit: 'mg/dL', normalRange: '70 – 100' },
    { testName: 'Post Prandial (PP)', unit: 'mg/dL', normalRange: '<140' },
    { testName: 'Random Blood Glucose', unit: 'mg/dL', normalRange: '70 – 140' },
    { testName: 'HbA1c', unit: '%', normalRange: '4.0 – 5.6' },
  ],
  'Thyroid Profile': [
    { testName: 'T3 (Total)', unit: 'ng/dL', normalRange: '80 – 200' },
    { testName: 'T4 (Total)', unit: 'μg/dL', normalRange: '5.1 – 14.1' },
    { testName: 'TSH', unit: 'μIU/mL', normalRange: '0.4 – 4.0' },
    { testName: 'Free T3 (FT3)', unit: 'pg/mL', normalRange: '2.0 – 4.4' },
    { testName: 'Free T4 (FT4)', unit: 'ng/dL', normalRange: '0.8 – 1.8' },
  ],
  'Urine Routine': [
    { testName: 'Colour', unit: '', normalRange: 'Pale Yellow' },
    { testName: 'Appearance', unit: '', normalRange: 'Clear' },
    { testName: 'pH', unit: '', normalRange: '4.5 – 8.5' },
    { testName: 'Specific Gravity', unit: '', normalRange: '1.005 – 1.030' },
    { testName: 'Protein', unit: '', normalRange: 'Nil' },
    { testName: 'Glucose', unit: '', normalRange: 'Nil' },
    { testName: 'Ketones', unit: '', normalRange: 'Nil' },
    { testName: 'Blood', unit: '', normalRange: 'Nil' },
    { testName: 'Bilirubin', unit: '', normalRange: 'Nil' },
    { testName: 'Pus Cells (WBC)', unit: '/HPF', normalRange: '0 – 5' },
    { testName: 'RBC', unit: '/HPF', normalRange: '0 – 2' },
    { testName: 'Epithelial Cells', unit: '/HPF', normalRange: 'Few' },
    { testName: 'Casts', unit: '', normalRange: 'Nil' },
    { testName: 'Crystals', unit: '', normalRange: 'Nil' },
    { testName: 'Bacteria', unit: '', normalRange: 'Nil' },
  ],
  'Bio Chemistry': [
    { testName: 'Calcium', unit: 'mg/dL', normalRange: '8.5 – 10.5' },
    { testName: 'Phosphorus', unit: 'mg/dL', normalRange: '2.5 – 4.5' },
    { testName: 'Magnesium', unit: 'mEq/L', normalRange: '1.5 – 2.5' },
    { testName: 'Iron (Serum)', unit: 'μg/dL', normalRange: '60 – 170' },
    { testName: 'TIBC', unit: 'μg/dL', normalRange: '250 – 370' },
    { testName: 'Ferritin', unit: 'ng/mL', normalRange: '12 – 300' },
    { testName: 'Vitamin B12', unit: 'pg/mL', normalRange: '200 – 900' },
    { testName: 'Vitamin D (25-OH)', unit: 'ng/mL', normalRange: '30 – 100' },
    { testName: 'CRP (C-Reactive Protein)', unit: 'mg/L', normalRange: '<5' },
    { testName: 'ESR', unit: 'mm/hr', normalRange: '0 – 20' },
  ],
  'ECG': [
    { testName: 'Heart Rate', unit: 'bpm', normalRange: '60 – 100' },
    { testName: 'PR Interval', unit: 'ms', normalRange: '120 – 200' },
    { testName: 'QRS Duration', unit: 'ms', normalRange: '60 – 100' },
    { testName: 'QT Interval', unit: 'ms', normalRange: '350 – 440' },
    { testName: 'QTc', unit: 'ms', normalRange: '<450' },
    { testName: 'Rhythm', unit: '', normalRange: 'Normal Sinus Rhythm' },
    { testName: 'Axis', unit: '', normalRange: '-30° to +90°' },
  ],
  'Custom / Manual': [],
};

const LAB_PROFILE_OPTIONS = Object.keys(LAB_PROFILES);

// ─── Auto-flag helper ─────────────────────────────────────────────────────────
// Compares an entered value against its normal range string and returns the
// matching flag automatically (Low / High / Normal). Handles the two range
// formats used across LAB_PROFILES:
//   "4.1 – 11.1"  (between min and max, dash can be -, – or —)
//   "<200" / "> 40" (upper-only / lower-only bounds)
// Returns null if the range/value can't be parsed numerically (e.g. text-based
// ranges like "Clear", "Nil", "Pale Yellow") — those stay on manual selection
// via the Flag dropdown, since there's nothing numeric to compare.
const autoFlagFromRange = (value, normalRange) => {
  if (value === '' || value === null || value === undefined || !normalRange) return null;
  const val = parseFloat(value);
  if (isNaN(val)) return null;

  const range = normalRange.trim();

  // "4.1 – 11.1" / "4.1 - 11.1" / "70 – 100"
  const between = range.match(/^([\d.]+)\s*[-–—]\s*([\d.]+)$/);
  if (between) {
    const min = parseFloat(between[1]);
    const max = parseFloat(between[2]);
    if (val < min) return 'Low';
    if (val > max) return 'High';
    return 'Normal';
  }

  // "<200" / "< 200"
  const less = range.match(/^<\s*([\d.]+)$/);
  if (less) return val >= parseFloat(less[1]) ? 'High' : 'Normal';

  // ">40" / "> 40"
  const greater = range.match(/^>\s*([\d.]+)$/);
  if (greater) return val <= parseFloat(greater[1]) ? 'Low' : 'Normal';

  return null; // unparseable range → leave to manual dropdown
};

// ─── Test metadata fallback lookup ────────────────────────────────────────────
// Flat lookup: testName -> { unit, normalRange } built from ALL profiles combined.
// Used whenever a lab order's stored testProfile doesn't exactly match a
// LAB_PROFILES key (older records, trimmed/renamed profiles, manual edits, etc.)
// so Unit and Normal Range still auto-fill instead of coming up blank.
const TEST_META_LOOKUP = Object.values(LAB_PROFILES)
  .flat()
  .reduce((map, t) => {
    if (!map[t.testName]) map[t.testName] = { unit: t.unit, normalRange: t.normalRange };
    return map;
  }, {});

const getTestMeta = (testName, profileFields) => {
  // 1st: try the test's own profile (correct source of truth)
  const inProfile = profileFields.find(p => p.testName === testName);
  if (inProfile && (inProfile.unit || inProfile.normalRange)) return inProfile;
  // 2nd: fallback — search every profile for this test name
  return TEST_META_LOOKUP[testName] || { unit: '', normalRange: '' };
};

// ─── IP Medicine Viewing Component ────────────────────────────────────────────
function IPMedicineView({ admission }) {
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ['ipMeds', admission?._id],
    queryFn: () => api.get(`/ip/${admission._id}`).then(r => r.data.data),
    enabled: open && !!admission?._id,
  });

  const meds = data?.prescriptions?.flatMap(p => p.medicines || []) || [];

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
      >
        <Eye size={14} /> {open ? 'Hide' : 'View'} IP Medicines <ChevronDown size={12} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
      </button>
      {open && (
        <div className="mt-2 rounded-xl border border-blue-100 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/30 overflow-x-auto">
          {meds.length === 0 ? (
            <p className="text-xs text-gray-400 px-4 py-3">No medicines prescribed yet.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left border-b border-blue-200 dark:border-blue-800">
                  <th className="px-3 py-2 text-blue-700 dark:text-blue-300 font-semibold">Medicine</th>
                  <th className="px-3 py-2 text-blue-700 dark:text-blue-300 font-semibold">Dosage</th>
                  <th className="px-3 py-2 text-blue-700 dark:text-blue-300 font-semibold">Frequency</th>
                  <th className="px-3 py-2 text-blue-700 dark:text-blue-300 font-semibold">Duration</th>
                  <th className="px-3 py-2 text-blue-700 dark:text-blue-300 font-semibold">Timing</th>
                  <th className="px-3 py-2 text-blue-700 dark:text-blue-300 font-semibold">Route</th>
                </tr>
              </thead>
              <tbody>
                {meds.map((m, i) => (
                  <tr key={i} className="border-b border-blue-100 dark:border-blue-900 last:border-0 hover:bg-blue-100 dark:hover:bg-blue-900/30">
                    <td className="px-3 py-2 font-medium text-gray-800 dark:text-gray-100">{m.name}</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{m.dosage || '-'}</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{m.frequency || '-'}</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{m.duration ? `${m.duration} days` : '-'}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex gap-1 flex-wrap">
                        {m.timing?.map(t => (
                          <span key={t} className="bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200 rounded px-1.5 py-0.5 text-xs">{t}</span>
                        )) || '-'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{m.route || 'Oral'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function LabPage() {
  const [searchParams] = useSearchParams();
  const { user } = useSelector((s) => s.auth);
  const canCreateOrders = hasRole(user?.role, ['Super Admin', 'Admin', 'Doctor', 'Nurse']);
  const isLabTech = hasRole(user?.role, ['Super Admin', 'Admin', 'Lab Technician']);
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [showResults, setShowResults] = useState(null);
  const [showViewResult, setShowViewResult] = useState(null);
  const [printData, setPrintData] = useState(null); // { branding, labTest } for LabReportTemplate print portal
  const [patientSearch, setPatientSearch] = useState('');
  const [patients, setPatients] = useState([]);
  const [selectedProfile, setSelectedProfile] = useState('');
  const [tab, setTab] = useState(searchParams.get('tab') === 'reports' ? 'reports' : 'orders');
  const qc = useQueryClient();

  // selected IP admission for medicine viewing
  const [selectedAdmission, setSelectedAdmission] = useState(null);

  const { register, handleSubmit, watch, setValue, reset } = useForm({
    defaultValues: { sampleType: 'blood', priority: 'routine', notes: '', opRegistration: '' },
  });

  useEffect(() => {
    const urlTab = searchParams.get('tab');
    if (urlTab === 'reports') setTab('reports');
    else if (urlTab === 'orders') setTab('orders');
  }, [searchParams]);

  // Prefill create-order modal when opened from OP queue (?patient=&op=)
  useEffect(() => {
    const patientId = searchParams.get('patient');
    const opId = searchParams.get('op');
    if (!patientId || !canCreateOrders) return;

    let cancelled = false;
    (async () => {
      try {
        const r = await api.get(`/patients/${patientId}`);
        if (cancelled) return;
        const p = r.data.data;
        setShowCreate(true);
        setValue('patient', p._id);
        if (opId) setValue('opRegistration', opId);
        setPatientSearch(`${p.name} (${p.patientId})`);
        if (p.activeAdmission) setSelectedAdmission(p.activeAdmission);
      } catch {
        /* ignore — user can still search manually */
      }
    })();

    return () => { cancelled = true; };
  }, [searchParams, canCreateOrders, setValue]);

  const { data, isLoading } = useQuery({
    queryKey: ['labTests', page],
    queryFn: () => api.get(`/lab?page=${page}&limit=20&sort=-createdAt`).then(r => r.data),
  });

  const { data: dashData } = useQuery({
    queryKey: ['labDash'],
    queryFn: () => api.get('/lab/dashboard').then(r => r.data.data),
  });

  const { data: brandingData } = useQuery({
    queryKey: ['branding'],
    queryFn: () => api.get('/branding').then(r => r.data.data),
    staleTime: 1000 * 60 * 5,
  });

  // Test Master (price catalog) - e.g. CBC = ₹500, LFT = ₹700 - configured once,
  // used to auto-fill the price the moment a lab technician (or anyone) picks a
  // profile below, instead of typing it in by hand every time.
  const canManageTestPrices = hasRole(user?.role, ['Super Admin', 'Admin', 'Lab Technician']);
  const [showTestMaster, setShowTestMaster] = useState(false);
  const { data: testMasterList = [] } = useQuery({
    queryKey: ['testMaster'],
    queryFn: () => api.get('/test-master').then(r => r.data.data),
  });
  const findMasterPrice = (profileName) =>
    testMasterList.find((t) => t.name.trim().toLowerCase() === String(profileName).trim().toLowerCase())?.price;

  const [testFields, setTestFields] = useState([]);
  const [resultFields, setResultFields] = useState([]);
  const { register: resReg, handleSubmit: resSubmit, reset: resReset } = useForm({
    defaultValues: { remarks: '' },
  });

  // Patient search
  useEffect(() => {
    if (patientSearch.length >= 2) {
      api.get(`/patients/search?q=${patientSearch}`).then(r => setPatients(r.data.data || []));
    } else {
      setPatients([]);
    }
  }, [patientSearch]);

  // When lab profile selected, auto-fill result fields template AND the price
  // from the Test Master (falls back to 0 / manual entry if no master price is set).
  const [profilePrice, setProfilePrice] = useState(0);
  const handleProfileSelect = (profileName) => {
    setSelectedProfile(profileName);
    const fields = LAB_PROFILES[profileName] || [];
    setTestFields(fields.map(f => ({ testName: f.testName, price: 0 })));
    const masterPrice = findMasterPrice(profileName);
    setProfilePrice(masterPrice !== undefined ? masterPrice : 0);
  };

  // Mutations
  const createMut = useMutation({
    mutationFn: (d) => api.post('/lab', {
      ...d,
      tests: testFields.filter(t => t.testName).map(t => ({ testName: t.testName, price: Number(t.price) || 0 })),
      testProfile: selectedProfile,
      totalAmount: selectedProfile === 'Custom / Manual'
        ? testFields.reduce((s, t) => s + (Number(t.price) || 0), 0)
        : Number(profilePrice) || 0,
      opRegistration: d.opRegistration || undefined,
    }),
    onSuccess: async (res, vars) => {
      toast.success('Lab test order created!');
      if (vars?.opRegistration) {
        try {
          await api.put(`/op/${vars.opRegistration}/status`, { status: 'sent_to_lab' });
        } catch { /* non-blocking */ }
      }
      qc.invalidateQueries(['labTests']);
      qc.invalidateQueries(['labDash']);
      qc.invalidateQueries(['opQueue']);
      setShowCreate(false);
      reset();
      setTestFields([]);
      setSelectedProfile('');
      setPatientSearch('');
      setPatients([]);
      setSelectedAdmission(null);
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Failed to create'),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }) => api.put(`/lab/${id}/status`, { status }),
    onSuccess: () => {
      qc.invalidateQueries(['labTests']);
      qc.invalidateQueries(['labDash']);
    },
  });

  const resultsMut = useMutation({
    mutationFn: ({ id, data }) => api.put(`/lab/${id}/results`, data),
    onSuccess: () => {
      toast.success('Results saved!');
      qc.invalidateQueries(['labTests']);
      qc.invalidateQueries(['labDash']);
      setShowResults(null);
      resReset();
      setResultFields([]);
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Failed to save'),
  });

  // Print always renders the SAME LabReportTemplate component that the View
  // modal shows on screen — one format, one source of truth, whether it's
  // opened right after the order is created or clicked on later by a doctor.
  const handlePrint = async (test) => {
    try {
      const full = await api.get(`/lab/${test._id}`).then(r => r.data.data);
      setPrintData({ branding: brandingData, labTest: full });
    } catch {
      toast.error('Could not load report for printing');
    }
  };

  // Fires window.print() once the hidden LabReportTemplate has rendered,
  // and cleans the portal up afterwards so it doesn't linger in the DOM.
  useEffect(() => {
    if (!printData) return undefined;
    const timer = setTimeout(() => window.print(), 150);
    const handleAfterPrint = () => setPrintData(null);
    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, [printData]);

  const statusColors = {
    pending: 'badge-gray',
    sample_collected: 'badge-yellow',
    processing: 'badge-blue',
    completed: 'badge-green',
    cancelled: 'badge-red',
  };

  const statusLabel = (s) => s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  const columns = [
    {
      key: 'uhid',
      header: 'UHID',
      render: r => (
        <span className="font-mono font-semibold text-blue-700 dark:text-blue-400" title="Patient ID from registration">
          {r.patient?.patientId || '—'}
        </span>
      ),
    },
    {
      key: 'labNumber',
      header: 'Lab No',
      render: r => <span className="font-mono text-sm text-slate-600 dark:text-slate-300">{r.labNumber}</span>,
    },
    {
      key: 'patient',
      header: 'Patient',
      render: r => (
        <div>
          <p className="font-medium text-gray-900 dark:text-white">{r.patient?.name}</p>
          <p className="text-xs text-gray-400">{r.patient?.age}yr · {r.patient?.gender}</p>
        </div>
      ),
    },
    {
      key: 'tests',
      header: 'Profile / Tests',
      render: r => (
        <div>
          {r.testProfile && <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">{r.testProfile}</p>}
          <p className="text-xs text-gray-500 dark:text-gray-400">{r.tests?.length} test{r.tests?.length !== 1 ? 's' : ''}</p>
        </div>
      ),
    },
    {
      key: 'priority',
      header: 'Priority',
      render: r => (
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.priority === 'urgent' || r.priority === 'stat' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
          {r.priority}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: r => <span className={statusColors[r.status]}>{statusLabel(r.status)}</span>,
    },
    {
      key: 'createdAt',
      header: 'Date',
      render: r => <span className="text-xs text-gray-500">{new Date(r.createdAt).toLocaleDateString('en-IN')}</span>,
    },
    {
      key: 'actions',
      header: '',
      render: r => (
        <div className="flex gap-2 items-center">
          {r.status === 'pending' && isLabTech && (
            <button onClick={e => { e.stopPropagation(); statusMut.mutate({ id: r._id, status: 'sample_collected' }); }}
              className="text-xs bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 px-2.5 py-1 rounded-lg hover:bg-yellow-200 transition-colors font-medium">
              Collect Sample
            </button>
          )}
          {r.status === 'sample_collected' && isLabTech && (
            <button onClick={e => { e.stopPropagation(); statusMut.mutate({ id: r._id, status: 'processing' }); }}
              className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-2.5 py-1 rounded-lg hover:bg-blue-200 transition-colors font-medium">
              Start Processing
            </button>
          )}
          {r.status === 'processing' && isLabTech && (
            <button onClick={e => {
              e.stopPropagation();
              const profile = r.testProfile;
              const profileFields = LAB_PROFILES[profile] || [];
              // getTestMeta falls back to searching ALL profiles by test name
              // whenever the order's saved testProfile doesn't exactly match a
              // LAB_PROFILES key (older orders, renamed profiles, etc.) — this
              // is what fixes Unit/Normal Range showing up blank.
              const fields = r.tests?.map(t => {
                const meta = getTestMeta(t.testName, profileFields);
                return { testName: t.testName, value: '', unit: meta.unit || '', normalRange: meta.normalRange || '', flag: 'Normal' };
              }) || [];
              setResultFields(fields);
              setShowResults(r);
            }}
              className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2.5 py-1 rounded-lg hover:bg-green-200 transition-colors font-medium">
              Enter Results
            </button>
          )}
          {r.status === 'completed' && (
            <div className="flex gap-1">
              <button onClick={async (e) => {
                e.stopPropagation();
                try {
                  const full = await api.get(`/lab/${r._id}`).then(res => res.data.data);
                  setShowViewResult({ branding: brandingData, labTest: full });
                } catch {
                  toast.error('Could not load report');
                }
              }}
                className="text-xs bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 px-2.5 py-1 rounded-lg hover:bg-indigo-200 transition-colors font-medium flex items-center gap-1">
                <Eye size={11} /> View
              </button>
              <button onClick={e => { e.stopPropagation(); handlePrint(r); }}
                className="text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 px-2.5 py-1 rounded-lg hover:bg-purple-200 transition-colors font-medium flex items-center gap-1">
                <Printer size={11} /> Print
              </button>
            </div>
          )}
        </div>
      ),
    },
  ];

  const tableData = tab === 'reports'
    ? (data?.data || []).filter(r => r.status === 'completed')
    : (data?.data || []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Laboratory</h1>
        {tab === 'orders' && canCreateOrders && (
          <button type="button" onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> New Lab Order
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700">
        {[{ id: 'orders', label: 'Lab Orders' }, { id: 'reports', label: 'Lab Reports' }].map(({ id, label }) => (
          <button key={id} type="button" onClick={() => setTab(id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Dashboard Stats */}
      {dashData && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Today's Tests", value: dashData.todayTests, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20' },
            { label: 'Pending', value: dashData.pending, color: 'text-yellow-600', bg: 'bg-yellow-50 dark:bg-yellow-900/20' },
            { label: 'Completed Today', value: dashData.completed, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/20' },
            { label: 'Urgent', value: dashData.urgent, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-900/20' },
          ].map(s => (
            <div key={s.label} className={`kpi-card text-center ${s.bg} rounded-2xl p-4`}>
              <p className={`text-3xl font-bold ${s.color}`}>{s.value ?? '–'}</p>
              <p className="text-sm text-gray-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
        <DataTable columns={columns} data={tableData} loading={isLoading} page={page} pages={data?.pages || 1} onPageChange={setPage} />
      </div>

      {/* ── CREATE LAB ORDER MODAL ── */}
      <Modal isOpen={showCreate} onClose={() => { setShowCreate(false); reset(); setTestFields([]); setSelectedProfile(''); setProfilePrice(0); setPatientSearch(''); setPatients([]); setSelectedAdmission(null); }} title="New Lab Test Order" size="xl">
        <form onSubmit={handleSubmit(d => createMut.mutate(d))} className="p-6 space-y-5">

          {/* Patient Search */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Patient *</label>
            <input type="text" placeholder="Search by name or patient ID…" value={patientSearch}
              onChange={e => setPatientSearch(e.target.value)} className="input-field" />
            {patients.length > 0 && (
              <div className="mt-1 border border-gray-200 dark:border-gray-600 rounded-xl shadow-lg overflow-hidden z-10 bg-white dark:bg-gray-800">
                {patients.map(p => (
                  <button key={p._id} type="button"
                    onClick={() => {
                      setValue('patient', p._id);
                      setPatientSearch(`${p.name} (${p.patientId})`);
                      setPatients([]);
                      // If IP patient, set admission for medicine viewing
                      if (p.activeAdmission) setSelectedAdmission(p.activeAdmission);
                    }}
                    className="w-full text-left px-4 py-2.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-sm border-b border-gray-100 dark:border-gray-700 last:border-0 flex justify-between items-center">
                    <span>{p.name} — <span className="text-gray-400">{p.patientId}</span></span>
                    {p.activeAdmission && <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded">IP</span>}
                  </button>
                ))}
              </div>
            )}
            <input type="hidden" {...register('patient', { required: true })} />
            <input type="hidden" {...register('opRegistration')} />
          </div>

          {/* IP Medicine Viewer */}
          {selectedAdmission && <IPMedicineView admission={selectedAdmission} />}

          {/* Lab Profile Dropdown */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">Lab Profile / Type *</label>
              {canManageTestPrices && (
                <button type="button" onClick={() => setShowTestMaster(true)}
                  className="text-xs text-blue-600 font-medium hover:underline">
                  Manage Test Prices
                </button>
              )}
            </div>
            <select
              value={selectedProfile}
              onChange={e => handleProfileSelect(e.target.value)}
              className="input-field"
              required
            >
              <option value="">— Select Lab Type —</option>
              {LAB_PROFILE_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          {/* Package price - auto-filled from the Test Master (e.g. CBC = ₹500). Editable in case of a discount/special case. */}
          {selectedProfile && selectedProfile !== 'Custom / Manual' && (
            <div className="flex items-center gap-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl px-4 py-3">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex-1">
                {findMasterPrice(selectedProfile) !== undefined
                  ? `Price for ${selectedProfile} (from Test Master):`
                  : `No master price set for ${selectedProfile} — enter manually:`}
              </span>
              <div className="flex items-center gap-1">
                <span className="text-sm text-gray-500">₹</span>
                <input type="number" min="0" step="0.01" value={profilePrice}
                  onChange={e => setProfilePrice(e.target.value)}
                  className="w-28 text-right font-semibold border border-blue-200 dark:border-blue-700 rounded-lg px-2 py-1 text-sm bg-white dark:bg-gray-800" />
              </div>
            </div>
          )}

          {/* Tests Preview */}
          {testFields.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  {selectedProfile === 'Custom / Manual'
                    ? `Tests (${testFields.length}) — Edit names or price if needed`
                    : `Result parameters (${testFields.length}) — filled in after the sample is tested`}
                </label>
                {selectedProfile === 'Custom / Manual' && (
                  <button type="button" onClick={() => setTestFields([...testFields, { testName: '', price: 0 }])}
                    className="text-xs text-blue-600 font-medium flex items-center gap-1 hover:underline">
                    <Plus size={12} /> Add Row
                  </button>
                )}
              </div>
              <div className="border border-gray-200 dark:border-gray-600 rounded-xl overflow-hidden">
                <div className="grid grid-cols-12 gap-0 bg-gray-50 dark:bg-gray-700 px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
                  <span className={selectedProfile === 'Custom / Manual' ? 'col-span-8' : 'col-span-11'}>Test Name</span>
                  {selectedProfile === 'Custom / Manual' && <span className="col-span-3">Price (₹)</span>}
                  <span className="col-span-1"></span>
                </div>
                <div className="max-h-52 overflow-y-auto">
                  {testFields.map((t, i) => (
                    <div key={i} className="grid grid-cols-12 gap-0 border-t border-gray-100 dark:border-gray-700 items-center">
                      <input className={`px-3 py-1.5 text-sm bg-transparent border-r border-gray-100 dark:border-gray-700 focus:bg-blue-50 dark:focus:bg-blue-900/20 outline-none ${selectedProfile === 'Custom / Manual' ? 'col-span-8' : 'col-span-11'}`}
                        value={t.testName} placeholder="Test name"
                        readOnly={selectedProfile !== 'Custom / Manual'}
                        onChange={e => setTestFields(testFields.map((f, fi) => fi === i ? { ...f, testName: e.target.value } : f))} />
                      {selectedProfile === 'Custom / Manual' && (
                        <input type="number" className="col-span-3 px-3 py-1.5 text-sm bg-transparent border-r border-gray-100 dark:border-gray-700 focus:bg-blue-50 dark:focus:bg-blue-900/20 outline-none"
                          placeholder="0" value={t.price}
                          onChange={e => setTestFields(testFields.map((f, fi) => fi === i ? { ...f, price: Number(e.target.value) } : f))} />
                      )}
                      <div className="col-span-1 flex justify-center">
                        {selectedProfile === 'Custom / Manual' && testFields.length > 1 && (
                          <button type="button" onClick={() => setTestFields(testFields.filter((_, fi) => fi !== i))} className="text-red-400 hover:text-red-600 text-xs px-1">✕</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {selectedProfile === 'Custom / Manual' && (
                  <div className="border-t border-gray-200 dark:border-gray-700 px-3 py-2 text-xs text-right font-semibold text-gray-700 dark:text-gray-300">
                    Total: ₹{testFields.reduce((s, t) => s + (Number(t.price) || 0), 0).toFixed(2)}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Sample + Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Sample Type</label>
              <select {...register('sampleType')} className="input-field">
                {['blood', 'urine', 'stool', 'swab', 'sputum', 'tissue', 'other'].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Priority</label>
              <select {...register('priority')} className="input-field">
                <option value="routine">Routine</option>
                <option value="urgent">Urgent</option>
                <option value="stat">STAT</option>
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Notes (optional)</label>
            <textarea {...register('notes')} className="input-field" rows={2} placeholder="Clinical notes, relevant history…" />
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
            <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={createMut.isPending || !selectedProfile || testFields.length === 0} className="btn-primary flex items-center gap-2">
              <FlaskConical size={16} />{createMut.isPending ? 'Creating…' : 'Create Lab Order'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── ENTER RESULTS MODAL ──
          Column order matches the printed report format: Test Name → Result →
          Reference → Units → Flag. Result is the ONLY manual entry field.
          Reference (normal range) and Units are auto-filled (read-only, grey
          background) from LAB_PROFILES / getTestMeta fallback.
          As soon as a Result is typed, it's compared against Reference and
          the Flag + row highlight update automatically:
            - out of range        → red text/row, Flag = High/Critical
            - below range         → blue text/row, Flag = Low
            - within range        → normal text, Flag = Normal
          Text-only ranges (e.g. "Nil", "Clear") can't be auto-compared, so the
          Flag dropdown stays editable for manual override on those rows. */}
      <Modal isOpen={!!showResults} onClose={() => { setShowResults(null); resReset(); setResultFields([]); }} title={`Enter Results — ${showResults?.labNumber}`} size="2xl">
        <form onSubmit={resSubmit(d => resultsMut.mutate({ id: showResults._id, data: { results: resultFields, remarks: d.remarks } }))} className="p-6 space-y-4">
          {showResults?.testProfile && (
            <div className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 px-3 py-1.5 rounded-lg inline-block">
              Profile: {showResults.testProfile}
            </div>
          )}
          <div className="border border-gray-200 dark:border-gray-600 rounded-xl overflow-hidden">
            <div className="grid grid-cols-12 gap-0 bg-gray-50 dark:bg-gray-700 px-3 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">
              <span className="col-span-3">Test Name</span>
              <span className="col-span-2">Result *</span>
              <span className="col-span-3">Reference</span>
              <span className="col-span-2">Units</span>
              <span className="col-span-2">Flag</span>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {resultFields.map((r, i) => (
                <div key={i} className={`grid grid-cols-12 border-t border-gray-100 dark:border-gray-700 items-center ${r.flag === 'High' || r.flag === 'Critical' ? 'bg-red-50 dark:bg-red-900/10' : r.flag === 'Low' ? 'bg-blue-50 dark:bg-blue-900/10' : ''}`}>
                  <div className="col-span-3 px-3 py-1.5 text-sm font-medium text-gray-800 dark:text-gray-200 border-r border-gray-100 dark:border-gray-700">{r.testName}</div>

                  {/* RESULT — the only manual entry, matches your printed report's "RESULT" column */}
                  <input
                    className={`col-span-2 px-3 py-1.5 text-sm bg-transparent border-r border-gray-100 dark:border-gray-700 outline-none font-semibold focus:bg-yellow-50 dark:focus:bg-yellow-900/20 ${
                      r.flag === 'High' || r.flag === 'Critical' ? 'text-red-600' : r.flag === 'Low' ? 'text-blue-600' : 'text-gray-900 dark:text-gray-100'
                    }`}
                    placeholder="Value"
                    value={r.value}
                    onChange={e => {
                      const newValue = e.target.value;
                      const auto = autoFlagFromRange(newValue, r.normalRange);
                      setResultFields(resultFields.map((f, fi) =>
                        fi === i
                          ? { ...f, value: newValue, flag: auto || (newValue === '' ? 'Normal' : f.flag) }
                          : f
                      ));
                    }}
                  />

                  {/* REFERENCE — auto-filled, read-only, matches your report's "REFERENCE" column */}
                  <input
                    className="col-span-3 px-3 py-1.5 text-sm bg-gray-50 dark:bg-gray-700/50 border-r border-gray-100 dark:border-gray-700 outline-none text-gray-500 cursor-not-allowed"
                    placeholder="e.g. 4.1 – 11.1"
                    value={r.normalRange}
                    readOnly
                    tabIndex={-1}
                  />

                  {/* UNITS — auto-filled, read-only, matches your report's "UNITS" column */}
                  <input
                    className="col-span-2 px-3 py-1.5 text-sm bg-gray-50 dark:bg-gray-700/50 border-r border-gray-100 dark:border-gray-700 outline-none text-gray-500 cursor-not-allowed"
                    placeholder="unit"
                    value={r.unit}
                    readOnly
                    tabIndex={-1}
                  />

                  {/* FLAG — auto-set from Result vs Reference; kept editable for
                      text ranges like "Nil"/"Clear" where nothing is numeric */}
                  <select className="col-span-2 px-2 py-1.5 text-xs bg-transparent outline-none focus:bg-gray-50 dark:focus:bg-gray-700 cursor-pointer"
                    value={r.flag || 'Normal'}
                    onChange={e => setResultFields(resultFields.map((f, fi) => fi === i ? { ...f, flag: e.target.value } : f))}>
                    <option value="Normal">Normal</option>
                    <option value="High">H – High</option>
                    <option value="Low">L – Low</option>
                    <option value="Critical">C! – Critical</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Remarks / Interpretation</label>
            <textarea {...resReg('remarks')} className="input-field" rows={2} placeholder="Optional clinical remarks…" />
          </div>
          <div className="flex gap-3 justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
            <button type="button" onClick={() => setShowResults(null)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={resultsMut.isPending} className="btn-primary flex items-center gap-2">
              <CheckCircle size={16} />{resultsMut.isPending ? 'Saving…' : 'Save & Complete'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── VIEW RESULT MODAL ──
          Renders the SAME LabReportTemplate used for printing, so whatever
          a staff member sees right after creating/completing an order is
          pixel-identical to what a doctor sees later when they click View —
          no more "different format" between the two. */}
      <Modal isOpen={!!showViewResult} onClose={() => setShowViewResult(null)} title={`Report — ${showViewResult?.labTest?.labNumber || ''}`} size="xl">
        {showViewResult && (
          <div className="p-4 space-y-4">
            <div className="border border-gray-200 dark:border-gray-600 rounded-xl overflow-auto max-h-[65vh] bg-white p-3">
              <LabReportTemplate branding={showViewResult.branding} labTest={showViewResult.labTest} />
            </div>
            <div className="flex gap-3 justify-end pt-2 border-t border-gray-200 dark:border-gray-700">
              <button type="button" onClick={() => setShowViewResult(null)} className="btn-secondary">Close</button>
              <button type="button" onClick={() => handlePrint(showViewResult.labTest)} className="btn-primary flex items-center gap-2">
                <Printer size={15} /> Print Report
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── DYNAMIC LAB REPORT PRINT PORTAL ──────────────────────────────
          Hidden on screen, shown only inside @media print (see .no-print /
          .lab-report-print-only rules in labReportPrint.css + index.css).
          window.print() is triggered by the effect above. */}
      {printData && (
        <div className="lab-report-print-only">
          <LabReportTemplate branding={printData.branding} labTest={printData.labTest} />
        </div>
      )}

      <TestMasterModal isOpen={showTestMaster} onClose={() => setShowTestMaster(false)} />
    </div>
  );
}