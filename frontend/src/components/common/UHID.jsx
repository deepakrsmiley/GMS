import React from 'react';

/**
 * Single lifelong hospital ID assigned at patient registration (patient.patientId).
 * Use this everywhere so pharmacy / lab / IP / billing show the SAME ID.
 */
export function getUHID(patientOrId) {
  if (!patientOrId) return '';
  if (typeof patientOrId === 'string') return patientOrId;
  return patientOrId.patientId || '';
}

/** Compact mono badge — put next to patient name */
export default function UHID({ value, className = '' }) {
  const id = typeof value === 'string' ? value : getUHID(value);
  if (!id) return null;
  return (
    <span
      className={`inline-flex items-center font-mono text-xs font-semibold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/25 px-1.5 py-0.5 rounded ${className}`}
      title="UHID — unique patient ID from registration"
    >
      {id}
    </span>
  );
}

/** "UHID: PT26…" line under a name */
export function UHIDLine({ value, extra = '' }) {
  const id = typeof value === 'string' ? value : getUHID(value);
  if (!id && !extra) return null;
  return (
    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
      {id ? (
        <>
          <span className="font-semibold text-gray-600 dark:text-gray-300">UHID:</span>{' '}
          <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">{id}</span>
        </>
      ) : null}
      {id && extra ? <span className="text-gray-400"> · {extra}</span> : null}
      {!id && extra ? extra : null}
    </p>
  );
}
