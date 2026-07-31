import React, { useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { useQuery } from "@tanstack/react-query";
import {
  Search, Download, FileSpreadsheet, Printer, RotateCcw,
  Package, BarChart3, AlertTriangle, Clock, TrendingDown, DollarSign, XCircle,
} from "lucide-react";
import toast from "react-hot-toast";
import api from "../services/api";
import { hasRole } from "../utils/roles";
import KpiCard from "../components/common/KpiCard";
import LoadingSpinner from "../components/common/LoadingSpinner";
import { printSection } from "../utils/exportUtils";

// ────────────────────────────────────────────────────────────────────────────
// Inventory → Pharmacy → Medicine Expiry Report
// New, standalone page. Does not modify any existing Pharmacy/Inventory UI.
// ────────────────────────────────────────────────────────────────────────────

const fmtCurrency = (n) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const toISODate = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const addDays = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
};

const DATE_PRESETS = [
  { id: "today", label: "Today", build: () => ({ fromDate: toISODate(new Date()), toDate: toISODate(new Date()) }) },
  { id: "next7", label: "Next 7 Days", build: () => ({ fromDate: toISODate(new Date()), toDate: toISODate(addDays(7)) }) },
  { id: "next15", label: "Next 15 Days", build: () => ({ fromDate: toISODate(new Date()), toDate: toISODate(addDays(15)) }) },
  { id: "next30", label: "Next 30 Days", build: () => ({ fromDate: toISODate(new Date()), toDate: toISODate(addDays(30)) }) },
  { id: "next60", label: "Next 60 Days", build: () => ({ fromDate: toISODate(new Date()), toDate: toISODate(addDays(60)) }) },
  { id: "next90", label: "Next 90 Days", build: () => ({ fromDate: toISODate(new Date()), toDate: toISODate(addDays(90)) }) },
  { id: "next6m", label: "Next 6 Months", build: () => ({ fromDate: toISODate(new Date()), toDate: toISODate(addDays(182)) }) },
  { id: "next12m", label: "Next 12 Months", build: () => ({ fromDate: toISODate(new Date()), toDate: toISODate(addDays(365)) }) },
  { id: "expired", label: "Expired Medicines", build: () => ({ fromDate: "", toDate: "", status: "expired" }) },
  { id: "custom", label: "Custom Date Range", build: () => ({}) },
];

const CATEGORY_LABELS = {
  tablet: "Tablet", capsule: "Capsule", injection: "Injection", syrup: "Syrup",
  drops: "Drops", cream: "Cream", ointment: "Ointment", gel: "Gel", powder: "Powder",
  iv_fluid: "IV Fluid", consumables: "Consumables", surgical: "Surgical",
  inhaler: "Inhaler", other: "Others",
};
const categoryLabel = (c) => CATEGORY_LABELS[c] || (c ? c[0].toUpperCase() + c.slice(1) : c);

const STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "expired", label: "Expired" },
  { value: "near_expiry", label: "Near Expiry (<30 Days)" },
  { value: "expiring_soon", label: "Expiring Soon (<60 Days)" },
  { value: "healthy", label: "Healthy" },
  { value: "zero_stock", label: "Zero Stock" },
  { value: "low_stock", label: "Low Stock" },
];

const SORT_OPTIONS = [
  { value: "expiry_asc", label: "Expiry Date (Ascending)" },
  { value: "expiry_desc", label: "Expiry Date (Descending)" },
  { value: "name_asc", label: "Medicine Name A-Z" },
  { value: "name_desc", label: "Medicine Name Z-A" },
  { value: "category", label: "Category" },
  { value: "manufacturer", label: "Manufacturer" },
  { value: "supplier", label: "Supplier" },
  { value: "stock", label: "Stock Quantity" },
  { value: "mrp", label: "MRP" },
  { value: "purchase_rate", label: "Purchase Rate" },
];

const GROUP_OPTIONS = [
  { value: "none", label: "No Group" },
  { value: "category", label: "Category" },
  { value: "supplier", label: "Supplier" },
  { value: "manufacturer", label: "Manufacturer" },
];

