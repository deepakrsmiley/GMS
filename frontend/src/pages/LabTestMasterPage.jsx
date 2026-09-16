import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Pencil, X, Check, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import { LAB_TYPES as CATEGORIES } from '../constants/labProfiles';
import '../styles/labOrder.css';

const SAMPLE_TYPES = ['blood', 'urine', 'stool', 'swab', 'sputum', 'tissue', 'other'];

const emptyItem = () => ({
  testName: '',
  unit: '',
  normalRange: '',
  method: '',
  isSection: false,
});

const emptyForm = (kind = 'single') => ({
  kind,
  name: '',
  testCode: '',
  category: 'Biochemistry',
  price: '',
  unit: '',
  normalRange: '',
  method: '',
  sampleType: 'blood',
  items: kind === 'group' ? [emptyItem()] : [],
});

const toForm = (t) => ({
  kind: t.kind === 'group' ? 'group' : 'single',
  name: t.name || '',
  testCode: t.testCode || '',
  category: t.category || 'Biochemistry',
  price: t.price ?? '',
  unit: t.unit || '',
  normalRange: t.normalRange || '',
  method: t.method || '',
  sampleType: t.sampleType || 'blood',
  items: t.kind === 'group'
    ? (t.items?.length ? t.items.map((i) => ({
      testName: i.testName || '',
      unit: i.unit || '',
      normalRange: i.normalRange || '',
      method: i.method || '',
      isSection: !!i.isSection,
    })) : [emptyItem()])
    : [],
});

const toPayload = (form) => {
  const items = form.kind === 'group'
    ? (form.items || [])
      .filter((i) => String(i.testName || '').trim())
      .map((item, i) => ({
        testName: item.testName.trim(),
        unit: item.unit || '',
        normalRange: item.normalRange || '',
        method: item.method || '',
        isSection: !!item.isSection,
        sortOrder: i + 1,
      }))
    : [];
  return {
    kind: form.kind,
    name: String(form.name || '').trim(),
    testCode: String(form.testCode || '').trim(),
    category: form.category,
    price: Number(form.price),
    unit: form.kind === 'single' ? (form.unit || '') : '',
    normalRange: form.kind === 'single' ? (form.normalRange || '') : '',
    method: form.kind === 'single' ? (form.method || '') : '',
    sampleType: form.sampleType || 'blood',
    items,
  };
};

