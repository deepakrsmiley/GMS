import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, UserCog, Edit2, Trash2, ShieldCheck, RotateCcw, CheckSquare, Square, Search } from 'lucide-react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useDispatch, useSelector } from 'react-redux';
import api from '../services/api';
import { checkAuth } from '../redux/slices/authSlice';
import Modal from '../components/common/Modal';
import DataTable from '../components/common/DataTable';
import { STAFF_ROLES } from '../utils/roles';
import { PERMISSION_GROUPS, ALL_PERMISSIONS, getDefaultPermissionsForRole, PHARMACY_FULL_CONTROL_PERMISSIONS, NURSE_STATION_BUNDLE, looksLikeFullChecklist } from '../constants/permissions';
import '../styles/staffManagement.css';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Keep "Full inventory control" in sync with individual pharmacy edit boxes. */
const syncPharmacyManageFlag = (perms) => {
  const next = [...perms];
  const hasAll = PHARMACY_FULL_CONTROL_PERMISSIONS.every((c) => next.includes(c));
  if (hasAll && !next.includes('MANAGE_PHARMACY')) next.push('MANAGE_PHARMACY');
  if (!hasAll) return next.filter((c) => c !== 'MANAGE_PHARMACY');
  return next;
};

const expandPermissions = (perms) => {
  if (!Array.isArray(perms) || perms.length === 0) return [];
  if (perms.includes('*')) return [...ALL_PERMISSIONS];
  let next = [...perms];
  // Legacy: MANAGE_PHARMACY alone meant full control — expand so checkboxes match reality
  if (next.includes('MANAGE_PHARMACY')) {
    next = [...new Set([...next, 'VIEW_PHARMACY', ...PHARMACY_FULL_CONTROL_PERMISSIONS])];
  }
  if (next.includes('VIEW_NURSE_STATION')) {
    next = [...new Set([...next, ...NURSE_STATION_BUNDLE])];
  }
  return syncPharmacyManageFlag(next);
};

const sameSet = (a = [], b = []) => {
  if (a.length !== b.length) return false;
  const sa = [...a].sort().join('|');
  const sb = [...b].sort().join('|');
  return sa === sb;
};

/** Role defaults + extra ticks. A previously saved full checklist keeps Super Admin unchecks. */
const checklistForStaff = (role, stored) => {
  const defaults = getDefaultPermissionsForRole(role);
  const custom = Array.isArray(stored) ? stored.filter(Boolean) : [];
  if (custom.includes('*')) return expandPermissions(['*']);
  if (!custom.length) return expandPermissions(defaults);
  if (looksLikeFullChecklist(custom, defaults)) return expandPermissions(custom);
  return expandPermissions([...new Set([...defaults, ...custom])]);
};

