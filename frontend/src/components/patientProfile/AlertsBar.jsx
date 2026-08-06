import React from 'react';
import { AlertTriangle, AlertCircle, Info } from 'lucide-react';

const levelIcon = { critical: AlertTriangle, warning: AlertCircle, info: Info };

export default function AlertsBar({ alerts = [] }) {
  if (!alerts.length) return null;
  return (
    <div className="p360-alerts">
      {alerts.map((a, i) => {
        const Icon = levelIcon[a.level] || Info;
        const cls = a.level === 'critical'
          ? 'p360-alert--critical'
          : a.level === 'warning'
            ? 'p360-alert--warning'
            : 'p360-alert--info';
        return (
          <span key={i} className={`p360-alert ${cls}`}>
            <Icon size={12} /> {a.type}{a.detail ? `: ${a.detail}` : ''}
          </span>
        );
      })}
    </div>
  );
}
