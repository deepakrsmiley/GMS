import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bed, Plus, Trash2, Edit2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import api from '../services/api';
import Modal from '../components/common/Modal';

const statusColors = {
  available: 'bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700 text-green-800 dark:text-green-300',
  occupied: 'bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700 text-red-800 dark:text-red-300',
  cleaning: 'bg-yellow-100 dark:bg-yellow-900/30 border-yellow-300 dark:border-yellow-700 text-yellow-800 dark:text-yellow-300',
  maintenance: 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400',
  reserved: 'bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-300',
};

export default function BedsPage() {
  const [wardFilter, setWardFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [showAddBed, setShowAddBed] = useState(false);
  const [showAddWard, setShowAddWard] = useState(false);      // NEW: Ward modal state
  const [showWardList, setShowWardList] = useState(false);    // NEW: Ward list modal
  const [selected, setSelected] = useState(null);
  const qc = useQueryClient();

  const { data: bedsData, isLoading } = useQuery({
    queryKey: ['beds', wardFilter, typeFilter],
    queryFn: () => api.get(`/beds?${wardFilter ? `ward=${wardFilter}` : ''}${typeFilter ? `&type=${typeFilter}` : ''}`).then(r => r.data),
  });
  const { data: wards, refetch: refetchWards } = useQuery({ 
    queryKey: ['wards'], 
    queryFn: () => api.get('/beds/wards').then(r => r.data) 
  });
  const { data: occupancy } = useQuery({ queryKey: ['bedOccupancy'], queryFn: () => api.get('/beds/occupancy').then(r => r.data) });
  const { data: roomDash } = useQuery({ queryKey: ['roomDashboard'], queryFn: () => api.get('/rooms/dashboard').then(r => r.data.data) });

  const { register: registerBed, handleSubmit: handleBedSubmit, reset: resetBed } = useForm();
  const { register: registerWard, handleSubmit: handleWardSubmit, reset: resetWard } = useForm();

  // Add Bed mutation
  const addBed = useMutation({
    mutationFn: (d) => api.post('/beds', d),
    onSuccess: () => { 
      toast.success('Bed added!'); 
      qc.invalidateQueries({ queryKey: ['beds'] }); 
      setShowAddBed(false); 
      resetBed(); 
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to add bed'),
  });

  // Create Ward mutation (NEW)
  const addWard = useMutation({
    mutationFn: (d) => api.post('/beds/wards', d),
    onSuccess: () => { 
      toast.success('Ward created successfully!'); 
      refetchWards();
      setShowAddWard(false); 
      resetWard(); 
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to create ward'),
  });

  // Update Bed Status mutation
  const updateStatus = useMutation({
    mutationFn: ({ id, status }) => api.put(`/beds/${id}/status`, { status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['beds'] }); setSelected(null); },
  });

  // Delete Ward mutation (NEW)
  const deleteWard = useMutation({
    mutationFn: (id) => api.delete(`/beds/wards/${id}`),
    onSuccess: () => { 
      toast.success('Ward deleted!'); 
      refetchWards();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to delete ward'),
  });

  const beds = bedsData?.data || [];
  const wardsList = wards?.data || [];
  const stats = occupancy?.data?.stats || [];
  const statMap = stats.reduce((a, s) => { a[s._id] = s.count; return a; }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Room & Bed Management</h1>
        <div className="flex gap-2">
          {/* NEW: Ward Management Button */}
          <button 
            onClick={() => setShowWardList(true)} 
            className="btn-secondary">
            📋 Manage Wards
          </button>
          <button 
            onClick={() => setShowAddBed(true)} 
            className="btn-primary">
            <Plus size={16} /> Add Bed
          </button>
        </div>
      </div>

      {roomDash && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { label: 'Total Rooms', value: roomDash.totalRooms, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: '🟢 Available', value: roomDash.available, color: 'text-green-600', bg: 'bg-green-50' },
            { label: '🔴 Occupied', value: roomDash.occupied, color: 'text-red-600', bg: 'bg-red-50' },
            { label: '🟡 Reserved', value: roomDash.reserved, color: 'text-yellow-600', bg: 'bg-yellow-50' },
            { label: '⚫ Maintenance', value: roomDash.maintenance, color: 'text-gray-600', bg: 'bg-gray-50' },
            { label: 'ICU', value: `${roomDash.icuOccupancy?.occupied}/${roomDash.icuOccupancy?.total}`, color: 'text-purple-600', bg: 'bg-purple-50' },
            { label: 'Ward', value: `${roomDash.wardOccupancy?.occupied}/${roomDash.wardOccupancy?.total}`, color: 'text-indigo-600', bg: 'bg-indigo-50' },
          ].map((s) => (
            <div key={s.label} className={`${s.bg} dark:bg-gray-800 rounded-xl p-4 text-center`}>
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Beds Available', key: 'available', color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/20' },
          { label: 'Beds Occupied', key: 'occupied', color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-900/20' },
          { label: 'Cleaning', key: 'cleaning', color: 'text-yellow-600', bg: 'bg-yellow-50 dark:bg-yellow-900/20' },
          { label: 'Maintenance', key: 'maintenance', color: 'text-gray-600', bg: 'bg-gray-50 dark:bg-gray-800' },
          { label: 'Reserved', key: 'reserved', color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20' },
        ].map(s => (
          <div key={s.key} className={`${s.bg} rounded-xl p-4 text-center`}>
            <p className={`text-2xl font-bold ${s.color}`}>{statMap[s.key] || 0}</p>
            <p className="text-xs text-gray-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-4 flex-wrap">
        <select value={wardFilter} onChange={e => setWardFilter(e.target.value)} className="input-field w-48">
          <option value="">All Wards</option>
          {wardsList.map(w => <option key={w._id} value={w._id}>{w.name}</option>)}
        </select>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="input-field w-40">
          <option value="">All Types</option>
          {['general','semi_private','private','icu','nicu','emergency'].map(t => <option key={t} value={t} className="capitalize">{t.replace('_',' ')}</option>)}
        </select>
      </div>

      {/* Bed Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">Loading beds...</div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-3">
          {beds.map(bed => (
            <button key={bed._id} onClick={() => setSelected(bed)}
              className={`border-2 rounded-xl p-3 text-center transition-all hover:scale-105 hover:shadow-md ${statusColors[bed.status]}`}>
              <Bed size={20} className="mx-auto mb-1" />
              <p className="text-xs font-bold">{bed.bedNumber}</p>
              <p className="text-xs mt-0.5 capitalize opacity-75">{bed.type}</p>
              {bed.currentPatient && <p className="text-xs mt-1 truncate font-medium">{bed.currentPatient.name}</p>}
            </button>
          ))}
          {beds.length === 0 && <p className="col-span-full text-center text-gray-400 py-12">No beds found</p>}
        </div>
      )}

      {/* Legend */}
      <div className="flex gap-4 flex-wrap">
        {Object.entries(statusColors).map(([status]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded border ${statusColors[status]}`} />
            <span className="text-xs text-gray-500 capitalize">{status}</span>
          </div>
        ))}
      </div>

      {/* ===== BED DETAIL MODAL ===== */}
      {selected && (
        <Modal isOpen={true} onClose={() => setSelected(null)} title={`Bed ${selected.bedNumber}`} size="sm">
          <div className="p-6 space-y-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Type</span><span className="capitalize font-medium">{selected.type?.replace('_',' ')}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Ward</span><span className="font-medium">{selected.ward?.name || 'N/A'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Status</span><span className={`capitalize font-medium ${selected.status === 'available' ? 'text-green-600' : selected.status === 'occupied' ? 'text-red-600' : 'text-yellow-600'}`}>{selected.status}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Daily Rate</span><span className="font-medium">₹{selected.dailyRate}</span></div>
              {selected.currentPatient && <div className="flex justify-between"><span className="text-gray-500">Patient</span><span className="font-medium">{selected.currentPatient.name}</span></div>}
            </div>
            {selected.status !== 'occupied' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Update Status</label>
                <div className="grid grid-cols-2 gap-2">
                  {['available','cleaning','maintenance','reserved'].map(s => (
                    <button key={s} onClick={() => updateStatus.mutate({ id: selected._id, status: s })}
                      className={`py-2 text-xs rounded-lg capitalize transition-colors ${selected.status === s ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* ===== ADD BED MODAL ===== */}
      <Modal isOpen={showAddBed} onClose={() => setShowAddBed(false)} title="Add New Bed" size="sm">
        <form onSubmit={handleBedSubmit((d) => addBed.mutate(d))} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Bed Number *</label>
            <input {...registerBed('bedNumber', { required: true })} className="input-field" placeholder="e.g. W1-B01" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ward *</label>
            {wardsList.length === 0 ? (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg p-3 mb-3">
                <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-2">⚠️ No wards available</p>
                <button 
                  type="button"
                  onClick={() => setShowAddWard(true)}
                  className="text-sm text-yellow-700 dark:text-yellow-300 hover:underline font-medium">
                  Click here to create a ward first
                </button>
              </div>
            ) : null}
            <select {...registerBed('ward', { required: true })} className="input-field">
              <option value="">Select ward</option>
              {wardsList.map(w => <option key={w._id} value={w._id}>{w.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
            <select {...registerBed('type')} className="input-field">
              {['general','semi_private','private','icu','nicu','emergency','operation'].map(t => <option key={t} value={t} className="capitalize">{t.replace('_',' ')}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Daily Rate (₹)</label>
            <input {...registerBed('dailyRate', { valueAsNumber: true })} type="number" defaultValue={500} className="input-field" />
          </div>
          <div className="flex gap-3 justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
            <button type="button" onClick={() => setShowAddBed(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={addBed.isPending} className="btn-primary">{addBed.isPending ? 'Adding...' : 'Add Bed'}</button>
          </div>
        </form>
      </Modal>

      {/* ===== ADD WARD MODAL (NEW) ===== */}
      <Modal isOpen={showAddWard} onClose={() => setShowAddWard(false)} title="Create New Ward" size="sm">
        <form onSubmit={handleWardSubmit((d) => addWard.mutate(d))} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ward Name *</label>
            <input 
              {...registerWard('name', { required: 'Ward name is required' })} 
              className="input-field" 
              placeholder="e.g. Cardiology Ward" 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ward Code</label>
            <input 
              {...registerWard('code')} 
              className="input-field" 
              placeholder="e.g. CAR (auto-generated if blank)"
              maxLength="10"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ward Type</label>
            <select {...registerWard('type')} className="input-field">
              {['general','icu','nicu','emergency','maternity','pediatric','surgical','medical'].map(t => (
                <option key={t} value={t} className="capitalize">{t.replace('_',' ')}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Floor Number</label>
            <input 
              {...registerWard('floor', { valueAsNumber: true })} 
              type="number" 
              className="input-field" 
              placeholder="e.g. 2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
            <textarea 
              {...registerWard('description')} 
              className="input-field" 
              placeholder="Ward description..." 
              rows="2"
            />
          </div>
          <div className="flex gap-3 justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
            <button type="button" onClick={() => setShowAddWard(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={addWard.isPending} className="btn-primary">
              {addWard.isPending ? 'Creating...' : 'Create Ward'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ===== WARD LIST MODAL (NEW) ===== */}
      <Modal isOpen={showWardList} onClose={() => setShowWardList(false)} title="Manage Wards" size="md">
        <div className="p-6 space-y-4">
          <button 
            onClick={() => setShowAddWard(true)}
            className="w-full btn-primary mb-4">
            <Plus size={16} /> Create New Ward
          </button>

          {wardsList.length === 0 ? (
            <p className="text-center text-gray-400 py-8">No wards created yet</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {wardsList.map(ward => (
                <div key={ward._id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">{ward.name}</p>
                    <p className="text-xs text-gray-500">{ward.type} • Floor {ward.floor || 'N/A'}</p>
                  </div>
                  <button 
                    onClick={() => deleteWard.mutate(ward._id)}
                    className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}