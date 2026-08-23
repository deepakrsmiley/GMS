import React, { useState, useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell, Sun, Moon, Search, Menu, Calendar, Activity, User, Stethoscope, Loader2, MessageSquare } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toggleDarkMode, toggleSidebar } from '../../redux/slices/uiSlice';
import { getSocket } from '../../services/socket';
import api from '../../services/api';
import { canAccessRoute } from '../../constants/navConfig';
import { hasAnyPermission } from '../../constants/permissions';
import ChatPanel, { useChatUnread } from './ChatPanel';
import NotificationPanel, { useNotificationUnread } from './NotificationPanel';

const fetchDoctors = () => api.get('/staff/doctors').then((r) => r.data.data).catch(() => []);

export default function Header() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { darkMode } = useSelector((s) => s.ui);
  const { user } = useSelector((s) => s.auth);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [liveActivity, setLiveActivity] = useState([]);
  const [activityClearedAt, setActivityClearedAt] = useState(0);
  const [chatPing, setChatPing] = useState(0);

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef(null);
  const notifRef = useRef(null);
  const activityRef = useRef(null);
  const chatRef = useRef(null);

  const canViewActivity = hasAnyPermission(user, ['VIEW_ACTIVITY', 'VIEW_REPORTS']);
  const canSearchPatients = hasAnyPermission(user, [
    'VIEW_PATIENT',
    'VIEW_NURSE_STATION',
    'VIEW_IP_ADMISSION',
    'VIEW_BILLING',
    'VIEW_PHARMACY',
    'VIEW_PRESCRIPTION',
    'DISPENSE_PRESCRIPTION',
    'VIEW_APPOINTMENT',
    'VIEW_OP_QUEUE',
    'CREATE_CONSULTATION',
  ]);
  const { data: chatUnread, refetch: refetchChatUnread } = useChatUnread(!!user);
  const { data: notifUnread = 0, refetch: refetchNotifUnread } = useNotificationUnread(!!user);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onNotif = () => refetchNotifUnread();
    const onActivity = (a) => setLiveActivity((prev) => [a, ...prev].slice(0, 40));
    const onChat = () => {
      setChatPing((n) => n + 1);
      refetchChatUnread();
    };
    const onMention = () => {
      setChatPing((n) => n + 1);
      refetchChatUnread();
      refetchNotifUnread();
    };
    socket.on('notification', onNotif);
    socket.on('activity:new', onActivity);
    socket.on('chat:message', onChat);
    socket.on('chat:mention', onMention);
    return () => {
      socket.off('notification', onNotif);
      socket.off('activity:new', onActivity);
      socket.off('chat:message', onChat);
      socket.off('chat:mention', onMention);
    };
  }, [refetchChatUnread, refetchNotifUnread]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data: doctorsList } = useQuery({ queryKey: ['allDoctors'], queryFn: fetchDoctors, staleTime: 5 * 60 * 1000 });

  const { data: patientResults, isFetching: searchingPatients } = useQuery({
    queryKey: ['headerPatientSearch', debouncedQuery],
    queryFn: () => api.get(`/patients/search?q=${encodeURIComponent(debouncedQuery)}`).then((r) => r.data.data),
    enabled: canSearchPatients && debouncedQuery.length >= 2,
  });

  const { data: activityData, isFetching: activityLoading, refetch: refetchActivity } = useQuery({
    queryKey: ['headerActivity'],
    queryFn: () => api.get('/activity/recent?limit=40').then((r) => r.data.data || []),
    enabled: canViewActivity && showActivity,
    staleTime: 15 * 1000,
  });

  const activityFeed = (() => {
    const map = new Map();
    [...liveActivity, ...(activityData || [])].forEach((row) => {
      const key = row._id || `${row.createdAt}-${row.description}`;
      if (!map.has(key)) map.set(key, row);
    });
    return [...map.values()]
      .filter((row) => {
        if (!activityClearedAt) return true;
        const ts = row.createdAt ? new Date(row.createdAt).getTime() : Date.now();
        return ts > activityClearedAt;
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 40);
  })();

  const clearActivityFeed = (e) => {
    e?.stopPropagation?.();
    e?.preventDefault?.();
    setLiveActivity([]);
    setActivityClearedAt(Date.now());
  };

  const doctorResults = (doctorsList || []).filter((doc) =>
    debouncedQuery.length >= 2 && (
      doc.name?.toLowerCase().includes(debouncedQuery.toLowerCase()) ||
      doc.specialization?.toLowerCase().includes(debouncedQuery.toLowerCase())
    )
  ).slice(0, 5);

  const hasResults = (patientResults?.length || 0) > 0 || doctorResults.length > 0;

  useEffect(() => {
    const onClickOutside = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) setShowResults(false);
      const inNotifBtn = notifRef.current?.contains(e.target);
      const inNotifPanel = e.target.closest?.('[data-hms-notif-panel="1"]');
      if (!inNotifBtn && !inNotifPanel) setShowNotifications(false);
      if (activityRef.current && !activityRef.current.contains(e.target)) setShowActivity(false);
      const inChatBtn = chatRef.current?.contains(e.target);
      const inChatPanel = e.target.closest?.('[data-hms-chat-panel="1"]');
      if (!inChatBtn && !inChatPanel) setShowChat(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchRef.current?.querySelector('input')?.focus();
      }
      if (e.key === 'Escape') setShowResults(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const goToPatient = (p) => {
    setShowResults(false);
    setQuery('');
    navigate(`/patients/${p._id}/profile`);
  };

  const goToDoctor = () => {
    setShowResults(false);
    setQuery('');
    if (canAccessRoute(user, '/masters')) navigate('/masters/staff');
    else if (canAccessRoute(user?.role, '/op-queue')) navigate('/op-queue');
  };

  const openActivity = () => {
    setShowActivity((v) => !v);
    setShowNotifications(false);
    if (!showActivity) refetchActivity();
  };

  return (
    <header className="h-16 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between px-4 md:px-6 gap-4 flex-shrink-0">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <button
          type="button"
          onClick={() => dispatch(toggleSidebar())}
          className="p-2 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors flex-shrink-0"
        >
          <Menu size={20} />
        </button>

        <div className="relative hidden md:block max-w-md w-full" ref={searchRef}>
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setShowResults(true); }}
            onFocus={() => query && setShowResults(true)}
            placeholder="Search patients, appointments, doctors..."
            className="pl-9 pr-14 py-2 text-sm bg-gray-100 dark:bg-gray-800 border-0 rounded-xl w-full focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-gray-200"
          />
          {!query && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] px-1.5 py-0.5 rounded-md bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-400">
              Ctrl + K
            </span>
          )}

          {showResults && debouncedQuery.length >= 2 && (
            <div className="absolute left-0 right-0 top-11 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden max-h-96 overflow-y-auto">
              {searchingPatients && (
                <div className="flex items-center justify-center gap-2 py-6 text-gray-400 text-sm">
                  <Loader2 size={16} className="animate-spin" /> Searching…
                </div>
              )}
              {!searchingPatients && !hasResults && (
                <p className="text-center text-gray-400 py-8 text-sm">No matches for “{debouncedQuery}”</p>
              )}
              {(patientResults?.length || 0) > 0 && (
                <div>
                  <p className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Patients</p>
                  {patientResults.map((p) => (
                    <button
                      key={p._id}
                      type="button"
                      onClick={() => goToPatient(p)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 text-left"
                    >
                      <span className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center flex-shrink-0">
                        <User size={14} />
                      </span>
                      <span className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{p.name}</p>
                        <p className="text-xs text-gray-400 truncate">{p.patientId}{p.phone ? ` · ${p.phone}` : ''}</p>
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {doctorResults.length > 0 && (
                <div>
                  <p className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Doctors</p>
                  {doctorResults.map((doc) => (
                    <button
                      key={doc._id}
                      type="button"
                      onClick={goToDoctor}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 text-left"
                    >
                      <span className="w-8 h-8 rounded-full bg-teal-100 dark:bg-teal-900/30 text-teal-600 flex items-center justify-center flex-shrink-0">
                        <Stethoscope size={14} />
                      </span>
                      <span className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">Dr. {doc.name}</p>
                        <p className="text-xs text-gray-400 truncate">{doc.specialization || doc.department?.name || 'Doctor'}</p>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 md:gap-2 flex-shrink-0">
        <button
          type="button"
          onClick={() => dispatch(toggleDarkMode())}
          className="p-2 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"
        >
          {darkMode ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <div className="relative" ref={notifRef}>
          <button
            type="button"
            onClick={() => {
              setShowNotifications((v) => !v);
              setShowActivity(false);
              setShowChat(false);
              if (!showNotifications) refetchNotifUnread();
            }}
            className="p-2 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors relative"
            title="Notifications"
          >
            <Bell size={18} />
            {notifUnread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center font-semibold">
                {notifUnread > 9 ? '9+' : notifUnread}
              </span>
            )}
          </button>
          <NotificationPanel
            open={showNotifications}
            onClose={() => setShowNotifications(false)}
          />
        </div>

        <div className="relative" ref={chatRef}>
          <button
            type="button"
            onClick={() => {
              setShowChat((v) => !v);
              setShowNotifications(false);
              setShowActivity(false);
              if (!showChat) {
                setChatPing(0);
                refetchChatUnread();
              }
            }}
            className="p-2 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors relative"
            title="Hospital chat"
          >
            <MessageSquare size={18} />
            {((chatUnread?.total || 0) > 0 || chatPing > 0) && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-blue-600 rounded-full text-[10px] text-white flex items-center justify-center font-semibold">
                {(chatUnread?.total || chatPing) > 9 ? '9+' : (chatUnread?.total || chatPing)}
              </span>
            )}
          </button>
          <ChatPanel
            open={showChat}
            onClose={() => setShowChat(false)}
            currentUser={user}
          />
        </div>

        <button
          type="button"
          onClick={() => navigate('/appointments')}
          className="hidden sm:flex p-2 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"
          title="Appointments"
        >
          <Calendar size={18} />
        </button>

        {canViewActivity && (
          <div className="relative" ref={activityRef}>
            <button
              type="button"
              onClick={() => { openActivity(); setShowChat(false); setShowNotifications(false); }}
              className="hidden sm:flex p-2 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors relative"
              title="Hospital activity"
            >
              <Activity size={18} />
              {liveActivity.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-blue-600 rounded-full text-[10px] text-white flex items-center justify-center font-semibold">
                  {liveActivity.length > 9 ? '9+' : liveActivity.length}
                </span>
              )}
            </button>
            {showActivity && (
              <div className="absolute right-0 top-12 w-[380px] bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
                <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">Activity feed</h3>
                    <p className="text-[11px] text-gray-400 mt-0.5">Live changes across HMS</p>
                  </div>
                  <button
                    type="button"
                    onClick={clearActivityFeed}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline px-1"
                  >
                    Clear
                  </button>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {activityLoading && !activityFeed.length ? (
                    <div className="flex items-center justify-center gap-2 py-10 text-gray-400 text-sm">
                      <Loader2 size={16} className="animate-spin" /> Loading…
                    </div>
                  ) : activityFeed.length === 0 ? (
                    <div className="px-4 py-10 text-center">
                      <p className="text-sm text-gray-400">No activity yet</p>
                      <p className="text-xs text-gray-300 mt-1">Medicine and staff changes will appear here.</p>
                    </div>
                  ) : (
                    activityFeed.map((row) => (
                      <div
                        key={row._id || `${row.createdAt}-${row.description}`}
                        className="px-4 py-3 border-b border-gray-50 dark:border-gray-700 hover:bg-blue-50/40 dark:hover:bg-gray-700/50"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-blue-600">{row.module}</p>
                          <p className="text-[10px] text-gray-400 whitespace-nowrap">
                            {row.createdAt
                              ? formatDistanceToNow(new Date(row.createdAt), { addSuffix: true })
                              : 'just now'}
                          </p>
                        </div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5">{row.action}</p>
                        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{row.description}</p>
                        {row.user?.name && (
                          <p className="text-[11px] text-gray-400 mt-1">
                            by {row.user.name}{row.user.role ? ` · ${row.user.role}` : ''}
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="w-px h-8 bg-gray-200 dark:bg-gray-700 mx-1 hidden sm:block" />

        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 overflow-hidden">
            {user?.avatar ? (
              <img src={user.avatar} alt="" className="w-full h-full object-cover" />
            ) : (
              user?.name?.charAt(0)
            )}
          </div>
          <div className="hidden md:block">
            <p className="text-sm font-medium text-gray-900 dark:text-white leading-none">{user?.name}</p>
            <p className="text-xs text-gray-500 capitalize">{user?.role?.replace('_', ' ')}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
