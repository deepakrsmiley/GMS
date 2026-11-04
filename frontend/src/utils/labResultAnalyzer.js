/**
 * labResultAnalyzer.js (frontend mirror)
 * ------------------------------------------------------------------
 * Client-side copy of backend/utils/labResultAnalyzer.js so the print
 * template can render flags/colors/arrows instantly without waiting on
 * a server round trip. Keep this logic in sync with the backend file.
 * ------------------------------------------------------------------
 */

const QUALITATIVE_NORMAL = new Set([
  'negative', 'non reactive', 'nonreactive', 'not detected', 'absent', 'nil', 'normal',
  'clear', 'pale yellow',
]);
const QUALITATIVE_ABNORMAL = new Set([
  'positive', 'reactive', 'detected', 'present', 'trace',
]);

export const SGPT_DISCLAIMER = 'SGPT (ALT) can rise with liver cell injury, some medicines, and muscle strain. Read it with the other liver tests and the clinical findings.';

export function tidyRangeText(value) {
  let text = String(value ?? '').trim();
  if (!text || text === '-' || text === '—') return text;
  text = text.replace(/\b(less than|upto|up to)\s*/gi, '<');
  text = text.replace(/<\s+/g, '<');
  text = text.replace(/(<=|>=|<|>)\s*(\d+(?:\.\d+)?)\s*(?:mg\s*\/\s*dl)?/gi, '$1$2');
  return text;
}

export function demographicParts(value) {
  const text = String(value ?? '');
  if (!/\b[MFC]\s*:/i.test(text)) return null;
  const parts = {};
  const re = /([MFC])\s*:\s*([^;]+)/gi;
  let match = re.exec(text);
  while (match) {
    const key = match[1].toUpperCase();
    const band = tidyRangeText(match[2]);
    if (key === 'M') parts.male = band;
    if (key === 'F') parts.female = band;
    if (key === 'C') parts.child = band;
    match = re.exec(text);
  }
  if (!parts.male && !parts.female && !parts.child) return null;
  return parts;
}

function pickDemographic(parts, patient = {}) {
  const age = Number(patient.age);
  const gender = String(patient.gender || '').toLowerCase();
  if (!Number.isNaN(age) && age <= 12 && parts.child) return parts.child;
  if (gender.startsWith('f') && parts.female) return parts.female;
  if (gender.startsWith('m') && parts.male) return parts.male;
  return parts.male || parts.female || parts.child || '';
}

export function tidyTestName(name) {
  return String(name || '').replace(/post\s+pra[nr]di[ae]n/gi, 'Post Prandial');
}

export function labSectionRank(title) {
  const text = String(title || '').toLowerCase();
  if (/hemogram|complete blood|\bcbc\b|haemogram/.test(text)) return 10;
  if (/esr|sedimentation/.test(text)) return 20;
  if (/sugar|glucose|fasting|\bfbs\b|hba1c|ppbs|prand/.test(text)) return 30;
  if (/lipid|\bflp\b|cholesterol/.test(text)) return 40;
  if (/\brft\b|renal|kidney/.test(text)) return 50;
  if (/\blft\b|liver|sgpt|sgot/.test(text)) return 60;
  if (/bilirubin|\bblbi\b/.test(text)) return 70;
  if (/urine|u\.r/.test(text)) return 80;
  return 500;
}

function qualitativeFlag(rawValue) {
  const value = String(rawValue || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!value) return null;
  if (QUALITATIVE_NORMAL.has(value)) return 'normal';
  if (QUALITATIVE_ABNORMAL.has(value)) return 'abnormal';
  if (/^(trace|present|positive)(\s*\(\+{1,4}\))?$/.test(value)) return 'abnormal';
  if (/^present\s*\+{1,4}$/.test(value)) return 'abnormal';
  if (/^\+{1,4}$/.test(value) || /^[1-4]\+$/.test(value)) return 'abnormal';
  if (/\(\+{1,4}\)/.test(value)) return 'abnormal';
  return null;
}

export function resolveReferenceRange(referenceRange, patient = {}) {
  if (referenceRange == null) return '';
  if (typeof referenceRange === 'string' || typeof referenceRange === 'number') {
    const text = tidyRangeText(referenceRange);
    const parts = demographicParts(text);
    if (!parts) return text;
    return tidyRangeText(pickDemographic(parts, patient));
  }
  if (typeof referenceRange === 'object') {
    const age = Number(patient.age);
    const gender = String(patient.gender || '').toLowerCase();

    if (!Number.isNaN(age)) {
      if (age <= 0.08 && referenceRange.newborn) return referenceRange.newborn;
      if (age <= 1 && referenceRange.infant) return referenceRange.infant;
      if (age <= 12 && referenceRange.child) return referenceRange.child;
      if (age >= 60 && referenceRange.senior) return referenceRange.senior;
    }
    if (gender.startsWith('f') && referenceRange.female) return referenceRange.female;
    if (gender.startsWith('m') && referenceRange.male) return referenceRange.male;
    return referenceRange.default || referenceRange.normal || Object.values(referenceRange).find(Boolean) || '';
  }
  return String(referenceRange);
}

