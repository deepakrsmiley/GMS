import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search, Pill, Trash2, Receipt, User, ShoppingCart, Eraser, CreditCard,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import PharmacyTaxInvoice from '../billing/PharmacyTaxInvoice';

const fmt = (n) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PAYMENT_MODES = ['cash', 'card', 'upi', 'cheque', 'online'];

/**
 * Walk-in / return patient medicine sale — no doctor visit required.
 * Search existing patient (e.g. yesterday OP) → add medicines → bill.
 */
export default function PharmacyCounterSale({ canDispense }) {
  const qc = useQueryClient();
  const [patientSearch, setPatientSearch] = useState('');
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [medQuery, setMedQuery] = useState('');
  const [medResults, setMedResults] = useState([]);
  const [items, setItems] = useState([]);
  const [discount, setDiscount] = useState(0);
  const [paymentMode, setPaymentMode] = useState('cash');
  const [printBill, setPrintBill] = useState(null);

  useEffect(() => {
    if (patientSearch.length < 2 || selectedPatient) {
      if (patientSearch.length < 2) setPatients([]);
      return undefined;
    }
    const t = setTimeout(() => {
      api.get(`/patients/search?q=${encodeURIComponent(patientSearch)}`)
        .then((r) => setPatients(r.data.data || []))
        .catch(() => setPatients([]));
    }, 250);
    return () => clearTimeout(t);
  }, [patientSearch, selectedPatient]);

  useEffect(() => {
    if (medQuery.length < 2) {
      setMedResults([]);
      return undefined;
    }
    const t = setTimeout(() => {
      api.get(`/pharmacy/search?q=${encodeURIComponent(medQuery)}`)
        .then((r) => setMedResults(r.data.data || []))
        .catch(() => setMedResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [medQuery]);

  const addMedicine = (med) => {
    setItems((prev) => [
      ...prev,
      {
        medicine: med._id,
        name: med.name,
        dosage: '',
        quantity: 1,
        unitPrice: Number(med.sellingPrice || 0),
        gstPercent: Number(med.gstPercent || 0),
        available: med.currentStock,
      },
    ]);
    setMedQuery('');
    setMedResults([]);
  };

  const updateItem = (index, patch) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const totals = useMemo(() => {
    const subtotal = items.reduce(
      (sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0),
      0,
    );
    const medGst = items.reduce((sum, item) => {
      const line = Number(item.quantity || 0) * Number(item.unitPrice || 0);
      return sum + line * ((Number(item.gstPercent) || 0) / 100);
    }, 0);
    const discountAmount = (subtotal + medGst) * ((Number(discount) || 0) / 100);
    const total = subtotal + medGst - discountAmount;
    return { subtotal, medGst, discountAmount, total };
  }, [items, discount]);

  const resetSale = () => {
    setItems([]);
    setDiscount(0);
    setMedQuery('');
    setMedResults([]);
    setPaymentMode('cash');
  };

  const clearAll = () => {
    if (!selectedPatient && !items.length) {
      toast('Sale is already empty');
      return;
    }
    if (!window.confirm('Clear this counter sale (patient + medicines)?')) return;
    setSelectedPatient(null);
    setPatientSearch('');
    setPatients([]);
    resetSale();
    toast.success('Counter sale cleared');
  };

  const billMut = useMutation({
    mutationFn: async ({ collectNow }) => {
      if (!selectedPatient?._id) throw new Error('Select a patient (search UHID / name / phone)');
      if (!items.length) throw new Error('Add at least one medicine');

      const billItems = items.map((item) => ({
        category: 'Pharmacy',
        type: 'medicine',
        description: `${item.name}${item.dosage ? ` - ${item.dosage}` : ''}`,
        name: item.name,
        quantity: Number(item.quantity) || 1,
        unitPrice: Number(item.unitPrice) || 0,
        gstPercent: Number(item.gstPercent) || 0,
        medicine: item.medicine,
        referenceId: item.medicine,
        referenceModel: 'Medicine',
      }));

      const payload = {
        billType: 'pharmacy',
        patient: selectedPatient._id,
        // No opRegistration — standalone medicine sale (no doctor visit)
        discount: Number(discount) || 0,
        paidAmount: collectNow ? Number(totals.total.toFixed(2)) : 0,
        paymentMode,
        notes: 'Pharmacy counter sale — medicines only (no OP consultation)',
        items: billItems,
      };

      const created = await api.post('/billing', payload);
      const billId = created.data.data._id;
      const bill = await api.get(`/billing/${billId}`);
      return { bill: bill.data.data, message: created.data.message, collectNow };
    },
    onSuccess: ({ bill, message, collectNow }) => {
      toast.success(
        message
          || (collectNow
            ? 'Medicine bill paid at pharmacy counter'
            : 'Medicine bill sent to Billing for payment'),
      );
      setPrintBill(bill);
      resetSale();
      qc.invalidateQueries(['bills']);
      qc.invalidateQueries(['billStats']);
      qc.invalidateQueries(['medicines']);
      qc.invalidateQueries(['pharmaInventoryDash']);
    },
    onError: (err) =>
      toast.error(err.response?.data?.message || err.message || 'Failed to create bill'),
  });

  return (
    <div className="space-y-4">
      <div className="corp-card p-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-600">
        <ShoppingCart size={14} className="text-blue-600" />
        <span>Counter sale</span>
        <span className="text-slate-300">→</span>
        <span>Search patient (UHID)</span>
        <span className="text-slate-300">→</span>
        <span>Add medicines</span>
        <span className="text-slate-300">→</span>
        <span>Collect here or send to Billing</span>
        <span className="text-slate-400 font-normal ml-auto">
          No doctor token needed — for return / walk-in medicine purchase
        </span>
      </div>

      <div className="corp-card overflow-hidden">
        {/* Patient */}
        <div className="px-5 py-4 border-b border-blue-50 bg-gradient-to-r from-white via-blue-50/30 to-white">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex-1 min-w-[240px]">
              <p className="text-[11px] font-medium text-slate-500 mb-1">
                Patient <span className="text-red-500">*</span>
              </p>
              {selectedPatient ? (
                <div className="flex items-center gap-3 corp-card p-3 border-l-4 border-l-blue-600">
                  <div className="w-10 h-10 rounded-xl bg-blue-600 text-white font-bold flex items-center justify-center">
                    {(selectedPatient.name || '?').charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900">{selectedPatient.name}</p>
                    <p className="text-xs text-slate-500">
                      <span className="font-mono font-semibold text-blue-700">{selectedPatient.patientId}</span>
                      {selectedPatient.age != null ? ` · ${selectedPatient.age}yr` : ''}
                      {selectedPatient.gender ? ` · ${selectedPatient.gender}` : ''}
                      {selectedPatient.phone ? ` · ${selectedPatient.phone}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPatient(null);
                      setPatientSearch('');
                    }}
                    className="text-xs text-blue-600 font-medium hover:underline"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={patientSearch}
                    onChange={(e) => setPatientSearch(e.target.value)}
                    className="input-field pl-9 text-sm"
                    placeholder="Search yesterday’s OP patient — UHID, name, or phone…"
                  />
                  {patients.length > 0 && (
                    <div className="absolute z-30 mt-1 w-full border border-blue-100 rounded-xl shadow-lg max-h-48 overflow-y-auto bg-white">
                      {patients.map((p) => (
                        <button
                          key={p._id}
                          type="button"
                          onClick={() => {
                            setSelectedPatient(p);
                            setPatientSearch(`${p.name} (${p.patientId})`);
                            setPatients([]);
                          }}
                          className="w-full text-left px-4 py-2.5 hover:bg-blue-50 text-sm border-b border-slate-50 last:border-0"
                        >
                          <span className="font-medium">{p.name}</span>
                          <span className="ml-2 font-mono text-xs text-blue-700">{p.patientId}</span>
                          <span className="ml-2 text-slate-400 text-xs">{p.phone}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={clearAll}
              className="btn-secondary text-xs py-2 shrink-0"
            >
              <Eraser size={14} /> Clear sale
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <Pill size={15} className="text-blue-600" /> Medicines to sell
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">{items.length} item(s)</p>
            </div>
          </div>

          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={medQuery}
              onChange={(e) => setMedQuery(e.target.value)}
              disabled={!selectedPatient}
              className="input-field pl-9 text-sm disabled:opacity-50"
              placeholder={selectedPatient ? 'Search medicine…' : 'Select patient first'}
            />
            {medResults.length > 0 && (
              <div className="absolute z-30 mt-1 w-full border border-blue-100 rounded-xl shadow-xl max-h-60 overflow-y-auto bg-white">
                {medResults.map((m) => (
                  <button
                    key={m._id}
                    type="button"
                    onClick={() => addMedicine(m)}
                    disabled={Number(m.currentStock) <= 0}
                    className="w-full text-left px-4 py-2.5 hover:bg-blue-50 text-sm border-b border-slate-50 last:border-0 flex justify-between disabled:opacity-40"
                  >
                    <span>
                      <span className="font-medium">{m.name}</span>
                      <span className="text-slate-400 text-xs ml-2 capitalize">{m.category}</span>
                    </span>
                    <span className="text-right">
                      <span className="font-semibold text-blue-700">{fmt(m.sellingPrice)}</span>
                      <span className="block text-[10px] text-slate-400">Stock {m.currentStock}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-slate-400">
              <User size={28} className="mx-auto mb-2 text-slate-300" />
              <p className="text-sm font-medium">No medicines added</p>
              <p className="text-xs mt-1">Select patient, then search and add medicines</p>
            </div>
          ) : (
            <div className="corp-card overflow-hidden border border-blue-50">
              <div className="hidden sm:grid grid-cols-12 gap-2 px-3 py-2 bg-slate-50 text-[10px] font-semibold uppercase text-slate-400">
                <span className="col-span-4">Medicine</span>
                <span className="col-span-2">Dosage</span>
                <span className="col-span-1">Qty</span>
                <span className="col-span-2">Price</span>
                <span className="col-span-2">GST %</span>
                <span className="col-span-1" />
              </div>
              <div className="divide-y divide-slate-50">
                {items.map((item, index) => (
                  <div key={`${item.medicine}-${index}`} className="grid grid-cols-12 gap-2 items-center px-3 py-2.5">
                    <div className="col-span-12 sm:col-span-4">
                      <input value={item.name} onChange={(e) => updateItem(index, { name: e.target.value })} className="input-field text-sm py-1.5" />
                    </div>
                    <div className="col-span-6 sm:col-span-2">
                      <input value={item.dosage} onChange={(e) => updateItem(index, { dosage: e.target.value })} className="input-field text-sm py-1.5" placeholder="1-0-1" />
                    </div>
                    <div className="col-span-3 sm:col-span-1">
                      <input type="number" min="1" value={item.quantity} onChange={(e) => updateItem(index, { quantity: e.target.value })} className="input-field text-sm py-1.5" />
                    </div>
                    <div className="col-span-3 sm:col-span-2">
                      <input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(e) => updateItem(index, { unitPrice: e.target.value })} className="input-field text-sm py-1.5" />
                    </div>
                    <div className="col-span-9 sm:col-span-2">
                      <input type="number" min="0" value={item.gstPercent} onChange={(e) => updateItem(index, { gstPercent: e.target.value })} className="input-field text-sm py-1.5" />
                    </div>
                    <div className="col-span-3 sm:col-span-1 flex justify-end">
                      <button type="button" onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))} className="p-2 text-slate-300 hover:text-red-500">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-blue-100 bg-slate-50/80 space-y-3">
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] text-slate-500 block mb-1">Discount %</label>
              <input type="number" min="0" max="100" value={discount} onChange={(e) => setDiscount(e.target.value)} className="input-field text-sm" />
            </div>
            <div>
              <label className="text-[11px] text-slate-500 block mb-1">Payment mode</label>
              <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} className="input-field text-sm">
                {PAYMENT_MODES.map((m) => (
                  <option key={m} value={m} className="capitalize">{m}</option>
                ))}
              </select>
            </div>
            <div className="corp-card p-3 border-l-4 border-l-blue-600">
              <p className="text-[10px] uppercase text-slate-400">Bill total</p>
              <p className="text-xl font-bold text-blue-700 tabular-nums">{fmt(totals.total)}</p>
            </div>
          </div>
          <p className="text-[11px] text-slate-400">
            Subtotal {fmt(totals.subtotal)} + GST {fmt(totals.medGst)} − Discount {fmt(totals.discountAmount)}
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-end">
            <button
              type="button"
              onClick={() => billMut.mutate({ collectNow: false })}
              disabled={!canDispense || billMut.isPending || !selectedPatient || !items.length}
              className="btn-secondary justify-center disabled:opacity-50"
            >
              <Receipt size={15} />
              {billMut.isPending ? 'Saving…' : 'Send unpaid to Billing'}
            </button>
            <button
              type="button"
              onClick={() => billMut.mutate({ collectNow: true })}
              disabled={!canDispense || billMut.isPending || !selectedPatient || !items.length}
              className="btn-primary justify-center disabled:opacity-50 min-w-[200px]"
            >
              <CreditCard size={15} />
              {billMut.isPending ? 'Saving…' : `Collect ${fmt(totals.total)} & print`}
            </button>
          </div>
        </div>
      </div>

      {printBill && (
        <PharmacyTaxInvoice bill={printBill} onClose={() => setPrintBill(null)} />
      )}
    </div>
  );
}
