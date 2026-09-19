const fs = require('fs');
const path = require('path');

const TAMIL_RE = /[\u0B80-\u0BFF]/;
const NON_ASCII_RE = /[^\x09\x0A\x0D\x20-\x7E]/;

const firstExisting = (paths) => paths.find((p) => p && fs.existsSync(p));

const fontsourceFile = (pkg, file) => {
  const candidates = [
    path.join(__dirname, `../node_modules/${pkg}/files/${file}`),
    path.join(process.cwd(), `node_modules/${pkg}/files/${file}`),
  ];
  try {
    candidates.unshift(require.resolve(`${pkg}/files/${file}`));
  } catch {
    /* package exports may block resolve */
  }
  return firstExisting(candidates);
};

const registerIfPresent = (doc, name, file) => {
  if (!file) return false;
  doc.registerFont(name, file);
  return true;
};

/**
 * Tamil + English need a Unicode TTF. Times-Roman (WinAnsi) drops Tamil and can throw.
 * Prefer a full font (Nirmala / bundled TTF). Fall back to Noto subset woff files.
 */
const attachDischargeFonts = (doc) => {
  const fonts = {
    unicode: false,
    unified: false,
    regular: 'Times-Roman',
    bold: 'Times-Bold',
    italic: 'Times-Italic',
  };

  const unifiedRegular = firstExisting([
    path.join(__dirname, '../assets/fonts/NotoSansTamil-Regular.ttf'),
    'C:\\Windows\\Fonts\\Nirmala.ttf',
    '/usr/share/fonts/truetype/noto/NotoSansTamil-Regular.ttf',
    '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf',
  ]);
  const unifiedBold = firstExisting([
    path.join(__dirname, '../assets/fonts/NotoSansTamil-Bold.ttf'),
    'C:\\Windows\\Fonts\\NirmalaB.ttf',
    unifiedRegular,
  ]);
  const tamilRegular = fontsourceFile('@fontsource/noto-sans-tamil', 'noto-sans-tamil-tamil-400-normal.woff');
  const tamilBold = fontsourceFile('@fontsource/noto-sans-tamil', 'noto-sans-tamil-tamil-700-normal.woff') || tamilRegular;
  const latinRegular = fontsourceFile('@fontsource/noto-sans', 'noto-sans-latin-400-normal.woff');
  const latinBold = fontsourceFile('@fontsource/noto-sans', 'noto-sans-latin-700-normal.woff') || latinRegular;

  try {
    if (unifiedRegular && registerIfPresent(doc, 'DS-Unicode', unifiedRegular)) {
      registerIfPresent(doc, 'DS-Unicode-Bold', unifiedBold || unifiedRegular);
      fonts.unicode = true;
      fonts.unified = true;
      fonts.regular = 'DS-Unicode';
      fonts.bold = 'DS-Unicode-Bold';
      fonts.italic = 'DS-Unicode';
      doc._dsFonts = fonts;
      return fonts;
    }
    if (tamilRegular && registerIfPresent(doc, 'DS-Tamil', tamilRegular)) {
      registerIfPresent(doc, 'DS-Tamil-Bold', tamilBold || tamilRegular);
      fonts.unicode = true;
      fonts.tamil = 'DS-Tamil';
      fonts.tamilBold = 'DS-Tamil-Bold';
    }
    if (latinRegular && registerIfPresent(doc, 'DS-Latin', latinRegular)) {
      registerIfPresent(doc, 'DS-Latin-Bold', latinBold || latinRegular);
      fonts.latin = 'DS-Latin';
      fonts.latinBold = 'DS-Latin-Bold';
    }
  } catch {
    fonts.unicode = false;
    fonts.unified = false;
    fonts.regular = 'Times-Roman';
    fonts.bold = 'Times-Bold';
    fonts.italic = 'Times-Italic';
  }

  doc._dsFonts = fonts;
  return fonts;
};

const pdfSafe = (value, { allowUnicode = true } = {}) => {
  let s = String(value == null ? '' : value)
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/\u0000/g, '');
  if (!allowUnicode) {
    s = s.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '');
  }
  return s;
};

const pickFont = (fonts = {}, { bold = false, italic = false, text = '' } = {}) => {
  const allowUnicode = Boolean(fonts.unicode);
  const safe = pdfSafe(text, { allowUnicode });
  const hasTamil = TAMIL_RE.test(safe);
  if (fonts.unified) {
    return { name: bold ? fonts.bold : fonts.regular, text: safe };
  }
  if (hasTamil && fonts.tamil) {
    return { name: bold ? (fonts.tamilBold || fonts.tamil) : fonts.tamil, text: safe };
  }
  if (NON_ASCII_RE.test(safe) && fonts.latin) {
    return { name: bold ? (fonts.latinBold || fonts.latin) : fonts.latin, text: safe };
  }
  return {
    name: italic ? 'Times-Italic' : bold ? 'Times-Bold' : 'Times-Roman',
    text: pdfSafe(text, { allowUnicode: false }),
  };
};

const setDsFont = (doc, { bold = false, italic = false, text = '' } = {}) => {
  const picked = pickFont(doc._dsFonts || {}, { bold, italic, text });
  doc.font(picked.name);
  return picked.text;
};

const dsText = (doc, text, x, y, options = {}) => {
  const { bold = false, italic = false, ...pdfOpts } = options;
  const picked = pickFont(doc._dsFonts || {}, { bold, italic, text });
  try {
    doc.font(picked.name);
    if (typeof x === 'number' && typeof y === 'number') {
      return doc.text(picked.text, x, y, pdfOpts);
    }
    return doc.text(picked.text, pdfOpts);
  } catch {
    const ascii = pdfSafe(text, { allowUnicode: false });
    doc.font(bold ? 'Times-Bold' : italic ? 'Times-Italic' : 'Times-Roman');
    if (typeof x === 'number' && typeof y === 'number') {
      return doc.text(ascii, x, y, pdfOpts);
    }
    return doc.text(ascii, pdfOpts);
  }
};

const fitPdfText = (doc, s, maxW) => {
  let t = setDsFont(doc, { text: s });
  while (t.length > 1 && doc.widthOfString(t) > maxW) t = t.slice(0, -1);
  return t;
};

module.exports = {
  attachDischargeFonts,
  pdfSafe,
  pickFont,
  setDsFont,
  dsText,
  fitPdfText,
};
