import React, { useState } from 'react';
import { Download, Eye, FileText, Printer, ScanLine, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import LoadingSpinner from '../common/LoadingSpinner';
import PrescriptionDocumentViewer from '../op/PrescriptionDocumentViewer';
import { documentFileUrl, fetchProtectedBlob } from '../../services/patientProfileApi';
import '../../styles/prescriptionScan.css';

const doctorName = (name) => {
  if (!name) return '—';
  const cleaned = String(name).replace(/^(dr\.?\s*)+/i, '').trim();
  return cleaned ? `Dr. ${cleaned}` : '—';
};
const opNumber = (token) => {
  const raw = String(token || '').replace(/^T-?/i, '');
  return raw ? `OP-${raw.padStart(4, '0')}` : '—';
};
const fmtDate = (v) => (v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const fmtTime = (v) => (v ? new Date(v).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—');

async function downloadDoc(patientId, doc) {
  const url = documentFileUrl(patientId, doc, { download: true });
  if (doc.hasSecureFile || String(url).startsWith('/api/')) {
    const blob = await fetchProtectedBlob(url);
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = doc.originalFileName || `${doc.documentNumber || 'prescription'}.pdf`;
    a.click();
    URL.revokeObjectURL(href);
    return;
  }
  window.open(url, '_blank', 'noopener');
}

async function printDoc(patientId, doc) {
  const url = documentFileUrl(patientId, doc);
  const blob = (doc.hasSecureFile || String(url).startsWith('/api/'))
    ? await fetchProtectedBlob(url)
    : null;
  const href = blob ? URL.createObjectURL(blob) : url;
  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  document.body.appendChild(frame);
  frame.src = href;
  frame.onload = () => {
    try {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    } catch {
      window.open(href, '_blank', 'noopener');
    }
    setTimeout(() => {
      frame.remove();
      if (blob) URL.revokeObjectURL(href);
    }, 1500);
  };
}

export default function ScannedPrescriptionsSection({
  patientId,
  patient,
  documents = [],
  isLoading,
  canManage = false,
  visits = [],
  visitsLoading = false,
  onReplace,
  onRefresh,
  onScan,
  onBulkScan,
}) {
  const [openDoc, setOpenDoc] = useState(null);
  const rows = (documents || []).filter((d) => d.category === 'Prescription' || d.documentNumber);
  const hasVisits = (visits || []).length > 0;

  const startScan = (bulk) => {
    if (!hasVisits) {
      toast.error('This patient has no OP visit yet. Create an OP visit first, then scan the prescription against that visit.');
      return;
    }
    if (bulk) onBulkScan?.();
    else onScan?.();
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-blue-100 dark:border-gray-700 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-blue-50/70 dark:bg-slate-900/40 border-b border-blue-100 dark:border-gray-700">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">Scanned Prescriptions</h3>
          <p className="text-[11px] text-slate-500 mt-0.5">{rows.length} document{rows.length !== 1 ? 's' : ''} linked to OP visits</p>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary text-xs py-1.5 px-2.5" onClick={() => startScan(false)} disabled={visitsLoading}>
              <ScanLine size={13} /> Scan Prescription
            </button>
            <button type="button" className="btn-primary text-xs py-1.5 px-2.5" onClick={() => startScan(true)} disabled={visitsLoading}>
              <Upload size={13} /> Bulk Scan
            </button>
          </div>
        )}
      </div>
      <div className="p-4">
        {rows.length === 0 ? (
          <div className="text-center text-gray-400 py-10">
            <p>No scanned physical prescriptions yet</p>
            {canManage && (
              <button type="button" className="btn-primary text-sm mt-4 mx-auto" onClick={() => startScan(true)}>
                <Upload size={14} /> Bulk scan prescriptions
              </button>
            )}
          </div>
        ) : (
          <div className="rxscan-list">
            {rows.map((doc) => {
              const when = doc.visitDate || doc.opRegistration?.tokenDate || doc.createdAt;
              return (
                <div key={doc._id} className="rxscan-row">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="rxscan-thumb"><FileText size={18} /></div>
                    <div className="min-w-0">
                      <div className="rxscan-row-title">
                        {fmtDate(when)} · {fmtTime(when)} · {opNumber(doc.opRegistration?.tokenNumber)} · {doctorName(doc.doctor?.name)}
                      </div>
                      <div className="rxscan-row-sub">
                        {doc.department?.name || '—'} · Physical prescription · {(doc.fileType || 'PDF').toUpperCase()}
                        {doc.pageCount ? ` · ${doc.pageCount} page${doc.pageCount === 1 ? '' : 's'}` : ''}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="rxscan-tool" onClick={() => setOpenDoc(doc)}><Eye size={13} /> View</button>
                    <button type="button" className="rxscan-tool" onClick={() => downloadDoc(patientId, doc).catch(() => {})}><Download size={13} /> Download</button>
                    <button type="button" className="rxscan-tool" onClick={() => printDoc(patientId, doc).catch(() => {})}><Printer size={13} /> Print</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <PrescriptionDocumentViewer
        isOpen={!!openDoc}
        onClose={() => setOpenDoc(null)}
        patientId={patientId}
        patient={patient}
        document={openDoc}
        canManage={canManage}
        onReplace={(doc) => { setOpenDoc(null); onReplace?.(doc); }}
        onDeleted={() => { setOpenDoc(null); onRefresh?.(); }}
      />
    </div>
  );
}
