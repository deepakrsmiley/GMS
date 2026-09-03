import { useEffect } from 'react';
import { useBranding, useBrandingSocketSync } from '../../hooks/useBranding';
import { applyHmsTheme } from '../../utils/hmsTheme';

export default function BrandingSync() {
  useBrandingSocketSync();
  const { branding } = useBranding();

  useEffect(() => {
    applyHmsTheme(branding?.primaryColor || '#4338ca');
  }, [branding?.primaryColor]);

  return null;
}
