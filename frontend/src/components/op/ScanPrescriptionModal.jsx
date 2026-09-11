import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera, Check, Crop, FileText, RotateCcw, RotateCw, ScanLine, Trash2,
  Upload, ZoomIn, ZoomOut, Maximize2, ChevronLeft, ChevronRight, Plus,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../common/Modal';
import patientProfileApi from '../../services/patientProfileApi';
import {
  ACCEPT_TYPES, blobFromVideo, cropPage, fileToPage, isImageFile, isPdfFile,
  preparePageForStorage, revokePage, rotatePage,
} from '../../utils/prescriptionImage';
import '../../styles/prescriptionScan.css';

const fmtDate = (v) => (v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const fmtTime = (v) => (v ? new Date(v).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—');
const doctorName = (name) => {
  if (!name) return '—';
  const cleaned = String(name).replace(/^(dr\.?\s*)+/i, '').trim();
  return cleaned ? `Dr. ${cleaned}` : '—';
};
const opNumber = (token) => {
  const raw = String(token || '').replace(/^T-?/i, '');
  return raw ? `OP-${raw.padStart(4, '0')}` : '—';
};

const stopStream = (stream) => {
  stream?.getTracks?.().forEach((t) => t.stop());
};

export default function ScanPrescriptionModal({ isOpen, onClose, visit, visits, patient: patientProp, replaceDocument, onSaved }) {
  const visitList = (visits && visits.length) ? visits : (visit ? [visit] : []);
  const [pickedVisitId, setPickedVisitId] = useState(visit?._id || visitList[0]?._id || '');
  const activeVisit = visitList.find((v) => String(v._id) === String(pickedVisitId)) || visit || visitList[0];
  const patient = activeVisit?.patient || patientProp || visit?.patient || {};
  const patientId = patient._id;
  const visitAt = activeVisit?.tokenDate || activeVisit?.createdAt;
  const fileRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const cropDrag = useRef(null);

  const [tab, setTab] = useState('upload');
  const [pages, setPages] = useState([]);
  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [grayscale, setGrayscale] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [cropMode, setCropMode] = useState(false);
  const [cropRect, setCropRect] = useState({ x: 8, y: 8, w: 84, h: 84 });
  const [cameras, setCameras] = useState([]);
  const [cameraId, setCameraId] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [existing, setExisting] = useState([]);

  useEffect(() => {
    if (isOpen) setPickedVisitId(visit?._id || visitList[0]?._id || '');
  }, [isOpen, visit?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const page = pages[active];

  const reset = useCallback(() => {
    pages.forEach(revokePage);
    setPages([]);
    setActive(0);
    setZoom(1);
    setCropMode(false);
    setTab('upload');
    setGrayscale(false);
    stopStream(streamRef.current);
    streamRef.current = null;
  }, [pages]);

  useEffect(() => {
    if (!isOpen) {
      reset();
      setExisting([]);
      return undefined;
    }
    let cancelled = false;
    if (patientId && activeVisit?._id && !replaceDocument) {
      patientProfileApi.getDocuments(patientId, 'Prescription', activeVisit._id)
        .then((res) => {
          if (!cancelled) setExisting(res?.data || []);
        })
        .catch(() => {});
    }
    return () => { cancelled = true; };
  }, [isOpen, patientId, activeVisit?._id, replaceDocument]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => {
    stopStream(streamRef.current);
  }, []);

  const addFiles = async (fileList) => {
    const incoming = Array.from(fileList || []);
    if (!incoming.length) return;
    try {
      const next = incoming.map((file) => {
        if (!isPdfFile(file) && !isImageFile(file)) {
          throw new Error('Only PDF, JPG and PNG files are allowed');
        }
        return fileToPage(file);
      });
      const hasPdf = [...pages, ...next].some((p) => p.kind === 'pdf');
      const hasImg = [...pages, ...next].some((p) => p.kind === 'image');
      if (hasPdf && hasImg) {
        next.forEach(revokePage);
        toast.error('Save a PDF on its own, or add extra pages as images');
        return;
      }
      if ([...pages, ...next].filter((p) => p.kind === 'pdf').length > 1) {
        next.forEach(revokePage);
        toast.error('Upload one PDF, or scan pages as images to combine them');
        return;
      }
      setPages((prev) => {
        const merged = [...prev, ...next].slice(0, 12);
        if (prev.length + next.length > 12) toast.error('A prescription can have at most 12 pages');
        return merged;
      });
      setActive(pages.length);
      setZoom(1);
      setCropMode(false);
    } catch (err) {
      toast.error(err.message || 'Could not add that file');
    }
  };

  const startCamera = async (deviceId) => {
    stopStream(streamRef.current);
    streamRef.current = null;
    setCameraError('');
    try {
      const constraints = {
        video: deviceId
          ? { deviceId: { exact: deviceId }, width: { ideal: 2560 }, height: { ideal: 1440 } }
          : { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1440 } },
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
    } catch (err) {
      setCameraError('No scanner or camera is available in this browser. Use the hospital scanner software to save a file, then upload it.');
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
    try {
      const blob = await blobFromVideo(video);
      const file = new File([blob], `scan-${Date.now()}.jpg`, { type: 'image/jpeg' });
      await addFiles([file]);
      toast.success('Page captured');
    } catch {
      toast.error('Could not capture from the scanner');
    }
  };

  const updatePage = (id, nextPage) => {
    setPages((prev) => prev.map((p) => (p.id === id ? nextPage : p)));
  };

  const onRotate = async (dir) => {
    if (!page || page.kind === 'pdf') return;
    try {
      updatePage(page.id, await rotatePage(page, dir));
    } catch {
      toast.error('Could not rotate this page');
    }
  };

  const applyCrop = async () => {
    if (!page || page.kind === 'pdf') return;
    try {
      updatePage(page.id, await cropPage(page, cropRect));
      setCropMode(false);
    } catch {
      toast.error('Could not crop this page');
    }
  };

  const removePage = (index) => {
    setPages((prev) => {
      const copy = [...prev];
      const [removed] = copy.splice(index, 1);
      revokePage(removed);
      return copy;
    });
    setActive((i) => Math.max(0, Math.min(i, pages.length - 2)));
    setCropMode(false);
  };

  const movePage = (index, delta) => {
    const next = index + delta;
    if (next < 0 || next >= pages.length) return;
    setPages((prev) => {
      const copy = [...prev];
      const [item] = copy.splice(index, 1);
      copy.splice(next, 0, item);
      return copy;
    });
    setActive(next);
  };

  const onCropPointer = (e, mode) => {
    e.preventDefault();
    e.stopPropagation();
    const stage = e.currentTarget.closest('.rxscan-stage');
    if (!stage) return;
    const box = stage.getBoundingClientRect();
    cropDrag.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      orig: { ...cropRect },
      box,
    };
    const onMove = (ev) => {
      const drag = cropDrag.current;
      if (!drag) return;
      const dx = ((ev.clientX - drag.startX) / drag.box.width) * 100;
      const dy = ((ev.clientY - drag.startY) / drag.box.height) * 100;
      const o = drag.orig;
      let next = { ...o };
      if (drag.mode === 'move') {
        next.x = Math.min(100 - o.w, Math.max(0, o.x + dx));
        next.y = Math.min(100 - o.h, Math.max(0, o.y + dy));
      } else if (drag.mode === 'br') {
        next.w = Math.min(100 - o.x, Math.max(8, o.w + dx));
        next.h = Math.min(100 - o.y, Math.max(8, o.h + dy));
      }
      setCropRect(next);
    };
    const onUp = () => {
      cropDrag.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const save = async () => {
    if (!patientId || !activeVisit?._id) {
      toast.error('Select an OP visit first');
      return;
    }
    if (!pages.length) {
      toast.error('Scan or upload the prescription first');
      return;
    }
    setSaving(true);
    try {
      const form = new FormData();
      const prepared = await Promise.all(pages.map((p) => preparePageForStorage(p, { grayscale })));
      prepared.forEach((file, i) => form.append('files', file, file.name || `page-${i + 1}`));
      form.append('opRegistration', activeVisit._id);
      form.append('scanSource', tab === 'scanner' ? 'scanner' : 'upload');
      form.append('grayscale', grayscale ? 'true' : 'false');
      const saved = replaceDocument
        ? await patientProfileApi.replacePrescriptionScan(patientId, replaceDocument._id, form)
        : await patientProfileApi.scanPrescription(patientId, form);
      toast.success(replaceDocument ? 'Prescription replaced' : 'Prescription saved to the patient record');
      onSaved?.(saved);
      reset();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Could not save the prescription');
    } finally {
      setSaving(false);
    }
  };

  const subtitle = useMemo(
    () => `${patient.name || 'Patient'} · ${patient.patientId || 'UHID'} · ${opNumber(activeVisit?.tokenNumber)}`,
    [patient.name, patient.patientId, activeVisit?.tokenNumber],
  );

  const pdfLocked = page?.kind === 'pdf';

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => { if (!saving) { reset(); onClose(); } }}
      title={replaceDocument ? 'Re-scan / Replace Prescription' : 'Scan Prescription'}
      subtitle={subtitle}
      size="full"
    >
      <div className="rxscan-body">
        <div className="rxscan-meta">
          <div>
            <div className="rxscan-meta-k">Patient</div>
            <div className="rxscan-meta-v">{patient.name || '—'}</div>
          </div>
          <div>
            <div className="rxscan-meta-k">UHID / Patient ID</div>
            <div className="rxscan-meta-v">{patient.patientId || '—'}</div>
          </div>
          <div>
            <div className="rxscan-meta-k">OP Number</div>
            {visitList.length > 1 && !replaceDocument ? (
              <select
                className="input-field py-1 text-sm mt-0.5"
                value={pickedVisitId}
                onChange={(e) => setPickedVisitId(e.target.value)}
              >
                {visitList.map((v) => (
                  <option key={v._id} value={v._id}>
                    {opNumber(v.tokenNumber)} · {fmtDate(v.tokenDate || v.createdAt)}
                  </option>
                ))}
              </select>
            ) : (
              <div className="rxscan-meta-v">{opNumber(activeVisit?.tokenNumber)}</div>
            )}
          </div>
          <div>
            <div className="rxscan-meta-k">Visit date &amp; time</div>
            <div className="rxscan-meta-v">{fmtDate(visitAt)} · {fmtTime(visitAt)}</div>
          </div>
          <div>
            <div className="rxscan-meta-k">Doctor</div>
            <div className="rxscan-meta-v">{doctorName(activeVisit?.doctor?.name)}</div>
          </div>
        </div>

        {!replaceDocument && existing.length > 0 && (
          <div className="rxscan-existing">
            This OP visit already has a scanned prescription. Saving will add another document unless you use Re-scan / Replace from the viewer.
          </div>
        )}

        <div className="rxscan-tabs">
          <button type="button" className={`rxscan-tab${tab === 'scanner' ? ' is-on' : ''}`} onClick={() => setTab('scanner')}>
            <ScanLine size={14} /> Scan from Scanner
          </button>
          <button type="button" className={`rxscan-tab${tab === 'upload' ? ' is-on' : ''}`} onClick={() => setTab('upload')}>
            <Upload size={14} /> Upload Scanned File
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
                <Camera size={14} /> Capture page
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
            <h4>Upload PDF, JPG or PNG</h4>
            <p>Drag &amp; drop the scanned prescription here, or click to browse. Handwriting is stored as-is — no OCR.</p>
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

        {pages.length > 0 && (
          <>
            <div className="rxscan-pages">
              {pages.map((p, i) => (
                <button key={p.id} type="button" className={`rxscan-page${i === active ? ' is-on' : ''}`} onClick={() => { setActive(i); setZoom(1); setCropMode(false); }}>
                  {p.kind === 'pdf' ? <div className="rxscan-page-pdf">PDF</div> : <img src={p.previewUrl} alt={`Page ${i + 1}`} />}
                  <div className="rxscan-page-n">Page {i + 1}</div>
                </button>
              ))}
              <button type="button" className="rxscan-page" onClick={() => fileRef.current?.click()} title="Add page">
                <div className="rxscan-page-pdf"><Plus size={16} /></div>
                <div className="rxscan-page-n">Add</div>
              </button>
            </div>

            <div className="rxscan-tools">
              <button type="button" className="rxscan-tool" disabled={pdfLocked} onClick={() => onRotate(-90)}><RotateCcw size={13} /> Rotate Left</button>
              <button type="button" className="rxscan-tool" disabled={pdfLocked} onClick={() => onRotate(90)}><RotateCw size={13} /> Rotate Right</button>
              <button type="button" className="rxscan-tool" onClick={() => setZoom((z) => Math.min(4, z * 1.2))}><ZoomIn size={13} /> Zoom In</button>
              <button type="button" className="rxscan-tool" onClick={() => setZoom((z) => Math.max(0.4, z / 1.2))}><ZoomOut size={13} /> Zoom Out</button>
              <button type="button" className="rxscan-tool" onClick={() => setZoom(1)}><Maximize2 size={13} /> Fit to Screen</button>
              <button type="button" className="rxscan-tool" disabled={pdfLocked} onClick={() => setCropMode((v) => !v)}><Crop size={13} /> Crop</button>
              <button type="button" className="rxscan-tool" disabled={active === 0} onClick={() => movePage(active, -1)}><ChevronLeft size={13} /> Move up</button>
              <button type="button" className="rxscan-tool" disabled={active >= pages.length - 1} onClick={() => movePage(active, 1)}>Move down <ChevronRight size={13} /></button>
              <button type="button" className="rxscan-tool" onClick={() => removePage(active)}><Trash2 size={13} /> Delete / Retake</button>
              {cropMode && (
                <button type="button" className="rxscan-tool" onClick={applyCrop}><Check size={13} /> Apply crop</button>
              )}
            </div>
            {pdfLocked && (
              <p style={{ margin: '0 20px 8px', fontSize: 12, color: '#64748b' }}>
                PDF pages are stored exactly as scanned. Use image scan if you need rotate or crop.
              </p>
            )}

            <div className="rxscan-preview">
              {page?.kind === 'pdf' ? (
                <iframe title="PDF preview" src={page.previewUrl} />
              ) : page ? (
                <div className="rxscan-stage">
                  <img
                    src={page.previewUrl}
                    alt="Prescription preview"
                    style={{ transform: `scale(${zoom})` }}
                    draggable={false}
                  />
                  {cropMode && (
                    <div
                      className="rxscan-crop"
                      style={{ left: `${cropRect.x}%`, top: `${cropRect.y}%`, width: `${cropRect.w}%`, height: `${cropRect.h}%` }}
                      onPointerDown={(e) => onCropPointer(e, 'move')}
                    >
                      <span className="rxscan-crop-h tl" />
                      <span className="rxscan-crop-h tr" />
                      <span className="rxscan-crop-h bl" />
                      <span className="rxscan-crop-h br" onPointerDown={(e) => onCropPointer(e, 'br')} />
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </>
        )}

        <div className="rxscan-foot">
          <label className="rxscan-check">
            <input type="checkbox" checked={grayscale} onChange={(e) => setGrayscale(e.target.checked)} />
            Store as grayscale (keeps handwriting readable)
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn-secondary" disabled={saving} onClick={() => { reset(); onClose(); }}>Cancel</button>
            <button type="button" className="btn-primary" disabled={saving || !pages.length} onClick={save}>
              <FileText size={14} /> {saving ? 'Saving…' : 'Save Prescription'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
