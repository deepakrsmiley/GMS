import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Bell, Sun, Moon, Search } from 'lucide-react';
import { toggleDarkMode } from '../../redux/slices/uiSlice';
import { getSocket } from '../../services/socket';

export default function Header() {
  const dispatch = useDispatch();
  const { darkMode } = useSelector((s) => s.ui);
  const { user } = useSelector((s) => s.auth);
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    socket.on('notification', (n) => setNotifications((prev) => [n, ...prev].slice(0, 20)));
    return () => socket.off('notification');
  }, []);

  return (
    <header className="h-16 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-6 shadow-sm">
      <div className="flex items-center gap-4">
        <div className="relative hidden md:block">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search patients, bills..."
            className="pl-9 pr-4 py-2 text-sm bg-gray-100 dark:bg-gray-800 border-0 rounded-xl w-64 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-gray-200"
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => dispatch(toggleDarkMode())}
          className="p-2 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"
        >
          {darkMode ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-2 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors relative"
          >
            <Bell size={18} />
            {notifications.length > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
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
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
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
