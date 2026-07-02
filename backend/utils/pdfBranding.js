const https = require('https');
const http = require('http');
const path = require('path');
const fs = require('fs');
const brandingService = require('../services/brandingService');

const SYSTEM_LOGO_PATH = path.join(__dirname, '../assets/gms-logo.png');

const fetchImageBuffer = (url) => new Promise((resolve, reject) => {
  const client = url.startsWith('https') ? https : http;
  client.get(url, (res) => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      fetchImageBuffer(res.headers.location).then(resolve).catch(reject);
      return;
    }
    if (res.statusCode !== 200) {
      reject(new Error(`Failed to fetch image: ${res.statusCode}`));
      return;
    }
    const chunks = [];
    res.on('data', (chunk) => chunks.push(chunk));
    res.on('end', () => resolve(Buffer.concat(chunks)));
    res.on('error', reject);
  }).on('error', reject);
});

const buildContactLine = (branding) => {
  const parts = [];
  if (branding.address) parts.push(branding.address);
  if (branding.phone) parts.push(`Ph: ${branding.phone}`);
  if (branding.gstNumber) parts.push(`GST: ${branding.gstNumber}`);
  return parts.join(' | ');
};

/**
 * Renders the standard branding header on a PDF document.
 * Layout: System name → System tagline → Logo → Hospital name → Tagline → Contact
 */
const renderBrandingHeader = async (doc, branding, options = {}) => {
  const b = branding || await brandingService.getBranding();
  const { compact = false, title = null, showSystemBranding = true } = options;
  const pageWidth = doc.page.width;
  const margin = doc.page.margins?.left || 50;
  const contentWidth = pageWidth - margin * 2;

  if (showSystemBranding) {
    if (fs.existsSync(SYSTEM_LOGO_PATH)) {
      const logoWidth = compact ? 130 : 180;
      const logoX = (pageWidth - logoWidth) / 2;
      const logoY = doc.y;
      doc.image(SYSTEM_LOGO_PATH, logoX, logoY, { width: logoWidth });
      doc.y = logoY + (compact ? 32 : 44);
    } else {
      doc.fontSize(compact ? 11 : 14).font('Helvetica-Bold')
        .text(b.systemName || brandingService.SYSTEM_NAME, { align: 'center' });
    }
    doc.fontSize(compact ? 8 : 10).font('Helvetica')
      .text(b.systemTagline || brandingService.SYSTEM_TAGLINE, { align: 'center' });
    doc.moveDown(compact ? 0.2 : 0.3);
  }

  if (b.logo) {
    try {
      const imageBuffer = await fetchImageBuffer(b.logo);
      const logoSize = compact ? 40 : 60;
      const logoX = (pageWidth - logoSize) / 2;
      const logoY = doc.y;
      doc.image(imageBuffer, logoX, logoY, { fit: [logoSize, logoSize], align: 'center', valign: 'center' });
      doc.y = logoY + logoSize + (compact ? 4 : 8);
    } catch {
      doc.moveDown(0.2);
    }
  }

  doc.fontSize(compact ? 12 : 16).font('Helvetica-Bold')
    .text(b.hospitalName, { align: 'center', width: contentWidth });
  if (b.tagline) {
    doc.fontSize(compact ? 8 : 10).font('Helvetica-Oblique')
      .text(b.tagline, { align: 'center', width: contentWidth });
  }

  const contactLine = buildContactLine(b);
  if (contactLine) {
    doc.fontSize(compact ? 7 : 9).font('Helvetica')
      .text(contactLine, { align: 'center', width: contentWidth });
  }
  if (b.email || b.website) {
    const extra = [b.email, b.website].filter(Boolean).join(' | ');
    doc.fontSize(compact ? 7 : 8).font('Helvetica')
      .text(extra, { align: 'center', width: contentWidth });
  }

  doc.moveDown(compact ? 0.3 : 0.5);
  doc.moveTo(margin, doc.y).lineTo(pageWidth - margin, doc.y).stroke();
  doc.moveDown(compact ? 0.3 : 0.5);

  if (title) {
    doc.fontSize(compact ? 11 : 14).font('Helvetica-Bold').text(title, { align: 'center' });
    doc.moveDown(0.3);
  }

  return doc.y;
};

module.exports = { renderBrandingHeader, fetchImageBuffer, buildContactLine };
