import React, { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  FileSpreadsheet, Printer, RefreshCw, CalendarRange, Search,
  LayoutDashboard, Users, UserRound, CalendarDays, Stethoscope, Pill,
  Package, Receipt, Wallet, FlaskConical, Scan, BedDouble, HeartPulse,
  Scissors, IndianRupee, ShieldCheck, UserCog, Lock, Server,
  TrendingUp, TrendingDown, AlertCircle, ClipboardList, Ticket,
  FileText, Wrench, AlertTriangle, GitPullRequest, FolderOpen,
  Building2, Truck, MessageSquare, Clock, Activity, Bell, Warehouse, BookOpen, Landmark, Filter,
} from 'lucide-react';
import {
  startOfDay, endOfDay, subDays, startOfMonth, endOfMonth, subMonths, format,
} from 'date-fns';
import reportsApi from '../services/reportsApi';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { exportToCSV, printSection } from '../utils/exportUtils';
import { useBranding } from '../hooks/useBranding';
import '../styles/auditReports.css';

const PRESETS = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: '7 Days' },
  { id: 'thisMonth', label: 'This Month' },
  { id: 'lastMonth', label: 'Last Month' },
];

const NAV_GROUPS = [
  {
    title: 'Overview',
    items: [
      { id: 'executive', label: 'Executive Summary', icon: LayoutDashboard },
      { id: 'trail', label: 'Full Audit Trail', icon: ClipboardList },
    ],
  },
  {
    title: 'Operations',
    items: [
      { id: 'patient', label: 'Patient', icon: UserRound },
      { id: 'op', label: 'OP Queue & Visits', icon: Ticket },
      { id: 'ip', label: 'IP Admissions', icon: Building2 },
      { id: 'appointment', label: 'Appointment', icon: CalendarDays },
      { id: 'doctor', label: 'Doctor', icon: Stethoscope },
      { id: 'bed', label: 'Bed Management', icon: BedDouble },
      { id: 'facility', label: 'Wards & Rooms', icon: Landmark },
      { id: 'ot', label: 'Operation Theatre', icon: Scissors },
      { id: 'nurse', label: 'Nurse Station', icon: HeartPulse },
    ],
  },
  {
    title: 'Clinical',
    items: [
      { id: 'laboratory', label: 'Laboratory', icon: FlaskConical },
      { id: 'radiology', label: 'Radiology', icon: Scan },
      { id: 'prescription', label: 'Prescriptions', icon: FileText },
      { id: 'pharmacy', label: 'Pharmacy & Medicines', icon: Pill },
      { id: 'inventory', label: 'Inventory', icon: Package },
      { id: 'stock', label: 'Stock Movements', icon: Warehouse },
    ],
  },
  {
    title: 'Finance',
    items: [
      { id: 'billing', label: 'Billing', icon: Receipt },
      { id: 'payment', label: 'Payments', icon: Wallet },
      { id: 'financial', label: 'Financial', icon: IndianRupee },
      { id: 'insurance', label: 'Insurance', icon: ShieldCheck },
      { id: 'shift', label: 'Shift Settlement', icon: Clock },
    ],
  },
  {
    title: 'Assets & Facility',
    items: [
      { id: 'assets', label: 'Equipment Master', icon: Wrench },
      { id: 'complaints', label: 'Equipment Complaints', icon: AlertTriangle },
      { id: 'bems', label: 'Biomedical / BME', icon: Activity },
    ],
  },
  {
    title: 'Masters',
    items: [
      { id: 'departments', label: 'Departments', icon: Building2 },
      { id: 'suppliers', label: 'Suppliers', icon: Truck },
      { id: 'catalog', label: 'Tariff / Catalog', icon: BookOpen },
      { id: 'documents', label: 'Documents & Consents', icon: FolderOpen },
    ],
  },
  {
    title: 'Governance',
    items: [
      { id: 'user-activity', label: 'User Activity', icon: Users },
      { id: 'employee', label: 'Employee', icon: UserCog },
      { id: 'security', label: 'Security', icon: Lock },
      { id: 'changes', label: 'Change Requests', icon: GitPullRequest },
      { id: 'chat', label: 'Staff Chat', icon: MessageSquare },
      { id: 'notifications', label: 'Notifications', icon: Bell },
      { id: 'system', label: 'System', icon: Server },
    ],
  },
];

const ALL_SECTIONS = NAV_GROUPS.flatMap((g) => g.items);

