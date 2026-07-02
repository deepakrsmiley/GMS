import React from 'react';
import { useBranding } from '../../hooks/useBranding';

export default function HospitalBrandingDisplay({
  showLogo = true,
  showContact = false,
  className = '',
}) {
  const { branding } = useBranding();

  return (
    <div className={className}>
      {showLogo && branding.logo && (
        <img
          src={branding.logo}
          alt={branding.hospitalName}
          className="w-10 h-10 object-contain rounded-lg mt-2"
        />
      )}
      <p className="text-sm font-semibold text-white mt-1 truncate">{branding.hospitalName}</p>
      {branding.tagline && (
        <p className="text-xs text-gray-400 truncate">{branding.tagline}</p>
      )}
      {showContact && (branding.phone || branding.gstNumber) && (
        <p className="text-[10px] text-gray-500 mt-1 truncate">
          {[branding.phone && `Ph: ${branding.phone}`, branding.gstNumber && `GST: ${branding.gstNumber}`]
            .filter(Boolean)
            .join(' | ')}
        </p>
      )}
    </div>
  );
}
