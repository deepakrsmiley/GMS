import React from 'react';
import { ageDetailFromDobParts, formatYearMonthAge } from '../../utils/dobAge';

export default function YearMonthFields({ month, year, onChange, labelClassName = 'pt-form-label' }) {
  const age = ageDetailFromDobParts(1, month, year);
  const setPart = (key, raw) => {
    const max = key === 'year' ? 4 : 2;
    onChange({
      day: '',
      month,
      year,
      [key]: String(raw || '').replace(/\D/g, '').slice(0, max),
    });
  };

  return (
    <div>
      <label className={labelClassName}>Year / Month *</label>
      <div className="flex items-center gap-2">
        <input
          inputMode="numeric"
          className="input-field w-24"
          placeholder="YYYY"
          value={year}
          onChange={(e) => setPart('year', e.target.value)}
          aria-label="Birth year"
        />
        <span className="text-slate-400">/</span>
        <input
          inputMode="numeric"
          className="input-field w-16"
          placeholder="MM"
          value={month}
          onChange={(e) => setPart('month', e.target.value)}
          aria-label="Birth month"
        />
      </div>
      <p className="text-xs font-semibold text-slate-600 mt-1">
        {age == null ? 'Age —' : formatYearMonthAge(age)}
      </p>
    </div>
  );
}