const DETAIL_COLUMNS = {
  executive: [],
  trail: [
    { key: 'date', header: 'When' },
    { key: 'module', header: 'Module' },
    { key: 'action', header: 'Action' },
    { key: 'user', header: 'User' },
    { key: 'role', header: 'Role' },
    { key: 'description', header: 'What happened' },
    { key: 'related', header: 'Record' },
    { key: 'ip', header: 'IP' },
  ],
  'user-activity': [
    { key: 'name', header: 'Name' },
    { key: 'email', header: 'Email' },
    { key: 'role', header: 'Role' },
    { key: 'lastLogin', header: 'Last Login' },
    { key: 'failedLoginAttempts', header: 'Failed' },
    { key: 'locked', header: 'Locked' },
  ],
  patient: [
    { key: 'patientId', header: 'UHID' },
    { key: 'name', header: 'Name' },
    { key: 'gender', header: 'Gender' },
    { key: 'age', header: 'Age' },
    { key: 'phone', header: 'Phone' },
    { key: 'registeredAt', header: 'Registered' },
  ],
  op: [
    { key: 'token', header: 'Token' },
    { key: 'patient', header: 'Patient' },
    { key: 'patientId', header: 'UHID' },
    { key: 'doctor', header: 'Doctor' },
    { key: 'department', header: 'Department' },
    { key: 'type', header: 'Type' },
    { key: 'status', header: 'Status' },
    { key: 'date', header: 'Date' },
  ],
  ip: [
    { key: 'admission', header: 'Admission #' },
    { key: 'patient', header: 'Patient' },
    { key: 'patientId', header: 'UHID' },
    { key: 'doctor', header: 'Doctor' },
    { key: 'department', header: 'Department' },
    { key: 'bed', header: 'Bed' },
    { key: 'status', header: 'Status' },
    { key: 'date', header: 'Admitted' },
    { key: 'discharge', header: 'Discharged' },
  ],
  appointment: [
    { key: 'date', header: 'Date' },
    { key: 'patient', header: 'Patient' },
    { key: 'patientId', header: 'UHID' },
    { key: 'doctor', header: 'Doctor' },
    { key: 'status', header: 'Status' },
  ],
  doctor: [
    { key: 'doctor', header: 'Doctor' },
    { key: 'opCount', header: 'OP' },
    { key: 'ipCount', header: 'IP' },
    { key: 'bills', header: 'Bills' },
    { key: 'revenue', header: 'Revenue', align: 'right' },
    { key: 'labCount', header: 'Lab' },
    { key: 'rxCount', header: 'Rx' },
  ],
  pharmacy: [
    { key: 'name', header: 'Medicine' },
    { key: 'qty', header: 'Qty Sold', align: 'right' },
    { key: 'revenue', header: 'Sales', align: 'right' },
    { key: 'cost', header: 'Cost', align: 'right' },
    { key: 'profit', header: 'Profit / Loss', align: 'right' },
    { key: 'margin', header: 'Margin', align: 'right' },
  ],
  inventory: [
    { key: 'name', header: 'Medicine' },
    { key: 'category', header: 'Category' },
    { key: 'currentStock', header: 'Stock', align: 'right' },
    { key: 'minimumStock', header: 'Minimum', align: 'right' },
    { key: 'reorderLevel', header: 'Reorder', align: 'right' },
  ],
  prescription: [
    { key: 'patient', header: 'Patient' },
    { key: 'patientId', header: 'UHID' },
    { key: 'doctor', header: 'Doctor' },
    { key: 'items', header: 'Items', align: 'right' },
    { key: 'status', header: 'Status' },
    { key: 'diagnosis', header: 'Diagnosis' },
    { key: 'date', header: 'Date' },
  ],
  billing: [
    { key: 'billNumber', header: 'Bill #' },
    { key: 'type', header: 'Type' },
    { key: 'status', header: 'Status' },
    { key: 'total', header: 'Total', align: 'right' },
    { key: 'paid', header: 'Paid', align: 'right' },
    { key: 'due', header: 'Due', align: 'right' },
    { key: 'discount', header: 'Discount', align: 'right' },
    { key: 'date', header: 'Date' },
  ],
  payment: [
    { key: 'mode', header: 'Mode' },
    { key: 'count', header: 'Count', align: 'right' },
    { key: 'amount', header: 'Amount', align: 'right' },
  ],
  laboratory: [
    { key: 'labNumber', header: 'Lab #' },
    { key: 'patient', header: 'Patient' },
    { key: 'labType', header: 'Type' },
    { key: 'status', header: 'Status' },
    { key: 'priority', header: 'Priority' },
    { key: 'amount', header: 'Amount', align: 'right' },
    { key: 'date', header: 'Date' },
  ],
  radiology: [
    { key: 'labNumber', header: 'Order #' },
    { key: 'patient', header: 'Patient' },
    { key: 'modality', header: 'Modality' },
    { key: 'status', header: 'Status' },
    { key: 'amount', header: 'Amount', align: 'right' },
    { key: 'date', header: 'Date' },
  ],
  bed: [
    { key: 'bedNumber', header: 'Bed' },
    { key: 'ward', header: 'Ward' },
    { key: 'type', header: 'Type' },
    { key: 'status', header: 'Status' },
    { key: 'patient', header: 'Patient' },
    { key: 'dailyRate', header: 'Daily Rate', align: 'right' },
  ],
  nurse: [
    { key: 'admission', header: 'Admission' },
    { key: 'patient', header: 'Patient' },
    { key: 'medicine', header: 'Medicine' },
    { key: 'quantity', header: 'Qty', align: 'right' },
    { key: 'administeredAt', header: 'Administered' },
  ],
  ot: [
    { key: 'operationNumber', header: 'OT #' },
    { key: 'patient', header: 'Patient' },
    { key: 'surgeon', header: 'Surgeon' },
    { key: 'status', header: 'Status' },
    { key: 'scheduledDate', header: 'Scheduled' },
    { key: 'charges', header: 'Charges', align: 'right' },
  ],
  financial: [],
  insurance: [
    { key: 'billNumber', header: 'Bill #' },
    { key: 'patient', header: 'Patient' },
    { key: 'provider', header: 'Provider' },
    { key: 'claimNumber', header: 'Claim #' },
    { key: 'claimStatus', header: 'Status' },
    { key: 'approved', header: 'Approved', align: 'right' },
    { key: 'date', header: 'Date' },
  ],
  shift: [
    { key: 'shift', header: 'Shift' },
    { key: 'status', header: 'Status' },
    { key: 'openedBy', header: 'Opened by' },
    { key: 'closedBy', header: 'Closed by' },
    { key: 'collected', header: 'Collected', align: 'right' },
    { key: 'date', header: 'Opened' },
  ],
  assets: [
    { key: 'assetId', header: 'Asset ID' },
    { key: 'name', header: 'Equipment' },
    { key: 'category', header: 'Category' },
    { key: 'status', header: 'Status' },
    { key: 'department', header: 'Department' },
    { key: 'location', header: 'Location' },
    { key: 'cost', header: 'Cost', align: 'right' },
    { key: 'date', header: 'Added' },
  ],
  complaints: [
    { key: 'number', header: 'Complaint #' },
    { key: 'asset', header: 'Equipment' },
    { key: 'priority', header: 'Priority' },
    { key: 'status', header: 'Status' },
    { key: 'reportedBy', header: 'Reported by' },
    { key: 'problem', header: 'Problem' },
    { key: 'cost', header: 'Repair cost', align: 'right' },
    { key: 'date', header: 'Date' },
  ],
  bems: [
    { key: 'number', header: 'WO #' },
    { key: 'type', header: 'Type' },
    { key: 'equipment', header: 'Equipment' },
    { key: 'department', header: 'Department' },
    { key: 'priority', header: 'Priority' },
    { key: 'status', header: 'Status' },
    { key: 'engineer', header: 'Engineer' },
    { key: 'date', header: 'Date' },
  ],
  departments: [
    { key: 'name', header: 'Department' },
    { key: 'code', header: 'Code' },
    { key: 'head', header: 'Head' },
    { key: 'location', header: 'Location' },
    { key: 'fee', header: 'Consult fee', align: 'right' },
    { key: 'active', header: 'Active' },
  ],
  suppliers: [
    { key: 'name', header: 'Supplier' },
    { key: 'contact', header: 'Contact' },
    { key: 'phone', header: 'Phone' },
    { key: 'gst', header: 'GST' },
    { key: 'outstanding', header: 'Outstanding', align: 'right' },
    { key: 'creditDays', header: 'Credit days' },
    { key: 'active', header: 'Active' },
  ],
  documents: [
    { key: 'title', header: 'Title' },
    { key: 'category', header: 'Category' },
    { key: 'patient', header: 'Patient' },
    { key: 'patientId', header: 'UHID' },
    { key: 'uploadedBy', header: 'Uploaded by' },
    { key: 'date', header: 'Date' },
  ],
  employee: [
    { key: 'name', header: 'Name' },
    { key: 'email', header: 'Email' },
    { key: 'role', header: 'Role' },
    { key: 'department', header: 'Department' },
    { key: 'isActive', header: 'Active' },
    { key: 'lastLogin', header: 'Last Login' },
  ],
  security: [
    { key: 'action', header: 'Action' },
    { key: 'user', header: 'User' },
    { key: 'email', header: 'Email' },
    { key: 'description', header: 'Description' },
    { key: 'ip', header: 'IP' },
    { key: 'date', header: 'Date' },
  ],
  changes: [
    { key: 'number', header: 'Request #' },
    { key: 'category', header: 'Category' },
    { key: 'title', header: 'Title' },
    { key: 'status', header: 'Status' },
    { key: 'priority', header: 'Priority' },
    { key: 'requestedBy', header: 'Requested by' },
    { key: 'reviewedBy', header: 'Reviewed by' },
    { key: 'date', header: 'Date' },
  ],
  chat: [
    { key: 'date', header: 'When' },
    { key: 'user', header: 'User' },
    { key: 'role', header: 'Role' },
    { key: 'channel', header: 'Channel' },
    { key: 'body', header: 'Message' },
  ],
  system: [],
  stock: [
    { key: 'date', header: 'When' },
    { key: 'medicine', header: 'Medicine' },
    { key: 'type', header: 'Type' },
    { key: 'batch', header: 'Batch' },
    { key: 'qty', header: 'Qty', align: 'right' },
    { key: 'before', header: 'Before', align: 'right' },
    { key: 'after', header: 'After', align: 'right' },
    { key: 'value', header: 'Value', align: 'right' },
    { key: 'user', header: 'User' },
    { key: 'remarks', header: 'Remarks' },
  ],
  facility: [
    { key: 'room', header: 'Room' },
    { key: 'ward', header: 'Ward' },
    { key: 'type', header: 'Type' },
    { key: 'status', header: 'Status' },
    { key: 'patient', header: 'Patient' },
    { key: 'dailyRate', header: 'Daily rate', align: 'right' },
    { key: 'floor', header: 'Floor' },
  ],
  catalog: [
    { key: 'name', header: 'Test / profile' },
    { key: 'category', header: 'Category' },
    { key: 'sample', header: 'Sample' },
    { key: 'price', header: 'Price', align: 'right' },
    { key: 'gst', header: 'GST %' },
    { key: 'active', header: 'Active' },
  ],
  notifications: [
    { key: 'date', header: 'When' },
    { key: 'type', header: 'Type' },
    { key: 'title', header: 'Title' },
    { key: 'message', header: 'Message' },
    { key: 'recipient', header: 'Recipient' },
    { key: 'read', header: 'Read' },
  ],
};

