import React, { useState, useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, Trash2, Stethoscope, Settings2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import Modal from '../common/Modal';

const CHARGE_TYPE_LABEL = { per_use: 'per use', per_hour: 'per hour', per_day: 'per day' };
const CATEGORIES = ['Equipment', 'Procedure', 'Nursing', 'Injection', 'Other'];
const CATEGORY_BADGE = {
  Equipment: 'bg-purple-50 text-purple-700 border-purple-200',
  Procedure: 'bg-blue-50 text-blue-700 border-blue-200',
  Nursing: 'bg-teal-50 text-teal-700 border-teal-200',
  Injection: 'bg-amber-50 text-amber-700 border-amber-200',
  Other: 'bg-gray-100 text-gray-600 border-gray-200',
};

const emptyForm = () => ({
  serviceId: '',
  serviceName: '',
  category: 'Equipment',
  chargeType: 'per_use',
  quantity: 1,
  unitPrice: '',
  notes: '',
});

const field = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 bg-white';
const label = 'block text-xs font-medium text-gray-500 mb-1';

// Logs bedside equipment/procedure usage (Nebulizer, Ventilator, O2, Injection, etc.)
// against an IP admission. Each saved entry is automatically picked up as a
// billable line item next time a bill is generated for this patient
// (see backend services/billingService.js).
export default function ServiceUsageModal({ admission, isOpen, onClose }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm());

  useEffect(() => {
    if (isOpen) setForm(emptyForm());
  }, [isOpen, admission?._id]);

  // Rate list configured by Admin under Settings -> Services / Equipment Rates (ServiceMaster)
  const { data: serviceOptions = [], isLoading: loadingRates } = useQuery({
    queryKey: ['service-master'],
    queryFn: async () => (await api.get('/services')).data.data,
    enabled: isOpen,
  });

  const usages = admission?.serviceUsages || [];
  const runningTotal = useMemo(
    () => usages.reduce((sum, u) => sum + (u.quantity || 0) * (u.unitPrice || 0), 0),
    [usages],
  );
  const currentLineTotal = (Number(form.quantity) || 0) * (Number(form.unitPrice) || 0);

  const addMutation = useMutation({
    mutationFn: (payload) => api.post(`/ip/${admission._id}/service-usage`, payload),
    onSuccess: () => {
      toast.success('Usage logged');
      setForm(emptyForm());
      queryClient.invalidateQueries({ queryKey: ['ip-admission', admission._id] });
      queryClient.invalidateQueries({ queryKey: ['ip-admissions'] });
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to log usage'),
  });

  const deleteMutation = useMutation({
    mutationFn: (usageId) => api.delete(`/ip/${admission._id}/service-usage/${usageId}`),
    onSuccess: () => {
      toast.success('Entry removed');
      queryClient.invalidateQueries({ queryKey: ['ip-admission', admission._id] });
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to remove entry'),
  });

  const handleServiceSelect = (id) => {
    const svc = serviceOptions.find((s) => s._id === id);
    if (!svc) {
      setForm((f) => ({ ...f, serviceId: '', serviceName: '' }));
      return;
    }
    setForm((f) => ({
      ...f,
      serviceId: svc._id,
      serviceName: svc.name,
      category: svc.category,
      chargeType: svc.chargeType,
      unitPrice: svc.defaultPrice,
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.serviceName || !form.unitPrice) {
      toast.error('Select a service and price');
      return;
    }
    addMutation.mutate({
      serviceName: form.serviceName,
      category: form.category,
      chargeType: form.chargeType,
      quantity: Number(form.quantity) || 1,
      unitPrice: Number(form.unitPrice),
      notes: form.notes,
    });
  };

  if (!admission) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Services / Equipment - ${admission.admissionNumber}`} size="lg">
    <div className="p-6">
      <form onSubmit={handleSubmit} className="mb-5 pb-5 border-b border-gray-100">
        {!loadingRates && serviceOptions.length === 0 && (
          <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg px-3 py-2 mb-3">
            <span>No rate list set up yet — you can still type a service and price below.</span>
            <Link
              to="/settings/services"
              onClick={onClose}
              className="flex items-center gap-1 font-medium whitespace-nowrap hover:underline"
            >
              <Settings2 size={12} /> Set up rates
            </Link>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className={label}>Pick from rate list</label>
            <select
              className={field}
              value={form.serviceId}
              onChange={(e) => handleServiceSelect(e.target.value)}
            >
              <option value="">-- Select a configured service (optional) --</option>
              {serviceOptions.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name} · ₹{s.defaultPrice} {CHARGE_TYPE_LABEL[s.chargeType]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={label}>Service name</label>
            <input
              className={field}
              placeholder="e.g. Nebulizer"
              value={form.serviceName}
              onChange={(e) => setForm((f) => ({ ...f, serviceId: '', serviceName: e.target.value }))}
            />
          </div>

          <div>
            <label className={label}>Category</label>
            <select
              className={field}
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            >
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label className={label}>Charge type</label>
            <select
              className={field}
              value={form.chargeType}
              onChange={(e) => setForm((f) => ({ ...f, chargeType: e.target.value }))}
            >
              <option value="per_use">Per use</option>
              <option value="per_hour">Per hour</option>
              <option value="per_day">Per day</option>
            </select>
          </div>

          <div>
            <label className={label}>Quantity</label>
            <input
              type="number" min="1" step="1"
              className={field}
              placeholder="1"
              value={form.quantity}
              onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
            />
          </div>

          <div>
            <label className={label}>Unit price (₹)</label>
            <input
              type="number" min="0" step="0.01"
              className={field}
              placeholder="0.00"
              value={form.unitPrice}
              onChange={(e) => setForm((f) => ({ ...f, unitPrice: e.target.value }))}
            />
          </div>

          <div>
            <label className={label}>Notes (optional)</label>
            <input
              className={field}
              placeholder="e.g. Post-op, night shift"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
        </div>

        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-gray-500">
            Line total: <span className="font-semibold text-gray-800">₹{currentLineTotal.toFixed(2)}</span>
          </span>
          <button
            type="submit"
            disabled={addMutation.isPending}
            className="flex items-center gap-1.5 bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <Plus size={16} /> Add usage
          </button>
        </div>
      </form>

      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold text-gray-700">Logged this stay</h4>
        {usages.length > 0 && (
          <span className="text-sm text-gray-500">
            Total: <span className="font-semibold text-gray-800">₹{runningTotal.toFixed(2)}</span>
          </span>
        )}
      </div>

      <div className="space-y-2 max-h-64 overflow-y-auto">
        {usages.length === 0 && (
          <div className="flex items-center gap-2 text-sm text-gray-400 border border-dashed border-gray-200 rounded-lg px-3 py-4 justify-center">
            <Stethoscope size={16} /> No equipment/procedure usage logged yet.
          </div>
        )}
        {[...usages].reverse().map((u) => (
          <div key={u._id} className="flex items-start justify-between border border-gray-100 rounded-lg px-3 py-2.5 text-sm hover:bg-gray-50 transition-colors">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-gray-900">{u.serviceName}</span>
                <span className={`text-[11px] px-1.5 py-0.5 rounded border ${CATEGORY_BADGE[u.category] || CATEGORY_BADGE.Other}`}>
                  {u.category}
                </span>
              </div>
              <div className="text-gray-600 mt-0.5">
                {u.quantity} {CHARGE_TYPE_LABEL[u.chargeType]} × ₹{u.unitPrice} = <span className="font-semibold text-gray-800">₹{(u.quantity * u.unitPrice).toFixed(2)}</span>
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                {u.administeredBy?.name ? `By ${u.administeredBy.name} · ` : ''}
                {new Date(u.usedAt).toLocaleString()}
                {u.notes ? ` · ${u.notes}` : ''}
              </div>
            </div>
            <button
              onClick={() => deleteMutation.mutate(u._id)}
              className="text-gray-300 hover:text-red-600 transition-colors shrink-0 ml-2"
              title="Remove entry"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
    </Modal>
  );
}