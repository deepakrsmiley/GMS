import React from 'react';
import { SYSTEM_TAGLINE, SOFTWARE_LOGO } from '../../constants/branding';

export default function SystemBrandingLogo({
  size = 'md',
  showTagline = true,
  className = '',
}) {
  const sizes = {
    sm: 'max-w-[180px]',
    md: 'max-w-[240px]',
    lg: 'max-w-[320px]',
    xl: 'max-w-[400px]',
  };

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <img
        src={SOFTWARE_LOGO}
        alt="Galactic medical system"
        className={`w-full h-auto object-contain ${sizes[size] || sizes.md}`}
      />
      {showTagline && (
        <p className="mt-2 text-sm text-gray-500 font-medium text-center">{SYSTEM_TAGLINE}</p>
      )}
    </div>
  );
}
