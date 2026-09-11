const MAX_EDGE = 2200;
const JPEG_QUALITY = 0.88;

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

const applyGrayscale = (ctx, width, height) => {
  const imageData = ctx.getImageData(0, 0, width, height);
  const { data } = imageData;
  for (let i = 0; i < data.length; i += 4) {
    const g = Math.round((data[i] * 0.299) + (data[i + 1] * 0.587) + (data[i + 2] * 0.114));
    data[i] = g;
    data[i + 1] = g;
    data[i + 2] = g;
  }
  ctx.putImageData(imageData, 0, 0);
};

export async function rotatePage(page, degrees) {
  if (!page || page.kind === 'pdf') return page;
  const img = await loadImage(page.previewUrl);
  const rad = (degrees * Math.PI) / 180;
  const landscape = Math.abs(degrees) % 180 !== 0;
  const canvas = document.createElement('canvas');
  canvas.width = landscape ? img.height : img.width;
  canvas.height = landscape ? img.width : img.height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(rad);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  const blob = await canvasToBlob(canvas, 'image/jpeg', 0.92);
  revokePage(page);
  return {
    ...page,
    kind: 'image',
    previewUrl: URL.createObjectURL(blob),
    workingBlob: blob,
    size: blob.size,
    name: page.name.replace(/\.[^.]+$/, '') + '.jpg',
  };
}

export async function cropPage(page, rectPercent) {
  if (!page || page.kind === 'pdf') return page;
  const img = await loadImage(page.previewUrl);
  const x = Math.max(0, (rectPercent.x / 100) * img.width);
  const y = Math.max(0, (rectPercent.y / 100) * img.height);
  const w = Math.max(8, (rectPercent.w / 100) * img.width);
  const h = Math.max(8, (rectPercent.h / 100) * img.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(Math.min(w, img.width - x));
  canvas.height = Math.round(Math.min(h, img.height - y));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, x, y, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  const blob = await canvasToBlob(canvas, 'image/jpeg', 0.92);
  revokePage(page);
  return {
    ...page,
    kind: 'image',
    previewUrl: URL.createObjectURL(blob),
    workingBlob: blob,
    size: blob.size,
    name: page.name.replace(/\.[^.]+$/, '') + '.jpg',
  };
}

export async function preparePageForStorage(page, { grayscale = false } = {}) {
  if (!page) return null;
  if (page.kind === 'pdf') {
    return new File([page.workingBlob], page.name || 'prescription.pdf', { type: 'application/pdf' });
  }
  const img = await loadImage(page.previewUrl);
  let width = img.width;
  let height = img.height;
  const longEdge = Math.max(width, height);
  const scale = longEdge > MAX_EDGE ? MAX_EDGE / longEdge : 1;
  width = Math.max(1, Math.round(width * scale));
  height = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);
  if (grayscale) applyGrayscale(ctx, width, height);
  const blob = await canvasToBlob(canvas, 'image/jpeg', JPEG_QUALITY);
  const base = (page.name || 'prescription').replace(/\.[^.]+$/, '');
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
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
  const ctx = canvas.getContext('2d');
  ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
  return canvasToBlob(canvas, 'image/jpeg', 0.92);
}