export default function StaffPage() {
  const [page, setPage] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [editStaff, setEditStaff] = useState(null);
  const [showDelete, setShowDelete] = useState(null);
  const [selectedPermissions, setSelectedPermissions] = useState([]);
  const [isActiveChecked, setIsActiveChecked] = useState(true);
  const [permSearch, setPermSearch] = useState('');
  const qc = useQueryClient();
  const dispatch = useDispatch();
  const currentUser = useSelector((s) => s.auth?.user);

  const editStaffRef = useRef(null);
  useEffect(() => {
    editStaffRef.current = editStaff;
  }, [editStaff]);

  const { data: departments } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get('/departments').then((r) => r.data.data),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['staff', page],
    queryFn: () => api.get(`/staff?page=${page}&limit=20`).then((r) => r.data),
  });

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm({
    shouldUnregister: true,
  });
  const selectedRole = watch('role');
  const isDoctor = selectedRole === 'Doctor';

  useEffect(() => {
    if (!selectedRole) return;
    if (!editStaff) {
      setSelectedPermissions(getDefaultPermissionsForRole(selectedRole));
      return;
    }
    if (selectedRole !== editStaff.role) {
      setSelectedPermissions(expandPermissions(getDefaultPermissionsForRole(selectedRole)));
    }
  }, [selectedRole, editStaff]);

  const togglePermission = (code) => {
    setSelectedPermissions((prev) => {
      let next;
      if (prev.includes(code)) {
        next = prev.filter((c) => c !== code);
        // Unchecking Full control → lock all pharmacy inventoy actions
        if (code === 'MANAGE_PHARMACY') {
          next = next.filter((c) => !PHARMACY_FULL_CONTROL_PERMISSIONS.includes(c));
        }
      } else {
        next = [...prev, code];
        // Checking Full control → enable every inventory action below it
        if (code === 'MANAGE_PHARMACY') {
          next = [...new Set([...next, 'VIEW_PHARMACY', ...PHARMACY_FULL_CONTROL_PERMISSIONS])];
        }
        // Checking Nurse Station → enable every action that page needs
        if (code === 'VIEW_NURSE_STATION') {
          next = [...new Set([...next, ...NURSE_STATION_BUNDLE])];
        }
      }
      // Unchecking Edit medicine / batch / etc. automatically clears Full control
      return syncPharmacyManageFlag(next);
    });
  };

  const toggleGroup = (groupCodes, allSelected) => {
    setSelectedPermissions((prev) => {
      const next = allSelected
        ? prev.filter((c) => !groupCodes.includes(c))
        : [...new Set([...prev, ...groupCodes])];
      return syncPharmacyManageFlag(next);
    });
  };

  const closeForm = () => {
    setShowAdd(false);
    setEditStaff(null);
    editStaffRef.current = null;
    setSelectedPermissions([]);
    setIsActiveChecked(true);
    setPermSearch('');
    reset();
  };

  const openEdit = (staff) => {
    setEditStaff(staff);
    editStaffRef.current = staff;
    Object.entries(staff).forEach(([k, v]) => {
      if (k === 'department') setValue(k, v?._id || v);
      else if (k !== 'password' && k !== 'isActive') setValue(k, v);
    });
    setValue('password', '');
    setIsActiveChecked(staff.isActive !== false);
    setSelectedPermissions(checklistForStaff(staff.role, staff.permissions));
    setShowAdd(true);
  };

  const openCreate = () => {
    setEditStaff(null);
    editStaffRef.current = null;
    setSelectedPermissions([]);
    setIsActiveChecked(true);
    reset();
    setShowAdd(true);
  };

  const createMut = useMutation({
    mutationFn: (d) => {
      const allSelected =
        selectedPermissions.length === ALL_PERMISSIONS.length
        || selectedPermissions.includes('*');
      const roleDefaults = expandPermissions(getDefaultPermissionsForRole(selectedRole));
      const keepRoleDefaults = sameSet(selectedPermissions, roleDefaults);
      const payload = {
        ...d,
        isActive: isActiveChecked,
        permissions: allSelected && selectedRole === 'Super Admin'
          ? ['*']
          : keepRoleDefaults
            ? []
            : selectedPermissions,
      };
      // Unchecked day checkboxes submit `false`, which the backend's enum
      // validation rejects — keep only real day names.
      if (Array.isArray(payload.availability)) {
        payload.availability = payload.availability.filter(
          (a) => a && typeof a.day === 'string' && a.day,
        );
      }
      if (payload.department === '') delete payload.department;
      if (editStaff && !payload.password) delete payload.password;
      return editStaff
        ? api.put(`/staff/${editStaff._id}`, payload, { skipErrorToast: true })
        : api.post('/staff', payload, { skipErrorToast: true });
    },
    onSuccess: () => {
      const selfId = currentUser?._id || currentUser?.id;
      const editedSelf = editStaff && selfId && String(editStaff._id) === String(selfId);
      toast.success(
        editStaff
          ? (editedSelf
            ? 'Staff updated. Your access is applied now.'
            : 'Staff updated. Their new access applies within 30 seconds, or when they refresh.')
          : 'Staff added',
      );
      qc.invalidateQueries(['staff']);
      closeForm();
      if (editedSelf) dispatch(checkAuth());
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to save staff member');
    },
  });

  const toggleMut = useMutation({
    mutationFn: (id) => api.put(`/staff/${id}/toggle-status`),
    onSuccess: () => qc.invalidateQueries(['staff']),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/staff/${id}`),
    onSuccess: () => {
      toast.success('Staff member deleted');
      qc.invalidateQueries(['staff']);
      setShowDelete(null);
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to delete staff member');
    },
  });

  const onInvalid = (formErrors) => {
    const firstField = Object.keys(formErrors)[0];
    toast.error(`Please check the "${firstField}" field — it's required or invalid.`);
  };

  const permCount = selectedPermissions.includes('*')
    ? ALL_PERMISSIONS.length
    : selectedPermissions.length;

  const filteredPermGroups = useMemo(() => {
    const q = permSearch.trim().toLowerCase();
    if (!q) return PERMISSION_GROUPS;
    return PERMISSION_GROUPS.map((group) => {
      const moduleMatch = group.module.toLowerCase().includes(q);
      const permissions = moduleMatch
        ? group.permissions
        : group.permissions.filter(
            (p) =>
              p.label.toLowerCase().includes(q) ||
              p.code.toLowerCase().includes(q),
          );
      return { ...group, permissions };
    }).filter((g) => g.permissions.length > 0);
  }, [permSearch]);

  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (r) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-sm bg-slate-800 text-white text-xs font-semibold flex items-center justify-center">
            {r.name?.charAt(0)?.toUpperCase()}
          </div>
          <div>
            <p className="font-medium text-slate-900 dark:text-white text-sm">{r.name}</p>
            <p className="text-[11px] text-slate-400">{r.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      render: (r) => (
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200">
          {r.role}
        </span>
      ),
    },
    { key: 'department', header: 'Dept', render: (r) => r.department?.name || '—' },
    { key: 'specialization', header: 'Specialization', render: (r) => r.specialization || '—' },
    { key: 'phone', header: 'Phone', render: (r) => r.phone || '—' },
    {
      key: 'isActive',
      header: 'Status',
      render: (r) => (
        <span className={r.isActive ? 'badge-green' : 'badge-red'}>
          {r.isActive ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    {
      key: 'permissions',
      header: 'Access',
      render: (r) => (
        r.permissions?.length > 0 ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700">
            <ShieldCheck size={12} />
            {r.permissions.includes('*') ? 'Full access' : `${r.permissions.length} permissions`}
          </span>
        ) : (
          <span className="text-[11px] text-slate-400">Role default</span>
        )
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (r) => {
        const isSelf = currentUser && (r._id === currentUser._id || r._id === currentUser.id);
        return (
          <div className="flex items-center gap-2">
            <button type="button" onClick={(e) => { e.stopPropagation(); openEdit(r); }} className="text-blue-600 hover:text-blue-800 p-1" title="Edit">
              <Edit2 size={14} />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); toggleMut.mutate(r._id); }}
              className={`text-[11px] font-semibold ${r.isActive ? 'text-amber-600' : 'text-emerald-600'}`}
            >
              {r.isActive ? 'Deactivate' : 'Activate'}
            </button>
            {!isSelf && (
              <button type="button" onClick={(e) => { e.stopPropagation(); setShowDelete(r); }} className="text-red-500 hover:text-red-700 p-1" title="Delete user">
                <Trash2 size={14} />
              </button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="staff-shell space-y-3">
      <header className="staff-masthead">
        <div>
          <p className="staff-masthead__eyebrow">Administration · Access control</p>
          <h1 className="staff-masthead__title">User Management</h1>
        </div>
        <button type="button" onClick={openCreate} className="staff-masthead__btn">
          <Plus size={14} /> Add staff
        </button>
      </header>

      <div className="staff-table-card">
        <DataTable
          columns={columns}
          data={data?.data || []}
          loading={isLoading}
          page={page}
          pages={data?.pages || 1}
          onPageChange={setPage}
        />
      </div>

      <Modal
        isOpen={showAdd}
        onClose={closeForm}
        title={editStaff ? 'Edit Staff' : 'Add Staff Member'}
        subtitle={
          editStaff
            ? `${editStaff.name} · ${editStaff.role || 'Staff'} · ${ALL_PERMISSIONS.length} permission options`
            : `Create account and assign any of ${ALL_PERMISSIONS.length} HMS permissions`
        }
        size="xl"
      >
        <form onSubmit={handleSubmit((d) => createMut.mutate(d), onInvalid)} className="staff-form">
          <div className="staff-form__body">
            <section className="staff-section">
              <div className="staff-section__head">
                <h3 className="staff-section__title">Basic information</h3>
              </div>
              <div className="staff-section__body staff-grid-2">
                <div>
                  <label className="staff-label">Full name *</label>
                  <input {...register('name', { required: true })} className="staff-field" />
                  {errors.name && <p className="staff-error">Name is required</p>}
                </div>
                <div>
                  <label className="staff-label">Email *</label>
                  <input {...register('email', { required: true })} type="email" className="staff-field" placeholder="Unique per hospital" />
                  {errors.email && <p className="staff-error">Email is required</p>}
                  <p className="text-[11px] text-slate-400 mt-1">
                    Same role (e.g. Admin / Doctor) is fine in every hospital. Email must be unique inside this hospital only.
                  </p>
                </div>
                {!editStaff && (
                  <div>
                    <label className="staff-label">Password *</label>
                    <input
                      {...register('password', {
                        validate: (value) => {
                          if (editStaffRef.current) return true;
                          if (!value) return 'Password is required';
                          if (value.length < 6) return 'Min 6 characters';
                          return true;
                        },
                      })}
                      type="password"
                      className="staff-field"
                      placeholder="Min 6 characters"
                    />
                    {errors.password && <p className="staff-error">{errors.password.message}</p>}
                  </div>
                )}
                <div>
                  <label className="staff-label">Role *</label>
                  <select {...register('role', { required: true })} className="staff-field">
                    <option value="">Select role</option>
                    {STAFF_ROLES.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                  {errors.role && <p className="staff-error">Role is required</p>}
                </div>
                <div>
                  <label className="staff-label">Phone</label>
                  <input {...register('phone')} className="staff-field" />
                </div>
                <div>
                  <label className="staff-label">Qualification</label>
                  <input {...register('qualification')} className="staff-field" placeholder="e.g. MBBS, MD" />
                </div>
              </div>
            </section>

            {isDoctor && (
              <section className="staff-section">
                <div className="staff-section__head">
                  <h3 className="staff-section__title">Department</h3>
                </div>
                <div className="staff-section__body staff-grid-2">
                  <div>
                    <label className="staff-label">Department *</label>
                    <select {...register('department', { required: isDoctor })} className="staff-field">
                      <option value="">Select department</option>
                      {(departments || []).map((d) => (
                        <option key={d._id} value={d._id}>{d.name}</option>
                      ))}
                    </select>
                    {errors.department && <p className="staff-error">Department is required for doctors</p>}
                  </div>
                  <div>
                    <label className="staff-label">Specialization</label>
                    <input {...register('specialization')} className="staff-field" />
                  </div>
                </div>
              </section>
            )}

            {isDoctor && (
              <>
                <section className="staff-section">
                  <div className="staff-section__head">
                    <h3 className="staff-section__title">Consultation details</h3>
                  </div>
                  <div className="staff-section__body staff-grid-2">
                    <div>
                      <label className="staff-label">Consultation fee (₹)</label>
                      <input {...register('consultationFee', { valueAsNumber: true })} type="number" className="staff-field" defaultValue={200} />
                    </div>
                    <div>
                      <label className="staff-label">Follow-up fee (₹)</label>
                      <input {...register('followUpFee', { valueAsNumber: true })} type="number" className="staff-field" defaultValue={100} />
                    </div>
                    <div>
                      <label className="staff-label">Morning start</label>
                      <input {...register('morningSessionStart')} type="time" className="staff-field" />
                    </div>
                    <div>
                      <label className="staff-label">Morning end</label>
                      <input {...register('morningSessionEnd')} type="time" className="staff-field" />
                    </div>
                    <div>
                      <label className="staff-label">Evening start</label>
                      <input {...register('eveningSessionStart')} type="time" className="staff-field" />
                    </div>
                    <div>
                      <label className="staff-label">Evening end</label>
                      <input {...register('eveningSessionEnd')} type="time" className="staff-field" />
                    </div>
                  </div>
                </section>

                <section className="staff-section">
                  <div className="staff-section__head">
                    <h3 className="staff-section__title">Available days</h3>
                    <span className="staff-section__meta">Clinic schedule</span>
                  </div>
                  <div className="staff-section__body">
                    <div className="staff-days">
                      {DAYS.map((day, i) => (
                        <label key={day} className="staff-day">
                          <input {...register(`availability.${i}.day`)} type="checkbox" value={day} />
                          <span>{day.slice(0, 3)}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </section>
              </>
            )}

            <section className="staff-section">
              <div className="staff-section__head">
                <h3 className="staff-section__title">
                  <span className="inline-flex items-center gap-1.5">
                    <ShieldCheck size={12} /> Feature permissions
                  </span>
                </h3>
                <div className="staff-perm-toolbar">
                  <span className="staff-section__meta">{permCount} / {ALL_PERMISSIONS.length} selected</span>
                  <button
                    type="button"
                    className="staff-perm-btn staff-perm-btn--accent"
                    disabled={!selectedRole}
                    onClick={() => selectedRole && setSelectedPermissions(
                      expandPermissions(getDefaultPermissionsForRole(selectedRole))
                    )}
                  >
                    <RotateCcw size={11} /> Reset default
                  </button>
                  <button
                    type="button"
                    className="staff-perm-btn"
                    onClick={() =>
                      setSelectedPermissions((prev) =>
                        prev.length === ALL_PERMISSIONS.length || prev.includes('*')
                          ? []
                          : [...ALL_PERMISSIONS]
                      )
                    }
                  >
                    {permCount === ALL_PERMISSIONS.length
                      ? <><Square size={11} /> Clear all</>
                      : <><CheckSquare size={11} /> Select all</>}
                  </button>
                </div>
              </div>
              <div className="staff-section__body">
                <p className="staff-perm-hint">
                  Tick what this user can do. For Pharmacy: uncheck <strong>Edit medicine</strong> (or any inventory action)
                  to lock direct edits — staff can still use <strong>Change Requests</strong> if that permission stays on.
                  Unchecking an edit box also clears &quot;Full inventory control&quot; automatically.
                </p>
                <div className="relative mb-3">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={permSearch}
                    onChange={(e) => setPermSearch(e.target.value)}
                    className="staff-field pl-9"
                    placeholder={`Search all ${ALL_PERMISSIONS.length} permissions (e.g. adjust stock, edit bill, discharge)…`}
                  />
                </div>
                <div className="staff-perm-matrix">
                  {filteredPermGroups.map((group) => {
                    const groupCodes = group.permissions.map((p) => p.code);
                    const selectedInGroup = groupCodes.filter((c) => selectedPermissions.includes(c)).length;
                    const allSelected = groupCodes.length > 0 && selectedInGroup === groupCodes.length;
                    return (
                      <div key={group.module} className="staff-perm-module">
                        <label className="staff-perm-module__head">
                          <input
                            type="checkbox"
                            checked={allSelected}
                            onChange={() => toggleGroup(groupCodes, allSelected)}
                          />
                          <span className="staff-perm-module__name">{group.module}</span>
                          <span className="staff-perm-module__count">{selectedInGroup}/{groupCodes.length}</span>
                        </label>
                        <div className="staff-perm-module__list">
                          {group.permissions.map((perm) => (
                            <label key={perm.code} className="staff-perm-item">
                              <input
                                type="checkbox"
                                checked={selectedPermissions.includes(perm.code)}
                                onChange={() => togglePermission(perm.code)}
                              />
                              <span>
                                {perm.label}
                                <span className="staff-perm-code"> {perm.code}</span>
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {!filteredPermGroups.length && (
                    <p className="text-sm text-slate-400 py-6 text-center">No permissions match “{permSearch}”.</p>
                  )}
                </div>
              </div>
            </section>
          </div>

          <div className="staff-form__footer">
            <label className="staff-status">
              <input
                type="checkbox"
                checked={isActiveChecked}
                onChange={(e) => setIsActiveChecked(e.target.checked)}
              />
              Account status
              <span className={`staff-status__badge ${isActiveChecked ? 'is-on' : ''}`}>
                {isActiveChecked ? 'Active' : 'Inactive'}
              </span>
            </label>
            <div className="staff-actions">
              {editStaff && currentUser && editStaff._id !== currentUser._id && editStaff._id !== currentUser.id && (
                <button
                  type="button"
                  className="staff-btn staff-btn--danger"
                  onClick={() => { closeForm(); setShowDelete(editStaff); }}
                >
                  <Trash2 size={13} /> Delete
                </button>
              )}
              <button type="button" onClick={closeForm} className="staff-btn staff-btn--ghost">Cancel</button>
              <button type="submit" disabled={createMut.isPending} className="staff-btn staff-btn--primary">
                <UserCog size={13} />
                {createMut.isPending ? 'Saving…' : editStaff ? 'Update staff' : 'Add staff'}
              </button>
            </div>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!showDelete} onClose={() => setShowDelete(null)} title="Delete Staff Member" size="sm">
        <div className="p-6">
          <p className="text-slate-600 dark:text-gray-300 mb-2 text-sm">
            Permanently delete{' '}
            <strong className="text-slate-900 dark:text-white">{showDelete?.name}</strong>
            {showDelete?.email ? ` (${showDelete.email})` : ''}?
          </p>
          <p className="text-xs text-red-600 mb-5">This cannot be undone. Login access is removed immediately.</p>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowDelete(null)} className="staff-btn staff-btn--ghost">Cancel</button>
            <button
              type="button"
              onClick={() => deleteMut.mutate(showDelete._id)}
              disabled={deleteMut.isPending}
              className="staff-btn staff-btn--primary"
              style={{ background: '#b91c1c' }}
            >
              {deleteMut.isPending ? 'Deleting…' : 'Delete user'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
