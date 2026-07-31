import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown } from 'lucide-react';

export default function KpiCard({ title, value, icon: Icon, color, trend, trendValue, subtitle }) {
  const colors = {
    blue:   { bg: 'bg-blue-50 dark:bg-blue-900/20', text: 'text-blue-600' },
    green:  { bg: 'bg-green-50 dark:bg-green-900/20', text: 'text-green-600' },
    red:    { bg: 'bg-red-50 dark:bg-red-900/20', text: 'text-red-600' },
    yellow: { bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-amber-600' },
    orange: { bg: 'bg-orange-50 dark:bg-orange-900/20', text: 'text-orange-600' },
    purple: { bg: 'bg-purple-50 dark:bg-purple-900/20', text: 'text-purple-600' },
    indigo: { bg: 'bg-indigo-50 dark:bg-indigo-900/20', text: 'text-indigo-600' },
    teal:   { bg: 'bg-teal-50 dark:bg-teal-900/20', text: 'text-teal-600' },
    pink:   { bg: 'bg-pink-50 dark:bg-pink-900/20', text: 'text-pink-600' },
  };
  const c = colors[color] || colors.blue;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md transition-shadow duration-200"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-500 dark:text-gray-400 font-medium truncate">{title}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{value}</p>
          {trendValue !== undefined ? (
            <div className={`flex items-center gap-1 mt-2 text-xs font-medium ${trend === 'up' ? 'text-green-600' : 'text-red-500'}`}>
              {trend === 'up' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {trendValue}% from yesterday
            </div>
          ) : subtitle ? (
            <p className="text-xs text-gray-400 mt-2">{subtitle}</p>
          ) : null}
        </div>
        <div className={`p-3 rounded-2xl ${c.bg} ${c.text} flex-shrink-0`}>
          <Icon size={22} />
        </div>
      </div>
    </motion.div>
  );
}