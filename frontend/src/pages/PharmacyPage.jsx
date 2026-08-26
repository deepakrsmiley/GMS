import {
  Plus,
  Package,
  Pill,
  Search,
  Trash2,
  Receipt,
  FileText,
  Truck,
  Pencil,
  Layers,
  SlidersHorizontal,
  Eraser,
  Stethoscope,
  ShoppingCart,
  Settings2,
  ChevronDown,
  ChevronRight,
  FileQuestion,
  Lock,
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useSelector } from "react-redux";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { hasPermission, hasPharmacyPermission } from "../constants/permissions";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import api from "../services/api";
import Modal from "../components/common/Modal";
import MedicineEditRequestModal from "../components/pharmacy/MedicineEditRequestModal";
import DataTable from "../components/common/DataTable";
import PageHeader from "../components/common/PageHeader";
import PharmacyInventoryDashboard from "../components/pharmacy/PharmacyInventoryDashboard";
import DistributorDesk from "../components/pharmacy/DistributorDesk";
import PharmacyCounterSale from "../components/pharmacy/PharmacyCounterSale";
import InvoicePrint from "../components/billing/InvoicePrint";
import OPServiceUsageModal from "../components/op/OPServiceUsageModal";
import {
  flattenMedicineBatchOptions,
  formatBatchExpiry,
} from "../utils/medicineBatches";

const OP_SERVICE_BILL_CATEGORY = {
  Equipment: "Procedure",
  Procedure: "Procedure",
  Nursing: "Nursing",
  Injection: "Procedure",
  Laboratory: "Laboratory",
  Other: "Miscellaneous",
};

