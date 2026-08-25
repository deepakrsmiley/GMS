import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDispatch, useSelector } from 'react-redux';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Building2, Plus, Power, UserPlus, LogIn, ListChecks } from 'lucide-react';
import api from '../services/api';
import { setUser } from '../redux/slices/authSlice';
import { HOSPITAL_MODULES, ALL_MODULE_IDS } from '../constants/hospitalModules';
import { applyHospitalSession } from '../utils/applyHospitalSession';
import { isPlatformOrg, isClientOrg } from '../utils/hospitalA';

const fetchOrgs = () => api.get('/organizations').then((r) => r.data.data);

const ModuleChecklist = ({ value, onChange }) => {
  const selected = new Set(value || []);
  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  };
  const allOn = ALL_MODULE_IDS.every((id) => selected.has(id));
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-gray-600 dark:text-gray-300">Hospital modules</p>
        <button
          type="button"
          className="text-xs text-blue-600"
          onClick={() => onChange(allOn ? [] : [...ALL_MODULE_IDS])}
        >
          {allOn ? 'Clear all' : 'Select all'}
        </button>
      </div>
      <p className="text-xs text-gray-500">Tick only what this hospital should use. Unticked menus stay hidden.</p>
      <div className="grid sm:grid-cols-2 gap-2">
        {HOSPITAL_MODULES.map((mod) => (
          <label
            key={mod.id}
            className="flex items-start gap-2 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm cursor-pointer"
          >
            <input
              type="checkbox"
              className="mt-1"
              checked={selected.has(mod.id)}
              onChange={() => toggle(mod.id)}
            />
            <span>
              <span className="block font-medium text-gray-800 dark:text-gray-100">{mod.label}</span>
              <span className="block text-xs text-gray-500">{mod.description}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
};

export default function OrganizationsPage() {
  const dispatch = useDispatch();
  const currentUser = useSelector((s) => s.auth?.user);
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: orgs = [], isLoading } = useQuery({ queryKey: ['organizations'], queryFn: fetchOrgs });

  const [createOpen, setCreateOpen] = useState(searchParams.get('create') === '1');
  const [adminOrg, setAdminOrg] = useState(null);
  const [modulesOrg, setModulesOrg] = useState(null);
  const [form, setForm] = useState({ name: '', code: '', phone: '', email: '', address: '', gstNumber: '' });
  const [createModules, setCreateModules] = useState([...ALL_MODULE_IDS]);
  const [editModules, setEditModules] = useState([]);
  const [admin, setAdmin] = useState({ name: '', email: '', password: '', phone: '' });
  const [createAdmin, setCreateAdmin] = useState({ name: '', email: '', password: '', phone: '' });

  const createMut = useMutation({
    mutationFn: (payload) => api.post('/organizations', payload).then((r) => r.data.data),
    onSuccess: () => {
      toast.success('Client hospital created. Sri Sanjeevi data was not copied or deleted.');
      qc.invalidateQueries({ queryKey: ['organizations'] });
      qc.invalidateQueries({ queryKey: ['gms-overview'] });
      setCreateOpen(false);
      setSearchParams({});
      setForm({ name: '', code: '', phone: '', email: '', address: '', gstNumber: '' });
      setCreateModules([...ALL_MODULE_IDS]);
      setCreateAdmin({ name: '', email: '', password: '', phone: '' });
    },
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }) => api.put(`/organizations/${id}/status`, { status }).then((r) => r.data.data),
    onSuccess: () => {
      toast.success('Organization status updated');
      qc.invalidateQueries({ queryKey: ['organizations'] });
    },
  });

  const modulesMut = useMutation({
    mutationFn: ({ id, enabledModules }) =>
      api.put(`/organizations/${id}`, { enabledModules }).then((r) => r.data.data),
    onSuccess: (data) => {
      toast.success('Hospital modules saved');
      qc.invalidateQueries({ queryKey: ['organizations'] });
      setModulesOrg(null);
      const currentId = currentUser?.organization?._id || currentUser?.organizationId;
      if (currentId && String(currentId) === String(data._id)) {
        dispatch(setUser({
          ...currentUser,
          organization: { ...(currentUser.organization || {}), ...data },
        }));
      }
    },
  });

  const adminMut = useMutation({
    mutationFn: ({ id, payload }) => api.post(`/organizations/${id}/admins`, payload).then((r) => r.data.data),
    onSuccess: () => {
      toast.success('Client hospital login created. Share email and password with that hospital.');
      setAdminOrg(null);
      setAdmin({ name: '', email: '', password: '', phone: '' });
    },
  });

  const selectMut = useMutation({
    mutationFn: (id) => api.post(`/organizations/${id}/select`).then((r) => r.data),
    onSuccess: async (data) => {
      await applyHospitalSession(data, dispatch, qc);
      toast.success(`Opened ${data.data?.organization?.name || 'hospital'}`);
    },
  });

  const rows = useMemo(() => (orgs || []).filter(isClientOrg), [orgs]);
  const platformOrg = useMemo(() => (orgs || []).find(isPlatformOrg), [orgs]);

  const openModules = (org) => {
    setModulesOrg(org);
    setEditModules(Array.isArray(org.enabledModules) && org.enabledModules.length
      ? org.enabledModules
      : [...ALL_MODULE_IDS]);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">GMS Super Admin & client hospitals</h2>
          <p className="text-sm text-gray-500">
            GMS is the Super Admin organization. Sri Sanjeevi Hospital and Srinivasa hospital are clients.
            New hospitals are also clients. Each client keeps its own branding. Sri Sanjeevi live data stays in Sri Sanjeevi — nothing is deleted.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white"
        >
          <Plus size={16} /> New client hospital
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500">Loading organizations…</p>
      ) : (
        <div className="space-y-4">
          {platformOrg && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">Super Admin organization</p>
              <p className="text-base font-semibold text-gray-900 dark:text-white mt-1">{platformOrg.name} ({platformOrg.code})</p>
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                GMS creates client hospital accounts and provides logins. GMS is not a hospital and has no patient data.
              </p>
            </div>
          )}
          <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Client hospital</th>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Modules</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((org) => {
                const mods = Array.isArray(org.enabledModules) ? org.enabledModules : ALL_MODULE_IDS;
                return (
                  <tr key={org._id} className="border-t border-gray-100 dark:border-gray-800">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{org.name}</td>
                    <td className="px-4 py-3 font-mono text-xs">{org.code}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      Client hospital
                    </td>
                    <td className="px-4 py-3">
                      <span className={org.status === 'active' ? 'text-emerald-600' : 'text-amber-600'}>
                        {org.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{mods.length} of {ALL_MODULE_IDS.length}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2 justify-end">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
                          onClick={() => selectMut.mutate(org._id)}
                        >
                          <LogIn size={12} /> Open client
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
                          onClick={() => openModules(org)}
                        >
                          <ListChecks size={12} /> Modules
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
                          onClick={() => setAdminOrg(org)}
                        >
                          <UserPlus size={12} /> Provide login
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
                          onClick={() => statusMut.mutate({
                            id: org._id,
                            status: org.status === 'active' ? 'inactive' : 'active',
                          })}
                        >
                          <Power size={12} /> {org.status === 'active' ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </div>
      )}

      {createOpen && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3 bg-white dark:bg-gray-900">
          <h3 className="font-semibold flex items-center gap-2"><Building2 size={16} /> Add client hospital</h3>
          <p className="text-xs text-gray-500">
            Use a unique name and code (for example HOSP003). This adds an empty client hospital.
            Sri Sanjeevi live data stays with Sri Sanjeevi and is never copied or deleted.
          </p>
          <div className="grid md:grid-cols-2 gap-3">
            {['name', 'code', 'phone', 'email', 'address', 'gstNumber'].map((key) => (
              <label key={key} className="text-xs font-medium text-gray-600">
                {key}
                <input
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                />
              </label>
            ))}
          </div>
          <ModuleChecklist value={createModules} onChange={setCreateModules} />
          <div>
            <p className="text-xs font-medium text-gray-600 mb-2">Hospital administrator (optional)</p>
            <div className="grid md:grid-cols-2 gap-3">
              {['name', 'email', 'phone', 'password'].map((key) => (
                <label key={key} className="text-xs font-medium text-gray-600">
                  {key === 'password' ? 'Temporary password' : `Admin ${key}`}
                  <input
                    type={key === 'password' ? 'password' : 'text'}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                    value={createAdmin[key]}
                    onChange={(e) => setCreateAdmin((f) => ({ ...f, [key]: e.target.value }))}
                  />
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white"
              onClick={() => {
                const payload = { ...form, enabledModules: createModules };
                if (createAdmin.name && createAdmin.email && createAdmin.password) {
                  payload.admin = createAdmin;
                }
                createMut.mutate(payload);
              }}
              disabled={!form.name || !form.code || createMut.isPending}
            >
              Create
            </button>
            <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={() => { setCreateOpen(false); setSearchParams({}); }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {modulesOrg && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3 bg-white dark:bg-gray-900">
          <h3 className="font-semibold">Modules for {modulesOrg.name}</h3>
          <ModuleChecklist value={editModules} onChange={setEditModules} />
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white"
              onClick={() => modulesMut.mutate({ id: modulesOrg._id, enabledModules: editModules })}
              disabled={modulesMut.isPending}
            >
              Save modules
            </button>
            <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={() => setModulesOrg(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {adminOrg && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3 bg-white dark:bg-gray-900">
          <h3 className="font-semibold">Provide login for {adminOrg.name}</h3>
          <div className="grid md:grid-cols-2 gap-3">
            {['name', 'email', 'password', 'phone'].map((key) => (
              <label key={key} className="text-xs font-medium text-gray-600">
                {key}
                <input
                  type={key === 'password' ? 'password' : 'text'}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                  value={admin[key]}
                  onChange={(e) => setAdmin((f) => ({ ...f, [key]: e.target.value }))}
                />
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white"
              onClick={() => adminMut.mutate({ id: adminOrg._id, payload: admin })}
              disabled={!admin.name || !admin.email || !admin.password || adminMut.isPending}
            >
              Create login
            </button>
            <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={() => setAdminOrg(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