const DETAIL_TITLES = {
  trail: 'Activity register',
  patient: 'Patient registration register',
  op: 'OP visit register',
  ip: 'IP admission register',
  appointment: 'Appointment register',
  doctor: 'Doctor activity register',
  pharmacy: 'Medicine-wise Profit / Loss',
  inventory: 'Low-stock register',
  stock: 'Stock movement register',
  prescription: 'Prescription register',
  billing: 'Bill register',
  payment: 'Payment mode register',
  laboratory: 'Laboratory order register',
  radiology: 'Radiology order register',
  bed: 'Bed occupancy register',
  facility: 'Room register',
  nurse: 'Medication administration register',
  ot: 'Operation theatre register',
  insurance: 'Insurance claim register',
  shift: 'Shift settlement register',
  assets: 'Equipment master register',
  complaints: 'Equipment complaint register',
  bems: 'BME work-order register',
  departments: 'Department master',
  suppliers: 'Supplier register',
  catalog: 'Lab / test tariff register',
  documents: 'Document register',
  'user-activity': 'User login register',
  employee: 'Staff register',
  security: 'Security event register',
  changes: 'Change-request register',
  chat: 'Staff chat register',
  notifications: 'Notification register',
};

const STATUS_FILTER_SECTIONS = new Set([
  'op', 'ip', 'appointment', 'billing', 'laboratory', 'radiology', 'prescription',
  'complaints', 'bems', 'changes', 'shift', 'assets', 'stock', 'facility',
]);

