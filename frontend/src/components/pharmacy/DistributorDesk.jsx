import React, { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Search, Truck, Phone, Mail, MapPin, CalendarClock,
  IndianRupee, Pencil, Building2, FileText, BadgeCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import Modal from '../common/Modal';

const fmt = (n) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const emptyDefaults = {
  name: '',
  contactPerson: '',
  phone: '',
  email: '',
  address: '',
  city: '',
  state: '',
  pincode: '',
  gstNumber: '',
  drugLicense: '',
  creditDays: 30,
  openingAmount: 0,
  amountPaid: 0,
  outstanding: 0,
  notes: '',
};

export default function DistributorDesk() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editRow, setEditRow] = useState(null);

  const { register, handleSubmit, reset } = useForm({ defaultValues: emptyDefaults });

  const { data, isLoading } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => api.get('/suppliers?limit=200').then((r) => r.data),
  });

  const suppliers = data?.data || [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter((s) =>
      [s.name, s.contactPerson, s.phone, s.gstNumber, s.city, s.drugLicense]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [suppliers, search]);

  const selected = useMemo(
    () => filtered.find((s) => s._id === selectedId) || filtered[0] || null,
    [filtered, selectedId]
  );

  const kpis = useMemo(() => {
    const total = suppliers.length;
    const outstanding = suppliers.reduce((s, r) => s + (Number(r.outstanding) || 0), 0);
    const withDue = suppliers.filter((r) => (Number(r.outstanding) || 0) > 0).length;
    const avgCredit = total
      ? Math.round(suppliers.reduce((s, r) => s + (Number(r.creditDays) || 0), 0) / total)
      : 0;
    return { total, outstanding, withDue, avgCredit };
  }, [suppliers]);

  const addMut = useMutation({
    mutationFn: (d) => api.post('/suppliers', d),
    onSuccess: () => {
      toast.success('Distributor added');
      qc.invalidateQueries(['suppliers']);
      closeForm();
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to add'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, payload }) => api.put(`/suppliers/${id}`, payload),
    onSuccess: () => {
      toast.success('Distributor updated');
      qc.invalidateQueries(['suppliers']);
      closeForm();
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to update'),
  });

  const openCreate = () => {
    setEditRow(null);
    reset(emptyDefaults);
    setShowForm(true);
  };

  const openEdit = (row) => {
    setEditRow(row);
    reset({
      ...emptyDefaults,
      ...row,
      creditDays: Number(row.creditDays) || 30,
      openingAmount: Number(row.openingAmount) || 0,
      amountPaid: Number(row.amountPaid) || 0,
      outstanding: Number(row.outstanding) || 0,
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditRow(null);
    reset(emptyDefaults);
  };

  const onSave = (d) => {
    const payload = {
      ...d,
      creditDays: Number(d.creditDays) || 0,
      openingAmount: Number(d.openingAmount) || 0,
      amountPaid: Number(d.amountPaid) || 0,
      outstanding: Number(d.outstanding) || 0,
    };
    if (editRow) updateMut.mutate({ id: editRow._id, payload });
    else addMut.mutate(payload);
  };

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <div className="corp-card p-3 border-l-4 border-l-blue-600">
          <p className="text-[10px] uppercase tracking-wide text-slate-500 flex items-center gap-1">
            <Truck size={11} /> Distributors
          </p>
          <p className="text-xl font-bold text-slate-900 tabular-nums mt-0.5">{kpis.total}</p>
          <p className="text-[10px] text-slate-400">Active suppliers on file</p>
        </div>
        <div className="corp-card p-3 border-l-4 border-l-amber-500">
          <p className="text-[10px] uppercase tracking-wide text-slate-500 flex items-center gap-1">
            <CalendarClock size={11} /> Avg credit days
          </p>
          <p className="text-xl font-bold text-amber-700 tabular-nums mt-0.5">{kpis.avgCredit}</p>
          <p className="text-[10px] text-slate-400">Payment period for stock / tablets</p>
        </div>
        <div className="corp-card p-3 border-l-4 border-l-red-500">
          <p className="text-[10px] uppercase tracking-wide text-slate-500 flex items-center gap-1">
            <IndianRupee size={11} /> Outstanding
          </p>
          <p className="text-xl font-bold text-red-600 tabular-nums mt-0.5">{fmt(kpis.outstanding)}</p>
          <p className="text-[10px] text-slate-400">{kpis.withDue} supplier(s) with dues</p>
        </div>
        <div className="corp-card p-3 border-l-4 border-l-emerald-500 flex items-center justify-between gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Actions</p>
            <p className="text-sm font-semibold text-slate-800 mt-1">Add new supplier</p>
          </div>
          <button type="button" onClick={openCreate} className="btn-primary text-xs py-2 shrink-0">
            <Plus size={14} /> Add
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 min-h-[60vh]">
        {/* List */}
        <div className="xl:col-span-5 corp-card overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-blue-50 bg-gradient-to-r from-blue-50/50 to-white">
            <div className="flex items-center gap-2 mb-2">
              <Building2 size={15} className="text-blue-600" />
              <h3 className="text-sm font-semibold text-slate-800">Distributor list</h3>
            </div>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input-field pl-9 text-sm py-2"
                placeholder="Search name, phone, GST, city…"
              />
            </div>
          </div>

          <div className="overflow-y-auto max-h-[58vh] divide-y divide-slate-50">
            {isLoading && (
              <p className="p-8 text-center text-slate-400 text-sm">Loading distributors…</p>
            )}
            {!isLoading && filtered.length === 0 && (
              <div className="p-10 text-center">
                <Truck size={28} className="mx-auto text-slate-300 mb-2" />
                <p className="text-sm font-medium text-slate-500">No distributors found</p>
                <button type="button" onClick={openCreate} className="mt-3 text-xs text-blue-600 font-semibold hover:underline">
                  Add first distributor
                </button>
              </div>
            )}
            {filtered.map((s) => {
              const active = selected?._id === s._id;
              const due = Number(s.outstanding) || 0;
              return (
                <button
                  key={s._id}
                  type="button"
                  onClick={() => setSelectedId(s._id)}
                  className={`w-full text-left px-4 py-3.5 transition-colors border-l-4 ${
                    active ? 'bg-blue-50/80 border-l-blue-600' : 'border-l-transparent hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 truncate">{s.name}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {s.contactPerson || 'No contact'} · {s.phone || '—'}
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-100">
                          Credit {Number(s.creditDays) || 0} days
                        </span>
                        {due > 0 ? (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-100">
                            Due {fmt(due)}
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                            No dues
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Detail */}
        <div className="xl:col-span-7 corp-card overflow-hidden flex flex-col">
          {!selected ? (
            <div className="flex-1 flex flex-col items-center justify-center p-10 text-center text-slate-400">
              <Truck size={36} className="mb-3 text-slate-300" />
              <p className="text-sm font-medium">Select a distributor</p>
              <p className="text-xs mt-1">Credit days, GST, dues and contact details appear here</p>
            </div>
          ) : (
            <>
              <div className="px-5 py-4 border-b border-blue-50 bg-gradient-to-r from-white via-blue-50/30 to-white">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-xl bg-blue-600 text-white font-bold flex items-center justify-center shrink-0">
                      {(selected.name || '?').charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-lg font-bold text-slate-900 truncate">{selected.name}</h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {selected.city || selected.state
                          ? [selected.city, selected.state].filter(Boolean).join(', ')
                          : 'Location not set'}
                      </p>
                    </div>
                  </div>
                  <button type="button" onClick={() => openEdit(selected)} className="btn-secondary text-xs py-2 shrink-0">
                    <Pencil size={14} /> Edit details
                  </button>
                </div>
              </div>

              {/* Clear credit / money strip */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 p-4 border-b border-blue-50 bg-slate-50/60">
                <div className="corp-card p-3 border-l-4 border-l-amber-500">
                  <p className="text-[10px] uppercase text-slate-400 flex items-center gap-1">
                    <CalendarClock size={10} /> Credit period
                  </p>
                  <p className="text-2xl font-bold text-amber-700 tabular-nums mt-0.5">
                    {Number(selected.creditDays) || 0}
                  </p>
                  <p className="text-[10px] text-slate-500">Days to pay for tablets / stock</p>
                </div>
                <div className="corp-card p-3 border-l-4 border-l-slate-400">
                  <p className="text-[10px] uppercase text-slate-400">Opening amount</p>
                  <p className="text-lg font-bold text-slate-800 tabular-nums mt-0.5">
                    {fmt(selected.openingAmount)}
                  </p>
                </div>
                <div className="corp-card p-3 border-l-4 border-l-emerald-500">
                  <p className="text-[10px] uppercase text-slate-400">Amount paid</p>
                  <p className="text-lg font-bold text-emerald-700 tabular-nums mt-0.5">
                    {fmt(selected.amountPaid)}
                  </p>
                </div>
                <div className={`corp-card p-3 border-l-4 ${
                  (Number(selected.outstanding) || 0) > 0 ? 'border-l-red-500' : 'border-l-emerald-600'
                }`}>
                  <p className="text-[10px] uppercase text-slate-400">Outstanding</p>
                  <p className={`text-lg font-bold tabular-nums mt-0.5 ${
                    (Number(selected.outstanding) || 0) > 0 ? 'text-red-600' : 'text-emerald-700'
                  }`}>
                    {fmt(selected.outstanding)}
                  </p>
                </div>
              </div>

              <div className="p-5 grid sm:grid-cols-2 gap-4 overflow-y-auto max-h-[42vh]">
                <section className="space-y-2.5">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Contact</h4>
                  <DetailRow icon={BadgeCheck} label="Contact person" value={selected.contactPerson || '—'} />
                  <DetailRow icon={Phone} label="Phone" value={selected.phone || '—'} />
                  <DetailRow icon={Mail} label="Email" value={selected.email || '—'} />
                  <DetailRow
                    icon={MapPin}
                    label="Address"
                    value={[selected.address, selected.city, selected.state, selected.pincode].filter(Boolean).join(', ') || '—'}
                  />
                </section>
                <section className="space-y-2.5">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Licenses & terms</h4>
                  <DetailRow icon={FileText} label="GST number" value={selected.gstNumber || '—'} mono />
                  <DetailRow icon={FileText} label="Drug license" value={selected.drugLicense || '—'} mono />
                  <DetailRow
                    icon={CalendarClock}
                    label="Credit for tablets / stock"
                    value={`${Number(selected.creditDays) || 0} days — pay within this period after purchase`}
                  />
                  <DetailRow icon={FileText} label="Notes" value={selected.notes || '—'} />
                </section>
              </div>

              <div className="px-5 py-3 border-t border-blue-50 bg-blue-50/40 text-[11px] text-slate-600">
                <strong className="text-slate-800">Credit days</strong> = how many days this distributor gives you to pay
                after supplying tablets/medicines (e.g. 30 = pay within 30 days).
              </div>
            </>
          )}
        </div>
      </div>

      {/* Form modal */}
      <Modal
        isOpen={showForm}
        onClose={closeForm}
        title={editRow ? 'Edit Distributor' : 'Add Distributor'}
        subtitle="Credit days, GST, dues and contact — keep all details clear"
        size="xl"
      >
        <form onSubmit={handleSubmit(onSave)} className="flex flex-col">
          <div className="p-5 space-y-5 max-h-[65vh] overflow-y-auto">
            <section className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Basic info</h4>
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Distributor name *" required>
                  <input {...register('name', { required: true })} className="input-field text-sm" placeholder="Company / agency name" />
                </Field>
                <Field label="Contact person">
                  <input {...register('contactPerson')} className="input-field text-sm" placeholder="Sales / owner name" />
                </Field>
                <Field label="Phone *">
                  <input {...register('phone', { required: true })} className="input-field text-sm" />
                </Field>
                <Field label="Email">
                  <input {...register('email')} type="email" className="input-field text-sm" />
                </Field>
                <Field label="Address" className="sm:col-span-2">
                  <input {...register('address')} className="input-field text-sm" />
                </Field>
                <Field label="City">
                  <input {...register('city')} className="input-field text-sm" />
                </Field>
                <Field label="State">
                  <input {...register('state')} className="input-field text-sm" />
                </Field>
                <Field label="Pincode">
                  <input {...register('pincode')} className="input-field text-sm" />
                </Field>
              </div>
            </section>

            <section className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Licenses</h4>
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="GST number">
                  <input {...register('gstNumber')} className="input-field text-sm font-mono" />
                </Field>
                <Field label="Drug license">
                  <input {...register('drugLicense')} className="input-field text-sm font-mono" />
                </Field>
              </div>
            </section>

            <section className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Credit & payments (tablets / stock)
              </h4>
              <div className="rounded-xl border border-amber-100 bg-amber-50/50 px-3 py-2 text-[11px] text-amber-900 mb-1">
                <strong>Credit days</strong> = days the distributor allows you to pay after supply
                (e.g. 15 / 30 / 45 days for tablet stock).
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <Field label="Credit days *">
                  <input
                    {...register('creditDays', { valueAsNumber: true })}
                    type="number"
                    min="0"
                    className="input-field text-sm"
                    placeholder="30"
                  />
                </Field>
                <Field label="Opening amount (₹)">
                  <input {...register('openingAmount', { valueAsNumber: true })} type="number" min="0" step="0.01" className="input-field text-sm" />
                </Field>
                <Field label="Amount paid (₹)">
                  <input {...register('amountPaid', { valueAsNumber: true })} type="number" min="0" step="0.01" className="input-field text-sm" />
                </Field>
                <Field label="Outstanding (₹)">
                  <input {...register('outstanding', { valueAsNumber: true })} type="number" min="0" step="0.01" className="input-field text-sm" />
                </Field>
              </div>
            </section>

            <Field label="Notes">
              <textarea {...register('notes')} className="input-field text-sm" rows={2} placeholder="Payment terms, delivery notes…" />
            </Field>
          </div>

          <div className="px-5 py-3.5 border-t border-blue-100 flex justify-end gap-2 bg-white">
            <button type="button" onClick={closeForm} className="btn-secondary">Cancel</button>
            <button
              type="submit"
              disabled={addMut.isPending || updateMut.isPending}
              className="btn-primary"
            >
              <Truck size={15} />
              {addMut.isPending || updateMut.isPending ? 'Saving…' : 'Save distributor'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function Field({ label, children, className = '', required }) {
  return (
    <div className={className}>
      <label className="text-[11px] font-medium text-slate-500 block mb-1">
        {label}{required ? <span className="text-red-500"> *</span> : null}
      </label>
      {children}
    </div>
  );
}

function DetailRow({ icon: Icon, label, value, mono }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white px-3 py-2.5 flex items-start gap-2.5">
      <Icon size={14} className="text-blue-600 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
        <p className={`text-sm text-slate-800 mt-0.5 break-words ${mono ? 'font-mono text-xs' : ''}`}>
          {value}
        </p>
      </div>
    </div>
  );
}
