import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Wrench, Pencil } from 'lucide-react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useSelector } from 'react-redux';
import api from '../services/api';
import Modal from '../components/common/Modal';
import { hasPermission } from '../constants/permissions';
import '../styles/assetMaster.css';

const ALL_STATUSES = [
  'Open',
  'Assigned',
  'In Progress',
  'Waiting for Parts',
  'Vendor Service',
  'Completed',
  'Closed',
];

const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];

const priorityBadgeClass = (priority) => {
  switch (priority) {
    case 'Critical':
      return 'am-badge am-badge--bad';
    case 'High':
      return 'am-badge am-badge--warn';
    case 'Medium':
      return 'am-badge';
    default:
      return 'am-badge am-badge--muted';
  }
};

const statusBadgeClass = (status) => {
  switch (status) {
    case 'Completed':
    case 'Closed':
      return 'am-badge am-badge--ok';
    case 'Open':
    case 'Critical':
      return 'am-badge am-badge--bad';
    case 'In Progress':
    case 'Waiting for Parts':
    case 'Vendor Service':
      return 'am-badge am-badge--warn';
    case 'Assigned':
      return 'am-badge';
    default:
      return 'am-badge am-badge--muted';
  }
};

const formatDate = (v) => {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
};

const inr = (n) =>
  n == null || n === '' || Number(n) === 0
    ? '—'
    : `₹${Number(n).toLocaleString('en-IN')}`;

