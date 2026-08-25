import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Building2 } from 'lucide-react';
import api from '../../services/api';
import { isSuperAdmin } from '../../utils/roles';
import { applyHospitalSession } from '../../utils/applyHospitalSession';

const fetchOrgs = () => api.get('/organizations').then((r) => r.data.data || []);

export default function HospitalSwitcher() {
  const dispatch = useDispatch();
  const qc = useQueryClient();
  const user = useSelector((s) => s.auth?.user);
  const superAdmin = isSuperAdmin(user);
  const currentName = user?.organization?.name || '';
  const currentId = String(user?.organization?._id || user?.organizationId || '');

  const { data: orgs = [] } = useQuery({
    queryKey: ['organizations'],
    queryFn: fetchOrgs,
    enabled: superAdmin,
    staleTime: 60 * 1000,
  });

  const selectMut = useMutation({
    mutationFn: (id) => api.post(`/organizations/${id}/select`).then((r) => r.data),
    onSuccess: async (data) => {
      await applyHospitalSession(data, dispatch, qc);
      toast.success(`Working in ${data.data?.organization?.name || 'selected hospital'}`);
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || 'Could not switch hospital');
    },
  });

  if (!superAdmin) {
    if (!currentName) return null;
    return (
      <span className="hidden md:inline-flex items-center gap-1.5 max-w-[220px] rounded-xl border border-gray-200 dark:border-gray-700 px-2.5 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200">
        <Building2 size={14} className="flex-shrink-0 text-blue-600" />
        <span className="truncate">{currentName}</span>
      </span>
    );
  }

  return (
    <label className="hidden sm:flex items-center gap-1.5 max-w-[260px] rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-2 py-1 text-xs text-gray-700 dark:text-gray-200">
      <Building2 size={14} className="flex-shrink-0 text-blue-600" />
      <select
        className="bg-transparent font-medium truncate max-w-[200px] focus:outline-none"
        value={currentId}
        disabled={selectMut.isPending}
        onChange={(e) => {
          const id = e.target.value;
          if (id && id !== currentId) selectMut.mutate(id);
        }}
        title="Switch hospital"
      >
        {!currentId && <option value="">Select hospital</option>}
        {orgs.map((org) => (
          <option key={org._id} value={org._id}>
            {org.name} ({org.code})
          </option>
        ))}
      </select>
    </label>
  );
}