/** Full-page Lab Test Master (used inside Masters hub). */
export default function LabTestMasterPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm('single'));
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm('single'));
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState('all');
  const [childQuery, setChildQuery] = useState('');

  const { data: tests = [], isLoading } = useQuery({
    queryKey: ['testMaster', 'all'],
    queryFn: async () => (await api.get('/test-master', { params: { activeOnly: 'false' } })).data.data,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['testMaster'] });
    queryClient.invalidateQueries({ queryKey: ['test-master'] });
  };

  const createMutation = useMutation({
    mutationFn: (payload) => api.post('/test-master', payload),
    onSuccess: (_data, payload) => {
      toast.success(payload.kind === 'group' ? 'Group test added' : 'Single test added');
      setForm(emptyForm(payload.kind || 'single'));
      setChildQuery('');
      invalidate();
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to add test'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => api.put(`/test-master/${id}`, payload),
    onSuccess: () => { toast.success('Test updated'); setEditingId(null); invalidate(); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to update test'),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id) => api.delete(`/test-master/${id}`),
    onSuccess: () => { toast.success('Test deactivated'); invalidate(); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to deactivate'),
  });

  const reactivateMutation = useMutation({
    mutationFn: (id) => api.put(`/test-master/${id}`, { isActive: true }),
    onSuccess: () => { toast.success('Test reactivated'); invalidate(); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to reactivate'),
  });

  const singles = useMemo(
    () => (tests || []).filter((t) => t.isActive !== false && t.kind !== 'group'),
    [tests],
  );

  const childMatches = useMemo(() => {
    const q = childQuery.trim().toLowerCase();
    if (q.length < 1) return [];
    return singles
      .filter((t) => `${t.name} ${t.testCode || ''}`.toLowerCase().includes(q))
      .slice(0, 12);
  }, [singles, childQuery]);

  const addChildFromSingle = (single, target, setTarget) => {
    const already = (target.items || []).some(
      (i) => String(i.testName).trim().toLowerCase() === String(single.name).trim().toLowerCase(),
    );
    if (already) {
      toast.error('Already in this group');
      return;
    }
    const nextItems = [...(target.items || []).filter((i) => i.testName.trim() || i.isSection), {
      testName: single.name,
      unit: single.unit || '',
      normalRange: single.normalRange || '',
      method: single.method || '',
      isSection: false,
    }];
    setTarget((f) => ({ ...f, items: nextItems }));
    setChildQuery('');
  };

  const handleCreate = (e) => {
    e.preventDefault();
    if (!form.name || form.price === '' || form.price == null) {
      toast.error('Name and price are required');
      return;
    }
    const payload = toPayload(form);
    if (payload.kind === 'group' && !payload.items.length) {
      toast.error('Add at least one child test to the group');
      return;
    }
    createMutation.mutate(payload);
  };

  const startEdit = (t) => {
    setEditingId(t._id);
    setEditForm(toForm(t));
  };

  const saveEdit = (id) => {
    if (!editForm.name || editForm.price === '' || editForm.price == null) {
      toast.error('Name and price are required');
      return;
    }
    const payload = toPayload(editForm);
    if (payload.kind === 'group' && !payload.items.length) {
      toast.error('Add at least one child test to the group');
      return;
    }
    updateMutation.mutate({ id, payload });
  };

  const field = 'border border-slate-200 dark:border-gray-600 rounded-sm px-2.5 py-1.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30';

  const visible = tests.filter((t) => {
    if (kindFilter !== 'all' && (t.kind || 'single') !== kindFilter) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const child = (t.items || []).map((i) => i.testName).join(' ');
    return `${t.name} ${t.testCode || ''} ${t.category} ${child}`.toLowerCase().includes(q);
  });

  const renderItemsEditor = (current, setCurrent) => (
    <div className="col-span-12 space-y-2 rounded-sm border border-indigo-100 bg-indigo-50/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
          Group child tests — same order as the lab software
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className="text-xs font-semibold text-indigo-700"
            onClick={() => setCurrent((f) => ({
              ...f,
              items: [...(f.items || []), { ...emptyItem(), isSection: true, testName: '' }],
            }))}
          >
            + Heading
          </button>
          <button
            type="button"
            className="text-xs font-semibold text-indigo-700"
            onClick={() => setCurrent((f) => ({ ...f, items: [...(f.items || []), emptyItem()] }))}
          >
            + Child test
          </button>
        </div>
      </div>
      <div className="relative">
        <input
          className={`w-full ${field}`}
          placeholder="Search existing single tests to add as children"
          value={childQuery}
          onChange={(e) => setChildQuery(e.target.value)}
        />
        {childMatches.length > 0 && (
          <ul className="absolute z-10 mt-1 max-h-44 w-full overflow-auto rounded-sm border border-slate-200 bg-white shadow-sm dark:bg-gray-800">
            {childMatches.map((s) => (
              <li key={s._id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-2.5 py-1.5 text-left text-sm hover:bg-indigo-50"
                  onClick={() => addChildFromSingle(s, current, setCurrent)}
                >
                  <span>{s.name}</span>
                  <span className="text-xs text-slate-400">{s.testCode || s.category}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {(current.items || []).map((item, idx) => (
        <div key={idx} className="grid grid-cols-12 gap-1.5">
          <input
            className={`col-span-4 ${field} ${item.isSection ? 'font-semibold uppercase' : ''}`}
            placeholder={item.isSection ? 'Section heading' : 'Child test name'}
            value={item.testName}
            onChange={(e) => {
              const items = [...current.items];
              items[idx] = { ...items[idx], testName: e.target.value };
              setCurrent((f) => ({ ...f, items }));
            }}
          />
          <input
            className={`col-span-2 ${field}`}
            placeholder="Unit"
            value={item.unit}
            disabled={item.isSection}
            onChange={(e) => {
              const items = [...current.items];
              items[idx] = { ...items[idx], unit: e.target.value };
              setCurrent((f) => ({ ...f, items }));
            }}
          />
          <input
            className={`col-span-3 ${field}`}
            placeholder="Normal range"
            value={item.normalRange}
            disabled={item.isSection}
            onChange={(e) => {
              const items = [...current.items];
              items[idx] = { ...items[idx], normalRange: e.target.value };
              setCurrent((f) => ({ ...f, items }));
            }}
          />
          <input
            className={`col-span-2 ${field}`}
            placeholder="Method"
            value={item.method}
            disabled={item.isSection}
            onChange={(e) => {
              const items = [...current.items];
              items[idx] = { ...items[idx], method: e.target.value };
              setCurrent((f) => ({ ...f, items }));
            }}
          />
          <button
            type="button"
            className="col-span-1 text-slate-400 hover:text-red-600"
            onClick={() => setCurrent((f) => ({
              ...f,
              items: f.items.filter((_, i) => i !== idx),
            }))}
            title="Remove"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900 dark:text-white tracking-tight">Lab Test Master</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Same as the lab software: add a Single Test, or a Group Test with every child test in order.
        </p>
      </div>

      <div className="ltp-tabs" style={{ maxWidth: 360 }}>
        <button
          type="button"
          className={`ltp-tab ${form.kind === 'single' ? 'is-on' : ''}`}
          onClick={() => setForm(emptyForm('single'))}
        >
          Single Test
        </button>
        <button
          type="button"
          className={`ltp-tab ${form.kind === 'group' ? 'is-on' : ''}`}
          onClick={() => setForm(emptyForm('group'))}
        >
          Group Test
        </button>
      </div>

      <form onSubmit={handleCreate} className="grid grid-cols-12 gap-2 pb-4 border-b border-slate-100 dark:border-gray-700">
        <input
          className={`col-span-3 ${field}`}
          placeholder="Code"
          value={form.testCode}
          onChange={(e) => setForm((f) => ({ ...f, testCode: e.target.value }))}
        />
        <input
          className={`col-span-5 ${field}`}
          placeholder={form.kind === 'group' ? 'Group name, e.g. CBC' : 'Test name, e.g. Haemoglobin'}
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <select
          className={`col-span-2 ${field}`}
          value={form.category}
          onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
        >
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input
          type="number"
          min="0"
          step="0.01"
          className={`col-span-2 ${field}`}
          placeholder="Price ₹"
          value={form.price}
          onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
        />
        {form.kind === 'single' && (
          <>
            <input
              className={`col-span-3 ${field}`}
              placeholder="Unit"
              value={form.unit}
              onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
            />
            <input
              className={`col-span-4 ${field}`}
              placeholder="Normal range"
              value={form.normalRange}
              onChange={(e) => setForm((f) => ({ ...f, normalRange: e.target.value }))}
            />
            <input
              className={`col-span-3 ${field}`}
              placeholder="Method"
              value={form.method}
              onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))}
            />
            <select
              className={`col-span-2 ${field}`}
              value={form.sampleType}
              onChange={(e) => setForm((f) => ({ ...f, sampleType: e.target.value }))}
            >
              {SAMPLE_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </>
        )}
        {form.kind === 'group' && (
          <>
            <select
              className={`col-span-3 ${field}`}
              value={form.sampleType}
              onChange={(e) => setForm((f) => ({ ...f, sampleType: e.target.value }))}
            >
              {SAMPLE_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            {renderItemsEditor(form, setForm)}
          </>
        )}
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="col-span-12 flex items-center justify-center gap-1 bg-slate-900 text-white rounded-sm py-2 hover:bg-slate-800 disabled:opacity-50 text-sm font-semibold"
        >
          <Plus size={16} />
          {form.kind === 'group' ? 'Add group test' : 'Add single test'}
        </button>
      </form>

      <div className="grid grid-cols-12 gap-2">
        <input
          className={`col-span-8 ${field}`}
          placeholder="Search test or group"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select className={`col-span-4 ${field}`} value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}>
          <option value="all">All</option>
          <option value="group">Group tests</option>
          <option value="single">Single tests</option>
        </select>
      </div>

      <div className="space-y-1 max-h-[60vh] overflow-y-auto">
        {isLoading && <p className="text-sm text-slate-400 text-center py-8">Loading…</p>}
        {!isLoading && tests.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-8">No test prices configured yet.</p>
        )}
        {!isLoading && tests.length > 0 && visible.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-8">No matches.</p>
        )}
        {visible.map((t) => (
          <div
            key={t._id}
            className={`px-2 py-2 rounded-sm text-sm ${
              t.isActive ? 'hover:bg-slate-50 dark:hover:bg-gray-800' : 'bg-slate-50 dark:bg-gray-900 opacity-60'
            }`}
          >
            {editingId === t._id ? (
              <div className="grid grid-cols-12 gap-2">
                <input className={`col-span-3 ${field}`} value={editForm.testCode} onChange={(e) => setEditForm((f) => ({ ...f, testCode: e.target.value }))} placeholder="Code" />
                <input className={`col-span-5 ${field}`} value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
                <select className={`col-span-2 ${field}`} value={editForm.category} onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <input type="number" min="0" step="0.01" className={`col-span-2 ${field}`} value={editForm.price} onChange={(e) => setEditForm((f) => ({ ...f, price: e.target.value }))} />
                {editForm.kind === 'single' && (
                  <>
                    <input className={`col-span-3 ${field}`} placeholder="Unit" value={editForm.unit} onChange={(e) => setEditForm((f) => ({ ...f, unit: e.target.value }))} />
                    <input className={`col-span-4 ${field}`} placeholder="Normal range" value={editForm.normalRange} onChange={(e) => setEditForm((f) => ({ ...f, normalRange: e.target.value }))} />
                    <input className={`col-span-3 ${field}`} placeholder="Method" value={editForm.method} onChange={(e) => setEditForm((f) => ({ ...f, method: e.target.value }))} />
                    <select className={`col-span-2 ${field}`} value={editForm.sampleType} onChange={(e) => setEditForm((f) => ({ ...f, sampleType: e.target.value }))}>
                      {SAMPLE_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </>
                )}
                {editForm.kind === 'group' && renderItemsEditor(editForm, setEditForm)}
                <div className="col-span-12 flex gap-2 justify-end">
                  <button type="button" onClick={() => saveEdit(t._id)} className="text-emerald-600"><Check size={16} /></button>
                  <button type="button" onClick={() => setEditingId(null)} className="text-slate-400"><X size={16} /></button>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-12 gap-2 items-center">
                  <span className="col-span-5 font-medium text-slate-900 dark:text-white truncate">
                    {t.testCode ? <span className="mr-2 font-mono text-[11px] text-indigo-600">{t.testCode}</span> : null}
                    {t.name}
                    <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-400">
                      {t.kind === 'group' ? `Group · ${(t.items || []).filter((i) => !i.isSection).length} tests` : 'Single'}
                    </span>
                  </span>
                  <span className="col-span-4 text-slate-500">{t.category}</span>
                  <span className="col-span-2 font-semibold text-slate-800 dark:text-slate-200">₹{t.price}</span>
                  <div className="col-span-1 flex gap-1.5 justify-end">
                    <button type="button" onClick={() => startEdit(t)} className="text-slate-400 hover:text-blue-600" title="Edit"><Pencil size={14} /></button>
                    {t.isActive ? (
                      <button type="button" onClick={() => deactivateMutation.mutate(t._id)} className="text-slate-400 hover:text-red-600" title="Deactivate"><Trash2 size={14} /></button>
                    ) : (
                      <button type="button" onClick={() => reactivateMutation.mutate(t._id)} className="text-slate-400 hover:text-emerald-600" title="Reactivate"><RotateCcw size={14} /></button>
                    )}
                  </div>
                </div>
                {t.kind === 'group' && (t.items || []).length > 0 && (
                  <ul className="mt-1 pl-1 text-[11px] text-slate-500">
                    {(t.items || []).slice(0, 8).map((i, idx) => (
                      <li key={`${i.testName}-${idx}`} className={i.isSection ? 'font-semibold uppercase text-indigo-600' : ''}>
                        {i.testName}
                        {(i.unit || i.normalRange) ? ` · ${[i.unit, i.normalRange].filter(Boolean).join(' · ')}` : ''}
                      </li>
                    ))}
                    {(t.items || []).length > 8 && <li>+{(t.items || []).length - 8} more</li>}
                  </ul>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