const STATUS_STYLES = {
  expired: "bg-red-900/10 text-red-800 border border-red-800/30",
  near_expiry: "bg-orange-50 text-orange-700 border border-orange-300",
  expiring_soon: "bg-yellow-50 text-yellow-700 border border-yellow-300",
  healthy: "bg-green-50 text-green-700 border border-green-300",
  zero_stock: "bg-gray-100 text-gray-600 border border-gray-300",
  low_stock: "bg-purple-50 text-purple-700 border border-purple-300",
};
const STATUS_LABEL = {
  expired: "Expired", near_expiry: "Near Expiry", expiring_soon: "Expiring Soon",
  healthy: "Healthy", zero_stock: "Zero Stock", low_stock: "Low Stock",
};

const daysRemainingLabel = (days) => {
  if (days === 0) return "Expires Today";
  if (days === 1) return "1 Day Left";
  if (days > 1) return `${days} Days Left`;
  if (days === -1) return "Expired Yesterday";
  return `Expired ${Math.abs(days)} Days Ago`;
};

const emptyFilters = {
  fromDate: "", toDate: "", category: "", supplier: "", manufacturer: "",
  batch: "", status: "", search: "", sort: "expiry_asc", groupBy: "none",
};

export default function PharmacyExpiryReportPage() {
  const { user } = useSelector((s) => s.auth);
  const canDownload = hasRole(user?.role, ["Super Admin", "Admin", "Pharmacist"]);

  const [preset, setPreset] = useState("next90");
  const [filters, setFilters] = useState({ ...emptyFilters, ...DATE_PRESETS.find((p) => p.id === "next90").build() });
  const [applied, setApplied] = useState(filters);
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  const { data: meta } = useQuery({
    queryKey: ["expiryReportMeta"],
    queryFn: () => api.get("/pharmacy/expiry-report/meta").then((r) => r.data.data),
  });

  const grouped = applied.groupBy && applied.groupBy !== "none";

  const queryParams = useMemo(() => {
    const params = { ...applied };
    if (!grouped) { params.page = page; params.limit = 25; }
    Object.keys(params).forEach((k) => { if (params[k] === "" || params[k] === undefined) delete params[k]; });
    return params;
  }, [applied, page, grouped]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["expiryReport", queryParams],
    queryFn: () => api.get("/pharmacy/expiry-report", { params: queryParams }).then((r) => r.data),
    keepPreviousData: true,
  });

  const summary = data?.summary || {};

  const applyPreset = (id) => {
    setPreset(id);
    const found = DATE_PRESETS.find((p) => p.id === id);
    const built = found?.build() || {};
    const next = { ...filters, status: "", ...built };
    setFilters(next);
    setApplied({ ...next });
    setPage(1);
  };

  const handleApply = () => {
    setApplied({ ...filters });
    setPage(1);
  };

  const handleReset = () => {
    const next = { ...emptyFilters, ...DATE_PRESETS.find((p) => p.id === "next90").build() };
    setPreset("next90");
    setFilters(next);
    setApplied(next);
    setPage(1);
  };

  const handleExport = async (format) => {
    setExporting(true);
    try {
      const res = await api.get("/pharmacy/expiry-report/export", {
        params: { ...applied, format },
        responseType: "blob",
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `medicine-expiry-report.${format === "excel" ? "xlsx" : "pdf"}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const handlePrint = () => printSection("expiry-report-print-area", "Medicine Expiry Report");

  const CARDS = [
    { key: "totalMedicines", label: "Total Medicines", icon: Package, color: "blue" },
    { key: "totalBatches", label: "Total Batches", icon: BarChart3, color: "indigo" },
    { key: "expiredMedicines", label: "Expired Medicines", icon: XCircle, color: "red" },
    { key: "nearExpiryMedicines", label: "Near Expiry Medicines", icon: AlertTriangle, color: "yellow" },
    { key: "expiringSoon", label: "Expiring Soon", icon: Clock, color: "yellow" },
    { key: "currentStockValue", label: "Current Stock Value", icon: DollarSign, color: "green", format: fmtCurrency },
    { key: "expectedLoss", label: "Expected Loss Due To Expiry", icon: TrendingDown, color: "red", format: fmtCurrency },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Medicine Expiry Report</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Inventory / Pharmacy / Medicine Expiry Report</p>
        </div>
        {canDownload && (
          <div className="flex gap-2">
            <button
              onClick={() => handleExport("pdf")}
              disabled={exporting}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              <Download size={16} /> Download PDF
            </button>
            <button
              onClick={() => handleExport("excel")}
              disabled={exporting}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              <FileSpreadsheet size={16} /> Download Excel
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-700 hover:bg-gray-800 text-white text-sm font-medium transition-colors"
            >
              <Printer size={16} /> Print
            </button>
          </div>
        )}
      </div>

      {/* Summary Dashboard */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        {CARDS.map((c) => (
          <KpiCard
            key={c.key}
            title={c.label}
            value={c.format ? c.format(summary[c.key]) : (summary[c.key] ?? 0)}
            icon={c.icon}
            color={c.color}
          />
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-5 space-y-4">
        <div className="flex flex-wrap gap-2">
          {DATE_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => applyPreset(p.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                preset === p.id
                  ? "bg-blue-600 border-blue-600 text-white"
                  : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">From Date</label>
            <input
              type="date"
              value={filters.fromDate}
              onChange={(e) => { setPreset("custom"); setFilters((f) => ({ ...f, fromDate: e.target.value })); }}
              className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">To Date</label>
            <input
              type="date"
              value={filters.toDate}
              onChange={(e) => { setPreset("custom"); setFilters((f) => ({ ...f, toDate: e.target.value })); }}
              className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Category</label>
            <select
              value={filters.category}
              onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
              className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 text-sm"
            >
              <option value="">All</option>
              {(meta?.categories || []).map((c) => (
                <option key={c} value={c}>{categoryLabel(c)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Supplier</label>
            <select
              value={filters.supplier}
              onChange={(e) => setFilters((f) => ({ ...f, supplier: e.target.value }))}
              className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 text-sm"
            >
              <option value="">All Suppliers</option>
              {(meta?.suppliers || []).map((s) => (
                <option key={s._id} value={s._id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Manufacturer</label>
            <input
              list="manufacturer-list"
              value={filters.manufacturer}
              onChange={(e) => setFilters((f) => ({ ...f, manufacturer: e.target.value }))}
              placeholder="All Manufacturers"
              className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 text-sm"
            />
            <datalist id="manufacturer-list">
              {(meta?.manufacturers || []).map((m) => <option key={m} value={m} />)}
            </datalist>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Batch Number</label>
            <input
              value={filters.batch}
              onChange={(e) => setFilters((f) => ({ ...f, batch: e.target.value }))}
              placeholder="Search batch"
              className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 text-sm"
            />
          </div>
          <div className="col-span-2">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Search Medicine / Generic / Barcode / Batch</label>
            <div className="relative mt-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={filters.search}
                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                placeholder="Type to search..."
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
              className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 text-sm"
            >
              {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Sort By</label>
            <select
              value={filters.sort}
              onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value }))}
              className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 text-sm"
            >
              {SORT_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Group By</label>
            <select
              value={filters.groupBy}
              onChange={(e) => setFilters((f) => ({ ...f, groupBy: e.target.value }))}
              className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 text-sm"
            >
              {GROUP_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={handleApply}
            className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
          >
            Apply Filters
          </button>
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <RotateCcw size={14} /> Reset
          </button>
        </div>
      </div>

      {/* Report Grid */}
      <div id="expiry-report-print-area" className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        {isLoading ? (
          <LoadingSpinner />
        ) : grouped ? (
          <GroupedGrid data={data} />
        ) : (
          <FlatGrid data={data} page={page} onPageChange={setPage} isFetching={isFetching} />
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${STATUS_STYLES[status] || "bg-gray-100 text-gray-600"}`}>
      {STATUS_LABEL[status] || status}
    </span>
  );
}

const GRID_HEADERS = [
  "SI No", "Medicine Name", "Generic Name", "Category", "Batch No.", "Manufacturer",
  "Supplier", "Expiry Date", "Days Remaining", "Purchase Rate", "MRP", "Stock", "Unit", "Stock Value", "Status",
];

function MedicineRow({ row, si }) {
  return (
    <tr className="table-row-hover">
      <td className="px-3 py-2 text-gray-500">{si}</td>
      <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">{row.medicineName}</td>
      <td className="px-3 py-2 text-gray-500">{row.genericName || "-"}</td>
      <td className="px-3 py-2 text-gray-500">{categoryLabel(row.category)}</td>
      <td className="px-3 py-2 text-gray-500">{row.batchNumber || "-"}</td>
      <td className="px-3 py-2 text-gray-500">{row.manufacturer || "-"}</td>
      <td className="px-3 py-2 text-gray-500">{row.supplierName || "-"}</td>
      <td className="px-3 py-2 text-gray-500">{row.expiryDate ? new Date(row.expiryDate).toLocaleDateString("en-IN") : "-"}</td>
      <td className="px-3 py-2 text-gray-500">{daysRemainingLabel(row.daysRemaining)}</td>
      <td className="px-3 py-2 text-gray-500">{fmtCurrency(row.purchaseRate)}</td>
      <td className="px-3 py-2 text-gray-500">{fmtCurrency(row.mrp)}</td>
      <td className="px-3 py-2 text-gray-500">{row.currentStock}</td>
      <td className="px-3 py-2 text-gray-500">{row.unit || "Nos"}</td>
      <td className="px-3 py-2 text-gray-500">{fmtCurrency(row.stockValue)}</td>
      <td className="px-3 py-2"><StatusBadge status={row.status} /></td>
    </tr>
  );
}

function FlatGrid({ data, page, onPageChange, isFetching }) {
  const rows = data?.rows || [];
  const pages = data?.pages || 1;
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              {GRID_HEADERS.map((h) => (
                <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {rows.length === 0 ? (
              <tr><td colSpan={GRID_HEADERS.length} className="px-4 py-12 text-center text-gray-400">No medicines match the selected filters</td></tr>
            ) : (
              rows.map((row, i) => (
                <MedicineRow key={`${row.medicineId}-${row.batchNumber}-${i}`} row={row} si={(page - 1) * (data?.limit || 25) + i + 1} />
              ))
            )}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-500">Page {page} of {pages} {isFetching && "· refreshing…"}</p>
          <div className="flex gap-2">
            <button onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page === 1} className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm disabled:opacity-30">Prev</button>
            <button onClick={() => onPageChange(Math.min(pages, page + 1))} disabled={page === pages} className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm disabled:opacity-30">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}

function GroupedGrid({ data }) {
  const groups = data?.groups || [];
  let running = 0;

  const grand = groups.reduce((acc, g) => ({
    totalMedicines: acc.totalMedicines + g.totalMedicines,
    totalStock: acc.totalStock + g.totalStock,
    totalStockValue: acc.totalStockValue + g.totalStockValue,
  }), { totalMedicines: 0, totalStock: 0, totalStockValue: 0 });

  if (!groups.length) {
    return <div className="px-4 py-12 text-center text-gray-400">No medicines match the selected filters</div>;
  }

  return (
    <div className="overflow-x-auto">
      {data?.truncated && (
        <div className="px-4 py-2 text-xs text-orange-600 bg-orange-50 border-b border-orange-200">
          Showing the first 20,000 matching rows. Narrow your filters for a complete grouped view.
        </div>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            {GRID_HEADERS.map((h) => (
              <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
          {groups.map((g) => (
            <React.Fragment key={g.groupName}>
              <tr className="bg-blue-50 dark:bg-blue-900/20">
                <td colSpan={GRID_HEADERS.length} className="px-3 py-2 font-bold text-blue-900 dark:text-blue-200 uppercase tracking-wide">
                  {g.groupName}
                </td>
              </tr>
              {g.medicines.map((row, i) => {
                running += 1;
                return <MedicineRow key={`${row.medicineId}-${row.batchNumber}-${i}`} row={row} si={running} />;
              })}
              <tr className="bg-indigo-50/60 dark:bg-indigo-900/10 font-semibold">
                <td colSpan={GRID_HEADERS.length} className="px-3 py-2 text-indigo-900 dark:text-indigo-200">
                  Category Total — Medicines: {g.totalMedicines}  |  Stock: {g.totalStock}  |  Value: {fmtCurrency(g.totalStockValue)}
                </td>
              </tr>
            </React.Fragment>
          ))}
          <tr className="bg-gray-900 text-white font-bold">
            <td colSpan={GRID_HEADERS.length} className="px-3 py-3">
              GRAND TOTAL — Categories: {groups.length}  |  Medicines: {grand.totalMedicines}  |  Stock: {grand.totalStock}  |  Value: {fmtCurrency(grand.totalStockValue)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}