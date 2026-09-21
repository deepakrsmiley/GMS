import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, FileText, Plus, ScanLine, Trash2, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../common/Modal';
import patientProfileApi from '../../services/patientProfileApi';
import {
  ACCEPT_TYPES, blobFromVideo, ensurePreparedPage, fileToPage, isImageFile, isPdfFile,
  prefetchPreparedPage, revokePage,
} from '../../utils/prescriptionImage';
import '../../styles/prescriptionScan.css';

const fmtDate = (v) => (v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const doctorName = (name) => {
  if (!name) return '—';
  const cleaned = String(name).replace(/^(dr\.?\s*)+/i, '').trim();
  return cleaned ? `Dr. ${cleaned}` : '—';
};
const opNumber = (token) => {
  const raw = String(token || '').replace(/^T-?/i, '');
  return raw ? `OP-${raw.padStart(4, '0')}` : '—';
};
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `b-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
const stopStream = (stream) => {
  stream?.getTracks?.().forEach((t) => t.stop());
};

const visitLabel = (v) => {
  if (!v) return 'Select OP visit';
  const when = v.tokenDate || v.createdAt;
  return `${opNumber(v.tokenNumber)} · ${fmtDate(when)} · ${doctorName(v.doctor?.name)}${v.department?.name ? ` · ${v.department.name}` : ''}`;
};

const MAX_ITEMS = 30;

/**
 * Bulk scan from Patient 360 → Scanned Prescriptions.
 * Each dropped file / captured page becomes its own prescription (default),
 * still linked to a chosen OP visit.
 */
export default function BulkScanPrescriptionModal({
  isOpen,
  onClose,
  patient,
  visits = [],
  onSaved,
}) {
  const patientId = patient?._id;
  const fileRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const defaultVisitId = visits[0]?._id || '';
  const [tab, setTab] = useState('upload');
  const [mode, setMode] = useState('each'); // each | combine
  const [defaultVisit, setDefaultVisit] = useState(defaultVisitId);
  const [items, setItems] = useState([]);
  const [activeId, setActiveId] = useState('');
  const [grayscale, setGrayscale] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [cameras, setCameras] = useState([]);
  const [cameraId, setCameraId] = useState('');
  const [cameraError, setCameraError] = useState('');

  const active = items.find((i) => i.id === activeId) || items[items.length - 1];

  const reset = () => {
    items.forEach((item) => item.pages.forEach(revokePage));
    setItems([]);
    setActiveId('');
    setTab('upload');
    setMode('each');
    setGrayscale(false);
    setProgress('');
    stopStream(streamRef.current);
    streamRef.current = null;
  };

  useEffect(() => {
    if (isOpen) {
      setDefaultVisit(visits[0]?._id || '');
      return undefined;
    }
    reset();
    return undefined;
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => stopStream(streamRef.current), []);

  const visitById = (id) => visits.find((v) => String(v._id) === String(id));

  const pushItems = (nextItems) => {
    nextItems.forEach((item) => item.pages.forEach((p) => prefetchPreparedPage(p, { grayscale })));
    setItems((prev) => {
      const merged = [...prev, ...nextItems].slice(0, MAX_ITEMS);
      if (prev.length + nextItems.length > MAX_ITEMS) {
        toast.error(`You can queue at most ${MAX_ITEMS} prescriptions in one bulk scan`);
        nextItems.slice(MAX_ITEMS - prev.length).forEach((item) => item.pages.forEach(revokePage));
      }
      if (merged.length) setActiveId(merged[merged.length - 1].id);
      return merged;
    });
  };

  const addPagesToActive = (pages) => {
    if (!pages.length) return;
    pages.forEach((p) => prefetchPreparedPage(p, { grayscale }));
    setItems((prev) => {
      if (!prev.length) {
        const item = { id: newId(), visitId: defaultVisit, pages };
        setActiveId(item.id);
        return [item];
      }
      const targetId = activeId || prev[prev.length - 1].id;
      return prev.map((item) => {
        if (item.id !== targetId) return item;
        const merged = [...item.pages, ...pages].slice(0, 12);
        if (item.pages.length + pages.length > 12) toast.error('A prescription can have at most 12 pages');
        return { ...item, pages: merged };
      });
    });
  };

  const addFiles = async (fileList) => {
    const incoming = Array.from(fileList || []);
    if (!incoming.length) return;
    if (!defaultVisit) {
      toast.error('Select an OP visit first');
      return;
    }
    try {
      const pages = incoming.map((file) => {
        if (!isPdfFile(file) && !isImageFile(file)) {
          throw new Error('Only PDF, JPG and PNG files are allowed');
        }
        return fileToPage(file);
      });
      if (mode === 'combine') {
        const all = [...(active?.pages || []), ...pages];
        const hasPdf = all.some((p) => p.kind === 'pdf');
        const hasImg = all.some((p) => p.kind === 'image');
        if (hasPdf && hasImg) {
          pages.forEach(revokePage);
          toast.error('Save a PDF on its own, or add extra pages as images');
          return;
        }
        addPagesToActive(pages);
        return;
      }
      pushItems(pages.map((page) => ({ id: newId(), visitId: defaultVisit, pages: [page] })));
    } catch (err) {
      toast.error(err.message || 'Could not add those files');
    }
  };

  const startCamera = async (deviceId) => {
    stopStream(streamRef.current);
    streamRef.current = null;
    setCameraError('');
    try {
      const constraints = {
        video: deviceId
          ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
          : { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const vids = devices.filter((d) => d.kind === 'videoinput');
      setCameras(vids);
      const used = stream.getVideoTracks()[0]?.getSettings?.().deviceId;
      if (used) setCameraId(used);
    } catch {
      setCameraError('No scanner or camera is available. Scan to a file and use Bulk upload.');
    }
  };

  useEffect(() => {
    if (!isOpen || tab !== 'scanner') {
      stopStream(streamRef.current);
      streamRef.current = null;
      return undefined;
    }
    startCamera(cameraId);
    return undefined;
  }, [isOpen, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const captureFrame = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      toast.error('Scanner is not ready yet');
      return;
    }
    if (!defaultVisit) {
      toast.error('Select an OP visit first');
      return;
    }
    try {
      const blob = await blobFromVideo(video);
      const file = new File([blob], `scan-${Date.now()}.jpg`, { type: 'image/jpeg' });
      const page = fileToPage(file);
      if (mode === 'combine') addPagesToActive([page]);
      else pushItems([{ id: newId(), visitId: defaultVisit, pages: [page] }]);
      toast.success(mode === 'combine' ? 'Page added' : 'Prescription captured');
    } catch {
      toast.error('Could not capture from the scanner');
    }
  };

  const removeItem = (id) => {
    setItems((prev) => {
      const target = prev.find((i) => i.id === id);
      target?.pages.forEach(revokePage);
      const next = prev.filter((i) => i.id !== id);
      if (activeId === id) setActiveId(next[next.length - 1]?.id || '');
      return next;
    });
  };

  const setItemVisit = (id, visitId) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, visitId } : item)));
  };

  const saveAll = async () => {
    if (!patientId) {
      toast.error('Patient is missing');
      return;
    }
    const ready = items.filter((item) => item.pages.length && item.visitId);
    if (!ready.length) {
      toast.error('Scan or upload at least one prescription');
      return;
    }
    const missingVisit = ready.find((item) => !item.visitId);
    if (missingVisit) {
      toast.error('Every prescription must be linked to an OP visit');
      return;
    }
    setSaving(true);
    let saved = 0;
    try {
      const CONCURRENCY = 3;
      let nextIndex = 0;
      let failed = null;
      const worker = async () => {
        while (nextIndex < ready.length && !failed) {
          const i = nextIndex;
          nextIndex += 1;
          const item = ready[i];
          setProgress(`Saving ${Math.min(i + 1, ready.length)} of ${ready.length}…`);
          const form = new FormData();
          const prepared = await Promise.all(item.pages.map((p) => ensurePreparedPage(p, { grayscale })));
          prepared.forEach((file, idx) => form.append('files', file, file.name || `page-${idx + 1}`));
          form.append('opRegistration', item.visitId);
          form.append('scanSource', tab === 'scanner' ? 'scanner' : 'upload');
          form.append('grayscale', grayscale ? 'true' : 'false');
          try {
            await patientProfileApi.scanPrescription(patientId, form);
            saved += 1;
          } catch (err) {
            failed = err;
            throw err;
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ready.length) }, worker));
      toast.success(`${saved} prescription${saved === 1 ? '' : 's'} saved to this patient`);
      onSaved?.(saved);
      reset();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || `Saved ${saved}, then failed. Check the list and retry the rest.`);
    } finally {
      setSaving(false);
      setProgress('');
    }
  };

  const subtitle = useMemo(
    () => `${patient?.name || 'Patient'} · ${patient?.patientId || 'UHID'} · bulk scan`,
    [patient?.name, patient?.patientId],
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => { if (!saving) { reset(); onClose(); } }}
      title="Bulk Scan Prescriptions"
      subtitle={subtitle}
      size="full"
    >
      <div className="rxscan-body">
        <div className="rxscan-meta">
          <div>
            <div className="rxscan-meta-k">Patient</div>
            <div className="rxscan-meta-v">{patient?.name || '—'}</div>
          </div>
          <div>
            <div className="rxscan-meta-k">UHID / Patient ID</div>
            <div className="rxscan-meta-v">{patient?.patientId || '—'}</div>
          </div>
          <div style={{ gridColumn: 'span 3' }}>
            <div className="rxscan-meta-k">Default OP visit</div>
            <select
              className="input-field"
              value={defaultVisit}
              onChange={(e) => setDefaultVisit(e.target.value)}
              disabled={!visits.length}
            >
              {!visits.length && <option value="">No OP visits — register OP first</option>}
              {visits.map((v) => (
                <option key={v._id} value={v._id}>{visitLabel(v)}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="rxscan-tabs">
          <button type="button" className={`rxscan-tab${tab === 'scanner' ? ' is-on' : ''}`} onClick={() => setTab('scanner')}>
            <ScanLine size={14} /> Scan from Scanner
          </button>
          <button type="button" className={`rxscan-tab${tab === 'upload' ? ' is-on' : ''}`} onClick={() => setTab('upload')}>
            <Upload size={14} /> Bulk Upload Files
          </button>
          <button type="button" className={`rxscan-tab${mode === 'each' ? ' is-on' : ''}`} onClick={() => setMode('each')}>
            Each file = 1 prescription
          </button>
          <button type="button" className={`rxscan-tab${mode === 'combine' ? ' is-on' : ''}`} onClick={() => setMode('combine')}>
            Add as extra pages
          </button>
        </div>

        {tab === 'scanner' ? (
          <div className="rxscan-camera">
            <video ref={videoRef} autoPlay playsInline muted />
            <div className="rxscan-camera-bar">
              <select value={cameraId} onChange={(e) => { setCameraId(e.target.value); startCamera(e.target.value); }}>
                {!cameras.length && <option value="">Default camera / document scanner</option>}
                {cameras.map((c) => <option key={c.deviceId} value={c.deviceId}>{c.label || 'Camera'}</option>)}
              </select>
              <button type="button" className="rxscan-capture" onClick={captureFrame}>
                <Camera size={14} /> {mode === 'combine' ? 'Capture page' : 'Capture prescription'}
              </button>
            </div>
            {cameraError && (
              <p style={{ color: '#fecaca', fontSize: 12, padding: '0 12px 12px', margin: 0 }}>{cameraError}</p>
            )}
          </div>
        ) : (
          <div
            className={`rxscan-drop${dragOver ? ' is-over' : ''}`}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
          >
            <Upload size={22} color="#4338ca" />
            <h4>Drop many scanned prescriptions at once</h4>
            <p>
              {mode === 'each'
                ? 'Each PDF or image is saved as its own prescription against the selected OP visit.'
                : 'Files are added as extra pages on the prescription currently selected below.'}
              {' '}Handwriting is stored as-is — no OCR.
            </p>
            <input
              ref={fileRef}
              type="file"
              hidden
              accept={ACCEPT_TYPES}
              multiple
              onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
            />
          </div>
        )}

        <div className="rxscan-bulk-head">
          <span>{items.length} prescription{items.length === 1 ? '' : 's'} queued</span>
          <button
            type="button"
            className="rxscan-tool"
            disabled={!defaultVisit}
            onClick={() => {
              const item = { id: newId(), visitId: defaultVisit, pages: [] };
              setItems((prev) => [...prev, item]);
              setActiveId(item.id);
              setMode('combine');
            }}
          >
            <Plus size={13} /> Add another
          </button>
        </div>

        {items.length === 0 ? (
          <p className="text-center text-slate-400 py-6 text-sm">Scan or drop files to build the bulk list.</p>
        ) : (
          <div className="rxscan-bulk-list">
            {items.map((item, index) => {
              const visit = visitById(item.visitId);
              const thumb = item.pages[0];
              return (
                <div key={item.id} className={`rxscan-bulk-item${item.id === activeId ? ' is-on' : ''}`}>
                  <button type="button" className="rxscan-bulk-thumb" onClick={() => setActiveId(item.id)}>
                    {thumb?.kind === 'image' ? (
                      <img src={thumb.previewUrl} alt={`Rx ${index + 1}`} />
                    ) : (
                      <FileText size={18} />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="rxscan-row-title">Prescription {index + 1}</div>
                    <select
                      className="input-field py-1.5 text-sm mt-1"
                      value={item.visitId}
                      onChange={(e) => setItemVisit(item.id, e.target.value)}
                    >
                      {visits.map((v) => (
                        <option key={v._id} value={v._id}>{visitLabel(v)}</option>
                      ))}
                    </select>
                    <div className="rxscan-row-sub">
                      {item.pages.length} page{item.pages.length === 1 ? '' : 's'}
                      {visit?.department?.name ? ` · ${visit.department.name}` : ''}
                    </div>
                  </div>
                  <button type="button" className="rxscan-tool" onClick={() => removeItem(item.id)}>
                    <Trash2 size={13} /> Remove
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="rxscan-foot">
          <label className="rxscan-check">
            <input type="checkbox" checked={grayscale} onChange={(e) => setGrayscale(e.target.checked)} />
            Store as grayscale (keeps handwriting readable)
          </label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {progress && <span className="text-xs text-slate-500">{progress}</span>}
            <button type="button" className="btn-secondary" disabled={saving} onClick={() => { reset(); onClose(); }}>Cancel</button>
            <button type="button" className="btn-primary" disabled={saving || !items.length} onClick={saveAll}>
              <FileText size={14} /> {saving ? 'Saving…' : `Save ${items.length || ''} prescription${items.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
