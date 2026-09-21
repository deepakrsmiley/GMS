const MAX_EDGE = 1800;
const JPEG_QUALITY = 0.74;
const SKIP_RECOMPRESS_BYTES = 380 * 1024;
const CAMERA_JPEG_QUALITY = 0.8;

export const ACCEPT_TYPES = 'application/pdf,image/jpeg,image/jpg,image/png,image/webp,.pdf,.jpg,.jpeg,.png';

export const isPdfFile = (file) => {
  if (!file) return false;
  const type = String(file.type || '').toLowerCase();
  const name = String(file.name || '').toLowerCase();
  return type === 'application/pdf' || name.endsWith('.pdf');
};

export const isImageFile = (file) => {
  if (!file) return false;
  const type = String(file.type || '').toLowerCase();
  const name = String(file.name || '').toLowerCase();
  return type.startsWith('image/') || /\.(jpe?g|png|webp)$/.test(name);
};

const newId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `p-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
};

const parseJpegHeader = (bytes) => {
  if (!bytes || bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    if (marker === 0xd9 || marker === 0xda) break;
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2) return null;
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      return {
        height: (bytes[offset + 5] << 8) | bytes[offset + 6],
        width: (bytes[offset + 7] << 8) | bytes[offset + 8],
      };
    }
    offset += 2 + length;
  }
  return null;
};

export const loadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error('Could not read the scanned image'));
  img.src = src;
});

export const canvasToBlob = (canvas, type = 'image/jpeg', quality = JPEG_QUALITY) => (
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error('Could not process the scanned page'));
      else resolve(blob);
    }, type, quality);
  })
);

export const fileToPage = (file) => {
  if (!file) return null;
  if (!isPdfFile(file) && !isImageFile(file)) {
    throw new Error('Only PDF, JPG and PNG files are allowed');
  }
  return {
    id: newId(),
    kind: isPdfFile(file) ? 'pdf' : 'image',
    name: file.name || 'scan',
    previewUrl: URL.createObjectURL(file),
    workingBlob: file,
    size: file.size || 0,
  };
};

export const revokePage = (page) => {
  if (page?.previewUrl) URL.revokeObjectURL(page.previewUrl);
};

const jpegFileName = (page) => `${(page.name || 'prescription').replace(/\.[^.]+$/, '')}.jpg`;

const drawToJpeg = async (source, width, height, { grayscale = false, quality = JPEG_QUALITY } = {}) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  if (grayscale) ctx.filter = 'grayscale(1)';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'medium';
  ctx.drawImage(source, 0, 0, width, height);
  if (typeof source.close === 'function') source.close();
  return canvasToBlob(canvas, 'image/jpeg', quality);
};

const decodeBitmap = async (page) => {
  if (typeof createImageBitmap === 'function' && page.workingBlob) {
    return createImageBitmap(page.workingBlob);
  }
  return loadImage(page.previewUrl);
};

export async function rotatePage(page, degrees) {
  if (!page || page.kind === 'pdf') return page;
  const img = await decodeBitmap(page);
  const rad = (degrees * Math.PI) / 180;
  const landscape = Math.abs(degrees) % 180 !== 0;
  const canvas = document.createElement('canvas');
  canvas.width = landscape ? img.height : img.width;
  canvas.height = landscape ? img.width : img.height;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(rad);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  if (typeof img.close === 'function') img.close();
  const blob = await canvasToBlob(canvas, 'image/jpeg', 0.82);
  revokePage(page);
  return {
    ...page,
    kind: 'image',
    previewUrl: URL.createObjectURL(blob),
    workingBlob: blob,
    size: blob.size,
    name: jpegFileName(page),
    prepared: undefined,
    preparedKey: undefined,
  };
}

export async function cropPage(page, rectPercent) {
  if (!page || page.kind === 'pdf') return page;
  const img = await decodeBitmap(page);
  const x = Math.max(0, (rectPercent.x / 100) * img.width);
  const y = Math.max(0, (rectPercent.y / 100) * img.height);
  const w = Math.max(8, (rectPercent.w / 100) * img.width);
  const h = Math.max(8, (rectPercent.h / 100) * img.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(Math.min(w, img.width - x));
  canvas.height = Math.round(Math.min(h, img.height - y));
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, x, y, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  if (typeof img.close === 'function') img.close();
  const blob = await canvasToBlob(canvas, 'image/jpeg', 0.82);
  revokePage(page);
  return {
    ...page,
    kind: 'image',
    previewUrl: URL.createObjectURL(blob),
    workingBlob: blob,
    size: blob.size,
    name: jpegFileName(page),
    prepared: undefined,
    preparedKey: undefined,
  };
}

const jpegAlreadySmallEnough = async (blob) => {
  const type = String(blob?.type || '').toLowerCase();
  if (type !== 'image/jpeg' && type !== 'image/jpg') return false;
  if ((blob.size || 0) > SKIP_RECOMPRESS_BYTES) return false;
  const header = new Uint8Array(await blob.slice(0, 128 * 1024).arrayBuffer());
  const info = parseJpegHeader(header);
  if (!info) return false;
  return Math.max(info.width, info.height) <= MAX_EDGE;
};

export async function preparePageForStorage(page, { grayscale = false } = {}) {
  if (!page) return null;
  if (page.kind === 'pdf') {
    return new File([page.workingBlob], page.name || 'prescription.pdf', { type: 'application/pdf' });
  }
  if (!grayscale && page.workingBlob && await jpegAlreadySmallEnough(page.workingBlob)) {
    return new File([page.workingBlob], jpegFileName(page), { type: 'image/jpeg' });
  }
  const img = await decodeBitmap(page);
  const longEdge = Math.max(img.width, img.height);
  const scale = longEdge > MAX_EDGE ? MAX_EDGE / longEdge : 1;
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));
  const blob = await drawToJpeg(img, width, height, { grayscale, quality: JPEG_QUALITY });
  return new File([blob], jpegFileName(page), { type: 'image/jpeg' });
}

export async function ensurePreparedPage(page, { grayscale = false } = {}) {
  if (!page) return null;
  const key = grayscale ? 'gray' : 'color';
  if (page.prepared && page.preparedKey === key) return page.prepared;
  const file = await preparePageForStorage(page, { grayscale });
  page.prepared = file;
  page.preparedKey = key;
  return file;
}

export function prefetchPreparedPage(page, options) {
  if (!page || page.kind === 'pdf') return;
  ensurePreparedPage(page, options).catch(() => {});
}

export async function blobFromVideo(videoEl) {
  if (window.ImageCapture && videoEl.srcObject) {
    const track = videoEl.srcObject.getVideoTracks?.()[0];
    if (track) {
      try {
        const capture = new ImageCapture(track);
        if (capture.takePhoto) {
          const photo = await capture.takePhoto();
          if (photo) return photo;
        }
      } catch {
        // fall through to canvas capture
      }
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = videoEl.videoWidth || 1600;
  canvas.height = videoEl.videoHeight || 1200;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
  return canvasToBlob(canvas, 'image/jpeg', CAMERA_JPEG_QUALITY);
}