const MONEY_KEYS = new Set([
  'revenue', 'amount', 'total', 'paid', 'due', 'discount', 'charges', 'approved', 'dailyRate',
  'cost', 'profit', 'fee', 'outstanding', 'collected', 'price', 'value',
]);
const DATE_KEYS = new Set([
  'date', 'lastLogin', 'registeredAt', 'administeredAt', 'scheduledDate', 'discharge', 'closedAt',
]);
const RIGHT_ALIGN_KEYS = new Set([
  ...MONEY_KEYS, 'qty', 'count', 'opCount', 'ipCount', 'bills', 'labCount', 'rxCount',
  'currentStock', 'minimumStock', 'reorderLevel', 'quantity', 'failedLoginAttempts', 'margin',
  'items', 'creditDays', 'before', 'after', 'gst', 'beds', 'available', 'floor', 'rating',
]);
const WRAP_KEYS = new Set(['description', 'body', 'problem', 'message', 'remarks', 'title']);

const presetRange = (id) => {
  const now = new Date();
  switch (id) {
    case 'today': return [startOfDay(now), endOfDay(now)];
    case '7d': return [startOfDay(subDays(now, 6)), endOfDay(now)];
    case 'thisMonth': return [startOfMonth(now), endOfDay(now)];
    case 'lastMonth': {
      const lm = subMonths(now, 1);
      return [startOfMonth(lm), endOfMonth(lm)];
    }
    default: return [startOfMonth(now), endOfDay(now)];
  }
};

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const formatKpiValue = (item) => {
  if (!item?.tracked || item.format === 'text') return item?.value ?? 'Not tracked yet';
  if (item.format === 'currency') return inr(item.value);
  if (item.format === 'percent') return `${item.value ?? 0}%`;
  return Number(item.value ?? 0).toLocaleString('en-IN');
};

