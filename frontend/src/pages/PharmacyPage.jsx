import {
  Plus,
  Package,
  Pill,
  Search,
  Trash2,
  Receipt,
  FileText,
  Printer,
  Truck,
  Stethoscope,
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useSelector } from "react-redux";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { hasRole } from "../utils/roles";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import api from "../services/api";
import Modal from "../components/common/Modal";
import DataTable from "../components/common/DataTable";
import PharmacyInventoryDashboard from "../components/pharmacy/PharmacyInventoryDashboard";
import InvoicePrint from "../components/billing/InvoicePrint";
import PharmacyTaxInvoice from "../components/billing/PharmacyTaxInvoice";

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
const paymentModes = ["cash", "card", "upi", "cheque", "insurance", "online"];

const fmt = (n) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function PendingPharmacyPanel({ canDispense }) {
  const qc = useQueryClient();
  const [selectedOpId, setSelectedOpId] = useState("");
  const [medQuery, setMedQuery] = useState("");
  const [medResults, setMedResults] = useState([]);
  const [items, setItems] = useState([]);
  const [discount, setDiscount] = useState(0);
  const [paymentMode, setPaymentMode] = useState("cash");
  const [paidAmount, setPaidAmount] = useState("");
  const [printBill, setPrintBill] = useState(null);

  // ── Consultation fee state ──────────────────────────────────────────────────
  const [consultationFee, setConsultationFee] = useState("");
  const [consultationGst, setConsultationGst] = useState(0);
  const [showConsultFee, setShowConsultFee] = useState(false);
  // ───────────────────────────────────────────────────────────────────────────

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

  useEffect(() => {
    if (!selectedOpId && pending?.length) setSelectedOpId(pending[0]._id);
  }, [pending, selectedOpId]);

  useEffect(() => {
    if (medQuery.length >= 2) {
      api
        .get(`/pharmacy/search?q=${medQuery}`)
        .then((r) => setMedResults(r.data.data || []))
        .catch(() => setMedResults([]));
    } else {
      setMedResults([]);
    }
  }, [medQuery]);

  const addMedicine = (med) => {
    setItems((prev) => [
      ...prev,
      {
        medicine: med._id,
        name: med.name,
        dosage: "",
        quantity: 1,
        unitPrice: Number(med.sellingPrice || 0),
        gstPercent: Number(med.gstPercent || 0),
        available: med.currentStock,
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

  // ── Totals — include consultation fee ──────────────────────────────────────
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

    const discountAmount =
      (subtotal + medGst) * ((Number(discount) || 0) / 100);
    const total = subtotal + medGst - discountAmount + feeTotal;
    const paid = paidAmount === "" ? total : Number(paidAmount || 0);

    return { subtotal, medGst, discountAmount, total, paid, fee, feeGst, feeTotal };
  }, [items, discount, paidAmount, consultationFee, consultationGst]);
  // ───────────────────────────────────────────────────────────────────────────

  const resetWorkbench = () => {
    setItems([]);
    setDiscount(0);
    setPaymentMode("cash");
    setPaidAmount("");
    setMedQuery("");
    setMedResults([]);
    // reset consultation fee too
    setConsultationFee("");
    setConsultationGst(0);
    setShowConsultFee(false);
  };

  const billMut = useMutation({
    mutationFn: async () => {
      if (!selectedOp) throw new Error("Select a patient");
      if (!items.length && !totals.fee)
        throw new Error("Add at least one medicine or a consultation fee");

      // Build bill items — consultation first (if entered), then medicines
      const billItems = [
        // ── Consultation fee item ─────────────────────────────────────────
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
        // ── Medicine items ────────────────────────────────────────────────
        ...items.map((item) => ({
          category: "Pharmacy",
          type: "medicine",
          description: `${item.name}${item.dosage ? ` - ${item.dosage}` : ""}`,
          name: item.name,
          quantity: Number(item.quantity) || 1,
          unitPrice: Number(item.unitPrice) || 0,
          gstPercent: Number(item.gstPercent) || 0,
          medicine: item.medicine,
          referenceId: item.medicine,
          referenceModel: "Medicine",
        })),
      ];

      const payload = {
        billType: "pharmacy",
        patient: selectedOp.patient?._id,
        doctor: selectedOp.doctor?._id,
        department: selectedOp.department?._id,
        opRegistration: selectedOp._id,
        discount: Number(discount) || 0,
        paidAmount: totals.paid,
        paymentMode,
        notes: [selectedOp.diagnosis, selectedOp.consultationNotes]
          .filter(Boolean)
          .join("\n"),
        items: billItems,
      };

      const created = await api.post("/billing", payload);
      await api.put(`/op/${selectedOp._id}/status`, {
        status: "pharmacy_completed",
      });
      const bill = await api.get(`/billing/${created.data.data._id}`);
      return bill.data.data;
    },
    onSuccess: (bill) => {
      toast.success("Pharmacy bill generated");
      setPrintBill(bill);
      resetWorkbench();
      qc.invalidateQueries(["opPharmacyPending"]);
      qc.invalidateQueries(["bills"]);
      qc.invalidateQueries(["billStats"]);
      qc.invalidateQueries(["medicines"]);
      qc.invalidateQueries(["pharmaInventoryDash"]);
    },
    onError: (err) =>
      toast.error(
        err.response?.data?.message || err.message || "Billing failed",
      ),
  });

  if (isLoading)
    return (
      <p className="p-8 text-center text-gray-400">
        Loading pending pharmacy queue...
      </p>
    );

  if (!pending?.length) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-8 text-center text-gray-400">
        No pending OP prescriptions
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
      {/* ── Left: Patient List ─────────────────────────────────────────────── */}
      <div className="xl:col-span-4 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700">
          <h3 className="font-semibold flex items-center gap-2">
            <FileText size={16} /> Pending Pharmacy
          </h3>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-700 max-h-[720px] overflow-y-auto">
          {pending.map((op) => (
            <button
              key={op._id}
              type="button"
              onClick={() => {
                setSelectedOpId(op._id);
                resetWorkbench();
              }}
              className={`w-full text-left p-4 hover:bg-blue-50 dark:hover:bg-blue-900/20 ${selectedOp?._id === op._id ? "bg-blue-50 dark:bg-blue-900/20" : ""}`}
            >
              <p className="font-semibold text-gray-900 dark:text-white">
                {op.patient?.name}
              </p>
              <p className="text-xs text-gray-500">
                {op.patient?.patientId} - Token {op.tokenNumber}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Dr. {op.doctor?.name || "N/A"}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* ── Right: Workbench ───────────────────────────────────────────────── */}
      <div className="xl:col-span-8 space-y-5">

        {/* Patient Info Card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                {selectedOp?.patient?.name}
              </h2>
              <p className="text-sm text-gray-500">
                {selectedOp?.patient?.patientId} -{" "}
                {selectedOp?.patient?.age || "N/A"} /{" "}
                {selectedOp?.patient?.gender || "N/A"} -{" "}
                {selectedOp?.patient?.phone || "N/A"}
              </p>
            </div>
            <span className="badge-blue">Sent To Pharmacy</span>
          </div>
          <div className="grid sm:grid-cols-2 gap-4 mt-4 text-sm">
            <div className="bg-gray-50 dark:bg-gray-900/40 rounded-xl p-3">
              <p className="text-xs font-semibold uppercase text-gray-500 mb-1">
                Diagnosis
              </p>
              <p className="text-gray-900 dark:text-white">
                {selectedOp?.diagnosis || "Not recorded"}
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-900/40 rounded-xl p-3">
              <p className="text-xs font-semibold uppercase text-gray-500 mb-1">
                Clinical Notes
              </p>
              <p className="text-gray-900 dark:text-white whitespace-pre-wrap">
                {selectedOp?.consultationNotes || "Not recorded"}
              </p>
            </div>
          </div>
        </div>

        {/* ── Consultation Fee Section ─────────────────────────────────────── */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-blue-200 dark:border-blue-700 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 bg-blue-50 dark:bg-blue-900/20">
            <span className="font-semibold text-blue-700 dark:text-blue-300 flex items-center gap-2 text-sm">
              <Stethoscope size={16} /> Doctor Consultation Fee
            </span>
            <button
              type="button"
              onClick={() => setShowConsultFee((v) => !v)}
              className="text-xs font-medium text-blue-600 hover:underline"
            >
              {showConsultFee ? "Hide" : "+ Add Fee"}
            </button>
          </div>

          {showConsultFee && (
            <div className="p-5 border-t border-blue-100 dark:border-blue-800 space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Consultation Fee (₹) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={consultationFee}
                    onChange={(e) => setConsultationFee(e.target.value)}
                    className="input-field"
                    placeholder="e.g. 500.00"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    GST on Fee (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={consultationGst}
                    onChange={(e) => setConsultationGst(e.target.value)}
                    className="input-field"
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Fee preview */}
              {totals.fee > 0 && (
                <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-900/30 rounded-xl px-4 py-2 text-sm">
                  <span className="text-gray-600 dark:text-gray-300">
                    Dr. {selectedOp?.doctor?.name || "—"} — Consultation Fee
                    {totals.feeGst > 0 && ` + GST ${fmt(totals.feeGst)}`}
                  </span>
                  <span className="font-bold text-blue-700 dark:text-blue-300">
                    {fmt(totals.feeTotal)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Collapsed summary badge */}
          {!showConsultFee && totals.fee > 0 && (
            <div className="px-5 py-2 text-sm text-blue-700 dark:text-blue-300 bg-blue-50/50 dark:bg-blue-900/10 flex items-center justify-between">
              <span>Consultation fee added</span>
              <span className="font-semibold">{fmt(totals.feeTotal)}</span>
            </div>
          )}
        </div>
        {/* ── End Consultation Fee Section ─────────────────────────────────── */}

        {/* Medicine Search & List */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <Search size={16} /> Add Medicines
          </h3>
          <div className="relative">
            <input
              value={medQuery}
              onChange={(e) => setMedQuery(e.target.value)}
              className="input-field pr-10"
              placeholder="Search medicine by name..."
            />
            {medResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 border border-gray-200 dark:border-gray-600 rounded-xl shadow-xl overflow-hidden z-20 bg-white dark:bg-gray-800 max-h-60 overflow-y-auto">
                {medResults.map((m) => (
                  <button
                    key={m._id}
                    type="button"
                    onClick={() => addMedicine(m)}
                    className="w-full text-left px-4 py-2.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-sm border-b border-gray-100 dark:border-gray-700 last:border-0 flex justify-between items-center"
                  >
                    <div>
                      <span className="font-medium">{m.name}</span>
                      <span className="text-gray-400 ml-2 text-xs capitalize">
                        {m.category}
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-blue-600">
                        {fmt(m.sellingPrice)}
                      </p>
                      <p className="text-xs text-gray-400">
                        Stock: {m.currentStock}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 space-y-2">
            {items.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">
                <Pill size={32} className="mx-auto mb-2 opacity-30" />
                Search and add medicines for this OP patient
              </div>
            ) : (
              items.map((item, index) => (
                <div
                  key={`${item.medicine}-${index}`}
                  className="grid grid-cols-12 gap-2 items-end bg-gray-50 dark:bg-gray-700/40 rounded-xl p-3"
                >
                  <div className="col-span-12 sm:col-span-4">
                    <label className="text-xs text-gray-500">Medicine</label>
                    <input
                      value={item.name}
                      onChange={(e) =>
                        updateItem(index, { name: e.target.value })
                      }
                      className="input-field text-sm mt-1"
                    />
                  </div>
                  <div className="col-span-6 sm:col-span-2">
                    <label className="text-xs text-gray-500">Dosage</label>
                    <input
                      value={item.dosage}
                      onChange={(e) =>
                        updateItem(index, { dosage: e.target.value })
                      }
                      className="input-field text-sm mt-1"
                      placeholder="1-0-1"
                    />
                  </div>
                  <div className="col-span-3 sm:col-span-2">
                    <label className="text-xs text-gray-500">Qty</label>
                    <input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) =>
                        updateItem(index, { quantity: e.target.value })
                      }
                      className="input-field text-sm mt-1"
                    />
                  </div>
                  <div className="col-span-3 sm:col-span-2">
                    <label className="text-xs text-gray-500">Price</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.unitPrice}
                      onChange={(e) =>
                        updateItem(index, { unitPrice: e.target.value })
                      }
                      className="input-field text-sm mt-1"
                    />
                  </div>
                  <div className="col-span-10 sm:col-span-1">
                    <label className="text-xs text-gray-500">GST %</label>
                    <input
                      type="number"
                      min="0"
                      value={item.gstPercent}
                      onChange={(e) =>
                        updateItem(index, { gstPercent: e.target.value })
                      }
                      className="input-field text-sm mt-1"
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1 flex justify-end">
                    <button
                      type="button"
                      onClick={() =>
                        setItems((prev) => prev.filter((_, i) => i !== index))
                      }
                      className="text-red-500 p-2"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Payment & Totals */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Discount (%) — on medicines
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Payment Mode
              </label>
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
                className="input-field"
              >
                {paymentModes.map((mode) => (
                  <option key={mode} value={mode} className="capitalize">
                    {mode}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Amount Received
              </label>
              <input
                type="number"
                min="0"
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
                placeholder={totals.total.toFixed(2)}
                className="input-field"
              />
            </div>
            <div className="bg-gray-50 dark:bg-gray-900/40 rounded-xl px-4 py-3">
              <p className="text-xs text-gray-500">Grand Total</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">
                {fmt(totals.total)}
              </p>
            </div>
          </div>

          {/* Breakdown line */}
          <div className="mt-3 text-xs text-gray-500 space-y-0.5">
            {totals.fee > 0 && (
              <p>
                <span className="font-medium text-blue-600">Consult Fee:</span>{" "}
                {fmt(totals.fee)}
                {totals.feeGst > 0 && ` + GST ${fmt(totals.feeGst)}`} ={" "}
                {fmt(totals.feeTotal)}
              </p>
            )}
            <p>
              Medicines: Subtotal {fmt(totals.subtotal)} + GST{" "}
              {fmt(totals.medGst)} − Discount {fmt(totals.discountAmount)}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
            <p className="text-sm text-gray-500">
              {totals.fee > 0
                ? `Consult ${fmt(totals.feeTotal)} + Pharmacy ${fmt(
                    totals.subtotal + totals.medGst - totals.discountAmount,
                  )} = ${fmt(totals.total)}`
                : `Subtotal ${fmt(totals.subtotal)} + GST ${fmt(
                    totals.medGst,
                  )} − Discount ${fmt(totals.discountAmount)}`}
            </p>
            <button
              type="button"
              onClick={() => billMut.mutate()}
              disabled={
                !canDispense ||
                billMut.isPending ||
                (!items.length && !totals.fee)
              }
              className="btn-primary justify-center disabled:opacity-50"
            >
              <Receipt size={16} />{" "}
              {billMut.isPending ? "Generating..." : "Generate Bill & Print"}
            </button>
          </div>
        </div>
      </div>

      {printBill && (
        <PharmacyTaxInvoice
          bill={printBill}
          onClose={() => setPrintBill(null)}
        />
      )}
    </div>
  );
}

export default function PharmacyPage() {
  const [searchParams] = useSearchParams();
  const { user } = useSelector((s) => s.auth);
  const canManageInventory = hasRole(user?.role, ["Super Admin", "Pharmacist"]);
  const canDispense = hasRole(user?.role, [
    "Super Admin",
    "Admin",
    "Pharmacist",
  ]);
  const canViewDashboard = hasRole(user?.role, [
    "Super Admin",
    "Admin",
    "Pharmacist",
  ]);
  const [page, setPage] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [editMed, setEditMed] = useState(null);
  const [showStock, setShowStock] = useState(null);
  // ── NEW: Stock Adjustment (Reduce / Increase) state ─────────────────────
  const [showAdjustStock, setShowAdjustStock] = useState(null);
  const [adjustType, setAdjustType] = useState("reduce"); // 'reduce' or 'increase'
  // ─────────────────────────────────────────────────────────────────────────
  const [tab, setTab] = useState(
    searchParams.get("tab") === "inventory" ? "inventory" : "prescriptions",
  );
  const [invSearch, setInvSearch] = useState("");
  const [invSearchInput, setInvSearchInput] = useState("");
  const [stockFilter, setStockFilter] = useState("all"); // all | in | low | out
  const qc = useQueryClient();

  useEffect(() => {
    const urlTab = searchParams.get("tab");
    if (urlTab && ["inventory", "prescriptions"].includes(urlTab))
      setTab(urlTab);
  }, [searchParams]);

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
          `/pharmacy?page=${page}&limit=20${invSearch ? `&search=${encodeURIComponent(invSearch)}` : ""}`,
        )
        .then((r) => r.data),
    enabled: tab === "inventory",
  });

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

  const addMed = useMutation({
    mutationFn: (d) => api.post("/pharmacy", d),
    onSuccess: () => {
      toast.success("Medicine added!");
      qc.invalidateQueries(["medicines"]);
      qc.invalidateQueries(["pharmaInventoryDash"]);
      setShowAdd(false);
      reset();
    },
  });

  const updateMed = useMutation({
    mutationFn: ({ id, data: d }) => api.put(`/pharmacy/${id}`, d),
    onSuccess: () => {
      toast.success("Medicine updated!");
      qc.invalidateQueries(["medicines"]);
      qc.invalidateQueries(["pharmaInventoryDash"]);
      setEditMed(null);
      reset();
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
    onSuccess: () => {
      toast.success("Stock updated!");
      qc.invalidateQueries(["medicines"]);
      qc.invalidateQueries(["pharmaInventoryDash"]);
      setShowStock(null);
      stockReset();
    },
  });

  // ── NEW: Adjust Stock (Reduce / Increase) mutation ─────────────────────────
  const adjustStockMut = useMutation({
    mutationFn: ({ id, data: stockData }) =>
      api.post(`/pharmacy/${id}/adjust-stock`, stockData),
    onSuccess: () => {
      toast.success("Stock adjusted successfully!");
      qc.invalidateQueries(["medicines"]);
      qc.invalidateQueries(["pharmaInventoryDash"]);
      setShowAdjustStock(null);
      adjustReset();
      setAdjustType("reduce");
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || "Stock adjustment failed");
    },
  });
  // ─────────────────────────────────────────────────────────────────────────

  // ---- Distributors / Suppliers ----
  const { data: suppliersData, isLoading: suppliersLoading } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => api.get("/suppliers?limit=100").then((r) => r.data),
  });

  const {
    register: supReg,
    handleSubmit: supSubmit,
    reset: supReset,
  } = useForm();
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [editSupplier, setEditSupplier] = useState(null);

  const addSupplier = useMutation({
    mutationFn: (d) => api.post("/suppliers", d),
    onSuccess: () => {
      toast.success("Distributor added!");
      qc.invalidateQueries(["suppliers"]);
      setShowAddSupplier(false);
      supReset();
    },
  });

  const updateSupplier = useMutation({
    mutationFn: ({ id, data: d }) => api.put(`/suppliers/${id}`, d),
    onSuccess: () => {
      toast.success("Distributor updated!");
      qc.invalidateQueries(["suppliers"]);
      setEditSupplier(null);
      supReset();
    },
  });

  const supplierColumns = [
    {
      key: "name",
      header: "Name",
      render: (r) => <span className="font-medium">{r.name}</span>,
    },
    { key: "contactPerson", header: "Contact Person" },
    { key: "phone", header: "Phone" },
    { key: "gstNumber", header: "GST No." },
    { key: "creditDays", header: "Credit Days" },
    {
      key: "outstanding",
      header: "Outstanding",
      render: (r) => fmt(r.outstanding),
    },
    {
      key: "actions",
      header: "",
      render: (r) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setEditSupplier(r);
            supReset(r);
          }}
          className="text-xs text-blue-600 hover:underline font-medium"
        >
          Edit
        </button>
      ),
    },
  ];
  // ---- End Distributors / Suppliers ----

  const columns = [
    {
      key: "name",
      header: "Medicine",
      render: (r) => (
        <div>
          <p className="font-medium text-gray-900 dark:text-white">{r.name}</p>
          <p className="text-xs text-gray-400">{r.genericName}</p>
        </div>
      ),
    },
    {
      key: "category",
      header: "Category",
      render: (r) => (
        <span className="badge-blue capitalize">{r.category}</span>
      ),
    },
    {
      key: "currentStock",
      header: "Stock",
      render: (r) => (
        <span
          className={`font-semibold ${r.currentStock === 0 ? "text-red-600" : r.currentStock <= r.minimumStock ? "text-yellow-600" : "text-green-600"}`}
        >
          {r.currentStock} {r.unitOfMeasure || "Nos"}
        </span>
      ),
    },
    { key: "minimumStock", header: "Min Level", render: (r) => r.minimumStock },
    {
      key: "sellingPrice",
      header: "Price",
      render: (r) => <span className="font-medium">{fmt(r.sellingPrice)}</span>,
    },
    {
      key: "actions",
      header: "",
      render: (r) =>
        canManageInventory && (
          <div className="flex items-center gap-2 whitespace-nowrap flex-wrap">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowStock(r);
              }}
              className="text-xs text-blue-600 hover:underline font-medium"
            >
              Add Stock
            </button>
            {/* ── NEW: Adjust (Reduce / Increase) Stock button ── */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowAdjustStock(r);
                setAdjustType("reduce");
              }}
              className="text-xs text-orange-600 hover:underline font-medium"
              title="Reduce or increase current stock"
            >
              Adjust
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setEditMed(r);
                reset(r);
              }}
              className="text-xs text-green-600 hover:underline font-medium"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (
                  window.confirm(`Delete "${r.name}"? This cannot be undone.`)
                ) {
                  deleteMed.mutate(r._id);
                }
              }}
              className="text-xs text-red-600 hover:underline font-medium"
            >
              Delete
            </button>
          </div>
        ),
    },
  ];

  const TABS = [
    { id: "prescriptions", label: "OP Prescriptions", icon: Pill },
    canViewDashboard && {
      id: "inventory",
      label: "Inventory Dashboard",
      icon: Package,
    },
    canManageInventory && {
      id: "distributors",
      label: "Distributors",
      icon: Truck,
    },
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Pharmacy
        </h1>
        <div className="flex gap-2">
          {tab === "inventory" && canManageInventory && (
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="btn-primary"
            >
              <Plus size={16} /> Add Medicine
            </button>
          )}
          {tab === "distributors" && canManageInventory && (
            <button
              type="button"
              onClick={() => setShowAddSupplier(true)}
              className="btn-primary"
            >
              <Plus size={16} /> Add Distributor
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === id ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500"}`}
          >
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {tab === "prescriptions" && (
        <PendingPharmacyPanel canDispense={canDispense} />
      )}

      {tab === "inventory" && canViewDashboard && (
        <PharmacyInventoryDashboard>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="p-4 border-b border-gray-100 dark:border-gray-700 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  Medicine Inventory
                </h3>
                <div className="relative w-full sm:w-72">
                  <Search
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    type="text"
                    value={invSearchInput}
                    onChange={(e) => setInvSearchInput(e.target.value)}
                    placeholder="Search medicine by name..."
                    className="input-field w-full pl-9"
                  />
                  {invSearchInput && (
                    <button
                      type="button"
                      onClick={() => setInvSearchInput("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
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
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      stockFilter === id
                        ? id === "out"
                          ? "bg-red-600 text-white border-red-600"
                          : id === "low"
                            ? "bg-yellow-500 text-white border-yellow-500"
                            : id === "in"
                              ? "bg-green-600 text-white border-green-600"
                              : "bg-blue-600 text-white border-blue-600"
                        : "bg-transparent text-gray-500 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {invSearch && (
                <p className="text-xs text-gray-400">
                  Showing results for "{invSearch}"
                  {data && (
                    <>
                      {" "}
                      — {filteredMedicines.length} of{" "}
                      {data.total ?? data.data?.length ?? 0} medicine(s)
                    </>
                  )}
                </p>
              )}
            </div>
            <DataTable
              columns={columns}
              data={filteredMedicines}
              loading={isLoading}
              page={page}
              pages={data?.pages || 1}
              onPageChange={setPage}
            />
            {!isLoading && filteredMedicines.length === 0 && (
              <div className="p-8 text-center text-sm text-gray-400">
                No medicines found{invSearch ? ` for "${invSearch}"` : ""}.
              </div>
            )}
          </div>
        </PharmacyInventoryDashboard>
      )}

      {tab === "distributors" && canManageInventory && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="p-4 border-b border-gray-100 dark:border-gray-700">
            <h3 className="font-semibold text-gray-900 dark:text-white">
              Distributors / Suppliers
            </h3>
          </div>
          <DataTable
            columns={supplierColumns}
            data={suppliersData?.data || []}
            loading={suppliersLoading}
          />
        </div>
      )}

      {/* ── Add / Edit Medicine Modal ─────────────────────────────────────── */}
      <Modal
        isOpen={showAdd || !!editMed}
        onClose={() => {
          setShowAdd(false);
          setEditMed(null);
          reset();
        }}
        title={editMed ? `Edit Medicine: ${editMed.name}` : "Add Medicine"}
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Medicine Name *
              </label>
              <input
                {...register("name", { required: true })}
                className="input-field"
                placeholder="Brand name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Generic Name
              </label>
              <input {...register("genericName")} className="input-field" />
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
                Fill this in to stock the medicine right away. You can also
                skip it and add stock later from the medicine list.
              </p>
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
        title={`Add Stock: ${showStock?.name}`}
        size="md"
      >
        <form
          onSubmit={stockSubmit((d) =>
            addStock.mutate({ id: showStock._id, data: d }),
          )}
          className="p-6 space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Batch Number *
              </label>
              <input
                {...stockReg("batchNumber", { required: true })}
                className="input-field"
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
                Purchase Price
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
              {addStock.isPending ? "Updating..." : "Add Stock"}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── NEW: Adjust Stock Modal (Reduce / Increase) ─────────────────────── */}
      <Modal
        isOpen={!!showAdjustStock}
        onClose={() => {
          setShowAdjustStock(null);
          setAdjustType("reduce");
          adjustReset();
        }}
        title={`Adjust Stock: ${showAdjustStock?.name}`}
        size="md"
      >
        <form
          onSubmit={adjustSubmit((d) => {
            adjustStockMut.mutate({
              id: showAdjustStock._id,
              data: { ...d, type: adjustType },
            });
          })}
          className="p-6 space-y-4"
        >
          {/* Type Selection */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Operation Type
            </label>
            <div className="flex gap-4">
              <label className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  name="type"
                  value="reduce"
                  checked={adjustType === "reduce"}
                  onChange={(e) => setAdjustType(e.target.value)}
                  className="mr-2"
                />
                <span className="text-sm">Reduce Stock</span>
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
                <span className="text-sm">Increase Stock</span>
              </label>
            </div>
          </div>

          {/* Current Stock Info */}
          <div className="bg-blue-50 dark:bg-blue-900 p-3 rounded-lg">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              <span className="font-semibold">Current Stock:</span>{" "}
              <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                {showAdjustStock?.currentStock}{" "}
                {showAdjustStock?.unitOfMeasure || "Nos"}
              </span>
            </p>
          </div>

          {/* Quantity Field */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Quantity to {adjustType === "reduce" ? "Reduce" : "Add"} *
            </label>
            <input
              {...adjustReg("quantity", {
                required: "Quantity is required",
                valueAsNumber: true,
                min: { value: 1, message: "Quantity must be at least 1" },
                validate: (val) => {
                  if (
                    adjustType === "reduce" &&
                    val > showAdjustStock?.currentStock
                  ) {
                    return `Cannot reduce more than available stock (${showAdjustStock?.currentStock})`;
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

          {/* Fields shown only for INCREASE */}
          {adjustType === "increase" && (
            <>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Batch Number *
                </label>
                <input
                  {...adjustReg("batchNumber", {
                    required: "Batch number is required for stock increase",
                  })}
                  className="input-field"
                  placeholder="e.g., BATCH2024001"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Expiry Date *
                </label>
                <input
                  {...adjustReg("expiryDate", {
                    required: "Expiry date is required for stock increase",
                  })}
                  type="date"
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Purchase Price
                </label>
                <input
                  {...adjustReg("purchasePrice", { valueAsNumber: true })}
                  type="number"
                  step="0.01"
                  className="input-field"
                  placeholder="Optional"
                />
              </div>
            </>
          )}

          {/* Remarks */}
          <div>
            <label className="block text-sm font-medium mb-1">Remarks</label>
            <textarea
              {...adjustReg("remarks")}
              className="input-field"
              placeholder="Reason for adjustment (e.g., breakage, audit, correction)"
              rows="3"
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-3 justify-end pt-4 border-t">
            <button
              type="button"
              onClick={() => {
                setShowAdjustStock(null);
                setAdjustType("reduce");
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
                ? "Adjusting..."
                : `${adjustType === "reduce" ? "Reduce" : "Increase"} Stock`}
            </button>
          </div>
        </form>
      </Modal>
      {/* ── End Adjust Stock Modal ───────────────────────────────────────────── */}

      {/* ── Add / Edit Supplier Modal ─────────────────────────────────────── */}
      <Modal
        isOpen={showAddSupplier || !!editSupplier}
        onClose={() => {
          setShowAddSupplier(false);
          setEditSupplier(null);
          supReset();
        }}
        title={editSupplier ? "Edit Distributor" : "Add Distributor"}
        size="lg"
      >
        <form
          onSubmit={supSubmit((d) =>
            editSupplier
              ? updateSupplier.mutate({ id: editSupplier._id, data: d })
              : addSupplier.mutate(d),
          )}
          className="p-6 space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Distributor Name *
              </label>
              <input
                {...supReg("name", { required: true })}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Contact Person
              </label>
              <input {...supReg("contactPerson")} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Phone *</label>
              <input
                {...supReg("phone", { required: true })}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                {...supReg("email")}
                type="email"
                className="input-field"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Address</label>
              <input {...supReg("address")} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">City</label>
              <input {...supReg("city")} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">State</label>
              <input {...supReg("state")} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Pincode</label>
              <input {...supReg("pincode")} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                GST Number
              </label>
              <input {...supReg("gstNumber")} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Drug License
              </label>
              <input {...supReg("drugLicense")} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Credit Days
              </label>
              <input
                {...supReg("creditDays", { valueAsNumber: true })}
                type="number"
                defaultValue={30}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Opening Amount
              </label>
              <input
                {...supReg("openingAmount", { valueAsNumber: true })}
                type="number"
                defaultValue={0}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Amount Paid
              </label>
              <input
                {...supReg("amountPaid", { valueAsNumber: true })}
                type="number"
                defaultValue={0}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Outstanding Amount
              </label>
              <input
                {...supReg("outstanding", { valueAsNumber: true })}
                type="number"
                defaultValue={0}
                className="input-field"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Notes</label>
              <input {...supReg("notes")} className="input-field" />
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-4 border-t">
            <button
              type="button"
              onClick={() => {
                setShowAddSupplier(false);
                setEditSupplier(null);
              }}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={addSupplier.isPending || updateSupplier.isPending}
              className="btn-primary"
            >
              {addSupplier.isPending || updateSupplier.isPending
                ? "Saving..."
                : "Save Distributor"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}