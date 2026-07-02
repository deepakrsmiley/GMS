import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, UserCog, Edit2 } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';
import toast from 'react-hot-toast';
import api from '../services/api';
import Modal from '../components/common/Modal';
import DataTable from '../components/common/DataTable';
import { STAFF_ROLES } from '../utils/roles';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function StaffPage() {
  const [page, setPage] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [editStaff, setEditStaff] = useState(null);
  const qc = useQueryClient();

  const { data: departments } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get('/departments').then(r => r.data.data),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['staff', page],
    queryFn: () => api.get(`/staff?page=${page}&limit=20`).then(r => r.data),
  });

  const { register, handleSubmit, reset, control, setValue, watch } = useForm();
  const selectedRole = watch('role');
  const isDoctor = selectedRole === 'Doctor';

  const openEdit = (staff) => {
    setEditStaff(staff);
    Object.entries(staff).forEach(([k, v]) => {
      if (k === 'department') setValue(k, v?._id || v);
      else setValue(k, v);
    });
    setShowAdd(true);
  };

  const createMut = useMutation({
    mutationFn: (d) => editStaff
      ? api.put(`/staff/${editStaff._id}`, d)
      : api.post('/staff', d),
    onSuccess: () => {
      toast.success(editStaff ? 'Staff updated!' : 'Staff added!');
      qc.invalidateQueries(['staff']);
      setShowAdd(false);
      setEditStaff(null);
      reset();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const toggleMut = useMutation({
    mutationFn: (id) => api.put(`/staff/${id}/toggle-status`),
    onSuccess: () => qc.invalidateQueries(['staff']),
  });

  const columns = [
    { key: 'name', header: 'Name', render: r => (
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white text-sm font-bold">{r.name?.charAt(0)}</div>
        <div><p className="font-medium text-gray-900 dark:text-white">{r.name}</p><p className="text-xs text-gray-400">{r.email}</p></div>
      </div>
    )},
    { key: 'role', header: 'Role', render: r => <span className="badge-blue capitalize">{r.role?.replace('_', ' ')}</span> },
    { key: 'department', header: 'Dept', render: r => r.department?.name || 'N/A' },
    { key: 'specialization', header: 'Specialization', render: r => r.specialization || '—' },
    { key: 'phone', header: 'Phone', render: r => r.phone || 'N/A' },
    { key: 'isActive', header: 'Status', render: r => <span className={r.isActive ? 'badge-green' : 'badge-red'}>{r.isActive ? 'Active' : 'Inactive'}</span> },
    { key: 'actions', header: '', render: r => (
      <div className="flex gap-2">
        <button onClick={e => { e.stopPropagation(); openEdit(r); }} className="text-blue-600 hover:text-blue-800 p-1"><Edit2 size={14} /></button>
        <button onClick={e => { e.stopPropagation(); toggleMut.mutate(r._id); }}
          className={`text-xs font-medium ${r.isActive ? 'text-red-500 hover:text-red-700' : 'text-green-500 hover:text-green-700'}`}>
          {r.isActive ? 'Deactivate' : 'Activate'}
        </button>
      </div>
    )},
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Staff Management</h1>
        <button onClick={() => { setEditStaff(null); reset(); setShowAdd(true); }} className="btn-primary">
          <Plus size={16} /> Add Staff
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
        <DataTable columns={columns} data={data?.data || []} loading={isLoading} page={page} pages={data?.pages || 1} onPageChange={setPage} />
      </div>

      <Modal isOpen={showAdd} onClose={() => { setShowAdd(false); setEditStaff(null); reset(); }}
        title={editStaff ? 'Edit Staff' : 'Add Staff Member'} size="xl">
        <form onSubmit={handleSubmit((d) => createMut.mutate(d))} className="p-6 space-y-5">
          {/* Basic Info */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 pb-1 border-b border-gray-100 dark:border-gray-700">Basic Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Full Name *</label>
                <input {...register('name', { required: true })} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Email *</label>
                <input {...register('email', { required: true })} type="email" className="input-field" />
              </div>
              {!editStaff && (
                <div>
                  <label className="block text-sm font-medium mb-1">Password *</label>
                  <input {...register('password', { required: !editStaff, minLength: 6 })} type="password" className="input-field" placeholder="Min 6 characters" />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-1">Role *</label>
                <select {...register('role', { required: true })} className="input-field">
                  <option value="">Select role</option>
                  {STAFF_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Phone</label>
                <input {...register('phone')} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Qualification</label>
                <input {...register('qualification')} className="input-field" placeholder="e.g. MBBS, MD" />
              </div>
            </div>
          </div>

          {/* Department Info */}
          {isDoctor && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 pb-1 border-b border-gray-100 dark:border-gray-700">Department Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Department {isDoctor && <span className="text-red-500">*</span>}</label>
                <select {...register('department', { required: isDoctor })} className="input-field">
                  <option value="">Select department</option>
                  {(departments || []).map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Specialization</label>
                <input {...register('specialization')} className="input-field" placeholder="For doctors" />
              </div>
            </div>
          </div>
          )}

          {/* Doctor-specific fields */}
          {isDoctor && (
            <>
              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 pb-1 border-b border-gray-100 dark:border-gray-700">Consultation Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Consultation Fee (₹)</label>
                    <input {...register('consultationFee', { valueAsNumber: true })} type="number" className="input-field" defaultValue={200} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Follow-up Fee (₹)</label>
                    <input {...register('followUpFee', { valueAsNumber: true })} type="number" className="input-field" defaultValue={100} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Morning Session Start</label>
                    <input {...register('morningSessionStart')} type="time" className="input-field" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Morning Session End</label>
                    <input {...register('morningSessionEnd')} type="time" className="input-field" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Evening Session Start</label>
                    <input {...register('eveningSessionStart')} type="time" className="input-field" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Evening Session End</label>
                    <input {...register('eveningSessionEnd')} type="time" className="input-field" />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 pb-1 border-b border-gray-100 dark:border-gray-700">Available Days</h3>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map((day, i) => (
                    <label key={day} className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input {...register(`availability.${i}.day`)} type="checkbox" value={day} className="w-4 h-4 rounded accent-blue-600" />
                      {day.slice(0, 3)}
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Status */}
          <div className="flex items-center gap-2">
            <input {...register('isActive')} type="checkbox" id="staffActive" defaultChecked className="w-4 h-4 rounded" />
            <label htmlFor="staffActive" className="text-sm font-medium">Active</label>
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
            <button type="button" onClick={() => { setShowAdd(false); setEditStaff(null); reset(); }} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={createMut.isPending} className="btn-primary">
              <UserCog size={16} /> {createMut.isPending ? 'Saving...' : editStaff ? 'Update Staff' : 'Add Staff'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
