import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Pencil, X, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';

const CATEGORIES = ['Equipment', 'Procedure', 'Nursing', 'Injection', 'Other'];
const CHARGE_TYPES = [
  { value: 'per_use', label: 'Per use' },
  { value: 'per_hour', label: 'Per hour' },
  { value: 'per_day', label: 'Per day' },
];

const emptyForm = () => ({
  name: '', category: 'Equipment', chargeType: 'per_use', defaultPrice: '', gstPercent: 0,
});

// Admin screen to maintain the rate list used by the "Services / Equipment" logger
// on the IP Admissions page (Nebulizer, Ventilator, O2 Therapy, Injection charges, etc.)
export default function ServiceMasterPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm());
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm());

  const { data: services = [], isLoading } = useQuery({
    queryKey: ['service-master', 'all'],
    queryFn: async () => (await api.get('/services', { params: { activeOnly: 'false' } })).data.data,
  });

  const createMutation = useMutation({
    mutationFn: (payload) => api.post('/services', payload),
    onSuccess: () => {
      toast.success('Service added');
      setForm(emptyForm());
      queryClient.invalidateQueries({ queryKey: ['service-master'] });
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to add service'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => api.put(`/services/${id}`, payload),
    onSuccess: () => {
      toast.success('Service updated');
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ['service-master'] });
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to update service'),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id) => api.delete(`/services/${id}`),
    onSuccess: () => {
      toast.success('Service deactivated');
      queryClient.invalidateQueries({ queryKey: ['service-master'] });
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to deactivate'),
  });

  const reactivateMutation = useMutation({
    mutationFn: (id) => api.put(`/services/${id}`, { isActive: true }),
    onSuccess: () => {
      toast.success('Service reactivated');
      queryClient.invalidateQueries({ queryKey: ['service-master'] });
    },
  });

  const handleCreate = (e) => {
    e.preventDefault();
    if (!form.name || !form.defaultPrice) {
      toast.error('Name and price are required');
      return;
    }
    createMutation.mutate({ ...form, defaultPrice: Number(form.defaultPrice), gstPercent: Number(form.gstPercent) || 0 });
  };

  const startEdit = (s) => {
    setEditingId(s._id);
    setEditForm({ name: s.name, category: s.category, chargeType: s.chargeType, defaultPrice: s.defaultPrice, gstPercent: s.gstPercent || 0 });
  };

  const saveEdit = (id) => {
    updateMutation.mutate({
      id,
      payload: { ...editForm, defaultPrice: Number(editForm.defaultPrice), gstPercent: Number(editForm.gstPercent) || 0 },
    });
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Services / Equipment Rate List</h2>
      <p className="text-sm text-gray-500 mb-4">
        Used when logging bedside usage (Nebulizer, Ventilator, O2 Therapy, Injections, etc.) on an IP admission.
      </p>

      <form onSubmit={handleCreate} className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6 border-b pb-6">
        <input
          className="border rounded px-2 py-2 text-sm col-span-2 md:col-span-1"
          placeholder="Service name (e.g. Nebulization)"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <select
          className="border rounded px-2 py-2 text-sm"
          value={form.category}
          onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
        >
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          className="border rounded px-2 py-2 text-sm"
          value={form.chargeType}
          onChange={(e) => setForm((f) => ({ ...f, chargeType: e.target.value }))}
        >
          {CHARGE_TYPES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <input
          type="number" min="0" step="0.01"
          className="border rounded px-2 py-2 text-sm"
          placeholder="Price (₹)"
          value={form.defaultPrice}
          onChange={(e) => setForm((f) => ({ ...f, defaultPrice: e.target.value }))}
        />
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="flex items-center justify-center gap-1 bg-blue-600 text-white text-sm px-3 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          <Plus size={16} /> Add
        </button>
      </form>

      {isLoading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : services.length === 0 ? (
        <p className="text-sm text-gray-500">No services configured yet. Add one above.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="py-2">Name</th>
              <th>Category</th>
              <th>Charge type</th>
              <th>Price (₹)</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {services.map((s) => (
              <tr key={s._id} className="border-b last:border-0">
                {editingId === s._id ? (
                  <>
                    <td className="py-2">
                      <input className="border rounded px-2 py-1 w-full" value={editForm.name}
                        onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
                    </td>
                    <td>
                      <select className="border rounded px-2 py-1" value={editForm.category}
                        onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))}>
                        {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                    <td>
                      <select className="border rounded px-2 py-1" value={editForm.chargeType}
                        onChange={(e) => setEditForm((f) => ({ ...f, chargeType: e.target.value }))}>
                        {CHARGE_TYPES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                    </td>
                    <td>
                      <input type="number" min="0" step="0.01" className="border rounded px-2 py-1 w-24" value={editForm.defaultPrice}
                        onChange={(e) => setEditForm((f) => ({ ...f, defaultPrice: e.target.value }))} />
                    </td>
                    <td>{s.isActive ? <span className="text-green-600">Active</span> : <span className="text-gray-400">Inactive</span>}</td>
                    <td className="flex gap-2 py-2">
                      <button onClick={() => saveEdit(s._id)} className="text-green-600 hover:text-green-800"><Check size={16} /></button>
                      <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="py-2 font-medium">{s.name}</td>
                    <td>{s.category}</td>
                    <td>{CHARGE_TYPES.find((c) => c.value === s.chargeType)?.label}</td>
                    <td>₹{s.defaultPrice}</td>
                    <td>{s.isActive ? <span className="text-green-600">Active</span> : <span className="text-gray-400">Inactive</span>}</td>
                    <td className="flex gap-2 py-2">
                      <button onClick={() => startEdit(s)} className="text-blue-600 hover:text-blue-800" title="Edit">
                        <Pencil size={16} />
                      </button>
                      {s.isActive ? (
                        <button onClick={() => deactivateMutation.mutate(s._id)} className="text-red-500 hover:text-red-700" title="Deactivate">
                          <Trash2 size={16} />
                        </button>
                      ) : (
                        <button onClick={() => reactivateMutation.mutate(s._id)} className="text-xs text-blue-600 hover:underline">
                          Reactivate
                        </button>
                      )}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
