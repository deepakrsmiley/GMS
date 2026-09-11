const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const UPLOAD_ROOT = path.resolve(__dirname, '..', 'uploads', 'medical-docs');
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

const ensureDir = (dir) => {
  fs.mkdirSync(dir, { recursive: true });
};

const safeSegment = (value, fallback = 'x') => {
  const cleaned = String(value || fallback).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48);
  return cleaned || fallback;
};

const extForMime = (mime, originalName = '') => {
  const fromName = path.extname(originalName || '').toLowerCase();
  if (fromName === '.jpeg') return '.jpg';
  if (['.jpg', '.png', '.pdf', '.webp'].includes(fromName)) return fromName;
  if (mime === 'application/pdf') return '.pdf';
  if (mime === 'image/png') return '.png';
  if (mime === 'image/webp') return '.webp';
  return '.jpg';
};

const isAllowedFile = (file) => {
  if (!file) return false;
  const mime = String(file.mimetype || '').toLowerCase();
  if (ALLOWED_MIME.has(mime)) return true;
  const ext = path.extname(file.originalname || '').toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.pdf', '.webp'].includes(ext);
};

const estimatePdfPages = (buffer) => {
  if (!buffer || !buffer.length) return 1;
  const text = buffer.toString('latin1');
  const matches = text.match(/\/Type\s*\/Page(?!s)\b/g);
  return Math.max(1, matches ? matches.length : 1);
};

const resolveOrgFolder = (organizationId, patientId) => {
  const org = safeSegment(organizationId, 'org');
  const patient = safeSegment(patientId, 'patient');
  const dir = path.join(UPLOAD_ROOT, org, patient);
  ensureDir(dir);
  return dir;
};

const writeBuffer = (dir, fileName, buffer) => {
  const full = path.join(dir, fileName);
  fs.writeFileSync(full, buffer);
  return full;
};

const toPosixRelative = (fullPath) => {
  const rel = path.relative(UPLOAD_ROOT, fullPath);
  return rel.split(path.sep).join('/');
};

const resolveStoragePath = (storageKey) => {
  if (!storageKey || typeof storageKey !== 'string') {
    throw new Error('Missing storage key');
  }
  const full = path.resolve(UPLOAD_ROOT, storageKey);
  const rel = path.relative(UPLOAD_ROOT, full);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Invalid storage key');
  }
  return full;
};

const imagesToPdf = (imageBuffers, destPath) => new Promise((resolve, reject) => {
  if (!imageBuffers.length) {
    reject(new Error('No pages to store'));
    return;
  }
  const doc = new PDFDocument({ autoFirstPage: false, margin: 0 });
  const stream = fs.createWriteStream(destPath);
  doc.pipe(stream);
  try {
    imageBuffers.forEach((buf) => {
      doc.addPage({ size: 'A4', margin: 0 });
      const pageW = doc.page.width;
      const pageH = doc.page.height;
      doc.image(buf, 0, 0, { fit: [pageW, pageH], align: 'center', valign: 'center' });
    });
    doc.end();
  } catch (err) {
    try { doc.end(); } catch (_) { /* ignore */ }
    reject(new Error('Could not build the prescription PDF. Please upload JPG, PNG or PDF.'));
    return;
  }
  stream.on('finish', resolve);
  stream.on('error', reject);
});

/**
 * Persist scanned pages as one medical document.
 * Images are combined into an A4 PDF. A single PDF is stored unchanged.
 */
const persistScanFiles = async ({
  files,
  organizationId,
  patientId,
  documentNumber,
}) => {
  if (!files?.length) {
    throw new Error('Please scan or upload at least one page');
  }
  const invalid = files.find((f) => !isAllowedFile(f));
  if (invalid) {
    throw new Error('Only PDF, JPG and PNG files are allowed');
  }

  const dir = resolveOrgFolder(organizationId, patientId);
  const stamp = Date.now();
  const pdfs = files.filter((f) => String(f.mimetype || '').includes('pdf')
    || path.extname(f.originalname || '').toLowerCase() === '.pdf');
  const images = files.filter((f) => !pdfs.includes(f));

  if (pdfs.length && images.length) {
    throw new Error('Save a PDF on its own, or add extra pages as images so they can be stored as one document');
  }
  if (pdfs.length > 1) {
    throw new Error('Upload one PDF, or scan pages as images to combine them');
  }

  if (pdfs.length === 1) {
    const file = pdfs[0];
    const fileName = `${safeSegment(documentNumber, 'RXS')}-${stamp}.pdf`;
    const full = writeBuffer(dir, fileName, file.buffer);
    return {
      storageKey: toPosixRelative(full),
      fileType: 'pdf',
      mimeType: 'application/pdf',
      fileSizeKB: Math.max(1, Math.round((file.buffer.length || 0) / 1024)),
      pageCount: estimatePdfPages(file.buffer),
      originalFileName: file.originalname || fileName,
    };
  }

  const fileName = `${safeSegment(documentNumber, 'RXS')}-${stamp}.pdf`;
  const full = path.join(dir, fileName);
  await imagesToPdf(images.map((f) => f.buffer), full);
  const stat = fs.statSync(full);
  const firstName = images[0]?.originalname || fileName;
  return {
    storageKey: toPosixRelative(full),
    fileType: 'pdf',
    mimeType: 'application/pdf',
    fileSizeKB: Math.max(1, Math.round(stat.size / 1024)),
    pageCount: images.length,
    originalFileName: images.length === 1 ? firstName : `${path.parse(firstName).name || 'prescription'}.pdf`,
  };
};

module.exports = {
  UPLOAD_ROOT,
  ALLOWED_MIME,
  isAllowedFile,
  persistScanFiles,
  resolveStoragePath,
};
