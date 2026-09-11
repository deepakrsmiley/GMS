const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { persistScanFiles, resolveStoragePath } = require('../utils/prescriptionScanStorage');

// 1x1 JPEG
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGcP/2Q==',
  'base64',
);

test('persistScanFiles combines image pages into a PDF under the patient folder', async () => {
  const stored = await persistScanFiles({
    files: [
      { buffer: JPEG, mimetype: 'image/jpeg', originalname: 'page-1.jpg' },
      { buffer: JPEG, mimetype: 'image/jpeg', originalname: 'page-2.jpg' },
    ],
    organizationId: 'orgtest',
    patientId: 'patienttest',
    documentNumber: 'RXS26000001',
  });
  assert.equal(stored.fileType, 'pdf');
  assert.equal(stored.pageCount, 2);
  assert.equal(stored.mimeType, 'application/pdf');
  const full = resolveStoragePath(stored.storageKey);
  assert.equal(fs.existsSync(full), true);
  assert.equal(fs.readFileSync(full, { encoding: null })[0], 0x25); // %PDF
  fs.unlinkSync(full);
});

test('persistScanFiles stores a PDF unchanged', async () => {
  const pdf = Buffer.concat([
    Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n'),
  ]);
  const stored = await persistScanFiles({
    files: [{ buffer: pdf, mimetype: 'application/pdf', originalname: 'rx.pdf' }],
    organizationId: 'orgtest',
    patientId: 'patienttest',
    documentNumber: 'RXS26000002',
  });
  assert.equal(stored.fileType, 'pdf');
  assert.equal(stored.originalFileName, 'rx.pdf');
  const full = resolveStoragePath(stored.storageKey);
  assert.equal(fs.existsSync(full), true);
  fs.unlinkSync(full);
});
