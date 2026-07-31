import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Building2, Edit2, ToggleLeft, ToggleRight, Trash2, Users } from 'lucide-react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import api from '../services/api';
import Modal from '../components/common/Modal';

const DEPT_COLORS = [
  '#4F46E5', '#0891b2', '#059669', '#d97706', '#dc2626',
  '#7c3aed', '#db2777', '#0d9488', '#ea580c', '#65a30d',
];

const DEFAULT_DEPARTMENTS = [
  { name: 'General Medicine', code: 'GENMED', description: 'General outpatient medical consultations' },
  { name: 'Cardiology', code: 'CARDIO', description: 'Heart and cardiovascular diseases' },
  { name: 'Orthopedics', code: 'ORTHO', description: 'Bone, joint and musculoskeletal conditions' },
  { name: 'Pediatrics', code: 'PEDIA', description: 'Medical care for infants, children and adolescents' },
  { name: 'Gynecology', code: 'GYNEC', description: 'Women\'s reproductive health' },
  { name: 'Neurology', code: 'NEURO', description: 'Brain and nervous system disorders' },
  { name: 'Dermatology', code: 'DERM', description: 'Skin, hair and nail conditions' },
  { name: 'ENT', code: 'ENT', description: 'Ear, Nose and Throat' },
];

export default function DepartmentPage() {
  const [showAdd, setShowAdd] = useState(false);
  const [editDept, setEditDept] = useState(null);
  const [showDelete, setShowDelete] = useState(null);
  const qc = useQueryClient();

  const { data: departments, isLoading } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get('/departments').then(r => r.data.data),
  });

  const { register, handleSubmit, reset, setValue } = useForm();

  const openEdit = (dept) => {
    setEditDept(dept);
    setValue('name', dept.name);
    setValue('code', dept.code);
    setValue('description', dept.description);
    setValue('consultationFee', dept.consultationFee);
    setValue('color', dept.color);
    setValue('location', dept.location);
    setShowAdd(true);
  };

  const createMut = useMutation({
    mutationFn: (d) => editDept
      ? api.put(`/departments/${editDept._id}`, d)
      : api.post('/departments', d),
    onSuccess: () => {
      toast.success(editDept ? 'Department updated!' : 'Department created!');
      qc.invalidateQueries(['departments']);
      setShowAdd(false);
      setEditDept(null);
      reset();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const toggleMut = useMutation({
    mutationFn: (id) => api.put(`/departments/${id}/toggle`),
    onSuccess: () => { toast.success('Status updated'); qc.invalidateQueries(['departments']); },
  });

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/departments/${id}`),
    onSuccess: () => { toast.success('Department deleted'); qc.invalidateQueries(['departments']); setShowDelete(null); },
    onError: (err) => toast.error(err.response?.data?.message || 'Cannot delete'),
  });

  const seedMut = useMutation({
    mutationFn: (dept) => api.post('/departments', { ...dept, isActive: true }),
    onSuccess: () => qc.invalidateQueries(['departments']),
  });

  const handleSeedDefaults = async () => {
    const existingNames = (departments || []).map(d => d.name.toLowerCase());
    const toSeed = DEFAULT_DEPARTMENTS.filter(d => !existingNames.includes(d.name.toLowerCase()));
    if (!toSeed.length) { toast('All default departments already exist'); return; }
    await Promise.all(toSeed.map((d, i) => seedMut.mutateAsync({ ...d, color: DEPT_COLORS[i % DEPT_COLORS.length] })));
    toast.success(`${toSeed.length} departments seeded!`);
  };

  const statusColor = (isActive) => isActive
    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Department Management</h1>
          <p className="text-sm text-gray-500 mt-1">{departments?.length || 0} departments configured</p>
        </div>
        <div className="flex gap-3">
          <button onClick={handleSeedDefaults} className="btn-secondary text-sm">
            Seed Defaults
          </button>
          <button onClick={() => { setEditDept(null); reset(); setShowAdd(true); }} className="btn-primary">
            <Plus size={16} /> Add Department
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700 animate-pulse h-36" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(departments || []).map((dept) => (
            <div key={dept._id}
              className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
              <div className="h-1.5" style={{ backgroundColor: dept.color || '#4F46E5' }} />
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: `${dept.color || '#4F46E5'}20` }}>
                      <Building2 size={20} style={{ color: dept.color || '#4F46E5' }} />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white">{dept.name}</p>
                      <p className="text-xs text-gray-400">{dept.code}</p>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColor(dept.isActive)}`}>
                    {dept.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-3 line-clamp-2 min-h-[2.5rem]">
                  {dept.description || 'No description'}
                </p>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-1 text-gray-500">
                    <Users size={14} />
                    <span>{dept.doctorCount || 0} doctors</span>
                  </div>
                  <span className="font-medium text-green-600">₹{dept.consultationFee || 0} fee</span>
                </div>
                <div className="flex gap-2 mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
                  <button onClick={() => openEdit(dept)}
                    className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 hover:bg-blue-100 font-medium transition-colors">
                    <Edit2 size={13} /> Edit
                  </button>
                  <button onClick={() => toggleMut.mutate(dept._id)}
                    className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 font-medium transition-colors">
                    {dept.isActive ? <ToggleRight size={13} /> : <ToggleLeft size={13} />}
                    {dept.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                  <button onClick={() => setShowDelete(dept)}
                    className="flex items-center justify-center px-2 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-500 hover:bg-red-100 transition-colors">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {!departments?.length && (
            <div className="col-span-3 bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-12 text-center border-2 border-dashed border-gray-200 dark:border-gray-700">
              <Building2 size={32} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500">No departments yet. Click "Seed Defaults" to get started.</p>
            </div>
          )}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal isOpen={showAdd} onClose={() => { setShowAdd(false); setEditDept(null); reset(); }}
        title={editDept ? 'Edit Department' : 'Add Department'} size="md">
        <form onSubmit={handleSubmit((d) => createMut.mutate(d))} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Department Name *</label>
              <input {...register('name', { required: true })} className="input-field" placeholder="e.g. Cardiology" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Department Code</label>
              <input {...register('code')} className="input-field" placeholder="e.g. CARDIO" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea {...register('description')} className="input-field" rows={2} placeholder="Brief description of the department" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Consultation Fee (₹)</label>
              <input {...register('consultationFee', { valueAsNumber: true })} type="number" className="input-field" defaultValue={200} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Location</label>
              <input {...register('location')} className="input-field" placeholder="e.g. Block A, Floor 2" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Color</label>
              <input {...register('color')} type="color" className="input-field h-10" defaultValue="#4F46E5" />
            </div>
            <div className="flex items-center gap-2 mt-4">
              <input {...register('isActive')} type="checkbox" id="deptActive" className="w-4 h-4 rounded" defaultChecked />
              <label htmlFor="deptActive" className="text-sm font-medium">Active</label>
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-4 border-t">
            <button type="button" onClick={() => { setShowAdd(false); setEditDept(null); reset(); }} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={createMut.isPending} className="btn-primary">
              {createMut.isPending ? 'Saving...' : editDept ? 'Update' : 'Create Department'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <Modal isOpen={!!showDelete} onClose={() => setShowDelete(null)} title="Confirm Delete" size="sm">
        <div className="p-6">
          <p className="text-gray-600 dark:text-gray-300 mb-4">
            Are you sure you want to delete <strong>{showDelete?.name}</strong>?
            This cannot be undone if there are no linked doctors.
          </p>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setShowDelete(null)} className="btn-secondary">Cancel</button>
            <button onClick={() => deleteMut.mutate(showDelete._id)} disabled={deleteMut.isPending}
              className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 font-medium text-sm">
              {deleteMut.isPending ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
