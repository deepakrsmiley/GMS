import React from 'react';
import { AlertTriangle, AlertCircle, Info } from 'lucide-react';

const levelStyles = {
  critical: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900/40',
  warning: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-900/40',
  info: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-900/40',
};
const levelIcon = { critical: AlertTriangle, warning: AlertCircle, info: Info };

export default function AlertsBar({ alerts = [] }) {
  if (!alerts.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {alerts.map((a, i) => {
        const Icon = levelIcon[a.level] || Info;
        return (
          <span key={i} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${levelStyles[a.level] || levelStyles.info}`}>
            <Icon size={13} /> {a.type}{a.detail ? `: ${a.detail}` : ''}
          </span>
        );
      })}
    </div>
  );
}
