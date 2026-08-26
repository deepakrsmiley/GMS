/**
 * Read the colliding field from a Mongo E11000 error.
 * Compound unique indexes put organizationId first in keyValue, which used to
 * show a generic "already in use" toast instead of email / name / etc.
 */
const duplicateKeyField = (err) => {
  const valueKeys = Object.keys(err?.keyValue || {}).filter((key) => key !== 'organizationId');
  if (valueKeys.length) return valueKeys[0];

  const patternKeys = Object.keys(err?.keyPattern || {}).filter((key) => key !== 'organizationId');
  if (patternKeys.length) return patternKeys[0];

  const orgKeys = Object.keys(err?.keyValue || {});
  if (orgKeys.length) return orgKeys[0];

  const msg = String(err?.message || err?.errmsg || '');
  const indexName = (msg.match(/index:\s+([\w.]+)/i) || [])[1] || '';
  const haystack = `${indexName} ${msg}`;
  if (/email/i.test(haystack)) return 'email';
  if (/employeeId/i.test(haystack)) return 'employeeId';
  if (/patientId/i.test(haystack)) return 'patientId';
  if (/barcode/i.test(haystack)) return 'barcode';
  if (/billNumber/i.test(haystack)) return 'billNumber';
  if (/\bname_|\.name\b| name:/i.test(haystack)) return 'name';
  if (/\bcode_|\.code\b| code:/i.test(haystack)) return 'code';
  if (/\b_id\b/.test(haystack)) return '_id';
  return 'value';
};

module.exports = { duplicateKeyField };
