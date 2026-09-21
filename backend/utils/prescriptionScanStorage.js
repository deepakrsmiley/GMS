const fs = require('fs');
const fsp = require('fs').promises;
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
const A4_W = 595.28;
const A4_H = 841.89;

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

const isPdfFile = (file) => {
  const mime = String(file?.mimetype || '').toLowerCase();
  const ext = path.extname(file?.originalname || '').toLowerCase();
  return mime.includes('pdf') || ext === '.pdf';
};

const isJpegFile = (file) => {
  const mime = String(file?.mimetype || '').toLowerCase();
  const ext = path.extname(file?.originalname || '').toLowerCase();
  return mime === 'image/jpeg' || mime === 'image/jpg' || ext === '.jpg' || ext === '.jpeg';
};

/** Read SOF dimensions without decoding the JPEG. */
const parseJpeg = (buffer) => {
  if (!buffer || buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) return null;
    const marker = buffer[offset + 1];
    if (marker === 0xd9 || marker === 0xda) break;
    const length = (buffer[offset + 2] << 8) | buffer[offset + 3];
    if (length < 2) return null;
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      return {
        height: (buffer[offset + 5] << 8) | buffer[offset + 6],
        width: (buffer[offset + 7] << 8) | buffer[offset + 8],
        components: buffer[offset + 9],
      };
    }
    offset += 2 + length;
  }
  return null;
};

const colorSpaceFor = (components) => {
  if (components === 1) return '/DeviceGray';
  if (components === 4) return '/DeviceCMYK';
  return '/DeviceRGB';
};

const pad10 = (n) => String(n).padStart(10, '0');

/**
 * Wrap already-compressed JPEGs in a PDF using DCTDecode (no re-encode).
 * PDFKit's doc.image() decodes every page and is far slower for hospital scans.
 */
const jpegsToPdfBuffer = (imageBuffers) => {
  if (!imageBuffers.length) throw new Error('No pages to store');
  const pages = imageBuffers.map((buf) => {
    const info = parseJpeg(buf);
    if (!info?.width || !info?.height) throw new Error('not-jpeg');
    return { buf, ...info };
  });

  const chunks = [];
  const offsets = [];
  const push = (part) => {
    chunks.push(typeof part === 'string' ? Buffer.from(part, 'latin1') : part);
  };
  const sizeSoFar = () => chunks.reduce((n, c) => n + c.length, 0);
  const beginObj = (id) => {
    offsets[id] = sizeSoFar();
  };

  push('%PDF-1.4\n');

  const pageCount = pages.length;
  const pageIds = pages.map((_, i) => 3 + i * 3);
  const imageIds = pages.map((_, i) => 4 + i * 3);
  const contentIds = pages.map((_, i) => 5 + i * 3);
  const objCount = 3 + pageCount * 3;

  beginObj(1);
  push('1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n');
  beginObj(2);
  push(`2 0 obj<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageCount} >>endobj\n`);

  pages.forEach((page, i) => {
    const pageId = pageIds[i];
    const imageId = imageIds[i];
    const contentId = contentIds[i];
    const scale = Math.min(A4_W / page.width, A4_H / page.height);
    const drawW = page.width * scale;
    const drawH = page.height * scale;
    const x = (A4_W - drawW) / 2;
    const y = (A4_H - drawH) / 2;
    const content = `q\n${drawW.toFixed(2)} 0 0 ${drawH.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm\n/Im0 Do\nQ\n`;
    const contentBuf = Buffer.from(content, 'ascii');

    beginObj(pageId);
    push(`${pageId} 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4_W} ${A4_H}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>endobj\n`);

    beginObj(imageId);
    push(`${imageId} 0 obj<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace ${colorSpaceFor(page.components)} /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.buf.length} >>stream\n`);
    push(page.buf);
    push('endstream\nendobj\n');

    beginObj(contentId);
    push(`${contentId} 0 obj<< /Length ${contentBuf.length} >>stream\n`);
    push(contentBuf);
    push('endstream\nendobj\n');
  });

  const xrefStart = sizeSoFar();
  let xref = `xref\n0 ${objCount}\n0000000000 65535 f \n`;
  for (let id = 1; id < objCount; id += 1) {
    xref += `${pad10(offsets[id])} 00000 n \n`;
  }
  push(xref);
  push(`trailer<< /Size ${objCount} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);
  return Buffer.concat(chunks);
};

const estimatePdfPages = (buffer) => {
  if (!buffer || !buffer.length) return 1;
  const marker = Buffer.from('/Type');
  let count = 0;
  let idx = 0;
  while ((idx = buffer.indexOf(marker, idx)) !== -1) {
    let i = idx + 5;
    while (i < buffer.length && (buffer[i] === 0x20 || buffer[i] === 0x09 || buffer[i] === 0x0a || buffer[i] === 0x0d)) {
      i += 1;
    }
    if (
      buffer[i] === 0x2f
      && buffer[i + 1] === 0x50
      && buffer[i + 2] === 0x61
      && buffer[i + 3] === 0x67
      && buffer[i + 4] === 0x65
      && buffer[i + 5] !== 0x73
    ) {
      count += 1;
    }
    idx += 5;
  }
  return Math.max(1, count);
};

const resolveOrgFolder = (organizationId, patientId) => {
  const org = safeSegment(organizationId, 'org');
  const patient = safeSegment(patientId, 'patient');
  const dir = path.join(UPLOAD_ROOT, org, patient);
  ensureDir(dir);
  return dir;
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

const storedMeta = ({ full, fileType, mimeType, pageCount, originalFileName, fileSize }) => ({
  storageKey: toPosixRelative(full),
  fileType,
  mimeType,
  fileSizeKB: Math.max(1, Math.round((fileSize || 0) / 1024)),
  pageCount,
  originalFileName,
});

/**
 * Persist scanned pages as one medical document.
 * JPEGs are wrapped as PDF without re-encoding. A single PDF is stored unchanged.
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
  const pdfs = files.filter(isPdfFile);
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
    const full = path.join(dir, fileName);
    await fsp.writeFile(full, file.buffer);
    return storedMeta({
      full,
      fileType: 'pdf',
      mimeType: 'application/pdf',
      pageCount: estimatePdfPages(file.buffer),
      originalFileName: file.originalname || fileName,
      fileSize: file.buffer.length,
    });
  }

  const fileName = `${safeSegment(documentNumber, 'RXS')}-${stamp}.pdf`;
  const full = path.join(dir, fileName);
  const jpegOk = images.length && images.every((f) => isJpegFile(f) && parseJpeg(f.buffer));
  if (jpegOk) {
    const pdfBuf = jpegsToPdfBuffer(images.map((f) => f.buffer));
    await fsp.writeFile(full, pdfBuf);
  } else {
    await imagesToPdf(images.map((f) => f.buffer), full);
  }
  const stat = await fsp.stat(full);
  const firstName = images[0]?.originalname || fileName;
  return storedMeta({
    full,
    fileType: 'pdf',
    mimeType: 'application/pdf',
    pageCount: images.length,
    originalFileName: images.length === 1 ? firstName : `${path.parse(firstName).name || 'prescription'}.pdf`,
    fileSize: stat.size,
  });
};

module.exports = {
  UPLOAD_ROOT,
  ALLOWED_MIME,
  isAllowedFile,
  persistScanFiles,
  resolveStoragePath,
  parseJpeg,
  jpegsToPdfBuffer,
  estimatePdfPages,
  extForMime,
};
