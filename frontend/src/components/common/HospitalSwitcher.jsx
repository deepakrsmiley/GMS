import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Building2 } from 'lucide-react';
import api from '../../services/api';
import { isSuperAdmin } from '../../utils/roles';
import { applyHospitalSession } from '../../utils/applyHospitalSession';
import { isClientOrg } from '../../utils/hospitalA';

const GMS_HOME = '__gms__';
const fetchOrgs = () => api.get('/organizations').then((r) => r.data.data || []);

export default function HospitalSwitcher() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = useSelector((s) => s.auth?.user);
  const superAdmin = isSuperAdmin(user);
  const currentId = isClientOrg(user?.organization)
    ? String(user.organization._id)
    : GMS_HOME;

  const { data: orgs = [] } = useQuery({
    queryKey: ['organizations'],
    queryFn: fetchOrgs,
    enabled: superAdmin,
    staleTime: 60 * 1000,
  });
  const clients = orgs.filter(isClientOrg);

  const selectMut = useMutation({
    mutationFn: (id) => api.post(`/organizations/${id}/select`).then((r) => r.data),
    onSuccess: async (data) => {
      await applyHospitalSession(data, dispatch, qc);
      const org = data.data?.organization;
      const name = org?.name || 'hospital';
      toast.success(`Opened ${name}`);
      navigate('/dashboard');
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || 'Could not switch hospital');
    },
  });

  const clearMut = useMutation({
    mutationFn: () => api.post('/organizations/clear-select').then((r) => r.data),
    onSuccess: async (data) => {
      await applyHospitalSession(data, dispatch, qc);
      toast.success('Returned to GMS Admin');
      navigate('/gms');
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || 'Could not return to GMS');
    },
  });

  if (!superAdmin) return null;

  return (
    <div className="flex items-center gap-2 min-w-0">
      <label className="flex items-center gap-1.5 max-w-[min(280px,46vw)] sm:max-w-[280px] rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-2 py-1 text-xs text-gray-700 dark:text-gray-200">
        <Building2 size={14} className="flex-shrink-0 text-blue-600" />
        <select
          className="bg-transparent font-medium truncate max-w-[210px] focus:outline-none"
          value={currentId}
          disabled={selectMut.isPending || clearMut.isPending}
          onChange={(e) => {
            const id = e.target.value;
            if (id === GMS_HOME) clearMut.mutate();
            else if (id && id !== currentId) selectMut.mutate(id);
          }}
          title="GMS Admin or a client hospital"
        >
          <option value={GMS_HOME}>GMS Admin</option>
          {clients.map((org) => (
            <option key={org._id} value={org._id}>
              {org.name} ({org.code})
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
