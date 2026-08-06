import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, LayoutDashboard, History as HistoryIcon, Stethoscope, BedDouble,
  ArrowRightLeft, UserRound, Pill, FlaskConical, Scan, Syringe, HardDrive,
  Scissors, Receipt, Wallet, FileText, ScrollText, Plus,
} from 'lucide-react';
import toast from 'react-hot-toast';

import LoadingSpinner from '../../components/common/LoadingSpinner';
import HistorySectionTable from '../../components/patientProfile/HistorySectionTable';
import PatientSummaryHeader from '../../components/patientProfile/PatientSummaryHeader';
import PatientTimelineView from '../../components/patientProfile/PatientTimelineView';
import AlertsBar from '../../components/patientProfile/AlertsBar';
import AdmissionDetailModal from '../../components/patientProfile/AdmissionDetailModal';
import DocumentVault from '../../components/patientProfile/DocumentVault';
import OperationFormModal from '../../components/patientProfile/OperationFormModal';
import patientProfileApi from '../../services/patientProfileApi';
import '../../styles/patient360.css';

const money = (v) => `₹${(v || 0).toLocaleString('en-IN')}`;
const dt = (v) => (v ? new Date(v).toLocaleString('en-IN') : '—');
const d = (v) => (v ? new Date(v).toLocaleDateString('en-IN') : '—');

const NAV = [
  { key: 'summary', label: 'Summary', icon: LayoutDashboard },
  { key: 'timeline', label: 'Timeline', icon: HistoryIcon },
  { key: 'op', label: 'OP History', icon: Stethoscope },
  { key: 'ip', label: 'IP Admissions', icon: BedDouble },
  { key: 'rooms', label: 'Room History', icon: ArrowRightLeft },
  { key: 'doctors', label: 'Doctor History', icon: UserRound },
  { key: 'medicines', label: 'Medicine History', icon: Pill },
  { key: 'lab', label: 'Lab History', icon: FlaskConical },
  { key: 'radiology', label: 'Radiology History', icon: Scan },
  { key: 'procedures', label: 'Procedure History', icon: Syringe },
  { key: 'machines', label: 'Machine Usage', icon: HardDrive },
  { key: 'operations', label: 'Operation History', icon: Scissors },
  { key: 'billing', label: 'Billing History', icon: Receipt },
  { key: 'payments', label: 'Payment History', icon: Wallet },
  { key: 'documents', label: 'Documents', icon: FileText },
  { key: 'audit', label: 'Audit History', icon: ScrollText },
];

