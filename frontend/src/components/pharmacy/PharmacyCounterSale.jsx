import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search, Pill, Trash2, Receipt, User, UserPlus, ShoppingCart, Eraser, CreditCard,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import InvoicePrint from '../billing/InvoicePrint';
import {
  flattenMedicineBatchOptions,
  formatBatchExpiry,
} from '../../utils/medicineBatches';

const fmt = (n) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PAYMENT_MODES = ['cash', 'card', 'upi', 'cheque', 'online'];

const EMPTY_CUSTOMER = {
  name: '', phone: '', age: '', gender: '', address: '',
};

async function downloadBillPdf(id, thermal = false, size = 'A4') {
  try {
    const endpoint = thermal
      ? `/billing/${id}/thermal`
      : `/billing/${id}/print?size=${encodeURIComponent(size)}`;
    const response = await api.get(endpoint, { responseType: 'blob' });
    const blob = new Blob([response.data], { type: 'application/pdf' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = thermal
      ? `thermal-${id}.pdf`
      : `invoice-${id}-${size}.pdf`;
    link.click();
    setTimeout(() => window.URL.revokeObjectURL(url), 60000);
  } catch {
    toast.error('Unable to download invoice');
  }
}

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
  const [customerMode, setCustomerMode] = useState('existing');
  const [customer, setCustomer] = useState(EMPTY_CUSTOMER);
  const [phoneMatches, setPhoneMatches] = useState([]);
  const [doctorName, setDoctorName] = useState('');
  const [allowDuplicatePhone, setAllowDuplicatePhone] = useState(false);

  const newCustomerReady = customerMode === 'new'
    && customer.name.trim()
    && customer.phone.trim().length >= 10
    && Number(customer.age) > 0
    && customer.gender;
  const customerReady = customerMode === 'existing' ? Boolean(selectedPatient) : Boolean(newCustomerReady);

  const updateCustomer = (patch) => {
    setCustomer((prev) => ({ ...prev, ...patch }));
    if ('phone' in patch) {
      setPhoneMatches([]);
      setAllowDuplicatePhone(false);
    }
  };

  const pickPatient = (p) => {
    setSelectedPatient(p);
    setPatientSearch(`${p.name} (${p.patientId})`);
    setPatients([]);
    setPhoneMatches([]);
    setCustomerMode('existing');
  };

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

  const addMedicine = (opt) => {
    const med = opt.medicine || opt;
    const batch = opt.batch || null;
    setItems((prev) => [
      ...prev,
      {
        medicine: med._id,
        name: med.name,
        genericName: med.genericName || '',
        dosage: '',
        quantity: 1,
        unitPrice: Number(opt.unitPrice ?? batch?.sellingPrice ?? med.sellingPrice ?? 0),
        mrp: Number(opt.mrp ?? batch?.mrp ?? med.mrp ?? med.sellingPrice ?? 0),
        gstPercent: Number(med.gstPercent || 0),
        available: Number(opt.available ?? batch?.quantity ?? med.currentStock ?? 0),
        batchNumber: opt.batchNumber || batch?.batchNumber || '',
        expiryDate: opt.expiryDate || batch?.expiryDate || null,
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
    setDoctorName('');
  };

  const clearAll = () => {
    const customerTouched = Object.values(customer).some((v) => String(v).trim());
    if (!selectedPatient && !customerTouched && !items.length) {
      toast('Sale is already empty');
      return;
    }
    if (!window.confirm('Clear this counter sale (customer + medicines)?')) return;
    setSelectedPatient(null);
    setPatientSearch('');
    setPatients([]);
    setCustomer(EMPTY_CUSTOMER);
    setPhoneMatches([]);
    setAllowDuplicatePhone(false);
    resetSale();
    toast.success('Counter sale cleared');
  };

  const registerCustomer = async () => {
    const address = customer.address.trim();
    try {
      const res = await api.post('/patients', {
        name: customer.name.trim(),
        phone: customer.phone.trim(),
        age: Number(customer.age),
        gender: customer.gender,
        ...(address ? { address: { street: address } } : {}),
        allowDuplicatePhone,
      });
      return res.data.data;
    } catch (err) {
      if (err.response?.status === 409 && err.response?.data?.code === 'DUPLICATE_PHONE') {
        setPhoneMatches(err.response.data.matches || []);
        throw new Error('This phone is already registered — pick the customer below or register as new');
      }
      throw err;
    }
  };

  const billMut = useMutation({
    mutationFn: async ({ collectNow }) => {
      if (!items.length) throw new Error('Add at least one medicine');
      let patient = selectedPatient;
      if (customerMode === 'new') {
        if (!newCustomerReady) throw new Error('Enter customer name, 10-digit phone, age and gender');
        patient = await registerCustomer();
        // Keep the new UHID selected so a failed bill can be retried without re-registering.
        pickPatient(patient);
        setCustomer(EMPTY_CUSTOMER);
        setAllowDuplicatePhone(false);
      }
      if (!patient?._id) throw new Error('Select a patient (search UHID / name / phone)');

      const billItems = items.map((item) => ({
        category: 'Pharmacy',
        type: 'medicine',
        description: `${item.genericName || item.name}${item.dosage ? ` - ${item.dosage}` : ''}`,
        name: item.name,
        genericName: item.genericName || '',
        quantity: Number(item.quantity) || 1,
        unitPrice: Number(item.unitPrice) || 0,
        mrp: Number(item.mrp || item.unitPrice) || 0,
        gstPercent: Number(item.gstPercent) || 0,
        medicine: item.medicine,
        referenceId: item.medicine,
        referenceModel: 'Medicine',
        batch: item.batchNumber || '',
        batchNumber: item.batchNumber || '',
        expiryDate: item.expiryDate || null,
      }));

      const payload = {
        billType: 'pharmacy',
        patient: patient._id,
        // No opRegistration — standalone medicine sale (no doctor visit)
        discount: Number(discount) || 0,
        paidAmount: collectNow ? Number(totals.total.toFixed(2)) : 0,
        paymentMode,
        notes: `Pharmacy counter sale — medicines only (no OP consultation)${
          doctorName.trim() ? ` · Prescribed by ${doctorName.trim()}` : ''}`,
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
        <span>Search patient or enter new customer</span>
        <span className="text-slate-300">→</span>
        <span>Add medicines</span>
        <span className="text-slate-300">→</span>
        <span>Collect here or send to Billing</span>
        <span className="text-slate-400 font-normal ml-auto">
          No doctor token needed — for return / walk-in medicine purchase
        </span>
      </div>

      <div className="corp-card overflow-hidden">
        {/* Customer */}
        <div className="px-5 py-4 border-b border-blue-50 bg-gradient-to-r from-white via-blue-50/30 to-white">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex-1 min-w-[240px]">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <p className="text-[11px] font-medium text-slate-500">
                  Customer <span className="text-red-500">*</span>
                </p>
                <div className="inline-flex rounded-lg border border-blue-100 bg-white p-0.5 text-xs font-medium">
                  {[
                    { id: 'existing', label: 'Existing patient', icon: Search },
                    { id: 'new', label: 'New customer', icon: UserPlus },
                  ].map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        setCustomerMode(id);
                        setPhoneMatches([]);
                        if (id === 'new') {
                          setSelectedPatient(null);
                          setPatientSearch('');
                          setPatients([]);
                        }
                      }}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-md ${
                        customerMode === id ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-blue-50'
                      }`}
                    >
                      <Icon size={13} /> {label}
                    </button>
                  ))}
                </div>
              </div>
              {customerMode === 'new' ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                    <div className="col-span-2 sm:col-span-2">
                      <label className="text-[11px] text-slate-500 block mb-1">Name <span className="text-red-500">*</span></label>
                      <input
                        value={customer.name}
                        onChange={(e) => updateCustomer({ name: e.target.value })}
                        className="input-field text-sm"
                        placeholder="Customer name"
                      />
                    </div>
                    <div className="col-span-2 sm:col-span-2">
                      <label className="text-[11px] text-slate-500 block mb-1">Phone <span className="text-red-500">*</span></label>
                      <input
                        value={customer.phone}
                        onChange={(e) => updateCustomer({ phone: e.target.value.replace(/[^\d+]/g, '').slice(0, 13) })}
                        className="input-field text-sm"
                        inputMode="tel"
                        placeholder="10-digit mobile"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-500 block mb-1">Age <span className="text-red-500">*</span></label>
                      <input
                        type="number"
                        min="0"
                        max="130"
                        value={customer.age}
                        onChange={(e) => updateCustomer({ age: e.target.value })}
                        className="input-field text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-500 block mb-1">Gender <span className="text-red-500">*</span></label>
                      <select
                        value={customer.gender}
                        onChange={(e) => updateCustomer({ gender: e.target.value })}
                        className="input-field text-sm"
                      >
                        <option value="">Select</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div className="col-span-2 sm:col-span-6">
                      <label className="text-[11px] text-slate-500 block mb-1">Address</label>
                      <input
                        value={customer.address}
                        onChange={(e) => updateCustomer({ address: e.target.value })}
                        className="input-field text-sm"
                        placeholder="Street / area / town (optional)"
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    A UHID is created for this customer when the bill is saved, so they can be searched by phone next time.
                  </p>
                  {phoneMatches.length > 0 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
                      <p className="text-xs font-medium text-amber-800">
                        This phone number is already registered. Use the existing customer:
                      </p>
                      {phoneMatches.map((p) => (
                        <button
                          key={p._id}
                          type="button"
                          onClick={() => pickPatient(p)}
                          className="w-full text-left px-3 py-2 rounded-lg bg-white border border-amber-100 hover:bg-amber-100 text-sm"
                        >
                          <span className="font-medium">{p.name}</span>
                          <span className="ml-2 font-mono text-xs text-blue-700">{p.patientId}</span>
                          <span className="ml-2 text-slate-500 text-xs">
                            {p.age != null ? `${p.age}yr` : ''}{p.gender ? ` · ${p.gender}` : ''}
                          </span>
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          setAllowDuplicatePhone(true);
                          setPhoneMatches([]);
                          toast('Will register as a new customer — now collect or send the bill');
                        }}
                        className="text-xs text-amber-800 font-medium hover:underline"
                      >
                        Different person with same phone — register as new
                      </button>
                    </div>
                  )}
                </div>
              ) : selectedPatient ? (
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
                          onClick={() => pickPatient(p)}
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
              disabled={!customerReady}
              className="input-field pl-9 text-sm disabled:opacity-50"
              placeholder={customerReady ? 'Search medicine…' : 'Select patient or fill customer details first'}
            />
            {medResults.length > 0 && (
              <div className="absolute z-30 mt-1 w-full border border-blue-100 rounded-xl shadow-xl max-h-60 overflow-y-auto bg-white">
                {flattenMedicineBatchOptions(medResults).map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => addMedicine(opt)}
                    disabled={opt.available <= 0}
                    className="w-full text-left px-4 py-2.5 hover:bg-blue-50 text-sm border-b border-slate-50 last:border-0 flex justify-between disabled:opacity-40"
                  >
                    <span className="min-w-0">
                      <span className="font-medium">{opt.medicine.name}</span>
                      <span className="block text-[11px] text-slate-500 mt-0.5">
                        {opt.batchNumber ? `Batch ${opt.batchNumber}` : 'No batch'}
                        {opt.expiryDate ? ` · Exp ${formatBatchExpiry(opt.expiryDate)}` : ''}
                        {` · Stock ${opt.available}`}
                      </span>
                    </span>
                    <span className="text-right shrink-0">
                      <span className="font-semibold text-blue-700">{fmt(opt.unitPrice)}</span>
                      {opt.mrp ? (
                        <span className="block text-[10px] text-slate-400">MRP {fmt(opt.mrp)}</span>
                      ) : null}
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
              <p className="text-xs mt-1">Select a patient or enter customer details, then search and add medicines</p>
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
                      <input value={item.genericName || item.name} onChange={(e) => updateItem(index, { genericName: e.target.value })} className="input-field text-sm py-1.5" />
                      {item.batchNumber && (
                        <p className="text-[10px] text-blue-600 mt-0.5">
                          Batch {item.batchNumber}
                          {item.expiryDate ? ` · Exp ${formatBatchExpiry(item.expiryDate)}` : ''}
                        </p>
                      )}
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
          <div className="grid sm:grid-cols-4 gap-3">
            <div>
              <label className="text-[11px] text-slate-500 block mb-1">Prescribed by (doctor)</label>
              <input
                value={doctorName}
                onChange={(e) => setDoctorName(e.target.value)}
                className="input-field text-sm"
                placeholder="Optional"
              />
            </div>
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
              disabled={!canDispense || billMut.isPending || !customerReady || !items.length}
              className="btn-secondary justify-center disabled:opacity-50"
            >
              <Receipt size={15} />
              {billMut.isPending ? 'Saving…' : 'Send unpaid to Billing'}
            </button>
            <button
              type="button"
              onClick={() => billMut.mutate({ collectNow: true })}
              disabled={!canDispense || billMut.isPending || !customerReady || !items.length}
              className="btn-primary justify-center disabled:opacity-50 min-w-[200px]"
            >
              <CreditCard size={15} />
              {billMut.isPending ? 'Saving…' : `Collect ${fmt(totals.total)} & print`}
            </button>
          </div>
        </div>
      </div>

      {printBill && (
        <InvoicePrint
          bill={printBill}
          onClose={() => setPrintBill(null)}
          onDownloadPdf={(id) => downloadBillPdf(id, false, 'A4')}
          onDownloadPdfA5={(id) => downloadBillPdf(id, false, 'A5')}
          onDownloadThermal={(id) => downloadBillPdf(id, true)}
        />
      )}
    </div>
  );
}
