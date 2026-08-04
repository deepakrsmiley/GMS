import React from 'react';

export const CORP_BLUE = '#2563eb';
export const CORP_BLUE_LIGHT = '#93c5fd';
export const CORP_EMERALD = '#059669';
export const CORP_AMBER = '#d97706';
export const CORP_ROSE = '#e11d48';
export const CORP_INDIGO = '#4f46e5';
export const CORP_SLATE = '#64748b';

export const CORP_PALETTE = [
  CORP_BLUE,
  CORP_EMERALD,
  CORP_AMBER,
  CORP_INDIGO,
  CORP_ROSE,
  '#0ea5e9',
  '#8b5cf6',
  '#14b8a6',
];

export const corpTooltipStyle = {
  contentStyle: {
    background: '#ffffff',
    border: '1px solid #dbeafe',
    borderRadius: 10,
    boxShadow: '0 8px 24px rgba(37, 99, 235, 0.08)',
    padding: '10px 12px',
    fontSize: 12,
  },
  labelStyle: {
    color: '#1e3a8a',
    fontWeight: 600,
    marginBottom: 4,
    fontSize: 12,
  },
  itemStyle: {
    color: '#334155',
    fontSize: 12,
    paddingTop: 2,
  },
  cursor: { fill: 'rgba(37, 99, 235, 0.06)' },
};

export function CorpChartCard({
  title,
  subtitle,
  action,
  children,
  className = '',
  heightClass = '',
}) {
  return (
    <div className={`corp-card overflow-hidden ${className}`}>
      <div className="px-5 pt-4 pb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-white tracking-tight">
            {title}
          </h3>
          {subtitle && (
            <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>
          )}
        </div>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>
      <div className={`px-2 pb-3 sm:px-3 ${heightClass}`}>{children}</div>
    </div>
  );
}

export function CorpEmptyChart({ message = 'No data available' }) {
  return (
    <div className="h-[220px] flex flex-col items-center justify-center text-slate-400">
      <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 mb-3" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

/** Soft blue → white vertical gradient fill for area charts */
export function CorpAreaGradient({ id = 'corpBlueFill' }) {
  return (
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={CORP_BLUE} stopOpacity={0.28} />
        <stop offset="70%" stopColor={CORP_BLUE} stopOpacity={0.06} />
        <stop offset="100%" stopColor={CORP_BLUE} stopOpacity={0} />
      </linearGradient>
    </defs>
  );
}

export function CorpBarGradient({ id = 'corpBarFill', color = CORP_BLUE }) {
  return (
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity={1} />
        <stop offset="100%" stopColor={color} stopOpacity={0.65} />
      </linearGradient>
    </defs>
  );
}

export const axisTick = { fontSize: 11, fill: '#64748b' };
export const axisProps = {
  tick: axisTick,
  axisLine: false,
  tickLine: false,
};
