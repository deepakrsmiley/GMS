import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Wrench, Plus, QrCode, CheckCircle2, RefreshCw,
} from 'lucide-react';
import api from '../services/api';
import bems from '../services/bemsApi';
import Modal from '../components/common/Modal';
import '../styles/bems.css';

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'pm', label: 'Preventive PM' },
  { id: 'calibration', label: 'Calibration' },
  { id: 'electrical', label: 'Electrical Safety' },
  { id: 'work-orders', label: 'Work Orders' },
  { id: 'complaints', label: 'Complaints' },
  { id: 'spares', label: 'Spare Parts' },
  { id: 'vendors', label: 'Vendors' },
  { id: 'contracts', label: 'AMC / CMC' },
  { id: 'movement', label: 'Movement' },
  { id: 'qr', label: 'QR Lookup' },
  { id: 'reports', label: 'Reports' },
];

const SCHEDULE_TYPES = ['Every 30 Days', 'Every 90 Days', 'Every 6 Months', 'Every Year'];
const SPARE_CATEGORIES = [
  'Battery', 'Fuse', 'Probe', 'Cable', 'Sensor', 'Display', 'Motherboard',
  'PCB', 'Power Supply', 'Motor', 'Valve', 'Fan', 'Other',
];
const LIFECYCLE_STAGES = [
  'Purchase Request', 'Purchase Order', 'Received', 'Installation',
  'Commissioning', 'Department Assignment', 'In Service', 'Upgrade',
  'Transfer', 'Condemned', 'Disposed',
];

const fmt = (d) => (d ? new Date(d).toLocaleDateString() : '—');
const fmtDt = (d) => (d ? new Date(d).toLocaleString() : '—');

function Kpi({ label, value, tone }) {
  return (
    <div className={`bems-kpi${tone ? ` bems-kpi--${tone}` : ''}`}>
      <div className="bems-kpi__label">{label}</div>
      <div className="bems-kpi__value">{value ?? 0}</div>
    </div>
  );
}

function Badge({ children, tone }) {
  return <span className={`bems-badge${tone ? ` bems-badge--${tone}` : ''}`}>{children}</span>;
}

