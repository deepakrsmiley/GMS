import React from 'react';

export default function StatCard({ icon: Icon, label, value, tone = 'blue' }) {
  const tones = {
    blue: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400',
    green: 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400',
    red: 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400',
    purple: 'bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400',
  };
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-3 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${tones[tone]}`}>
        {Icon && <Icon size={16} />}
      </div>
      <div>
        <p className="text-lg font-bold text-gray-900 dark:text-white leading-none">{value}</p>
        <p className="text-[11px] text-gray-400 mt-0.5">{label}</p>
      </div>
    </div>
  );
}
