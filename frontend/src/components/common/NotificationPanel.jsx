import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import api from '../../services/api';
import { getSocket } from '../../services/socket';
import '../../styles/hmsNotifications.css';

export function useNotificationUnread(enabled = true) {
  return useQuery({
    queryKey: ['notifUnread'],
    queryFn: () => api.get('/notifications/unread-count').then((r) => r.data.data?.count || 0),
    enabled,
    refetchInterval: 45000,
    retry: 1,
  });
}

export default function NotificationPanel({ open, onClose }) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: rows = [], isFetching, isError, error, refetch } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications?limit=50').then((r) => r.data.data || []),
    enabled: open,
    refetchInterval: open ? 30000 : false,
    retry: 1,
  });

  const markMutation = useMutation({
    mutationFn: (body) => api.post('/notifications/read', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notifUnread'] });
    },
  });

  useEffect(() => {
    if (!open) return;
    const socket = getSocket();
    if (!socket) return;
    const onNotif = (n) => {
      qc.setQueryData(['notifications'], (old = []) => {
        if (n?._id && old.some((x) => x._id === n._id)) return old;
        return [n, ...old].slice(0, 50);
      });
      qc.invalidateQueries({ queryKey: ['notifUnread'] });
    };
    socket.on('notification', onNotif);
    return () => socket.off('notification', onNotif);
  }, [open, qc]);

  if (!open) return null;

  const openItem = (n) => {
    if (n._id && !n.isRead) markMutation.mutate({ ids: [n._id] });
    if (n.link) {
      onClose();
      navigate(n.link);
    }
  };

  const panel = (
    <div className="hms-notif" data-hms-notif-panel="1" role="dialog" aria-label="Notifications">
      <div className="hms-notif__head">
        <div>
          <h3 className="hms-notif__title">Notifications</h3>
          <p className="hms-notif__sub">Alerts that need your attention</p>
        </div>
        <div className="hms-notif__actions">
          <button type="button" onClick={() => markMutation.mutate({ all: true })}>Mark all read</button>
          <button type="button" onClick={onClose}>Close</button>
        </div>
      </div>

      <div className="hms-notif__list">
        {isFetching && !rows.length && (
          <div className="hms-notif__empty">
            <Loader2 size={18} className="animate-spin mx-auto mb-2" />
            Loading…
          </div>
        )}
        {isError && (
          <div className="hms-notif__empty">
            Could not load notifications.
            <br />
            <span style={{ fontSize: 11 }}>{error?.response?.data?.message || error?.message}</span>
            <br />
            <button type="button" className="text-blue-600 text-xs mt-2" onClick={() => refetch()}>Retry</button>
          </div>
        )}
        {!isError && !isFetching && !rows.length && (
          <div className="hms-notif__empty">No notifications yet</div>
        )}
        {rows.map((n, i) => (
          <button
            key={n._id || i}
            type="button"
            className={`hms-notif__item ${!n.isRead ? 'is-unread' : ''}`}
            onClick={() => openItem(n)}
          >
            <div className="hms-notif__row">
              <span className={`hms-notif__chip ${n.type || 'info'}`}>{n.type || 'info'}</span>
              <span className="hms-notif__time">
                {n.createdAt ? formatDistanceToNow(new Date(n.createdAt), { addSuffix: true }) : ''}
              </span>
            </div>
            <p className="hms-notif__item-title">{n.title}</p>
            <p className="hms-notif__item-msg">{n.message}</p>
          </button>
        ))}
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}
