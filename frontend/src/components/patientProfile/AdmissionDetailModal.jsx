import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight } from 'lucide-react';
import Modal from '../common/Modal';
import LoadingSpinner from '../common/LoadingSpinner';
import patientProfileApi from '../../services/patientProfileApi';

function Accordion({ title, count, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-100 dark:border-gray-700 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-900/40 hover:bg-gray-100 dark:hover:bg-gray-900/70 transition-colors"
      >
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{title} {count !== undefined && <span className="text-gray-400 font-normal">({count})</span>}</span>
        {open ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
      </button>
      {open && <div className="p-4 text-sm">{children}</div>}
    </div>
  );
}

const Row = ({ label, value }) => (
  <div className="flex justify-between py-1 border-b border-gray-50 dark:border-gray-800 last:border-0">
    <span className="text-gray-400">{label}</span>
    <span className="text-gray-800 dark:text-gray-200 font-medium text-right">{value ?? '—'}</span>
  </div>
);

export default function AdmissionDetailModal({ patientId, admissionId, onClose }) {
  const { data, isLoading } = useQuery({
    queryKey: ['admissionDetail', patientId, admissionId],
    queryFn: () => patientProfileApi.getAdmissionDetail(patientId, admissionId),
    enabled: !!admissionId,
  });

  return (
    <Modal isOpen={!!admissionId} onClose={onClose} title={data ? `Admission ${data.admissionNumber}` : 'Admission Details'} size="full">
      {isLoading || !data ? <div className="p-8"><LoadingSpinner /></div> : (
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Row label="Admission Date" value={new Date(data.admissionDate).toLocaleString('en-IN')} />
            <Row label="Discharge Date" value={data.dischargeDate ? new Date(data.dischargeDate).toLocaleString('en-IN') : 'Still Admitted'} />
            <Row label="Doctor" value={data.doctor?.name} />
            <Row label="Ward / Room / Bed" value={`${data.ward?.name || '—'} / ${data.room?.roomNumber || '—'} / ${data.bed?.bedNumber || '—'}`} />
          </div>

          <Accordion title="Admission Summary" defaultOpen>
            <Row label="Admission Diagnosis" value={data.admissionDiagnosis} />
            <Row label="Final Diagnosis" value={data.finalDiagnosis} />
            <Row label="Status" value={data.status} />
            <Row label="Discharge Type" value={data.dischargeType} />
          </Accordion>

          <Accordion title="Bed Transfer History" count={data.transferHistory?.length || 0}>
            {(data.transferHistory || []).map((t, i) => (
              <Row key={i} label={new Date(t.transferDate).toLocaleString('en-IN')} value={`${t.fromBed?.bedNumber || '—'} → ${t.toBed?.bedNumber || '—'} (${t.reason || 'transfer'})`} />
            ))}
          </Accordion>

          <Accordion title="Doctor Round History" count={data.doctorRounds?.length || 0}>
            {(data.doctorRounds || []).map((r, i) => (
              <div key={i} className="mb-2 pb-2 border-b border-gray-50 dark:border-gray-800 last:border-0">
                <p className="text-xs text-gray-400">{new Date(r.visitTime).toLocaleString('en-IN')} • Dr. {r.doctor?.name}</p>
                <p>{r.notes}</p>
              </div>
            ))}
          </Accordion>

          <Accordion title="Nursing Notes" count={data.nursingNotes?.length || 0}>
            {(data.nursingNotes || []).map((n, i) => (
              <div key={i} className="mb-2 pb-2 border-b border-gray-50 dark:border-gray-800 last:border-0">
                <p className="text-xs text-gray-400">{new Date(n.recordedAt).toLocaleString('en-IN')} • {n.nurse?.name}</p>
                <p>{n.note}</p>
              </div>
            ))}
          </Accordion>

          <Accordion title="Medication Administration Record (MAR)" count={data.medications?.length || 0}>
            {(data.medications || []).map((m, i) => (
              <Row key={i} label={`${m.medicineName} (${m.dosage || ''})`} value={`${m.frequency} • ${m.route} • by ${m.administeredBy?.name || '—'}`} />
            ))}
          </Accordion>

          <Accordion title="Service / Machine Usage" count={data.serviceUsages?.length || 0}>
            {(data.serviceUsages || []).map((s, i) => (
              <Row key={i} label={`${s.serviceName} (${s.category})`} value={`Qty ${s.quantity} • ₹${s.unitPrice} • ${new Date(s.usedAt).toLocaleDateString('en-IN')}`} />
            ))}
          </Accordion>

          <Accordion title="Lab History" count={data.labTests?.length || 0}>
            {(data.labTests || []).map((l) => (
              <Row key={l._id} label={`${l.labNumber} (${l.labType})`} value={`${l.status} • ${new Date(l.createdAt).toLocaleDateString('en-IN')}`} />
            ))}
          </Accordion>

          <Accordion title="Operations / Procedures" count={data.operations?.length || 0}>
            {(data.operations || []).map((o) => (
              <Row key={o._id} label={o.operationName} value={`${o.surgeon?.name || '—'} • ${o.status}`} />
            ))}
          </Accordion>

          <Accordion title="Diet / Physiotherapy Orders" count={0}>
            <p className="text-gray-400">No diet or physiotherapy orders logged yet for this admission.</p>
          </Accordion>

          <Accordion title="Doctor Notes / Discharge Summary">
            <p className="whitespace-pre-line">{data.dischargeSummary || data.dischargeDetails?.hospitalCourse || 'Not yet documented.'}</p>
          </Accordion>

          <Accordion title="Documents" count={data.documents?.length || 0}>
            {(data.documents || []).map((d) => (
              <Row key={d._id} label={d.title} value={<a className="text-blue-600 underline" href={d.fileUrl} target="_blank" rel="noreferrer">View</a>} />
            ))}
          </Accordion>

          <Accordion title="Final Bill" count={data.bills?.length || 0}>
            {(data.bills || []).map((b) => (
              <Row key={b._id} label={b.billNumber} value={`₹${b.totalAmount} • Paid ₹${b.paidAmount} • Due ₹${b.dueAmount}`} />
            ))}
          </Accordion>
        </div>
      )}
    </Modal>
  );
}
