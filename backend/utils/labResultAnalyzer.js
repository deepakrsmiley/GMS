/**
 * labResultAnalyzer.js
 * ------------------------------------------------------------------
 * Single source of truth for comparing a lab result value against its
 * reference range and deriving flag / status / display metadata.
 *
 * Used by:
 *  - backend/controllers/labController.js  (persist derived flag+status)
 *  - frontend LabReportTemplate.jsx has a mirrored copy (utils/labResultAnalyzer.js)
 *    for instant client-side rendering without a round trip.
 *
 * Supports numeric ranges ("13 - 18", "13-18", "13 – 18"), single-bound
 * operators ("< 5", ">= 10"), and qualitative values (Positive/Negative,
 * Reactive/Non Reactive, Detected/Not Detected, Present/Absent, Trace,
 * Nil, Few, Many). Reference ranges may also be gender/age specific
 * objects: { male, female, child, infant, newborn, senior, default }.
 * ------------------------------------------------------------------
 */

const QUALITATIVE_NORMAL = new Set([
  'negative', 'non reactive', 'nonreactive', 'not detected', 'absent', 'nil', 'normal',
]);
const QUALITATIVE_ABNORMAL = new Set([
  'positive', 'reactive', 'detected', 'present',
]);

// Pick the correct reference range when it is stored per demographic group.
function resolveReferenceRange(referenceRange, patient = {}) {
  if (referenceRange == null) return '';
  if (typeof referenceRange === 'string' || typeof referenceRange === 'number') {
    return String(referenceRange);
  }
  if (typeof referenceRange === 'object') {
    const age = Number(patient.age);
    const gender = String(patient.gender || '').toLowerCase();

    if (!Number.isNaN(age)) {
      if (age <= 0.08 && referenceRange.newborn) return referenceRange.newborn; // ~1 month
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

// Extract { min, max, operator } from a numeric-style range string.
function parseNumericRange(rangeStr) {
  const str = String(rangeStr || '').trim();
  if (!str) return null;

  const opMatch = str.match(/^(<=|>=|<|>)\s*(-?\d+(?:\.\d+)?)/);
  if (opMatch) {
    const [, op, numStr] = opMatch;
    const num = parseFloat(numStr);
    if (op === '<' || op === '<=') return { min: -Infinity, max: num, maxInclusive: op === '<=' };
    if (op === '>' || op === '>=') return { min: num, max: Infinity, minInclusive: op === '>=' };
  }

  // "13 - 18", "13-18", "13 – 18", "13 to 18"
  const rangeMatch = str.match(/(-?\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*(-?\d+(?:\.\d+)?)/i);
  if (rangeMatch) {
    return { min: parseFloat(rangeMatch[1]), max: parseFloat(rangeMatch[2]), minInclusive: true, maxInclusive: true };
  }

  // Single number treated as an exact/max reference
  const singleMatch = str.match(/^-?\d+(?:\.\d+)?$/);
  if (singleMatch) {
    const num = parseFloat(str);
    return { min: num, max: num, minInclusive: true, maxInclusive: true };
  }

  return null;
}

function isNumericValue(v) {
  return /^-?\d+(?:\.\d+)?$/.test(String(v || '').trim());
}

/**
 * Analyze a single result row.
 * @param {Object} params
 * @param {string|number} params.value       - the entered result
 * @param {string|Object} params.referenceRange - range text or demographic object
 * @param {number} [params.criticalLow]
 * @param {number} [params.criticalHigh]
 * @param {Object} [params.patient]          - { age, gender } used to resolve demographic ranges
 * @returns {{
 *   displayRange: string,
 *   flag: 'NORMAL'|'LOW'|'HIGH'|'CRITICAL_LOW'|'CRITICAL_HIGH'|'ABNORMAL'|'NA',
 *   status: 'Normal'|'Abnormal'|'Critical'|'N/A',
 *   arrow: '↓'|'↑'|'',
 *   isCritical: boolean,
 *   isAbnormal: boolean
 * }}
 */
function analyzeResult({ value, referenceRange, criticalLow, criticalHigh, patient = {} } = {}) {
  const displayRange = resolveReferenceRange(referenceRange, patient);
  const rawValue = value === undefined || value === null ? '' : String(value).trim();

  if (!rawValue) {
    return { displayRange, flag: 'NA', status: 'N/A', arrow: '', isCritical: false, isAbnormal: false };
  }

  // Qualitative interpretation first
  const lowerValue = rawValue.toLowerCase();
  if (QUALITATIVE_NORMAL.has(lowerValue)) {
    return { displayRange: displayRange || rawValue, flag: 'NORMAL', status: 'Normal', arrow: '', isCritical: false, isAbnormal: false };
  }
  if (QUALITATIVE_ABNORMAL.has(lowerValue)) {
    return { displayRange: displayRange || rawValue, flag: 'ABNORMAL', status: 'Abnormal', arrow: '', isCritical: false, isAbnormal: true };
  }

  // Numeric interpretation
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

    if (belowMin) return { displayRange, flag: 'LOW', status: 'Abnormal', arrow: '↓', isCritical: false, isAbnormal: true };
    if (aboveMax) return { displayRange, flag: 'HIGH', status: 'Abnormal', arrow: '↑', isCritical: false, isAbnormal: true };
    return { displayRange, flag: 'NORMAL', status: 'Normal', arrow: '', isCritical: false, isAbnormal: false };
  }

  // Free text value we can't classify — leave neutral, don't guess
  return { displayRange: displayRange || rawValue, flag: 'NA', status: 'N/A', arrow: '', isCritical: false, isAbnormal: false };
}

module.exports = { analyzeResult, resolveReferenceRange, parseNumericRange };