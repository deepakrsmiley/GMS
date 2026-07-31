import React, { useState, useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell, Sun, Moon, Search, Menu, Calendar, MessageSquare, User, Stethoscope, Loader2 } from 'lucide-react';
import { toggleDarkMode, toggleSidebar } from '../../redux/slices/uiSlice';
import { getSocket } from '../../services/socket';
import api from '../../services/api';
import { canAccessRoute } from '../../constants/navConfig';

const fetchDoctors = () => api.get('/staff/doctors').then((r) => r.data.data).catch(() => []);

export default function Header() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { darkMode } = useSelector((s) => s.ui);
  const { user } = useSelector((s) => s.auth);
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showMessages, setShowMessages] = useState(false);

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef(null);
  const notifRef = useRef(null);
  const msgRef = useRef(null);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    socket.on('notification', (n) => setNotifications((prev) => [n, ...prev].slice(0, 20)));
    return () => socket.off('notification');
  }, []);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data: doctorsList } = useQuery({ queryKey: ['allDoctors'], queryFn: fetchDoctors, staleTime: 5 * 60 * 1000 });

  const { data: patientResults, isFetching: searchingPatients } = useQuery({
    queryKey: ['headerPatientSearch', debouncedQuery],
    queryFn: () => api.get(`/patients/search?q=${encodeURIComponent(debouncedQuery)}`).then((r) => r.data.data),
    enabled: debouncedQuery.length >= 2,
  });

  const doctorResults = (doctorsList || []).filter((doc) =>
    debouncedQuery.length >= 2 && (
      doc.name?.toLowerCase().includes(debouncedQuery.toLowerCase()) ||
      doc.specialization?.toLowerCase().includes(debouncedQuery.toLowerCase())
    )
  ).slice(0, 5);

  const hasResults = (patientResults?.length || 0) > 0 || doctorResults.length > 0;

  // click-outside handling
  useEffect(() => {
    const onClickOutside = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) setShowResults(false);
      if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotifications(false);
      if (msgRef.current && !msgRef.current.contains(e.target)) setShowMessages(false);
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
    if (canAccessRoute(user?.role, '/staff')) navigate('/staff');
    else if (canAccessRoute(user?.role, '/op-queue')) navigate('/op-queue');
  };

  return (
    <header className="h-16 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between px-4 md:px-6 gap-4 flex-shrink-0">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <button
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
            <div className="absolute left-0 top-12 w-96 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden max-h-96 overflow-y-auto">
              {searchingPatients && (
                <div className="flex items-center justify-center gap-2 py-6 text-sm text-gray-400">
                  <Loader2 size={14} className="animate-spin" /> Searching...
                </div>
              )}

              {!searchingPatients && !hasResults && (
                <p className="text-center text-gray-400 py-8 text-sm">No results for "{debouncedQuery}"</p>
              )}

              {patientResults?.length > 0 && (
                <div>
                  <p className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Patients</p>
                  {patientResults.map((p) => (
                    <button
                      key={p._id}
                      onClick={() => goToPatient(p)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 text-left"
                    >
                      <span className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center flex-shrink-0">
                        <User size={14} />
                      </span>
                      <span className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{p.name}</p>
                        <p className="text-xs text-gray-400 truncate">{p.patientId} • {p.age}yr • {p.phone}</p>
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
          onClick={() => dispatch(toggleDarkMode())}
          className="p-2 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"
        >
          {darkMode ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <div className="relative" ref={notifRef}>
          <button
            onClick={() => { setShowNotifications((v) => !v); setShowMessages(false); }}
            className="p-2 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors relative"
          >
            <Bell size={18} />
            {notifications.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center font-semibold">
                {notifications.length > 9 ? '9+' : notifications.length}
              </span>
            )}
          </button>
          {showNotifications && (
            <div className="absolute right-0 top-12 w-80 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
              <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900 dark:text-white">Notifications</h3>
                <button onClick={() => setNotifications([])} className="text-xs text-blue-600">Clear all</button>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <p className="text-center text-gray-400 py-8 text-sm">No new notifications</p>
                ) : (
                  notifications.map((n, i) => (
                    <div key={i} className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-50 dark:border-gray-700">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{n.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{n.message}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <button
          onClick={() => navigate('/appointments')}
          className="hidden sm:flex p-2 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"
          title="Appointments"
        >
          <Calendar size={18} />
        </button>

        <div className="relative" ref={msgRef}>
          <button
            onClick={() => { setShowMessages((v) => !v); setShowNotifications(false); }}
            className="hidden sm:flex p-2 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"
            title="Messages"
          >
            <MessageSquare size={18} />
          </button>
          {showMessages && (
            <div className="absolute right-0 top-12 w-72 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
              <div className="p-4 border-b border-gray-100 dark:border-gray-700">
                <h3 className="font-semibold text-gray-900 dark:text-white">Messages</h3>
              </div>
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-gray-400">No messages yet</p>
                <p className="text-xs text-gray-300 mt-1">Internal messaging is coming soon.</p>
              </div>
            </div>
          )}
        </div>

        <div className="w-px h-8 bg-gray-200 dark:bg-gray-700 mx-1 hidden sm:block" />

        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
            {user?.name?.charAt(0)}
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