export default function AssetComplaintPage() {
  const { user } = useSelector((s) => s.auth);
  const canRaise = hasPermission(user, 'CREATE_ASSET_COMPLAINT');
  const canUpdate = hasPermission(user, 'UPDATE_ASSET_COMPLAINT') || hasPermission(user, 'MANAGE_ASSET_COMPLAINTS');
  const [showAdd, setShowAdd] = useState(false);
  const [updateComplaint, setUpdateComplaint] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const qc = useQueryClient();

  const { data: dash } = useQuery({
    queryKey: ['assetComplaintDash'],
    queryFn: () => api.get('/asset-complaints/dashboard').then((r) => r.data.data),
  });

  const { data: complaints, isLoading } = useQuery({
    queryKey: ['assetComplaints', statusFilter, priorityFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (priorityFilter) params.set('priority', priorityFilter);
      return api.get(`/asset-complaints?${params}`).then((r) => r.data.data);
    },
  });

  const { data: assets } = useQuery({
    queryKey: ['assets', 'complaint-picker'],
    queryFn: () => api.get('/assets', {
      params: { limit: 500 },
      skipErrorToast: true,
    }).then((r) => r.data.data),
    // Only needed when raising a complaint (asset dropdown)
    enabled: showAdd,
  });

  const { register, handleSubmit, reset } = useForm();
  const {
    register: updReg,
    handleSubmit: updSubmit,
    reset: updReset,
    setValue: updSet,
  } = useForm();

  const createMut = useMutation({
    mutationFn: (d) => api.post('/asset-complaints', d),
    onSuccess: () => {
      toast.success('Complaint raised');
      qc.invalidateQueries(['assetComplaints']);
      qc.invalidateQueries(['assetComplaintDash']);
      setShowAdd(false);
      reset();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to raise complaint'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => api.put(`/asset-complaints/${id}`, data),
    onSuccess: () => {
      toast.success('Complaint updated');
      qc.invalidateQueries(['assetComplaints']);
      qc.invalidateQueries(['assetComplaintDash']);
      setUpdateComplaint(null);
      updReset();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to update'),
  });

  const openCreate = () => {
    reset({
      priority: 'Medium',
      complaintDate: new Date().toISOString().split('T')[0],
    });
    setShowAdd(true);
  };

  const openUpdate = (complaint) => {
    setUpdateComplaint(complaint);
    updSet('status', complaint.status);
    updSet('assignedTechnician', complaint.assignedTechnician || '');
    updSet('vendorName', complaint.vendorName || '');
    updSet(
      'repairStartDate',
      complaint.repairStartDate
        ? new Date(complaint.repairStartDate).toISOString().split('T')[0]
        : '',
    );
    updSet(
      'expectedCompletionDate',
      complaint.expectedCompletionDate
        ? new Date(complaint.expectedCompletionDate).toISOString().split('T')[0]
        : '',
    );
    updSet(
      'actualCompletionDate',
      complaint.actualCompletionDate
        ? new Date(complaint.actualCompletionDate).toISOString().split('T')[0]
        : '',
    );
    updSet('repairCost', complaint.repairCost || '');
    updSet('repairNotes', complaint.repairNotes || '');
  };

  const d = dash || {};
  const rows = complaints || [];

  return (
    <div className="am-shell">
      <div className="am-head">
        <div>
          <p className="am-head__eyebrow">Maintenance desk</p>
          <h2 className="am-head__title">Asset Complaints</h2>
          <p className="am-head__sub">
            Equipment issues, technician assignment, and repair tracking
          </p>
        </div>
        {canRaise && (
          <button type="button" onClick={openCreate} className="am-btn am-btn--primary">
            <Plus size={14} /> Raise complaint
          </button>
        )}
      </div>

      <div className="am-kpi">
        {[
          { label: 'Total assets', value: d.totalAssets || 0 },
          { label: 'Working', value: d.workingAssets || 0, tone: 'is-ok' },
          { label: 'Under repair', value: d.underRepair || 0, tone: 'is-warn' },
          { label: 'Critical issues', value: d.criticalIssues || 0, tone: 'is-bad' },
          { label: 'Warranty expiring', value: d.warrantyExpiringSoon || 0, tone: 'is-warn' },
        ].map((k) => (
          <div key={k.label} className="am-kpi__card">
            <p className="am-kpi__label">{k.label}</p>
            <p className={`am-kpi__value ${k.tone || ''}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="am-toolbar">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="am-select"
        >
          <option value="">All statuses</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="am-select"
        >
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <span className="am-toolbar__meta">
          {rows.length} ticket{rows.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="am-panel">
        {isLoading ? (
          <p className="am-empty">Loading complaints…</p>
        ) : (
          <div className="am-table-wrap">
            <table className="am-table">
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Asset</th>
                  <th>Problem</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Technician</th>
                  <th>Date</th>
                  <th>Cost</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c._id}>
                    <td className="am-mono">{c.complaintNumber || '—'}</td>
                    <td>
                      <p className="am-name">{c.assetName || '—'}</p>
                      <p className="am-sub">
                        {c.assetId || '—'}
                        {c.reportedBy?.name || c.reportedByName
                          ? ` · ${c.reportedBy?.name || c.reportedByName}`
                          : ''}
                      </p>
                    </td>
                    <td style={{ maxWidth: 260, whiteSpace: 'normal' }}>
                      <p className="am-name" style={{ fontWeight: 500, fontSize: 12.5 }}>
                        {(c.problemDescription || '—').length > 90
                          ? `${c.problemDescription.slice(0, 90)}…`
                          : (c.problemDescription || '—')}
                      </p>
                    </td>
                    <td>
                      <span className={priorityBadgeClass(c.priority)}>{c.priority || '—'}</span>
                    </td>
                    <td>
                      <span className={statusBadgeClass(c.status)}>{c.status || '—'}</span>
                    </td>
                    <td>{c.assignedTechnician || '—'}</td>
                    <td>{formatDate(c.complaintDate)}</td>
                    <td>{inr(c.repairCost)}</td>
                    <td>
                      {canUpdate && (
                        <div className="am-row-actions">
                          <button
                            type="button"
                            className="am-icon-btn"
                            title="Update status"
                            onClick={() => openUpdate(c)}
                          >
                            <Pencil size={14} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && (
              <p className="am-empty">
                <Wrench size={18} style={{ display: 'inline', marginRight: 6, verticalAlign: -3 }} />
                No complaints match this filter.
              </p>
            )}
          </div>
        )}
      </div>

      <Modal
        isOpen={showAdd}
        onClose={() => { setShowAdd(false); reset(); }}
        title="Raise Asset Complaint"
        subtitle="Log an equipment issue for maintenance"
        size="lg"
      >
        <form
          onSubmit={handleSubmit((payload) => createMut.mutate(payload))}
          className="am-form"
        >
          <div className="am-form__section">
            <p className="am-form__section-title">Complaint details</p>
            <div className="am-form__grid">
              <div className="am-form__span-2">
                <label className="am-label">Asset *</label>
                <select {...register('asset', { required: true })} className="am-field">
                  <option value="">Select asset</option>
                  {(assets || []).map((a) => (
                    <option key={a._id} value={a._id}>
                      {a.name} ({a.assetId})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="am-label">Priority</label>
                <select {...register('priority')} className="am-field">
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="am-label">Complaint date</label>
                <input {...register('complaintDate')} type="date" className="am-field" />
              </div>
              <div className="am-form__span-2">
                <label className="am-label">Problem description *</label>
                <textarea
                  {...register('problemDescription', { required: true })}
                  className="am-field"
                  rows={3}
                  placeholder="Describe the issue in detail…"
                />
              </div>
            </div>
          </div>

          <div className="am-form__footer">
            <button
              type="button"
              onClick={() => { setShowAdd(false); reset(); }}
              className="am-btn am-btn--ghost"
            >
              Cancel
            </button>
            <button type="submit" disabled={createMut.isPending} className="am-btn am-btn--primary">
              <Plus size={14} />
              {createMut.isPending ? 'Submitting…' : 'Raise complaint'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={!!updateComplaint}
        onClose={() => { setUpdateComplaint(null); updReset(); }}
        title="Update Complaint"
        subtitle={
          updateComplaint
            ? `${updateComplaint.complaintNumber || ''} · ${updateComplaint.assetName || ''}`
            : undefined
        }
        size="lg"
      >
        <form
          onSubmit={updSubmit((payload) =>
            updateMut.mutate({ id: updateComplaint._id, data: payload }),
          )}
          className="am-form"
        >
          <div className="am-hint">
            Ticket <strong>{updateComplaint?.complaintNumber}</strong>
            {updateComplaint?.problemDescription
              ? ` — ${updateComplaint.problemDescription.slice(0, 120)}${updateComplaint.problemDescription.length > 120 ? '…' : ''}`
              : ''}
          </div>

          <div className="am-form__section">
            <p className="am-form__section-title">Status &amp; assignment</p>
            <div className="am-form__grid">
              <div>
                <label className="am-label">Status *</label>
                <select {...updReg('status', { required: true })} className="am-field">
                  {ALL_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="am-label">Assigned technician</label>
                <input {...updReg('assignedTechnician')} className="am-field" />
              </div>
              <div>
                <label className="am-label">Vendor name</label>
                <input {...updReg('vendorName')} className="am-field" />
              </div>
              <div>
                <label className="am-label">Repair cost (₹)</label>
                <input
                  {...updReg('repairCost', { valueAsNumber: true })}
                  type="number"
                  className="am-field"
                />
              </div>
            </div>
          </div>

          <div className="am-form__section">
            <p className="am-form__section-title">Repair schedule</p>
            <div className="am-form__grid">
              <div>
                <label className="am-label">Repair start</label>
                <input {...updReg('repairStartDate')} type="date" className="am-field" />
              </div>
              <div>
                <label className="am-label">Expected completion</label>
                <input {...updReg('expectedCompletionDate')} type="date" className="am-field" />
              </div>
              <div>
                <label className="am-label">Actual completion</label>
                <input {...updReg('actualCompletionDate')} type="date" className="am-field" />
              </div>
              <div className="am-form__span-2">
                <label className="am-label">Repair notes</label>
                <textarea {...updReg('repairNotes')} className="am-field" rows={2} />
              </div>
            </div>
          </div>

          <div className="am-form__footer">
            <button
              type="button"
              onClick={() => { setUpdateComplaint(null); updReset(); }}
              className="am-btn am-btn--ghost"
            >
              Cancel
            </button>
            <button type="submit" disabled={updateMut.isPending} className="am-btn am-btn--primary">
              <Wrench size={14} />
              {updateMut.isPending ? 'Updating…' : 'Update complaint'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
