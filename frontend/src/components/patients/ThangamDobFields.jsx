import React from 'react';
import { ageFromDobParts } from '../../utils/dobAge';

export default function ThangamDobFields({ day, month, year, onChange }) {
  const age = ageFromDobParts(day, month, year);
  const setPart = (key, raw) => {
    const max = key === 'year' ? 4 : 2;
    onChange({
      day,
      month,
      year,
      [key]: String(raw || '').replace(/\D/g, '').slice(0, max),
    });
  };

  return (
    <div style={{ gridColumn: '1 / -1' }}>
      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Date of birth *</label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          inputMode="numeric"
          className="input-field w-16"
          placeholder="DD"
          value={day}
          onChange={(e) => setPart('day', e.target.value)}
          aria-label="Day"
        />
        <span className="text-slate-400">/</span>
        <input
          inputMode="numeric"
          className="input-field w-16"
          placeholder="MM"
          value={month}
          onChange={(e) => setPart('month', e.target.value)}
          aria-label="Month"
        />
        <span className="text-slate-400">/</span>
        <input
          inputMode="numeric"
          className="input-field w-24"
          placeholder="YYYY"
          value={year}
          onChange={(e) => setPart('year', e.target.value)}
          aria-label="Year"
        />
        <span className="text-sm font-semibold text-slate-700">
          {age == null ? 'Years —' : `${age} years`}
        </span>
      </div>
    </div>
  );
}
