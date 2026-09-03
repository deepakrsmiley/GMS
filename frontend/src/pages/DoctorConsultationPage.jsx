import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Bed, CheckCircle2, FlaskConical, Pill, Play, Plus, Save, Settings2, Stethoscope, Trash2, X,
} from 'lucide-react';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import api from '../services/api';
import { hasPermission } from '../constants/permissions';
import {
  LAB_TYPES,
  LAB_PROFILES,
  OTHER_PROFILE,
  expandProfilesToTests,
  getProfileMeta,
  profilesForTypeWithOther,
} from '../constants/labProfiles';
import '../styles/doctorConsult.css';

const FREQ_OPTIONS = ['OD', 'BD', 'TD', 'QD', 'SOS', 'HS', 'AC', 'PC', 'STAT'];
const emptyRxDraft = () => ({
  medicine: '',
  medicineName: '',
  dosage: '',
  frequency: 'BD',
  duration: '5 days',
  quantity: 1,
  instructions: '',
});

const fmtDateTime = (d) => {
  if (!d) return '—';
  const date = new Date(d);
  return `${date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} · ${date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
};

const tokenLabel = (n) => {
  const raw = String(n || '').replace(/^T-?/i, '');
  if (!raw) return '—';
  return `T-${raw.padStart(4, '0')}`;
};

export default function DoctorConsultationPage() {
  const { opId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useSelector((s) => s.auth);
  const canOrderLab = hasPermission(user, 'CREATE_LAB_ORDER');
  const canAdmit = hasPermission(user, 'CREATE_IP_ADMISSION');
  const canLogServices = hasPermission(user, 'CREATE_SERVICE_USAGE');
  const canPrescribe = hasPermission(user, 'CREATE_PRESCRIPTION');

  const [diagnosis, setDiagnosis] = useState('');
  const [notes, setNotes] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [examinationFindings, setExaminationFindings] = useState('');
  const [vitals, setVitals] = useState({
    bloodPressure: '',
    pulse: '',
    temperature: '',
    weight: '',
    oxygenSaturation: '',
  });

  const [showLab, setShowLab] = useState(false);
  const [showProc, setShowProc] = useState(false);
  const [showRx, setShowRx] = useState(false);
  const [sendToPharmacy, setSendToPharmacy] = useState(false);
  const [labType, setLabType] = useState('');
  const [selectedProfiles, setSelectedProfiles] = useState([]);
  const [customLabName, setCustomLabName] = useState('');
  const [pendingProcedures, setPendingProcedures] = useState([]);
  const [procPick, setProcPick] = useState('');
  const [pendingRx, setPendingRx] = useState([]);
  const [rxDraft, setRxDraft] = useState(emptyRxDraft());
  const [medQuery, setMedQuery] = useState('');
  const [medResults, setMedResults] = useState([]);

  const { data: op, isLoading } = useQuery({
    queryKey: ['op', opId],
    queryFn: () => api.get(`/op/${opId}`).then((r) => r.data.data),
    enabled: !!opId,
  });

  const patientId = op?.patient?._id;

  const { data: history } = useQuery({
    queryKey: ['patientHistory', patientId],
    queryFn: () => api.get(`/op/patient/${patientId}/history`).then((r) => r.data.data),
    enabled: !!patientId,
  });

  const { data: priceList = [] } = useQuery({
    queryKey: ['test-master'],
    queryFn: () => api.get('/test-master').then((r) => r.data.data || []),
    staleTime: 60_000,
    enabled: canOrderLab,
  });

  const { data: serviceOptions = [] } = useQuery({
    queryKey: ['service-master'],
    queryFn: () => api.get('/services').then((r) => r.data.data || []),
    staleTime: 60_000,
    enabled: canLogServices,
  });

  const priceMap = useMemo(() => {
    const m = {};
    priceList.forEach((t) => { m[t.name] = t.price; });
    return m;
  }, [priceList]);

  useEffect(() => {
    if (!op) return;
    setDiagnosis(op.diagnosis || '');
    setNotes(op.consultationNotes || '');
    setFollowUp(op.followUpDate ? op.followUpDate.slice(0, 10) : '');
    setExaminationFindings(op.examinationFindings || '');
    if (op.vitals) setVitals((prev) => ({ ...prev, ...op.vitals }));
  }, [op]);

  useEffect(() => {
    if (!canPrescribe || medQuery.trim().length < 2) {
      setMedResults([]);
      return undefined;
    }
    const t = setTimeout(() => {
      api.get(`/pharmacy/search?q=${encodeURIComponent(medQuery.trim())}`)
        .then((r) => setMedResults(r.data.data || []))
        .catch(() => setMedResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [medQuery, canPrescribe]);

  const availableProfiles = useMemo(() => {
    if (!labType) return [];
    if (labType === 'Other') return [OTHER_PROFILE];
    return profilesForTypeWithOther(labType).filter((n) => n !== OTHER_PROFILE);
  }, [labType]);

  const toggleProfile = (name) => {
    setSelectedProfiles((prev) => (
      prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name]
    ));
  };

  const existingLabNames = useMemo(() => {
    const labs = op?.labs || [];
    return [...new Set(
      labs.flatMap((l) => {
        const fromProfiles = Array.isArray(l.profiles) ? l.profiles : [];
        const fromProfile = l.testProfile
          ? String(l.testProfile).split(' + ').map((s) => s.trim()).filter(Boolean)
          : [];
        return [...fromProfiles, ...fromProfile];
      }).filter(Boolean),
    )];
  }, [op?.labs]);

  const existingProcedures = op?.serviceUsages || [];
  const existingRxNames = useMemo(() => {
    const list = op?.prescriptions || [];
    return [...new Set(
      list.flatMap((rx) => (rx.medicines || []).map((m) => m.medicine?.name || m.medicineName || '')).filter(Boolean),
    )];
  }, [op?.prescriptions]);

  const openPanel = (panel) => {
    const nextRx = panel === 'rx' ? !showRx : false;
    setShowLab(panel === 'lab' ? !showLab : false);
    setShowProc(panel === 'proc' ? !showProc : false);
    setShowRx(nextRx);
    if (panel === 'rx' && nextRx) setSendToPharmacy(true);
  };

  const pickMedicine = (med) => {
    setRxDraft((d) => ({
      ...d,
      medicine: med._id,
      medicineName: med.name,
    }));
    setMedQuery(med.name);
    setMedResults([]);
  };

  const addRxLine = () => {
    const name = (rxDraft.medicineName || medQuery).trim();
    if (!name) {
      toast.error('Select or type a medicine');
      return;
    }
    setPendingRx((prev) => [
      ...prev,
      {
        key: `${rxDraft.medicine || name}-${prev.length}`,
        medicine: rxDraft.medicine || undefined,
        medicineName: name,
        dosage: rxDraft.dosage || '',
        frequency: rxDraft.frequency || 'BD',
        duration: rxDraft.duration || '',
        quantity: Number(rxDraft.quantity) || 1,
        instructions: rxDraft.instructions || '',
        route: 'oral',
      },
    ]);
    setSendToPharmacy(true);
    setRxDraft(emptyRxDraft());
    setMedQuery('');
    setMedResults([]);
  };

  const startMut = useMutation({
    mutationFn: () => api.put(`/op/${opId}/status`, { status: 'in_consultation' }),
    onSuccess: () => {
      qc.invalidateQueries(['op', opId]);
      qc.invalidateQueries(['opQueue']);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not start'),
  });

  const autoStarted = React.useRef(false);
  useEffect(() => {
    autoStarted.current = false;
  }, [opId]);
  useEffect(() => {
    if (op?.status === 'waiting' && !autoStarted.current) {
      autoStarted.current = true;
      startMut.mutate();
    }
  }, [op?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveMut = useMutation({
    mutationFn: async () => {
      const normalizedVitals = Object.fromEntries(
        Object.entries(vitals).map(([key, value]) => {
          if (value === '') return [key, undefined];
          if (key === 'bloodPressure') return [key, value];
          const numeric = Number.parseFloat(String(value).replace(/[^\d.]/g, ''));
          return [key, Number.isFinite(numeric) ? numeric : undefined];
        }),
      );

      const profilePrices = {};
      selectedProfiles.forEach((name) => {
        profilePrices[name] = priceMap[name] ?? 0;
      });

      let labPayload = null;
      if (canOrderLab && (selectedProfiles.length || (labType === 'Other' && customLabName.trim()))) {
        let profiles = [...selectedProfiles];
        let tests;
        let totalAmount;
        let labTypeOut = labType || getProfileMeta(profiles[0] || '')?.labType || 'Other';

        if (labType === 'Other' && customLabName.trim()) {
          const name = customLabName.trim();
          profiles = [name];
          tests = [{ testName: name, price: Number(priceMap[name]) || 0, profileName: name }];
          totalAmount = Number(priceMap[name]) || 0;
          labTypeOut = 'Other';
        } else {
          const expanded = expandProfilesToTests(profiles, profilePrices);
          tests = expanded.tests;
          totalAmount = expanded.totalAmount;
        }

        if (tests?.length) {
          labPayload = {
            patient: patientId,
            profiles,
            testProfile: profiles.join(' + '),
            tests,
            totalAmount,
            sampleType: getProfileMeta(profiles[0] || '')?.sampleType || 'blood',
            priority: 'routine',
            labType: labTypeOut,
            opRegistration: opId,
            orderSource: 'doctor',
            doctor: op?.doctor?._id || op?.doctor || user?.id,
          };
        }
      }

      const hasLab = !!labPayload;
      const hasRx = canPrescribe && pendingRx.length > 0;
      const goPharmacy = canPrescribe && (sendToPharmacy || hasRx);

      // Pharmacy send → pharmacy prescriptions queue; lab-only → lab desk.
      let nextStatus = 'consultation_completed';
      if (goPharmacy) nextStatus = 'sent_to_pharmacy';
      else if (hasLab) nextStatus = 'sent_to_lab';
      else if (pendingProcedures.length) nextStatus = 'consultation_completed';

      await api.put(`/op/${opId}/consultation`, {
        diagnosis,
        consultationNotes: notes,
        vitals: normalizedVitals,
        followUpDate: followUp || undefined,
        examinationFindings,
        investigationsAdvised: [
          ...(selectedProfiles.length ? selectedProfiles : []),
          ...(labType === 'Other' && customLabName.trim() ? [customLabName.trim()] : []),
        ].join(', ') || undefined,
        status: nextStatus,
      });

      if (labPayload) {
        await api.post('/lab', labPayload);
      }

      if (canLogServices && pendingProcedures.length) {
        await Promise.all(
          pendingProcedures.map((p) => api.post(`/op/${opId}/service-usage`, {
            serviceName: p.serviceName,
            category: p.category,
            chargeType: p.chargeType,
            quantity: p.quantity,
            unitPrice: p.unitPrice,
            notes: p.notes || '',
          })),
        );
      }

      // Always create / refresh Rx when sending to pharmacy so pharmacist sees the visit.
      if (goPharmacy) {
        await api.post('/prescriptions', {
          patient: patientId,
          doctor: op?.doctor?._id || op?.doctor || user?.id,
          opRegistration: opId,
          diagnosis: diagnosis || undefined,
          advice: notes || undefined,
          followUpDate: followUp || undefined,
          medicines: pendingRx.map((m) => ({
            medicine: m.medicine || undefined,
            medicineName: m.medicineName,
            dosage: m.dosage,
            frequency: m.frequency,
            duration: m.duration,
            quantity: m.quantity,
            instructions: m.instructions,
            route: m.route || 'oral',
          })),
        });
        // Ensure queue status is pharmacy even if lab create ran earlier.
        await api.put(`/op/${opId}/status`, { status: 'sent_to_pharmacy' });
      }
    },
    onSuccess: () => {
      const bits = [];
      if (sendToPharmacy || pendingRx.length) bits.push('sent to Pharmacy queue');
      if (selectedProfiles.length || customLabName.trim()) bits.push('lab → lab desk');
      if (pendingProcedures.length) bits.push('procedures saved');
      toast.success(bits.length ? `Saved — ${bits.join(' · ')}` : 'Consultation saved');
      qc.invalidateQueries(['opQueue']);
      qc.invalidateQueries(['op', opId]);
      qc.invalidateQueries(['labTests']);
      qc.invalidateQueries(['opPharmacyPending']);
      navigate('/op-queue');
    },
    onError: (err) => toast.error(err.response?.data?.message || err.message || 'Save failed'),
  });

  const addProcedure = () => {
    const svc = serviceOptions.find((s) => s._id === procPick);
    if (!svc) {
      toast.error('Select a procedure / service');
      return;
    }
    if (pendingProcedures.some((p) => p.serviceId === svc._id)) {
      toast.error('Already added');
      return;
    }
    setPendingProcedures((prev) => [
      ...prev,
      {
        serviceId: svc._id,
        serviceName: svc.name,
        category: svc.category || 'Procedure',
        chargeType: svc.chargeType || 'per_use',
        quantity: 1,
        unitPrice: Number(svc.defaultPrice) || 0,
      },
    ]);
    setProcPick('');
  };

  if (isLoading || !op) {
    return <div className="p-8 text-center text-slate-400">Loading consultation…</div>;
  }

  const patient = op.patient || history?.patient;

  return (
    <div className="dc">
      <div className="dc-top">
        <button type="button" className="dc-back" onClick={() => navigate('/op-queue')}>
          <ArrowLeft size={16} /> Back to queue
        </button>
        <div className="dc-title-block">
          <h1 className="dc-title">
            <Stethoscope size={22} />
            Doctor Consultation
          </h1>
          <p className="dc-sub">
            Prescription → Pharmacy · Lab → Lab Technician · Save returns to Doctor Queue
          </p>
        </div>
        <div className="dc-top-actions">
          {op.status === 'waiting' && (
            <button type="button" className="dc-btn dc-btn-ghost" onClick={() => startMut.mutate()} disabled={startMut.isPending}>
              <Play size={15} /> Start
            </button>
          )}
          {canAdmit && patientId && (
            <button
              type="button"
              className="dc-btn dc-btn-admit"
              onClick={() => navigate(`/ip-admissions?patient=${patientId}&op=${opId}`)}
            >
              <Bed size={15} /> Admit IP
            </button>
          )}
        </div>
      </div>

      <div className="dc-hero">
        <div>
          <div className="dc-hero-k">Patient</div>
          <div className="dc-hero-v">{patient?.name || '—'}</div>
        </div>
        <div>
          <div className="dc-hero-k">Token</div>
          <div className="dc-hero-v"><span className="dc-hero-token">{tokenLabel(op.tokenNumber)}</span></div>
        </div>
        <div>
          <div className="dc-hero-k">OP date &amp; time</div>
          <div className="dc-hero-v">{fmtDateTime(op.tokenDate || op.createdAt)}</div>
        </div>
        <div>
          <div className="dc-hero-k">UHID · Age / Sex</div>
          <div className="dc-hero-v">
            {patient?.patientId || '—'} · {patient?.age ?? '—'} / {patient?.gender || '—'}
          </div>
        </div>
        <div>
          <div className="dc-hero-k">Department</div>
          <div className="dc-hero-v">{op.department?.name || 'OPD'}</div>
        </div>
        <div>
          <div className="dc-hero-k">Complaint</div>
          <div className="dc-hero-v">{op.chiefComplaint || '—'}</div>
        </div>
      </div>

      <div className="dc-grid">
        <div className="dc-main">
          <div className="dc-card">
            <div className="dc-card-head">
              <h3 className="dc-card-title"><Stethoscope size={16} /> Clinical assessment</h3>
            </div>
            <div className="dc-card-body">
              <div className="dc-field">
                <label className="dc-label">Diagnosis</label>
                <input
                  className="dc-input"
                  value={diagnosis}
                  onChange={(e) => setDiagnosis(e.target.value)}
                  placeholder="Primary diagnosis / clinical impression"
                />
              </div>
              <div className="dc-field">
                <label className="dc-label">Clinical notes</label>
                <textarea
                  className="dc-textarea"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="History, advice, plan…"
                />
              </div>
              <div className="dc-field">
                <label className="dc-label">O/E (examination)</label>
                <textarea
                  className="dc-textarea"
                  value={examinationFindings}
                  onChange={(e) => setExaminationFindings(e.target.value)}
                  rows={2}
                  placeholder="Examination findings"
                />
              </div>
              <div className="dc-field">
                <label className="dc-label">Vitals</label>
                <div className="dc-vitals">
                  {Object.entries(vitals).map(([k, v]) => (
                    <div key={k}>
                      <label className="dc-label" style={{ textTransform: 'none', letterSpacing: 0 }}>
                        {k.replace(/([A-Z])/g, ' $1')}
                      </label>
                      <input
                        className="dc-input"
                        value={v ?? ''}
                        onChange={(e) => setVitals({ ...vitals, [k]: e.target.value })}
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div className="dc-field">
                <label className="dc-label">Follow-up date</label>
                <input
                  type="date"
                  className="dc-input"
                  value={followUp}
                  onChange={(e) => setFollowUp(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="dc-card">
            <div className="dc-card-head">
              <h3 className="dc-card-title"><Pill size={16} /> Send orders</h3>
              <span className="dc-card-meta">Pharmacy · Lab · Procedure — save routes each desk</span>
            </div>
            <div className="dc-card-body">
              <div className="dc-panel-toggle">
                {canPrescribe && (
                  <button
                    type="button"
                    className={`dc-btn dc-btn-ghost ${showRx ? 'is-on' : ''}`}
                    onClick={() => openPanel('rx')}
                  >
                    <Pill size={15} /> Pharmacy
                  </button>
                )}
                {canOrderLab && (
                  <button
                    type="button"
                    className={`dc-btn dc-btn-ghost ${showLab ? 'is-on' : ''}`}
                    onClick={() => openPanel('lab')}
                  >
                    <FlaskConical size={15} /> Lab
                  </button>
                )}
                {canLogServices && (
                  <button
                    type="button"
                    className={`dc-btn dc-btn-ghost ${showProc ? 'is-on' : ''}`}
                    onClick={() => openPanel('proc')}
                  >
                    <Settings2 size={15} /> Procedure
                  </button>
                )}
              </div>

              {showRx && canPrescribe && (
                <div>
                  <label className={`dc-send-toggle ${sendToPharmacy ? 'is-on' : ''}`}>
                    <input
                      type="checkbox"
                      checked={sendToPharmacy}
                      onChange={(e) => setSendToPharmacy(e.target.checked)}
                    />
                    <span>
                      <strong>Send to Pharmacy queue</strong>
                      <em>After save, pharmacist sees this patient under OP Prescriptions to give medicine &amp; bill</em>
                    </span>
                  </label>

                  <label className="dc-label" style={{ marginTop: 14 }}>Add medicines (optional)</label>
                  <div style={{ position: 'relative', marginBottom: 10 }}>
                    <input
                      className="dc-input"
                      value={medQuery}
                      onChange={(e) => {
                        setMedQuery(e.target.value);
                        setRxDraft((d) => ({ ...d, medicine: '', medicineName: e.target.value }));
                      }}
                      placeholder="Type medicine name…"
                    />
                    {medResults.length > 0 && (
                      <div className="dc-suggest">
                        {medResults.slice(0, 8).map((med) => (
                          <button key={med._id} type="button" onClick={() => pickMedicine(med)}>
                            <strong>{med.name}</strong>
                            <span>{med.genericName || med.category || 'Medicine'}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="dc-vitals" style={{ marginBottom: 10 }}>
                    <div>
                      <label className="dc-label" style={{ textTransform: 'none' }}>Dosage</label>
                      <input
                        className="dc-input"
                        value={rxDraft.dosage}
                        onChange={(e) => setRxDraft((d) => ({ ...d, dosage: e.target.value }))}
                        placeholder="1-0-1"
                      />
                    </div>
                    <div>
                      <label className="dc-label" style={{ textTransform: 'none' }}>Frequency</label>
                      <select
                        className="dc-select"
                        value={rxDraft.frequency}
                        onChange={(e) => setRxDraft((d) => ({ ...d, frequency: e.target.value }))}
                      >
                        {FREQ_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="dc-label" style={{ textTransform: 'none' }}>Duration</label>
                      <input
                        className="dc-input"
                        value={rxDraft.duration}
                        onChange={(e) => setRxDraft((d) => ({ ...d, duration: e.target.value }))}
                        placeholder="5 days"
                      />
                    </div>
                    <div>
                      <label className="dc-label" style={{ textTransform: 'none' }}>Qty</label>
                      <input
                        type="number"
                        min="1"
                        className="dc-input"
                        value={rxDraft.quantity}
                        onChange={(e) => setRxDraft((d) => ({ ...d, quantity: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="dc-field">
                    <label className="dc-label">Instructions</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        className="dc-input"
                        value={rxDraft.instructions}
                        onChange={(e) => setRxDraft((d) => ({ ...d, instructions: e.target.value }))}
                        placeholder="After food / before food…"
                      />
                      <button type="button" className="dc-btn dc-btn-ghost" onClick={addRxLine}>
                        <Plus size={15} /> Add
                      </button>
                    </div>
                  </div>

                  {pendingRx.length > 0 ? (
                    <div className="dc-proc-list">
                      {pendingRx.map((m) => (
                        <div key={m.key} className="dc-proc-row" style={{ gridTemplateColumns: '1fr auto' }}>
                          <div>
                            <div className="dc-proc-name">{m.medicineName}</div>
                            <div className="dc-proc-cat">
                              {[m.dosage, m.frequency, m.duration, m.quantity ? `Qty ${m.quantity}` : '']
                                .filter(Boolean).join(' · ')}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="dc-proc-remove"
                            onClick={() => setPendingRx((prev) => prev.filter((x) => x.key !== m.key))}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="dc-empty">
                      {sendToPharmacy
                        ? 'Medicines optional — Save sends this patient to Pharmacy OP Prescriptions queue.'
                        : 'Turn on “Send to Pharmacy queue”, add medicines if needed, then Save.'}
                    </p>
                  )}
                </div>
              )}

              {showLab && canOrderLab && (
                <div>
                  <label className="dc-label">1 · Lab type</label>
                  <div className="dc-type-grid">
                    {LAB_TYPES.map((t) => (
                      <button
                        key={t}
                        type="button"
                        className={`dc-chip ${labType === t ? 'is-on' : ''}`}
                        onClick={() => {
                          setLabType(t);
                          setSelectedProfiles([]);
                          setCustomLabName('');
                        }}
                      >
                        {t}
                      </button>
                    ))}
                  </div>

                  {labType && labType !== 'Other' && (
                    <>
                      <label className="dc-label">2 · Packages &amp; parameters</label>
                      <div className="dc-profiles">
                        {availableProfiles.map((name) => {
                          const checked = selectedProfiles.includes(name);
                          const meta = LAB_PROFILES[name];
                          const params = meta?.tests || [];
                          return (
                            <label key={name} className={`dc-profile ${checked ? 'is-on' : ''}`}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleProfile(name)}
                              />
                              <span className="dc-profile-body">
                                <span className="dc-profile-name">{name}</span>
                                <span className="dc-profile-meta">
                                  {meta?.labType || labType}
                                  {params.length ? ` · ${params.length} parameters` : ''}
                                  {priceMap[name] != null ? ` · ₹${priceMap[name]}` : ''}
                                </span>
                                {checked && params.length > 0 && (
                                  <span className="dc-params">
                                    {params.slice(0, 12).map((p) => (
                                      <span key={p.testName} className="dc-param">{p.testName}</span>
                                    ))}
                                    {params.length > 12 && (
                                      <span className="dc-param">+{params.length - 12} more</span>
                                    )}
                                  </span>
                                )}
                              </span>
                            </label>
                          );
                        })}
                        {!availableProfiles.length && (
                          <p className="dc-empty">No packages for this lab type.</p>
                        )}
                      </div>
                    </>
                  )}

                  {labType === 'Other' && (
                    <div className="dc-field">
                      <label className="dc-label">2 · Other lab name</label>
                      <input
                        className="dc-input"
                        value={customLabName}
                        onChange={(e) => setCustomLabName(e.target.value)}
                        placeholder="Type lab / test name"
                      />
                    </div>
                  )}

                  {(selectedProfiles.length > 0 || customLabName.trim()) && (
                    <div className="dc-staged">
                      <div className="dc-staged-title">Selected labs</div>
                      <div className="dc-tags">
                        {selectedProfiles.map((name) => (
                          <span key={name} className="dc-tag">
                            {name}
                            <button type="button" aria-label={`Remove ${name}`} onClick={() => toggleProfile(name)}>
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                        {customLabName.trim() && (
                          <span className="dc-tag">
                            {customLabName.trim()}
                            <button type="button" aria-label="Clear" onClick={() => setCustomLabName('')}>
                              <X size={12} />
                            </button>
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {showProc && canLogServices && (
                <div>
                  <label className="dc-label">Select procedure / equipment</label>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <select
                      className="dc-select"
                      value={procPick}
                      onChange={(e) => setProcPick(e.target.value)}
                    >
                      <option value="">— Choose from rate list —</option>
                      {serviceOptions.map((s) => (
                        <option key={s._id} value={s._id}>
                          {s.name} · ₹{s.defaultPrice} · {s.category}
                        </option>
                      ))}
                    </select>
                    <button type="button" className="dc-btn dc-btn-ghost" onClick={addProcedure}>
                      <Plus size={15} /> Add
                    </button>
                  </div>

                  {pendingProcedures.length > 0 ? (
                    <div className="dc-proc-list">
                      {pendingProcedures.map((p) => (
                        <div key={p.serviceId} className="dc-proc-row">
                          <div>
                            <div className="dc-proc-name">{p.serviceName}</div>
                            <div className="dc-proc-cat">{p.category}</div>
                          </div>
                          <div className="dc-proc-price">₹{p.unitPrice}</div>
                          <button
                            type="button"
                            className="dc-proc-remove"
                            onClick={() => setPendingProcedures((prev) => prev.filter((x) => x.serviceId !== p.serviceId))}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="dc-empty">No procedures staged yet.</p>
                  )}
                </div>
              )}

              {!showLab && !showProc && !showRx && (
                <p className="dc-empty">
                  Click <strong>Pharmacy</strong> to send patient for medicines &amp; billing,
                  <strong> Lab</strong> for lab desk, or <strong>Procedure</strong>.
                </p>
              )}

              {(existingLabNames.length > 0 || existingProcedures.length > 0 || existingRxNames.length > 0) && (
                <div className="dc-staged" style={{ marginTop: 16 }}>
                  <div className="dc-staged-title">Already on this visit</div>
                  <div className="dc-tags">
                    {existingRxNames.map((n) => (
                      <span key={`rx-${n}`} className="dc-tag dc-tag--rx">{n}</span>
                    ))}
                    {existingLabNames.map((n) => (
                      <span key={`lab-${n}`} className="dc-tag">{n}</span>
                    ))}
                    {existingProcedures.map((u) => (
                      <span key={u._id || u.serviceName} className="dc-tag dc-tag--proc">{u.serviceName}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="dc-footer-bar">
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>
                Ready to save
              </div>
              <div style={{ fontSize: 13, color: '#0f172a', fontWeight: 650 }}>
                {[
                  diagnosis ? 'Diagnosis' : null,
                  (sendToPharmacy || pendingRx.length) ? `Pharmacy send${pendingRx.length ? ` · ${pendingRx.length} Rx` : ''}` : null,
                  selectedProfiles.length || customLabName.trim() ? `${selectedProfiles.length + (customLabName.trim() ? 1 : 0)} lab → lab desk` : null,
                  pendingProcedures.length ? `${pendingProcedures.length} procedure(s)` : null,
                ].filter(Boolean).join(' · ') || 'Add diagnosis / Pharmacy / Lab / Procedure'}
              </div>
            </div>
            <button
              type="button"
              className="dc-btn dc-btn-ghost"
              onClick={() => navigate('/op-queue')}
            >
              Cancel
            </button>
            <button
              type="button"
              className="dc-btn dc-btn-primary"
              disabled={saveMut.isPending}
              onClick={() => saveMut.mutate()}
            >
              <Save size={15} />
              {saveMut.isPending ? 'Saving…' : 'Save & return'}
            </button>
          </div>
        </div>

        <aside className="dc-side">
          <div className="dc-card">
            <div className="dc-card-head">
              <h3 className="dc-card-title"><CheckCircle2 size={16} /> Visit summary</h3>
            </div>
            <div className="dc-card-body">
              <div className="dc-summary-block">
                <div className="dc-summary-label">Diagnosis</div>
                <div className="dc-summary-text">{diagnosis || <span className="dc-empty">Not entered</span>}</div>
              </div>
              <div className="dc-summary-block">
                <div className="dc-summary-label">Pharmacy send</div>
                <div className="dc-summary-text">
                  {sendToPharmacy || pendingRx.length
                    ? `Yes — patient will appear in Pharmacy → OP Prescriptions`
                    : 'Off'}
                </div>
                <div className="dc-tags" style={{ marginTop: 8 }}>
                  {pendingRx.map((m) => (
                    <span key={m.key} className="dc-tag dc-tag--rx">{m.medicineName}</span>
                  ))}
                  {!pendingRx.length && sendToPharmacy && (
                    <span className="dc-empty">No meds listed — pharmacist can add</span>
                  )}
                </div>
              </div>
              <div className="dc-summary-block">
                <div className="dc-summary-label">Labs (→ Lab desk)</div>
                <div className="dc-tags">
                  {selectedProfiles.map((n) => <span key={n} className="dc-tag">{n}</span>)}
                  {customLabName.trim() && <span className="dc-tag">{customLabName.trim()}</span>}
                  {!selectedProfiles.length && !customLabName.trim() && <span className="dc-empty">None</span>}
                </div>
              </div>
              <div className="dc-summary-block">
                <div className="dc-summary-label">Procedures (this visit)</div>
                <div className="dc-tags">
                  {pendingProcedures.map((p) => (
                    <span key={p.serviceId} className="dc-tag dc-tag--proc">{p.serviceName}</span>
                  ))}
                  {!pendingProcedures.length && <span className="dc-empty">None</span>}
                </div>
              </div>
            </div>
          </div>

          <div className="dc-card">
            <div className="dc-card-head">
              <h3 className="dc-card-title">Medical history</h3>
            </div>
            <div className="dc-card-body">
              <div className="dc-summary-block">
                <div className="dc-summary-label" style={{ color: '#dc2626' }}>Allergies</div>
                <div className="dc-summary-text">
                  {history?.allergies?.length ? history.allergies.join(', ') : 'None recorded'}
                </div>
              </div>
              <div className="dc-summary-block">
                <div className="dc-summary-label" style={{ color: '#d97706' }}>Chronic</div>
                <div className="dc-summary-text">
                  {history?.chronicDiseases?.length ? history.chronicDiseases.join(', ') : 'None recorded'}
                </div>
              </div>
              <div className="dc-summary-block">
                <div className="dc-summary-label">Previous visits</div>
                {(history?.previousVisits || []).slice(0, 4).map((v) => (
                  <div key={v._id} className="dc-history-item">
                    {new Date(v.tokenDate).toLocaleDateString('en-GB')} — Dr. {v.doctor?.name || '—'}
                    {v.diagnosis ? ` · ${v.diagnosis}` : ''}
                  </div>
                ))}
                {!(history?.previousVisits || []).length && <p className="dc-empty">No prior visits</p>}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
