import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Wrench, AlertTriangle, CheckCircle, Package, Monitor, Edit2, Trash2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import api from '../services/api';
import Modal from '../components/common/Modal';
import DataTable from '../components/common/DataTable';

const ASSET_CATEGORIES = [
  'Laboratory Equipment',
  'Radiology Equipment',
  'OT Equipment',
  'ICU Equipment',
  'Pharmacy Equipment',
  'General Hospital Equipment',
];

const ASSET_STATUSES = ['Working', 'Under Maintenance', 'Breakdown', 'Repair In Progress', 'Ready to Use', 'Decommissioned'];

const STATUS_COLORS = {
  'Working': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  'Under Maintenance': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  'Breakdown': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  'Repair In Progress': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  'Ready to Use': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  'Decommissioned': 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
};

export default function AssetPage() {
  const [showAdd, setShowAdd] = useState(false);
  const [editAsset, setEditAsset] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [page, setPage] = useState(1);
  const qc = useQueryClient();

  const { data: departments } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get('/departments').then(r => r.data.data),
  });

  const { data: dashboardData } = useQuery({
    queryKey: ['assetDashboard'],
    queryFn: () => api.get('/assets/dashboard').then(r => r.data.data),
  });

  const { data: assets, isLoading } = useQuery({
    queryKey: ['assets', statusFilter, categoryFilter, page],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (categoryFilter) params.set('category', categoryFilter);
      return api.get(`/assets?${params}`).then(r => r.data);
    },
  });

  const { register, handleSubmit, reset, setValue } = useForm();

  const openEdit = (asset) => {
    setEditAsset(asset);
    Object.entries(asset).forEach(([k, v]) => {
      if (k === 'department') setValue(k, v?._id || v);
      else if (k === 'purchaseDate' || k === 'warrantyExpiry') setValue(k, v ? new Date(v).toISOString().split('T')[0] : '');
      else setValue(k, v);
    });
    setShowAdd(true);
  };

  const saveMut = useMutation({
    mutationFn: (d) => editAsset
      ? api.put(`/assets/${editAsset._id}`, d)
      : api.post('/assets', d),
    onSuccess: () => {
      toast.success(editAsset ? 'Asset updated!' : 'Asset added!');
      qc.invalidateQueries(['assets']); qc.invalidateQueries(['assetDashboard']);
      setShowAdd(false); setEditAsset(null); reset();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/assets/${id}`),
    onSuccess: () => { toast.success('Asset decommissioned'); qc.invalidateQueries(['assets']); qc.invalidateQueries(['assetDashboard']); },
  });

  const columns = [
    { key: 'assetId', header: 'Asset ID', render: r => <span className="font-mono text-xs font-semibold text-blue-600">{r.assetId}</span> },
    { key: 'name', header: 'Asset Name', render: r => (
      <div>
        <p className="font-medium text-gray-900 dark:text-white">{r.name}</p>
        <p className="text-xs text-gray-400">{r.category}</p>
      </div>
    )},
    { key: 'department', header: 'Department', render: r => r.department?.name || 'N/A' },
    { key: 'manufacturer', header: 'Manufacturer', render: r => r.manufacturer || 'N/A' },
    { key: 'status', header: 'Status', render: r => (
      <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[r.status] || ''}`}>{r.status}</span>
    )},
    { key: 'warrantyExpiry', header: 'Warranty', render: r => {
      if (!r.warrantyExpiry) return <span className="text-gray-400">N/A</span>;
      const date = new Date(r.warrantyExpiry);
      const soon = date < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const expired = date < new Date();
      return (
        <span className={`text-xs font-medium ${expired ? 'text-red-600' : soon ? 'text-yellow-600' : 'text-gray-600 dark:text-gray-300'}`}>
          {date.toLocaleDateString('en-IN')}
        </span>
      );
    }},
    { key: 'actions', header: '', render: r => (
      <div className="flex gap-2">
        <button onClick={e => { e.stopPropagation(); openEdit(r); }}
          className="text-blue-600 hover:text-blue-800 p-1"><Edit2 size={14} /></button>
      </div>
    )},
  ];

  const dash = dashboardData || {};

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Asset Management</h1>
          <p className="text-sm text-gray-500 mt-1">Hospital machines & equipment</p>
        </div>
        <button onClick={() => { setEditAsset(null); reset(); setShowAdd(true); }} className="btn-primary">
          <Plus size={16} /> Add Asset
        </button>
      </div>

      {/* Dashboard Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Total Assets', value: dash.totalAssets || 0, color: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400', icon: Package },
          { label: 'Working', value: dash.working || 0, color: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400', icon: CheckCircle },
          { label: 'Under Repair', value: dash.underRepair || 0, color: 'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400', icon: Wrench },
          { label: 'Breakdown', value: dash.breakdown || 0, color: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400', icon: AlertTriangle },
          { label: 'Warranty Expiring', value: dash.warrantyExpiringSoon || 0, color: 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400', icon: AlertTriangle },
        ].map(({ label, value, color, icon: Icon }) => (
          <div key={label} className={`${color} rounded-2xl p-4 border border-transparent`}>
            <div className="flex items-center gap-2 mb-2"><Icon size={18} /><p className="text-sm font-medium">{label}</p></div>
            <p className="text-3xl font-bold">{value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input-field w-44">
          <option value="">All Statuses</option>
          {ASSET_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="input-field w-52">
          <option value="">All Categories</option>
          {ASSET_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
        <DataTable
          columns={columns}
          data={assets?.data || []}
          loading={isLoading}
          page={page}
          pages={1}
          onPageChange={setPage}
        />
      </div>

      {/* Add/Edit Modal */}
      <Modal isOpen={showAdd} onClose={() => { setShowAdd(false); setEditAsset(null); reset(); }}
        title={editAsset ? 'Edit Asset' : 'Add Asset'} size="xl">
        <form onSubmit={handleSubmit(d => saveMut.mutate(d))} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Asset Name *</label>
              <input {...register('name', { required: true })} className="input-field" placeholder="e.g. ECG Machine" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Category *</label>
              <select {...register('category', { required: true })} className="input-field">
                <option value="">Select category</option>
                {ASSET_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Manufacturer</label>
              <input {...register('manufacturer')} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Model Number</label>
              <input {...register('modelNumber')} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Serial Number</label>
              <input {...register('serialNumber')} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Department</label>
              <select {...register('department')} className="input-field">
                <option value="">Select department</option>
                {(departments || []).map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Location</label>
              <input {...register('location')} className="input-field" placeholder="e.g. ICU Block B" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Cost (₹)</label>
              <input {...register('cost', { valueAsNumber: true })} type="number" className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Purchase Date</label>
              <input {...register('purchaseDate')} type="date" className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Warranty Expiry</label>
              <input {...register('warrantyExpiry')} type="date" className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Vendor Name</label>
              <input {...register('vendorName')} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Vendor Contact</label>
              <input {...register('vendorContact')} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Status</label>
              <select {...register('status')} className="input-field">
                {ASSET_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea {...register('description')} className="input-field" rows={2} />
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-4 border-t">
            <button type="button" onClick={() => { setShowAdd(false); setEditAsset(null); reset(); }} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saveMut.isPending} className="btn-primary">
              <Monitor size={16} /> {saveMut.isPending ? 'Saving...' : editAsset ? 'Update Asset' : 'Add Asset'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
