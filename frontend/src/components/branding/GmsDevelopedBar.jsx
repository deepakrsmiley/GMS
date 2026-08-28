import React from 'react';
import { SOFTWARE_LOGO, DEVELOPED_BY_LABEL, SYSTEM_SHORT_NAME } from '../../constants/branding';

export default function GmsDevelopedBar({ superAdmin = false, clientHospital = false }) {
  const label = superAdmin && !clientHospital
    ? `${SYSTEM_SHORT_NAME} Super Admin`
    : DEVELOPED_BY_LABEL;
  return (
    <div className="fixed top-0 left-0 right-0 z-50 h-7 flex items-center justify-center gap-2 bg-slate-900 text-white text-[10px] sm:text-[11px] font-semibold tracking-wide px-2">
      <img src={SOFTWARE_LOGO} alt="" className="h-4 w-4 rounded-sm object-contain bg-white shrink-0" />
      <span className="truncate">{label}</span>
    </div>
  );
}

export function GmsDevelopedMark({ className = '' }) {
  return (
    <p className={`text-[10px] font-semibold uppercase tracking-wider text-blue-600 ${className}`}>
      {DEVELOPED_BY_LABEL}
    </p>
  );
}

export function GmsDevelopedPrintLine() {
  return (
    <div style={{
      fontSize: 9,
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      color: '#64748b',
      fontWeight: 600,
      marginBottom: 4,
    }}>
      {DEVELOPED_BY_LABEL}
    </div>
  );
}
