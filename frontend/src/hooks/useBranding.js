import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getBranding, updateBranding } from '../services/brandingApi';
import { DEFAULT_BRANDING } from '../constants/branding';
import { getSocket } from '../services/socket';
import toast from 'react-hot-toast';

export const BRANDING_QUERY_KEY = ['branding'];

export function useBranding() {
  const query = useQuery({
    queryKey: BRANDING_QUERY_KEY,
    queryFn: getBranding,
    staleTime: 0,
    placeholderData: DEFAULT_BRANDING,
  });

  const branding = query.data || DEFAULT_BRANDING;

  return {
    branding,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function useBrandingMutation() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: updateBranding,
    onSuccess: (data) => {
      qc.setQueryData(BRANDING_QUERY_KEY, data);
      qc.invalidateQueries({ queryKey: BRANDING_QUERY_KEY });
      toast.success('Hospital branding updated successfully');
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || 'Failed to update branding');
    },
  });
}

export function useBrandingSocketSync() {
  const qc = useQueryClient();

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handler = (data) => {
      qc.setQueryData(BRANDING_QUERY_KEY, data);
    };

    socket.on('branding:updated', handler);
    return () => socket.off('branding:updated', handler);
  }, [qc]);
}
