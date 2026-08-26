import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { hasPermission } from '../constants/permissions';
import { Plus, Printer, CheckCircle, Eye } from 'lucide-react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import api from '../services/api';
import Modal from '../components/common/Modal';
import DataTable from '../components/common/DataTable';
import LabReportTemplate from '../components/lab/LabReportTemplate';
import LabOrderCreateModal from '../components/lab/LabOrderCreateModal';
import {
  getProfileTests,
  getTestMeta,
  STATUS_LABELS,
  ORDER_SOURCE_LABELS,
} from '../constants/labProfiles';
import { analyzeResult, FLAG_STYLES } from '../utils/labResultAnalyzer';
import '../styles/labOrder.css';

const shortProfileName = (name = '') => {
  const m = String(name).match(/^([^(]+)/);
  return (m ? m[1] : name).trim() || 'Other';
};

const flagLabel = (flag) => {
  if (!flag || flag === 'NA') return '—';
  if (flag === 'CRITICAL_LOW' || flag === 'CRITICAL_HIGH' || flag === 'Critical') return 'Critical';
  if (flag === 'NORMAL' || flag === 'Normal') return 'Normal';
  if (flag === 'HIGH' || flag === 'High') return 'High';
  if (flag === 'LOW' || flag === 'Low') return 'Low';
  if (flag === 'ABNORMAL') return 'Abnormal';
  return String(flag).replace(/_/g, ' ');
};

const flagStyleKey = (flag) => {
  if (flag === 'Normal') return 'NORMAL';
  if (flag === 'High') return 'HIGH';
  if (flag === 'Low') return 'LOW';
  if (flag === 'Critical') return 'CRITICAL_HIGH';
  return flag || 'NA';
};

const autoAnalyze = (value, row, patient = {}) => analyzeResult({
  value,
  referenceRange: row.normalRange || row.referenceRange,
  criticalLow: row.criticalLow,
  criticalHigh: row.criticalHigh,
  patient,
});

/** Build result rows grouped by CBC / LFT / RFT profile order */
const buildResultFields = (labOrder) => {
  const profileNames = (labOrder.profiles?.length
    ? labOrder.profiles
    : String(labOrder.testProfile || '').split(/\s*\+\s*/))
    .map((n) => n.trim())
    .filter(Boolean);

  const orderTests = [...(labOrder.tests || [])];
  const usedIdx = new Set();
  const fields = [];

  const pushRow = (t, profileName, meta = {}) => {
    fields.push({
      testName: t.testName,
      profileName: profileName || t.profileName || '',
      section: shortProfileName(profileName || t.profileName || 'Other'),
      value: '',
      unit: meta.unit || '',
      normalRange: meta.normalRange || '',
      criticalLow: meta.criticalLow,
      criticalHigh: meta.criticalHigh,
      flag: 'NA',
      referenceRange: meta.normalRange || '',
    });
  };

  profileNames.forEach((profileName) => {
    const metaRows = getProfileTests(profileName);
    if (!metaRows.length) return;
    metaRows.forEach((meta) => {
      const idx = orderTests.findIndex((t, i) => !usedIdx.has(i) && t.testName === meta.testName);
      if (idx < 0) return;
      usedIdx.add(idx);
      pushRow(orderTests[idx], profileName, meta);
    });
  });

  orderTests.forEach((t, idx) => {
    if (usedIdx.has(idx)) return;
    const profileName = t.profileName || profileNames.find((p) => getProfileTests(p).some((m) => m.testName === t.testName)) || profileNames[0] || 'Other';
    const meta = getTestMeta(t.testName, getProfileTests(profileName));
    pushRow(t, profileName, {
      unit: t.unit || meta.unit,
      normalRange: t.normalRange || meta.normalRange,
      criticalLow: meta.criticalLow,
      criticalHigh: meta.criticalHigh,
    });
  });

  return fields;
};

export default function LabPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useSelector((s) => s.auth);
  const isLabTech = hasPermission(user, 'UPDATE_LAB_REPORT') || hasPermission(user, 'UPDATE_LAB_ORDER');
  const canCreateOrders = hasPermission(user, 'CREATE_LAB_ORDER');
  const modalMode = isLabTech ? 'full' : 'request';

  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [appendTo, setAppendTo] = useState(null);
  const [prefillPatient, setPrefillPatient] = useState(null);
  const [prefillOp, setPrefillOp] = useState('');
  const [showResults, setShowResults] = useState(null);
  const [showViewResult, setShowViewResult] = useState(null);
  const [printData, setPrintData] = useState(null);
  const [tab, setTab] = useState(searchParams.get('tab') === 'reports' ? 'reports' : 'orders');
  const [desk, setDesk] = useState(
    searchParams.get('desk')
    || (hasPermission(user, 'CREATE_LAB_ORDER') && !isLabTech ? 'reception' : 'lab_desk'),
  );
  const qc = useQueryClient();

  const { register: resReg, handleSubmit: resSubmit, reset: resReset } = useForm();
  const [resultFields, setResultFields] = useState([]);

  useEffect(() => {
    const urlTab = searchParams.get('tab');
    if (urlTab === 'reports') setTab('reports');
    else if (urlTab === 'orders') setTab('orders');
    const urlDesk = searchParams.get('desk');
    if (urlDesk && ['reception', 'lab_desk', 'nurse_ip'].includes(urlDesk)) setDesk(urlDesk);
  }, [searchParams]);

  useEffect(() => {
    const patientId = searchParams.get('patient');
    const opId = searchParams.get('op');
    if (!patientId || !canCreateOrders) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await api.get(`/patients/${patientId}`);
        if (cancelled) return;
        setPrefillPatient(r.data.data);
        setPrefillOp(opId || '');
        setAppendTo(null);
        setShowCreate(true);
        setDesk('reception');
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [searchParams, canCreateOrders]);

  const { data, isLoading } = useQuery({
    queryKey: ['labTests', page, tab, desk],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
        sort: '-createdAt',
      });
      if (tab === 'reports') params.set('status', 'completed');
      else if (desk) params.set('orderSource', desk);
      return api.get(`/lab?${params}`).then((r) => r.data);
    },
  });

  const { data: dashData } = useQuery({
    queryKey: ['labDash'],
    queryFn: () => api.get('/lab/dashboard').then((r) => r.data.data),
    enabled: isLabTech,
  });

  const { data: brandingData } = useQuery({
    queryKey: ['branding'],
    queryFn: () => api.get('/branding').then((r) => r.data.data),
    staleTime: 1000 * 60 * 5,
  });

  const openNewOrder = () => {
    setAppendTo(null);
    setPrefillPatient(null);
    setPrefillOp('');
    setShowCreate(true);
  };

  const openAddMoreTests = (row) => {
    setAppendTo(row);
    setPrefillPatient(null);
    setPrefillOp('');
    setShowCreate(true);
  };

  const statusMut = useMutation({
    mutationFn: ({ id, status }) => api.put(`/lab/${id}/status`, { status }),
    onSuccess: (_d, vars) => {
      toast.success(`Status → ${STATUS_LABELS[vars.status] || vars.status}`);
      qc.invalidateQueries(['labTests']);
      qc.invalidateQueries(['labDash']);
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Status update failed'),
  });

  const resultsMut = useMutation({
    mutationFn: ({ id, data: body }) => api.put(`/lab/${id}/results`, body),
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

  const handlePrint = async (test) => {
    try {
      const id = test?._id || test?.id;
      const full = await api.get(`/lab/${id}`).then((r) => r.data.data);
      setPrintData({ branding: brandingData, labTest: full });
    } catch {
      toast.error('Could not load report for print');
    }
  };

  useEffect(() => {
    if (!printData) return undefined;

    let cancelled = false;
    const handleAfterPrint = () => setPrintData(null);
    window.addEventListener('afterprint', handleAfterPrint);

    const runPrint = async () => {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const root = document.getElementById('lab-report-print-root');
      const imgs = root ? Array.from(root.querySelectorAll('img')) : [];
      await Promise.all(
        imgs.map((img) => {
          if (img.complete) return Promise.resolve();
          return Promise.race([
            new Promise((res) => { img.onload = res; img.onerror = res; }),
            new Promise((res) => setTimeout(res, 1200)),
          ]);
        }),
      );
      if (!cancelled) window.print();
    };

    const timer = setTimeout(runPrint, 300);
    return () => {
      cancelled = true;
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

  const statusLabel = (s) => STATUS_LABELS[s] || String(s || '').replace(/_/g, ' ');

  const columns = [
    {
      key: 'uhid',
      header: 'UHID',
      render: (r) => (
        <span className="font-mono font-semibold text-blue-700 dark:text-blue-400">
          {r.patient?.patientId || '—'}
        </span>
      ),
    },
    {
      key: 'labNumber',
      header: 'Lab No',
      render: (r) => <span className="font-mono text-sm text-slate-600">{r.labNumber}</span>,
    },
    {
      key: 'patient',
      header: 'Patient',
      render: (r) => (
        <div>
          <p className="font-medium text-gray-900 dark:text-white">{r.patient?.name}</p>
          <p className="text-xs text-gray-400">{r.patient?.age}yr · {r.patient?.gender}</p>
        </div>
      ),
    },
    {
      key: 'tests',
      header: 'Profile / Tests',
      render: (r) => (
        <div>
          <p className="text-xs font-semibold text-indigo-600">
            {(r.profiles?.length ? r.profiles.join(' + ') : r.testProfile) || '—'}
          </p>
          <p className="text-xs text-gray-500">{r.tests?.length || 0} params</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Lab status',
      render: (r) => (
        <div>
          <span className={statusColors[r.status]}>{statusLabel(r.status)}</span>
          {r.priority && r.priority !== 'routine' && (
            <span className="ml-1 text-[10px] font-bold uppercase text-red-600">{r.priority}</span>
          )}
        </div>
      ),
    },
    {
      key: 'createdAt',
      header: 'Requested',
      render: (r) => (
        <div className="text-xs text-gray-500">
          <div>{new Date(r.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
          {r.createdBy?.name && <div className="text-[10px]">by {r.createdBy.name}</div>}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (r) => (
        <div className="flex gap-2 items-center flex-wrap justify-end">
          {canCreateOrders && !['completed', 'cancelled'].includes(r.status) && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); openAddMoreTests(r); }}
              className="text-xs bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-lg font-medium"
              title="Add more tests to the SAME Lab No."
            >
              + More tests
            </button>
          )}
          {r.status === 'pending' && isLabTech && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); statusMut.mutate({ id: r._id, status: 'sample_collected' }); }}
              className="text-xs bg-yellow-100 text-yellow-700 px-2.5 py-1 rounded-lg font-medium"
            >
              Collect Sample
            </button>
          )}
          {r.status === 'sample_collected' && isLabTech && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); statusMut.mutate({ id: r._id, status: 'processing' }); }}
              className="text-xs bg-blue-100 text-blue-700 px-2.5 py-1 rounded-lg font-medium"
            >
              Start Processing
            </button>
          )}
          {r.status === 'processing' && isLabTech && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setResultFields(buildResultFields(r));
                setShowResults(r);
              }}
              className="text-xs bg-green-100 text-green-700 px-2.5 py-1 rounded-lg font-medium"
            >
              Enter Results
            </button>
          )}
          {r.status === 'completed' && (
            <div className="flex gap-1">
              <button
                type="button"
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    const full = await api.get(`/lab/${r._id}`).then((res) => res.data.data);
                    setShowViewResult({ branding: brandingData, labTest: full });
                  } catch {
                    toast.error('Could not load report');
                  }
                }}
                className="text-xs bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-lg font-medium flex items-center gap-1"
              >
                <Eye size={11} /> View
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handlePrint(r); }}
                className="text-xs bg-purple-100 text-purple-700 px-2.5 py-1 rounded-lg font-medium flex items-center gap-1"
              >
                <Printer size={11} /> Print
              </button>
            </div>
          )}
        </div>
      ),
    },
  ];

  const tableData = data?.data || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Laboratory</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Separate desks · one Lab No. per request · live status on request desks
          </p>
        </div>
        {tab === 'orders' && canCreateOrders && (
          <button type="button" onClick={openNewOrder} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> {modalMode === 'request' ? 'Request Lab' : 'New Lab Order'}
          </button>
        )}
      </div>

      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700">
        {[{ id: 'orders', label: 'Lab Orders' }, { id: 'reports', label: 'Lab Reports' }].map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => { setTab(id); setPage(1); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'orders' && (
        <>
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'reception', label: 'Reception / OP requests' },
              { id: 'lab_desk', label: 'Lab desk created' },
              { id: 'nurse_ip', label: 'Nurse Station / IP' },
            ].map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => {
                  setDesk(d.id);
                  setPage(1);
                  setSearchParams((prev) => {
                    const p = new URLSearchParams(prev);
                    p.set('desk', d.id);
                    p.set('tab', 'orders');
                    return p;
                  });
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                  desk === d.id
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500">
            Showing <strong>{ORDER_SOURCE_LABELS[desk] || desk}</strong>.
            {' '}When Lab Technician collects / processes / completes an order, the
            {' '}<strong>Lab status</strong> column updates on this desk in real time.
          </p>
        </>
      )}

      {dashData && isLabTech && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Today's Tests", value: dashData.todayTests, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Pending / Requested', value: dashData.pending, color: 'text-yellow-600', bg: 'bg-yellow-50' },
            { label: 'Completed Today', value: dashData.completed, color: 'text-green-600', bg: 'bg-green-50' },
            { label: 'Urgent', value: dashData.urgent, color: 'text-red-600', bg: 'bg-red-50' },
          ].map((s) => (
            <div key={s.label} className={`kpi-card text-center ${s.bg} rounded-2xl p-4`}>
              <p className={`text-3xl font-bold ${s.color}`}>{s.value ?? '–'}</p>
              <p className="text-sm text-gray-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
        <DataTable
          columns={columns}
          data={tableData}
          loading={isLoading}
          page={page}
          pages={data?.pages || 1}
          onPageChange={setPage}
        />
      </div>

      <LabOrderCreateModal
        isOpen={showCreate}
        onClose={() => { setShowCreate(false); setAppendTo(null); setPrefillPatient(null); }}
        mode={appendTo ? (isLabTech ? 'full' : 'request') : modalMode}
        appendTo={appendTo}
        initialPatient={prefillPatient}
        initialOpId={prefillOp}
        orderSource={
          appendTo?.orderSource
          || (desk === 'nurse_ip' ? 'nurse_ip' : desk === 'lab_desk' ? 'lab_desk' : 'reception')
        }
      />

      <Modal
        isOpen={!!showResults}
        onClose={() => { setShowResults(null); resReset(); setResultFields([]); }}
        title={`Enter Results — ${showResults?.labNumber}`}
        size="2xl"
      >
        <form
          onSubmit={resSubmit((d) => resultsMut.mutate({
            id: showResults._id,
            data: {
              results: resultFields.map((r) => ({
                ...r,
                section: r.section || shortProfileName(r.profileName),
              })),
              remarks: d.remarks,
            },
          }))}
          className="p-6 space-y-4"
        >
          {showResults?.testProfile && (
            <div className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg inline-block">
              Profile: {showResults.testProfile}
            </div>
          )}
          <p className="text-[11px] text-slate-500">
            Flag updates automatically from the reference range (Normal / Low / High / Critical) with colour coding.
          </p>
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="grid grid-cols-12 gap-0 bg-gray-50 px-3 py-2.5 text-xs font-semibold text-gray-500">
              <span className="col-span-3">Test Name</span>
              <span className="col-span-2">Result *</span>
              <span className="col-span-3">Reference</span>
              <span className="col-span-2">Units</span>
              <span className="col-span-2">Flag</span>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {resultFields.map((r, i) => {
                const prev = resultFields[i - 1];
                const showHeading = !prev || prev.profileName !== r.profileName || prev.section !== r.section;
                const styleKey = flagStyleKey(r.flag);
                const styles = FLAG_STYLES[styleKey] || FLAG_STYLES.NA;
                const patientCtx = {
                  age: showResults?.patient?.age,
                  gender: showResults?.patient?.gender,
                };
                return (
                  <React.Fragment key={`${r.profileName}-${r.testName}-${i}`}>
                    {showHeading && (
                      <div className="px-3 py-2 bg-indigo-600 text-white text-xs font-bold uppercase tracking-wide sticky top-0 z-10">
                        {r.section || shortProfileName(r.profileName) || 'Tests'}
                        {r.profileName && r.profileName !== r.section && (
                          <span className="ml-2 font-medium normal-case opacity-90 tracking-normal">
                            — {r.profileName}
                          </span>
                        )}
                      </div>
                    )}
                    <div className={`grid grid-cols-12 border-t border-gray-100 items-center ${styles.row || ''}`}>
                      <div className="col-span-3 px-3 py-1.5 text-sm font-medium border-r">{r.testName}</div>
                      <input
                        className={`col-span-2 px-3 py-1.5 text-sm border-r outline-none font-semibold ${styles.text || ''}`}
                        value={r.value}
                        placeholder="Enter"
                        onChange={(e) => {
                          const newValue = e.target.value;
                          const analysis = autoAnalyze(newValue, r, patientCtx);
                          setResultFields((prevFields) => prevFields.map((f, fi) => (
                            fi === i
                              ? { ...f, value: newValue, flag: newValue === '' ? 'NA' : analysis.flag }
                              : f
                          )));
                        }}
                      />
                      <input className="col-span-3 px-3 py-1.5 text-sm bg-gray-50 border-r text-gray-500" value={r.normalRange} readOnly tabIndex={-1} />
                      <input className="col-span-2 px-3 py-1.5 text-sm bg-gray-50 border-r text-gray-500" value={r.unit} readOnly tabIndex={-1} />
                      <div className="col-span-2 px-2 py-1.5 flex items-center justify-center">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${styles.badge}`}>
                          {flagLabel(r.flag)}
                        </span>
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Remarks</label>
            <textarea {...resReg('remarks')} className="input-field" rows={2} />
          </div>
          <div className="flex gap-3 justify-end pt-4 border-t">
            <button type="button" onClick={() => setShowResults(null)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={resultsMut.isPending} className="btn-primary flex items-center gap-2">
              <CheckCircle size={16} />{resultsMut.isPending ? 'Saving…' : 'Save & Complete'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={!!showViewResult}
        onClose={() => setShowViewResult(null)}
        title={`Report — ${showViewResult?.labTest?.labNumber || ''}`}
        size="xl"
      >
        {showViewResult && (
          <div className="p-4 space-y-4">
            <div className="border rounded-xl overflow-auto max-h-[65vh] bg-white p-3">
              <LabReportTemplate branding={showViewResult.branding} labTest={showViewResult.labTest} />
            </div>
            <div className="flex gap-3 justify-end pt-2 border-t">
              <button type="button" onClick={() => setShowViewResult(null)} className="btn-secondary">Close</button>
              <button type="button" onClick={() => handlePrint(showViewResult.labTest)} className="btn-primary flex items-center gap-2">
                <Printer size={15} /> Print Report
              </button>
            </div>
          </div>
        )}
      </Modal>

      {printData &&
        createPortal(
          <div className="lab-report-print-only">
            <LabReportTemplate branding={printData.branding} labTest={printData.labTest} forPrint />
          </div>,
          document.body,
        )}
    </div>
  );
}
