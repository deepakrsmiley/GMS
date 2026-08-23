import React, { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Pill, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { useSelector } from 'react-redux';
import api from '../../services/api';
import Modal from '../common/Modal';
import { hasPermission } from '../../constants/permissions';

const FREQUENCIES = ['OD', 'BD', 'TD', 'QD', 'SOS', 'HS', 'AC', 'PC', 'STAT'];
const ROUTES = ['oral', 'IV', 'IM', 'SC', 'topical', 'inhalation', 'sublingual'];

const emptyForm = () => ({
  medicine: '',
  medicineName: '',
  availableStock: null,
  dosage: '',
  frequency: 'OD',
  route: 'oral',
  quantity: 1,
  notes: '',
});

const field = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 bg-white';
const label = 'block text-xs font-medium text-gray-500 mb-1';

// Groups medication entries by calendar day so the ward can see
// "what medicines did this patient get, day by day" at a glance.
const groupByDay = (entries) => {
  const groups = {};
  [...entries]
    .sort((a, b) => new Date(b.administeredAt) - new Date(a.administeredAt))
    .forEach((entry) => {
      const dayKey = new Date(entry.administeredAt).toLocaleDateString('en-IN', {
        weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
      });
      if (!groups[dayKey]) groups[dayKey] = [];
      groups[dayKey].push(entry);
    });
  return groups;
};

// Logs pharmacy medicines given to an admitted (IP) patient during their stay,
// the same way OP prescriptions are dispensed - searches live medicine stock,
// deducts it immediately, and keeps a running day-by-day history that stays on
// the admission record from admit through discharge.
export default function MedicationLogModal({ admission, isOpen, onClose }) {
  const queryClient = useQueryClient();
  const { user } = useSelector((s) => s.auth);
  const [form, setForm] = useState(emptyForm());
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const isDischarged = admission?.status === 'discharged';
  const canDelete = hasPermission(user, 'MANAGE_IP_MEDICATION');

  useEffect(() => {
    if (isOpen) {
      setForm(emptyForm());
      setQuery('');
      setResults([]);
    }
  }, [isOpen, admission?._id]);

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    const t = setTimeout(() => {
      api.get(`/pharmacy/search?q=${encodeURIComponent(query.trim())}`)
        .then((r) => setResults(r.data.data || []))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const medications = admission?.medications || [];
  const grouped = groupByDay(medications);

  const addMutation = useMutation({
    mutationFn: (payload) => api.post(`/ip/${admission._id}/medication`, payload),
    onSuccess: () => {
      toast.success('Medicine logged for patient');
      setForm(emptyForm());
      setQuery('');
      setResults([]);
      queryClient.invalidateQueries({ queryKey: ['ip-admission', admission._id] });
      queryClient.invalidateQueries({ queryKey: ['admissions'] });
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to log medicine'),
  });

  const deleteMutation = useMutation({
    mutationFn: (medId) => api.delete(`/ip/${admission._id}/medication/${medId}`),
    onSuccess: () => {
      toast.success('Entry removed, stock restored');
      queryClient.invalidateQueries({ queryKey: ['ip-admission', admission._id] });
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to remove entry'),
  });

  const pickMedicine = (med) => {
    setForm((f) => ({
      ...f,
      medicine: med._id,
      medicineName: med.name,
      availableStock: med.currentStock,
    }));
    setQuery(med.name);
    setResults([]);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.medicineName.trim()) { toast.error('Select or type a medicine name'); return; }
    if (!form.quantity || Number(form.quantity) <= 0) { toast.error('Enter a valid quantity'); return; }
    if (form.medicine && form.availableStock !== null && Number(form.quantity) > form.availableStock) {
      toast.error(`Only ${form.availableStock} in stock`);
      return;
    }
    addMutation.mutate({
      medicine: form.medicine || undefined,
      medicineName: form.medicineName,
      dosage: form.dosage,
      frequency: form.frequency,
      route: form.route,
      quantity: Number(form.quantity),
      notes: form.notes,
    });
  };

  if (!admission) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`IP Medicines - ${admission.admissionNumber}`} size="lg">
      <div className="p-6">
        {isDischarged ? (
          <div className="mb-5 pb-4 border-b border-gray-100 text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-500">
            Patient has been discharged. Showing full medication history for this admission (read-only).
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mb-5 pb-5 border-b border-gray-100">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2 relative">
                <label className={label}>Search medicine (pharmacy stock)</label>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    className={`${field} pl-8`}
                    placeholder="Type medicine name..."
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setForm((f) => ({ ...f, medicine: '', medicineName: e.target.value, availableStock: null }));
                    }}
                  />
                </div>
                {searching && <p className="text-xs text-gray-400 mt-1">Searching...</p>}
                {results.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full border rounded-xl overflow-hidden max-h-48 overflow-y-auto bg-white shadow-lg">
                    {results.map((m) => (
                      <button
                        key={m._id}
                        type="button"
                        onClick={() => pickMedicine(m)}
                        className="w-full text-left px-4 py-2 hover:bg-blue-50 text-sm border-b last:border-0 flex justify-between items-center"
                      >
                        <span>
                          <span className="font-medium">{m.name}</span>
                          {m.genericName ? <span className="text-gray-400"> · {m.genericName}</span> : null}
                        </span>
                        <span className="text-xs text-gray-500 whitespace-nowrap ml-2">
                          Stock: {m.currentStock} · ₹{m.sellingPrice}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {form.medicine && form.availableStock !== null && (
                  <p className="text-xs text-green-600 mt-1">
                    Selected · {form.availableStock} in stock
                  </p>
                )}
                {!form.medicine && form.medicineName && (
                  <p className="text-xs text-amber-600 mt-1">
                    Not linked to pharmacy stock - will be logged as a note only (no stock deducted).
                  </p>
                )}
              </div>

              <div>
                <label className={label}>Dosage</label>
                <input
                  className={field}
                  placeholder="e.g. 500mg"
                  value={form.dosage}
                  onChange={(e) => setForm((f) => ({ ...f, dosage: e.target.value }))}
                />
              </div>

              <div>
                <label className={label}>Quantity</label>
                <input
                  type="number" min="1" step="1"
                  className={field}
                  value={form.quantity}
                  onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                />
              </div>

              <div>
                <label className={label}>Frequency</label>
                <select
                  className={field}
                  value={form.frequency}
                  onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value }))}
                >
                  {FREQUENCIES.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>

              <div>
                <label className={label}>Route</label>
                <select
                  className={field}
                  value={form.route}
                  onChange={(e) => setForm((f) => ({ ...f, route: e.target.value }))}
                >
                  {ROUTES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className={label}>Notes (optional)</label>
                <input
                  className={field}
                  placeholder="e.g. Given after breakfast"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex items-center justify-end mt-4">
              <button
                type="submit"
                disabled={addMutation.isPending}
                className="flex items-center gap-1.5 bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                <Plus size={16} /> Log medicine given
              </button>
            </div>
          </form>
        )}

        <h4 className="text-sm font-semibold text-gray-700 mb-2">Medication history (admit → discharge)</h4>

        <div className="space-y-4 max-h-80 overflow-y-auto">
          {medications.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-gray-400 border border-dashed border-gray-200 rounded-lg px-3 py-4 justify-center">
              <Pill size={16} /> No medicines logged yet for this stay.
            </div>
          )}
          {Object.entries(grouped).map(([day, entries]) => (
            <div key={day}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{day}</p>
              <div className="space-y-2">
                {entries.map((m) => (
                  <div key={m._id} className="flex items-start justify-between border border-gray-100 rounded-lg px-3 py-2.5 text-sm hover:bg-gray-50 transition-colors">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-900">{m.medicineName}</span>
                        {m.dosage && <span className="text-xs text-gray-500">{m.dosage}</span>}
                        <span className="text-[11px] px-1.5 py-0.5 rounded border bg-blue-50 text-blue-700 border-blue-200">
                          {m.frequency}
                        </span>
                        <span className="text-[11px] px-1.5 py-0.5 rounded border bg-gray-50 text-gray-600 border-gray-200">
                          {m.route}
                        </span>
                      </div>
                      <div className="text-gray-600 mt-0.5">
                        Qty {m.quantity}{m.unitPrice ? ` × ₹${m.unitPrice} = ₹${(m.quantity * m.unitPrice).toFixed(2)}` : ''}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {m.administeredBy?.name ? `By ${m.administeredBy.name} · ` : ''}
                        {new Date(m.administeredAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        {m.notes ? ` · ${m.notes}` : ''}
                      </div>
                    </div>
                    {!isDischarged && canDelete && (
                      <button
                        onClick={() => deleteMutation.mutate(m._id)}
                        className="text-gray-300 hover:text-red-600 transition-colors shrink-0 ml-2"
                        title="Remove entry (restores stock)"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
