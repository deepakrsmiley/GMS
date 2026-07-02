import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import Sidebar from '../components/common/Sidebar';
import Header from '../components/common/Header';
import { toggleDarkMode } from '../redux/slices/uiSlice';
import { initSocket } from '../services/socket';

export default function MainLayout() {
  const { sidebarOpen, darkMode } = useSelector((s) => s.ui);
  const { user } = useSelector((s) => s.auth);

  useEffect(() => {
    if (darkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [darkMode]);

  useEffect(() => {
    if (user?._id) initSocket(user._id);
  }, [user]);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">
      <Sidebar />
      <div className={`flex flex-col flex-1 overflow-hidden transition-all duration-300 ${sidebarOpen ? 'ml-64' : 'ml-16'}`}>
        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
