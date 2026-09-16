import React, { useMemo, useState } from 'react';
import { Search, Plus, X } from 'lucide-react';
import '../../styles/labOrder.css';

/**
 * MASSoft-style lab add: Single Test | Group Test lists, click to add,
 * selected rows show child tests when a group is chosen.
 */
export default function LabTestPicker({
  catalog,
  selectedNames = [],
  prices = {},
  onToggle,
  onPriceChange,
  allowPriceEdit = true,
  compact = false,
}) {
  const [tab, setTab] = useState('single');
  const [query, setQuery] = useState('');
  const [openGroup, setOpenGroup] = useState('');

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (catalog.list(tab) || []).filter((row) => {
      if (!q) return true;
      const child = (row.tests || []).map((t) => t.testName).join(' ');
      return `${row.testCode} ${row.name} ${row.category} ${child}`.toLowerCase().includes(q);
    });
  }, [catalog, tab, query]);

  const selected = selectedNames
    .map((name) => {
      const meta = catalog.getMeta(name);
      const kind = catalog.kindOf(name);
      const children = (meta?.tests || []).filter((t) => !t.isSection);
      return {
        name,
        kind,
        price: prices[name] ?? catalog.priceMap[name] ?? 0,
        children,
        tests: meta?.tests || [],
      };
    })
    .filter(Boolean);

  const total = selected.reduce((sum, row) => sum + (Number(row.price) || 0), 0);

  return (
    <div className={`ltp ${compact ? 'ltp--compact' : ''}`}>
      <div className="ltp-tabs">
        <button
          type="button"
          className={`ltp-tab ${tab === 'single' ? 'is-on' : ''}`}
          onClick={() => { setTab('single'); setQuery(''); }}
        >
          Single Test
        </button>
        <button
          type="button"
          className={`ltp-tab ${tab === 'group' ? 'is-on' : ''}`}
          onClick={() => { setTab('group'); setQuery(''); }}
        >
          Group Test
        </button>
      </div>

      <div className="ltp-search">
        <Search size={14} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
          placeholder={tab === 'group' ? 'Search group name or code (CBC, LFT…)' : 'Search test name or code'}
        />
      </div>

      <div className="ltp-table-wrap">
        <table className="ltp-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Rate</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {!rows.length && (
              <tr>
                <td colSpan={4} className="ltp-empty">
                  {tab === 'group' ? 'No group tests' : 'No single tests'}
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const on = selectedNames.includes(row.name);
              const childCount = (row.tests || []).filter((t) => !t.isSection).length;
              return (
                <tr
                  key={`${row.kind}-${row.name}`}
                  className={on ? 'is-on' : ''}
                  onClick={() => onToggle(row.name)}
                >
                  <td className="ltp-code">{row.testCode || '—'}</td>
                  <td>
                    <div className="ltp-name">{row.name}</div>
                    <div className="ltp-meta">
                      {row.kind === 'group' ? `Group · ${childCount} tests` : 'Single'}
                      {row.category ? ` · ${row.category}` : ''}
                    </div>
                  </td>
                  <td className="ltp-rate">₹{Number(row.price || 0).toFixed(0)}</td>
                  <td>
                    <span className={`ltp-add ${on ? 'is-on' : ''}`}>
                      {on ? <X size={12} /> : <Plus size={12} />}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="ltp-selected">
        <div className="ltp-selected__head">
          <span>Added tests</span>
          <strong>{selected.length} · ₹{total.toFixed(0)}</strong>
        </div>
        {!selected.length && (
          <p className="ltp-empty">Click a Single Test or Group Test above to add it — same as the lab software.</p>
        )}
        {selected.map((row) => (
          <div key={row.name} className="ltp-picked">
            <div className="ltp-picked__row">
              <div>
                <div className="ltp-name">{row.name}</div>
                <div className="ltp-meta">
                  {row.kind === 'group' ? `Group · ${row.children.length} tests` : 'Single'}
                </div>
              </div>
              {allowPriceEdit ? (
                <label className="ltp-price">
                  ₹
                  <input
                    type="number"
                    min="0"
                    value={prices[row.name] ?? row.price ?? ''}
                    onChange={(e) => onPriceChange?.(row.name, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </label>
              ) : (
                <span className="ltp-rate">₹{Number(row.price || 0).toFixed(0)}</span>
              )}
              <button type="button" className="ltp-remove" onClick={() => onToggle(row.name)} title="Remove">
                <X size={14} />
              </button>
            </div>
            {row.kind === 'group' && row.tests?.length > 0 && (
              <button
                type="button"
                className="ltp-children-toggle"
                onClick={() => setOpenGroup((cur) => (cur === row.name ? '' : row.name))}
              >
                {openGroup === row.name ? 'Hide tests' : 'Show tests (as in lab software)'}
              </button>
            )}
            {openGroup === row.name && (
              <ul className="ltp-children">
                {row.tests.map((t, idx) => (
                  <li key={`${t.testName}-${idx}`} className={t.isSection ? 'is-section' : ''}>
                    <strong>{t.testName}</strong>
                    {(t.unit || t.normalRange) && (
                      <span>{[t.unit, t.normalRange].filter(Boolean).join(' · ')}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
