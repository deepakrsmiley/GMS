import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Pencil, BedDouble } from 'lucide-react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import api from '../services/api';
import Modal from '../components/common/Modal';
import '../styles/roomsBeds.css';

const BED_TYPES = ['general', 'semi_private', 'private', 'icu', 'nicu', 'emergency'];
const WARD_TYPES = ['general', 'icu', 'nicu', 'emergency', 'maternity', 'pediatric', 'surgical', 'medical'];
const BED_STATUSES = ['available', 'cleaning', 'maintenance', 'reserved'];
const ROOM_STATUSES = ['available', 'reserved', 'maintenance'];

const pretty = (v) => String(v || '').replace(/_/g, ' ');

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const StatusBadge = ({ status }) => (
  <span className={`rb-badge rb-badge--${status || 'maintenance'}`}>{pretty(status)}</span>
);

export default function BedsPage() {
  const [view, setView] = useState('rooms'); // rooms | beds | wards
  const [wardFilter, setWardFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [showAddRoom, setShowAddRoom] = useState(false);
  const [showAddBed, setShowAddBed] = useState(false);
  const [showAddWard, setShowAddWard] = useState(false);
  const [editWard, setEditWard] = useState(null);
  const [selectedBed, setSelectedBed] = useState(null);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const qc = useQueryClient();

  const { data: wardsData, refetch: refetchWards } = useQuery({
    queryKey: ['wards'],
    queryFn: () => api.get('/beds/wards').then((r) => r.data),
  });
  const wardsList = wardsData?.data || [];

  const { data: occupancy } = useQuery({
    queryKey: ['bedOccupancy'],
    queryFn: () => api.get('/beds/occupancy').then((r) => r.data),
  });

  const { data: roomsData, isLoading: roomsLoading } = useQuery({
    queryKey: ['rooms', wardFilter, typeFilter, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (wardFilter) params.set('ward', wardFilter);
      if (typeFilter) params.set('type', typeFilter);
      if (statusFilter) params.set('status', statusFilter);
      const q = params.toString();
      return api.get(`/rooms${q ? `?${q}` : ''}`).then((r) => r.data);
    },
    enabled: view === 'rooms',
  });

  const { data: bedsData, isLoading: bedsLoading } = useQuery({
    queryKey: ['beds', wardFilter, typeFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (wardFilter) params.set('ward', wardFilter);
      if (typeFilter) params.set('type', typeFilter);
      const q = params.toString();
      return api.get(`/beds${q ? `?${q}` : ''}`).then((r) => r.data);
    },
    enabled: view === 'beds',
  });

  const { register: registerRoom, handleSubmit: handleRoomSubmit, reset: resetRoom } = useForm({
    defaultValues: { type: 'general', dailyCharge: 1500, floor: 1 },
  });
  const { register: registerBed, handleSubmit: handleBedSubmit, reset: resetBed } = useForm({
    defaultValues: { type: 'general', dailyRate: 500 },
  });
  const { register: registerWard, handleSubmit: handleWardSubmit, reset: resetWard, setValue: setWardValue } = useForm({
    defaultValues: { type: 'general' },
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['beds'] });
    qc.invalidateQueries({ queryKey: ['rooms'] });
    qc.invalidateQueries({ queryKey: ['bedOccupancy'] });
    qc.invalidateQueries({ queryKey: ['roomDashboard'] });
    qc.invalidateQueries({ queryKey: ['availableRooms'] });
    refetchWards();
  };

  const addRoom = useMutation({
    mutationFn: (d) => api.post('/rooms', {
      ...d,
      bedNumber: d.bedNumber || d.roomNumber,
      floor: d.floor ? Number(d.floor) : undefined,
      dailyCharge: Number(d.dailyCharge || 0),
    }),
    onSuccess: () => {
      toast.success('Room added');
      invalidateAll();
      setShowAddRoom(false);
      resetRoom({ type: 'general', dailyCharge: 1500, floor: 1 });
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to add room'),
  });

  const addBed = useMutation({
    mutationFn: (d) => api.post('/beds', d),
    onSuccess: () => {
      toast.success('Bed added');
      invalidateAll();
      setShowAddBed(false);
      resetBed({ type: 'general', dailyRate: 500 });
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to add bed'),
  });

  const saveWard = useMutation({
    mutationFn: (d) => (editWard
      ? api.put(`/beds/wards/${editWard._id}`, d)
      : api.post('/beds/wards', d)),
    onSuccess: () => {
      toast.success(editWard ? 'Ward updated' : 'Ward created');
      invalidateAll();
      setShowAddWard(false);
      setEditWard(null);
      resetWard({ type: 'general' });
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to save ward'),
  });

  const updateBedStatus = useMutation({
    mutationFn: ({ id, status }) => api.put(`/beds/${id}/status`, { status }),
    onSuccess: () => {
      toast.success('Bed status updated');
      invalidateAll();
      setSelectedBed(null);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to update status'),
  });

  const updateRoomStatus = useMutation({
    mutationFn: ({ id, status }) => api.put(`/rooms/${id}`, { status }),
    onSuccess: () => {
      toast.success('Room status updated');
      invalidateAll();
      setSelectedRoom(null);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to update status'),
  });

  const deleteMut = useMutation({
    mutationFn: ({ kind, id }) => {
      if (kind === 'room') return api.delete(`/rooms/${id}`);
      if (kind === 'bed') return api.delete(`/beds/${id}`);
      return api.delete(`/beds/wards/${id}`);
    },
    onSuccess: () => {
      toast.success('Deleted');
      invalidateAll();
      setDeleteTarget(null);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Delete failed'),
  });

  const rooms = roomsData?.data || [];
  const beds = useMemo(() => {
    const list = bedsData?.data || [];
    if (!statusFilter) return list;
    return list.filter((b) => b.status === statusFilter);
  }, [bedsData, statusFilter]);

  const stats = occupancy?.data?.stats || [];
  const statMap = stats.reduce((a, s) => { a[s._id] = s.count; return a; }, {});
  const totalBeds = Object.values(statMap).reduce((n, v) => n + Number(v || 0), 0);

  const openEditWard = (ward) => {
    setEditWard(ward);
    setWardValue('name', ward.name || '');
    setWardValue('code', ward.code || '');
    setWardValue('type', ward.type || 'general');
    setWardValue('floor', ward.floor ?? '');
    setWardValue('description', ward.description || '');
    setShowAddWard(true);
  };

  const primaryAction = () => {
    if (view === 'wards') {
      setEditWard(null);
      resetWard({ type: 'general' });
      setShowAddWard(true);
      return;
    }
    if (view === 'beds') {
      setShowAddBed(true);
      return;
    }
    setShowAddRoom(true);
  };

  return (
    <div className="rb-shell">
      <div className="rb-head">
        <div>
          <p className="rb-head__eyebrow">Facility capacity</p>
          <h2 className="rb-head__title">Rooms &amp; Beds</h2>
          <p className="rb-head__sub">
            Wards, rooms for IP admission, and bed status — one register, no duplicate boards.
          </p>
        </div>
        <div className="rb-actions">
          {view !== 'wards' && (
            <button type="button" className="rb-btn rb-btn--ghost" onClick={() => { setView('wards'); setEditWard(null); resetWard({ type: 'general' }); setShowAddWard(true); }}>
              <Plus size={13} /> Ward
            </button>
          )}
          <button type="button" className="rb-btn rb-btn--primary" onClick={primaryAction}>
            <Plus size={13} />
            {view === 'wards' ? 'Add ward' : view === 'beds' ? 'Add bed' : 'Add room'}
          </button>
        </div>
      </div>

      <div className="rb-kpi">
        {[
          { label: 'Total beds', value: totalBeds, tone: '' },
          { label: 'Available', value: statMap.available || 0, tone: 'is-ok' },
          { label: 'Occupied', value: statMap.occupied || 0, tone: 'is-bad' },
          { label: 'Cleaning', value: statMap.cleaning || 0, tone: 'is-warn' },
          { label: 'Maintenance', value: (statMap.maintenance || 0) + (statMap.reserved || 0), tone: '' },
        ].map((k) => (
          <div key={k.label} className="rb-kpi__card">
            <p className="rb-kpi__label">{k.label}</p>
            <p className={`rb-kpi__value ${k.tone}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="rb-toolbar">
        <div className="rb-segs">
          {[
            { id: 'rooms', label: 'Rooms' },
            { id: 'beds', label: 'Beds' },
            { id: 'wards', label: 'Wards' },
          ].map((s) => (
            <button
              key={s.id}
              type="button"
              className={`rb-seg ${view === s.id ? 'is-active' : ''}`}
              onClick={() => setView(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>

        {view !== 'wards' && (
          <>
            <select className="rb-select" value={wardFilter} onChange={(e) => setWardFilter(e.target.value)}>
              <option value="">All wards</option>
              {wardsList.map((w) => (
                <option key={w._id} value={w._id}>{w.name}</option>
              ))}
            </select>
            <select className="rb-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="">All types</option>
              {BED_TYPES.map((t) => (
                <option key={t} value={t}>{pretty(t)}</option>
              ))}
            </select>
            <select className="rb-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              {['available', 'occupied', 'cleaning', 'maintenance', 'reserved'].map((s) => (
                <option key={s} value={s}>{pretty(s)}</option>
              ))}
            </select>
          </>
        )}
      </div>

      {view === 'rooms' && (
        <div className="rb-panel">
          {wardsList.length === 0 && (
            <div className="p-3">
              <p className="rb-hint">Create a ward first, then add rooms. Each room can auto-create a linked bed for occupancy tracking.</p>
            </div>
          )}
          {roomsLoading ? (
            <p className="rb-empty">Loading rooms…</p>
          ) : (
            <div className="rb-table-wrap">
              <table className="rb-table">
                <thead>
                  <tr>
                    <th>Room</th>
                    <th>Ward</th>
                    <th>Type</th>
                    <th>Floor</th>
                    <th>Daily charge</th>
                    <th>Status</th>
                    <th>Patient</th>
                    <th>Bed</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rooms.map((r) => (
                    <tr key={r._id}>
                      <td style={{ fontWeight: 600 }}>{r.roomNumber}</td>
                      <td>{r.ward?.name || '—'}</td>
                      <td className="capitalize">{pretty(r.type)}</td>
                      <td>{r.floor ?? '—'}</td>
                      <td>{inr(r.dailyCharge)}</td>
                      <td><StatusBadge status={r.status} /></td>
                      <td>{r.currentPatient?.name || '—'}</td>
                      <td>{r.bedNumber || r.bed?.bedNumber || '—'}</td>
                      <td>
                        <div className="flex items-center gap-1 justify-end">
                          <button type="button" className="rb-icon-btn" title="Status" onClick={() => setSelectedRoom(r)}>
                            <Pencil size={14} />
                          </button>
                          {r.status !== 'occupied' && (
                            <button type="button" className="rb-icon-btn is-danger" title="Delete" onClick={() => setDeleteTarget({ kind: 'room', id: r._id, name: r.roomNumber })}>
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!rooms.length && (
                <p className="rb-empty">No rooms yet. Add a room for IP admissions, or use the Beds tab for bed-only capacity.</p>
              )}
            </div>
          )}
        </div>
      )}

      {view === 'beds' && (
        <div className="rb-panel">
          {bedsLoading ? (
            <p className="rb-empty">Loading beds…</p>
          ) : (
            <div className="rb-table-wrap">
              <table className="rb-table">
                <thead>
                  <tr>
                    <th>Bed</th>
                    <th>Room</th>
                    <th>Ward</th>
                    <th>Type</th>
                    <th>Daily rate</th>
                    <th>Status</th>
                    <th>Patient</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {beds.map((b) => (
                    <tr key={b._id}>
                      <td style={{ fontWeight: 600 }}>
                        <span className="inline-flex items-center gap-1.5">
                          <BedDouble size={13} className="opacity-60" />
                          {b.bedNumber}
                        </span>
                      </td>
                      <td>{b.roomNumber || '—'}</td>
                      <td>{b.ward?.name || '—'}</td>
                      <td className="capitalize">{pretty(b.type)}</td>
                      <td>{inr(b.dailyRate)}</td>
                      <td><StatusBadge status={b.status} /></td>
                      <td>{b.currentPatient?.name || '—'}</td>
                      <td>
                        <div className="flex items-center gap-1 justify-end">
                          <button type="button" className="rb-icon-btn" title="Update status" onClick={() => setSelectedBed(b)}>
                            <Pencil size={14} />
                          </button>
                          {b.status !== 'occupied' && (
                            <button type="button" className="rb-icon-btn is-danger" title="Delete" onClick={() => setDeleteTarget({ kind: 'bed', id: b._id, name: b.bedNumber })}>
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!beds.length && <p className="rb-empty">No beds found for this filter.</p>}
            </div>
          )}
        </div>
      )}

      {view === 'wards' && (
        <div className="rb-panel">
          <div className="rb-table-wrap">
            <table className="rb-table">
              <thead>
                <tr>
                  <th>Ward</th>
                  <th>Code</th>
                  <th>Type</th>
                  <th>Floor</th>
                  <th>Beds</th>
                  <th>Available</th>
                  <th>Description</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {wardsList.map((w) => (
                  <tr key={w._id}>
                    <td style={{ fontWeight: 600 }}>{w.name}</td>
                    <td>{w.code || '—'}</td>
                    <td className="capitalize">{pretty(w.type)}</td>
                    <td>{w.floor ?? '—'}</td>
                    <td>{w.totalBeds ?? 0}</td>
                    <td>{w.availableBeds ?? 0}</td>
                    <td className="max-w-[220px] truncate">{w.description || '—'}</td>
                    <td>
                      <div className="flex items-center gap-1 justify-end">
                        <button type="button" className="rb-icon-btn" title="Edit" onClick={() => openEditWard(w)}>
                          <Pencil size={14} />
                        </button>
                        <button type="button" className="rb-icon-btn is-danger" title="Delete" onClick={() => setDeleteTarget({ kind: 'ward', id: w._id, name: w.name })}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!wardsList.length && <p className="rb-empty">No wards created yet.</p>}
          </div>
        </div>
      )}

      {/* Bed status */}
      <Modal isOpen={!!selectedBed} onClose={() => setSelectedBed(null)} title={`Bed ${selectedBed?.bedNumber || ''}`} size="sm">
        {selectedBed && (
          <div className="rb-detail">
            <div className="rb-detail__row"><span>Ward</span><span>{selectedBed.ward?.name || '—'}</span></div>
            <div className="rb-detail__row"><span>Type</span><span className="capitalize">{pretty(selectedBed.type)}</span></div>
            <div className="rb-detail__row"><span>Rate</span><span>{inr(selectedBed.dailyRate)}</span></div>
            <div className="rb-detail__row"><span>Status</span><span><StatusBadge status={selectedBed.status} /></span></div>
            {selectedBed.currentPatient && (
              <div className="rb-detail__row"><span>Patient</span><span>{selectedBed.currentPatient.name}</span></div>
            )}
            {selectedBed.status !== 'occupied' ? (
              <div>
                <p className="rb-label">Update status</p>
                <div className="rb-status-grid">
                  {BED_STATUSES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`rb-status-btn ${selectedBed.status === s ? 'is-active' : ''}`}
                      onClick={() => updateBedStatus.mutate({ id: selectedBed._id, status: s })}
                    >
                      {pretty(s)}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="rb-hint">Occupied beds are released automatically on discharge.</p>
            )}
          </div>
        )}
      </Modal>

      {/* Room status */}
      <Modal isOpen={!!selectedRoom} onClose={() => setSelectedRoom(null)} title={`Room ${selectedRoom?.roomNumber || ''}`} size="sm">
        {selectedRoom && (
          <div className="rb-detail">
            <div className="rb-detail__row"><span>Ward</span><span>{selectedRoom.ward?.name || '—'}</span></div>
            <div className="rb-detail__row"><span>Type</span><span className="capitalize">{pretty(selectedRoom.type)}</span></div>
            <div className="rb-detail__row"><span>Charge</span><span>{inr(selectedRoom.dailyCharge)}</span></div>
            <div className="rb-detail__row"><span>Status</span><span><StatusBadge status={selectedRoom.status} /></span></div>
            {selectedRoom.currentPatient && (
              <div className="rb-detail__row"><span>Patient</span><span>{selectedRoom.currentPatient.name}</span></div>
            )}
            {selectedRoom.status !== 'occupied' ? (
              <div>
                <p className="rb-label">Update status</p>
                <div className="rb-status-grid">
                  {ROOM_STATUSES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`rb-status-btn ${selectedRoom.status === s ? 'is-active' : ''}`}
                      onClick={() => updateRoomStatus.mutate({ id: selectedRoom._id, status: s })}
                    >
                      {pretty(s)}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="rb-hint">Occupied rooms are released automatically on discharge.</p>
            )}
          </div>
        )}
      </Modal>

      {/* Add room */}
      <Modal isOpen={showAddRoom} onClose={() => setShowAddRoom(false)} title="Add Room" size="md" subtitle="Creates room and linked bed for IP admission">
        <form onSubmit={handleRoomSubmit((d) => addRoom.mutate(d))} className="rb-form">
          {wardsList.length === 0 && (
            <p className="rb-hint">No wards yet — create a ward before adding rooms.</p>
          )}
          <div className="rb-form__grid">
            <div>
              <label className="rb-label">Room number *</label>
              <input {...registerRoom('roomNumber', { required: true })} className="rb-field" placeholder="e.g. 201" />
            </div>
            <div>
              <label className="rb-label">Bed number</label>
              <input {...registerRoom('bedNumber')} className="rb-field" placeholder="Defaults to room number" />
            </div>
            <div>
              <label className="rb-label">Ward *</label>
              <select {...registerRoom('ward', { required: true })} className="rb-field">
                <option value="">Select ward</option>
                {wardsList.map((w) => <option key={w._id} value={w._id}>{w.name}</option>)}
              </select>
            </div>
            <div>
              <label className="rb-label">Type</label>
              <select {...registerRoom('type')} className="rb-field">
                {BED_TYPES.map((t) => <option key={t} value={t}>{pretty(t)}</option>)}
              </select>
            </div>
            <div>
              <label className="rb-label">Floor</label>
              <input {...registerRoom('floor', { valueAsNumber: true })} type="number" className="rb-field" />
            </div>
            <div>
              <label className="rb-label">Daily charge (₹)</label>
              <input {...registerRoom('dailyCharge', { valueAsNumber: true })} type="number" className="rb-field" />
            </div>
          </div>
          <div className="rb-form__footer">
            <button type="button" className="rb-btn rb-btn--ghost" onClick={() => setShowAddRoom(false)}>Cancel</button>
            <button type="submit" className="rb-btn rb-btn--primary" disabled={addRoom.isPending || !wardsList.length}>
              {addRoom.isPending ? 'Saving…' : 'Add room'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Add bed */}
      <Modal isOpen={showAddBed} onClose={() => setShowAddBed(false)} title="Add Bed" size="sm" subtitle="Use when you need a bed without a room record">
        <form onSubmit={handleBedSubmit((d) => addBed.mutate(d))} className="rb-form">
          <div>
            <label className="rb-label">Bed number *</label>
            <input {...registerBed('bedNumber', { required: true })} className="rb-field" placeholder="e.g. W1-B01" />
          </div>
          <div>
            <label className="rb-label">Ward *</label>
            <select {...registerBed('ward', { required: true })} className="rb-field">
              <option value="">Select ward</option>
              {wardsList.map((w) => <option key={w._id} value={w._id}>{w.name}</option>)}
            </select>
          </div>
          <div>
            <label className="rb-label">Type</label>
            <select {...registerBed('type')} className="rb-field">
              {BED_TYPES.map((t) => <option key={t} value={t}>{pretty(t)}</option>)}
            </select>
          </div>
          <div>
            <label className="rb-label">Daily rate (₹)</label>
            <input {...registerBed('dailyRate', { valueAsNumber: true })} type="number" className="rb-field" />
          </div>
          <div className="rb-form__footer">
            <button type="button" className="rb-btn rb-btn--ghost" onClick={() => setShowAddBed(false)}>Cancel</button>
            <button type="submit" className="rb-btn rb-btn--primary" disabled={addBed.isPending}>
              {addBed.isPending ? 'Saving…' : 'Add bed'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Ward form */}
      <Modal
        isOpen={showAddWard}
        onClose={() => { setShowAddWard(false); setEditWard(null); resetWard({ type: 'general' }); }}
        title={editWard ? 'Edit Ward' : 'Add Ward'}
        size="sm"
      >
        <form onSubmit={handleWardSubmit((d) => saveWard.mutate(d))} className="rb-form">
          <div>
            <label className="rb-label">Ward name *</label>
            <input {...registerWard('name', { required: true })} className="rb-field" placeholder="e.g. Cardiology Ward" />
          </div>
          <div>
            <label className="rb-label">Code</label>
            <input {...registerWard('code')} className="rb-field" placeholder="e.g. CAR" maxLength={10} />
          </div>
          <div>
            <label className="rb-label">Type</label>
            <select {...registerWard('type')} className="rb-field">
              {WARD_TYPES.map((t) => <option key={t} value={t}>{pretty(t)}</option>)}
            </select>
          </div>
          <div>
            <label className="rb-label">Floor</label>
            <input {...registerWard('floor', { valueAsNumber: true })} type="number" className="rb-field" />
          </div>
          <div>
            <label className="rb-label">Description</label>
            <textarea {...registerWard('description')} className="rb-field" rows={2} />
          </div>
          <div className="rb-form__footer">
            <button type="button" className="rb-btn rb-btn--ghost" onClick={() => { setShowAddWard(false); setEditWard(null); }}>Cancel</button>
            <button type="submit" className="rb-btn rb-btn--primary" disabled={saveWard.isPending}>
              {saveWard.isPending ? 'Saving…' : editWard ? 'Update ward' : 'Create ward'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete confirm */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Confirm delete" size="sm">
        <div className="rb-detail">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Permanently delete <strong>{deleteTarget?.name}</strong>?
          </p>
          <div className="rb-form__footer" style={{ borderTop: 'none', paddingTop: 0 }}>
            <button type="button" className="rb-btn rb-btn--ghost" onClick={() => setDeleteTarget(null)}>Cancel</button>
            <button
              type="button"
              className="rb-btn rb-btn--danger"
              disabled={deleteMut.isPending}
              onClick={() => deleteMut.mutate(deleteTarget)}
            >
              {deleteMut.isPending ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
