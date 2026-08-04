import React from 'react';

/**
 * Corporate page header used across HMS modules.
 * icon: Lucide icon component
 * actions: right-side buttons/nodes
 */
export default function PageHeader({
  icon: Icon,
  title,
  subtitle,
  actions,
  className = '',
}) {
  return (
    <div
      className={`flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white dark:bg-gray-800 border border-blue-100 dark:border-gray-700 rounded-xl px-5 py-4 ${className}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        {Icon && (
          <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center flex-shrink-0">
            <Icon size={18} />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-slate-800 dark:text-white tracking-tight truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs text-slate-500 mt-0.5 truncate">{subtitle}</p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-wrap flex-shrink-0">{actions}</div>
      )}
    </div>
  );
}
