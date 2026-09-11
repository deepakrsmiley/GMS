import React, { useEffect, useState } from 'react';
import { Download, Printer, RotateCcw, RotateCw, ZoomIn, ZoomOut, RefreshCw, X } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../common/Modal';
import patientProfileApi, { documentFileUrl, fetchProtectedBlob } from '../../services/patientProfileApi';
import '../../styles/prescriptionScan.css';

const fmt = (v) => (v ? new Date(v).toLocaleString('en-IN') : '—');
const doctorName = (name) => {
  if (!name) return '—';
  const cleaned = String(name).replace(/^(dr\.?\s*)+/i, '').trim();
  return cleaned ? `Dr. ${cleaned}` : '—';
};
const opNumber = (token) => {
  const raw = String(token || '').replace(/^T-?/i, '');
  return raw ? `OP-${raw.padStart(4, '0')}` : '—';
};

export default function PrescriptionDocumentViewer({
  isOpen,
  onClose,
  patientId,
  patient,
  document: doc,
  canManage = false,
  onReplace,
  onDeleted,
}) {
  const [blobUrl, setBlobUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [confirm, setConfirm] = useState(null); // 'replace' | 'delete'

  const visit = doc?.opRegistration;
  const isPdf = String(doc?.fileType || doc?.mimeType || '').toLowerCase().includes('pdf');
  const fileUrl = documentFileUrl(patientId, doc);

  useEffect(() => {
    if (!isOpen || !doc) {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      setBlobUrl('');
      setZoom(1);
      setRotation(0);
      setConfirm(null);
      return undefined;
    }
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        if (doc.hasSecureFile || (fileUrl && fileUrl.startsWith('/api/'))) {
          const blob = await fetchProtectedBlob(fileUrl);
          if (!active) return;
          setBlobUrl(URL.createObjectURL(blob));
        } else if (fileUrl) {
          setBlobUrl(fileUrl);
        }
      } catch (err) {
        toast.error(err.message || 'Could not open the prescription');
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [isOpen, doc?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => {
    if (blobUrl && blobUrl.startsWith('blob:')) URL.revokeObjectURL(blobUrl);
  }, [blobUrl]);

  const download = async () => {
    try {
      const url = documentFileUrl(patientId, doc, { download: true });
      if (doc.hasSecureFile || url.startsWith('/api/')) {
        const blob = await fetchProtectedBlob(url);
        const href = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = href;
        a.download = doc.originalFileName || `${doc.documentNumber || 'prescription'}.pdf`;
        a.click();
        URL.revokeObjectURL(href);
      } else {
        window.open(url, '_blank', 'noopener');
      }
    } catch (err) {
      toast.error(err.message || 'Download failed');
    }
  };

  const printDoc = async () => {
    try {
      const href = blobUrl || URL.createObjectURL(await fetchProtectedBlob(fileUrl));
      const frame = document.createElement('iframe');
      frame.style.position = 'fixed';
      frame.style.right = '0';
      frame.style.bottom = '0';
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
        setTimeout(() => frame.remove(), 1500);
      };
    } catch (err) {
      toast.error(err.message || 'Print failed');
    }
  };

  const doDelete = async () => {
    try {
      await patientProfileApi.deleteDocument(patientId, doc._id);
      toast.success('Prescription removed from the active record');
      setConfirm(null);
      onDeleted?.(doc);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not delete this document');
    }
  };

  if (!doc) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Prescription document"
      subtitle={`${patient?.name || doc.title || ''} · ${doc.documentNumber || ''}`.trim()}
      size="full"
      headerActions={(
        <div className="flex items-center gap-1">
          <button type="button" className="rxscan-tool" onClick={() => setZoom((z) => Math.min(4, z * 1.2))} title="Zoom in"><ZoomIn size={14} /></button>
          <button type="button" className="rxscan-tool" onClick={() => setZoom((z) => Math.max(0.4, z / 1.2))} title="Zoom out"><ZoomOut size={14} /></button>
          <button type="button" className="rxscan-tool" onClick={() => setRotation((r) => r - 90)} title="Rotate left"><RotateCcw size={14} /></button>
          <button type="button" className="rxscan-tool" onClick={() => setRotation((r) => r + 90)} title="Rotate right"><RotateCw size={14} /></button>
          <button type="button" className="rxscan-tool" onClick={download}><Download size={14} /> Download</button>
          <button type="button" className="rxscan-tool" onClick={printDoc}><Printer size={14} /> Print</button>
        </div>
      )}
    >
      <div className="rxscan-viewer" style={{ position: 'relative' }}>
        <aside className="rxscan-viewer-side">
          <h4>Patient</h4>
          <div className="rxscan-kv">
            <div className="rxscan-meta-k">Name</div>
            <div className="rxscan-meta-v">{patient?.name || '—'}</div>
          </div>
          <div className="rxscan-kv">
            <div className="rxscan-meta-k">UHID</div>
            <div className="rxscan-meta-v">{patient?.patientId || '—'}</div>
          </div>
          <h4 style={{ marginTop: 16 }}>Visit</h4>
          <div className="rxscan-kv">
            <div className="rxscan-meta-k">OP Number</div>
            <div className="rxscan-meta-v">{opNumber(visit?.tokenNumber)}</div>
          </div>
          <div className="rxscan-kv">
            <div className="rxscan-meta-k">Date &amp; time</div>
            <div className="rxscan-meta-v">{fmt(doc.visitDate || visit?.tokenDate || doc.createdAt)}</div>
          </div>
          <h4 style={{ marginTop: 16 }}>Doctor</h4>
          <div className="rxscan-kv">
            <div className="rxscan-meta-v">{doctorName(doc.doctor?.name)}</div>
            <div className="rxscan-row-sub">{doc.department?.name || '—'}</div>
          </div>
          <h4 style={{ marginTop: 16 }}>Document</h4>
          <div className="rxscan-row-sub">
            {doc.documentNumber || '—'} · {(doc.fileType || 'file').toUpperCase()}
            {doc.pageCount ? ` · ${doc.pageCount} page${doc.pageCount === 1 ? '' : 's'}` : ''}
            {doc.fileSizeKB ? ` · ${doc.fileSizeKB} KB` : ''}
          </div>
          <div className="rxscan-row-sub" style={{ marginTop: 6 }}>
            Uploaded by {doc.uploadedBy?.name || '—'} · {fmt(doc.createdAt)}
          </div>
          {canManage && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
              <button type="button" className="btn-secondary text-sm" onClick={() => setConfirm('replace')}>
                <RefreshCw size={13} /> Re-scan / Replace
              </button>
              <button type="button" className="btn-danger text-sm" onClick={() => setConfirm('delete')}>
                Remove document
              </button>
            </div>
          )}
        </aside>
        <div className="rxscan-viewer-main">
          {loading && <p className="text-slate-500 text-sm">Loading document…</p>}
          {!loading && blobUrl && isPdf && (
            <iframe title="Scanned prescription" src={blobUrl} />
          )}
          {!loading && blobUrl && !isPdf && (
            <img
              src={blobUrl}
              alt="Scanned prescription"
              style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
            />
          )}
          {!loading && !blobUrl && <p className="text-slate-500 text-sm">Document is not available.</p>}
        </div>

        {confirm && (
          <div className="rxscan-confirm">
            <div className="rxscan-confirm-card">
              <h3>{confirm === 'replace' ? 'Replace this prescription?' : 'Remove this prescription?'}</h3>
              <p>
                {confirm === 'replace'
                  ? 'Are you sure you want to replace this prescription? The previous scan remains in the audit history.'
                  : 'This medical document will be marked deleted and recorded in the audit log. The file is not exposed publicly.'}
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="btn-secondary" onClick={() => setConfirm(null)}>
                  <X size={14} /> Cancel
                </button>
                {confirm === 'replace' ? (
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => { setConfirm(null); onReplace?.(doc); }}
                  >
                    Replace
                  </button>
                ) : (
                  <button type="button" className="btn-danger" onClick={doDelete}>Delete</button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