export default function PatientProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('summary');
  const [openAdmission, setOpenAdmission] = useState(null);
  const [showOpForm, setShowOpForm] = useState(false);

  const summaryQ = useQuery({ queryKey: ['patientProfile', 'summary', id], queryFn: () => patientProfileApi.getSummary(id) });
  const alertsQ = useQuery({ queryKey: ['patientProfile', 'alerts', id], queryFn: () => patientProfileApi.getAlerts(id) });

  const timelineQ = useQuery({ queryKey: ['patientProfile', 'timeline', id], queryFn: () => patientProfileApi.getTimeline(id), enabled: activeTab === 'timeline' });
  const opQ = useQuery({ queryKey: ['patientProfile', 'op', id], queryFn: () => patientProfileApi.getOPHistory(id), enabled: activeTab === 'op' });
  const ipQ = useQuery({ queryKey: ['patientProfile', 'ip-history', id], queryFn: () => patientProfileApi.getIPHistory(id), enabled: activeTab === 'ip' });
  const roomsQ = useQuery({ queryKey: ['patientProfile', 'rooms', id], queryFn: () => patientProfileApi.getRoomHistory(id), enabled: activeTab === 'rooms' });
  const doctorsQ = useQuery({ queryKey: ['patientProfile', 'doctors', id], queryFn: () => patientProfileApi.getDoctorHistory(id), enabled: activeTab === 'doctors' });
  const medsQ = useQuery({ queryKey: ['patientProfile', 'medicines', id], queryFn: () => patientProfileApi.getMedicineHistory(id), enabled: activeTab === 'medicines' });
  const labQ = useQuery({ queryKey: ['patientProfile', 'lab', id], queryFn: () => patientProfileApi.getLabHistory(id, 'lab'), enabled: activeTab === 'lab' });
  const radioQ = useQuery({ queryKey: ['patientProfile', 'radiology', id], queryFn: () => patientProfileApi.getLabHistory(id, 'radiology'), enabled: activeTab === 'radiology' });
  const procQ = useQuery({ queryKey: ['patientProfile', 'procedures', id], queryFn: () => patientProfileApi.getProcedureHistory(id), enabled: activeTab === 'procedures' });
  const machineQ = useQuery({ queryKey: ['patientProfile', 'machines', id], queryFn: () => patientProfileApi.getMachineHistory(id), enabled: activeTab === 'machines' });
  const opsQ = useQuery({ queryKey: ['patientProfile', 'operation-history', id], queryFn: () => patientProfileApi.getOperationHistory(id), enabled: activeTab === 'operations' });
  const billQ = useQuery({ queryKey: ['patientProfile', 'billing', id], queryFn: () => patientProfileApi.getBillingHistory(id), enabled: activeTab === 'billing' });
  const payQ = useQuery({ queryKey: ['patientProfile', 'payments', id], queryFn: () => patientProfileApi.getPaymentHistory(id), enabled: activeTab === 'payments' });
  const docsQ = useQuery({ queryKey: ['patientProfile', 'documents', id], queryFn: () => patientProfileApi.getDocuments(id), enabled: activeTab === 'documents' });
  const auditQ = useQuery({ queryKey: ['patientProfile', 'audit', id], queryFn: () => patientProfileApi.getAuditHistory(id), enabled: activeTab === 'audit', onError: () => toast.error('Not authorized to view audit history') });

  if (summaryQ.isLoading) return <LoadingSpinner fullScreen />;
  if (summaryQ.isError) {
    return (
      <div className="p360 p-10 text-center">
        <p className="text-slate-500">Could not load this patient's profile.</p>
        <button type="button" onClick={() => navigate('/patients')} className="btn-secondary mt-4 mx-auto">Back to Patients</button>
      </div>
    );
  }

  const stats = summaryQ.data?.stats || {};

  return (
    <div className="p360 space-y-4">
      <div className="p360-topbar">
        <button type="button" onClick={() => navigate('/patients')} className="p360-back" aria-label="Back to patients">
          <ArrowLeft size={16} />
        </button>
        <div>
          <p className="p360-topbar__eyebrow">Electronic Medical Record</p>
          <h1 className="p360-topbar__title">Patient 360° Profile</h1>
        </div>
      </div>

      <AlertsBar alerts={alertsQ.data} />
      <PatientSummaryHeader data={summaryQ.data} />

      <div className="p360-layout">
        <aside className="p360-nav">
          <nav className="p360-nav__card" aria-label="Patient profile sections">
            {NAV.map((n) => {
              const Icon = n.icon;
              return (
                <button
                  key={n.key}
                  type="button"
                  onClick={() => setActiveTab(n.key)}
                  className={`p360-nav__btn${activeTab === n.key ? ' is-active' : ''}`}
                >
                  <Icon size={14} /> {n.label}
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="p360-content">
          {activeTab === 'summary' && (
            <section className="p360-panel">
              <div className="p360-panel__head">
                <h3 className="p360-panel__title">Overview</h3>
              </div>
              <div className="p360-panel__body">
                <div className="p360-overview">
                  <div className="p360-overview__card">
                    <h4>Clinical record</h4>
                    <p>
                      Use the left navigation to open this patient’s lifetime history — OP visits,
                      admissions, lab &amp; radiology, medicines, billing, documents and more.
                      Sections refresh automatically as new records are created across the hospital.
                    </p>
                  </div>
                  <div className="p360-overview__card">
                    <h4>At a glance</h4>
                    <ul className="p360-overview__list">
                      <li><span>OP visits</span><strong>{stats.totalOPVisits ?? 0}</strong></li>
                      <li><span>IP admissions</span><strong>{stats.totalAdmissions ?? 0}</strong></li>
                      <li><span>Procedures</span><strong>{stats.totalProcedures ?? 0}</strong></li>
                      <li><span>Outstanding</span><strong>{money(stats.outstandingAmount)}</strong></li>
                    </ul>
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeTab === 'timeline' && <PatientTimelineView events={timelineQ.data} loading={timelineQ.isLoading} />}

          {activeTab === 'op' && (
            <HistorySectionTable
              title="OP History" filename={`OP-History-${id}`} loading={opQ.isLoading} rows={opQ.data || []}
              columns={[
                { key: 'tokenNumber', header: 'Token #' },
                { key: 'createdAt', header: 'Date', render: (r) => d(r.createdAt) },
                { key: 'doctor', header: 'Doctor', render: (r) => r.doctor?.name },
                { key: 'department', header: 'Department', render: (r) => r.department?.name },
                { key: 'chiefComplaint', header: 'Chief Complaint' },
                { key: 'diagnosis', header: 'Diagnosis' },
                { key: 'status', header: 'Status', render: (r) => <span className="badge-blue">{r.status}</span> },
                { key: 'bill', header: 'Bill', render: (r) => r.bill ? `${r.bill.billNumber} (${money(r.bill.totalAmount)})` : '—' },
              ]}
            />
          )}

          {activeTab === 'ip' && (
            <HistorySectionTable
              title="IP Admission History" filename={`IP-History-${id}`} loading={ipQ.isLoading} rows={ipQ.data || []}
              onRowClick={(r) => setOpenAdmission(r._id)}
              columns={[
                { key: 'admissionNumber', header: 'Admission #' },
                { key: 'admissionDate', header: 'Admission Date', render: (r) => d(r.admissionDate) },
                { key: 'dischargeDate', header: 'Discharge Date', render: (r) => d(r.dischargeDate) },
                { key: 'lengthOfStay', header: 'LOS (days)' },
                { key: 'ward', header: 'Ward', render: (r) => r.ward?.name },
                { key: 'doctor', header: 'Consultant', render: (r) => r.doctor?.name },
                { key: 'finalDiagnosis', header: 'Diagnosis', render: (r) => r.finalDiagnosis || r.admissionDiagnosis },
                { key: 'status', header: 'Status', render: (r) => <span className="badge-blue">{r.status}</span> },
                { key: 'outstanding', header: 'Outstanding', render: (r) => money(r.outstanding) },
              ]}
            />
          )}

          {activeTab === 'rooms' && (
            <HistorySectionTable
              title="Room / Bed History" filename={`Room-History-${id}`} loading={roomsQ.isLoading} rows={roomsQ.data || []}
              columns={[
                { key: 'admissionNumber', header: 'Admission #' },
                { key: 'ward', header: 'Ward' },
                { key: 'room', header: 'Room' },
                { key: 'bed', header: 'Bed' },
                { key: 'fromDate', header: 'From', render: (r) => dt(r.fromDate) },
                { key: 'toDate', header: 'To', render: (r) => r.toDate ? dt(r.toDate) : 'Current' },
                { key: 'reason', header: 'Reason' },
                { key: 'charges', header: 'Charges/day', render: (r) => money(r.charges) },
              ]}
            />
          )}

          {activeTab === 'doctors' && (
            <HistorySectionTable
              title="Doctor History" filename={`Doctor-History-${id}`} loading={doctorsQ.isLoading} rows={doctorsQ.data || []}
              columns={[
                { key: 'doctorName', header: 'Doctor' },
                { key: 'department', header: 'Department' },
                { key: 'visits', header: 'OP Visits' },
                { key: 'admissions', header: 'Admissions' },
                { key: 'procedures', header: 'Procedures' },
                { key: 'operations', header: 'Operations' },
                { key: 'revenue', header: 'Revenue Generated', render: (r) => money(r.revenue) },
              ]}
            />
          )}

          {activeTab === 'medicines' && (
            <HistorySectionTable
              title="Medicine History" filename={`Medicine-History-${id}`} loading={medsQ.isLoading} rows={medsQ.data || []}
              columns={[
                { key: 'date', header: 'Date', render: (r) => d(r.date) },
                { key: 'medicine', header: 'Medicine' },
                { key: 'dose', header: 'Dose' },
                { key: 'frequency', header: 'Frequency' },
                { key: 'source', header: 'Source', render: (r) => <span className="badge-gray">{r.source}</span> },
                { key: 'doctor', header: 'Doctor / Administered By', render: (r) => r.doctor || r.administeredBy },
                { key: 'admissionNumber', header: 'Admission #' },
                { key: 'batchNumber', header: 'Batch #' },
              ]}
            />
          )}

          {activeTab === 'lab' && (
            <HistorySectionTable
              title="Lab History" filename={`Lab-History-${id}`} loading={labQ.isLoading} rows={labQ.data || []}
              columns={[
                { key: 'labNumber', header: 'Lab #' },
                { key: 'createdAt', header: 'Date', render: (r) => d(r.createdAt) },
                { key: 'labType', header: 'Type' },
                { key: 'doctor', header: 'Ordered By', render: (r) => r.doctor?.name },
                { key: 'status', header: 'Status', render: (r) => <span className="badge-blue">{r.status}</span> },
                { key: 'tests', header: 'Tests', render: (r) => (r.tests || []).map((t) => t.testName).join(', ') },
              ]}
            />
          )}

          {activeTab === 'radiology' && (
            <HistorySectionTable
              title="Radiology History" filename={`Radiology-History-${id}`} loading={radioQ.isLoading} rows={radioQ.data || []}
              columns={[
                { key: 'labNumber', header: 'Ref #' },
                { key: 'createdAt', header: 'Date', render: (r) => d(r.createdAt) },
                { key: 'labType', header: 'Scan Type' },
                { key: 'doctor', header: 'Doctor', render: (r) => r.doctor?.name },
                { key: 'status', header: 'Status', render: (r) => <span className="badge-blue">{r.status}</span> },
              ]}
            />
          )}

          {activeTab === 'procedures' && (
            <HistorySectionTable
              title="Procedure History" filename={`Procedure-History-${id}`} loading={procQ.isLoading} rows={procQ.data || []}
              columns={[
                { key: 'date', header: 'Date', render: (r) => dt(r.date) },
                { key: 'procedure', header: 'Procedure' },
                { key: 'category', header: 'Category' },
                { key: 'admissionNumber', header: 'Admission #' },
                { key: 'administeredBy', header: 'By' },
                { key: 'unitPrice', header: 'Charges', render: (r) => money(r.unitPrice * (r.quantity || 1)) },
              ]}
            />
          )}

          {activeTab === 'machines' && (
            <HistorySectionTable
              title="Machine Usage History" filename={`Machine-Usage-${id}`} loading={machineQ.isLoading} rows={machineQ.data || []}
              columns={[
                { key: 'machine', header: 'Machine' },
                { key: 'department', header: 'Department' },
                { key: 'operator', header: 'Operator' },
                { key: 'startTime', header: 'Used At', render: (r) => dt(r.startTime) },
                { key: 'charges', header: 'Charges', render: (r) => money(r.charges) },
                { key: 'remarks', header: 'Remarks' },
              ]}
            />
          )}

          {activeTab === 'operations' && (
            <HistorySectionTable
              title="Operation History" filename={`Operation-History-${id}`} loading={opsQ.isLoading} rows={opsQ.data || []}
              extraActions={<button onClick={() => setShowOpForm(true)} className="btn-primary text-xs py-1.5 px-2.5"><Plus size={13} /> Add</button>}
              columns={[
                { key: 'operationName', header: 'Operation' },
                { key: 'ot', header: 'OT' },
                { key: 'surgeon', header: 'Surgeon', render: (r) => r.surgeon?.name },
                { key: 'anesthetist', header: 'Anesthetist', render: (r) => r.anesthetist?.name },
                { key: 'startTime', header: 'Time', render: (r) => dt(r.startTime || r.scheduledDate) },
                { key: 'status', header: 'Status', render: (r) => <span className="badge-blue">{r.status}</span> },
                { key: 'complications', header: 'Complications' },
              ]}
            />
          )}

          {activeTab === 'billing' && (
            <HistorySectionTable
              title="Billing History" filename={`Billing-History-${id}`} loading={billQ.isLoading} rows={billQ.data || []}
              columns={[
                { key: 'billNumber', header: 'Bill #' },
                { key: 'createdAt', header: 'Date', render: (r) => d(r.createdAt) },
                { key: 'billType', header: 'Type' },
                { key: 'totalAmount', header: 'Total', render: (r) => money(r.totalAmount) },
                { key: 'paidAmount', header: 'Paid', render: (r) => money(r.paidAmount) },
                { key: 'dueAmount', header: 'Outstanding', render: (r) => money(r.dueAmount) },
                { key: 'status', header: 'Status', render: (r) => <span className={r.status === 'paid' ? 'badge-green' : r.status === 'pending' ? 'badge-red' : 'badge-yellow'}>{r.status}</span> },
              ]}
            />
          )}

          {activeTab === 'payments' && (
            <HistorySectionTable
              title="Payment History" filename={`Payment-History-${id}`} loading={payQ.isLoading} rows={payQ.data || []}
              columns={[
                { key: 'billNumber', header: 'Bill #' },
                { key: 'paidAt', header: 'Date', render: (r) => dt(r.paidAt) },
                { key: 'amount', header: 'Amount', render: (r) => money(r.amount) },
                { key: 'mode', header: 'Mode', render: (r) => <span className="badge-gray">{r.mode}</span> },
                { key: 'reference', header: 'Reference' },
              ]}
            />
          )}

          {activeTab === 'documents' && <DocumentVault patientId={id} data={docsQ.data} isLoading={docsQ.isLoading} />}

          {activeTab === 'audit' && (
            <HistorySectionTable
              title="Audit History" filename={`Audit-History-${id}`} loading={auditQ.isLoading} rows={auditQ.data || []}
              emptyText="No audit trail available, or you don't have permission to view it."
              columns={[
                { key: 'createdAt', header: 'Timestamp', render: (r) => dt(r.createdAt) },
                { key: 'action', header: 'Action' },
                { key: 'module', header: 'Module' },
                { key: 'user', header: 'User', render: (r) => r.user?.name },
                { key: 'description', header: 'Description' },
              ]}
            />
          )}
        </div>
      </div>

      <AdmissionDetailModal patientId={id} admissionId={openAdmission} onClose={() => setOpenAdmission(null)} />
      <OperationFormModal patientId={id} isOpen={showOpForm} onClose={() => setShowOpForm(false)} />
    </div>
  );
}
