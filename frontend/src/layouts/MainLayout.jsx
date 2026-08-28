import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import Sidebar from '../components/common/Sidebar';
import Header from '../components/common/Header';
import GmsDevelopedBar from '../components/branding/GmsDevelopedBar';
import { setSidebarOpen } from '../redux/slices/uiSlice';
import { initSocket } from '../services/socket';
import { isSuperAdmin } from '../utils/roles';
import { isClientOrg } from '../utils/hospitalA';
import useDesktopNav from '../hooks/useDesktopNav';

export default function MainLayout() {
  const { sidebarOpen, darkMode } = useSelector((s) => s.ui);
  const { user } = useSelector((s) => s.auth);
  const dispatch = useDispatch();
  const isDesktop = useDesktopNav();

  useEffect(() => {
    dispatch(setSidebarOpen(isDesktop));
  }, [isDesktop, dispatch]);

  useEffect(() => {
    if (darkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [darkMode]);

  useEffect(() => {
    if (user?._id) initSocket(user._id, user.role);
  }, [user]);

  const contentOffset = isDesktop ? (sidebarOpen ? 'lg:ml-64' : 'lg:ml-16') : 'ml-0';

  return (
    <div className="flex h-[100dvh] max-h-[100dvh] overflow-hidden bg-gray-50 dark:bg-gray-950 pt-7">
      <GmsDevelopedBar
        superAdmin={isSuperAdmin(user)}
        clientHospital={isClientOrg(user?.organization)}
      />
      <Sidebar isDesktop={isDesktop} />
      {!isDesktop && sidebarOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 top-7 z-30 bg-slate-900/40 lg:hidden"
          onClick={() => dispatch(setSidebarOpen(false))}
        />
      )}
      <div className={`flex flex-col flex-1 min-w-0 overflow-hidden transition-[margin] duration-300 ${contentOffset}`}>
        <Header />
        <main className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden p-3 sm:p-4 lg:p-6 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