export default function BiomedicalPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'dashboard';
  const setTab = (id) => setParams({ tab: id });
  const qc = useQueryClient();

  const [modal, setModal] = useState(null);
  const [qrCode, setQrCode] = useState('');
  const [qrResult, setQrResult] = useState(null);
  const [reportType, setReportType] = useState('register');

  useEffect(() => {
    bems.seedDefaults().catch(() => {});
  }, []);

  const { data: dash, isLoading: dashLoading, refetch: refetchDash } = useQuery({
    queryKey: ['bems-dashboard'],
    queryFn: async () => (await bems.dashboard()).data.data,
    enabled: tab === 'dashboard',
    refetchInterval: 60000,
  });

  const { data: equipment = [] } = useQuery({
    queryKey: ['bems-equipment'],
    queryFn: async () => (await api.get('/assets')).data.data || [],
    enabled: ['equipment', 'pm', 'calibration', 'electrical', 'work-orders', 'movement', 'contracts'].includes(tab),
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments-list'],
    queryFn: async () => (await api.get('/departments')).data.data || [],
    enabled: ['equipment', 'movement'].includes(tab),
  });

  const { data: pmList = [], refetch: refetchPm } = useQuery({
    queryKey: ['bems-pm'],
    queryFn: async () => (await bems.listPm()).data.data || [],
    enabled: tab === 'pm',
  });

  const { data: calList = [] } = useQuery({
    queryKey: ['bems-cal'],
    queryFn: async () => (await bems.listCalibrations()).data.data || [],
    enabled: tab === 'calibration',
  });

  const { data: estList = [] } = useQuery({
    queryKey: ['bems-est'],
    queryFn: async () => (await bems.listElectricalSafety()).data.data || [],
    enabled: tab === 'electrical',
  });

  const { data: workOrders = [] } = useQuery({
    queryKey: ['bems-wo'],
    queryFn: async () => (await bems.listWorkOrders()).data.data || [],
    enabled: tab === 'work-orders',
  });

  const { data: complaints = [] } = useQuery({
    queryKey: ['bems-complaints'],
    queryFn: async () => (await api.get('/asset-complaints')).data.data || [],
    enabled: tab === 'complaints',
  });

  const { data: spares = [] } = useQuery({
    queryKey: ['bems-spares'],
    queryFn: async () => (await bems.listSpares()).data.data || [],
    enabled: tab === 'spares',
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ['bems-vendors'],
    queryFn: async () => (await bems.listVendors()).data.data || [],
    enabled: ['vendors', 'contracts'].includes(tab),
  });

  const { data: contracts = [] } = useQuery({
    queryKey: ['bems-contracts'],
    queryFn: async () => (await bems.listContracts()).data.data || [],
    enabled: tab === 'contracts',
  });

  const { data: movements = [] } = useQuery({
    queryKey: ['bems-movements'],
    queryFn: async () => (await bems.listMovements()).data.data || [],
    enabled: tab === 'movement',
  });

  const { data: reportData, isFetching: reportLoading } = useQuery({
    queryKey: ['bems-report', reportType],
    queryFn: async () => (await bems.reports(reportType)).data,
    enabled: tab === 'reports',
  });

  const invalidate = (...keys) => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

  const schedulePmMut = useMutation({
    mutationFn: (body) => bems.schedulePm(body),
    onSuccess: () => {
      toast.success('PM scheduled — equipment master updated');
      setModal(null);
      invalidate('bems-pm', 'bems-dashboard', 'bems-equipment', 'bems-wo');
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed to schedule PM'),
  });

  const completePmMut = useMutation({
    mutationFn: ({ id, body }) => bems.completePm(id, body),
    onSuccess: () => {
      toast.success('PM completed — next due date auto-updated');
      invalidate('bems-pm', 'bems-dashboard', 'bems-equipment');
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  });

  const calMut = useMutation({
    mutationFn: (body) => bems.createCalibration(body),
    onSuccess: () => {
      toast.success('Calibration recorded — master updated');
      setModal(null);
      invalidate('bems-cal', 'bems-dashboard', 'bems-equipment');
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  });

  const estMut = useMutation({
    mutationFn: (body) => bems.createElectricalSafety(body),
    onSuccess: () => {
      toast.success('Electrical safety test saved');
      setModal(null);
      invalidate('bems-est', 'bems-dashboard', 'bems-equipment');
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  });

  const spareMut = useMutation({
    mutationFn: (body) => bems.createSpare(body),
    onSuccess: () => {
      toast.success('Spare part added');
      setModal(null);
      invalidate('bems-spares');
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  });

  const vendorMut = useMutation({
    mutationFn: (body) => bems.createVendor(body),
    onSuccess: () => {
      toast.success('Vendor added');
      setModal(null);
      invalidate('bems-vendors');
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  });

  const contractMut = useMutation({
    mutationFn: (body) => bems.createContract(body),
    onSuccess: () => {
      toast.success('Contract saved — equipment AMC/CMC dates synced');
      setModal(null);
      invalidate('bems-contracts', 'bems-equipment', 'bems-dashboard');
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  });

  const moveMut = useMutation({
    mutationFn: (body) => bems.createMovement(body),
    onSuccess: () => {
      toast.success('Movement recorded — location history preserved');
      setModal(null);
      invalidate('bems-movements', 'bems-equipment');
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  });

  const lifecycleMut = useMutation({
    mutationFn: ({ id, body }) => bems.advanceLifecycle(id, body),
    onSuccess: () => {
      toast.success('Lifecycle stage updated');
      setModal(null);
      invalidate('bems-equipment', 'bems-dashboard');
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  });

  const woMut = useMutation({
    mutationFn: ({ id, body }) => bems.updateWorkOrder(id, body),
    onSuccess: () => {
      toast.success('Work order updated');
      invalidate('bems-wo', 'bems-dashboard', 'bems-spares');
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  });

  const equipmentOptions = useMemo(
    () => equipment.map((e) => ({ value: e._id, label: `${e.assetId} — ${e.name}` })),
    [equipment]
  );

  const lookupQr = async () => {
    if (!qrCode.trim()) return;
    try {
      const res = await bems.byQr(qrCode.trim());
      setQrResult(res.data.data);
      toast.success('Equipment found');
    } catch (e) {
      setQrResult(null);
      toast.error(e?.response?.data?.message || 'Not found');
    }
  };

  const printReport = () => window.print();

  return (
    <div className="bems">
      <div className="bems-head">
        <div>
          <p className="bems-head__eyebrow">Biomedical Engineering · NABH / JCI</p>
          <h1 className="bems-head__title">
            <Wrench size={18} />
            Biomedical Engineering
          </h1>
          <p className="bems-head__sub">
            Equipment lifecycle, PM, calibration, work orders &amp; compliance
          </p>
        </div>
        {tab === 'dashboard' && (
          <button type="button" className="bems-btn" onClick={() => refetchDash()}>
            <RefreshCw size={14} /> Refresh
          </button>
        )}
      </div>

      <div className="bems-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`bems-tab${tab === t.id ? ' is-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'dashboard' && (
        <>
          {dashLoading && <div className="bems-empty">Loading dashboard…</div>}
          {dash && (
            <>
              <div className="bems-kpis">
                <Kpi label="Total Equipment" value={dash.totalEquipment} tone="accent" />
                <Kpi label="Working" value={dash.working} tone="ok" />
                <Kpi label="In Use" value={dash.inUse} />
                <Kpi label="Idle" value={dash.idle} />
                <Kpi label="PM Due Today" value={dash.pmDueToday} tone="warn" />
                <Kpi label="PM Overdue" value={dash.pmOverdue} tone="bad" />
                <Kpi label="Calibration Due" value={dash.calibrationDue} tone="warn" />
                <Kpi label="Calibration Overdue" value={dash.calibrationOverdue} tone="bad" />
                <Kpi label="EST Due" value={dash.electricalSafetyDue} tone="warn" />
                <Kpi label="Open Complaints" value={dash.openComplaints} tone="bad" />
                <Kpi label="Closed Complaints" value={dash.closedComplaints} tone="ok" />
                <Kpi label="Under Repair" value={dash.underRepair} tone="warn" />
                <Kpi label="Breakdown" value={dash.breakdown} tone="bad" />
                <Kpi label="Pending WOs" value={dash.pendingWorkOrders} tone="warn" />
                <Kpi label="Vendor Visits Today" value={dash.vendorVisitsScheduled} />
                <Kpi label="AMC Expiring" value={dash.amcExpiry} tone="warn" />
                <Kpi label="CMC Expiring" value={dash.cmcExpiry} tone="warn" />
                <Kpi label="Warranty Expiring" value={dash.warrantyExpiry} tone="warn" />
                <Kpi label="Downtime (hrs)" value={dash.equipmentDowntime} />
                <Kpi label="MTBF" value={dash.mtbf ?? '—'} />
                <Kpi label="MTTR (hrs)" value={dash.mttr} />
              </div>

              <div className="bems-grid-2">
                <div className="bems-panel">
                  <div className="bems-panel__head"><h3>Top Frequently Failed</h3></div>
                  <div className="bems-panel__body">
                    <table className="bems-table">
                      <thead><tr><th>Equipment</th><th>Failures</th><th>Status</th></tr></thead>
                      <tbody>
                        {(dash.topFailedEquipment || []).map((e) => (
                          <tr key={e._id}>
                            <td>{e.assetId} — {e.name}</td>
                            <td>{e.failureCount}</td>
                            <td><Badge tone="bad">{e.status}</Badge></td>
                          </tr>
                        ))}
                        {!dash.topFailedEquipment?.length && (
                          <tr><td colSpan={3} className="bems-empty">No failure data yet</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="bems-panel">
                  <div className="bems-panel__head"><h3>Spare Parts Low Stock</h3></div>
                  <div className="bems-panel__body">
                    <table className="bems-table">
                      <thead><tr><th>Part</th><th>Stock</th><th>Reorder</th></tr></thead>
                      <tbody>
                        {(dash.sparePartsLowStock || []).map((s) => (
                          <tr key={s._id}>
                            <td>{s.partCode} — {s.name}</td>
                            <td><Badge tone="bad">{s.stock}</Badge></td>
                            <td>{s.reorderLevel}</td>
                          </tr>
                        ))}
                        {!dash.sparePartsLowStock?.length && (
                          <tr><td colSpan={3} className="bems-empty">Stock levels OK</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="bems-panel">
                  <div className="bems-panel__head"><h3>Department-wise Equipment</h3></div>
                  <div className="bems-panel__body">
                    <table className="bems-table">
                      <thead><tr><th>Department</th><th>Count</th></tr></thead>
                      <tbody>
                        {(dash.byDepartment || []).map((d) => (
                          <tr key={String(d._id)}><td>{d.name}</td><td>{d.count}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="bems-panel">
                  <div className="bems-panel__head"><h3>Recent Activities</h3></div>
                  <div className="bems-panel__body">
                    <ul className="bems-activity">
                      {(dash.recentActivities || []).map((a) => (
                        <li key={a._id}>
                          <strong>{a.title}</strong>
                          <span>{a.equipment?.assetId} · {fmtDt(a.occurredAt)} · {a.performedByName || '—'}</span>
                        </li>
                      ))}
                      {!dash.recentActivities?.length && <li className="bems-empty">No activity yet</li>}
                    </ul>
                  </div>
                </div>

                <div className="bems-panel">
                  <div className="bems-panel__head"><h3>Engineer Performance</h3></div>
                  <div className="bems-panel__body">
                    <table className="bems-table">
                      <thead><tr><th>Engineer</th><th>Completed</th></tr></thead>
                      <tbody>
                        {(dash.engineerPerformance || []).map((e) => (
                          <tr key={String(e._id)}><td>{e.name || '—'}</td><td>{e.completed}</td></tr>
                        ))}
                        {!dash.engineerPerformance?.length && (
                          <tr><td colSpan={2} className="bems-empty">No completed work orders yet</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {tab === 'equipment' && (
        <div className="bems-panel">
          <div className="bems-panel__head">
            <h3>Equipment Master</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="bems-btn" onClick={() => setModal({ type: 'lifecycle' })}>
                Advance Lifecycle
              </button>
              <a className="bems-btn bems-btn--primary" href="/masters/assets">
                <Plus size={14} /> Manage in Masters
              </a>
            </div>
          </div>
          <div className="bems-panel__body bems-panel__body--flush" style={{ overflowX: 'auto' }}>
            <table className="bems-table">
              <thead>
                <tr>
                  <th>ID / QR</th><th>Name</th><th>Category</th><th>Dept</th>
                  <th>Status</th><th>Risk</th><th>Next PM</th><th>Next Cal</th><th>Lifecycle</th>
                </tr>
              </thead>
              <tbody>
                {equipment.map((e) => (
                  <tr key={e._id}>
                    <td className="bems-mono">
                      <div>{e.assetId}</div>
                      <div>QR: {e.qrCode || e.assetId}</div>
                    </td>
                    <td>{e.name}</td>
                    <td>{e.category}</td>
                    <td>{e.department?.name || '—'}</td>
                    <td><Badge tone={e.status === 'Working' ? 'ok' : e.status?.includes('Due') || e.status === 'Breakdown' ? 'bad' : 'warn'}>{e.status}</Badge></td>
                    <td>{e.riskClass || '—'}</td>
                    <td>{fmt(e.nextPmDate)}</td>
                    <td>{fmt(e.nextCalibrationDate)}</td>
                    <td>{e.lifecycleStage || 'In Service'}</td>
                  </tr>
                ))}
                {!equipment.length && <tr><td colSpan={9} className="bems-empty">No equipment — add via Masters → Assets</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'pm' && (
        <div className="bems-panel">
          <div className="bems-panel__head">
            <h3>Preventive Maintenance</h3>
            <button type="button" className="bems-btn bems-btn--primary" onClick={() => setModal({ type: 'pm' })}>
              <Plus size={14} /> Schedule PM
            </button>
          </div>
          <div className="bems-panel__body" style={{ overflowX: 'auto' }}>
            <table className="bems-table">
              <thead>
                <tr><th>PM No</th><th>Equipment</th><th>Schedule</th><th>Due</th><th>Status</th><th>Result</th><th>Action</th></tr>
              </thead>
              <tbody>
                {pmList.map((p) => (
                  <tr key={p._id}>
                    <td>{p.pmNumber}</td>
                    <td>{p.equipment?.assetId} — {p.equipment?.name}</td>
                    <td>{p.scheduleType}</td>
                    <td>{fmt(p.scheduledDate)}</td>
                    <td><Badge tone={p.status === 'Completed' ? 'ok' : p.status === 'Overdue' ? 'bad' : 'warn'}>{p.status}</Badge></td>
                    <td>{p.result}</td>
                    <td>
                      {p.status !== 'Completed' && (
                        <button
                          type="button"
                          className="bems-btn"
                          onClick={() => completePmMut.mutate({
                            id: p._id,
                            body: { result: 'Pass', remarks: 'PM completed' },
                          })}
                        >
                          <CheckCircle2 size={14} /> Complete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {!pmList.length && <tr><td colSpan={7} className="bems-empty">No PM schedules</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'calibration' && (
        <div className="bems-panel">
          <div className="bems-panel__head">
            <h3>Calibration</h3>
            <button type="button" className="bems-btn bems-btn--primary" onClick={() => setModal({ type: 'cal' })}>
              <Plus size={14} /> Record Calibration
            </button>
          </div>
          <div className="bems-panel__body" style={{ overflowX: 'auto' }}>
            <table className="bems-table">
              <thead>
                <tr><th>Cal No</th><th>Equipment</th><th>Date</th><th>Result</th><th>Certificate</th><th>Next Due</th></tr>
              </thead>
              <tbody>
                {calList.map((c) => (
                  <tr key={c._id}>
                    <td>{c.calibrationNumber}</td>
                    <td>{c.equipment?.assetId} — {c.equipment?.name}</td>
                    <td>{fmt(c.calibrationDate)}</td>
                    <td><Badge tone={c.result === 'Pass' ? 'ok' : c.result === 'Fail' ? 'bad' : 'warn'}>{c.result}</Badge></td>
                    <td>{c.certificateNumber || '—'}</td>
                    <td>{fmt(c.nextCalibrationDate)}</td>
                  </tr>
                ))}
                {!calList.length && <tr><td colSpan={6} className="bems-empty">No calibrations</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'electrical' && (
        <div className="bems-panel">
          <div className="bems-panel__head">
            <h3>Electrical Safety Testing</h3>
            <button type="button" className="bems-btn bems-btn--primary" onClick={() => setModal({ type: 'est' })}>
              <Plus size={14} /> Record Test
            </button>
          </div>
          <div className="bems-panel__body" style={{ overflowX: 'auto' }}>
            <table className="bems-table">
              <thead>
                <tr><th>Test No</th><th>Equipment</th><th>Date</th><th>Result</th><th>Next Due</th></tr>
              </thead>
              <tbody>
                {estList.map((t) => (
                  <tr key={t._id}>
                    <td>{t.testNumber}</td>
                    <td>{t.equipment?.assetId} — {t.equipment?.name}</td>
                    <td>{fmt(t.testDate)}</td>
                    <td><Badge tone={t.result === 'Pass' ? 'ok' : 'bad'}>{t.result}</Badge></td>
                    <td>{fmt(t.nextTestDate)}</td>
                  </tr>
                ))}
                {!estList.length && <tr><td colSpan={5} className="bems-empty">No EST records</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'work-orders' && (
        <div className="bems-panel">
          <div className="bems-panel__head"><h3>Work Orders</h3></div>
          <div className="bems-panel__body" style={{ overflowX: 'auto' }}>
            <table className="bems-table">
              <thead>
                <tr><th>WO No</th><th>Type</th><th>Equipment</th><th>Priority</th><th>Status</th><th>Engineer</th><th>Action</th></tr>
              </thead>
              <tbody>
                {workOrders.map((w) => (
                  <tr key={w._id}>
                    <td>{w.workOrderNumber}</td>
                    <td>{w.type}</td>
                    <td>{w.equipment?.assetId} — {w.equipment?.name}</td>
                    <td><Badge tone={w.priority === 'Critical' || w.priority === 'High' ? 'bad' : 'warn'}>{w.priority}</Badge></td>
                    <td><Badge tone={w.status === 'Completed' ? 'ok' : 'warn'}>{w.status}</Badge></td>
                    <td>{w.engineer?.name || w.engineerName || '—'}</td>
                    <td>
                      {w.status !== 'Completed' && w.status !== 'Cancelled' && (
                        <button
                          type="button"
                          className="bems-btn"
                          onClick={() => woMut.mutate({
                            id: w._id,
                            body: {
                              status: 'Completed',
                              endTime: new Date().toISOString(),
                              startTime: w.startTime || new Date().toISOString(),
                            },
                          })}
                        >
                          Complete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {!workOrders.length && <tr><td colSpan={7} className="bems-empty">No work orders</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'complaints' && (
        <div className="bems-panel">
          <div className="bems-panel__head">
            <h3>Equipment Complaints / Breakdown</h3>
            <a className="bems-btn bems-btn--primary" href="/asset-complaints">Open Complaints Desk</a>
          </div>
          <div className="bems-panel__body" style={{ overflowX: 'auto' }}>
            <table className="bems-table">
              <thead>
                <tr><th>No</th><th>Equipment</th><th>Priority</th><th>Status</th><th>Reported</th><th>By</th></tr>
              </thead>
              <tbody>
                {complaints.map((c) => (
                  <tr key={c._id}>
                    <td>{c.complaintNumber}</td>
                    <td>{c.assetId} — {c.assetName}</td>
                    <td><Badge tone={c.priority === 'Critical' || c.priority === 'High' ? 'bad' : 'warn'}>{c.priority}</Badge></td>
                    <td>{c.status}</td>
                    <td>{fmt(c.complaintDate)}</td>
                    <td>{c.reportedByName || c.reportedBy?.name}</td>
                  </tr>
                ))}
                {!complaints.length && <tr><td colSpan={6} className="bems-empty">No complaints</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'spares' && (
        <div className="bems-panel">
          <div className="bems-panel__head">
            <h3>Spare Parts Inventory</h3>
            <button type="button" className="bems-btn bems-btn--primary" onClick={() => setModal({ type: 'spare' })}>
              <Plus size={14} /> Add Spare
            </button>
          </div>
          <div className="bems-panel__body" style={{ overflowX: 'auto' }}>
            <table className="bems-table">
              <thead>
                <tr><th>Code</th><th>Name</th><th>Category</th><th>Stock</th><th>Reorder</th><th>Cost</th><th>Expiry</th></tr>
              </thead>
              <tbody>
                {spares.map((s) => (
                  <tr key={s._id}>
                    <td>{s.partCode}</td>
                    <td>{s.name}</td>
                    <td>{s.category}</td>
                    <td><Badge tone={s.stock <= s.reorderLevel ? 'bad' : 'ok'}>{s.stock}</Badge></td>
                    <td>{s.reorderLevel}</td>
                    <td>{s.unitCost}</td>
                    <td>{fmt(s.expiry)}</td>
                  </tr>
                ))}
                {!spares.length && <tr><td colSpan={7} className="bems-empty">No spare parts</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'vendors' && (
        <div className="bems-panel">
          <div className="bems-panel__head">
            <h3>Vendor Management</h3>
            <button type="button" className="bems-btn bems-btn--primary" onClick={() => setModal({ type: 'vendor' })}>
              <Plus size={14} /> Add Vendor
            </button>
          </div>
          <div className="bems-panel__body" style={{ overflowX: 'auto' }}>
            <table className="bems-table">
              <thead>
                <tr><th>Code</th><th>Name</th><th>Contact</th><th>Phone</th><th>Email</th><th>Rating</th></tr>
              </thead>
              <tbody>
                {vendors.map((v) => (
                  <tr key={v._id}>
                    <td>{v.vendorCode}</td>
                    <td>{v.name}</td>
                    <td>{v.contactPerson || '—'}</td>
                    <td>{v.phone || '—'}</td>
                    <td>{v.email || '—'}</td>
                    <td>{v.performanceRating}/5</td>
                  </tr>
                ))}
                {!vendors.length && <tr><td colSpan={6} className="bems-empty">No vendors</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'contracts' && (
        <div className="bems-panel">
          <div className="bems-panel__head">
            <h3>AMC / CMC Contracts</h3>
            <button type="button" className="bems-btn bems-btn--primary" onClick={() => setModal({ type: 'contract' })}>
              <Plus size={14} /> New Contract
            </button>
          </div>
          <div className="bems-panel__body" style={{ overflowX: 'auto' }}>
            <table className="bems-table">
              <thead>
                <tr><th>Contract</th><th>Type</th><th>Vendor</th><th>Start</th><th>End</th><th>Cost</th><th>Machines</th><th>Status</th></tr>
              </thead>
              <tbody>
                {contracts.map((c) => (
                  <tr key={c._id}>
                    <td>{c.contractNumber}</td>
                    <td><Badge tone="accent">{c.type}</Badge></td>
                    <td>{c.vendor?.name}</td>
                    <td>{fmt(c.startDate)}</td>
                    <td>{fmt(c.endDate)}</td>
                    <td>{c.cost}</td>
                    <td>{c.machinesCovered?.length || 0}</td>
                    <td>{c.status}</td>
                  </tr>
                ))}
                {!contracts.length && <tr><td colSpan={8} className="bems-empty">No contracts</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'movement' && (
        <div className="bems-panel">
          <div className="bems-panel__head">
            <h3>Equipment Movement History</h3>
            <button type="button" className="bems-btn bems-btn--primary" onClick={() => setModal({ type: 'move' })}>
              <Plus size={14} /> Record Movement
            </button>
          </div>
          <div className="bems-panel__body" style={{ overflowX: 'auto' }}>
            <table className="bems-table">
              <thead>
                <tr><th>No</th><th>Equipment</th><th>From</th><th>To</th><th>Reason</th><th>Date</th><th>Engineer</th></tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m._id}>
                    <td>{m.movementNumber}</td>
                    <td>{m.equipment?.assetId} — {m.equipment?.name}</td>
                    <td>{m.from?.departmentName || m.from?.location || '—'}</td>
                    <td>{m.to?.departmentName || m.to?.location || m.to?.room || '—'}</td>
                    <td>{m.reason}</td>
                    <td>{fmtDt(m.movedAt)}</td>
                    <td>{m.engineerName || '—'}</td>
                  </tr>
                ))}
                {!movements.length && <tr><td colSpan={7} className="bems-empty">No movements</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'qr' && (
        <div className="bems-panel">
          <div className="bems-panel__head"><h3>QR / Barcode Equipment Lookup</h3></div>
          <div className="bems-panel__body">
            <div className="bems-qr-bar">
              <QrCode size={18} />
              <input
                value={qrCode}
                onChange={(e) => setQrCode(e.target.value)}
                placeholder="Scan or enter Asset ID / QR / Barcode"
                onKeyDown={(e) => e.key === 'Enter' && lookupQr()}
              />
              <button type="button" className="bems-btn bems-btn--primary" onClick={lookupQr}>Lookup</button>
            </div>
            {qrResult && (
              <div style={{ marginTop: '1.25rem' }}>
                <h3 style={{ margin: '0 0 0.75rem', color: '#0f2744' }}>
                  {qrResult.equipment?.assetId} — {qrResult.equipment?.name}
                </h3>
                <div className="bems-kpis">
                  <Kpi label="Status" value={qrResult.equipment?.status} />
                  <Kpi label="Location" value={qrResult.equipment?.location || qrResult.equipment?.department?.name || '—'} />
                  <Kpi label="Warranty" value={fmt(qrResult.equipment?.warrantyExpiry)} />
                  <Kpi label="Next PM" value={fmt(qrResult.equipment?.nextPmDate)} />
                  <Kpi label="Next Cal" value={fmt(qrResult.equipment?.nextCalibrationDate)} />
                  <Kpi label="Health" value={qrResult.equipment?.healthScore ?? 100} tone="ok" />
                </div>
                <div className="bems-grid-2">
                  <div>
                    <h4>Complaint History</h4>
                    <ul className="bems-activity">
                      {(qrResult.complaints || []).slice(0, 8).map((c) => (
                        <li key={c._id}><strong>{c.complaintNumber}</strong><span>{c.priority} · {c.status} · {fmt(c.complaintDate)}</span></li>
                      ))}
                      {!qrResult.complaints?.length && <li className="bems-empty">None</li>}
                    </ul>
                  </div>
                  <div>
                    <h4>Lifecycle Timeline</h4>
                    <ul className="bems-activity">
                      {(qrResult.lifecycle || []).slice(0, 10).map((e) => (
                        <li key={e._id}><strong>{e.title}</strong><span>{e.stage} · {fmtDt(e.occurredAt)}</span></li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'reports' && (
        <div className="bems-panel">
          <div className="bems-panel__head">
            <h3>Biomedical Reports</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select className="bems-select" value={reportType} onChange={(e) => setReportType(e.target.value)}>
                <option value="register">Equipment Register</option>
                <option value="pm">PM Report</option>
                <option value="calibration">Calibration</option>
                <option value="complaints">Complaints</option>
                <option value="downtime">Downtime</option>
                <option value="spares">Spare Consumption</option>
                <option value="amc">AMC / CMC</option>
                <option value="warranty">Warranty</option>
                <option value="age">Age Analysis</option>
                <option value="condemned">Condemned</option>
                <option value="engineer">Engineer Productivity</option>
              </select>
              <button type="button" className="bems-btn" onClick={printReport}>Print / PDF</button>
            </div>
          </div>
          <div className="bems-panel__body" style={{ overflowX: 'auto' }}>
            {reportLoading && <div className="bems-empty">Loading…</div>}
            {!reportLoading && (
              <table className="bems-table">
                <thead>
                  <tr>
                    {reportData?.data?.[0]
                      ? Object.keys(reportData.data[0])
                        .filter((k) => !['_id', '__v', 'documents', 'checklist', 'partsUsed'].includes(k))
                        .slice(0, 8)
                        .map((k) => <th key={k}>{k}</th>)
                      : <th>No data</th>}
                  </tr>
                </thead>
                <tbody>
                  {(reportData?.data || []).map((row, i) => (
                    <tr key={row._id || i}>
                      {Object.keys(reportData.data[0] || {})
                        .filter((k) => !['_id', '__v', 'documents', 'checklist', 'partsUsed'].includes(k))
                        .slice(0, 8)
                        .map((k) => (
                          <td key={k}>
                            {typeof row[k] === 'object' && row[k]
                              ? (row[k].name || row[k].assetId || JSON.stringify(row[k]).slice(0, 40))
                              : String(row[k] ?? '—')}
                          </td>
                        ))}
                    </tr>
                  ))}
                  {!reportData?.data?.length && (
                    <tr><td className="bems-empty">No records for this report</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      {modal?.type === 'pm' && (
        <Modal isOpen onClose={() => setModal(null)} title="Schedule Preventive Maintenance" size="lg" subtitle="Creates PM schedule and work order">
          <PmForm
            equipmentOptions={equipmentOptions}
            onSubmit={(body) => schedulePmMut.mutate(body)}
            loading={schedulePmMut.isPending}
          />
        </Modal>
      )}
      {modal?.type === 'cal' && (
        <Modal isOpen onClose={() => setModal(null)} title="Record Calibration" size="lg" subtitle="Updates equipment master automatically">
          <CalForm
            equipmentOptions={equipmentOptions}
            onSubmit={(body) => calMut.mutate(body)}
            loading={calMut.isPending}
          />
        </Modal>
      )}
      {modal?.type === 'est' && (
        <Modal isOpen onClose={() => setModal(null)} title="Electrical Safety Test" size="lg">
          <EstForm
            equipmentOptions={equipmentOptions}
            onSubmit={(body) => estMut.mutate(body)}
            loading={estMut.isPending}
          />
        </Modal>
      )}
      {modal?.type === 'spare' && (
        <Modal isOpen onClose={() => setModal(null)} title="Add Spare Part" size="lg">
          <SpareForm onSubmit={(body) => spareMut.mutate(body)} loading={spareMut.isPending} />
        </Modal>
      )}
      {modal?.type === 'vendor' && (
        <Modal isOpen onClose={() => setModal(null)} title="Add BME Vendor" size="lg">
          <VendorForm onSubmit={(body) => vendorMut.mutate(body)} loading={vendorMut.isPending} />
        </Modal>
      )}
      {modal?.type === 'contract' && (
        <Modal isOpen onClose={() => setModal(null)} title="New AMC / CMC Contract" size="xl" subtitle="Contract coverage syncs to equipment master">
          <ContractForm
            vendors={vendors}
            equipmentOptions={equipmentOptions}
            onSubmit={(body) => contractMut.mutate(body)}
            loading={contractMut.isPending}
          />
        </Modal>
      )}
      {modal?.type === 'move' && (
        <Modal isOpen onClose={() => setModal(null)} title="Record Equipment Movement" size="lg" subtitle="Previous location is preserved in history">
          <MoveForm
            equipmentOptions={equipmentOptions}
            departments={departments}
            onSubmit={(body) => moveMut.mutate(body)}
            loading={moveMut.isPending}
          />
        </Modal>
      )}
      {modal?.type === 'lifecycle' && (
        <Modal isOpen onClose={() => setModal(null)} title="Advance Equipment Lifecycle" size="lg">
          <LifecycleForm
            equipmentOptions={equipmentOptions}
            onSubmit={(payload) => lifecycleMut.mutate(payload)}
            loading={lifecycleMut.isPending}
          />
        </Modal>
      )}
    </div>
  );
}

function PmForm({ equipmentOptions, onSubmit, loading }) {
  const [form, setForm] = useState({
    equipment: '',
    scheduleType: 'Every 90 Days',
    scheduledDate: new Date().toISOString().slice(0, 10),
  });
  return (
    <form
      className="bems-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!form.equipment) return toast.error('Select equipment');
        onSubmit(form);
      }}
    >
      <div className="bems-form__section">
        <p className="bems-form__section-title">Schedule details</p>
        <div className="bems-form__grid">
          <label className="bems-form__span-2">Equipment
            <select value={form.equipment} onChange={(e) => setForm({ ...form, equipment: e.target.value })} required>
              <option value="">Select equipment…</option>
              {equipmentOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label>Schedule type
            <select value={form.scheduleType} onChange={(e) => setForm({ ...form, scheduleType: e.target.value })}>
              {SCHEDULE_TYPES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label>Scheduled date
            <input type="date" value={form.scheduledDate} onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })} />
          </label>
        </div>
      </div>
      <div className="bems-form__footer">
        <button type="submit" className="bems-btn bems-btn--primary" disabled={loading}>
          {loading ? 'Saving…' : 'Schedule PM + Work Order'}
        </button>
      </div>
    </form>
  );
}

function CalForm({ equipmentOptions, onSubmit, loading }) {
  const [form, setForm] = useState({
    equipment: '',
    calibrationDate: new Date().toISOString().slice(0, 10),
    calibrationStandard: '',
    measuredValue: '',
    expectedValue: '',
    tolerance: '',
    result: 'Pass',
    certificateNumber: '',
    certificateUrl: '',
  });
  return (
    <form className="bems-form" onSubmit={(e) => { e.preventDefault(); onSubmit(form); }}>
      <div className="bems-form__section">
        <p className="bems-form__section-title">Calibration</p>
        <div className="bems-form__grid">
          <label className="bems-form__span-2">Equipment
            <select value={form.equipment} onChange={(e) => setForm({ ...form, equipment: e.target.value })} required>
              <option value="">Select equipment…</option>
              {equipmentOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label>Date
            <input type="date" value={form.calibrationDate} onChange={(e) => setForm({ ...form, calibrationDate: e.target.value })} />
          </label>
          <label>Result
            <select value={form.result} onChange={(e) => setForm({ ...form, result: e.target.value })}>
              <option>Pass</option><option>Fail</option><option>Pending</option>
            </select>
          </label>
          <label>Standard
            <input value={form.calibrationStandard} onChange={(e) => setForm({ ...form, calibrationStandard: e.target.value })} />
          </label>
          <label>Certificate no.
            <input value={form.certificateNumber} onChange={(e) => setForm({ ...form, certificateNumber: e.target.value })} />
          </label>
          <label>Measured value
            <input value={form.measuredValue} onChange={(e) => setForm({ ...form, measuredValue: e.target.value })} />
          </label>
          <label>Expected value
            <input value={form.expectedValue} onChange={(e) => setForm({ ...form, expectedValue: e.target.value })} />
          </label>
          <label className="bems-form__span-2">Certificate URL
            <input value={form.certificateUrl} onChange={(e) => setForm({ ...form, certificateUrl: e.target.value })} placeholder="https://…" />
          </label>
        </div>
      </div>
      <div className="bems-form__footer">
        <button type="submit" className="bems-btn bems-btn--primary" disabled={loading}>{loading ? 'Saving…' : 'Save Calibration'}</button>
      </div>
    </form>
  );
}

function EstForm({ equipmentOptions, onSubmit, loading }) {
  const [form, setForm] = useState({
    equipment: '',
    testDate: new Date().toISOString().slice(0, 10),
    result: 'Pass',
    earthResistance: '',
    leakageCurrent: '',
    certificateNumber: '',
  });
  return (
    <form className="bems-form" onSubmit={(e) => { e.preventDefault(); onSubmit(form); }}>
      <div className="bems-form__section">
        <p className="bems-form__section-title">Electrical safety test</p>
        <div className="bems-form__grid">
          <label className="bems-form__span-2">Equipment
            <select value={form.equipment} onChange={(e) => setForm({ ...form, equipment: e.target.value })} required>
              <option value="">Select equipment…</option>
              {equipmentOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label>Date
            <input type="date" value={form.testDate} onChange={(e) => setForm({ ...form, testDate: e.target.value })} />
          </label>
          <label>Result
            <select value={form.result} onChange={(e) => setForm({ ...form, result: e.target.value })}>
              <option>Pass</option><option>Fail</option>
            </select>
          </label>
          <label>Earth resistance
            <input value={form.earthResistance} onChange={(e) => setForm({ ...form, earthResistance: e.target.value })} />
          </label>
          <label>Leakage current
            <input value={form.leakageCurrent} onChange={(e) => setForm({ ...form, leakageCurrent: e.target.value })} />
          </label>
        </div>
      </div>
      <div className="bems-form__footer">
        <button type="submit" className="bems-btn bems-btn--primary" disabled={loading}>{loading ? 'Saving…' : 'Save Test'}</button>
      </div>
    </form>
  );
}

function SpareForm({ onSubmit, loading }) {
  const [form, setForm] = useState({ name: '', category: 'Battery', stock: 0, reorderLevel: 5, unitCost: 0, batch: '' });
  return (
    <form className="bems-form" onSubmit={(e) => { e.preventDefault(); onSubmit(form); }}>
      <div className="bems-form__section">
        <p className="bems-form__section-title">Spare part</p>
        <div className="bems-form__grid">
          <label className="bems-form__span-2">Name
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label>Category
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {SPARE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label>Batch
            <input value={form.batch} onChange={(e) => setForm({ ...form, batch: e.target.value })} />
          </label>
          <label>Stock
            <input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })} />
          </label>
          <label>Reorder level
            <input type="number" value={form.reorderLevel} onChange={(e) => setForm({ ...form, reorderLevel: Number(e.target.value) })} />
          </label>
          <label>Unit cost (₹)
            <input type="number" value={form.unitCost} onChange={(e) => setForm({ ...form, unitCost: Number(e.target.value) })} />
          </label>
        </div>
      </div>
      <div className="bems-form__footer">
        <button type="submit" className="bems-btn bems-btn--primary" disabled={loading}>{loading ? 'Saving…' : 'Add Spare'}</button>
      </div>
    </form>
  );
}

function VendorForm({ onSubmit, loading }) {
  const [form, setForm] = useState({ name: '', contactPerson: '', phone: '', email: '', address: '', performanceRating: 3 });
  return (
    <form className="bems-form" onSubmit={(e) => { e.preventDefault(); onSubmit(form); }}>
      <div className="bems-form__section">
        <p className="bems-form__section-title">Vendor details</p>
        <div className="bems-form__grid">
          <label className="bems-form__span-2">Vendor name
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label>Contact person
            <input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
          </label>
          <label>Phone
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </label>
          <label className="bems-form__span-2">Email
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label className="bems-form__span-2">Address
            <textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={2} />
          </label>
        </div>
      </div>
      <div className="bems-form__footer">
        <button type="submit" className="bems-btn bems-btn--primary" disabled={loading}>{loading ? 'Saving…' : 'Add Vendor'}</button>
      </div>
    </form>
  );
}

function ContractForm({ vendors, equipmentOptions, onSubmit, loading }) {
  const [form, setForm] = useState({
    type: 'AMC',
    vendor: '',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: '',
    cost: 0,
    coverage: '',
    responseTimeHours: 24,
    visitFrequency: '',
    sla: '',
    machinesCovered: [],
  });
  const [machineFilter, setMachineFilter] = useState('');

  const toggleMachine = (id) => {
    setForm((prev) => ({
      ...prev,
      machinesCovered: prev.machinesCovered.includes(id)
        ? prev.machinesCovered.filter((x) => x !== id)
        : [...prev.machinesCovered, id],
    }));
  };

  const filteredMachines = equipmentOptions.filter((o) =>
    !machineFilter || o.label.toLowerCase().includes(machineFilter.toLowerCase())
  );

  const selectedLabels = equipmentOptions
    .filter((o) => form.machinesCovered.includes(o.value))
    .map((o) => o.label);

  return (
    <form
      className="bems-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!form.vendor) return toast.error('Select a vendor');
        if (!form.endDate) return toast.error('End date is required');
        onSubmit(form);
      }}
    >
      <div className="bems-form__section">
        <p className="bems-form__section-title">Contract</p>
        <div className="bems-form__grid">
          <label>Type
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="AMC">AMC</option>
              <option value="CMC">CMC</option>
            </select>
          </label>
          <label>Vendor
            <select value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} required>
              <option value="">Select vendor…</option>
              {vendors.map((v) => <option key={v._id} value={v._id}>{v.name}</option>)}
            </select>
          </label>
          <label>Start date
            <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </label>
          <label>End date
            <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} required />
          </label>
          <label>Contract cost (₹)
            <input type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: Number(e.target.value) })} />
          </label>
          <label>Response time (hrs)
            <input type="number" value={form.responseTimeHours} onChange={(e) => setForm({ ...form, responseTimeHours: Number(e.target.value) })} />
          </label>
          <label>Visit frequency
            <input value={form.visitFrequency} onChange={(e) => setForm({ ...form, visitFrequency: e.target.value })} placeholder="e.g. Quarterly" />
          </label>
          <label>SLA
            <input value={form.sla} onChange={(e) => setForm({ ...form, sla: e.target.value })} placeholder="e.g. 4-hour critical response" />
          </label>
          <label className="bems-form__span-2">Coverage
            <textarea value={form.coverage} onChange={(e) => setForm({ ...form, coverage: e.target.value })} rows={2} placeholder="Parts, labour, travel inclusions…" />
          </label>
        </div>
      </div>

      <div className="bems-form__section">
        <p className="bems-form__section-title">Machines covered ({form.machinesCovered.length} selected)</p>
        <div className="bems-form__grid bems-form__grid--1">
          <label>Search equipment
            <input
              value={machineFilter}
              onChange={(e) => setMachineFilter(e.target.value)}
              placeholder="Filter by ID or name…"
            />
          </label>
          <div>
            <div className="bems-check-list">
              {filteredMachines.length === 0 && (
                <div className="bems-check-empty">No equipment found. Register equipment in Masters first.</div>
              )}
              {filteredMachines.map((o) => (
                <label key={o.value} className="bems-check-item">
                  <input
                    type="checkbox"
                    checked={form.machinesCovered.includes(o.value)}
                    onChange={() => toggleMachine(o.value)}
                  />
                  <span>{o.label}</span>
                </label>
              ))}
            </div>
            {selectedLabels.length > 0 && (
              <div className="bems-chip-row">
                {selectedLabels.slice(0, 8).map((label) => (
                  <span key={label} className="bems-chip">{label.split(' — ')[0]}</span>
                ))}
                {selectedLabels.length > 8 && (
                  <span className="bems-chip">+{selectedLabels.length - 8} more</span>
                )}
              </div>
            )}
            <p className="bems-form__hint" style={{ marginTop: 8 }}>
              Tick each machine covered under this contract. Expiry dates sync to equipment master automatically.
            </p>
          </div>
        </div>
      </div>

      <div className="bems-form__footer">
        <button type="submit" className="bems-btn bems-btn--primary" disabled={loading}>
          {loading ? 'Saving…' : 'Create Contract'}
        </button>
      </div>
    </form>
  );
}

function MoveForm({ equipmentOptions, departments, onSubmit, loading }) {
  const [form, setForm] = useState({
    equipment: '',
    reason: '',
    receivedBy: '',
    to: { department: '', location: '', room: '', ward: '' },
  });
  return (
    <form
      className="bems-form"
      onSubmit={(e) => {
        e.preventDefault();
        const dept = departments.find((d) => d._id === form.to.department);
        onSubmit({
          equipment: form.equipment,
          reason: form.reason,
          receivedBy: form.receivedBy,
          to: {
            ...form.to,
            departmentName: dept?.name,
          },
        });
      }}
    >
      <div className="bems-form__section">
        <p className="bems-form__section-title">Movement</p>
        <div className="bems-form__grid">
          <label className="bems-form__span-2">Equipment
            <select value={form.equipment} onChange={(e) => setForm({ ...form, equipment: e.target.value })} required>
              <option value="">Select equipment…</option>
              {equipmentOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label>To department
            <select
              value={form.to.department}
              onChange={(e) => setForm({ ...form, to: { ...form.to, department: e.target.value } })}
            >
              <option value="">Select…</option>
              {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
            </select>
          </label>
          <label>Received by
            <input value={form.receivedBy} onChange={(e) => setForm({ ...form, receivedBy: e.target.value })} />
          </label>
          <label>Room
            <input value={form.to.room} onChange={(e) => setForm({ ...form, to: { ...form.to, room: e.target.value } })} />
          </label>
          <label>Ward
            <input value={form.to.ward} onChange={(e) => setForm({ ...form, to: { ...form.to, ward: e.target.value } })} />
          </label>
          <label className="bems-form__span-2">Location notes
            <input value={form.to.location} onChange={(e) => setForm({ ...form, to: { ...form.to, location: e.target.value } })} />
          </label>
          <label className="bems-form__span-2">Reason
            <textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} required rows={2} />
          </label>
        </div>
      </div>
      <div className="bems-form__footer">
        <button type="submit" className="bems-btn bems-btn--primary" disabled={loading}>{loading ? 'Saving…' : 'Record Movement'}</button>
      </div>
    </form>
  );
}

function LifecycleForm({ equipmentOptions, onSubmit, loading }) {
  const [form, setForm] = useState({ id: '', stage: 'Installation', remarks: '', reportUrl: '' });
  return (
    <form
      className="bems-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ id: form.id, body: { stage: form.stage, remarks: form.remarks, reportUrl: form.reportUrl } });
      }}
    >
      <div className="bems-form__section">
        <p className="bems-form__section-title">Lifecycle stage</p>
        <div className="bems-form__grid">
          <label className="bems-form__span-2">Equipment
            <select value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} required>
              <option value="">Select equipment…</option>
              {equipmentOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label>Stage
            <select value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })}>
              {LIFECYCLE_STAGES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label>Report URL
            <input value={form.reportUrl} onChange={(e) => setForm({ ...form, reportUrl: e.target.value })} />
          </label>
          <label className="bems-form__span-2">Remarks
            <textarea value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} rows={2} />
          </label>
        </div>
      </div>
      <div className="bems-form__footer">
        <button type="submit" className="bems-btn bems-btn--primary" disabled={loading}>{loading ? 'Saving…' : 'Update Lifecycle'}</button>
      </div>
    </form>
  );
}
