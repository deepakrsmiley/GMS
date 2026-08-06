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
]);
const QUALITATIVE_ABNORMAL = new Set([
  'positive', 'reactive', 'detected', 'present',
]);

export function resolveReferenceRange(referenceRange, patient = {}) {
  if (referenceRange == null) return '';
  if (typeof referenceRange === 'string' || typeof referenceRange === 'number') {
    return String(referenceRange);
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
    if (op === '<' || op === '<=') return { min: -Infinity, max: num };
    if (op === '>' || op === '>=') return { min: num, max: Infinity };
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

  const lowerValue = rawValue.toLowerCase();
  if (QUALITATIVE_NORMAL.has(lowerValue)) {
    return { displayRange: displayRange || rawValue, flag: 'NORMAL', status: 'Normal', arrow: '', isCritical: false, isAbnormal: false };
  }
  if (QUALITATIVE_ABNORMAL.has(lowerValue)) {
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

    const belowMin = numValue < parsedRange.min;
    const aboveMax = numValue > parsedRange.max;

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