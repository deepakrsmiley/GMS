  import React, { useState, useEffect, useMemo, useCallback } from 'react';
  import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
  import { useSelector } from 'react-redux';
  import {
    Plus, Printer, Search, Receipt, Pill, X, Eye,
    CreditCard, Ban, AlertTriangle, CheckCircle2,
    Stethoscope, FlaskConical, Bed, Package, User,
    RefreshCw, ChevronDown, ChevronUp, Edit3, History, Trash2,
  } from 'lucide-react';
  import toast from 'react-hot-toast';
  import api from '../services/api';
  import Modal from '../components/common/Modal';
  import DataTable from '../components/common/DataTable';
  import InvoicePrint from '../components/billing/InvoicePrint';

  const PAYMENT_MODES = ['cash', 'card', 'upi', 'cheque', 'insurance', 'online'];
  const STATUS_BADGE = {
    paid: 'badge-green', partial: 'badge-yellow', pending: 'badge-red',
    cancelled: 'badge-gray', draft: 'badge-gray', refunded: 'badge-gray',
  };

  const CATEGORY_CONFIG = {
    Consultation: { icon: Stethoscope, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20' },
    Pharmacy: { icon: Pill, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/20' },
    Laboratory: { icon: FlaskConical, color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-900/20' },
    Admission: { icon: Package, color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-900/20' },
    Room: { icon: Bed, color: 'text-indigo-600', bg: 'bg-indigo-50 dark:bg-indigo-900/20' },
    Procedure: { icon: Receipt, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20' },
    ICU: { icon: Bed, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-900/20' },
    Nursing: { icon: User, color: 'text-teal-600', bg: 'bg-teal-50 dark:bg-teal-900/20' },
    Miscellaneous: { icon: Receipt, color: 'text-gray-600', bg: 'bg-gray-50 dark:bg-gray-800' },
  };

  const fmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // ── NEW: Collapse every auto-fetched "Consultation" category charge into a single
  // line item representing the assigned doctor's consultation fee. This prevents the
  // "consultation fee showing twice" issue (e.g. OP consultation + doctor-round charge
  // both landing in the Consultation category at once).
  const mergeConsultationCharges = (rawCharges, doctor) => {
    const consultCharges = rawCharges.filter((c) => c.category === 'Consultation');
    const otherCharges = rawCharges.filter((c) => c.category !== 'Consultation');

    if (consultCharges.length <= 1) return rawCharges;

    const totalBase = consultCharges.reduce((s, c) => s + (Number(c.quantity) || 0) * (Number(c.unitPrice) || 0), 0);
    const totalGst = consultCharges.reduce((s, c) => s + (Number(c.gstAmount) || 0), 0);
    const avgGstPercent = totalBase > 0 ? (totalGst / totalBase) * 100 : 0;
    const includedAny = consultCharges.some((c) => c.included !== false);

    const merged = {
      id: `consult-merged-${consultCharges[0].referenceId || Date.now()}`,
      category: 'Consultation',
      type: 'consultation',
      description: `Doctor Consultation Fee${doctor?.name ? ` - Dr. ${doctor.name}` : ''}`,
      quantity: 1,
      unitPrice: totalBase,
      gstPercent: Math.round(avgGstPercent * 100) / 100,
      gstAmount: totalGst,
      amount: totalBase + totalGst,
      referenceId: consultCharges[0].referenceId,
      referenceModel: consultCharges[0].referenceModel,
      meta: { mergedFrom: consultCharges.map((c) => c.id) },
      included: includedAny,
    };

    return [merged, ...otherCharges];
  };

  export default function BillingPage() {
    const { user } = useSelector((s) => s.auth);
    const [page, setPage] = useState(1);
    const [showCreate, setShowCreate] = useState(false);
    const [showDetail, setShowDetail] = useState(null);
    const [showPayment, setShowPayment] = useState(null);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [patientSearch, setPatientSearch] = useState('');
    const [patients, setPatients] = useState([]);
    const [selectedPatient, setSelectedPatient] = useState(null);
    const [charges, setCharges] = useState([]);
    const [loadingCharges, setLoadingCharges] = useState(false);
    const [discount, setDiscount] = useState(0);
    const [paidAmount, setPaidAmount] = useState(0);
    const [paymentMode, setPaymentMode] = useState('cash');
    const [collapsedCats, setCollapsedCats] = useState({});
    const [showDischarge, setShowDischarge] = useState(false);
    const [showPrintPreview, setShowPrintPreview] = useState(null);
    const [showEditBill, setShowEditBill] = useState(false);
    const [editItems, setEditItems] = useState([]);
    const [editDiscount, setEditDiscount] = useState(0);
    const [editReason, setEditReason] = useState('');
    const [medQuery, setMedQuery] = useState('');
    const [medResults, setMedResults] = useState([]);
    const [showConsultForm, setShowConsultForm] = useState(false);
    const [consultForm, setConsultForm] = useState({ description: 'Consultation Fee', doctorName: '', fee: '', gstPercent: 0 });
    // ── NEW: manual medicine search inside the Create Bill (IP Billing) modal ──
    const [createMedQuery, setCreateMedQuery] = useState('');
    const [createMedResults, setCreateMedResults] = useState([]);
    // ─────────────────────────────────────────────────────────────────────────
    const qc = useQueryClient();

    const { data, isLoading } = useQuery({
      queryKey: ['bills', page, search, statusFilter],
      queryFn: () => {
        const params = new URLSearchParams({ page, limit: 20 });
        if (search) params.set('billNumber', search);
        if (statusFilter) params.set('status', statusFilter);
        return api.get(`/billing?${params}`).then((r) => r.data);
      },
    });

    const { data: statsData } = useQuery({
      queryKey: ['billStats'],
      queryFn: () => api.get('/billing/stats').then((r) => r.data.data),
    });

    const { data: pendingDischarge } = useQuery({
      queryKey: ['pendingDischarge'],
      queryFn: () => api.get('/billing/pending-discharge').then((r) => r.data.data),
      enabled: showCreate || showDischarge,
    });

    const [chargeMeta, setChargeMeta] = useState({ doctor: null, department: null });

    const loadPatientCharges = useCallback(async (patientId) => {
      setLoadingCharges(true);
      try {
        const { data } = await api.get(`/billing/patient/${patientId}/charges`);
        const rawCharges = (data.data.charges || []).map((c) => ({ ...c, included: c.included !== false }));
        setCharges(mergeConsultationCharges(rawCharges, data.data.doctor));
        setChargeMeta({ doctor: data.data.doctor, department: data.data.department });
      } catch (err) {
        toast.error(err.response?.data?.message || 'Failed to load charges');
        setCharges([]);
      } finally {
        setLoadingCharges(false);
      }
    }, []);

    useEffect(() => {
      if (patientSearch.length >= 2) {
        api.get(`/patients/search?q=${patientSearch}`).then((r) => setPatients(r.data.data || []));
      } else {
        setPatients([]);
      }
    }, [patientSearch]);

    const selectPatient = (p) => {
      setSelectedPatient(p);
      setPatientSearch(`${p.name} (${p.patientId})`);
      setPatients([]);
      loadPatientCharges(p._id);
    };

    const toggleCharge = (id) => {
      setCharges((prev) => prev.map((c) => (c.id === id ? { ...c, included: !c.included } : c)));
    };

    // ── NEW: allow manual editing of quantity / unit price / GST% for ANY charge,
    // whether it was auto-fetched (OP/IP/Lab/Pharmacy) or manually added.
    const updateCharge = (id, patch) => {
      setCharges((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    };

    const removeCharge = (id) => {
      setCharges((prev) => prev.filter((c) => c.id !== id));
    };

    const toggleCategory = (category, include) => {
      setCharges((prev) => prev.map((c) => (c.category === category ? { ...c, included: include } : c)));
    };

    const toggleCollapse = (cat) => {
      setCollapsedCats((prev) => ({ ...prev, [cat]: !prev[cat] }));
    };

    const groupedCharges = useMemo(() => {
      const groups = {};
      charges.forEach((c) => {
        if (!groups[c.category]) groups[c.category] = [];
        groups[c.category].push(c);
      });
      return groups;
    }, [charges]);

    // ── Helper: live amount for a charge, recalculated from its (possibly edited) fields ──
    const lineBase = (c) => (Number(c.quantity) || 0) * (Number(c.unitPrice) || 0);
    const lineGst = (c) => lineBase(c) * ((Number(c.gstPercent) || 0) / 100);
    const lineTotal = (c) => lineBase(c) + lineGst(c);

    const totals = useMemo(() => {
      const included = charges.filter((c) => c.included);
      const subtotal = included.reduce((s, c) => s + lineBase(c), 0);
      const gst = included.reduce((s, c) => s + lineGst(c), 0);
      const discountAmount = (subtotal + gst) * ((Number(discount) || 0) / 100);
      const total = subtotal + gst - discountAmount;
      const due = Math.max(total - (Number(paidAmount) || 0), 0);
      return { subtotal, gst, discountAmount, total, due, itemCount: included.length };
    }, [charges, discount, paidAmount]);

    const categorySummary = useMemo(() => {
      const summary = {};
      charges.filter((c) => c.included).forEach((c) => {
        summary[c.category] = (summary[c.category] || 0) + lineTotal(c);
      });
      return summary;
    }, [charges]);

    const resetCreateForm = () => {
      setSelectedPatient(null);
      setPatientSearch('');
      setCharges([]);
      setDiscount(0);
      setPaidAmount(0);
      setPaymentMode('cash');
      setChargeMeta({ doctor: null, department: null });
      setShowConsultForm(false);
      setConsultForm({ description: 'Consultation Fee', doctorName: '', fee: '', gstPercent: 0 });
      setCreateMedQuery('');
      setCreateMedResults([]);
    };

    const createMut = useMutation({
      mutationFn: (payload) => api.post('/billing', payload),
      onSuccess: (res) => {
        toast.success(res.data.message || 'Bill created!');
        qc.invalidateQueries(['bills']);
        qc.invalidateQueries(['billStats']);
        qc.invalidateQueries(['pendingDischarge']);
        setShowCreate(false);
        resetCreateForm();
      },
      onError: (err) => toast.error(err.response?.data?.message || 'Failed to create bill'),
    });

    const paymentMut = useMutation({
      mutationFn: ({ id, amount, mode }) => api.post(`/billing/${id}/payment`, { amount, mode }),
      onSuccess: () => {
        toast.success('Payment recorded');
        qc.invalidateQueries(['bills']);
        qc.invalidateQueries(['billStats']);
        setShowPayment(null);
        setShowDetail(null);
      },
      onError: (err) => toast.error(err.response?.data?.message || 'Payment failed'),
    });

    const cancelMut = useMutation({
      mutationFn: (id) => api.post(`/billing/${id}/cancel`),
      onSuccess: (res) => {
        toast.success(res.data.message || 'Bill cancelled');
        qc.invalidateQueries(['bills']);
        qc.invalidateQueries(['billStats']);
        setShowDetail(null);
      },
      onError: (err) => toast.error(err.response?.data?.message || 'Cancel failed'),
    });

    const updateBillMut = useMutation({
      mutationFn: ({ id, payload }) => api.put(`/billing/${id}`, payload),
      onSuccess: (res) => {
        toast.success('Pharmacy bill updated');
        qc.invalidateQueries(['bills']);
        qc.invalidateQueries(['billStats']);
        qc.invalidateQueries(['bill', res.data.data._id]);
        setShowEditBill(false);
        setEditReason('');
        setMedQuery('');
        setMedResults([]);
      },
      onError: (err) => toast.error(err.response?.data?.message || 'Bill update failed'),
    });

    const { data: detailData, isLoading: detailLoading } = useQuery({
      queryKey: ['bill', showDetail],
      queryFn: () => api.get(`/billing/${showDetail}`).then((r) => r.data.data),
      enabled: !!showDetail,
    });

    const { data: previewData, isLoading: previewLoading } = useQuery({
      queryKey: ['bill', showPrintPreview],
      queryFn: () => api.get(`/billing/${showPrintPreview}`).then((r) => r.data.data),
      enabled: !!showPrintPreview,
    });

    const downloadBillPdf = async (id, thermal = false) => {
      try {
        const endpoint = thermal ? `/billing/${id}/thermal` : `/billing/${id}/print`;
        const response = await api.get(endpoint, { responseType: 'blob' });
        const blob = new Blob([response.data], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = thermal ? `thermal-${id}.pdf` : `invoice-${id}.pdf`;
        link.click();
        setTimeout(() => window.URL.revokeObjectURL(url), 60000);
      } catch {
        toast.error('Unable to download invoice');
      }
    };

    const openPrintPreview = (id) => {
      setShowDetail(null);
      setShowPrintPreview(id);
    };

    const canEditPharmacyBill = (bill) => {
      if (!bill || bill.status === 'cancelled') return false;
      const isPharmacyBill = bill.billType === 'pharmacy'
        || (bill.billType === 'ip' && bill.items?.every((item) => item.type === 'medicine' || item.category === 'Pharmacy'));
      return isPharmacyBill && ['Super Admin', 'Admin', 'Pharmacist'].includes(user?.role);
    };

    const openEditBill = (bill) => {
      setEditItems((bill.items || []).map((item) => ({ ...item, medicine: item.medicine?._id || item.medicine })));
      setEditDiscount(Number(bill.discount || 0));
      setEditReason('');
      setMedQuery('');
      setMedResults([]);
      setShowEditBill(true);
    };

    useEffect(() => {
      if (!showEditBill || medQuery.trim().length < 2) {
        setMedResults([]);
        return;
      }
      const t = setTimeout(() => {
        api.get(`/pharmacy/search?q=${encodeURIComponent(medQuery.trim())}`)
          .then((r) => setMedResults(r.data.data || []))
          .catch(() => setMedResults([]));
      }, 250);
      return () => clearTimeout(t);
    }, [showEditBill, medQuery]);

    const updateEditItem = (idx, field, value) => {
      setEditItems((prev) => prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));
    };

    const addEditMedicine = (medicine) => {
      // Auto-pick first valid non-disposed batch from inventory
      const validBatch = medicine.batches?.find((b) => !b.isDisposed && b.quantity > 0);
      setEditItems((prev) => [
        ...prev,
        {
          category: 'Pharmacy',
          type: 'medicine',
          description: medicine.genericName || medicine.name,
          name: medicine.name,
          medicine: medicine._id,
          quantity: 1,
          unitPrice: medicine.sellingPrice || 0,
          gstPercent: medicine.gstPercent || 0,
          genericName: medicine.genericName || '',
          mrp: medicine.mrp || medicine.sellingPrice || 0,
          hsnCode: medicine.hsnCode || '',
          unitOfMeasure: medicine.unitOfMeasure || 'Nos',
          batch: validBatch?.batchNumber || '',
          batchNumber: validBatch?.batchNumber || '',
          expiryDate: validBatch?.expiryDate || null,
          mfgDate: validBatch?.receivedDate || null,
          discountPercent: 0,
          discountAmount: 0,
        },
      ]);
      setMedQuery('');
      setMedResults([]);
    };

    const saveEditedBill = () => {
      if (!editReason.trim()) {
        toast.error('Reason is required for pharmacy bill edits');
        return;
      }
      if (!editItems.length) {
        toast.error('Bill must contain at least one medicine');
        return;
      }
      updateBillMut.mutate({
        id: detailData._id,
        payload: {
          items: editItems.map((item) => ({
            _id: item._id,
            category: 'Pharmacy',
            type: 'medicine',
            description: item.description || item.name,
            name: item.name || item.description,
            medicine: item.medicine?._id || item.medicine,
            quantity: Number(item.quantity || 0),
            unitPrice: Number(item.unitPrice || 0),
            gstPercent: Number(item.gstPercent || 0),
            batch: item.batch || item.batchNumber,
            batchNumber: item.batchNumber || item.batch,
            genericName: item.genericName || '',
            mrp: Number(item.mrp || item.unitPrice || 0),
            hsnCode: item.hsnCode || '',
            unitOfMeasure: item.unitOfMeasure || 'Nos',
            expiryDate: item.expiryDate || null,
            mfgDate: item.mfgDate || null,
            discountPercent: Number(item.discountPercent || 0),
            discountAmount: Number(item.discountAmount || 0),
            referenceId: item.referenceId,
            referenceModel: item.referenceModel,
          })),
          discount: Number(editDiscount || 0),
          reason: editReason.trim(),
        },
      });
    };

    // ── NEW: medicine search within the Create Bill (IP Billing) modal ─────────
    useEffect(() => {
      if (!showCreate || createMedQuery.trim().length < 2) {
        setCreateMedResults([]);
        return;
      }
      const t = setTimeout(() => {
        api.get(`/pharmacy/search?q=${encodeURIComponent(createMedQuery.trim())}`)
          .then((r) => setCreateMedResults(r.data.data || []))
          .catch(() => setCreateMedResults([]));
      }, 250);
      return () => clearTimeout(t);
    }, [showCreate, createMedQuery]);

    const addCreateMedicine = (medicine) => {
      const validBatch = medicine.batches?.find((b) => !b.isDisposed && b.quantity > 0);
      const availableStock = Number(medicine.currentStock ?? validBatch?.quantity ?? 0);
      if (!validBatch && availableStock <= 0) {
        toast.error('Selected medicine is out of stock');
        return;
      }

      setCharges((prev) => {
        const existing = prev.find((c) => c.type === 'medicine' && (c.medicine === medicine._id || c.referenceId === medicine._id));
        if (existing) {
          toast.success('Medicine quantity increased');
          return prev.map((c) => (
            c.id === existing.id
              ? { ...c, quantity: Number(c.quantity || 0) + 1, included: true }
              : c
          ));
        }

        const price = Number(medicine.sellingPrice || 0);
        const gstPercent = Number(medicine.gstPercent || 0);
        return [...prev, {
          id: `manual-med-${medicine._id}-${Date.now()}`,
          category: 'Pharmacy',
          type: 'medicine',
          description: medicine.name,
          quantity: 1,
          unitPrice: price,
          gstPercent,
          gstAmount: price * (gstPercent / 100),
          amount: price * (1 + gstPercent / 100),
          medicine: medicine._id,
          referenceId: medicine._id,
          referenceModel: 'Medicine',
          genericName: medicine.genericName || '',
          batch: validBatch?.batchNumber || '',
          batchNumber: validBatch?.batchNumber || '',
          expiryDate: validBatch?.expiryDate || null,
          unitOfMeasure: medicine.unitOfMeasure || 'Nos',
          availableStock,
          included: true,
        }];
      });
      setCreateMedQuery('');
      setCreateMedResults([]);
    };
    // ─────────────────────────────────────────────────────────────────────────

    const addManualConsultation = () => {
      const fee = Number(consultForm.fee);
      if (!fee || fee <= 0) { toast.error('Enter a valid consultation fee'); return; }
      const description = consultForm.doctorName
        ? `${consultForm.description} - Dr. ${consultForm.doctorName}`
        : consultForm.description;
      const gstAmount = fee * ((Number(consultForm.gstPercent) || 0) / 100);
      setCharges((prev) => [...prev, {
        id: `manual-consult-${Date.now()}`,
        category: 'Consultation',
        type: 'consultation',
        description,
        quantity: 1,
        unitPrice: fee,
        gstPercent: Number(consultForm.gstPercent) || 0,
        gstAmount,
        amount: fee + gstAmount,
        included: true,
      }]);
      setConsultForm({ description: 'Consultation Fee', doctorName: '', fee: '', gstPercent: 0 });
      setShowConsultForm(false);
      toast.success('Consultation charge added');
    };

    const handleGenerateBill = () => {
      if (!selectedPatient) {
        toast.error('Please select a patient');
        return;
      }
      const included = charges.filter((c) => c.included);
      if (!included.length) {
        toast.error('Select at least one charge to bill');
        return;
      }

      const payload = {
        billType: 'unified',
        patient: selectedPatient._id,
        doctor: chargeMeta.doctor?._id,
        department: chargeMeta.department?._id,
        items: included.map(({ id, included: _i, amount, meta, ...item }) => ({
          ...item,
          quantity: Number(item.quantity) || 0,
          unitPrice: Number(item.unitPrice) || 0,
          gstPercent: Number(item.gstPercent) || 0,
          gstAmount: lineGst(item),
        })),
        subtotal: totals.subtotal,
        totalGST: totals.gst,
        discount,
        discountAmount: totals.discountAmount,
        totalAmount: totals.total,
        paidAmount: Number(paidAmount) || 0,
        paymentMode,
      };
      createMut.mutate(payload);
    };

    const columns = [
      {
        key: 'billNumber',
        header: 'Invoice #',
        render: (r) => (
          <button type="button" onClick={() => setShowDetail(r._id)} className="font-mono font-semibold text-blue-600 dark:text-blue-400 hover:underline">
            {r.billNumber}
          </button>
        ),
      },
      {
        key: 'patient',
        header: 'Patient',
        render: (r) => (
          <div>
            <p className="font-medium text-gray-900 dark:text-white">{r.patient?.name}</p>
            <p className="text-xs text-gray-400">{r.patient?.patientId}</p>
          </div>
        ),
      },
      {
        key: 'billType',
        header: 'Type',
        render: (r) => <span className="badge-blue capitalize">{r.billType || 'unified'}</span>,
      },
      {
        key: 'totalAmount',
        header: 'Total',
        render: (r) => <span className="font-semibold">{fmt(r.totalAmount)}</span>,
      },
      {
        key: 'dueAmount',
        header: 'Due',
        render: (r) => (
          <span className={r.dueAmount > 0 ? 'text-red-600 font-medium' : 'text-green-600'}>
            {fmt(r.dueAmount)}
          </span>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        render: (r) => <span className={STATUS_BADGE[r.status] || 'badge-gray'}>{r.status}</span>,
      },
      {
        key: 'actions',
        header: '',
        render: (r) => (
          <div className="flex gap-1">
            <button type="button" onClick={() => setShowDetail(r._id)} title="View" className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg">
              <Eye size={15} />
            </button>
            <button type="button" onClick={() => openPrintPreview(r._id)} title="Print Preview" className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg">
              <Printer size={15} />
            </button>
          </div>
        ),
      },
    ];

    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Unified Billing</h1>
            <p className="text-sm text-gray-500 mt-0.5">Consolidated invoicing for OP, IP, Lab, Pharmacy &amp; more</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowDischarge(true)} className="btn-secondary">
              <Bed size={16} /> Pending Discharge
              {pendingDischarge?.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-red-500 text-white text-xs rounded-full">{pendingDischarge.length}</span>
              )}
            </button>
            <button type="button" onClick={() => { resetCreateForm(); setShowCreate(true); }} className="btn-primary">
              <Plus size={16} /> IP Billing
            </button>
          </div>
        </div>

        {statsData && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Today's Revenue", value: fmt(statsData.todayRevenue), color: 'text-green-600', icon: CheckCircle2 },
              { label: 'Month Revenue', value: fmt(statsData.monthRevenue), color: 'text-blue-600', icon: CreditCard },
              { label: 'Pending Bills', value: statsData.pendingBills, color: 'text-amber-600', icon: AlertTriangle },
              { label: "Today's Bills", value: statsData.totalBills, color: 'text-gray-600', icon: Receipt },
            ].map((s) => (
              <div key={s.label} className="kpi-card flex items-center gap-4">
                <div className={`p-3 rounded-xl bg-gray-50 dark:bg-gray-700/50 ${s.color}`}>
                  <s.icon size={22} />
                </div>
                <div>
                  <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-gray-500">{s.label}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search invoice number..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="input-field pl-9"
            />
          </div>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="input-field w-auto min-w-[140px]">
            <option value="">All Status</option>
            {['pending', 'partial', 'paid', 'cancelled'].map((s) => (
              <option key={s} value={s} className="capitalize">{s}</option>
            ))}
          </select>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
          <DataTable columns={columns} data={data?.data || []} loading={isLoading} page={page} pages={data?.pages || 1} onPageChange={setPage} />
        </div>

        {/* UNIFIED BILLING MODAL */}
        <Modal isOpen={showCreate} onClose={() => { setShowCreate(false); resetCreateForm(); }} title="IP Billing — Create Bill" size="full">
          <div className="flex flex-col lg:flex-row min-h-[75vh]">
            {/* Left: Patient & Charges */}
            <div className="flex-1 p-6 space-y-5 border-r border-gray-200 dark:border-gray-700 overflow-y-auto max-h-[80vh]">
              {/* Patient search */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Select Patient <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Search by name, ID, or phone..."
                    value={patientSearch}
                    onChange={(e) => { setPatientSearch(e.target.value); if (!e.target.value) { setSelectedPatient(null); setCharges([]); } }}
                    className="input-field flex-1"
                  />
                  {selectedPatient && (
                    <button type="button" onClick={() => loadPatientCharges(selectedPatient._id)} className="btn-secondary px-3" title="Refresh charges">
                      <RefreshCw size={16} className={loadingCharges ? 'animate-spin' : ''} />
                    </button>
                  )}
                </div>
                {patients.length > 0 && (
                  <div className="mt-1 border border-gray-200 dark:border-gray-600 rounded-xl shadow-lg overflow-hidden max-h-40 overflow-y-auto z-10 relative">
                    {patients.map((p) => (
                      <button key={p._id} type="button" onClick={() => selectPatient(p)} className="w-full text-left px-4 py-2.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-sm border-b border-gray-100 dark:border-gray-700 last:border-0">
                        <span className="font-medium">{p.name}</span>
                        <span className="text-gray-400 ml-2">{p.patientId}</span>
                        <span className="text-gray-400 ml-2">{p.phone}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Patient info bar */}
              {selectedPatient && (
                <div className="flex items-center gap-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800">
                  <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold">
                    {selectedPatient.name?.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900 dark:text-white">{selectedPatient.name}</p>
                    <p className="text-xs text-gray-500">{selectedPatient.patientId} · {selectedPatient.age}yr · {selectedPatient.gender}</p>
                  </div>
                  {chargeMeta.doctor && (
                    <div className="text-right text-sm">
                      <p className="text-gray-400 text-xs">Doctor</p>
                      <p className="font-medium">{chargeMeta.doctor.name}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Charges */}
              {loadingCharges && (
                <div className="text-center py-12 text-gray-400">
                  <RefreshCw size={24} className="animate-spin mx-auto mb-2" />
                  Loading billable charges...
                </div>
              )}

              {!loadingCharges && selectedPatient && charges.length === 0 && (
                <div className="text-center py-12 text-gray-400">
                  <Receipt size={40} className="mx-auto mb-3 opacity-30" />
                  <p className="font-medium">No unpaid charges found</p>
                  <p className="text-sm mt-1">No existing unpaid items. You can add medicines or consultation below.</p>
                </div>
              )}

              {/* Add Medicine */}
              {selectedPatient && !loadingCharges && (
                <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/20 overflow-visible">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-3 border-b border-emerald-100 dark:border-emerald-900/60">
                    <div className="flex items-center gap-2">
                      <span className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
                        <Pill size={16} />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">Add Pharmacy Medicine</p>
                        <p className="text-xs text-emerald-700/70 dark:text-emerald-300/70">Search inventory, select once, then edit quantity in billable items.</p>
                      </div>
                    </div>
                    {charges.some((c) => c.category === 'Pharmacy') && (
                      <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-white/70 dark:bg-gray-900/40 px-2.5 py-1 rounded-full">
                        {charges.filter((c) => c.category === 'Pharmacy').length} medicine item(s)
                      </span>
                    )}
                  </div>
                  <div className="p-4 bg-white dark:bg-gray-800 rounded-b-2xl">
                    <div className="relative">
                      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        value={createMedQuery}
                        onChange={(e) => setCreateMedQuery(e.target.value)}
                        className="input-field text-sm pl-9"
                        placeholder="Type at least 2 letters to search medicine..."
                      />
                      {createMedQuery.trim().length >= 2 && createMedResults.length === 0 && (
                        <div className="absolute z-20 mt-1 w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 rounded-xl shadow-lg px-4 py-3 text-sm text-gray-400">
                          No matching medicine found
                        </div>
                      )}
                      {createMedResults.length > 0 && (
                        <div className="absolute z-30 mt-1 w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 rounded-xl shadow-xl max-h-64 overflow-y-auto">
                          {createMedResults.map((m) => {
                            const validBatch = m.batches?.find((b) => !b.isDisposed && b.quantity > 0);
                            const stock = Number(m.currentStock ?? validBatch?.quantity ?? 0);
                            const alreadyAdded = charges.some((c) => c.type === 'medicine' && (c.medicine === m._id || c.referenceId === m._id));
                            const expiry = validBatch?.expiryDate ? new Date(validBatch.expiryDate).toLocaleDateString('en-IN') : null;
                            return (
                              <button
                                key={m._id}
                                type="button"
                                onClick={() => addCreateMedicine(m)}
                                disabled={stock <= 0}
                                className={`w-full text-left px-4 py-3 border-b border-gray-100 dark:border-gray-700 last:border-0 transition-colors ${stock <= 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-emerald-50 dark:hover:bg-emerald-900/20'}`}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">{m.name}</p>
                                    <p className="text-xs text-gray-500 truncate">
                                      {m.genericName || 'Generic not set'} {validBatch?.batchNumber ? `| Batch ${validBatch.batchNumber}` : ''} {expiry ? `| Exp ${expiry}` : ''}
                                    </p>
                                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${stock > 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'}`}>
                                        Stock {stock}
                                      </span>
                                      {alreadyAdded && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">Already added</span>}
                                      {m.gstPercent ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">GST {m.gstPercent}%</span> : null}
                                    </div>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <p className="font-bold text-emerald-700 dark:text-emerald-300">{fmt(m.sellingPrice)}</p>
                                    <p className="text-[10px] text-gray-400">{m.unitOfMeasure || 'Nos'}</p>
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Manual Consultation — hidden once a doctor consultation fee already
                  exists in the charge list, so only ONE consultation line is ever billed. */}
              {selectedPatient && !loadingCharges && !charges.some((c) => c.category === 'Consultation') && (
                <div className="border border-blue-200 dark:border-blue-700 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 bg-blue-50 dark:bg-blue-900/20">
                    <span className="text-blue-700 dark:text-blue-300 font-semibold text-sm">
                      Manual Consultation Charge
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (!showConsultForm) {
                          setConsultForm((f) => ({
                            ...f,
                            doctorName: chargeMeta.doctor?.name || f.doctorName,
                            fee: f.fee || (chargeMeta.doctor?.consultationFee ?? ''),
                          }));
                        }
                        setShowConsultForm((v) => !v);
                      }}
                      className="text-xs text-blue-600 hover:underline font-medium"
                    >
                      {showConsultForm ? 'Hide' : '+ Add Consultation'}
                    </button>
                  </div>
                  {showConsultForm && (
                    <div className="p-4 bg-white dark:bg-gray-800 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
                          <input
                            type="text"
                            value={consultForm.description}
                            onChange={(e) => setConsultForm((f) => ({ ...f, description: e.target.value }))}
                            className="input-field text-sm"
                            placeholder="Consultation Fee"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Doctor Name (optional)</label>
                          <input
                            type="text"
                            value={consultForm.doctorName}
                            onChange={(e) => setConsultForm((f) => ({ ...f, doctorName: e.target.value }))}
                            className="input-field text-sm"
                            placeholder="Dr. Name"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Consultation Fee (₹) *</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={consultForm.fee}
                            onChange={(e) => setConsultForm((f) => ({ ...f, fee: e.target.value }))}
                            className="input-field text-sm"
                            placeholder="0.00"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">GST %</label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={consultForm.gstPercent}
                            onChange={(e) => setConsultForm((f) => ({ ...f, gstPercent: e.target.value }))}
                            className="input-field text-sm"
                            placeholder="0"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => setShowConsultForm(false)}
                          className="btn-secondary text-sm py-1.5 px-3"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={addManualConsultation}
                          className="btn-primary text-sm py-1.5 px-3"
                        >
                          Add to Bill
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!loadingCharges && charges.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Billable Items ({charges.filter((c) => c.included).length}/{charges.length} selected)
                    </h3>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setCharges((p) => p.map((c) => ({ ...c, included: true })))} className="text-xs text-blue-600 hover:underline">Select all</button>
                      <button type="button" onClick={() => setCharges((p) => p.map((c) => ({ ...c, included: false })))} className="text-xs text-gray-500 hover:underline">Clear all</button>
                    </div>
                  </div>

                  {Object.entries(groupedCharges).map(([category, items]) => {
                    const cfg = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.Miscellaneous;
                    const CatIcon = cfg.icon;
                    const allIncluded = items.every((c) => c.included);
                    const someIncluded = items.some((c) => c.included);
                    const catTotal = items.filter((c) => c.included).reduce((s, c) => s + lineTotal(c), 0);
                    const collapsed = collapsedCats[category];

                    return (
                      <div key={category} className={`rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden`}>
                        <div className={`flex items-center gap-3 px-4 py-3 ${cfg.bg} cursor-pointer`} onClick={() => toggleCollapse(category)}>
                          <input
                            type="checkbox"
                            checked={allIncluded}
                            ref={(el) => { if (el) el.indeterminate = someIncluded && !allIncluded; }}
                            onChange={(e) => { e.stopPropagation(); toggleCategory(category, e.target.checked); }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-4 h-4 rounded accent-blue-600"
                          />
                          <CatIcon size={16} className={cfg.color} />
                          <span className="font-semibold text-sm flex-1">{category}</span>
                          <span className="text-sm font-medium">{fmt(catTotal)}</span>
                          <span className="text-xs text-gray-400">{items.length} item(s)</span>
                          {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                        </div>
                        {!collapsed && (
                          <div className="divide-y divide-gray-100 dark:divide-gray-700">
                            {items.map((charge) => (
                              <div key={charge.id} className={`flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3 ${!charge.included ? 'opacity-50' : ''}`}>
                                <input
                                  type="checkbox"
                                  checked={charge.included}
                                  onChange={() => toggleCharge(charge.id)}
                                  className="w-4 h-4 rounded accent-blue-600 shrink-0 mt-1 sm:mt-0"
                                />
                                <div className="flex-1 min-w-0">
                                  <input
                                    type="text"
                                    value={charge.description}
                                    onChange={(e) => updateCharge(charge.id, { description: e.target.value })}
                                    className="input-field text-sm w-full"
                                  />
                                  {charge.meta?.labStatus && (
                                    <p className="text-xs text-gray-400 mt-0.5">Status: {charge.meta.labStatus}</p>
                                  )}
                                  {charge.type === 'medicine' && (
                                    <p className="text-xs text-gray-400 mt-0.5">
                                      {[charge.genericName, charge.batchNumber && `Batch ${charge.batchNumber}`, charge.expiryDate && `Exp ${new Date(charge.expiryDate).toLocaleDateString('en-IN')}`, charge.availableStock !== undefined && `Stock ${charge.availableStock}`].filter(Boolean).join(' | ')}
                                    </p>
                                  )}
                                </div>
                                {/* ── Manually editable Qty / Rate / GST% for EVERY charge ── */}
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <div className="w-16">
                                    <label className="text-[10px] text-gray-400 block">Qty</label>
                                    <input
                                      type="number"
                                      min="0"
                                      step="1"
                                      value={charge.quantity}
                                      onChange={(e) => updateCharge(charge.id, { quantity: e.target.value })}
                                      className="input-field text-xs text-center py-1"
                                    />
                                  </div>
                                  <div className="w-24">
                                    <label className="text-[10px] text-gray-400 block">Rate (₹)</label>
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={charge.unitPrice}
                                      onChange={(e) => updateCharge(charge.id, { unitPrice: e.target.value })}
                                      className="input-field text-xs text-right py-1"
                                    />
                                  </div>
                                  <div className="w-16">
                                    <label className="text-[10px] text-gray-400 block">GST %</label>
                                    <input
                                      type="number"
                                      min="0"
                                      max="100"
                                      step="0.01"
                                      value={charge.gstPercent}
                                      onChange={(e) => updateCharge(charge.id, { gstPercent: e.target.value })}
                                      className="input-field text-xs text-right py-1"
                                    />
                                  </div>
                                  <div className="w-24 text-right">
                                    <label className="text-[10px] text-gray-400 block">Total</label>
                                    <p className="font-semibold text-sm">{fmt(lineTotal(charge))}</p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => removeCharge(charge.id)}
                                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                                    title="Remove charge"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right: Summary */}
            <div className="w-full lg:w-96 p-6 bg-gray-50 dark:bg-gray-900/50 flex flex-col shrink-0">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Bill Summary</h3>

              {Object.keys(categorySummary).length > 0 ? (
                <div className="space-y-1.5 text-sm flex-1">
                  {Object.entries(categorySummary).map(([cat, amt]) => (
                    <div key={cat} className="flex justify-between text-gray-500">
                      <span>{cat}</span>
                      <span>{fmt(amt)}</span>
                    </div>
                  ))}
                  <div className="border-t border-gray-200 dark:border-gray-600 my-2" />
                  <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>{fmt(totals.subtotal)}</span></div>
                  <div className="flex justify-between text-gray-500"><span>GST / Tax</span><span>{fmt(totals.gst)}</span></div>
                  <div className="flex justify-between text-gray-500">
                    <span>Discount ({discount || 0}%)</span>
                    <span className="text-red-500">-{fmt(totals.discountAmount)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-lg border-t border-gray-200 dark:border-gray-600 pt-3 mt-2">
                    <span>Grand Total</span>
                    <span className="text-blue-600">{fmt(totals.total)}</span>
                  </div>
                  {totals.due > 0 && paidAmount > 0 && (
                    <div className="flex justify-between text-amber-600 font-medium">
                      <span>Due Amount</span><span>{fmt(totals.due)}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-gray-400 text-sm text-center px-4">
                  Select a patient to load all unpaid charges from OP, IP, Lab, Pharmacy &amp; more
                </div>
              )}

              <div className="space-y-3 mt-6">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Discount %</label>
                  <input type="number" min="0" max="100" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} className="input-field text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Payment Mode</label>
                  <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} className="input-field text-sm">
                    {PAYMENT_MODES.map((m) => <option key={m} value={m} className="capitalize">{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Amount Paid Now</label>
                  <input type="number" min="0" step="0.01" value={paidAmount} onChange={(e) => setPaidAmount(Number(e.target.value))} className="input-field text-sm" placeholder="0.00" />
                  <button type="button" onClick={() => setPaidAmount(totals.total)} className="text-xs text-blue-600 mt-1 hover:underline">Pay full amount</button>
                </div>
              </div>

              <div className="flex flex-col gap-2 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={handleGenerateBill}
                  disabled={createMut.isPending || !selectedPatient || totals.itemCount === 0}
                  className="btn-primary w-full justify-center py-3"
                >
                  <Receipt size={16} />
                  {createMut.isPending ? 'Generating...' : `Generate Invoice (${totals.itemCount} items)`}
                </button>
                <button type="button" onClick={() => { setShowCreate(false); resetCreateForm(); }} className="btn-secondary w-full justify-center">Cancel</button>
              </div>
            </div>
          </div>
        </Modal>

        {/* PENDING DISCHARGE MODAL */}
        <Modal isOpen={showDischarge} onClose={() => setShowDischarge(false)} title="Discharged Patients — Pending Billing" size="lg">
          <div className="p-6">
            {!pendingDischarge?.length ? (
              <p className="text-center text-gray-400 py-8">No discharged patients pending billing</p>
            ) : (
              <div className="space-y-3">
                {pendingDischarge.map((d) => (
                  <div key={d.admissionId} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                    <div>
                      <p className="font-medium">{d.patient?.name} <span className="text-gray-400 text-sm">{d.patient?.patientId}</span></p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {d.admissionNumber} · Dr. {d.doctor?.name} · {d.stayDays} day(s) · Bed {d.bed?.bedNumber}
                      </p>
                      <p className="text-xs text-gray-400">
                        Admitted: {new Date(d.admissionDate).toLocaleDateString()} → Discharged: {new Date(d.dischargeDate).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-blue-600">{fmt(d.estimatedRoomCharges + 500)}</p>
                      <p className="text-xs text-gray-400">Est. charges</p>
                      <button
                        type="button"
                        onClick={() => {
                          selectPatient(d.patient);
                          setShowDischarge(false);
                          setShowCreate(true);
                        }}
                        className="mt-2 text-xs btn-primary py-1 px-3"
                      >
                        Bill Now
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>

        {/* BILL DETAIL MODAL */}
        <Modal isOpen={!!showDetail} onClose={() => setShowDetail(null)} title="Invoice Details" size="lg">
          {detailLoading ? (
            <div className="p-8 text-center text-gray-400">Loading...</div>
          ) : detailData ? (
            <div className="p-6 space-y-5">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-mono text-lg font-bold text-blue-600">{detailData.billNumber}</p>
                  <p className="text-sm text-gray-500 capitalize">{detailData.billType || 'unified'} bill</p>
                </div>
                <span className={STATUS_BADGE[detailData.status] || 'badge-gray'}>{detailData.status}</span>
              </div>

              <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl text-sm">
                <div>
                  <p className="text-gray-400 text-xs">Patient</p>
                  <p className="font-medium">{detailData.patient?.name}</p>
                  <p className="text-gray-400">{detailData.patient?.patientId}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-xs">Date</p>
                  <p className="font-medium">{new Date(detailData.createdAt).toLocaleString()}</p>
                  {detailData.doctor && <p className="text-gray-400 text-xs mt-1">Dr. {detailData.doctor.name}</p>}
                </div>
              </div>

              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2">Category</th>
                    <th className="text-left py-2">Item</th>
                    <th className="text-center py-2">Qty</th>
                    <th className="text-right py-2">Rate</th>
                    <th className="text-right py-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {detailData.items?.map((item, idx) => (
                    <tr key={idx} className="border-b border-gray-100 dark:border-gray-700/50">
                      <td className="py-2"><span className="badge-blue text-xs">{item.category || item.type}</span></td>
                      <td className="py-2">
                        <p className="font-medium">{item.description || item.name}</p>
                        {item.type === 'medicine' && item.medicine && (
                          <p className="text-xs text-green-600 flex items-center gap-1"><Pill size={10} /> Pharmacy</p>
                        )}
                      </td>
                      <td className="text-center py-2">{item.quantity}</td>
                      <td className="text-right py-2">{fmt(item.unitPrice)}</td>
                      <td className="text-right py-2 font-medium">{fmt(item.totalAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex justify-end">
                <div className="w-56 space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>{fmt(detailData.subtotal)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">GST</span><span>{fmt(detailData.totalGST)}</span></div>
                  {detailData.discount > 0 && (
                    <div className="flex justify-between text-red-500"><span>Discount ({detailData.discount}%)</span><span>-{fmt(detailData.discountAmount)}</span></div>
                  )}
                  <div className="flex justify-between font-bold border-t pt-1"><span>Grand Total</span><span>{fmt(detailData.totalAmount)}</span></div>
                  <div className="flex justify-between text-green-600"><span>Paid</span><span>{fmt(detailData.paidAmount)}</span></div>
                  {detailData.dueAmount > 0 && (
                    <div className="flex justify-between text-red-600 font-medium"><span>Due</span><span>{fmt(detailData.dueAmount)}</span></div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                {canEditPharmacyBill(detailData) && (
                  <button type="button" onClick={() => openEditBill(detailData)} className="btn-secondary">
                    <Edit3 size={15} /> Edit Bill
                  </button>
                )}
                <button type="button" onClick={() => openPrintPreview(detailData._id)} className="btn-primary"><Printer size={15} /> Print Preview</button>
                <button type="button" onClick={() => downloadBillPdf(detailData._id)} className="btn-secondary"><Printer size={15} /> Download PDF</button>
                <button type="button" onClick={() => downloadBillPdf(detailData._id, true)} className="btn-secondary"><Printer size={15} /> Thermal PDF</button>
                {detailData.status !== 'cancelled' && detailData.dueAmount > 0 && (
                  <button type="button" onClick={() => setShowPayment(detailData)} className="btn-primary"><CreditCard size={15} /> Record Payment</button>
                )}
                {detailData.status !== 'cancelled' && detailData.status !== 'paid' && (
                  <button type="button" onClick={() => { if (window.confirm('Cancel this bill?')) cancelMut.mutate(detailData._id); }} className="btn-danger flex items-center gap-2">
                    <Ban size={15} /> Cancel
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
                <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900/50 flex items-center gap-2">
                    <History size={15} />
                    <h3 className="font-semibold text-sm">Edit History</h3>
                  </div>
                  <div className="max-h-56 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
                    {detailData.editHistory?.length ? detailData.editHistory.slice().reverse().map((h) => (
                      <div key={h._id} className="p-3 text-xs space-y-1">
                        <div className="flex justify-between gap-3">
                          <span className="font-semibold text-gray-900 dark:text-white">{h.actionType}</span>
                          <span className="text-gray-400 shrink-0">{new Date(h.editTime).toLocaleString()}</span>
                        </div>
                        <p className="text-gray-500">{h.userName || h.user?.name || 'User'} · {h.reason}</p>
                        <div className="grid grid-cols-2 gap-2 text-gray-500">
                          <pre className="whitespace-pre-wrap break-words bg-gray-50 dark:bg-gray-900/60 rounded-lg p-2">{JSON.stringify(h.previousValue ?? '-', null, 2)}</pre>
                          <pre className="whitespace-pre-wrap break-words bg-gray-50 dark:bg-gray-900/60 rounded-lg p-2">{JSON.stringify(h.newValue ?? '-', null, 2)}</pre>
                        </div>
                      </div>
                    )) : (
                      <p className="p-4 text-sm text-gray-400">No edits recorded</p>
                    )}
                  </div>
                </div>

                <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900/50 flex items-center gap-2">
                    <Printer size={15} />
                    <h3 className="font-semibold text-sm">Reprint History</h3>
                    <span className="ml-auto badge-blue text-xs">{detailData.printCount || 0}</span>
                  </div>
                  <div className="max-h-56 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
                    {detailData.printHistory?.length ? detailData.printHistory.slice().reverse().map((p) => (
                      <div key={p._id} className="p-3 text-xs">
                        <div className="flex justify-between gap-3">
                          <span className="font-semibold capitalize">{p.format} print #{p.printCount}</span>
                          <span className="text-gray-400 shrink-0">{new Date(p.printedAt).toLocaleString()}</span>
                        </div>
                        <p className="text-gray-500 mt-1">{p.printedByName || p.printedBy?.name || 'User'} · {p.reason}</p>
                      </div>
                    )) : (
                      <p className="p-4 text-sm text-gray-400">No print activity recorded</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </Modal>

        <Modal isOpen={showEditBill} onClose={() => setShowEditBill(false)} title="Edit Pharmacy Bill" size="full">
          <div className="p-6 space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Add Medicine</label>
                <div className="relative">
                  <input value={medQuery} onChange={(e) => setMedQuery(e.target.value)} className="input-field" placeholder="Search medicine..." />
                  {medResults.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 rounded-xl shadow-lg max-h-56 overflow-y-auto">
                      {medResults.map((m) => (
                        <button key={m._id} type="button" onClick={() => addEditMedicine(m)} className="w-full text-left px-4 py-2.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-sm border-b border-gray-100 dark:border-gray-700 last:border-0">
                          <span className="font-medium">{m.name}</span>
                          <span className="ml-2 text-gray-400">Stock {m.currentStock}</span>
                          <span className="ml-2 text-gray-400">{fmt(m.sellingPrice)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Discount %</label>
                <input type="number" min="0" max="100" value={editDiscount} onChange={(e) => setEditDiscount(e.target.value)} className="input-field" />
              </div>
            </div>

            <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-xl">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900/50 text-xs text-gray-500">
                  <tr>
                    <th className="text-left p-3">Medicine</th>
                    <th className="text-center p-3 w-28">Qty</th>
                    <th className="text-right p-3 w-32">Rate</th>
                    <th className="text-right p-3 w-28">GST %</th>
                    <th className="p-3 w-14"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {editItems.map((item, idx) => (
                    <tr key={item._id || `${item.medicine}-${idx}`}>
                      <td className="p-3">
                        <input value={item.description || item.name || ''} onChange={(e) => updateEditItem(idx, 'description', e.target.value)} className="input-field text-sm" />
                      </td>
                      <td className="p-3">
                        <input type="number" min="1" value={item.quantity} onChange={(e) => updateEditItem(idx, 'quantity', e.target.value)} className="input-field text-sm text-center" />
                      </td>
                      <td className="p-3">
                        <input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(e) => updateEditItem(idx, 'unitPrice', e.target.value)} className="input-field text-sm text-right" />
                      </td>
                      <td className="p-3">
                        <input type="number" min="0" step="0.01" value={item.gstPercent || 0} onChange={(e) => updateEditItem(idx, 'gstPercent', e.target.value)} className="input-field text-sm text-right" />
                      </td>
                      <td className="p-3 text-right">
                        <button type="button" onClick={() => setEditItems((prev) => prev.filter((_, i) => i !== idx))} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg" title="Remove medicine">
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Reason <span className="text-red-500">*</span></label>
              <textarea value={editReason} onChange={(e) => setEditReason(e.target.value)} className="input-field min-h-[90px]" placeholder="Enter the reason for this edit" />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
              <button type="button" onClick={() => setShowEditBill(false)} className="btn-secondary">Cancel</button>
              <button type="button" onClick={saveEditedBill} disabled={updateBillMut.isPending} className="btn-primary">
                {updateBillMut.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </Modal>

        {/* PRINT PREVIEW */}
        {showPrintPreview && !previewLoading && previewData && (
          <InvoicePrint
            bill={previewData}
            onClose={() => setShowPrintPreview(null)}
            onDownloadPdf={(id) => downloadBillPdf(id)}
            onDownloadThermal={(id) => downloadBillPdf(id, true)}
          />
        )}
        {showPrintPreview && previewLoading && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white dark:bg-gray-800 rounded-xl px-8 py-6 text-gray-500">Loading invoice preview...</div>
          </div>
        )}

        {/* PAYMENT MODAL */}
        <Modal isOpen={!!showPayment} onClose={() => setShowPayment(null)} title="Record Payment" size="sm">
          {showPayment && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.target);
                paymentMut.mutate({ id: showPayment._id, amount: Number(fd.get('amount')), mode: fd.get('mode') });
              }}
              className="p-6 space-y-4"
            >
              <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl text-sm">
                <p className="text-gray-400">Outstanding</p>
                <p className="text-2xl font-bold text-red-600">{fmt(showPayment.dueAmount)}</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Amount</label>
                <input name="amount" type="number" min="0.01" step="0.01" defaultValue={showPayment.dueAmount} className="input-field" required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Mode</label>
                <select name="mode" className="input-field" defaultValue="cash">
                  {PAYMENT_MODES.map((m) => <option key={m} value={m} className="capitalize">{m}</option>)}
                </select>
              </div>
              <button type="submit" disabled={paymentMut.isPending} className="btn-primary w-full justify-center">
                {paymentMut.isPending ? 'Saving...' : 'Confirm Payment'}
              </button>
            </form>
          )}
        </Modal>
      </div>
    );
  }