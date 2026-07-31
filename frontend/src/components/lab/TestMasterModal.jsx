import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Pencil, X, Check, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import Modal from '../common/Modal';

const CATEGORIES = ['Haematology', 'Biochemistry', 'Microbiology', 'Serology', 'Urine Analysis', 'ECG', 'Radiology', 'Other'];

const emptyForm = () => ({ name: '', category: 'Biochemistry', price: '' });

// Price catalog for lab tests/profiles (CBC = ₹500, LFT = ₹700, etc.). Managed here by
// Super Admin / Admin / Lab Technician; the price is then auto-picked up on the
// "New Lab Test Order" form for every role that creates a lab order.
export default function TestMasterModal({ isOpen, onClose }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm());
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm());

  const { data: tests = [], isLoading } = useQuery({
    queryKey: ['testMaster', 'all'],
    queryFn: async () => (await api.get('/test-master', { params: { activeOnly: 'false' } })).data.data,
    enabled: isOpen,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['testMaster'] });
  };

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

  const field = 'border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Manage Test Prices" size="lg">
      <div className="p-6">
        <p className="text-sm text-gray-500 mb-4">
          Set a price once for each test/profile (e.g. CBC = ₹500). It will auto-fill on the
          "New Lab Test Order" form for every role from then on.
        </p>

        <form onSubmit={handleCreate} className="grid grid-cols-12 gap-2 mb-5 pb-5 border-b border-gray-100">
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
            type="number" min="0" step="0.01"
            className={`col-span-2 ${field}`}
            placeholder="Price"
            value={form.price}
            onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
          />
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="col-span-1 flex items-center justify-center bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <Plus size={16} />
          </button>
        </form>

        <div className="space-y-1.5 max-h-96 overflow-y-auto">
          {isLoading && <p className="text-sm text-gray-400 text-center py-6">Loading…</p>}
          {!isLoading && tests.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-6">No test prices configured yet. Add one above.</p>
          )}
          {tests.map((t) => (
            <div key={t._id} className={`grid grid-cols-12 gap-2 items-center px-2 py-2 rounded-lg text-sm ${t.isActive ? 'hover:bg-gray-50' : 'bg-gray-50 opacity-60'}`}>
              {editingId === t._id ? (
                <>
                  <input className={`col-span-5 ${field}`} value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
                  <select className={`col-span-4 ${field}`} value={editForm.category} onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))}>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <input type="number" min="0" step="0.01" className={`col-span-2 ${field}`} value={editForm.price} onChange={(e) => setEditForm((f) => ({ ...f, price: e.target.value }))} />
                  <div className="col-span-1 flex gap-1 justify-end">
                    <button onClick={() => saveEdit(t._id)} className="text-green-600 hover:text-green-700"><Check size={16} /></button>
                    <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
                  </div>
                </>
              ) : (
                <>
                  <span className="col-span-5 font-medium text-gray-900 truncate">{t.name}</span>
                  <span className="col-span-4 text-gray-500">{t.category}</span>
                  <span className="col-span-2 font-semibold text-gray-800">₹{t.price}</span>
                  <div className="col-span-1 flex gap-1.5 justify-end">
                    <button onClick={() => startEdit(t)} className="text-gray-400 hover:text-blue-600" title="Edit"><Pencil size={14} /></button>
                    {t.isActive ? (
                      <button onClick={() => deactivateMutation.mutate(t._id)} className="text-gray-400 hover:text-red-600" title="Deactivate"><Trash2 size={14} /></button>
                    ) : (
                      <button onClick={() => reactivateMutation.mutate(t._id)} className="text-gray-400 hover:text-green-600" title="Reactivate"><RotateCcw size={14} /></button>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}