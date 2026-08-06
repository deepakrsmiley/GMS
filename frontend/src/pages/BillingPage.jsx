import React, { useState, useEffect, useMemo, useCallback } from 'react';
  import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
  import { useSelector } from 'react-redux';
  import {
    Plus, Printer, Search, Receipt, Pill, X, Eye,
    Stethoscope, FlaskConical, Bed, Package, User,
    RefreshCw, ChevronDown, ChevronUp, Edit3, History, Trash2,
  } from 'lucide-react';
  import toast from 'react-hot-toast';
  import api from '../services/api';
  import Modal from '../components/common/Modal';
  import DataTable from '../components/common/DataTable';
  import InvoicePrint from '../components/billing/InvoicePrint';
  import InvoiceDetailPanel from '../components/billing/InvoiceDetailPanel';
  import {
    flattenMedicineBatchOptions,
    formatBatchExpiry,
  } from '../utils/medicineBatches';
  import '../styles/billing.css';

  const PAYMENT_MODES = ['cash', 'card', 'upi', 'cheque', 'insurance', 'online'];
  const STATUS_CLASS = {
    paid: 'bl-status--paid',
    partial: 'bl-status--partial',
    pending: 'bl-status--pending',
    cancelled: 'bl-status--cancelled',
    draft: 'bl-status--draft',
    refunded: 'bl-status--refunded',
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

  // ── Mirrors backend CATEGORY_TYPE_MAP so manually-added charges get the
  // correct `type` for stock/audit logic without extra round-trips.
  const CATEGORY_TYPE_MAP = {
    Consultation: 'consultation',
    Pharmacy: 'medicine',
    Laboratory: 'lab',
    Admission: 'admission',
    Room: 'room',
    ICU: 'room',
    Procedure: 'procedure',
    Nursing: 'nursing',
    Miscellaneous: 'other',
  };

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
    const [dischargeDetail, setDischargeDetail] = useState(null); // selected IP admission row
    const [dischargeCharges, setDischargeCharges] = useState([]);
    const [dischargeChargeSummary, setDischargeChargeSummary] = useState(null);
    const [loadingDischargeCharges, setLoadingDischargeCharges] = useState(false);
    const [showPrintPreview, setShowPrintPreview] = useState(null);
    const [showEditBill, setShowEditBill] = useState(false);
    const [editItems, setEditItems] = useState([]);
    const [editDiscount, setEditDiscount] = useState(0);
    const [editReason, setEditReason] = useState('');
    const [medQuery, setMedQuery] = useState('');
    const [medResults, setMedResults] = useState([]);
    // ── NEW: manual "Add Charge" form inside the Edit Bill modal, for
    // non-medicine charges (Room, Consultation, Procedure, Nursing, Lab,
    // Admission, ICU, Misc) that IP bills commonly need to add/adjust.
    const [newCharge, setNewCharge] = useState({
      category: 'Miscellaneous', description: '', quantity: 1, unitPrice: '', gstPercent: 0,
    });
    const [showConsultForm, setShowConsultForm] = useState(false);
    const [consultForm, setConsultForm] = useState({ description: 'Consultation Fee', doctorName: '', fee: '', gstPercent: 0 });
    // ── NEW: manual medicine search inside the Create Bill (IP Billing) modal ──
    const [createMedQuery, setCreateMedQuery] = useState('');
    const [createMedResults, setCreateMedResults] = useState([]);
    // Manual lab / room / procedure / nursing / misc lines on Create Bill
    const [createCharge, setCreateCharge] = useState({
      category: 'Laboratory', description: '', quantity: 1, unitPrice: '', gstPercent: 0,
    });
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

    const { data: pendingDischarge, isError: pendingDischargeError, isFetching: pendingDischargeLoading } = useQuery({
      queryKey: ['pendingDischarge'],
      queryFn: () => api.get('/billing/pending-discharge').then((r) => r.data.data || []),
      enabled: showCreate || showDischarge,
      retry: 1,
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
      if (!p?._id) {
        toast.error('Patient record is missing — cannot open bill');
        return;
      }
      setSelectedPatient(p);
      setPatientSearch(`${p.name} (${p.patientId})`);
      setPatients([]);
      loadPatientCharges(p._id);
    };

    const openDischargePatientDetail = async (row) => {
      if (!row?.patient?._id) {
        toast.error('Patient record is missing for this admission');
        return;
      }
      setDischargeDetail(row);
      setLoadingDischargeCharges(true);
      setDischargeCharges([]);
      setDischargeChargeSummary(null);
      try {
        const { data } = await api.get(`/billing/patient/${row.patient._id}/charges?billType=ip`);
        setDischargeCharges(data.data?.charges || []);
        setDischargeChargeSummary(data.data?.summary || null);
      } catch (err) {
        toast.error(err.response?.data?.message || 'Failed to load patient charges');
      } finally {
        setLoadingDischargeCharges(false);
      }
    };

    const closeDischargeModals = () => {
      setShowDischarge(false);
      setDischargeDetail(null);
      setDischargeCharges([]);
      setDischargeChargeSummary(null);
    };

    const billFromDischargeDetail = () => {
      if (!dischargeDetail?.patient?._id) {
        toast.error('Patient record is missing — cannot open bill');
        return;
      }
      selectPatient(dischargeDetail.patient);
      closeDischargeModals();
      setShowCreate(true);
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
      setCreateCharge({ category: 'Laboratory', description: '', quantity: 1, unitPrice: '', gstPercent: 0 });
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
        toast.success('Bill updated');
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

    const downloadBillPdf = async (id, thermal = false, size = 'A4') => {
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
    };

    const openPrintPreview = (id) => {
      setShowDetail(null);
      setShowPrintPreview(id);
    };

    // ── Any non-cancelled bill (OP/IP/Pharmacy/unified) can now be edited by
    // billing-capable roles. Pharmacist stays scoped to pharmacy-only bills
    // (pure pharmacy bills, or IP bills made up entirely of medicine items)
    // to mirror the backend's requirePharmacistBillScope check.
    const canEditBill = (bill) => {
      if (!bill || bill.status === 'cancelled') return false;
      if (user?.role === 'Pharmacist') {
        const isPharmacyScope = bill.billType === 'pharmacy'
          || (bill.billType === 'ip' && bill.items?.every((item) => item.type === 'medicine' || item.category === 'Pharmacy'));
        return isPharmacyScope;
      }
      return ['Super Admin', 'Admin', 'Receptionist', 'Accountant'].includes(user?.role);
    };

    const openEditBill = (bill) => {
      setEditItems((bill.items || []).map((item) => ({ ...item, medicine: item.medicine?._id || item.medicine })));
      setEditDiscount(Number(bill.discount || 0));
      setEditReason('');
      setMedQuery('');
      setMedResults([]);
      setNewCharge({ category: 'Miscellaneous', description: '', quantity: 1, unitPrice: '', gstPercent: 0 });
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

    const addEditMedicine = (opt) => {
      const medicine = opt.medicine || opt;
      const batch = opt.batch || null;
      const batchNumber = opt.batchNumber || batch?.batchNumber || '';
      const unitPrice = Number(opt.unitPrice ?? batch?.sellingPrice ?? medicine.sellingPrice ?? 0);
      setEditItems((prev) => [
        ...prev,
        {
          category: 'Pharmacy',
          type: 'medicine',
          description: medicine.genericName || medicine.name,
          name: medicine.name,
          medicine: medicine._id,
          quantity: 1,
          unitPrice,
          gstPercent: medicine.gstPercent || 0,
          genericName: medicine.genericName || '',
          mrp: Number(opt.mrp ?? batch?.mrp ?? medicine.mrp ?? unitPrice) || 0,
          hsnCode: medicine.hsnCode || '',
          unitOfMeasure: medicine.unitOfMeasure || 'Nos',
          batch: batchNumber,
          batchNumber,
          expiryDate: opt.expiryDate || batch?.expiryDate || null,
          mfgDate: batch?.receivedDate || null,
          discountPercent: 0,
          discountAmount: 0,
        },
      ]);
      setMedQuery('');
      setMedResults([]);
    };

    // ── Add a manual non-medicine charge (Room, Consultation, Procedure,
    // Nursing, Lab, Admission, ICU, Misc) to the bill being edited. ──
    const addEditCharge = () => {
      if (!newCharge.description.trim()) {
        toast.error('Enter a description for the charge');
        return;
      }
      if (!newCharge.unitPrice || Number(newCharge.unitPrice) <= 0) {
        toast.error('Enter a valid rate for the charge');
        return;
      }
      setEditItems((prev) => [
        ...prev,
        {
          category: newCharge.category,
          type: CATEGORY_TYPE_MAP[newCharge.category] || 'other',
          description: newCharge.description.trim(),
          quantity: Number(newCharge.quantity || 1),
          unitPrice: Number(newCharge.unitPrice || 0),
          gstPercent: Number(newCharge.gstPercent || 0),
          discountPercent: 0,
          discountAmount: 0,
        },
      ]);
      setNewCharge({ category: 'Miscellaneous', description: '', quantity: 1, unitPrice: '', gstPercent: 0 });
    };

    const saveEditedBill = () => {
      if (!editReason.trim()) {
        toast.error('Reason is required for bill edits');
        return;
      }
      if (!editItems.length) {
        toast.error('Bill must contain at least one item');
        return;
      }
      updateBillMut.mutate({
        id: detailData._id,
        payload: {
          items: editItems.map((item) => {
            const category = item.category || 'Miscellaneous';
            const type = item.type || CATEGORY_TYPE_MAP[category] || 'other';
            const isMedicine = type === 'medicine';
            return {
              _id: item._id,
              category,
              type,
              description: item.description || item.name,
              name: item.name || item.description,
              medicine: isMedicine ? (item.medicine?._id || item.medicine) : undefined,
              quantity: Number(item.quantity || 0),
              unitPrice: Number(item.unitPrice || 0),
              gstPercent: Number(item.gstPercent || 0),
              batch: isMedicine ? (item.batch || item.batchNumber) : undefined,
              batchNumber: isMedicine ? (item.batchNumber || item.batch) : undefined,
              genericName: isMedicine ? (item.genericName || '') : undefined,
              mrp: isMedicine ? Number(item.mrp || item.unitPrice || 0) : undefined,
              hsnCode: isMedicine ? (item.hsnCode || '') : undefined,
              unitOfMeasure: isMedicine ? (item.unitOfMeasure || 'Nos') : undefined,
              expiryDate: isMedicine ? (item.expiryDate || null) : undefined,
              mfgDate: isMedicine ? (item.mfgDate || null) : undefined,
              discountPercent: Number(item.discountPercent || 0),
              discountAmount: Number(item.discountAmount || 0),
              referenceId: item.referenceId,
              referenceModel: item.referenceModel,
            };
          }),
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

    const addCreateMedicine = (opt) => {
      const medicine = opt.medicine || opt;
      const batch = opt.batch || null;
      const batchNumber = opt.batchNumber || batch?.batchNumber || '';
      const availableStock = Number(opt.available ?? batch?.quantity ?? medicine.currentStock ?? 0);
      if (availableStock <= 0) {
        toast.error('Selected batch is out of stock');
        return;
      }

      const price = Number(opt.unitPrice ?? batch?.sellingPrice ?? medicine.sellingPrice ?? 0);
      const gstPercent = Number(medicine.gstPercent || 0);
      const lineKey = `${medicine._id}:${batchNumber || 'none'}`;

      setCharges((prev) => {
        const existing = prev.find(
          (c) => c.type === 'medicine'
            && (c.medicine === medicine._id || c.referenceId === medicine._id)
            && String(c.batchNumber || c.batch || '') === String(batchNumber),
        );
        if (existing) {
          toast.success('Medicine quantity increased');
          return prev.map((c) => (
            c.id === existing.id
              ? { ...c, quantity: Number(c.quantity || 0) + 1, included: true }
              : c
          ));
        }

        return [...prev, {
          id: `manual-med-${lineKey}-${Date.now()}`,
          category: 'Pharmacy',
          type: 'medicine',
          description: medicine.genericName || medicine.name,
          name: medicine.name,
          quantity: 1,
          unitPrice: price,
          gstPercent,
          gstAmount: price * (gstPercent / 100),
          amount: price * (1 + gstPercent / 100),
          medicine: medicine._id,
          referenceId: medicine._id,
          referenceModel: 'Medicine',
          genericName: medicine.genericName || '',
          mrp: Number(opt.mrp ?? batch?.mrp ?? medicine.mrp ?? price) || 0,
          batch: batchNumber,
          batchNumber,
          expiryDate: opt.expiryDate || batch?.expiryDate || null,
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

    /** Manual lab / room / procedure / nursing / admission / ICU / misc on Create Bill */
    const addCreateCharge = () => {
      if (!createCharge.description.trim()) {
        toast.error('Enter a description for the charge');
        return;
      }
      if (!createCharge.unitPrice || Number(createCharge.unitPrice) <= 0) {
        toast.error('Enter a valid rate for the charge');
        return;
      }
      const quantity = Number(createCharge.quantity || 1);
      const unitPrice = Number(createCharge.unitPrice || 0);
      const gstPercent = Number(createCharge.gstPercent || 0);
      const gstAmount = quantity * unitPrice * (gstPercent / 100);
      setCharges((prev) => [
        ...prev,
        {
          id: `manual-${createCharge.category}-${Date.now()}`,
          category: createCharge.category,
          type: CATEGORY_TYPE_MAP[createCharge.category] || 'other',
          description: createCharge.description.trim(),
          quantity,
          unitPrice,
          gstPercent,
          gstAmount,
          amount: quantity * unitPrice + gstAmount,
          included: true,
        },
      ]);
      setCreateCharge({ category: 'Laboratory', description: '', quantity: 1, unitPrice: '', gstPercent: 0 });
      toast.success(`${createCharge.category} charge added`);
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
          <button type="button" onClick={() => setShowDetail(r._id)} className="bl-inv">
            {r.billNumber}
          </button>
        ),
      },
      {
        key: 'uhid',
        header: 'UHID',
        render: (r) => (
          <span className="bl-uhid" title="Patient ID from registration">
            {r.patient?.patientId || '—'}
          </span>
        ),
      },
      {
        key: 'patient',
        header: 'Patient',
        render: (r) => <p className="bl-patient">{r.patient?.name || '—'}</p>,
      },
      {
        key: 'billType',
        header: 'Type',
        render: (r) => <span className="bl-type">{r.billType || 'unified'}</span>,
      },
      {
        key: 'totalAmount',
        header: 'Total',
        render: (r) => <span className="bl-amt">{fmt(r.totalAmount)}</span>,
      },
      {
        key: 'dueAmount',
        header: 'Due',
        render: (r) => (
          <span className={`bl-due ${r.dueAmount > 0 ? 'bl-due--warn' : 'bl-due--ok'}`}>
            {fmt(r.dueAmount)}
          </span>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        render: (r) => (
          <span className={`bl-status ${STATUS_CLASS[r.status] || 'bl-status--draft'}`}>
            {r.status}
          </span>
        ),
      },
      {
        key: 'actions',
        header: 'Actions',
        render: (r) => (
          <div className="bl-actions">
            <button type="button" onClick={() => setShowDetail(r._id)} title="View" className="bl-icon-btn">
              <Eye size={14} />
            </button>
            <button type="button" onClick={() => openPrintPreview(r._id)} title="Print Preview" className="bl-icon-btn">
              <Printer size={14} />
            </button>
          </div>
        ),
      },
    ];

    return (
      <div className="bl-shell space-y-4">
        <header className="bl-masthead">
          <div>
            <p className="bl-masthead__eyebrow">Finance · Invoicing</p>
            <h1 className="bl-masthead__title">Unified Billing</h1>
            <p className="bl-masthead__meta">OP, IP, Lab, Pharmacy &amp; other consolidated invoices</p>
          </div>
          <div className="bl-masthead__actions">
            <button
              type="button"
              onClick={() => { setDischargeDetail(null); setShowDischarge(true); }}
              className="bl-btn bl-btn--ghost"
            >
              <Bed size={14} /> Pending Discharge
              {pendingDischarge?.length > 0 && (
                <span className="bl-btn__count">{pendingDischarge.length}</span>
              )}
            </button>
            <button
              type="button"
              onClick={() => { resetCreateForm(); setShowCreate(true); }}
              className="bl-btn bl-btn--primary"
            >
              <Plus size={14} /> IP Billing
            </button>
          </div>
        </header>

        {statsData && (
          <div className="bl-kpis">
            <div className="bl-kpi bl-kpi--ok">
              <p className="bl-kpi__label">Today&apos;s Revenue</p>
              <p className="bl-kpi__value">{fmt(statsData.todayRevenue)}</p>
            </div>
            <div className="bl-kpi bl-kpi--accent">
              <p className="bl-kpi__label">Month Revenue</p>
              <p className="bl-kpi__value">{fmt(statsData.monthRevenue)}</p>
            </div>
            <div className="bl-kpi bl-kpi--warn">
              <p className="bl-kpi__label">Pending Bills</p>
              <p className="bl-kpi__value">{statsData.pendingBills}</p>
            </div>
            <div className="bl-kpi">
              <p className="bl-kpi__label">Today&apos;s Bills</p>
              <p className="bl-kpi__value">{statsData.totalBills}</p>
            </div>
          </div>
        )}

        <section className="bl-panel">
          <div className="bl-toolbar">
            <div className="bl-search">
              <Search size={15} />
              <input
                type="search"
                placeholder="Search invoice number…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="bl-select"
            >
              <option value="">All Status</option>
              {['pending', 'partial', 'paid', 'cancelled'].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <p className="bl-toolbar__hint">
              Page {page}{data?.pages ? ` of ${data.pages}` : ''}
            </p>
          </div>
          <div className="bl-table-wrap">
            <DataTable columns={columns} data={data?.data || []} loading={isLoading} page={page} pages={data?.pages || 1} onPageChange={setPage} />
          </div>
        </section>

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
                <div className="text-center py-8 text-gray-400">
                  <Receipt size={40} className="mx-auto mb-3 opacity-30" />
                  <p className="font-medium">No unpaid charges found</p>
                  <p className="text-sm mt-1">Add lab, room, procedure, medicine, or any charge manually below.</p>
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
                          {flattenMedicineBatchOptions(createMedResults).map((opt) => {
                            const alreadyAdded = charges.some(
                              (c) => c.type === 'medicine'
                                && (c.medicine === opt.medicine._id || c.referenceId === opt.medicine._id)
                                && String(c.batchNumber || c.batch || '') === String(opt.batchNumber || ''),
                            );
                            return (
                              <button
                                key={opt.key}
                                type="button"
                                onClick={() => addCreateMedicine(opt)}
                                disabled={opt.available <= 0}
                                className={`w-full text-left px-4 py-3 border-b border-gray-100 dark:border-gray-700 last:border-0 transition-colors ${opt.available <= 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-emerald-50 dark:hover:bg-emerald-900/20'}`}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">{opt.medicine.name}</p>
                                    <p className="text-xs text-gray-500 truncate">
                                      {opt.medicine.genericName || 'Medicine name not set'}
                                      {opt.batchNumber ? ` | Batch ${opt.batchNumber}` : ''}
                                      {opt.expiryDate ? ` | Exp ${formatBatchExpiry(opt.expiryDate)}` : ''}
                                    </p>
                                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${opt.available > 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'}`}>
                                        Stock {opt.available}
                                      </span>
                                      {alreadyAdded && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">Already added</span>}
                                      {opt.medicine.gstPercent ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">GST {opt.medicine.gstPercent}%</span> : null}
                                    </div>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <p className="font-bold text-emerald-700 dark:text-emerald-300">{fmt(opt.unitPrice)}</p>
                                    {opt.mrp ? <p className="text-[10px] text-gray-400">MRP {fmt(opt.mrp)}</p> : null}
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

              {/* Manual charges — Lab, Room, Procedure, Nursing, Admission, ICU, Misc */}
              {selectedPatient && !loadingCharges && (
                <div className="rounded-2xl border border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-950/20 overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-purple-100 dark:border-purple-900/50">
                    <span className="w-8 h-8 rounded-xl bg-purple-600 text-white flex items-center justify-center">
                      <FlaskConical size={16} />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-purple-900 dark:text-purple-200">Add Manual Charge</p>
                      <p className="text-xs text-purple-700/80 dark:text-purple-300/70">
                        Lab tests, room, procedure, nursing, admission, ICU, or miscellaneous — type name and rate.
                      </p>
                    </div>
                  </div>
                  <div className="p-4 bg-white dark:bg-gray-800">
                    <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-end">
                      <div className="col-span-2 sm:col-span-1">
                        <label className="block text-xs text-gray-500 mb-1">Category</label>
                        <select
                          value={createCharge.category}
                          onChange={(e) => setCreateCharge((prev) => ({ ...prev, category: e.target.value }))}
                          className="input-field text-sm"
                        >
                          {Object.keys(CATEGORY_CONFIG).filter((c) => c !== 'Pharmacy').map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-2 sm:col-span-2">
                        <label className="block text-xs text-gray-500 mb-1">Description</label>
                        <input
                          value={createCharge.description}
                          onChange={(e) => setCreateCharge((prev) => ({ ...prev, description: e.target.value }))}
                          className="input-field text-sm"
                          placeholder="e.g. CBC, MRI Brain, Extra nursing"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Qty</label>
                        <input
                          type="number"
                          min="1"
                          value={createCharge.quantity}
                          onChange={(e) => setCreateCharge((prev) => ({ ...prev, quantity: e.target.value }))}
                          className="input-field text-sm text-center"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Rate (₹)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={createCharge.unitPrice}
                          onChange={(e) => setCreateCharge((prev) => ({ ...prev, unitPrice: e.target.value }))}
                          className="input-field text-sm text-right"
                          placeholder="0.00"
                        />
                      </div>
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <label className="block text-xs text-gray-500 mb-1">GST %</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={createCharge.gstPercent}
                            onChange={(e) => setCreateCharge((prev) => ({ ...prev, gstPercent: e.target.value }))}
                            className="input-field text-sm text-right"
                          />
                        </div>
                        <button type="button" onClick={addCreateCharge} className="btn-primary self-end shrink-0" title="Add charge">
                          <Plus size={15} />
                        </button>
                      </div>
                    </div>
                  </div>
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

        {/* PENDING DISCHARGE / ADMITTED PATIENTS MODAL */}
        <Modal
          isOpen={showDischarge}
          onClose={closeDischargeModals}
          title={dischargeDetail ? 'Admission Billing Detail' : 'IP Patients — Pending Billing'}
          size={dischargeDetail ? 'xl' : 'lg'}
        >
          <div className="p-6">
            {dischargeDetail ? (
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() => { setDischargeDetail(null); setDischargeCharges([]); setDischargeChargeSummary(null); }}
                  className="text-sm text-blue-600 hover:underline"
                >
                  ← Back to patient list
                </button>

                <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-gray-900 dark:text-white">
                        {dischargeDetail.patient?.name}
                        <span className="ml-2 text-sm font-normal text-gray-500">{dischargeDetail.patient?.patientId}</span>
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                        {dischargeDetail.admissionNumber}
                        {dischargeDetail.doctor?.name ? ` · Dr. ${dischargeDetail.doctor.name}` : ''}
                        {dischargeDetail.department?.name ? ` · ${dischargeDetail.department.name}` : ''}
                        {dischargeDetail.bed?.bedNumber ? ` · Bed ${dischargeDetail.bed.bedNumber}` : ''}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">
                        Admitted: {dischargeDetail.admissionDate ? new Date(dischargeDetail.admissionDate).toLocaleString('en-IN') : '—'}
                        {dischargeDetail.dischargeDate
                          ? ` → Discharged: ${new Date(dischargeDetail.dischargeDate).toLocaleString('en-IN')}`
                          : ' · Still admitted'}
                        {' · '}{dischargeDetail.stayDays} day(s)
                      </p>
                      {(dischargeDetail.patient?.age != null || dischargeDetail.patient?.gender || dischargeDetail.patient?.phone) && (
                        <p className="text-xs text-gray-400 mt-1">
                          {[
                            dischargeDetail.patient?.age != null ? `Age ${dischargeDetail.patient.age}` : null,
                            dischargeDetail.patient?.gender || null,
                            dischargeDetail.patient?.phone ? `Ph ${dischargeDetail.patient.phone}` : null,
                          ].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                      dischargeDetail.admissionStatus === 'admitted'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}>
                      {dischargeDetail.admissionStatus === 'admitted' ? 'Admitted' : 'Discharged — pending bill'}
                    </span>
                  </div>
                </div>

                {loadingDischargeCharges ? (
                  <p className="text-center text-gray-400 py-10">Loading full charges…</p>
                ) : !dischargeCharges.length ? (
                  <p className="text-center text-gray-400 py-10">No unbilled charges found for this patient.</p>
                ) : (
                  <>
                    <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-100 dark:bg-gray-800 text-left text-xs uppercase tracking-wide text-gray-500">
                          <tr>
                            <th className="px-3 py-2.5">Category</th>
                            <th className="px-3 py-2.5">Description</th>
                            <th className="px-3 py-2.5 text-center">Qty</th>
                            <th className="px-3 py-2.5 text-right">Rate</th>
                            <th className="px-3 py-2.5 text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dischargeCharges.map((c) => {
                            const line = (Number(c.quantity) || 0) * (Number(c.unitPrice) || 0) + (Number(c.gstAmount) || 0);
                            return (
                              <tr key={c.id} className="border-t border-gray-100 dark:border-gray-700">
                                <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{c.category}</td>
                                <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{c.description}</td>
                                <td className="px-3 py-2 text-center tabular-nums">{c.quantity}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{fmt(c.unitPrice)}</td>
                                <td className="px-3 py-2 text-right tabular-nums font-medium">{fmt(c.amount ?? line)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 px-4 py-3">
                      <div className="text-sm text-gray-600 dark:text-gray-300">
                        {dischargeCharges.length} line item(s)
                        {dischargeChargeSummary?.total != null && (
                          <span className="ml-2 text-xs text-gray-400">(from billing engine)</span>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Exact amount due</p>
                        <p className="text-xl font-semibold text-blue-700 dark:text-blue-300 tabular-nums">
                          {fmt(
                            dischargeChargeSummary?.total
                            ?? dischargeCharges.reduce((s, c) => s + (Number(c.amount) || ((Number(c.quantity) || 0) * (Number(c.unitPrice) || 0) + (Number(c.gstAmount) || 0))), 0)
                          )}
                        </p>
                      </div>
                    </div>
                  </>
                )}

                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                  <button type="button" onClick={billFromDischargeDetail} className="btn-primary flex-1 justify-center">
                    Open IP Billing with these charges
                  </button>
                  <button
                    type="button"
                    onClick={() => { setDischargeDetail(null); setDischargeCharges([]); setDischargeChargeSummary(null); }}
                    className="btn-secondary flex-1 justify-center"
                  >
                    Back
                  </button>
                </div>
              </div>
            ) : pendingDischargeLoading ? (
              <p className="text-center text-gray-400 py-8">Loading admitted / pending patients…</p>
            ) : pendingDischargeError ? (
              <p className="text-center text-red-500 py-8">Could not load patients. Please try again.</p>
            ) : !pendingDischarge?.length ? (
              <p className="text-center text-gray-400 py-8">No admitted or discharged patients pending billing</p>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-gray-500 mb-1">
                  Showing currently admitted patients and discharged patients waiting for bill. Click a patient for full usage and exact amount.
                </p>
                {pendingDischarge.map((d) => (
                  <button
                    key={d.admissionId}
                    type="button"
                    onClick={() => openDischargePatientDetail(d)}
                    className="w-full text-left flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-blue-300 hover:bg-blue-50/40 dark:hover:bg-blue-900/20 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-gray-900 dark:text-white">
                          {d.patient?.name || 'Unknown patient'}
                          <span className="text-gray-400 text-sm ml-1">{d.patient?.patientId || ''}</span>
                        </p>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          d.admissionStatus === 'admitted'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {d.admissionStatus === 'admitted' ? 'Admitted' : 'Discharged'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {d.admissionNumber} · Dr. {d.doctor?.name || '—'} · {d.stayDays} day(s) · Bed {d.bed?.bedNumber || '—'}
                      </p>
                      <p className="text-xs text-gray-400">
                        Admitted: {d.admissionDate ? new Date(d.admissionDate).toLocaleDateString('en-IN') : '—'}
                        {d.dischargeDate
                          ? ` → Discharged: ${new Date(d.dischargeDate).toLocaleDateString('en-IN')}`
                          : ' · In hospital'}
                      </p>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="font-semibold text-blue-600">{fmt(d.estimatedTotal ?? ((d.estimatedRoomCharges || 0) + 500))}</p>
                      <p className="text-xs text-gray-400">Est. · view exact</p>
                      <p className="mt-2 text-xs text-blue-600 font-medium">View details →</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </Modal>

        {/* BILL DETAIL MODAL */}
        <Modal
          isOpen={!!showDetail}
          onClose={() => setShowDetail(null)}
          title="Invoice Details"
          subtitle={detailData?.billNumber ? `Bill ${detailData.billNumber}` : undefined}
          size="xl"
        >
          <InvoiceDetailPanel
            detailData={detailData}
            detailLoading={detailLoading}
            canEditBill={canEditBill}
            onEditBill={openEditBill}
            onPrintPreview={openPrintPreview}
            onDownloadPdf={(id) => downloadBillPdf(id, false, 'A4')}
            onThermalPdf={(id) => downloadBillPdf(id, true)}
            onDownloadPdfA5={(id) => downloadBillPdf(id, false, 'A5')}
            onRecordPayment={setShowPayment}
            onCancelBill={(bill) => {
              if (window.confirm('Cancel this bill?')) cancelMut.mutate(bill._id);
            }}
          />
        </Modal>

        <Modal isOpen={showEditBill} onClose={() => setShowEditBill(false)} title="Edit Bill" size="full">
          <div className="p-6 space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Add Medicine</label>
                <div className="relative">
                  <input value={medQuery} onChange={(e) => setMedQuery(e.target.value)} className="input-field" placeholder="Search medicine..." />
                  {medResults.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 rounded-xl shadow-lg max-h-56 overflow-y-auto">
                      {flattenMedicineBatchOptions(medResults).map((opt) => (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => addEditMedicine(opt)}
                          className="w-full text-left px-4 py-2.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-sm border-b border-gray-100 dark:border-gray-700 last:border-0"
                        >
                          <span className="font-medium">{opt.medicine.name}</span>
                          <span className="ml-2 text-gray-400 text-xs">
                            {opt.batchNumber ? `Batch ${opt.batchNumber}` : ''}
                            {opt.expiryDate ? ` · Exp ${formatBatchExpiry(opt.expiryDate)}` : ''}
                            {` · Stock ${opt.available}`}
                          </span>
                          <span className="ml-2 text-gray-500">{fmt(opt.unitPrice)}</span>
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

            {/* ── Add Charge: manual non-medicine charges (Room, Consultation, Procedure, Nursing, Lab, Admission, ICU, Misc) ── */}
            <div className="p-3 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl">
              <label className="block text-sm font-medium mb-2">Add Charge</label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs text-gray-500 mb-1">Category</label>
                  <select
                    value={newCharge.category}
                    onChange={(e) => setNewCharge((prev) => ({ ...prev, category: e.target.value }))}
                    className="input-field text-sm"
                  >
                    {Object.keys(CATEGORY_CONFIG).filter((c) => c !== 'Pharmacy').map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs text-gray-500 mb-1">Description</label>
                  <input
                    value={newCharge.description}
                    onChange={(e) => setNewCharge((prev) => ({ ...prev, description: e.target.value }))}
                    className="input-field text-sm"
                    placeholder="e.g. ICU Bed Charge"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Qty</label>
                  <input
                    type="number" min="1"
                    value={newCharge.quantity}
                    onChange={(e) => setNewCharge((prev) => ({ ...prev, quantity: e.target.value }))}
                    className="input-field text-sm text-center"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Rate</label>
                  <input
                    type="number" min="0" step="0.01"
                    value={newCharge.unitPrice}
                    onChange={(e) => setNewCharge((prev) => ({ ...prev, unitPrice: e.target.value }))}
                    className="input-field text-sm text-right"
                  />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">GST %</label>
                    <input
                      type="number" min="0" step="0.01"
                      value={newCharge.gstPercent}
                      onChange={(e) => setNewCharge((prev) => ({ ...prev, gstPercent: e.target.value }))}
                      className="input-field text-sm text-right"
                    />
                  </div>
                  <button type="button" onClick={addEditCharge} className="btn-secondary self-end" title="Add charge">
                    <Plus size={15} />
                  </button>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-xl">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900/50 text-xs text-gray-500">
                  <tr>
                    <th className="text-left p-3 w-36">Category</th>
                    <th className="text-left p-3">Description</th>
                    <th className="text-center p-3 w-24">Qty</th>
                    <th className="text-right p-3 w-28">Rate</th>
                    <th className="text-right p-3 w-24">GST %</th>
                    <th className="p-3 w-14"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {editItems.map((item, idx) => {
                    const isMedicine = (item.type || CATEGORY_TYPE_MAP[item.category]) === 'medicine';
                    return (
                      <tr key={item._id || `${item.medicine || item.description}-${idx}`}>
                        <td className="p-3">
                          {isMedicine ? (
                            <span className="text-xs px-2 py-1 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400">Pharmacy</span>
                          ) : (
                            <select
                              value={item.category || 'Miscellaneous'}
                              onChange={(e) => updateEditItem(idx, 'category', e.target.value)}
                              className="input-field text-sm"
                            >
                              {Object.keys(CATEGORY_CONFIG).filter((c) => c !== 'Pharmacy').map((c) => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                          )}
                        </td>
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
                          <button type="button" onClick={() => setEditItems((prev) => prev.filter((_, i) => i !== idx))} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg" title="Remove item">
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
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
            onDownloadPdf={(id) => downloadBillPdf(id, false, 'A4')}
            onDownloadPdfA5={(id) => downloadBillPdf(id, false, 'A5')}
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