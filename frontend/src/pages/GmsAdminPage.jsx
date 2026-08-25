import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Building2, Plus, Users, IndianRupee, Activity, LogIn } from 'lucide-react';
import api from '../services/api';
import { applyHospitalSession } from '../utils/applyHospitalSession';
import { isClientOrg } from '../utils/hospitalA';
import toast from 'react-hot-toast';

const fetchOverview = () => api.get('/organizations/overview').then((r) => r.data.data);

export default function GmsAdminPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['gms-overview'], queryFn: fetchOverview });

  const selectMut = useMutation({
    mutationFn: (id) => api.post(`/organizations/${id}/select`).then((r) => r.data),
    onSuccess: async (payload) => {
      await applyHospitalSession(payload, dispatch, qc);
      toast.success(`Opened ${payload.data?.organization?.name || 'hospital'}`);
      navigate('/dashboard');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Could not open hospital'),
  });

  if (isLoading) return <p className="text-sm text-gray-500">Loading GMS overview…</p>;

  const d = data || {};
  const hospitals = (d.hospitals || []).filter(isClientOrg);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">GMS Global Super Admin</p>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">Galactic Medical Systems</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage client hospitals. Sri Sanjeevi and Srinivasa keep their own data — nothing is copied or deleted here.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/gms/hospitals?create=1')}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white"
        >
          <Plus size={16} /> Create Hospital
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="Total Hospitals" value={d.totalHospitals || 0} icon={Building2} />
        <Kpi label="Active Hospitals" value={d.activeHospitals || 0} icon={Activity} />
        <Kpi label="Total Patients" value={d.totalPatients || 0} icon={Users} />
        <Kpi label="Today's Revenue" value={`₹${Number(d.todayRevenue || 0).toLocaleString('en-IN')}`} icon={IndianRupee} />
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Hospital</th>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Patients</th>
              <th className="px-4 py-3">Users</th>
              <th className="px-4 py-3">Today bills</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {hospitals.map((org) => (
              <tr key={org._id} className="border-t border-gray-100 dark:border-gray-800">
                <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{org.name}</td>
                <td className="px-4 py-3 font-mono text-xs">{org.code}</td>
                <td className="px-4 py-3">
                  <span className={org.status === 'active' ? 'text-emerald-600' : 'text-amber-600'}>{org.status}</span>
                </td>
                <td className="px-4 py-3">{org.patients ?? 0}</td>
                <td className="px-4 py-3">{org.users ?? 0}</td>
                <td className="px-4 py-3">{org.todayBills ?? 0}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
                    onClick={() => selectMut.mutate(org._id)}
                    disabled={selectMut.isPending || org.status !== 'active'}
                  >
                    <LogIn size={12} /> Open
                  </button>
                </td>
              </tr>
            ))}
            {!hospitals.length && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">No client hospitals yet</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!!(d.recentActions || []).length && (
        <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Recent GMS actions</p>
          </div>
          <ul className="divide-y divide-gray-100 dark:divide-gray-800 text-sm">
            {(d.recentActions || []).map((log) => (
              <li key={log._id} className="px-4 py-2.5 flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-gray-800 dark:text-gray-100">{log.action}</p>
                  <p className="text-xs text-gray-500">{log.description}</p>
                </div>
                <p className="text-xs text-gray-400 whitespace-nowrap">
                  {log.createdAt ? new Date(log.createdAt).toLocaleString('en-IN') : ''}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, icon: Icon }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3">
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <Icon size={14} className="text-blue-600" />
        {label}
      </div>
      <p className="text-xl font-semibold text-gray-900 dark:text-white mt-1">{value}</p>
    </div>
  );
}
