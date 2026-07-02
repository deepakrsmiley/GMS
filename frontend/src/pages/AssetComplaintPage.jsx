import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, AlertTriangle, CheckCircle, Wrench, Package, Clock } from 'lucide-react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import api from '../services/api';
import Modal from '../components/common/Modal';

const PRIORITY_COLORS = {
  Low: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  Medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  High: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  Critical: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const STATUS_COLORS = {
  Open: 'bg-red-100 text-red-700',
  Assigned: 'bg-blue-100 text-blue-700',
  'In Progress': 'bg-orange-100 text-orange-700',
  'Waiting for Parts': 'bg-yellow-100 text-yellow-700',
  'Vendor Service': 'bg-purple-100 text-purple-700',
  Completed: 'bg-green-100 text-green-700',
  Closed: 'bg-gray-100 text-gray-500',
};

const ALL_STATUSES = ['Open', 'Assigned', 'In Progress', 'Waiting for Parts', 'Vendor Service', 'Completed', 'Closed'];

export default function AssetComplaintPage() {
  const [showAdd, setShowAdd] = useState(false);
  const [updateComplaint, setUpdateComplaint] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const qc = useQueryClient();

  const { data: dash } = useQuery({
    queryKey: ['assetComplaintDash'],
    queryFn: () => api.get('/asset-complaints/dashboard').then(r => r.data.data),
  });

  const { data: complaints, isLoading } = useQuery({
    queryKey: ['assetComplaints', statusFilter, priorityFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (priorityFilter) params.set('priority', priorityFilter);
      return api.get(`/asset-complaints?${params}`).then(r => r.data.data);
    },
  });

  const { data: assets } = useQuery({
    queryKey: ['assets'],
    queryFn: () => api.get('/assets').then(r => r.data.data),
  });

  const { register, handleSubmit, reset } = useForm();
  const { register: updReg, handleSubmit: updSubmit, reset: updReset, setValue: updSet } = useForm();

  const createMut = useMutation({
    mutationFn: (d) => api.post('/asset-complaints', d),
    onSuccess: () => {
      toast.success('Complaint raised!');
      qc.invalidateQueries(['assetComplaints']); qc.invalidateQueries(['assetComplaintDash']);
      setShowAdd(false); reset();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => api.put(`/asset-complaints/${id}`, data),
    onSuccess: () => {
      toast.success('Complaint updated!');
      qc.invalidateQueries(['assetComplaints']); qc.invalidateQueries(['assetComplaintDash']);
      setUpdateComplaint(null); updReset();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const openUpdate = (complaint) => {
    setUpdateComplaint(complaint);
    updSet('status', complaint.status);
    updSet('assignedTechnician', complaint.assignedTechnician);
    updSet('vendorName', complaint.vendorName);
    updSet('repairStartDate', complaint.repairStartDate ? new Date(complaint.repairStartDate).toISOString().split('T')[0] : '');
    updSet('expectedCompletionDate', complaint.expectedCompletionDate ? new Date(complaint.expectedCompletionDate).toISOString().split('T')[0] : '');
    updSet('actualCompletionDate', complaint.actualCompletionDate ? new Date(complaint.actualCompletionDate).toISOString().split('T')[0] : '');
    updSet('repairCost', complaint.repairCost);
    updSet('repairNotes', complaint.repairNotes);
  };

  const d = dash || {};

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Asset Complaints & Maintenance</h1>
          <p className="text-sm text-gray-500 mt-1">Track equipment issues and repairs</p>
        </div>
        <button onClick={() => { reset(); setShowAdd(true); }} className="btn-primary">
          <Plus size={16} /> Raise Complaint
        </button>
      </div>

      {/* Dashboard Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Total Assets', value: d.totalAssets || 0, icon: Package, color: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400' },
          { label: 'Working', value: d.workingAssets || 0, icon: CheckCircle, color: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' },
          { label: 'Under Repair', value: d.underRepair || 0, icon: Wrench, color: 'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400' },
          { label: 'Critical Issues', value: d.criticalIssues || 0, icon: AlertTriangle, color: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400' },
          { label: 'Warranty Expiring', value: d.warrantyExpiringSoon || 0, icon: Clock, color: 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className={`${color} rounded-2xl p-4`}>
            <div className="flex items-center gap-2 mb-1"><Icon size={18} /><p className="text-sm font-medium">{label}</p></div>
            <p className="text-3xl font-bold">{value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input-field w-44">
          <option value="">All Statuses</option>
          {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)} className="input-field w-36">
          <option value="">All Priorities</option>
          {['Low', 'Medium', 'High', 'Critical'].map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {/* Complaints List */}
      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="bg-white dark:bg-gray-800 rounded-xl h-24 animate-pulse border border-gray-100 dark:border-gray-700" />)}</div>
      ) : (
        <div className="space-y-3">
          {(complaints || []).length === 0 && (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-12 text-center border-2 border-dashed border-gray-200 dark:border-gray-700">
              <Wrench size={32} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500">No complaints found</p>
            </div>
          )}
          {(complaints || []).map(c => (
            <div key={c._id} className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <span className="font-mono text-xs font-bold text-blue-600">{c.complaintNumber}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLORS[c.priority] || ''}`}>{c.priority}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[c.status] || 'bg-gray-100 text-gray-500'}`}>{c.status}</span>
                  </div>
                  <p className="font-semibold text-gray-900 dark:text-white">{c.assetName}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{c.assetId} • Reported by: {c.reportedBy?.name || c.reportedByName}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">{c.problemDescription}</p>
                  {c.assignedTechnician && (
                    <p className="text-xs text-gray-400 mt-1">Technician: {c.assignedTechnician}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <p className="text-xs text-gray-400">{new Date(c.complaintDate).toLocaleDateString('en-IN')}</p>
                  {c.repairCost > 0 && <p className="text-sm font-medium text-green-600">₹{c.repairCost} repair cost</p>}
                  <button onClick={() => openUpdate(c)}
                    className="btn-secondary text-xs py-1.5 px-3">Update Status</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Raise Complaint Modal */}
      <Modal isOpen={showAdd} onClose={() => { setShowAdd(false); reset(); }} title="Raise Asset Complaint" size="lg">
        <form onSubmit={handleSubmit(d => createMut.mutate(d))} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Asset *</label>
              <select {...register('asset', { required: true })} className="input-field">
                <option value="">Select asset</option>
                {(assets || []).map(a => <option key={a._id} value={a._id}>{a.name} ({a.assetId})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Priority</label>
              <select {...register('priority')} className="input-field">
                {['Low', 'Medium', 'High', 'Critical'].map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Complaint Date</label>
              <input {...register('complaintDate')} type="date" defaultValue={new Date().toISOString().split('T')[0]} className="input-field" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Problem Description *</label>
              <textarea {...register('problemDescription', { required: true })} className="input-field" rows={3} placeholder="Describe the issue in detail..." />
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-4 border-t">
            <button type="button" onClick={() => { setShowAdd(false); reset(); }} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={createMut.isPending} className="btn-primary">
              {createMut.isPending ? 'Submitting...' : 'Raise Complaint'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Update Status Modal */}
      <Modal isOpen={!!updateComplaint} onClose={() => { setUpdateComplaint(null); updReset(); }} title="Update Complaint Status" size="lg">
        <form onSubmit={updSubmit(d => updateMut.mutate({ id: updateComplaint._id, data: d }))} className="p-6 space-y-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 text-sm">
            <p className="font-medium text-blue-900 dark:text-blue-300">{updateComplaint?.assetName}</p>
            <p className="text-blue-600 dark:text-blue-400 text-xs">{updateComplaint?.complaintNumber}</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Status *</label>
              <select {...updReg('status', { required: true })} className="input-field">
                {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Assigned Technician</label>
              <input {...updReg('assignedTechnician')} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Vendor Name</label>
              <input {...updReg('vendorName')} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Repair Cost (₹)</label>
              <input {...updReg('repairCost', { valueAsNumber: true })} type="number" className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Repair Start Date</label>
              <input {...updReg('repairStartDate')} type="date" className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Expected Completion</label>
              <input {...updReg('expectedCompletionDate')} type="date" className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Actual Completion</label>
              <input {...updReg('actualCompletionDate')} type="date" className="input-field" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Repair Notes</label>
              <textarea {...updReg('repairNotes')} className="input-field" rows={2} />
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-4 border-t">
            <button type="button" onClick={() => { setUpdateComplaint(null); updReset(); }} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={updateMut.isPending} className="btn-primary">
              {updateMut.isPending ? 'Updating...' : 'Update Complaint'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
