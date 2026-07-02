import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Plus, Search, User, Phone, Droplet } from 'lucide-react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import api from '../services/api';
import Modal from '../components/common/Modal';
import DataTable from '../components/common/DataTable';

const bloodGroups = ['A+','A-','B+','B-','AB+','AB-','O+','O-'];
const genders = ['Male','Female','Other'];

export default function PatientsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['patients', page, search],
    queryFn: () => api.get(`/patients?page=${page}&limit=20${search ? `&search=${search}` : ''}`).then(r => r.data),
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm();

  const createMut = useMutation({
    mutationFn: (d) => api.post('/patients', d),
    onSuccess: () => { toast.success('Patient registered!'); qc.invalidateQueries(['patients']); setShowAdd(false); reset(); },
  });

  const columns = [
    { key: 'patientId', header: 'Patient ID', render: (r) => <span className="font-mono text-blue-600 dark:text-blue-400 font-semibold">{r.patientId}</span> },
    { key: 'name', header: 'Name', render: (r) => (
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white text-xs font-bold">{r.name?.charAt(0)}</div>
        <div>
          <p className="font-medium text-gray-900 dark:text-white">{r.name}</p>
          <p className="text-xs text-gray-400">{r.age}yr • {r.gender}</p>
        </div>
      </div>
    )},
    { key: 'phone', header: 'Phone', render: (r) => <span className="flex items-center gap-1 text-gray-600 dark:text-gray-300"><Phone size={12} />{r.phone}</span> },
    { key: 'bloodGroup', header: 'Blood', render: (r) => r.bloodGroup ? <span className="badge-red">{r.bloodGroup}</span> : '-' },
    { key: 'createdAt', header: 'Registered', render: (r) => new Date(r.createdAt).toLocaleDateString('en-IN') },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Patients</h1>
          <p className="text-gray-500 text-sm mt-1">{data?.total || 0} registered patients</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary">
          <Plus size={16} /> Register Patient
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700">
          <div className="relative max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Search by name, ID, phone..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="input-field pl-9" />
          </div>
        </div>
        <DataTable columns={columns} data={data?.data || []} loading={isLoading} page={page} pages={data?.pages || 1} onPageChange={setPage} onRowClick={setSelected} />
      </div>

      {/* Add Patient Modal */}
      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Register New Patient" size="lg">
        <form onSubmit={handleSubmit((d) => createMut.mutate(d))} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Full Name *</label>
              <input {...register('name', { required: true })} className="input-field" placeholder="Patient full name" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone *</label>
              <input {...register('phone', { required: true })} className="input-field" placeholder="Mobile number" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Age *</label>
              <input {...register('age', { required: true, min: 0 })} type="number" className="input-field" placeholder="Age in years" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Gender *</label>
              <select {...register('gender', { required: true })} className="input-field">
                <option value="">Select gender</option>
                {genders.map((g) => <option key={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Blood Group</label>
              <select {...register('bloodGroup')} className="input-field">
                <option value="">Unknown</option>
                {bloodGroups.map((b) => <option key={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
              <input {...register('email')} type="email" className="input-field" placeholder="Email address" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Address</label>
              <textarea {...register('address.street')} className="input-field" rows={2} placeholder="Street address" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Emergency Contact</label>
              <input {...register('emergencyContact.name')} className="input-field" placeholder="Contact name" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Emergency Phone</label>
              <input {...register('emergencyContact.phone')} className="input-field" placeholder="Contact phone" />
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
            <button type="button" onClick={() => setShowAdd(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={createMut.isPending} className="btn-primary">
              {createMut.isPending ? 'Registering...' : 'Register Patient'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Patient Detail Modal */}
      <Modal isOpen={!!selected} onClose={() => setSelected(null)} title={selected?.name || 'Patient Details'} size="lg">
        {selected && (
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center text-white text-2xl font-bold">
                {selected.name?.charAt(0)}
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">{selected.name}</h3>
                <p className="text-gray-500">{selected.patientId} • {selected.age}yr • {selected.gender} • {selected.bloodGroup || 'Blood group unknown'}</p>
                <p className="text-gray-500 text-sm">{selected.phone}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-3">
                <p className="text-gray-400 text-xs">Email</p>
                <p className="text-gray-900 dark:text-white font-medium">{selected.email || 'N/A'}</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-3">
                <p className="text-gray-400 text-xs">Marital Status</p>
                <p className="text-gray-900 dark:text-white font-medium">{selected.maritalStatus || 'N/A'}</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-3 col-span-2">
                <p className="text-gray-400 text-xs">Address</p>
                <p className="text-gray-900 dark:text-white font-medium">{selected.address?.street || 'N/A'}</p>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
