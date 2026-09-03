/** Soft Indigo HMS theme helpers — sync CSS variables from branding.primaryColor */

const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));

const hexToRgb = (hex) => {
  const h = String(hex || '').replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
};

const rgbToHex = ({ r, g, b }) =>
  `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('')}`;

const mix = (a, b, t) => ({
  r: a.r + (b.r - a.r) * t,
  g: a.g + (b.g - a.g) * t,
  b: a.b + (b.b - a.b) * t,
});

const WHITE = { r: 255, g: 255, b: 255 };
const BLACK = { r: 0, g: 0, b: 0 };

export function applyHmsTheme(primaryColor = '#4338ca') {
  if (typeof document === 'undefined') return;
  const primary = hexToRgb(primaryColor) || hexToRgb('#4338ca');
  const root = document.documentElement;

  const hover = mix(primary, BLACK, 0.14);
  const deep = mix(primary, BLACK, 0.28);
  const accent = mix(primary, WHITE, 0.42);
  const soft = mix(primary, WHITE, 0.88);
  const muted = mix(primary, WHITE, 0.94);
  const border = mix(primary, WHITE, 0.72);

  root.style.setProperty('--hms-primary', rgbToHex(primary));
  root.style.setProperty('--hms-primary-hover', rgbToHex(hover));
  root.style.setProperty('--hms-primary-deep', rgbToHex(deep));
  root.style.setProperty('--hms-accent', rgbToHex(accent));
  root.style.setProperty('--hms-primary-soft', rgbToHex(soft));
  root.style.setProperty('--hms-primary-muted', rgbToHex(muted));
  root.style.setProperty('--hms-primary-border', rgbToHex(border));
  root.style.setProperty('--hms-on-primary', '#ffffff');
}
