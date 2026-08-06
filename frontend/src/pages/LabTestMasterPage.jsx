import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Pencil, X, Check, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';

import { LAB_TYPES as CATEGORIES } from '../constants/labProfiles';
const emptyForm = () => ({ name: '', category: 'Biochemistry', price: '' });

/** Full-page Lab Test Master (used inside Masters hub). */
export default function LabTestMasterPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm());
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm());

  const { data: tests = [], isLoading } = useQuery({
    queryKey: ['testMaster', 'all'],
    queryFn: async () => (await api.get('/test-master', { params: { activeOnly: 'false' } })).data.data,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['testMaster'] });

  const createMutation = useMutation({
    mutationFn: (payload) => api.post('/test-master', payload),
    onSuccess: () => { toast.success('Test price added'); setForm(emptyForm()); invalidate(); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to add test'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => api.put(`/test-master/${id}`, payload),
    onSuccess: () => { toast.success('Test updated'); setEditingId(null); invalidate(); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to update test'),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id) => api.delete(`/test-master/${id}`),
    onSuccess: () => { toast.success('Test deactivated'); invalidate(); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to deactivate'),
  });

  const reactivateMutation = useMutation({
    mutationFn: (id) => api.put(`/test-master/${id}`, { isActive: true }),
    onSuccess: () => { toast.success('Test reactivated'); invalidate(); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to reactivate'),
  });

  const handleCreate = (e) => {
    e.preventDefault();
    if (!form.name || !form.price) { toast.error('Name and price are required'); return; }
    createMutation.mutate({ ...form, price: Number(form.price) });
  };

  const startEdit = (t) => {
    setEditingId(t._id);
    setEditForm({ name: t.name, category: t.category, price: t.price });
  };

  const saveEdit = (id) => {
    updateMutation.mutate({ id, payload: { ...editForm, price: Number(editForm.price) } });
  };

  const field = 'border border-slate-200 dark:border-gray-600 rounded-sm px-2.5 py-1.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30';

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900 dark:text-white tracking-tight">Lab Test Master</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Set a price once for each test/profile (e.g. CBC = ₹500). Auto-fills on New Lab Test Order.
        </p>
      </div>

      <form onSubmit={handleCreate} className="grid grid-cols-12 gap-2 pb-4 border-b border-slate-100 dark:border-gray-700">
        <input
          className={`col-span-5 ${field}`}
          placeholder="Test name, e.g. CBC (Complete Blood Count)"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <select
          className={`col-span-4 ${field}`}
          value={form.category}
          onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
        >
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input
          type="number"
          min="0"
          step="0.01"
          className={`col-span-2 ${field}`}
          placeholder="Price"
          value={form.price}
          onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
        />
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="col-span-1 flex items-center justify-center bg-slate-900 text-white rounded-sm hover:bg-slate-800 disabled:opacity-50"
        >
          <Plus size={16} />
        </button>
      </form>

      <div className="space-y-1 max-h-[60vh] overflow-y-auto">
        {isLoading && <p className="text-sm text-slate-400 text-center py-8">Loading…</p>}
        {!isLoading && tests.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-8">No test prices configured yet.</p>
        )}
        {tests.map((t) => (
          <div
            key={t._id}
            className={`grid grid-cols-12 gap-2 items-center px-2 py-2 rounded-sm text-sm ${
              t.isActive ? 'hover:bg-slate-50 dark:hover:bg-gray-800' : 'bg-slate-50 dark:bg-gray-900 opacity-60'
            }`}
          >
            {editingId === t._id ? (
              <>
                <input className={`col-span-5 ${field}`} value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
                <select className={`col-span-4 ${field}`} value={editForm.category} onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <input type="number" min="0" step="0.01" className={`col-span-2 ${field}`} value={editForm.price} onChange={(e) => setEditForm((f) => ({ ...f, price: e.target.value }))} />
                <div className="col-span-1 flex gap-1 justify-end">
                  <button type="button" onClick={() => saveEdit(t._id)} className="text-emerald-600"><Check size={16} /></button>
                  <button type="button" onClick={() => setEditingId(null)} className="text-slate-400"><X size={16} /></button>
                </div>
              </>
            ) : (
              <>
                <span className="col-span-5 font-medium text-slate-900 dark:text-white truncate">{t.name}</span>
                <span className="col-span-4 text-slate-500">{t.category}</span>
                <span className="col-span-2 font-semibold text-slate-800 dark:text-slate-200">₹{t.price}</span>
                <div className="col-span-1 flex gap-1.5 justify-end">
                  <button type="button" onClick={() => startEdit(t)} className="text-slate-400 hover:text-blue-600" title="Edit"><Pencil size={14} /></button>
                  {t.isActive ? (
                    <button type="button" onClick={() => deactivateMutation.mutate(t._id)} className="text-slate-400 hover:text-red-600" title="Deactivate"><Trash2 size={14} /></button>
                  ) : (
                    <button type="button" onClick={() => reactivateMutation.mutate(t._id)} className="text-slate-400 hover:text-emerald-600" title="Reactivate"><RotateCcw size={14} /></button>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