const formatCell = (key, value) => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (DATE_KEYS.has(key) && value) {
    try { return format(new Date(value), 'dd MMM yyyy HH:mm'); } catch { return String(value); }
  }
  if (MONEY_KEYS.has(key) && typeof value === 'number') return inr(value);
  return String(value);
};

function Panel({ title, subtitle, children, flush }) {
  return (
    <section className="audit-panel">
      {(title || subtitle) && (
        <header className="audit-panel__head">
          <h3 className="audit-panel__title">{title}</h3>
          {subtitle && <p className="audit-panel__sub">{subtitle}</p>}
        </header>
      )}
      <div className={flush ? 'audit-panel__body--flush' : 'audit-panel__body'}>
        {children}
      </div>
    </section>
  );
}

function KpiGrid({ items }) {
  if (!items?.length) return null;
  return (
    <div className="audit-kpi-grid">
      {items.map((item) => {
        const muted = item.tracked === false;
        const isMoney = item.format === 'currency';
        const isNeg = isMoney && Number(item.value) < 0;
        const isPosMoney = isMoney && /profit|revenue|sales/i.test(item.label || '') && Number(item.value) > 0;
        return (
          <div key={item.key} className="audit-kpi">
            <p className="audit-kpi__label">{item.label}</p>
            <p
              className={`audit-kpi__value ${
                muted ? 'is-muted' : isNeg ? 'is-neg' : isPosMoney ? 'is-pos' : ''
              }`}
            >
              {formatKpiValue(item)}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function BreakdownPanel({ rows }) {
  if (!rows?.length) return null;
  return (
    <Panel title="Breakdown" subtitle="Period aggregates" flush>
      <div className="audit-table-wrap">
        <table className="audit-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Value</th>
              <th className="is-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.label}-${i}`}>
                <td>{r.label}</td>
                <td>
                  {r.format === 'currency' && typeof r.value === 'number' ? inr(r.value) : r.value}
                </td>
                <td className="is-right">{r.amount != null ? inr(r.amount) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function DetailTable({ columns, rows, title = 'Detail register', total }) {
  if (!columns?.length) return null;
  const shown = rows?.length || 0;
  const subtitle = total != null
    ? `${shown} of ${Number(total).toLocaleString('en-IN')} record(s)`
    : `${shown} record(s)`;
  return (
    <Panel title={title} subtitle={subtitle} flush>
      {!rows?.length ? (
        <p className="audit-empty">No records for this period</p>
      ) : (
        <div className="audit-table-wrap">
          <table className="audit-table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th
                    key={c.key}
                    className={c.align === 'right' || RIGHT_ALIGN_KEYS.has(c.key) ? 'is-right' : ''}
                  >
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  {columns.map((c) => {
                    const right = c.align === 'right' || RIGHT_ALIGN_KEYS.has(c.key);
                    const profitTone = c.key === 'profit' && typeof row[c.key] === 'number'
                      ? (row[c.key] >= 0 ? 'is-pos' : 'is-neg')
                      : '';
                    return (
                      <td key={c.key} className={`${right ? 'is-right' : ''} ${profitTone} ${WRAP_KEYS.has(c.key) ? 'is-wrap' : ''}`}>
                        {formatCell(c.key, row[c.key])}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function ExceptionStrip({ items }) {
  if (!items?.length) return null;
  return (
    <div className="audit-exceptions">
      <p className="audit-exceptions__title">Exception register · items needing review</p>
      <div className="audit-exceptions__grid">
        {items.map((ex) => (
          <div key={ex.key} className={`audit-ex audit-ex--${ex.severity || 'ok'}`}>
            <span>{ex.label}</span>
            <strong>{Number(ex.value || 0).toLocaleString('en-IN')}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function RegisterTables({ registers }) {
  if (!registers?.length) return null;
  return registers.map((reg) => (
    <DetailTable
      key={reg.id || reg.title}
      columns={reg.columns || []}
      rows={reg.rows || []}
      title={reg.title || 'Register'}
    />
  ));
}

function AuditPager({ meta, page, onPage }) {
  if (!meta?.pages || meta.pages <= 1) return null;
  return (
    <div className="audit-pager">
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Previous
      </button>
      <span>
        Page {meta.page || page} of {meta.pages} · {(meta.total || 0).toLocaleString('en-IN')} records
      </span>
      <button type="button" disabled={page >= meta.pages} onClick={() => onPage(page + 1)}>
        Next
      </button>
    </div>
  );
}

function ExecutiveScorecard({ kpis = [] }) {
  if (!kpis.length) return null;
  return (
    <Panel title="Executive Scorecard" subtitle="Board-level hospital KPIs" flush>
      <div className="audit-table-wrap">
        <table className="audit-table">
          <thead>
            <tr>
              <th>Metric</th>
              <th className="is-right">Value</th>
            </tr>
          </thead>
          <tbody>
            {kpis.map((k) => (
              <tr key={k.key}>
                <td>{k.label}</td>
                <td className="is-right" style={{ fontWeight: 600 }}>{formatKpiValue(k)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function MedicinePnlCard({ pnl }) {
  if (!pnl) return null;
  const profit = Number(pnl.netProfit || 0);
  const isProfit = profit >= 0;
  return (
    <div className="audit-pnl">
      <div className="audit-pnl__head">
        <div>
          <div className="audit-pnl__head-title">Medicine Profit &amp; Loss Statement</div>
          <div className="audit-pnl__head-sub">Sales − COGS − expired / disposed loss</div>
        </div>
        <div className="audit-pnl__result">
          {isProfit ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
          {isProfit ? 'Net Profit' : 'Net Loss'} · {inr(Math.abs(profit))}
          <span style={{ opacity: 0.65, fontWeight: 500 }}>· Margin {pnl.marginPct ?? 0}%</span>
        </div>
      </div>
      <div className="audit-pnl__body">
        <div className="audit-pnl__row">
          <span>Medicine sales (revenue)</span>
          <span>{inr(pnl.revenue)}</span>
        </div>
        <div className="audit-pnl__row">
          <span>Less: Cost of goods sold</span>
          <span>{inr(pnl.cogs)}</span>
        </div>
        <div className="audit-pnl__row is-total">
          <span>Gross profit</span>
          <span className={pnl.grossProfit >= 0 ? 'is-pos' : 'is-neg'}>{inr(pnl.grossProfit)}</span>
        </div>
        <div className="audit-pnl__row">
          <span>Less: Expired / disposed loss</span>
          <span className="is-warn">{inr(pnl.expiredLoss)}</span>
        </div>
        <div className="audit-pnl__row is-net">
          <span>Net profit / (loss)</span>
          <span>{inr(pnl.netProfit)}</span>
        </div>
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const { branding } = useBranding();
  const [section, setSection] = useState('executive');
  const [preset, setPreset] = useState('thisMonth');
  const [applied, setApplied] = useState(() => {
    const [from, to] = presetRange('thisMonth');
    return { from, to };
  });
  const [draft, setDraft] = useState(applied);
  const [detailSearch, setDetailSearch] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [trailModule, setTrailModule] = useState('');
  const [trailAction, setTrailAction] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => {
      setQDebounced(detailSearch.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [detailSearch]);

  const handlePreset = (id) => {
    setPreset(id);
    const [from, to] = presetRange(id);
    setDraft({ from, to });
    setApplied({ from, to });
    setPage(1);
  };

  const applyCustom = () => {
    setPreset('custom');
    setApplied(draft);
    setPage(1);
  };

  const selectSection = (id) => {
    setSection(id);
    setPage(1);
    setDetailSearch('');
    setQDebounced('');
    setTrailModule('');
    setTrailAction('');
    setStatusFilter('');
  };

  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ['auditReport', section, applied.from, applied.to, qDebounced, trailModule, trailAction, statusFilter, page],
    queryFn: () => reportsApi.getAuditSection(section, {
      ...applied,
      q: qDebounced || undefined,
      module: section === 'trail' ? trailModule || undefined : undefined,
      action: section === 'trail' ? trailAction || undefined : undefined,
      status: statusFilter || undefined,
      page,
      limit: 50,
    }),
    placeholderData: keepPreviousData,
  });

  const columns = DETAIL_COLUMNS[section] || [];
  const visibleDetails = useMemo(() => {
    const rows = data?.details || [];
    if (section === 'trail' || data?.meta?.serverSearch || !detailSearch.trim()) return rows;
    const q = detailSearch.trim().toLowerCase();
    return rows.filter((row) => Object.values(row).some((v) => String(v ?? '').toLowerCase().includes(q)));
  }, [data, detailSearch, section]);
  const sectionMeta = ALL_SECTIONS.find((s) => s.id === section);
  const groupTitle = NAV_GROUPS.find((g) => g.items.some((i) => i.id === section))?.title;

  const exportRows = useMemo(() => {
    if (data?.details?.length && columns.length) {
      return data.details.map((row) => {
        const out = {};
        columns.forEach((c) => { out[c.key] = formatCell(c.key, row[c.key]); });
        return out;
      });
    }
    return (data?.kpis || []).map((k) => ({
      metric: k.label,
      value: formatKpiValue(k),
    }));
  }, [data, columns]);

  const exportColumns = useMemo(() => {
    if (data?.details?.length && columns.length) return columns;
    return [
      { key: 'metric', header: 'Metric' },
      { key: 'value', header: 'Value' },
    ];
  }, [data, columns]);

  const handleExport = () => {
    const rangeLabel = `${format(applied.from, 'yyyy-MM-dd')}_to_${format(applied.to, 'yyyy-MM-dd')}`;
    exportToCSV(exportRows, exportColumns, `audit-${section}-${rangeLabel}`);
  };

  const handlePrint = () => {
    printSection('audit-print-area', `Audit Reports — ${sectionMeta?.label || section}`);
  };

  return (
    <div className="audit-shell space-y-3">
      <header className="audit-masthead">
        <div>
          <p className="audit-masthead__eyebrow">{branding?.hospitalName || 'Hospital'} · Governance</p>
          <h1 className="audit-masthead__title">Audit Reports</h1>
          <p className="audit-masthead__sub">
            Corporate control pack — every operational, clinical, financial and facility register,
            plus a full activity trail and exception board for management review
          </p>
        </div>
        <div className="audit-masthead__meta">
          <span className="audit-masthead__stamp">Confidential · Internal use</span>
          <div className="audit-actions">
            <button type="button" onClick={handleExport} className="audit-btn audit-btn--ghost">
              <FileSpreadsheet size={13} /> Export CSV
            </button>
            <button type="button" onClick={handlePrint} className="audit-btn audit-btn--ghost">
              <Printer size={13} /> Print
            </button>
            <button type="button" onClick={() => refetch()} className="audit-btn audit-btn--solid">
              <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
        </div>
      </header>

      <div className="audit-period">
        <div className="audit-period__label">
          <CalendarRange size={14} />
          Reporting period
        </div>
        <div className="audit-period__presets">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => handlePreset(p.id)}
              className={`audit-period__preset ${preset === p.id ? 'is-active' : ''}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="audit-period__dates">
          <input
            type="date"
            value={format(draft.from, 'yyyy-MM-dd')}
            onChange={(e) => {
              setPreset('custom');
              setDraft((d) => ({ ...d, from: startOfDay(new Date(e.target.value)) }));
            }}
          />
          <span style={{ fontSize: 11, color: 'var(--ar-muted)' }}>to</span>
          <input
            type="date"
            value={format(draft.to, 'yyyy-MM-dd')}
            onChange={(e) => {
              setPreset('custom');
              setDraft((d) => ({ ...d, to: endOfDay(new Date(e.target.value)) }));
            }}
          />
          <button type="button" onClick={applyCustom} className="audit-period__apply">
            Apply
          </button>
        </div>
      </div>

      <div className="audit-workspace">
        <aside className="audit-rail">
          <div className="audit-rail__head">
            <span>Audit modules</span>
          </div>
          <nav className="audit-rail__nav">
            {NAV_GROUPS.map((group) => (
              <div key={group.title} className="audit-rail__group">
                <p className="audit-rail__group-title">{group.title}</p>
                {group.items.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => selectSection(id)}
                    className={`audit-rail__item ${section === id ? 'is-active' : ''}`}
                  >
                    <Icon size={13} strokeWidth={2} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            ))}
          </nav>
        </aside>

        <div id="audit-print-area" className="audit-content">
          <div className="audit-section-head">
            <div>
              <p className="audit-section-head__crumb">{groupTitle || 'Audit'}</p>
              <h2 className="audit-section-head__title">{sectionMeta?.label || section}</h2>
              <p className="audit-section-head__range">
                {format(applied.from, 'd MMM yyyy')} — {format(applied.to, 'd MMM yyyy')}
                {isFetching && <span className="audit-section-head__live">Updating…</span>}
              </p>
            </div>
            <span className="audit-section-head__badge">
              Generated {format(new Date(), 'd MMM yyyy · HH:mm')}
            </span>
          </div>

          {isLoading && !data ? (
            <div className="py-16 flex justify-center"><LoadingSpinner /></div>
          ) : error ? (
            <div className="audit-error">
              <AlertCircle className="mx-auto mb-2" size={22} color="#b91c1c" />
              <p>Failed to load audit data</p>
              <span>{error?.response?.data?.message || error.message}</span>
            </div>
          ) : (
            <>
              {section === 'executive' && <ExceptionStrip items={data?.exceptions || []} />}
              {section === 'executive' && <ExecutiveScorecard kpis={data?.kpis || []} />}
              {section === 'pharmacy' && <MedicinePnlCard pnl={data?.pnl} />}
              {section !== 'executive' && <KpiGrid items={data?.kpis || []} />}
              {section !== 'executive' && <ExceptionStrip items={data?.exceptions || []} />}

              <div className="audit-split">
                <BreakdownPanel rows={data?.breakdown || []} />
                {(data?.footnotes || []).length > 0 && (
                  <Panel title="Data coverage notes">
                    <ul className="audit-notes">
                      {data.footnotes.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  </Panel>
                )}
              </div>

              {section !== 'executive' && section !== 'system' && (
                <div className="audit-filters">
                  <div className="audit-filters__search">
                    <Search size={14} />
                    <input
                      type="search"
                      value={detailSearch}
                      onChange={(e) => setDetailSearch(e.target.value)}
                      placeholder={section === 'trail' ? 'Search action, module, description, IP…' : 'Search this register…'}
                    />
                  </div>
                  {section === 'trail' && (
                    <>
                      <label className="audit-filters__field">
                        <Filter size={12} />
                        <select
                          value={trailModule}
                          onChange={(e) => { setTrailModule(e.target.value); setPage(1); }}
                        >
                          <option value="">All modules</option>
                          {(data?.meta?.modules || []).map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                      </label>
                      <label className="audit-filters__field">
                        <select
                          value={trailAction}
                          onChange={(e) => { setTrailAction(e.target.value); setPage(1); }}
                        >
                          <option value="">All actions</option>
                          {(data?.meta?.actions || []).map((a) => (
                            <option key={a} value={a}>{a}</option>
                          ))}
                        </select>
                      </label>
                    </>
                  )}
                  {STATUS_FILTER_SECTIONS.has(section) && (
                    <label className="audit-filters__field">
                      <input
                        type="text"
                        value={statusFilter}
                        onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                        placeholder={section === 'stock' ? 'Movement type' : 'Status'}
                      />
                    </label>
                  )}
                </div>
              )}

              <DetailTable
                columns={columns}
                rows={visibleDetails}
                title={DETAIL_TITLES[section] || 'Detail register'}
                total={data?.meta?.total}
              />
              <AuditPager meta={data?.meta} page={page} onPage={setPage} />
              <RegisterTables registers={data?.registers || []} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