export function parseNumericRange(rangeStr) {
  const str = String(rangeStr || '')
    .trim()
    .replace(/[\u2010-\u2015\u2212]/g, '-') // normalize unicode dashes to hyphen
    .replace(/\s+/g, ' ');
  if (!str) return null;

  const opMatch = str.match(/^(<=|>=|<|>)\s*(-?\d+(?:\.\d+)?)/);
  if (opMatch) {
    const [, op, numStr] = opMatch;
    const num = parseFloat(numStr);
    if (op === '<' || op === '<=') return { min: -Infinity, max: num, maxInclusive: op === '<=', minInclusive: false };
    if (op === '>' || op === '>=') return { min: num, max: Infinity, minInclusive: op === '>=', maxInclusive: false };
  }

  const rangeMatch = str.match(/(-?\d+(?:\.\d+)?)\s*(?:-|to)\s*(-?\d+(?:\.\d+)?)/i);
  if (rangeMatch) {
    return { min: parseFloat(rangeMatch[1]), max: parseFloat(rangeMatch[2]) };
  }

  const singleMatch = str.match(/^-?\d+(?:\.\d+)?$/);
  if (singleMatch) {
    const num = parseFloat(str);
    return { min: num, max: num };
  }

  return null;
}

function isNumericValue(v) {
  return /^-?\d+(?:\.\d+)?$/.test(String(v || '').trim());
}

/**
 * @returns {{displayRange:string, flag:string, status:string, arrow:string, isCritical:boolean, isAbnormal:boolean}}
 */
export function analyzeResult({ value, referenceRange, criticalLow, criticalHigh, patient = {} } = {}) {
  const displayRange = resolveReferenceRange(referenceRange, patient);
  const rawValue = value === undefined || value === null ? '' : String(value).trim();

  if (!rawValue) {
    return { displayRange, flag: 'NA', status: 'N/A', arrow: '', isCritical: false, isAbnormal: false };
  }

  const qualitative = qualitativeFlag(rawValue);
  if (qualitative === 'normal') {
    return { displayRange: displayRange || rawValue, flag: 'NORMAL', status: 'Normal', arrow: '', isCritical: false, isAbnormal: false };
  }
  if (qualitative === 'abnormal') {
    return { displayRange: displayRange || rawValue, flag: 'ABNORMAL', status: 'Abnormal', arrow: '', isCritical: false, isAbnormal: true };
  }

  if (isNumericValue(rawValue)) {
    const numValue = parseFloat(rawValue);
    const hasCriticalLow = criticalLow !== undefined && criticalLow !== null && criticalLow !== '';
    const hasCriticalHigh = criticalHigh !== undefined && criticalHigh !== null && criticalHigh !== '';

    if (hasCriticalLow && numValue < Number(criticalLow)) {
      return { displayRange, flag: 'CRITICAL_LOW', status: 'Critical', arrow: '↓', isCritical: true, isAbnormal: true };
    }
    if (hasCriticalHigh && numValue > Number(criticalHigh)) {
      return { displayRange, flag: 'CRITICAL_HIGH', status: 'Critical', arrow: '↑', isCritical: true, isAbnormal: true };
    }

    const parsedRange = parseNumericRange(displayRange);
    if (!parsedRange) {
      return { displayRange, flag: 'NA', status: 'N/A', arrow: '', isCritical: false, isAbnormal: false };
    }

    const belowMin = parsedRange.minInclusive === false
      ? numValue <= parsedRange.min
      : numValue < parsedRange.min;
    const aboveMax = parsedRange.maxInclusive === false
      ? numValue >= parsedRange.max
      : numValue > parsedRange.max;

    // Soft critical: far outside reference (±50% of range width) when no explicit critical limits
    if (Number.isFinite(parsedRange.min) && Number.isFinite(parsedRange.max)) {
      const span = Math.abs(parsedRange.max - parsedRange.min) || Math.abs(parsedRange.max) || 1;
      const pad = span * 0.5;
      if (numValue < parsedRange.min - pad) {
        return { displayRange, flag: 'CRITICAL_LOW', status: 'Critical', arrow: '↓', isCritical: true, isAbnormal: true };
      }
      if (numValue > parsedRange.max + pad) {
        return { displayRange, flag: 'CRITICAL_HIGH', status: 'Critical', arrow: '↑', isCritical: true, isAbnormal: true };
      }
    }

    if (belowMin) return { displayRange, flag: 'LOW', status: 'Abnormal', arrow: '↓', isCritical: false, isAbnormal: true };
    if (aboveMax) return { displayRange, flag: 'HIGH', status: 'Abnormal', arrow: '↑', isCritical: false, isAbnormal: true };
    return { displayRange, flag: 'NORMAL', status: 'Normal', arrow: '', isCritical: false, isAbnormal: false };
  }

  return { displayRange: displayRange || rawValue, flag: 'NA', status: 'N/A', arrow: '', isCritical: false, isAbnormal: false };
}

// Flag -> Tailwind class presets used by LabReportTemplate
export const FLAG_STYLES = {
  NORMAL: { text: 'text-emerald-700', row: 'bg-emerald-50/60', badge: 'bg-emerald-100 text-emerald-700' },
  LOW: { text: 'text-blue-700 font-semibold', row: 'bg-blue-50/70', badge: 'bg-blue-100 text-blue-700' },
  HIGH: { text: 'text-orange-700 font-semibold', row: 'bg-orange-50/70', badge: 'bg-orange-100 text-orange-700' },
  ABNORMAL: { text: 'text-red-600 font-semibold', row: 'bg-red-50/70', badge: 'bg-red-100 text-red-700' },
  CRITICAL_LOW: { text: 'text-red-700 font-bold', row: 'bg-red-100', badge: 'bg-red-600 text-white' },
  CRITICAL_HIGH: { text: 'text-red-700 font-bold', row: 'bg-red-100', badge: 'bg-red-600 text-white' },
  NA: { text: 'text-slate-700', row: '', badge: 'bg-slate-100 text-slate-500' },
};