import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import {
  ArrowRight,
  Check,
  ClipboardCheck,
  FileEdit,
  Plus,
  X,
} from 'lucide-react';
import api from '../services/api';
import Modal from '../components/common/Modal';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { hasPermission } from '../constants/permissions';
import '../styles/changeRequests.css';

const CATEGORIES = [
  { value: 'medicine_edit', label: 'Medicine Edit' },
  { value: 'patient_data', label: 'Patient Data' },
  { value: 'billing', label: 'Billing' },
  { value: 'lab', label: 'Lab' },
  { value: 'ip_admission', label: 'IP Admission' },
  { value: 'pharmacy', label: 'Pharmacy (other)' },
  { value: 'staff_access', label: 'Staff / Access' },
  { value: 'masters', label: 'Masters' },
  { value: 'other', label: 'Other' },
];

const statusBadge = (status) => {
  const map = {
    pending: 'cr-badge cr-badge--pending',
    approved: 'cr-badge cr-badge--approved',
    applied: 'cr-badge cr-badge--applied',
    rejected: 'cr-badge cr-badge--rejected',
  };
  return map[status] || 'cr-badge cr-badge--cat';
};

const priorityBadge = (priority) => {
  if (priority === 'high' || priority === 'urgent') {
    return 'cr-badge cr-badge--priority-high';
  }
  return 'cr-badge cr-badge--priority';
};

const emptyForm = () => ({
  category: 'other',
  title: '',
  whatIsWrong: '',
  requestedChange: '',
  reason: '',
  priority: 'normal',
  medicineName: '',
});

const fmtDt = (d) => (d ? new Date(d).toLocaleString('en-IN', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
}) : '—');

const categoryLabel = (value) =>
  CATEGORIES.find((c) => c.value === value)?.label || value;

