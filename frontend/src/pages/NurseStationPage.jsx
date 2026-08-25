import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import {
  Activity, AlertTriangle, ClipboardList, ExternalLink, FlaskConical,
  HeartPulse, Pill, Printer, RefreshCw, Stethoscope,
} from 'lucide-react';
import api from '../services/api';
import { useBranding } from '../hooks/useBranding';
import { hasPermission } from '../constants/permissions';
import MedicationLogModal from '../components/ip/MedicationLogModal';
import ServiceUsageModal from '../components/ip/ServiceUsageModal';
import LoadingSpinner from '../components/common/LoadingSpinner';
import {
  LAB_TYPES,
  profilesForType,
  expandProfilesToTests,
  getProfileMeta,
  STATUS_LABELS,
  buildOtherLabTests,
} from '../constants/labProfiles';
import '../styles/assetMaster.css';
import '../styles/nurseStation.css';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'vitals', label: 'Vitals' },
  { id: 'notes', label: 'Notes & Handover' },
  { id: 'meds', label: 'Medications' },
  { id: 'procedures', label: 'Procedures' },
  { id: 'lab', label: 'Lab' },
  { id: 'orders', label: 'Treatment Sheet' },
];

const emptyVitals = () => ({
  bloodPressure: '', pulse: '', temperature: '', oxygenSaturation: '',
  respiratoryRate: '', weight: '', notes: '',
});

const emptyHandover = () => ({
  shift: 'morning', toNurseName: '', summary: '', pendingTasks: '',
});

const fmtDt = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

const fmtTime = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
};

const todayStart = () => {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
};