const categories = [
  "tablet",
  "capsule",
  "syrup",
  "injection",
  "ointment",
  "drops",
  "inhaler",
  "other",
];
const fmt = (n) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function downloadBillPdf(id, thermal = false, size = "A4") {
  try {
    const endpoint = thermal
      ? `/billing/${id}/thermal`
      : `/billing/${id}/print?size=${encodeURIComponent(size)}`;
    const response = await api.get(endpoint, { responseType: "blob" });
    const blob = new Blob([response.data], { type: "application/pdf" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = thermal
      ? `thermal-${id}.pdf`
      : `invoice-${id}-${size}.pdf`;
    link.click();
    setTimeout(() => window.URL.revokeObjectURL(url), 60000);
  } catch {
    toast.error("Unable to download invoice");
  }
}

function PendingPharmacyPanel({ canDispense, canBillPharmacy }) {
  const qc = useQueryClient();
  const [selectedOpId, setSelectedOpId] = useState("");
  const [medQuery, setMedQuery] = useState("");
  const [medResults, setMedResults] = useState([]);
  const [items, setItems] = useState([]);
  const [discount, setDiscount] = useState(0);
  const [printBill, setPrintBill] = useState(null);
  const [consultationFee, setConsultationFee] = useState("");
  const [consultationGst, setConsultationGst] = useState(0);
  const [showConsultFee, setShowConsultFee] = useState(false);
  const [showServiceModal, setShowServiceModal] = useState(false);

  const { data: pending, isLoading } = useQuery({
    queryKey: ["opPharmacyPending"],
    queryFn: () => api.get("/op/pharmacy-pending").then((r) => r.data.data),
  });

  const selectedOp = useMemo(
    () =>
      (pending || []).find((op) => op._id === selectedOpId) ||
      (pending || [])[0],
    [pending, selectedOpId],
  );

  const { data: visitDetail } = useQuery({
    queryKey: ["op-registration", selectedOp?._id],
    queryFn: () => api.get(`/op/${selectedOp._id}`).then((r) => r.data.data),
    enabled: !!selectedOp?._id,
  });

  const manualCharges = useMemo(() => {
    const usages = visitDetail?.serviceUsages || selectedOp?.serviceUsages || [];
    return usages.filter((u) => u && (Number(u.unitPrice) || 0) >= 0);
  }, [visitDetail, selectedOp]);

  const manualChargesTotal = useMemo(
    () =>
      manualCharges.reduce(
        (sum, u) => sum + (Number(u.quantity) || 1) * (Number(u.unitPrice) || 0),
        0,
      ),
    [manualCharges],
  );

  useEffect(() => {
    if (!selectedOpId && pending?.length) setSelectedOpId(pending[0]._id);
  }, [pending, selectedOpId]);

  // Clear draft prescription when switching patients
  useEffect(() => {
    resetWorkbench();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOpId]);

  useEffect(() => {
    if (medQuery.length >= 2) {
      api
        .get(`/pharmacy/search?q=${encodeURIComponent(medQuery)}`)
        .then((r) => setMedResults(r.data.data || []))
        .catch(() => setMedResults([]));
    } else {
      setMedResults([]);
    }
  }, [medQuery]);

  const addMedicine = (opt) => {
    const med = opt.medicine || opt;
    const batch = opt.batch || null;
    setItems((prev) => [
      ...prev,
      {
        medicine: med._id,
        name: med.name,
        genericName: med.genericName || "",
        dosage: "",
        quantity: 1,
        unitPrice: Number(opt.unitPrice ?? batch?.sellingPrice ?? med.sellingPrice ?? 0),
        mrp: Number(opt.mrp ?? batch?.mrp ?? med.mrp ?? med.sellingPrice ?? 0),
        gstPercent: Number(med.gstPercent || 0),
        available: Number(opt.available ?? batch?.quantity ?? med.currentStock ?? 0),
        batchNumber: opt.batchNumber || batch?.batchNumber || "",
        expiryDate: opt.expiryDate || batch?.expiryDate || null,
      },
    ]);
    setMedQuery("");
    setMedResults([]);
  };

  const updateItem = (index, patch) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  };

  const totals = useMemo(() => {
    const subtotal = items.reduce(
      (sum, item) =>
        sum + Number(item.quantity || 0) * Number(item.unitPrice || 0),
      0,
    );
    const medGst = items.reduce((sum, item) => {
      const line = Number(item.quantity || 0) * Number(item.unitPrice || 0);
      return sum + line * ((Number(item.gstPercent) || 0) / 100);
    }, 0);

    const fee = Number(consultationFee) || 0;
    const feeGst = fee * ((Number(consultationGst) || 0) / 100);
    const feeTotal = fee + feeGst;
    const servicesTotal = manualChargesTotal;

    const discountAmount =
      (subtotal + medGst) * ((Number(discount) || 0) / 100);
    const total = subtotal + medGst - discountAmount + feeTotal + servicesTotal;

    return {
      subtotal,
      medGst,
      discountAmount,
      total,
      fee,
      feeGst,
      feeTotal,
      servicesTotal,
    };
  }, [items, discount, consultationFee, consultationGst, manualChargesTotal]);

  const resetWorkbench = () => {
    setItems([]);
    setDiscount(0);
    setMedQuery("");
    setMedResults([]);
    setConsultationFee("");
    setConsultationGst(0);
    setShowConsultFee(false);
  };

  // Clear draft medicines AND remove patient from pharmacy queue when no bill is needed
  const dismissMut = useMutation({
    mutationFn: () =>
      api.put(`/op/${selectedOp._id}/status`, { status: "consultation_completed" }),
    onSuccess: () => {
      resetWorkbench();
      toast.success("Prescription cleared — patient removed from pharmacy queue");
      qc.invalidateQueries(["opPharmacyPending"]);
      qc.invalidateQueries(["opQueue"]);
      setSelectedOpId("");
    },
    onError: (err) =>
      toast.error(err.response?.data?.message || "Could not clear prescription"),
  });

  const clearPrescription = () => {
    if (!selectedOp) return;
    const name = selectedOp.patient?.name || "this patient";
    const hasDraft = items.length || Number(consultationFee) > 0;
    const msg = hasDraft
      ? `Clear draft items and remove ${name} from the pharmacy queue?\n\nUse this if you do not need to bill for this visit.`
      : `Remove ${name} from the pharmacy queue?\n\nUse this if no medicines / fee are needed.`;
    if (!window.confirm(msg)) return;
    dismissMut.mutate();
  };

  const canSendToBilling = canDispense || canBillPharmacy;

  const billMut = useMutation({
    mutationFn: async () => {
      if (!selectedOp) throw new Error("Select a patient");
      const serviceLines = manualCharges.map((u) => {
        const qty = Number(u.quantity) || 1;
        const unitPrice = Number(u.unitPrice) || 0;
        return {
          category: OP_SERVICE_BILL_CATEGORY[u.category] || "Procedure",
          type: u.category === "Laboratory" ? "lab" : "procedure",
          description: `${u.serviceName} × ${qty}${u.notes ? ` — ${u.notes}` : ""}`,
          name: u.serviceName,
          quantity: qty,
          unitPrice,
          gstPercent: 0,
          gstAmount: 0,
          referenceId: u._id,
          referenceModel: "OPRegistration",
        };
      });

      if (!items.length && !totals.fee && !serviceLines.length) {
        throw new Error("Add medicine, a manual charge, or consultation fee");
      }

      const billItems = [
        ...(totals.fee > 0
          ? [
              {
                category: "Consultation",
                type: "consultation",
                description: `Consultation Fee — Dr. ${selectedOp.doctor?.name || ""}`,
                name: "Consultation Fee",
                quantity: 1,
                unitPrice: totals.fee,
                gstPercent: Number(consultationGst) || 0,
                gstAmount: totals.feeGst,
                referenceId: selectedOp._id,
                referenceModel: "OPRegistration",
              },
            ]
          : []),
        ...serviceLines,
        ...items.map((item) => ({
          category: "Pharmacy",
          type: "medicine",
          description: `${item.genericName || item.name}${item.dosage ? ` - ${item.dosage}` : ""}`,
          name: item.name,
          genericName: item.genericName || "",
          quantity: Number(item.quantity) || 1,
          unitPrice: Number(item.unitPrice) || 0,
          mrp: Number(item.mrp || item.unitPrice) || 0,
          gstPercent: Number(item.gstPercent) || 0,
          medicine: item.medicine,
          referenceId: item.medicine,
          referenceModel: "Medicine",
          batch: item.batchNumber || "",
          batchNumber: item.batchNumber || "",
          expiryDate: item.expiryDate || null,
        })),
      ];

      // Unpaid pharmacy bill — Billing counter collects payment, then patient takes medicine
      const payload = {
        billType: "pharmacy",
        patient: selectedOp.patient?._id,
        doctor: selectedOp.doctor?._id,
        department: selectedOp.department?._id,
        opRegistration: selectedOp._id,
        discount: Number(discount) || 0,
        paidAmount: 0,
        notes: [selectedOp.diagnosis, selectedOp.consultationNotes]
          .filter(Boolean)
          .join("\n"),
        items: billItems,
      };

      const created = await api.post("/billing", payload);
      const billId = created.data.data._id;
      await api.put(`/op/${selectedOp._id}/status`, {
        status: "pharmacy_completed",
      });
      const bill = await api.get(`/billing/${billId}`);
      return { bill: bill.data.data, message: created.data.message, merged: created.data.merged };
    },
    onSuccess: ({ bill, message, merged }) => {
      toast.success(
        message
          || (merged
            ? "Medicines billed separately from the reception consultation receipt"
            : "Medicines saved — sent to Billing for payment"),
      );
      setPrintBill(bill);
      resetWorkbench();
      setSelectedOpId("");
      qc.invalidateQueries(["opPharmacyPending"]);
      qc.invalidateQueries(["op-registration", selectedOp?._id]);
      qc.invalidateQueries(["bills"]);
      qc.invalidateQueries(["billStats"]);
      qc.invalidateQueries(["medicines"]);
      qc.invalidateQueries(["pharmaInventoryDash"]);
    },
    onError: (err) =>
      toast.error(
        err.response?.data?.message || err.message || "Failed to send to billing",
      ),
  });

  if (isLoading) {
    return (
      <div className="corp-card p-12 text-center text-slate-400 text-sm">
        Loading pharmacy queue…
      </div>
    );
  }

  if (!pending?.length) {
    return (
      <div className="corp-card p-12 text-center">
        <Pill size={36} className="mx-auto mb-3 text-slate-300" />
        <p className="font-semibold text-slate-600">No pending OP prescriptions</p>
        <p className="text-xs text-slate-400 mt-1">
          Patients appear here after doctor sends them to pharmacy.
          For return patients buying medicines only (no doctor), use the Counter Sale tab.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 min-h-[70vh]">
      {/* Queue */}
      <aside className="xl:col-span-4 corp-card overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-blue-50 bg-gradient-to-r from-blue-50/60 to-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center">
              <FileText size={15} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Pending pharmacy</h3>
              <p className="text-[10px] text-slate-500">OP visit queue</p>
            </div>
          </div>
          <span className="text-[11px] font-bold text-blue-800 bg-blue-100 border border-blue-200 px-2 py-0.5 rounded-full tabular-nums">
            {pending.length}
          </span>
        </div>
        <div className="divide-y divide-slate-50 overflow-y-auto max-h-[72vh]">
          {pending.map((op) => {
            const active = selectedOp?._id === op._id;
            return (
              <button
                key={op._id}
                type="button"
                onClick={() => setSelectedOpId(op._id)}
                className={`w-full text-left px-4 py-3.5 transition-colors border-l-4 ${
                  active
                    ? "bg-blue-50/80 border-l-blue-600"
                    : "border-l-transparent hover:bg-slate-50"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ${
                    active ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
                  }`}>
                    {(op.patient?.name || "?").charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{op.patient?.name}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      <span className="font-mono font-semibold text-blue-700">{op.patient?.patientId || "—"}</span>
                      {" · "}Token {op.tokenNumber}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                      <Stethoscope size={10} /> Dr. {op.doctor?.name || "N/A"}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Prescription desk */}
      <div className="xl:col-span-8 flex flex-col gap-4">
        <div className="corp-card overflow-hidden">
          <div className="px-5 py-4 border-b border-blue-50 bg-gradient-to-r from-white via-blue-50/30 to-white">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-xl bg-blue-600 text-white font-bold flex items-center justify-center shrink-0">
                  {(selectedOp?.patient?.name || "?").charAt(0)}
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-slate-900 truncate">
                    {selectedOp?.patient?.name}
                  </h2>
                  <p className="text-xs text-slate-500">
                    <span className="font-mono font-semibold text-blue-700">{selectedOp?.patient?.patientId || "—"}</span>
                    {" · "}
                    {selectedOp?.patient?.age || "—"} / {selectedOp?.patient?.gender || "—"}
                    {" · "}
                    {selectedOp?.patient?.phone || "—"}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <span className="text-[11px] font-semibold text-blue-800 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-full">
                  Token {selectedOp?.tokenNumber}
                </span>
                <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full">
                  Sent to pharmacy
                </span>
                <button
                  type="button"
                  onClick={clearPrescription}
                  disabled={dismissMut.isPending || !selectedOp}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-50"
                  title="Clear prescription and remove from queue if no medicines needed"
                >
                  <Eraser size={14} />
                  {dismissMut.isPending ? "Clearing…" : "Clear prescription"}
                </button>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-2.5 mt-4">
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-0.5">Diagnosis</p>
                <p className="text-sm text-slate-800">{visitDetail?.diagnosis || selectedOp?.diagnosis || "Not recorded"}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-0.5">Clinical notes</p>
                <p className="text-sm text-slate-800 whitespace-pre-wrap line-clamp-3">
                  {visitDetail?.consultationNotes || selectedOp?.consultationNotes || "Not recorded"}
                </p>
              </div>
            </div>
          </div>

          <div className="px-5 py-2.5 bg-slate-50 border-b border-blue-50 text-[11px] text-slate-500 flex items-center gap-2">
            <Receipt size={12} className="text-blue-600 shrink-0" />
            Add medicines and any extra charges here. Consultation fee is collected at reception.
          </div>

          <div className="px-5 py-4 border-b border-blue-50 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <Settings2 size={15} className="text-blue-600" />
                Manual charges
              </h3>
              <button
                type="button"
                disabled={!selectedOp}
                onClick={() => setShowServiceModal(true)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <Plus size={14} /> Add charge
              </button>
            </div>
            {manualCharges.length === 0 ? (
              <p className="text-sm text-slate-500">
                No extra charges yet. Add procedure, lab, machine, nursing, injection, or any other amount.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {manualCharges.map((u) => (
                  <li key={u._id} className="flex items-center justify-between gap-3 text-sm text-slate-800 rounded-lg border border-slate-100 px-3 py-2">
                    <span>
                      <span className="text-[10px] uppercase tracking-wide text-slate-400 mr-1.5">{u.category || "Other"}</span>
                      <span className="font-medium">{u.serviceName}</span>
                      {u.quantity > 1 && <span className="text-slate-400 text-xs"> × {u.quantity}</span>}
                    </span>
                    <span className="text-xs font-semibold text-blue-700 tabular-nums shrink-0">
                      {fmt((Number(u.quantity) || 1) * (Number(u.unitPrice) || 0))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Consultation fee */}
          <div className="border-b border-blue-50">
            <div className="flex items-center justify-between px-5 py-3 bg-blue-50/50">
              <span className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <Stethoscope size={15} className="text-blue-600" /> Doctor Consultation Fee
              </span>
              <button
                type="button"
                onClick={() => setShowConsultFee((v) => !v)}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700"
              >
                {showConsultFee ? "Hide" : "+ Add Fee"}
              </button>
            </div>

            {showConsultFee && (
              <div className="px-5 py-4 space-y-3">
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">
                      Consultation Fee (₹)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={consultationFee}
                      onChange={(e) => setConsultationFee(e.target.value)}
                      className="input-field text-sm"
                      placeholder="e.g. 500.00"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">
                      GST on Fee (%)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={consultationGst}
                      onChange={(e) => setConsultationGst(e.target.value)}
                      className="input-field text-sm"
                      placeholder="0"
                    />
                  </div>
                </div>
                {totals.fee > 0 && (
                  <div className="flex items-center justify-between rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-2.5 text-sm">
                    <span className="text-slate-600">
                      Dr. {selectedOp?.doctor?.name || "—"}
                      {totals.feeGst > 0 && ` · GST ${fmt(totals.feeGst)}`}
                    </span>
                    <span className="font-bold text-blue-700 tabular-nums">
                      {fmt(totals.feeTotal)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {!showConsultFee && totals.fee > 0 && (
              <div className="px-5 py-2.5 text-sm text-slate-600 flex items-center justify-between bg-blue-50/30">
                <span>Consultation fee added</span>
                <span className="font-semibold text-blue-700 tabular-nums">{fmt(totals.feeTotal)}</span>
              </div>
            )}
          </div>

          {/* Medicines */}
          <div className="p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                  <Pill size={15} className="text-blue-600" /> Prescription medicines
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {items.length} item(s) · search inventory to add
                </p>
              </div>
              <button
                type="button"
                onClick={clearPrescription}
                disabled={dismissMut.isPending || !selectedOp}
                className="btn-secondary text-xs py-2 disabled:opacity-40"
                title="Clear medicines and remove patient from pharmacy queue"
              >
                <Eraser size={14} /> Clear prescription
              </button>
            </div>

            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={medQuery}
                onChange={(e) => setMedQuery(e.target.value)}
                className="input-field pl-9 text-sm"
                placeholder="Search medicine by drug / medicine name…"
              />
              {medResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 border border-blue-100 rounded-xl shadow-xl overflow-hidden z-20 bg-white max-h-72 overflow-y-auto">
                  {flattenMedicineBatchOptions(medResults).map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => addMedicine(opt)}
                      className="w-full text-left px-4 py-2.5 hover:bg-blue-50 text-sm border-b border-slate-50 last:border-0 flex justify-between items-center gap-3"
                    >
                      <div className="min-w-0">
                        <span className="font-medium text-slate-800">{opt.medicine.name}</span>
                        {opt.medicine.genericName && (
                          <span className="text-slate-500 ml-2 text-xs">{opt.medicine.genericName}</span>
                        )}
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {opt.batchNumber ? `Batch ${opt.batchNumber}` : "No batch"}
                          {opt.expiryDate ? ` · Exp ${formatBatchExpiry(opt.expiryDate)}` : ""}
                          {` · Stock ${opt.available}`}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-semibold text-blue-700 tabular-nums">{fmt(opt.unitPrice)}</p>
                        {opt.mrp ? (
                          <p className="text-[10px] text-slate-400">MRP {fmt(opt.mrp)}</p>
                        ) : null}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {items.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-12 text-center">
                <Pill size={28} className="mx-auto mb-2 text-slate-300" />
                <p className="text-sm font-medium text-slate-500">No medicines added</p>
                <p className="text-xs text-slate-400 mt-1">Search above to build the prescription</p>
              </div>
            ) : (
              <div className="corp-card overflow-hidden border border-blue-50">
                <div className="hidden sm:grid grid-cols-12 gap-2 px-3 py-2 bg-slate-50 border-b border-blue-50 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  <span className="col-span-4">Medicine</span>
                  <span className="col-span-2">Dosage</span>
                  <span className="col-span-1">Qty</span>
                  <span className="col-span-2">Price</span>
                  <span className="col-span-2">GST %</span>
                  <span className="col-span-1" />
                </div>
                <div className="divide-y divide-slate-50">
                  {items.map((item, index) => (
                    <div
                      key={`${item.medicine}-${index}`}
                      className="grid grid-cols-12 gap-2 items-center px-3 py-2.5 hover:bg-blue-50/30"
                    >
                      <div className="col-span-12 sm:col-span-4">
                        <p className="text-[10px] text-slate-400 sm:hidden mb-0.5">Medicine</p>
                        <input
                          value={item.genericName || item.name}
                          onChange={(e) => updateItem(index, { genericName: e.target.value })}
                          className="input-field text-sm py-1.5"
                        />
                        {item.name && item.genericName && item.name !== item.genericName && (
                          <p className="text-[10px] text-slate-400 mt-0.5">Drug: {item.name}</p>
                        )}
                        {(item.batchNumber || item.expiryDate) && (
                          <p className="text-[10px] text-blue-600 mt-0.5">
                            {item.batchNumber ? `Batch ${item.batchNumber}` : ""}
                            {item.expiryDate
                              ? `${item.batchNumber ? " · " : ""}Exp ${formatBatchExpiry(item.expiryDate)}`
                              : ""}
                          </p>
                        )}
                        {item.available != null && (
                          <p className="text-[10px] text-slate-400 mt-0.5">Stock {item.available}</p>
                        )}
                      </div>
                      <div className="col-span-6 sm:col-span-2">
                        <p className="text-[10px] text-slate-400 sm:hidden mb-0.5">Dosage</p>
                        <input
                          value={item.dosage}
                          onChange={(e) => updateItem(index, { dosage: e.target.value })}
                          className="input-field text-sm py-1.5"
                          placeholder="1-0-1"
                        />
                      </div>
                      <div className="col-span-3 sm:col-span-1">
                        <p className="text-[10px] text-slate-400 sm:hidden mb-0.5">Qty</p>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateItem(index, { quantity: e.target.value })}
                          className="input-field text-sm py-1.5"
                        />
                      </div>
                      <div className="col-span-3 sm:col-span-2">
                        <p className="text-[10px] text-slate-400 sm:hidden mb-0.5">Price</p>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unitPrice}
                          onChange={(e) => updateItem(index, { unitPrice: e.target.value })}
                          className="input-field text-sm py-1.5"
                        />
                      </div>
                      <div className="col-span-9 sm:col-span-2">
                        <p className="text-[10px] text-slate-400 sm:hidden mb-0.5">GST %</p>
                        <input
                          type="number"
                          min="0"
                          value={item.gstPercent}
                          onChange={(e) => updateItem(index, { gstPercent: e.target.value })}
                          className="input-field text-sm py-1.5"
                        />
                      </div>
                      <div className="col-span-3 sm:col-span-1 flex justify-end">
                        <button
                          type="button"
                          onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                          className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg"
                          title="Remove medicine"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Settlement footer */}
          <div className="px-5 py-4 border-t border-blue-100 bg-slate-50/80">
            <div className="grid sm:grid-cols-3 gap-3 mb-3">
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">Discount % (medicines)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  className="input-field text-sm"
                />
              </div>
              <div className="corp-card p-3 border-l-4 border-l-slate-300">
                <p className="text-[10px] uppercase text-slate-400">Medicines + GST</p>
                <p className="text-sm font-semibold text-slate-700 tabular-nums">
                  {fmt(totals.subtotal + totals.medGst - totals.discountAmount)}
                </p>
              </div>
              <div className="corp-card p-3 border-l-4 border-l-blue-600">
                <p className="text-[10px] uppercase text-slate-400">Bill total (unpaid)</p>
                <p className="text-xl font-bold text-blue-700 tabular-nums">{fmt(totals.total)}</p>
              </div>
            </div>
            <div className="text-[11px] text-slate-400 mb-3 space-y-0.5">
              {totals.fee > 0 && (
                <p>
                  Consult Fee: {fmt(totals.fee)}
                  {totals.feeGst > 0 && ` + GST ${fmt(totals.feeGst)}`} = {fmt(totals.feeTotal)}
                </p>
              )}
              {totals.servicesTotal > 0 && (
                <p>Manual charges: {fmt(totals.servicesTotal)}</p>
              )}
              <p>
                Medicines: Subtotal {fmt(totals.subtotal)} + GST {fmt(totals.medGst)} − Discount{" "}
                {fmt(totals.discountAmount)}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <button
                type="button"
                onClick={clearPrescription}
                disabled={dismissMut.isPending || !selectedOp}
                className="btn-secondary justify-center disabled:opacity-40 order-2 sm:order-1"
              >
                <Eraser size={15} /> Clear prescription
              </button>
              <button
                type="button"
                onClick={() => billMut.mutate()}
                disabled={
                  !canSendToBilling ||
                  billMut.isPending ||
                  (!items.length && !totals.fee && !manualCharges.length)
                }
                className="btn-primary justify-center disabled:opacity-50 order-1 sm:order-2 min-w-[200px]"
                title={
                  canSendToBilling
                    ? undefined
                    : "You need Dispense prescription or Create billing permission"
                }
              >
                <Receipt size={16} />
                {billMut.isPending ? "Sending…" : "Save & send to billing"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <OPServiceUsageModal
        registration={selectedOp}
        isOpen={showServiceModal}
        onClose={() => {
          setShowServiceModal(false);
          if (selectedOp?._id) {
            qc.invalidateQueries(["op-registration", selectedOp._id]);
            qc.invalidateQueries(["opPharmacyPending"]);
          }
        }}
      />

      {printBill && (
        <InvoicePrint
          bill={printBill}
          onClose={() => setPrintBill(null)}
          onDownloadPdf={(id) => downloadBillPdf(id, false, "A4")}
          onDownloadPdfA5={(id) => downloadBillPdf(id, false, "A5")}
          onDownloadThermal={(id) => downloadBillPdf(id, true)}
        />
      )}
    </div>
  );
}

export default function PharmacyPage({ masterMode = false, forcedTab = null }) {
  const [searchParams] = useSearchParams();
  const { user } = useSelector((s) => s.auth);
  // Super Admin grants these on Staff → Feature permissions
  const canViewPharmacy = hasPermission(user, "VIEW_PHARMACY") || hasPermission(user, "MANAGE_PHARMACY");
  const canCreateMedicine = hasPharmacyPermission(user, "CREATE_MEDICINE");
  const canEditMedicine = hasPharmacyPermission(user, "EDIT_MEDICINE");
  const canAddStock = hasPharmacyPermission(user, "ADD_PHARMACY_STOCK");
  const canAdjustStock = hasPharmacyPermission(user, "ADJUST_PHARMACY_STOCK");
  const canEditBatch =
    hasPharmacyPermission(user, "EDIT_PHARMACY_BATCH") || canEditMedicine;
  const canDeleteMedicine = hasPharmacyPermission(user, "DELETE_MEDICINE");
  const canManageSuppliers = hasPharmacyPermission(user, "MANAGE_SUPPLIERS");
  const canManageInventory =
    canCreateMedicine || canEditMedicine || canAddStock || canAdjustStock || canEditBatch || canDeleteMedicine;
  const canDispense = hasPermission(user, "DISPENSE_PRESCRIPTION");
  const canBillPharmacy =
    hasPermission(user, "CREATE_BILLING")
    && (hasPermission(user, "CREATE_PRESCRIPTION") || hasPermission(user, "VIEW_PHARMACY"));
  const canRequestMedicineEdit = hasPermission(user, "CREATE_CHANGE_REQUEST");
  const canViewDashboard = canViewPharmacy || canManageInventory;
  const [page, setPage] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [editMed, setEditMed] = useState(null);
  const [requestEditMed, setRequestEditMed] = useState(null);
  const [requestEditBatchId, setRequestEditBatchId] = useState(null);
  const [showStock, setShowStock] = useState(null);
  // ── NEW: Stock Adjustment (Reduce / Increase) state ─────────────────────
  const [showAdjustStock, setShowAdjustStock] = useState(null);
  const [adjustType, setAdjustType] = useState("reduce"); // 'reduce' or 'increase'
  const [adjustBatchNumber, setAdjustBatchNumber] = useState(""); // which batch to adjust
  // Edit batch in place (expiry / price / qty / batch no)
  const [editBatchCtx, setEditBatchCtx] = useState(null); // { medicine, batch }
  // Expanded medicine rows — show all batches under the SKU
  const [expandedMedIds, setExpandedMedIds] = useState(() => new Set());
  // ─────────────────────────────────────────────────────────────────────────
  const [tab, setTab] = useState(() => {
    if (forcedTab) return forcedTab;
    const urlTab = searchParams.get("tab");
    // Operational pharmacy: prescriptions / counter only (masters live under /masters)
    if (urlTab === "inventory") return "prescriptions";
    if (urlTab === "distributors") return "prescriptions";
    return ["prescriptions", "counter"].includes(urlTab) ? urlTab : "prescriptions";
  });
  const [invSearch, setInvSearch] = useState("");
  const [invSearchInput, setInvSearchInput] = useState("");
  const [stockFilter, setStockFilter] = useState("all"); // all | in | low | out
  const qc = useQueryClient();

  useEffect(() => {
    if (forcedTab) {
      setTab(forcedTab);
      return;
    }
    const urlTab = searchParams.get("tab");
    if (urlTab === "inventory" || urlTab === "distributors") {
      setTab("prescriptions");
      return;
    }
    if (urlTab && ["prescriptions", "counter"].includes(urlTab)) setTab(urlTab);
  }, [searchParams, forcedTab]);

  // Debounce the inventory search box so we don't hit the API on every keystroke
  useEffect(() => {
    const t = setTimeout(() => {
      setInvSearch(invSearchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [invSearchInput]);

  const { data, isLoading } = useQuery({
    queryKey: ["medicines", page, invSearch],
    queryFn: () =>
      api
        .get(
          `/pharmacy?page=${page}&limit=20&sort=name${invSearch ? `&search=${encodeURIComponent(invSearch)}` : ""}`,
        )
        .then((r) => r.data),
    enabled: tab === "inventory" || (masterMode && forcedTab === "inventory"),
  });

  // Pending medicine change requests → lock direct Edit until Super Admin decides
  const { data: medicineLocks = [] } = useQuery({
    queryKey: ["medicine-edit-locks"],
    queryFn: async () => (await api.get("/change-requests/medicine-locks")).data.data || [],
    enabled: tab === "inventory" || (masterMode && forcedTab === "inventory"),
    refetchInterval: 30000,
  });

  const editLockByMedId = useMemo(() => {
    const map = {};
    medicineLocks.forEach((lock) => {
      if (!lock.medicineId) return;
      // Medicine-level lock (no batch) wins for the whole SKU
      if (!lock.batchId) {
        map[lock.medicineId] = lock;
      } else if (!map[lock.medicineId]) {
        // Keep a soft marker so row can show "batch pending" if needed
        map[lock.medicineId] = { ...lock, scope: 'batch-only' };
      }
    });
    return map;
  }, [medicineLocks]);

  const editLockByBatchId = useMemo(() => {
    const map = {};
    medicineLocks.forEach((lock) => {
      if (lock.batchId) map[lock.batchId] = lock;
    });
    return map;
  }, [medicineLocks]);

  const medicineLevelLock = (medicineId) => {
    const lock = editLockByMedId[String(medicineId)];
    if (!lock) return null;
    if (lock.scope === 'batch-only') return null;
    return lock;
  };

  const canBypassEditLock = hasPermission(user, "REVIEW_CHANGE_REQUESTS");

  // Apply the in/low/out-of-stock quick filter on the current page of results
  const filteredMedicines = useMemo(() => {
    const rows = data?.data || [];
    if (stockFilter === "in")
      return rows.filter((r) => r.currentStock > (r.minimumStock || 0));
    if (stockFilter === "low")
      return rows.filter(
        (r) => r.currentStock > 0 && r.currentStock <= (r.minimumStock || 0),
      );
    if (stockFilter === "out") return rows.filter((r) => r.currentStock === 0);
    return rows;
  }, [data, stockFilter]);

  const { register, handleSubmit, reset } = useForm();
  const {
    register: stockReg,
    handleSubmit: stockSubmit,
    reset: stockReset,
  } = useForm();

  // Separate form instance for Adjust Stock modal so its fields/validation
  // never collide with the Add Stock modal's form above.
  const {
    register: adjustReg,
    handleSubmit: adjustSubmit,
    reset: adjustReset,
  } = useForm();

  const {
    register: batchEditReg,
    handleSubmit: batchEditSubmit,
    reset: batchEditReset,
  } = useForm();

  const toDateInput = (d) => {
    if (!d) return "";
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return "";
    return dt.toISOString().slice(0, 10);
  };

  const openAddStock = (r) => {
    setShowStock(r);
    stockReset({
      sellingPrice: r.sellingPrice,
      mrp: r.mrp,
      purchasePrice: r.purchasePrice,
    });
    setExpandedMedIds((prev) => {
      const next = new Set(prev);
      next.add(r._id);
      return next;
    });
  };

  const addMed = useMutation({
    mutationFn: (d) => api.post("/pharmacy", d),
    onSuccess: () => {
      toast.success("Medicine added!");
      qc.invalidateQueries(["medicines"]);
      qc.invalidateQueries(["pharmaInventoryDash"]);
      setShowAdd(false);
      reset();
    },
    onError: (err) => {
      const code = err?.response?.data?.code;
      const existing = err?.response?.data?.data;
      const msg = err?.response?.data?.message || "Could not add medicine";
      if ((code === "MEDICINE_EXISTS" || code === "BARCODE_EXISTS") && existing?._id) {
        toast.error(msg, { duration: 5000 });
        setShowAdd(false);
        reset();
        // Open that medicine and Add Batch — no need to create again
        setInvSearchInput(existing.name || "");
        setInvSearch(existing.name || "");
        setExpandedMedIds((prev) => {
          const next = new Set(prev);
          next.add(existing._id);
          return next;
        });
        openAddStock({
          ...existing,
          sellingPrice: existing.sellingPrice,
          mrp: existing.mrp,
          purchasePrice: existing.purchasePrice,
        });
        return;
      }
      toast.error(msg);
    },
  });

  const updateMed = useMutation({
    mutationFn: ({ id, data: d }) => api.put(`/pharmacy/${id}`, d),
    onSuccess: () => {
      toast.success("Medicine updated!");
      qc.invalidateQueries(["medicines"]);
      qc.invalidateQueries(["pharmaInventoryDash"]);
      qc.invalidateQueries(["medicine-edit-locks"]);
      setEditMed(null);
      reset();
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || "Update failed — edit may be locked by a pending request");
    },
  });

  const deleteMed = useMutation({
    mutationFn: (id) => api.delete(`/pharmacy/${id}`),
    onSuccess: () => {
      toast.success("Medicine deleted!");
      qc.invalidateQueries(["medicines"]);
      qc.invalidateQueries(["pharmaInventoryDash"]);
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || "Delete failed");
    },
  });

  const addStock = useMutation({
    mutationFn: ({ id, data: stockData }) =>
      api.post(`/pharmacy/${id}/stock`, stockData),
    onSuccess: (res, vars) => {
      const merged = res?.data?.merged;
      const msg = res?.data?.message
        || (merged
          ? "Same batch found — quantity increased (no duplicate)"
          : "Batch added under this medicine");
      toast.success(msg);
      qc.invalidateQueries(["medicines"]);
      qc.invalidateQueries(["pharmaInventoryDash"]);
      if (vars?.id) {
        setExpandedMedIds((prev) => {
          const next = new Set(prev);
          next.add(vars.id);
          return next;
        });
      }
      setShowStock(null);
      stockReset();
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || "Could not add batch");
    },
  });

  // ── NEW: Adjust Stock (Reduce / Increase) mutation ─────────────────────────
  const adjustStockMut = useMutation({
    mutationFn: ({ id, data: stockData }) =>
      api.post(`/pharmacy/${id}/adjust-stock`, stockData),
    onSuccess: (res) => {
      toast.success(res?.data?.message || "Stock adjusted successfully!");
      qc.invalidateQueries(["medicines"]);
      qc.invalidateQueries(["pharmaInventoryDash"]);
      setShowAdjustStock(null);
      adjustReset();
      setAdjustType("reduce");
      setAdjustBatchNumber("");
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || "Stock adjustment failed");
    },
  });

  const updateBatchMut = useMutation({
    mutationFn: ({ medicineId, batchId, data: payload }) =>
      api.put(`/pharmacy/${medicineId}/batches/${batchId}`, payload),
    onSuccess: (res) => {
      toast.success(res?.data?.message || "Batch updated");
      qc.invalidateQueries(["medicines"]);
      qc.invalidateQueries(["pharmaInventoryDash"]);
      setEditBatchCtx(null);
      batchEditReset();
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || "Could not update batch");
    },
  });
  // ─────────────────────────────────────────────────────────────────────────

  // Suppliers list (used by medicine form dropdown + Distributor desk shares query key)
  const { data: suppliersData } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => api.get("/suppliers?limit=200").then((r) => r.data),
  });

  const stockStatus = (r) => {
    if (Number(r.currentStock) === 0)
      return { label: "Out of Stock", cls: "bg-red-50 text-red-700 border-red-200" };
    if (Number(r.currentStock) <= Number(r.minimumStock || 0))
      return { label: "Low Stock", cls: "bg-amber-50 text-amber-700 border-amber-200" };
    return { label: "In Stock", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  };

  const nearestExpiry = (r) => {
    const batches = (r.batches || []).filter(
      (b) => !b.isDisposed && Number(b.quantity) > 0 && b.expiryDate,
    );
    if (!batches.length) return null;
    return batches.reduce((soonest, b) =>
      !soonest || new Date(b.expiryDate) < new Date(soonest.expiryDate) ? b : soonest,
    null);
  };

  const activeBatches = (r) =>
    (r.batches || [])
      .filter((b) => !b.isDisposed)
      .slice()
      .sort((a, b) => new Date(a.expiryDate || 0) - new Date(b.expiryDate || 0));

  const openAdjustStock = (medicine, batch = null) => {
    setShowAdjustStock(medicine);
    setAdjustType("reduce");
    adjustReset();
    const batches = activeBatches(medicine).filter((b) => Number(b.quantity) > 0);
    const pick = batch?.batchNumber || batches[0]?.batchNumber || "";
    setAdjustBatchNumber(pick);
  };

  const openEditBatch = (medicine, batch) => {
    setEditBatchCtx({ medicine, batch });
    batchEditReset({
      batchNumber: batch.batchNumber || "",
      expiryDate: toDateInput(batch.expiryDate),
      quantity: Number(batch.quantity) || 0,
      sellingPrice: batch.sellingPrice != null ? batch.sellingPrice : medicine.sellingPrice,
      mrp: batch.mrp != null ? batch.mrp : medicine.mrp,
      purchasePrice: batch.purchasePrice != null ? batch.purchasePrice : medicine.purchasePrice,
      manufacturer: batch.manufacturer || medicine.manufacturer || "",
      supplierInvoice: batch.supplierInvoice || "",
      receivedDate: toDateInput(batch.receivedDate),
      remarks: "",
    });
    setExpandedMedIds((prev) => {
      const next = new Set(prev);
      next.add(medicine._id);
      return next;
    });
  };

  const toggleExpandMed = (id) => {
    setExpandedMedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const fmtBatchDate = (d) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const batchStatus = (b) => {
    const qty = Number(b.quantity) || 0;
    if (qty <= 0) return { label: "Zero", cls: "text-slate-400" };
    if (!b.expiryDate) return { label: "Active", cls: "text-emerald-600" };
    const days = Math.ceil(
      (new Date(b.expiryDate) - new Date()) / (1000 * 60 * 60 * 24),
    );
    if (days < 0) return { label: "Expired", cls: "text-red-600" };
    if (days <= 30) return { label: `${days}d left`, cls: "text-orange-600" };
    return { label: "Active", cls: "text-emerald-600" };
  };

  const renderBatchPanel = (r) => {
    const batches = activeBatches(r);
    if (!batches.length) {
      return (
        <div className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-5 text-center">
          <p className="text-sm text-slate-500">No batches on this medicine yet.</p>
          {canAddStock && (
            <button
              type="button"
              onClick={() => openAddStock(r)}
              className="mt-2 text-xs font-semibold text-blue-600 hover:underline"
            >
              Add first batch
            </button>
          )}
        </div>
      );
    }

    return (
      <div className="rounded-xl border border-blue-100 bg-white overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-3 py-2 bg-blue-50/70 border-b border-blue-100">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-800">
            Batches ({batches.length}) · FEFO (nearest expiry first) · total {r.currentStock} {r.unitOfMeasure || "Nos"}
          </p>
          {canAddStock && (
            <button
              type="button"
              onClick={() => openAddStock(r)}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:text-blue-900"
            >
              <Layers size={12} /> Add batch
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400 uppercase tracking-wide">
                <th className="px-3 py-2 text-left font-semibold">Batch No</th>
                <th className="px-3 py-2 text-left font-semibold">Expiry</th>
                <th className="px-3 py-2 text-right font-semibold">Qty</th>
                <th className="px-3 py-2 text-right font-semibold">Sell</th>
                <th className="px-3 py-2 text-right font-semibold">MRP</th>
                <th className="px-3 py-2 text-right font-semibold">Purchase</th>
                <th className="px-3 py-2 text-left font-semibold">Status</th>
                {(canEditBatch || canAdjustStock || canRequestMedicineEdit) && (
                  <th className="px-3 py-2 text-right font-semibold">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {batches.map((b, i) => {
                const st = batchStatus(b);
                const sell = b.sellingPrice != null ? b.sellingPrice : r.sellingPrice;
                const mrp = b.mrp != null ? b.mrp : r.mrp;
                const purchase = b.purchasePrice != null ? b.purchasePrice : r.purchasePrice;
                const isNearest = i === 0 && Number(b.quantity) > 0;
                return (
                  <tr
                    key={b._id || `${b.batchNumber}-${b.expiryDate}`}
                    className={`hover:bg-slate-50/80 ${isNearest ? "bg-emerald-50/40" : ""}`}
                  >
                    <td className="px-3 py-2 font-mono font-semibold text-slate-800">
                      {b.batchNumber || "—"}
                      {isNearest && (
                        <span className="ml-1.5 text-[9px] font-sans font-bold uppercase tracking-wide text-emerald-700">
                          Sell first
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-slate-700">
                      {fmtBatchDate(b.expiryDate)}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-900">
                      {Number(b.quantity) || 0}{" "}
                      <span className="font-normal text-slate-400">{r.unitOfMeasure || "Nos"}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-blue-700">
                      {sell != null ? fmt(sell) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                      {mrp != null ? fmt(mrp) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                      {purchase != null ? fmt(purchase) : "—"}
                    </td>
                    <td className={`px-3 py-2 font-semibold ${st.cls}`}>{st.label}</td>
                    {(canEditBatch || canAdjustStock || canRequestMedicineEdit) && (
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex items-center gap-2 justify-end">
                          {canEditBatch && (() => {
                            const medLock = medicineLevelLock(r._id);
                            const batchLock = editLockByBatchId[String(b._id)];
                            const lock = medLock || batchLock;
                            const locked = !!lock && !canBypassEditLock;
                            return (
                              <button
                                type="button"
                                disabled={locked}
                                onClick={() => {
                                  if (locked) {
                                    toast.error(`Batch locked — pending ${lock.requestNumber}`);
                                    return;
                                  }
                                  openEditBatch(r, b);
                                }}
                                className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
                                  locked ? "text-slate-400 cursor-not-allowed" : "text-blue-700 hover:underline"
                                }`}
                                title={
                                  locked
                                    ? `Locked by ${lock.requestNumber}`
                                    : `Edit batch ${b.batchNumber}`
                                }
                              >
                                {locked ? <Lock size={12} /> : <Pencil size={12} />} Edit
                              </button>
                            );
                          })()}
                          {canRequestMedicineEdit && (() => {
                            const medLock = medicineLevelLock(r._id);
                            const batchLock = editLockByBatchId[String(b._id)];
                            const locked = !!(medLock || batchLock);
                            return (
                              <button
                                type="button"
                                disabled={locked}
                                onClick={() => {
                                  if (locked) {
                                    toast(`Already pending: ${(medLock || batchLock).requestNumber}`, { icon: "🔒" });
                                    return;
                                  }
                                  setRequestEditBatchId(String(b._id));
                                  setRequestEditMed(r);
                                }}
                                className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
                                  locked ? "text-amber-500 cursor-not-allowed" : "text-indigo-700 hover:underline"
                                }`}
                                title={
                                  locked
                                    ? `Pending ${(medLock || batchLock).requestNumber}`
                                    : `Request change for batch ${b.batchNumber}`
                                }
                              >
                                {locked ? <Lock size={12} /> : <FileQuestion size={12} />} Request
                              </button>
                            );
                          })()}
                          {canAdjustStock && (
                            <button
                              type="button"
                              onClick={() => openAdjustStock(r, b)}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 hover:underline"
                              title={`Adjust batch ${b.batchNumber}`}
                            >
                              <SlidersHorizontal size={12} /> Adjust
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const columns = [
    {
      key: "name",
      header: "Drug / Medicine",
      render: (r) => {
        const batchCount = activeBatches(r).length;
        const expanded = expandedMedIds.has(r._id);
        return (
          <div className="min-w-[180px] flex items-start gap-1.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleExpandMed(r._id);
              }}
              className="mt-0.5 p-0.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50"
              title={expanded ? "Hide batches" : "Show batches"}
            >
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            <div className="min-w-0">
              <p className="font-semibold text-slate-900 dark:text-white text-sm leading-tight">
                {r.name}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {[r.genericName && `Medicine: ${r.genericName}`, r.manufacturer]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </p>
              {batchCount > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleExpandMed(r._id);
                  }}
                  className="mt-1 text-[10px] font-semibold text-blue-600 hover:underline"
                >
                  {batchCount} batch{batchCount === 1 ? "" : "es"} · {expanded ? "hide" : "view"}
                </button>
              )}
            </div>
          </div>
        );
      },
    },
    {
      key: "category",
      header: "Form",
      render: (r) => (
        <span className="inline-flex text-[11px] font-medium capitalize px-2 py-0.5 rounded border border-slate-200 bg-slate-50 text-slate-600">
          {r.category || "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => {
        const s = stockStatus(r);
        return (
          <span className={`inline-flex text-[11px] font-semibold px-2 py-0.5 rounded border ${s.cls}`}>
            {s.label}
          </span>
        );
      },
    },
    {
      key: "currentStock",
      header: "On Hand",
      render: (r) => (
        <div>
          <p className="font-semibold text-slate-900 dark:text-white tabular-nums text-sm">
            {r.currentStock}{" "}
            <span className="text-[11px] font-normal text-slate-400">
              {r.unitOfMeasure || "Nos"}
            </span>
          </p>
          <p className="text-[11px] text-slate-400">Min {r.minimumStock ?? 0}</p>
        </div>
      ),
    },
    {
      key: "expiry",
      header: "Nearest Expiry",
      render: (r) => {
        const b = nearestExpiry(r);
        if (!b) return <span className="text-xs text-slate-400">—</span>;
        const days = Math.ceil(
          (new Date(b.expiryDate) - new Date()) / (1000 * 60 * 60 * 24),
        );
        const urgent = days <= 30;
        const expired = days < 0;
        return (
          <div>
            <p className={`text-xs font-medium tabular-nums ${expired ? "text-red-600" : urgent ? "text-orange-600" : "text-slate-700"}`}>
              {fmtBatchDate(b.expiryDate)}
            </p>
            <p className="text-[11px] text-slate-400">
              {b.batchNumber}
              {expired ? " · Expired" : urgent ? ` · ${days}d left` : ""}
            </p>
          </div>
        );
      },
    },
    {
      key: "sellingPrice",
      header: "Sell / MRP",
      render: (r) => (
        <div>
          <p className="font-semibold text-slate-900 dark:text-white text-sm tabular-nums">
            {fmt(r.sellingPrice)}
          </p>
          <p className="text-[11px] text-slate-400 tabular-nums">
            MRP {r.mrp != null ? fmt(r.mrp) : "—"}
            {r.gstPercent != null ? ` · GST ${r.gstPercent}%` : ""}
          </p>
        </div>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (r) =>
        (canAddStock || canAdjustStock || canEditMedicine || canDeleteMedicine || canViewPharmacy) && (
          <div className="flex items-center gap-1">
            {canAddStock && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openAddStock(r);
                }}
                title="Add new batch (Layers)"
                className="p-1.5 rounded-md text-slate-500 hover:text-blue-700 hover:bg-blue-50 border border-transparent hover:border-blue-100"
              >
                <Layers size={14} />
              </button>
            )}
            {canAdjustStock && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openAdjustStock(r);
                }}
                title="Adjust stock by batch"
                className="p-1.5 rounded-md text-slate-500 hover:text-amber-700 hover:bg-amber-50 border border-transparent hover:border-amber-100"
              >
                <SlidersHorizontal size={14} />
              </button>
            )}
            {canEditMedicine && (() => {
              const lock = medicineLevelLock(r._id);
              const locked = !!lock && !canBypassEditLock;
              return (
                <button
                  type="button"
                  disabled={locked}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (locked) {
                      toast.error(`Edit locked — pending ${lock.requestNumber}. Wait for Super Admin.`);
                      return;
                    }
                    setEditMed(r);
                    reset(r);
                  }}
                  title={
                    locked
                      ? `Locked by pending request ${lock.requestNumber}`
                      : lock && canBypassEditLock
                        ? `Pending ${lock.requestNumber} — Super Admin can still edit`
                        : "Edit medicine master"
                  }
                  className={`p-1.5 rounded-md border border-transparent ${
                    locked
                      ? "text-slate-300 cursor-not-allowed bg-slate-50"
                      : "text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 hover:border-emerald-100"
                  }`}
                >
                  {locked ? <Lock size={14} /> : <Pencil size={14} />}
                </button>
              );
            })()}
            {canRequestMedicineEdit && (() => {
              const medLock = medicineLevelLock(r._id);
              return (
                <button
                  type="button"
                  disabled={!!medLock}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (medLock) {
                      toast(`Already pending: ${medLock.requestNumber}`, { icon: "🔒" });
                      return;
                    }
                    setRequestEditBatchId(null);
                    setRequestEditMed(r);
                  }}
                  title={
                    medLock
                      ? `Request already pending (${medLock.requestNumber}) — edit locked`
                      : "Request medicine or batch edit (Super Admin approval)"
                  }
                  className={`p-1.5 rounded-md border border-transparent ${
                    medLock
                      ? "text-amber-500 bg-amber-50 cursor-not-allowed"
                      : "text-slate-500 hover:text-indigo-700 hover:bg-indigo-50 hover:border-indigo-100"
                  }`}
                >
                  {medLock ? <Lock size={14} /> : <FileQuestion size={14} />}
                </button>
              );
            })()}
            {canDeleteMedicine && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(`Delete "${r.name}"? This cannot be undone.`)) {
                    deleteMed.mutate(r._id);
                  }
                }}
                title="Delete"
                className="p-1.5 rounded-md text-slate-500 hover:text-red-700 hover:bg-red-50 border border-transparent hover:border-red-100"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ),
    },
  ];

  const TABS = masterMode
    ? []
    : [
        { id: "prescriptions", label: "OP Prescriptions", icon: Pill },
        canDispense && {
          id: "counter",
          label: "Counter Sale",
          icon: ShoppingCart,
        },
      ].filter(Boolean);

  return (
    <div className="space-y-5">
      {!masterMode && (
        <PageHeader
          icon={Pill}
          title="Pharmacy"
          subtitle="OP prescriptions and counter medicine sale"
          actions={(
            canViewDashboard ? (
              <Link
                to="/masters/medicines"
                className="btn-secondary text-xs py-2"
              >
                <Package size={14} /> Medicine Master
              </Link>
            ) : null
          )}
        />
      )}

      {masterMode && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white tracking-tight">
              {forcedTab === "distributors" ? "Supplier Master" : "Medicine Master"}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {forcedTab === "distributors"
                ? "Pharmacy distributors and vendor contacts"
                : "SKU register · stock levels · batch expiry"}
            </p>
          </div>
          {forcedTab === "inventory" && canCreateMedicine && (
            <button
              type="button"
              onClick={() => {
                setEditMed(null);
                reset();
                setShowAdd(true);
              }}
              className="btn-primary text-xs py-2"
            >
              <Plus size={14} /> Add Medicine
            </button>
          )}
        </div>
      )}

      {!masterMode && canViewDashboard && (
        <div className="text-xs text-slate-500 border border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-900/40 rounded-sm px-3 py-2">
          Medicine catalog and suppliers are managed in{" "}
          <Link to="/masters/medicines" className="text-blue-700 font-semibold hover:underline">Masters → Medicine Master</Link>
          {" · "}
          <Link to="/masters/suppliers" className="text-blue-700 font-semibold hover:underline">Suppliers</Link>
        </div>
      )}

      {!masterMode && TABS.length > 0 && (
      <div className="corp-tabs">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 corp-tab ${
              tab === id ? "corp-tab-active" : ""
            }`}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>
      )}

      {(!masterMode && tab === "prescriptions") && (
        <PendingPharmacyPanel canDispense={canDispense} canBillPharmacy={canBillPharmacy} />
      )}

      {(!masterMode && tab === "counter" && canDispense) && (
        <PharmacyCounterSale canDispense={canDispense} />
      )}

      {((masterMode && forcedTab === "inventory") || (!masterMode && tab === "inventory")) && canViewDashboard && (
        <PharmacyInventoryDashboard>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-gray-700 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-gray-700 space-y-3">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Medicine Master
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    SKU register · stock levels · nearest batch expiry
                    {data && (
                      <span className="ml-1">
                        · {data.total ?? data.data?.length ?? 0} records
                      </span>
                    )}
                  </p>
                </div>
                <div className="relative w-full lg:w-80">
                  <Search
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="text"
                    value={invSearchInput}
                    onChange={(e) => setInvSearchInput(e.target.value)}
                    placeholder="Search name, generic, barcode…"
                    className="input-field w-full pl-9 text-sm"
                  />
                  {invSearchInput && (
                    <button
                      type="button"
                      onClick={() => setInvSearchInput("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { id: "all", label: "All" },
                  { id: "in", label: "In Stock" },
                  { id: "low", label: "Low Stock" },
                  { id: "out", label: "Out of Stock" },
                ].map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setStockFilter(id)}
                    className={`px-3 py-1 rounded-md text-xs font-semibold border transition-colors ${
                      stockFilter === id
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white dark:bg-gray-800 text-slate-500 border-slate-200 dark:border-gray-600 hover:bg-slate-50"
                    }`}
                  >
                    {label}
                  </button>
                ))}
                {invSearch && (
                  <span className="text-xs text-slate-400 ml-1">
                    Filter: “{invSearch}” · {filteredMedicines.length} shown
                  </span>
                )}
              </div>
            </div>
            <DataTable
              columns={columns}
              data={filteredMedicines}
              loading={isLoading}
              page={page}
              pages={data?.pages || 1}
              onPageChange={setPage}
              isRowExpanded={(r) => expandedMedIds.has(r._id)}
              renderExpandedRow={renderBatchPanel}
            />
            {!isLoading && filteredMedicines.length === 0 && (
              <div className="p-10 text-center">
                <Package size={28} className="mx-auto text-slate-300 mb-2" />
                <p className="text-sm font-medium text-slate-500">
                  No medicines found{invSearch ? ` for “${invSearch}”` : ""}
                </p>
                {canCreateMedicine && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowAdd(true);
                      reset();
                    }}
                    className="mt-3 text-xs font-semibold text-blue-600 hover:underline"
                  >
                    Add first medicine
                  </button>
                )}
              </div>
            )}
          </div>
        </PharmacyInventoryDashboard>
      )}

      {((masterMode && forcedTab === "distributors") || tab === "distributors") && canManageSuppliers && <DistributorDesk />}

      {/* ── Add / Edit Medicine Modal ─────────────────────────────────────── */}
      <Modal
        isOpen={showAdd || !!editMed}
        onClose={() => {
          setShowAdd(false);
          setEditMed(null);
          reset();
        }}
        title={editMed ? `Edit Medicine: ${editMed.name}` : "Add Medicine (once only)"}
        size="lg"
      >
        <form
          onSubmit={handleSubmit((d) => {
            if (editMed) {
              updateMed.mutate({ id: editMed._id, data: d });
              return;
            }

            const {
              initialBatchNumber,
              initialQuantity,
              initialExpiryDate,
              initialReceivedDate,
              ...medicineData
            } = d;

            // Only attach an initial batch if the user actually filled it in.
            if (initialBatchNumber && initialQuantity && initialExpiryDate) {
              if (new Date(initialExpiryDate) < new Date()) {
                toast.error("Expiry date cannot be in the past");
                return;
              }
              medicineData.batches = [
                {
                  batchNumber: initialBatchNumber,
                  quantity: initialQuantity,
                  expiryDate: initialExpiryDate,
                  receivedDate: initialReceivedDate || new Date().toISOString(),
                  purchasePrice: medicineData.purchasePrice,
                  sellingPrice: medicineData.sellingPrice,
                  mrp: medicineData.mrp,
                },
              ];
              medicineData.currentStock = initialQuantity;
            }

            addMed.mutate(medicineData);
          })}
          className="p-6 space-y-4"
        >
          {!editMed && (
            <p className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
              Create the <span className="font-semibold">drug once</span>. For more stock later, use{" "}
              <span className="font-semibold">Layers → Add Batch</span> under the same medicine (10+ batches OK).
              If this name already exists, we&apos;ll open Add Batch instead of duplicating.
            </p>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Drug Name *
              </label>
              <input
                {...register("name", { required: true })}
                className="input-field"
                placeholder="Drug / brand name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Medicine Name
              </label>
              <input
                {...register("genericName")}
                className="input-field"
                placeholder="Medicine name (printed on bill)"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Category</label>
              <select {...register("category")} className="input-field">
                {categories.map((c) => (
                  <option key={c} value={c} className="capitalize">
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Barcode</label>
              <input {...register("barcode")} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Selling Price *
              </label>
              <input
                {...register("sellingPrice", {
                  required: true,
                  valueAsNumber: true,
                })}
                type="number"
                step="0.01"
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Purchase Price
              </label>
              <input
                {...register("purchasePrice", { valueAsNumber: true })}
                type="number"
                step="0.01"
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">GST %</label>
              <input
                {...register("gstPercent", { valueAsNumber: true })}
                type="number"
                defaultValue={5}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Min Stock Level
              </label>
              <input
                {...register("minimumStock", { valueAsNumber: true })}
                type="number"
                defaultValue={10}
                className="input-field"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">
                Manufacturer
              </label>
              <input {...register("manufacturer")} className="input-field" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">
                Supplier/Distributor
              </label>
              <select {...register("supplier")} className="input-field">
                <option value="">-- Select --</option>
                {suppliersData?.data?.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* ── Initial Stock Batch (only when creating a brand-new medicine) ── */}
          {!editMed && (
            <div className="border-t pt-4">
              <p className="text-sm font-semibold mb-3 text-gray-700 dark:text-gray-300">
                Initial Stock Batch (optional)
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Batch Number
                  </label>
                  <input
                    {...register("initialBatchNumber")}
                    className="input-field"
                    placeholder="e.g., BATCH2024001"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Quantity
                  </label>
                  <input
                    {...register("initialQuantity", { valueAsNumber: true })}
                    type="number"
                    min="0"
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Expiry Date
                  </label>
                  <input
                    {...register("initialExpiryDate")}
                    type="date"
                    min={new Date().toISOString().split("T")[0]}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Received Date
                  </label>
                  <input
                    {...register("initialReceivedDate")}
                    type="date"
                    defaultValue={new Date().toISOString().split("T")[0]}
                    className="input-field"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Optional first batch only. Later stock: open this medicine → Layers (Add Batch).
                Same batch number later will increase qty — it will not create a duplicate medicine.
              </p>
            </div>
          )}

          {/* When editing: show batches so staff know stock is adjusted per batch */}
          {editMed && (
            <div className="border border-amber-100 bg-amber-50/60 rounded-lg p-3 space-y-2">
              <p className="text-xs text-amber-900">
                <span className="font-semibold">Edit medicine</span> changes drug name / default prices only.
                To change a batch&apos;s expiry, price or quantity, use{" "}
                <span className="font-semibold">Edit</span> on that batch below.
              </p>
              {activeBatches(editMed).length === 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    const med = editMed;
                    setEditMed(null);
                    openAddStock(med);
                  }}
                  className="text-xs font-semibold text-blue-700 hover:underline"
                >
                  Add first batch
                </button>
              ) : (
                <ul className="space-y-1.5">
                  {activeBatches(editMed).map((b) => (
                    <li
                      key={b._id || b.batchNumber}
                      className="flex items-center justify-between gap-2 text-xs bg-white border border-amber-100 rounded-md px-2.5 py-1.5"
                    >
                      <span>
                        <span className="font-mono font-semibold">{b.batchNumber}</span>
                        <span className="text-slate-500">
                          {" "}· {Number(b.quantity) || 0} {editMed.unitOfMeasure || "Nos"}
                          {" "}· Exp {fmtBatchDate(b.expiryDate)}
                        </span>
                      </span>
                      <span className="shrink-0 inline-flex items-center gap-2">
                        {canEditBatch && (
                          <button
                            type="button"
                            onClick={() => {
                              const med = editMed;
                              setEditMed(null);
                              openEditBatch(med, b);
                            }}
                            className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline"
                          >
                            <Pencil size={12} /> Edit
                          </button>
                        )}
                        {canAdjustStock && (
                          <button
                            type="button"
                            onClick={() => {
                              const med = editMed;
                              setEditMed(null);
                              openAdjustStock(med, b);
                            }}
                            className="inline-flex items-center gap-1 font-semibold text-amber-800 hover:underline"
                          >
                            <SlidersHorizontal size={12} /> Adjust
                          </button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex gap-3 justify-end pt-4 border-t">
            <button
              type="button"
              onClick={() => {
                setShowAdd(false);
                setEditMed(null);
                reset();
              }}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={addMed.isPending || updateMed.isPending}
              className="btn-primary"
            >
              {editMed
                ? updateMed.isPending
                  ? "Saving..."
                  : "Save Changes"
                : addMed.isPending
                  ? "Adding..."
                  : "Add Medicine"}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Add Stock Modal ───────────────────────────────────────────────── */}
      <Modal
        isOpen={!!showStock}
        onClose={() => setShowStock(null)}
        title={`Add Batch: ${showStock?.name}`}
        size="md"
      >
        <form
          onSubmit={stockSubmit((d) =>
            addStock.mutate({ id: showStock._id, data: d }),
          )}
          className="p-6 space-y-4"
        >
          <p className="text-xs text-slate-500 -mt-1">
            Same medicine · enter batch no, expiry, qty and this batch&apos;s prices.
            If the batch no already exists, qty is <span className="font-semibold">added</span> (no duplicate / already-exists error).
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Batch Number *
              </label>
              <input
                {...stockReg("batchNumber", { required: true })}
                className="input-field"
                placeholder="e.g. TB2601947"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Quantity *
              </label>
              <input
                {...stockReg("quantity", {
                  required: true,
                  valueAsNumber: true,
                  min: 1,
                })}
                type="number"
                min="1"
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Expiry Date *
              </label>
              <input
                {...stockReg("expiryDate", { required: true })}
                type="date"
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Selling Price (this batch)
              </label>
              <input
                {...stockReg("sellingPrice", { valueAsNumber: true })}
                type="number"
                step="0.01"
                className="input-field"
                placeholder="Batch sell rate"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                MRP (this batch)
              </label>
              <input
                {...stockReg("mrp", { valueAsNumber: true })}
                type="number"
                step="0.01"
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Purchase Price (this batch)
              </label>
              <input
                {...stockReg("purchasePrice", { valueAsNumber: true })}
                type="number"
                step="0.01"
                className="input-field"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Remarks</label>
              <input
                {...stockReg("remarks")}
                className="input-field"
                placeholder="Optional audit remark"
              />
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-4 border-t">
            <button
              type="button"
              onClick={() => setShowStock(null)}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={addStock.isPending}
              className="btn-primary"
            >
              <Package size={16} />
              {addStock.isPending ? "Saving..." : "Add Batch"}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Adjust Stock Modal — pick batch when 2+ batches ─────────────────── */}
      <Modal
        isOpen={!!showAdjustStock}
        onClose={() => {
          setShowAdjustStock(null);
          setAdjustType("reduce");
          setAdjustBatchNumber("");
          adjustReset();
        }}
        title={`Adjust Stock: ${showAdjustStock?.name}`}
        size="md"
      >
        {showAdjustStock && (() => {
          const batches = activeBatches(showAdjustStock);
          const stocked = batches.filter((b) => Number(b.quantity) > 0);
          const selected = batches.find(
            (b) => String(b.batchNumber) === String(adjustBatchNumber),
          );
          const selectedQty = Number(selected?.quantity) || 0;
          const isNewBatch =
            adjustType === "increase" && adjustBatchNumber === "__NEW__";

          return (
            <form
              onSubmit={adjustSubmit((d) => {
                if (adjustType === "reduce" && stocked.length > 1 && !adjustBatchNumber) {
                  toast.error("Select which batch to reduce");
                  return;
                }
                if (adjustType === "increase" && !adjustBatchNumber) {
                  toast.error("Select a batch or choose New batch");
                  return;
                }
                if (isNewBatch && !d.batchNumber) {
                  toast.error("Enter new batch number");
                  return;
                }
                if (isNewBatch && !d.expiryDate) {
                  toast.error("Expiry date is required for a new batch");
                  return;
                }

                const payload = {
                  ...d,
                  type: adjustType,
                  batchNumber: isNewBatch
                    ? d.batchNumber
                    : adjustBatchNumber || d.batchNumber,
                };
                if (!isNewBatch && selected?.expiryDate && adjustType === "increase") {
                  payload.expiryDate =
                    d.expiryDate
                    || new Date(selected.expiryDate).toISOString().slice(0, 10);
                }

                adjustStockMut.mutate({
                  id: showAdjustStock._id,
                  data: payload,
                });
              })}
              className="p-6 space-y-4"
            >
              <p className="text-xs text-slate-500 -mt-1">
                This medicine has <span className="font-semibold">{batches.length}</span> batch
                {batches.length === 1 ? "" : "es"}. Always choose the batch you want to change.
              </p>

              <div>
                <label className="block text-sm font-medium mb-2">Operation</label>
                <div className="flex gap-4">
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="radio"
                      name="type"
                      value="reduce"
                      checked={adjustType === "reduce"}
                      onChange={(e) => {
                        setAdjustType(e.target.value);
                        if (!adjustBatchNumber && stocked[0]) {
                          setAdjustBatchNumber(stocked[0].batchNumber);
                        }
                        if (adjustBatchNumber === "__NEW__" && stocked[0]) {
                          setAdjustBatchNumber(stocked[0].batchNumber);
                        }
                      }}
                      className="mr-2"
                    />
                    <span className="text-sm">Reduce</span>
                  </label>
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="radio"
                      name="type"
                      value="increase"
                      checked={adjustType === "increase"}
                      onChange={(e) => setAdjustType(e.target.value)}
                      className="mr-2"
                    />
                    <span className="text-sm">Increase</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Select batch *
                </label>
                <select
                  className="input-field font-mono text-sm"
                  value={adjustBatchNumber}
                  onChange={(e) => setAdjustBatchNumber(e.target.value)}
                >
                  <option value="">— Choose batch —</option>
                  {(adjustType === "reduce" ? stocked : batches).map((b) => (
                    <option key={b._id || b.batchNumber} value={b.batchNumber}>
                      {b.batchNumber} · Qty {Number(b.quantity) || 0} · Exp{" "}
                      {fmtBatchDate(b.expiryDate)}
                    </option>
                  ))}
                  {adjustType === "increase" && (
                    <option value="__NEW__">+ New batch number…</option>
                  )}
                </select>
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/40 p-3 rounded-lg space-y-1">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  <span className="font-semibold">Medicine total:</span>{" "}
                  {showAdjustStock.currentStock} {showAdjustStock.unitOfMeasure || "Nos"}
                </p>
                {selected && !isNewBatch && (
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    <span className="font-semibold">Selected batch qty:</span>{" "}
                    <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                      {selectedQty}
                    </span>
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Quantity to {adjustType === "reduce" ? "reduce" : "add"} *
                </label>
                <input
                  {...adjustReg("quantity", {
                    required: "Quantity is required",
                    valueAsNumber: true,
                    min: { value: 1, message: "Quantity must be at least 1" },
                    validate: (val) => {
                      if (adjustType === "reduce" && selected && val > selectedQty) {
                        return `Batch ${selected.batchNumber} has only ${selectedQty}`;
                      }
                      return true;
                    },
                  })}
                  type="number"
                  min="1"
                  className="input-field"
                  placeholder="Enter quantity"
                />
              </div>

              {isNewBatch && (
                <div className="grid grid-cols-2 gap-3 border border-slate-100 rounded-lg p-3">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium mb-1">New batch number *</label>
                    <input
                      {...adjustReg("batchNumber")}
                      className="input-field"
                      placeholder="e.g. TB2601948"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Expiry *</label>
                    <input
                      {...adjustReg("expiryDate")}
                      type="date"
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Purchase price</label>
                    <input
                      {...adjustReg("purchasePrice", { valueAsNumber: true })}
                      type="number"
                      step="0.01"
                      className="input-field"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-1">Remarks</label>
                <textarea
                  {...adjustReg("remarks")}
                  className="input-field"
                  placeholder="Reason (breakage, audit, correction)"
                  rows="2"
                />
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t">
                <button
                  type="button"
                  onClick={() => {
                    setShowAdjustStock(null);
                    setAdjustType("reduce");
                    setAdjustBatchNumber("");
                    adjustReset();
                  }}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adjustStockMut.isPending}
                  className="btn-primary"
                >
                  <Package size={16} />
                  {adjustStockMut.isPending
                    ? "Saving..."
                    : `${adjustType === "reduce" ? "Reduce" : "Increase"} this batch`}
                </button>
              </div>
            </form>
          );
        })()}
      </Modal>
      {/* ── End Adjust Stock Modal ───────────────────────────────────────────── */}

      {/* ── Edit Batch Modal — full batch field correction ───────────────────── */}
      <Modal
        isOpen={!!editBatchCtx}
        onClose={() => {
          setEditBatchCtx(null);
          batchEditReset();
        }}
        title={`Edit Batch: ${editBatchCtx?.batch?.batchNumber || ""} — ${editBatchCtx?.medicine?.name || ""}`}
        size="md"
      >
        {editBatchCtx && (
          <form
            onSubmit={batchEditSubmit((d) => {
              if (!d.batchNumber?.trim()) {
                toast.error("Batch number is required");
                return;
              }
              if (!d.expiryDate) {
                toast.error("Expiry date is required");
                return;
              }
              if (d.quantity === "" || d.quantity == null || Number(d.quantity) < 0) {
                toast.error("Quantity must be zero or greater");
                return;
              }
              updateBatchMut.mutate({
                medicineId: editBatchCtx.medicine._id,
                batchId: editBatchCtx.batch._id,
                data: {
                  batchNumber: d.batchNumber.trim(),
                  expiryDate: d.expiryDate,
                  quantity: Number(d.quantity),
                  sellingPrice: d.sellingPrice === "" || d.sellingPrice == null ? "" : Number(d.sellingPrice),
                  mrp: d.mrp === "" || d.mrp == null ? "" : Number(d.mrp),
                  purchasePrice: d.purchasePrice === "" || d.purchasePrice == null ? "" : Number(d.purchasePrice),
                  manufacturer: d.manufacturer || "",
                  supplierInvoice: d.supplierInvoice || "",
                  receivedDate: d.receivedDate || undefined,
                  remarks: d.remarks || undefined,
                },
              });
            })}
            className="space-y-4 p-1"
          >
            <p className="text-xs text-slate-500">
              Update this batch only. Total stock for the medicine recalculates automatically.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Batch No *</label>
                <input
                  {...batchEditReg("batchNumber", { required: true })}
                  className="input-field font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Expiry Date *</label>
                <input
                  {...batchEditReg("expiryDate", { required: true })}
                  type="date"
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Quantity ({editBatchCtx.medicine.unitOfMeasure || "Nos"}) *
                </label>
                <input
                  {...batchEditReg("quantity", { valueAsNumber: true, required: true })}
                  type="number"
                  min="0"
                  step="1"
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Received Date</label>
                <input
                  {...batchEditReg("receivedDate")}
                  type="date"
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Selling Price</label>
                <input
                  {...batchEditReg("sellingPrice", { valueAsNumber: true })}
                  type="number"
                  step="0.01"
                  min="0"
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">MRP</label>
                <input
                  {...batchEditReg("mrp", { valueAsNumber: true })}
                  type="number"
                  step="0.01"
                  min="0"
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Purchase Price</label>
                <input
                  {...batchEditReg("purchasePrice", { valueAsNumber: true })}
                  type="number"
                  step="0.01"
                  min="0"
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Manufacturer</label>
                <input {...batchEditReg("manufacturer")} className="input-field" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1">Supplier Invoice</label>
                <input {...batchEditReg("supplierInvoice")} className="input-field" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1">Remarks (audit)</label>
                <input
                  {...batchEditReg("remarks")}
                  className="input-field"
                  placeholder="Why this batch was corrected"
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end pt-4 border-t">
              <button
                type="button"
                onClick={() => {
                  setEditBatchCtx(null);
                  batchEditReset();
                }}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={updateBatchMut.isPending}
                className="btn-primary"
              >
                <Pencil size={16} />
                {updateBatchMut.isPending ? "Saving..." : "Save Batch"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <MedicineEditRequestModal
        medicine={requestEditMed}
        initialBatchId={requestEditBatchId}
        isOpen={!!requestEditMed}
        onClose={() => {
          setRequestEditMed(null);
          setRequestEditBatchId(null);
        }}
      />
    </div>
  );
}