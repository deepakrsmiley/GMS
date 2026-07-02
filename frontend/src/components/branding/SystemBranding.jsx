import React from 'react';
import { SOFTWARE_LOGO, SYSTEM_TAGLINE } from '../../constants/branding';

export default function SystemBranding({ size = 'md', className = '' }) {
  const sizes = {
    sm: 'max-w-[120px]',
    md: 'max-w-[160px]',
    lg: 'max-w-[200px]',
  };

  return (
    <div className={className}>
      <img
        src={SOFTWARE_LOGO}
        alt="Galactic medical system"
        className={`w-full h-auto object-contain ${sizes[size] || sizes.md}`}
      />
      <p className="text-gray-400 text-[10px] leading-tight mt-1">{SYSTEM_TAGLINE}</p>
    </div>
  );
}