export default function ChangeRequestsPage() {
  const qc = useQueryClient();
  const { user } = useSelector((s) => s.auth);
  const canReview = hasPermission(user, 'REVIEW_CHANGE_REQUESTS');

  const [tab, setTab] = useState(canReview ? 'inbox' : 'mine');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [detail, setDetail] = useState(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    if (!canReview && tab === 'inbox') setTab('mine');
  }, [canReview, tab]);

  const listQ = useQuery({
    queryKey: ['change-requests', tab, statusFilter],
    queryFn: async () => {
      const params = {
        scope: tab === 'inbox' ? 'all' : 'mine',
        limit: 50,
      };
      if (statusFilter) params.status = statusFilter;
      return (await api.get('/change-requests', { params })).data;
    },
  });

  const createMut = useMutation({
    mutationFn: (body) => api.post('/change-requests', body),
    onSuccess: () => {
      toast.success('Request sent to Super Admin / Admin');
      setShowCreate(false);
      setForm(emptyForm());
      qc.invalidateQueries(['change-requests']);
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed to submit'),
  });

  const reviewMut = useMutation({
    mutationFn: ({ id, decision, applyMedicine }) =>
      api.put(`/change-requests/${id}/review`, { decision, reviewNotes, applyMedicine }),
    onSuccess: (_, vars) => {
      toast.success(`Request ${vars.decision === 'reject' ? 'rejected' : vars.decision === 'apply' ? 'applied' : 'approved'}`);
      setDetail(null);
      setReviewNotes('');
      qc.invalidateQueries(['change-requests']);
      qc.invalidateQueries(['medicines']);
      qc.invalidateQueries(['medicine-edit-locks']);
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Review failed'),
  });

  const rows = listQ.data?.data || [];
  const pendingCount = useMemo(
    () => (tab === 'inbox' ? rows.filter((r) => r.status === 'pending').length : 0),
    [rows, tab],
  );

  const submitCreate = (e) => {
    e.preventDefault();
    if (!form.whatIsWrong.trim() || !form.requestedChange.trim() || !form.reason.trim()) {
      return toast.error('Fill What is wrong, What should be changed, and Reason');
    }
    createMut.mutate({
      ...form,
      title: form.title.trim() || undefined,
      medicineName: form.category === 'medicine_edit' ? form.medicineName.trim() : undefined,
    });
  };

  const canApplyMedicine =
    detail?.category === 'medicine_edit'
    && (detail?.fieldChanges || []).length > 0
    && detail?.medicine;

  return (
    <div className="cr-shell">
      <header className="cr-masthead">
        <div>
          <p className="cr-masthead__eyebrow">Approvals desk</p>
          <h1 className="cr-masthead__title">
            <ClipboardCheck size={20} /> Change Requests
          </h1>
          <p className="cr-masthead__sub">
            Staff raise corrections. Super Admin / Admin reviews and applies. Direct edit permissions stay unchanged.
          </p>
        </div>
        <button type="button" className="cr-masthead__btn" onClick={() => setShowCreate(true)}>
          <Plus size={16} /> New request
        </button>
      </header>

      <div className="cr-toolbar">
        {canReview && (
          <button
            type="button"
            className={`cr-tab ${tab === 'inbox' ? 'cr-tab--active' : ''}`}
            onClick={() => setTab('inbox')}
          >
            Review inbox
            {pendingCount > 0 && <span className="cr-tab__count">{pendingCount}</span>}
          </button>
        )}
        <button
          type="button"
          className={`cr-tab ${tab === 'mine' ? 'cr-tab--active' : ''}`}
          onClick={() => setTab('mine')}
        >
          My requests
        </button>
        <select
          className="cr-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="applied">Applied</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {listQ.isLoading ? (
        <LoadingSpinner />
      ) : (
        <div className="cr-panel">
          <table className="cr-table">
            <thead>
              <tr>
                <th>Request #</th>
                <th>Category</th>
                <th>Title</th>
                {tab === 'inbox' && <th>Raised by</th>}
                <th>Status</th>
                <th>Date</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {!rows.length && (
                <tr>
                  <td colSpan={7}>
                    <div className="cr-empty">No requests yet.</div>
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r._id}>
                  <td><strong style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>{r.requestNumber}</strong></td>
                  <td><span className="cr-badge cr-badge--cat">{categoryLabel(r.category)}</span></td>
                  <td>
                    {r.title}
                    {r.medicineName && (
                      <div className="cr-table__sub">
                        {r.medicineName}
                        {r.batchNumber ? ` · Batch ${r.batchNumber}` : ' · Master'}
                      </div>
                    )}
                  </td>
                  {tab === 'inbox' && <td>{r.requestedBy?.name || '—'}</td>}
                  <td><span className={statusBadge(r.status)}>{r.status}</span></td>
                  <td style={{ whiteSpace: 'nowrap', fontSize: 12, color: '#64748b' }}>{fmtDt(r.createdAt)}</td>
                  <td>
                    <button
                      type="button"
                      className="cr-link-btn"
                      onClick={() => { setDetail(r); setReviewNotes(''); }}
                    >
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title="Raise change request"
        subtitle="Super Admin will review this before any master data is changed."
        size="lg"
      >
        <form onSubmit={submitCreate} className="cr-form" style={{ padding: '1rem 1.15rem 1.15rem' }}>
          <p className="cr-form__hint">
            Use this when you cannot (or should not) change data yourself. Be specific — current value, requested value, and why.
          </p>
          <div>
            <label htmlFor="cr-cat">Category *</label>
            <select
              id="cr-cat"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          {form.category === 'medicine_edit' && (
            <div>
              <label htmlFor="cr-med">Medicine name *</label>
              <input
                id="cr-med"
                value={form.medicineName}
                onChange={(e) => setForm({ ...form, medicineName: e.target.value })}
                placeholder="e.g. Paracetamol 500 mg"
                required
              />
            </div>
          )}
          <div>
            <label htmlFor="cr-title">Short title (optional)</label>
            <input
              id="cr-title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Auto-filled if blank"
            />
          </div>
          <div>
            <label htmlFor="cr-wrong">What is wrong? *</label>
            <textarea
              id="cr-wrong"
              rows={2}
              value={form.whatIsWrong}
              onChange={(e) => setForm({ ...form, whatIsWrong: e.target.value })}
              placeholder="Current: GST 12%"
              required
            />
          </div>
          <div>
            <label htmlFor="cr-change">What should be changed? *</label>
            <textarea
              id="cr-change"
              rows={2}
              value={form.requestedChange}
              onChange={(e) => setForm({ ...form, requestedChange: e.target.value })}
              placeholder="Requested: GST 5%"
              required
            />
          </div>
          <div>
            <label htmlFor="cr-reason">Reason *</label>
            <textarea
              id="cr-reason"
              rows={2}
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              placeholder="Supplier invoice updated"
              required
            />
          </div>
          <div>
            <label htmlFor="cr-pri">Priority</label>
            <select
              id="cr-pri"
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value })}
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <div className="cr-form__footer">
            <button type="button" className="cr-btn cr-btn--ghost" onClick={() => setShowCreate(false)}>Cancel</button>
            <button type="submit" className="cr-btn cr-btn--primary" disabled={createMut.isPending}>
              Submit to Super Admin
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? 'Change request review' : 'Request'}
        subtitle={detail ? detail.requestNumber : undefined}
        size="xl"
      >
        {detail && (
          <div className="cr-detail">
            <div className="cr-detail__hero">
              <div>
                <p className="cr-detail__id">{detail.requestNumber}</p>
                <h3 className="cr-detail__title">{detail.title}</h3>
                <p className="cr-detail__meta">
                  Raised by {detail.requestedBy?.name || '—'}
                  {detail.requestedBy?.role ? ` · ${detail.requestedBy.role}` : ''}
                  {' · '}
                  {fmtDt(detail.createdAt)}
                </p>
              </div>
              <div className="cr-detail__pills">
                <span className={statusBadge(detail.status)}>{detail.status}</span>
                <span className="cr-badge cr-badge--cat">{categoryLabel(detail.category)}</span>
                <span className={priorityBadge(detail.priority)}>{detail.priority}</span>
              </div>
            </div>

            <div className="cr-detail__body">
              <div className="cr-meta-grid">
                <div className="cr-meta-card">
                  <p className="cr-meta-card__label">Requester</p>
                  <p className="cr-meta-card__value">
                    {detail.requestedBy?.name || '—'}
                    {detail.requestedBy?.role ? ` (${detail.requestedBy.role})` : ''}
                  </p>
                </div>
                <div className="cr-meta-card">
                  <p className="cr-meta-card__label">Category</p>
                  <p className="cr-meta-card__value">{categoryLabel(detail.category)}</p>
                </div>
                <div className="cr-meta-card">
                  <p className="cr-meta-card__label">
                    {detail.medicineName ? 'Medicine' : 'Submitted'}
                  </p>
                  <p className="cr-meta-card__value">
                    {detail.medicineName
                      ? `${detail.medicineName}${detail.batchNumber ? ` · Batch ${detail.batchNumber}` : ' · Master fields'}`
                      : fmtDt(detail.createdAt)}
                  </p>
                </div>
              </div>

              <div className="cr-story">
                <div className="cr-story__card cr-story__card--warn">
                  <p className="cr-story__label">What is wrong?</p>
                  <p className="cr-story__text">{detail.whatIsWrong}</p>
                </div>
                <div className="cr-story__card cr-story__card--next">
                  <p className="cr-story__label">What should be changed?</p>
                  <p className="cr-story__text">{detail.requestedChange}</p>
                </div>
                <div className="cr-story__card cr-story__card--reason">
                  <p className="cr-story__label">Reason</p>
                  <p className="cr-story__text">{detail.reason}</p>
                </div>
              </div>

              {(detail.fieldChanges || []).length > 0 && (
                <div className="cr-diff">
                  <div className="cr-diff__head">
                    <p className="cr-diff__head-title">Field comparison</p>
                    <p className="cr-diff__head-hint">{detail.fieldChanges.length} change{detail.fieldChanges.length === 1 ? '' : 's'}</p>
                  </div>
                  <table>
                    <thead>
                      <tr>
                        <th>Field</th>
                        <th>Current</th>
                        <th />
                        <th>Requested</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.fieldChanges.map((f, i) => (
                        <tr key={i}>
                          <td className="cr-diff__field">{f.fieldLabel || f.field}</td>
                          <td className="cr-diff__current">{f.currentValue ?? '—'}</td>
                          <td className="cr-diff__arrow"><ArrowRight size={14} /></td>
                          <td className="cr-diff__requested">{f.requestedValue}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {detail.reviewedAt && (
                <div className="cr-reviewed">
                  Reviewed by <strong>{detail.reviewedBy?.name || '—'}</strong> on {fmtDt(detail.reviewedAt)}
                  {detail.reviewNotes ? ` — ${detail.reviewNotes}` : ''}
                </div>
              )}

              {canReview && detail.status === 'pending' && (
                <div className="cr-review">
                  <div className="cr-review__head">Decision</div>
                  <div className="cr-review__body">
                    <div>
                      <label htmlFor="cr-notes">Review notes</label>
                      <textarea
                        id="cr-notes"
                        rows={2}
                        value={reviewNotes}
                        onChange={(e) => setReviewNotes(e.target.value)}
                        placeholder="Optional note to requester"
                      />
                    </div>
                    <div className="cr-actions">
                      <button
                        type="button"
                        className="cr-btn cr-btn--approve"
                        disabled={reviewMut.isPending}
                        onClick={() => reviewMut.mutate({ id: detail._id, decision: 'approve' })}
                      >
                        <Check size={15} /> Approve
                      </button>
                      {canApplyMedicine && (
                        <button
                          type="button"
                          className="cr-btn cr-btn--apply"
                          disabled={reviewMut.isPending}
                          onClick={() => reviewMut.mutate({ id: detail._id, decision: 'apply', applyMedicine: true })}
                          title={detail.batchNumber
                            ? `Approve and update batch ${detail.batchNumber} now`
                            : 'Approve and update medicine master fields now'}
                        >
                          <FileEdit size={15} /> Approve &amp; Apply
                        </button>
                      )}
                      <button
                        type="button"
                        className="cr-btn cr-btn--reject"
                        disabled={reviewMut.isPending}
                        onClick={() => reviewMut.mutate({ id: detail._id, decision: 'reject' })}
                      >
                        <X size={15} /> Reject
                      </button>
                    </div>
                    <p className="cr-hint">
                      <strong>Approve</strong> marks the request accepted (you apply the change yourself).
                      {' '}
                      {detail.batchId || detail.batchNumber ? (
                        <>
                          <strong>Approve &amp; Apply</strong> updates only batch{' '}
                          <strong>{detail.batchNumber}</strong> (expiry, qty, prices). Other batches stay unchanged.
                        </>
                      ) : (
                        <>
                          <strong>Approve &amp; Apply</strong> writes medicine master fields from the comparison table (GST, name, default prices).
                        </>
                      )}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
