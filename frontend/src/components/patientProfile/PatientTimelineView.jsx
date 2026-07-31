import React, { useState } from 'react';
import {
  UserPlus, Stethoscope, FlaskConical, Pill, BedDouble, ArrowRightLeft,
  ClipboardList, Scissors, LogOut, CalendarClock, Receipt, Wallet, Circle,
} from 'lucide-react';
import LoadingSpinner from '../common/LoadingSpinner';

const ICONS = {
  Registration: UserPlus,
  'OP Visit': Stethoscope,
  'Lab Test': FlaskConical,
  Medicine: Pill,
  Admission: BedDouble,
  'Room Transfer': ArrowRightLeft,
  'Doctor Round': ClipboardList,
  Operation: Scissors,
  Discharge: LogOut,
  'Follow Up': CalendarClock,
  Bill: Receipt,
  Payment: Wallet,
};

const COLORS = {
  Registration: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20',
  'OP Visit': 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20',
  'Lab Test': 'text-purple-600 bg-purple-50 dark:bg-purple-900/20',
  Medicine: 'text-pink-600 bg-pink-50 dark:bg-pink-900/20',
  Admission: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20',
  'Room Transfer': 'text-cyan-600 bg-cyan-50 dark:bg-cyan-900/20',
  'Doctor Round': 'text-teal-600 bg-teal-50 dark:bg-teal-900/20',
  Operation: 'text-red-600 bg-red-50 dark:bg-red-900/20',
  Discharge: 'text-gray-600 bg-gray-100 dark:bg-gray-700',
  'Follow Up': 'text-blue-600 bg-blue-50 dark:bg-blue-900/20',
  Bill: 'text-green-600 bg-green-50 dark:bg-green-900/20',
  Payment: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20',
};

const FILTERS = ['All', 'OP Visit', 'Admission', 'Lab Test', 'Medicine', 'Operation', 'Bill', 'Payment'];

export default function PatientTimelineView({ events = [], loading }) {
  const [filter, setFilter] = useState('All');

  if (loading) return <LoadingSpinner />;

  const filtered = filter === 'All' ? events : events.filter((e) => e.type === filter);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">Patient Timeline</h3>
        <div className="flex gap-1.5 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${filter === f ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-center text-gray-400 py-10">No timeline events yet</p>
      ) : (
        <div className="relative pl-6 border-l-2 border-gray-100 dark:border-gray-700 space-y-5">
          {filtered.map((e, i) => {
            const Icon = ICONS[e.type] || Circle;
            const color = COLORS[e.type] || 'text-gray-600 bg-gray-100';
            return (
              <div key={i} className="relative">
                <div className={`absolute -left-[31px] w-7 h-7 rounded-full flex items-center justify-center ${color}`}>
                  <Icon size={13} />
                </div>
                <div className="bg-gray-50 dark:bg-gray-900/40 rounded-xl px-4 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{e.title}</p>
                    <span className="text-xs text-gray-400 whitespace-nowrap">{new Date(e.date).toLocaleString('en-IN')}</span>
                  </div>
                  {e.subtitle && <p className="text-xs text-gray-500 mt-0.5">{e.subtitle}</p>}
                  {e.status && <span className="badge-blue mt-1 inline-block">{e.status}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
