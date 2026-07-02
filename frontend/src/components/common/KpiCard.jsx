import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown } from 'lucide-react';

export default function KpiCard({ title, value, icon: Icon, color, trend, trendValue, subtitle }) {
  const colors = {
    blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600',
    green: 'bg-green-50 dark:bg-green-900/20 text-green-600',
    red: 'bg-red-50 dark:bg-red-900/20 text-red-600',
    yellow: 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600',
    purple: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600',
    indigo: 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="kpi-card"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">{title}</p>
          <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{value}</p>
          {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
          {trendValue !== undefined && (
            <div className={`flex items-center gap-1 mt-2 text-xs font-medium ${trend === 'up' ? 'text-green-600' : 'text-red-600'}`}>
              {trend === 'up' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {trendValue}% vs yesterday
            </div>
          )}
        </div>
        <div className={`p-3 rounded-xl ${colors[color] || colors.blue}`}>
          <Icon size={24} />
        </div>
      </div>
    </motion.div>
  );
}