export default function NurseStationPage() {
  const qc = useQueryClient();
  const { user } = useSelector((s) => s.auth);
  const { branding } = useBranding();

  const [wardFilter, setWardFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [tab, setTab] = useState('overview');
  const [vitalsForm, setVitalsForm] = useState(emptyVitals());
  const [noteText, setNoteText] = useState('');
  const [handoverForm, setHandoverForm] = useState(emptyHandover());
  const [orderText, setOrderText] = useState('');
  const [orderPriority, setOrderPriority] = useState('routine');
  const [labType, setLabType] = useState('');
  const [labProfile, setLabProfile] = useState('');
  const [labNotes, setLabNotes] = useState('');
  const [otherLabName, setOtherLabName] = useState('');
  const [otherLabPrice, setOtherLabPrice] = useState('');
  const [showMedModal, setShowMedModal] = useState(false);
  const [showProcModal, setShowProcModal] = useState(false);

  const hasNurseStation = hasPermission(user, 'VIEW_NURSE_STATION');
  const canRecordVitals = hasNurseStation || hasPermission(user, 'RECORD_VITALS');
  const canAddNotes = hasNurseStation || hasPermission(user, 'CREATE_NURSING_NOTE');
  const canHandover = hasNurseStation || hasPermission(user, 'SHIFT_HANDOVER');
  const canAddMeds = hasNurseStation || hasPermission(user, 'MANAGE_IP_MEDICATION');
  const canAddProcedures = hasNurseStation || hasPermission(user, 'CREATE_SERVICE_USAGE');
  const canAddLab = hasNurseStation || hasPermission(user, 'CREATE_LAB_ORDER');
  const canDoctorOrder = hasNurseStation || hasPermission(user, 'MANAGE_DOCTOR_ORDERS');
  const canAckOrder = hasNurseStation || hasPermission(user, 'MANAGE_DOCTOR_ORDERS');

  const boardQ = useQuery({
    queryKey: ['nurse-station', wardFilter],
    queryFn: async () => {
      const params = wardFilter ? { ward: wardFilter } : {};
      return (await api.get('/ip/nurse-station', { params })).data.data || [];
    },
    refetchInterval: 60000,
  });

  const admissionQ = useQuery({
    queryKey: ['ip-admission', selectedId],
    queryFn: async () => (await api.get(`/ip/${selectedId}`)).data.data,
    enabled: !!selectedId,
  });

  const testMasterQ = useQuery({
    queryKey: ['test-master'],
    queryFn: async () => (await api.get('/test-master')).data.data || [],
    staleTime: 5 * 60 * 1000,
  });

  const board = boardQ.data || [];
  const admission = admissionQ.data;

  const wards = useMemo(() => {
    const map = new Map();
    board.forEach((a) => {
      if (a.ward?._id) map.set(String(a.ward._id), a.ward.name || 'Ward');
    });
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [board]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return board;
    return board.filter((a) => {
      const hay = [
        a.patient?.name, a.patient?.patientId, a.admissionNumber,
        a.bed?.bedNumber, a.ward?.name, a.doctor?.name, a.admissionDiagnosis,
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [board, search]);

  const grouped = useMemo(() => {
    const groups = {};
    filtered.forEach((a) => {
      const key = a.ward?.name || 'Unassigned ward';
      if (!groups[key]) groups[key] = [];
      groups[key].push(a);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const invalidatePatient = () => {
    qc.invalidateQueries(['nurse-station']);
    if (selectedId) qc.invalidateQueries(['ip-admission', selectedId]);
  };

  const vitalsMut = useMutation({
    mutationFn: (body) => api.post(`/ip/${selectedId}/vitals`, body),
    onSuccess: () => {
      toast.success('Vitals recorded');
      setVitalsForm(emptyVitals());
      invalidatePatient();
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed to save vitals'),
  });

  const noteMut = useMutation({
    mutationFn: (note) => api.post(`/ip/${selectedId}/nursing-note`, { note }),
    onSuccess: () => {
      toast.success('Note added');
      setNoteText('');
      invalidatePatient();
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed to add note'),
  });

  const handoverMut = useMutation({
    mutationFn: (body) => api.post(`/ip/${selectedId}/shift-handover`, body),
    onSuccess: () => {
      toast.success('Handover saved');
      setHandoverForm(emptyHandover());
      invalidatePatient();
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed to save handover'),
  });

  const orderMut = useMutation({
    mutationFn: (body) => api.post(`/ip/${selectedId}/doctor-order`, body),
    onSuccess: () => {
      toast.success('Order added');
      setOrderText('');
      setOrderPriority('routine');
      invalidatePatient();
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed to add order'),
  });

  const orderUpdateMut = useMutation({
    mutationFn: ({ orderId, status }) => api.put(`/ip/${selectedId}/doctor-order/${orderId}`, { status }),
    onSuccess: () => {
      toast.success('Order updated');
      invalidatePatient();
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed to update order'),
  });

  const labMut = useMutation({
    mutationFn: async () => {
      const isOther = labType === 'Other' || labProfile === '__other__';
      if (isOther) {
        if (!otherLabName.trim()) throw new Error('Enter the lab / test name');
        const built = buildOtherLabTests(otherLabName, otherLabPrice, {
          testMaster: testMasterQ.data || [],
        });
        return api.post('/lab', {
          patient: admission.patient._id || admission.patient,
          doctor: admission.doctor?._id || admission.doctor,
          ipAdmission: admission._id,
          profiles: [built.profileName],
          testProfile: built.profileName,
          labType: 'Other',
          sampleType: 'other',
          priority: 'routine',
          notes: labNotes || undefined,
          tests: built.tests,
          totalAmount: built.totalAmount,
          orderSource: 'nurse_ip',
        });
      }
      const master = (testMasterQ.data || []).find((t) => t.name === labProfile);
      const price = Number(master?.price) || 0;
      const meta = getProfileMeta(labProfile);
      const { tests, totalAmount } = expandProfilesToTests([labProfile], { [labProfile]: price });
      return api.post('/lab', {
        patient: admission.patient._id || admission.patient,
        doctor: admission.doctor?._id || admission.doctor,
        ipAdmission: admission._id,
        profiles: [labProfile],
        testProfile: labProfile,
        labType: master?.category || meta.labType || labType || 'Other',
        sampleType: meta.sampleType || 'blood',
        priority: 'routine',
        notes: labNotes || undefined,
        tests: tests.length ? tests : [{ testName: labProfile, price }],
        totalAmount: totalAmount || price,
        orderSource: 'nurse_ip',
      });
    },
    onSuccess: () => {
      toast.success('Lab order sent to Lab desk (Nurse / IP queue)');
      setLabProfile('');
      setLabNotes('');
      setOtherLabName('');
      setOtherLabPrice('');
      invalidatePatient();
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed to create lab order'),
  });

  const allergies = admission?.knownAllergies
    || admission?.patient?.knownAllergies
    || admission?.patient?.allergies
    || '';

  const vitalsSorted = [...(admission?.vitalRecords || [])].sort(
    (a, b) => new Date(b.recordedAt) - new Date(a.recordedAt),
  );
  const notesSorted = [...(admission?.nursingNotes || [])].sort(
    (a, b) => new Date(b.recordedAt) - new Date(a.recordedAt),
  );
  const handoversSorted = [...(admission?.shiftHandovers || [])].sort(
    (a, b) => new Date(b.handedOverAt) - new Date(a.handedOverAt),
  );
  const medsToday = (admission?.medications || []).filter(
    (m) => new Date(m.administeredAt) >= todayStart(),
  );
  const ordersSorted = [...(admission?.doctorOrders || [])].sort(
    (a, b) => new Date(b.orderedAt) - new Date(a.orderedAt),
  );
  const labs = admission?.labTests || [];

  const handlePrint = () => {
    if (!admission) return;
    window.print();
  };

  return (
    <div className="am-shell ns-page">
      <div className="am-head no-print">
        <div>
          <p className="am-head__eyebrow">Inpatient care</p>
          <h1 className="am-head__title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <HeartPulse size={22} /> Nurse Station
          </h1>
          <p className="am-head__sub">Ward board · vitals · meds · handover · treatment sheet</p>
        </div>
        <div className="ns-actions">
          <button type="button" className="ns-btn" onClick={() => boardQ.refetch()}>
            <RefreshCw size={14} /> Refresh
          </button>
          {admission && (
            <button type="button" className="ns-btn" onClick={handlePrint}>
              <Printer size={14} /> Print chart
            </button>
          )}
        </div>
      </div>

      <div className="ns-layout no-print">
        {/* ── Ward / bed board ── */}
        <aside className="ns-board">
          <div className="ns-board-head">
            <strong style={{ fontSize: '0.9rem' }}>
              Admitted · {filtered.length}
            </strong>
            <div className="ns-filters">
              <select value={wardFilter} onChange={(e) => setWardFilter(e.target.value)}>
                <option value="">All wards</option>
                {wards.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
              <input
                placeholder="Search name / bed / UHID"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {boardQ.isLoading ? (
            <div className="ns-empty"><LoadingSpinner /></div>
          ) : !filtered.length ? (
            <div className="ns-empty">No admitted patients found.</div>
          ) : (
            grouped.map(([wardName, list]) => (
              <div key={wardName} className="ns-ward-block">
                <p className="ns-ward-title">{wardName} · {list.length}</p>
                <div className="ns-card-list">
                  {list.map((a) => {
                    const allergy = a.knownAllergies;
                    return (
                      <button
                        key={a._id}
                        type="button"
                        className={`ns-card ${selectedId === a._id ? 'is-active' : ''}`}
                        onClick={() => { setSelectedId(a._id); setTab('overview'); }}
                      >
                        <div className="ns-card-top">
                          <div>
                            <p className="ns-card-name">{a.patient?.name || 'Patient'}</p>
                            <p className="ns-card-meta">
                              {a.patient?.patientId || '—'} · {a.patient?.age ?? '—'} / {a.patient?.gender || '—'}
                              {a.doctor?.name ? ` · Dr. ${a.doctor.name}` : ''}
                            </p>
                          </div>
                          <span className="ns-bed-chip">
                            {a.bed?.bedNumber ? `Bed ${a.bed.bedNumber}` : 'No bed'}
                          </span>
                        </div>
                        <div className="ns-badges">
                          {allergy && <span className="ns-badge alert">Allergy</span>}
                          {a.pendingOrders > 0 && (
                            <span className="ns-badge warn">{a.pendingOrders} order{a.pendingOrders > 1 ? 's' : ''}</span>
                          )}
                          {a.medsToday > 0 && (
                            <span className="ns-badge ok">{a.medsToday} meds today</span>
                          )}
                          <span className="ns-badge">
                            Vitals {a.lastVitalsAt ? fmtTime(a.lastVitalsAt) : 'none'}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </aside>

        {/* ── Patient workbench ── */}
        <section className="ns-workbench">
          {!selectedId ? (
            <div className="ns-empty">
              Select a patient from the ward board to open the bedside workbench.
            </div>
          ) : admissionQ.isLoading ? (
            <div className="ns-empty"><LoadingSpinner /></div>
          ) : !admission ? (
            <div className="ns-empty">Could not load admission.</div>
          ) : (
            <>
              <div className="ns-wb-head">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>
                      {admission.patient?.name}
                    </h2>
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: 'var(--am-muted)' }}>
                      {admission.admissionNumber} · UHID {admission.patient?.patientId || '—'} ·{' '}
                      {admission.patient?.age ?? '—'}/{admission.patient?.gender || '—'} ·{' '}
                      Bed {admission.bed?.bedNumber || '—'}
                      {admission.ward?.name ? ` · ${admission.ward.name}` : ''} ·{' '}
                      Dr. {admission.doctor?.name || '—'}
                    </p>
                    {admission.admissionDiagnosis && (
                      <p style={{ margin: '0.35rem 0 0', fontSize: '0.8rem' }}>
                        Dx: {admission.admissionDiagnosis}
                      </p>
                    )}
                  </div>
                  <Link
                    to={`/ip-admissions/${admission._id}`}
                    className="ns-btn ghost"
                    style={{ textDecoration: 'none' }}
                  >
                    <ExternalLink size={14} /> Full IP record
                  </Link>
                </div>
              </div>

              {allergies && (
                <div className="ns-allergy">
                  <AlertTriangle size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: -2 }} />
                  Allergies / alerts: {allergies}
                </div>
              )}

              <div className="ns-tabs">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`ns-tab ${tab === t.id ? 'is-active' : ''}`}
                    onClick={() => setTab(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="ns-body">
                {tab === 'overview' && (
                  <OverviewTab
                    admission={admission}
                    vitalsSorted={vitalsSorted}
                    medsToday={medsToday}
                    ordersSorted={ordersSorted}
                    onOpen={(id) => setTab(id)}
                  />
                )}

                {tab === 'vitals' && (
                  <>
                    {canRecordVitals && (
                      <form
                        className="ns-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          vitalsMut.mutate(vitalsForm);
                        }}
                      >
                        <div>
                          <label>BP</label>
                          <input
                            placeholder="120/80"
                            value={vitalsForm.bloodPressure}
                            onChange={(e) => setVitalsForm({ ...vitalsForm, bloodPressure: e.target.value })}
                          />
                        </div>
                        <div>
                          <label>Pulse</label>
                          <input
                            type="number"
                            value={vitalsForm.pulse}
                            onChange={(e) => setVitalsForm({ ...vitalsForm, pulse: e.target.value })}
                          />
                        </div>
                        <div>
                          <label>Temp °C</label>
                          <input
                            type="number"
                            step="0.1"
                            value={vitalsForm.temperature}
                            onChange={(e) => setVitalsForm({ ...vitalsForm, temperature: e.target.value })}
                          />
                        </div>
                        <div>
                          <label>SpO2 %</label>
                          <input
                            type="number"
                            value={vitalsForm.oxygenSaturation}
                            onChange={(e) => setVitalsForm({ ...vitalsForm, oxygenSaturation: e.target.value })}
                          />
                        </div>
                        <div>
                          <label>RR</label>
                          <input
                            type="number"
                            value={vitalsForm.respiratoryRate}
                            onChange={(e) => setVitalsForm({ ...vitalsForm, respiratoryRate: e.target.value })}
                          />
                        </div>
                        <div>
                          <label>Weight kg</label>
                          <input
                            type="number"
                            step="0.1"
                            value={vitalsForm.weight}
                            onChange={(e) => setVitalsForm({ ...vitalsForm, weight: e.target.value })}
                          />
                        </div>
                        <div className="full">
                          <label>Notes</label>
                          <input
                            value={vitalsForm.notes}
                            onChange={(e) => setVitalsForm({ ...vitalsForm, notes: e.target.value })}
                          />
                        </div>
                        <div className="full ns-actions">
                          <button type="submit" className="ns-btn primary" disabled={vitalsMut.isPending}>
                            <Activity size={14} /> Save vitals
                          </button>
                        </div>
                      </form>
                    )}
                    <div className="ns-table-wrap">
                      <table className="ns-table">
                        <thead>
                          <tr>
                            <th>Time</th>
                            <th>BP</th>
                            <th>Pulse</th>
                            <th>Temp</th>
                            <th>SpO2</th>
                            <th>RR</th>
                            <th>Wt</th>
                            <th>By</th>
                          </tr>
                        </thead>
                        <tbody>
                          {!vitalsSorted.length && (
                            <tr><td colSpan={8}>No vitals recorded yet.</td></tr>
                          )}
                          {vitalsSorted.map((v) => (
                            <tr key={v._id}>
                              <td>{fmtDt(v.recordedAt)}</td>
                              <td>{v.bloodPressure || '—'}</td>
                              <td>{v.pulse ?? '—'}</td>
                              <td>{v.temperature ?? '—'}</td>
                              <td>{v.oxygenSaturation ?? '—'}</td>
                              <td>{v.respiratoryRate ?? '—'}</td>
                              <td>{v.weight ?? '—'}</td>
                              <td>{v.recordedBy?.name || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {tab === 'notes' && (
                  <>
                    {(canAddNotes || canHandover) && (
                      <>
                        <form
                          className="ns-form"
                          onSubmit={(e) => {
                            e.preventDefault();
                            if (!noteText.trim()) return toast.error('Enter a note');
                            noteMut.mutate(noteText.trim());
                          }}
                        >
                          <div className="full">
                            <label>Nursing note</label>
                            <textarea
                              rows={3}
                              value={noteText}
                              onChange={(e) => setNoteText(e.target.value)}
                              placeholder="Observation, care given, patient response…"
                            />
                          </div>
                          <div className="full ns-actions">
                            <button type="submit" className="ns-btn primary" disabled={noteMut.isPending}>
                              <ClipboardList size={14} /> Add note
                            </button>
                          </div>
                        </form>

                        <form
                          className="ns-form"
                          onSubmit={(e) => {
                            e.preventDefault();
                            handoverMut.mutate(handoverForm);
                          }}
                        >
                          <div>
                            <label>Shift</label>
                            <select
                              value={handoverForm.shift}
                              onChange={(e) => setHandoverForm({ ...handoverForm, shift: e.target.value })}
                            >
                              <option value="morning">Morning</option>
                              <option value="afternoon">Afternoon</option>
                              <option value="night">Night</option>
                            </select>
                          </div>
                          <div>
                            <label>To nurse</label>
                            <input
                              value={handoverForm.toNurseName}
                              onChange={(e) => setHandoverForm({ ...handoverForm, toNurseName: e.target.value })}
                              placeholder="Incoming nurse name"
                            />
                          </div>
                          <div className="full">
                            <label>Handover summary *</label>
                            <textarea
                              rows={3}
                              value={handoverForm.summary}
                              onChange={(e) => setHandoverForm({ ...handoverForm, summary: e.target.value })}
                              required
                            />
                          </div>
                          <div className="full">
                            <label>Pending tasks</label>
                            <textarea
                              rows={2}
                              value={handoverForm.pendingTasks}
                              onChange={(e) => setHandoverForm({ ...handoverForm, pendingTasks: e.target.value })}
                            />
                          </div>
                          <div className="full ns-actions">
                            <button type="submit" className="ns-btn primary" disabled={handoverMut.isPending}>
                              Save shift handover
                            </button>
                          </div>
                        </form>
                      </>
                    )}

                    <h3 style={{ fontSize: '0.85rem', margin: '0 0 0.5rem' }}>Notes</h3>
                    <div className="ns-table-wrap" style={{ marginBottom: '1rem' }}>
                      <table className="ns-table">
                        <thead>
                          <tr><th>Time</th><th>Nurse</th><th>Note</th></tr>
                        </thead>
                        <tbody>
                          {!notesSorted.length && <tr><td colSpan={3}>No notes yet.</td></tr>}
                          {notesSorted.map((n) => (
                            <tr key={n._id}>
                              <td>{fmtDt(n.recordedAt)}</td>
                              <td>{n.nurse?.name || '—'}</td>
                              <td>{n.note}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <h3 style={{ fontSize: '0.85rem', margin: '0 0 0.5rem' }}>Shift handovers</h3>
                    <div className="ns-table-wrap">
                      <table className="ns-table">
                        <thead>
                          <tr><th>Time</th><th>Shift</th><th>From</th><th>To</th><th>Summary</th><th>Pending</th></tr>
                        </thead>
                        <tbody>
                          {!handoversSorted.length && <tr><td colSpan={6}>No handovers yet.</td></tr>}
                          {handoversSorted.map((h) => (
                            <tr key={h._id}>
                              <td>{fmtDt(h.handedOverAt)}</td>
                              <td style={{ textTransform: 'capitalize' }}>{h.shift}</td>
                              <td>{h.fromNurse?.name || '—'}</td>
                              <td>{h.toNurse?.name || h.toNurseName || '—'}</td>
                              <td>{h.summary}</td>
                              <td>{h.pendingTasks || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {tab === 'meds' && (
                  <>
                    <div className="ns-actions" style={{ marginBottom: '0.85rem' }}>
                      {canAddMeds && (
                        <button type="button" className="ns-btn primary" onClick={() => setShowMedModal(true)}>
                          <Pill size={14} /> Give / chart medicine
                        </button>
                      )}
                      <span style={{ fontSize: '0.8rem', color: 'var(--am-muted)' }}>
                        {medsToday.length} given today · {(admission.medications || []).length} total this stay
                      </span>
                    </div>
                    <div className="ns-table-wrap">
                      <table className="ns-table">
                        <thead>
                          <tr>
                            <th>Time</th><th>Medicine</th><th>Dose</th><th>Freq</th><th>Route</th><th>Qty</th><th>By</th>
                          </tr>
                        </thead>
                        <tbody>
                          {!(admission.medications || []).length && (
                            <tr><td colSpan={7}>No medications charted yet.</td></tr>
                          )}
                          {[...(admission.medications || [])]
                            .sort((a, b) => new Date(b.administeredAt) - new Date(a.administeredAt))
                            .map((m) => (
                              <tr key={m._id}>
                                <td>{fmtDt(m.administeredAt)}</td>
                                <td>{m.medicineName}</td>
                                <td>{m.dosage || '—'}</td>
                                <td>{m.frequency || '—'}</td>
                                <td>{m.route || '—'}</td>
                                <td>{m.quantity}</td>
                                <td>{m.administeredBy?.name || '—'}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {tab === 'procedures' && (
                  <>
                    <div className="ns-actions" style={{ marginBottom: '0.85rem' }}>
                      {canAddProcedures && (
                        <button type="button" className="ns-btn primary" onClick={() => setShowProcModal(true)}>
                          <Stethoscope size={14} /> Log procedure / machine
                        </button>
                      )}
                    </div>
                    <div className="ns-table-wrap">
                      <table className="ns-table">
                        <thead>
                          <tr>
                            <th>Time</th><th>Service</th><th>Category</th><th>Qty</th><th>Rate</th><th>By</th>
                          </tr>
                        </thead>
                        <tbody>
                          {!(admission.serviceUsages || []).length && (
                            <tr><td colSpan={6}>No procedures logged yet.</td></tr>
                          )}
                          {[...(admission.serviceUsages || [])]
                            .sort((a, b) => new Date(b.usedAt) - new Date(a.usedAt))
                            .map((s) => (
                              <tr key={s._id}>
                                <td>{fmtDt(s.usedAt)}</td>
                                <td>{s.serviceName}</td>
                                <td>{s.category}</td>
                                <td>{s.quantity}</td>
                                <td>₹{Number(s.unitPrice || 0).toFixed(2)}</td>
                                <td>{s.administeredBy?.name || '—'}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {tab === 'lab' && (
                  <>
                    {canAddLab && (
                      <form
                        className="ns-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (!labType) return toast.error('Select lab type first');
                          const isOther = labType === 'Other' || labProfile === '__other__';
                          if (isOther) {
                            if (!otherLabName.trim()) return toast.error('Enter the lab / test name');
                            if (otherLabPrice === '' || Number(otherLabPrice) < 0) return toast.error('Enter the lab price');
                          } else if (!labProfile) {
                            return toast.error('Select a lab package');
                          }
                          labMut.mutate();
                        }}
                      >
                        <div className="full">
                          <label>1 · Lab type *</label>
                          <select
                            value={labType}
                            onChange={(e) => {
                              setLabType(e.target.value);
                              setLabProfile(e.target.value === 'Other' ? '__other__' : '');
                            }}
                            required
                          >
                            <option value="">What type of lab?</option>
                            {LAB_TYPES.map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        </div>
                        {labType !== 'Other' && (
                        <div className="full">
                          <label>2 · Package *</label>
                          <select
                            value={labProfile}
                            onChange={(e) => setLabProfile(e.target.value)}
                            required={labType !== 'Other'}
                            disabled={!labType}
                          >
                            <option value="">{labType ? 'Select package…' : 'Pick type first'}</option>
                            {profilesForType(labType).filter((n) => n !== 'Custom / Manual').map((name) => {
                              const master = (testMasterQ.data || []).find((t) => t.name === name);
                              return (
                                <option key={name} value={name}>
                                  {name}{master?.price != null ? ` · ₹${master.price}` : ''}
                                </option>
                              );
                            })}
                            <option value="__other__">Other — not in this list</option>
                          </select>
                        </div>
                        )}
                        {(labType === 'Other' || labProfile === '__other__') && (
                          <>
                            <div className="full">
                              <label>Lab / test name *</label>
                              <input
                                value={otherLabName}
                                onChange={(e) => setOtherLabName(e.target.value)}
                                placeholder="Enter lab name"
                                required
                              />
                            </div>
                            <div className="full">
                              <label>Price ₹ *</label>
                              <input
                                type="number"
                                min="0"
                                value={otherLabPrice}
                                onChange={(e) => setOtherLabPrice(e.target.value)}
                                placeholder="0"
                                required
                              />
                            </div>
                            {otherLabName.trim() && (
                              <p className="ns-hint" style={{ fontSize: 12, color: '#64748b' }}>
                                Report format will include {otherLabName.trim()}, Findings and Impression automatically.
                              </p>
                            )}
                          </>
                        )}
                        <div className="full">
                          <label>Notes</label>
                          <input value={labNotes} onChange={(e) => setLabNotes(e.target.value)} />
                        </div>
                        <div className="full ns-actions">
                          <button type="submit" className="ns-btn primary" disabled={labMut.isPending}>
                            <FlaskConical size={14} /> Request lab
                          </button>
                          <Link to="/lab?desk=nurse_ip" className="ns-btn ghost" style={{ textDecoration: 'none' }}>
                            Open IP lab desk →
                          </Link>
                        </div>
                      </form>
                    )}
                    <div className="ns-table-wrap">
                      <table className="ns-table">
                        <thead>
                          <tr><th>Lab #</th><th>Profile</th><th>Status</th><th>Ordered</th></tr>
                        </thead>
                        <tbody>
                          {!labs.length && <tr><td colSpan={4}>No lab orders for this admission.</td></tr>}
                          {labs.map((l) => (
                            <tr key={l._id || l}>
                              <td>{typeof l === 'object' ? (l.labNumber || '—') : String(l).slice(-6)}</td>
                              <td>{typeof l === 'object' ? (l.testProfile || l.profiles?.join(' + ') || '—') : '—'}</td>
                              <td>
                                <span className={`ns-status ${typeof l === 'object' && l.status === 'completed' ? 'done' : typeof l === 'object' && l.status === 'processing' ? 'acknowledged' : 'pending'}`}>
                                  {typeof l === 'object'
                                    ? (STATUS_LABELS[l.status] || l.status || 'Requested')
                                    : 'linked'}
                                </span>
                              </td>
                              <td>{typeof l === 'object' ? fmtDt(l.createdAt) : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {tab === 'orders' && (
                  <>
                    {canDoctorOrder && (
                      <form
                        className="ns-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (!orderText.trim()) return toast.error('Enter order text');
                          orderMut.mutate({ orderText: orderText.trim(), priority: orderPriority });
                        }}
                      >
                        <div className="full">
                          <label>Doctor order *</label>
                          <textarea
                            rows={2}
                            value={orderText}
                            onChange={(e) => setOrderText(e.target.value)}
                            placeholder="e.g. Inj. Ceftriaxone 1g IV BD × 3 days"
                          />
                        </div>
                        <div>
                          <label>Priority</label>
                          <select value={orderPriority} onChange={(e) => setOrderPriority(e.target.value)}>
                            <option value="routine">Routine</option>
                            <option value="stat">STAT</option>
                          </select>
                        </div>
                        <div className="full ns-actions">
                          <button type="submit" className="ns-btn primary" disabled={orderMut.isPending}>
                            Add order
                          </button>
                        </div>
                      </form>
                    )}
                    <div className="ns-table-wrap">
                      <table className="ns-table">
                        <thead>
                          <tr>
                            <th>Time</th><th>Order</th><th>Priority</th><th>By</th><th>Status</th><th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {!ordersSorted.length && <tr><td colSpan={6}>No doctor orders yet.</td></tr>}
                          {ordersSorted.map((o) => (
                            <tr key={o._id}>
                              <td>{fmtDt(o.orderedAt)}</td>
                              <td>{o.orderText}</td>
                              <td className={o.priority === 'stat' ? 'ns-prio-stat' : ''}>
                                {(o.priority || 'routine').toUpperCase()}
                              </td>
                              <td>{o.orderedBy?.name || '—'}</td>
                              <td><span className={`ns-status ${o.status}`}>{o.status}</span></td>
                              <td>
                                {canAckOrder && o.status === 'pending' && (
                                  <button
                                    type="button"
                                    className="ns-btn"
                                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.72rem' }}
                                    onClick={() => orderUpdateMut.mutate({ orderId: o._id, status: 'acknowledged' })}
                                  >
                                    Ack
                                  </button>
                                )}
                                {canAckOrder && o.status !== 'done' && (
                                  <button
                                    type="button"
                                    className="ns-btn primary"
                                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.72rem', marginLeft: 4 }}
                                    onClick={() => orderUpdateMut.mutate({ orderId: o._id, status: 'done' })}
                                  >
                                    Done
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {/* Print sheet */}
      {admission && (
        <div className="ns-print-sheet ns-print-only">
          <h2 style={{ margin: '0 0 0.25rem' }}>{branding?.hospitalName || 'Hospital'} — Nursing / Treatment Chart</h2>
          <p style={{ margin: 0, fontSize: '0.85rem' }}>
            {admission.patient?.name} · {admission.admissionNumber} · Bed {admission.bed?.bedNumber || '—'} ·{' '}
            Dr. {admission.doctor?.name || '—'} · Printed {fmtDt(new Date())}
          </p>
          {allergies && <p style={{ color: '#991b1b', fontWeight: 700 }}>ALLERGIES: {allergies}</p>}
          <h3>Doctor orders</h3>
          <ul>
            {ordersSorted.map((o) => (
              <li key={o._id}>
                [{(o.priority || '').toUpperCase()}] {o.orderText} — {o.status} ({fmtDt(o.orderedAt)})
              </li>
            ))}
            {!ordersSorted.length && <li>None</li>}
          </ul>
          <h3>Today&apos;s vitals</h3>
          <ul>
            {vitalsSorted.filter((v) => new Date(v.recordedAt) >= todayStart()).map((v) => (
              <li key={v._id}>
                {fmtTime(v.recordedAt)} — BP {v.bloodPressure || '—'}, P {v.pulse ?? '—'}, T {v.temperature ?? '—'},
                SpO2 {v.oxygenSaturation ?? '—'}, RR {v.respiratoryRate ?? '—'}
              </li>
            ))}
            {!vitalsSorted.filter((v) => new Date(v.recordedAt) >= todayStart()).length && <li>None</li>}
          </ul>
          <h3>Today&apos;s medications</h3>
          <ul>
            {medsToday.map((m) => (
              <li key={m._id}>
                {fmtTime(m.administeredAt)} — {m.medicineName} {m.dosage || ''} {m.route || ''} × {m.quantity}
              </li>
            ))}
            {!medsToday.length && <li>None</li>}
          </ul>
          <h3>Recent nursing notes</h3>
          <ul>
            {notesSorted.slice(0, 8).map((n) => (
              <li key={n._id}>{fmtDt(n.recordedAt)} — {n.note}</li>
            ))}
            {!notesSorted.length && <li>None</li>}
          </ul>
        </div>
      )}

      {admission && (
        <>
          <MedicationLogModal
            admission={admission}
            isOpen={showMedModal}
            onClose={() => {
              setShowMedModal(false);
              invalidatePatient();
            }}
          />
          <ServiceUsageModal
            admission={admission}
            isOpen={showProcModal}
            onClose={() => {
              setShowProcModal(false);
              invalidatePatient();
            }}
          />
        </>
      )}
    </div>
  );
}

function OverviewTab({ admission, vitalsSorted, medsToday, ordersSorted, onOpen }) {
  const last = vitalsSorted[0];
  const pending = ordersSorted.filter((o) => o.status !== 'done');
  return (
    <div style={{ display: 'grid', gap: '0.85rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.65rem' }}>
        <StatCard title="Last vitals" value={last ? fmtDt(last.recordedAt) : 'Not recorded'} onClick={() => onOpen('vitals')} />
        <StatCard title="Meds today" value={String(medsToday.length)} onClick={() => onOpen('meds')} />
        <StatCard title="Open orders" value={String(pending.length)} onClick={() => onOpen('orders')} />
        <StatCard title="Admit date" value={fmtDt(admission.admissionDate)} />
      </div>
      {last && (
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--am-muted)' }}>
          Latest: BP {last.bloodPressure || '—'} · Pulse {last.pulse ?? '—'} · Temp {last.temperature ?? '—'} ·
          SpO2 {last.oxygenSaturation ?? '—'}
        </p>
      )}
      {pending.length > 0 && (
        <div>
          <h3 style={{ fontSize: '0.85rem', margin: '0 0 0.4rem' }}>Pending / acknowledged orders</h3>
          <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.85rem' }}>
            {pending.slice(0, 5).map((o) => (
              <li key={o._id}>
                <span className={o.priority === 'stat' ? 'ns-prio-stat' : ''}>
                  [{(o.priority || 'routine').toUpperCase()}]
                </span>{' '}
                {o.orderText}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      style={{
        textAlign: 'left',
        border: '1px solid var(--am-line)',
        borderRadius: 10,
        padding: '0.75rem 0.85rem',
        background: 'var(--am-canvas)',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--am-muted)', textTransform: 'uppercase' }}>
        {title}
      </div>
      <div style={{ fontSize: '1rem', fontWeight: 700, marginTop: 4 }}>{value}</div>
    </button>
  );
}
