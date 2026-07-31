import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Users, Bed, FlaskConical,
  Receipt, Pill, Calendar, BarChart3, LogOut,
  Building2, UserCog, Activity, Settings, Stethoscope,
  FileText, ClipboardList, Package, FileBarChart, Clock,
  FileBarChart2, ShieldCheck, Headphones, AlertTriangle, MonitorPlay,
} from 'lucide-react';
import { useBranding } from '../../hooks/useBranding';
import { logout } from '../../redux/slices/authSlice';
import { filterNavForUser } from '../../constants/navConfig';

const ICON_MAP = {
  LayoutDashboard, Users, Bed, FlaskConical, Receipt, Pill, Calendar,
  BarChart3, Building2, UserCog, Activity, Settings, Stethoscope,
  FileText, ClipboardList, Package, FileBarChart, Clock, FileBarChart2,
  AlertTriangle, MonitorPlay,
};

// Support-module ids — everything else renders under "Core Modules"
const SUPPORT_IDS = new Set(['assets', 'asset-complaints', 'staff', 'reports', 'settings', 'pharmacy-billing', 'expiry-report', 'queue-display']);

export default function Sidebar() {
  const { sidebarOpen } = useSelector((s) => s.ui);
  const { user } = useSelector((s) => s.auth);
  const { branding } = useBranding();
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await dispatch(logout());
    navigate('/login');
  };

  const filteredItems = filterNavForUser(user);
  const coreItems = filteredItems.filter((i) => !SUPPORT_IDS.has(i.id));
  const supportItems = filteredItems.filter((i) => SUPPORT_IDS.has(i.id));

  const renderLink = (item) => {
    const Icon = ICON_MAP[item.icon] || LayoutDashboard;
    return (
      <NavLink
        key={item.id}
        to={item.to}
        className={({ isActive }) =>
          `flex items-center gap-3 px-3 py-2.5 rounded-xl mb-0.5 transition-all duration-150 group ${
            isActive
              ? 'bg-blue-600 text-white shadow-sm shadow-blue-200'
              : 'text-gray-500 hover:bg-blue-50 hover:text-blue-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white'
          }`
        }
      >
        <Icon size={18} className="flex-shrink-0" />
        <AnimatePresence>
          {sidebarOpen && (
            <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-sm font-medium whitespace-nowrap">
              {item.label}
            </motion.span>
          )}
        </AnimatePresence>
      </NavLink>
    );
  };

  return (
    <motion.div
      animate={{ width: sidebarOpen ? 260 : 76 }}
      className="fixed left-0 top-0 h-full bg-white dark:bg-gray-900 text-gray-700 z-40 flex flex-col border-r border-gray-100 dark:border-gray-800"
    >
      {/* Brand */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
        {branding.logo ? (
          <img src={branding.logo} alt="" className="w-9 h-9 rounded-xl object-contain flex-shrink-0" />
        ) : (
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
            <ShieldCheck size={20} className="text-white" />
          </div>
        )}
        <AnimatePresence>
          {sidebarOpen && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="overflow-hidden min-w-0">
              <p className="font-bold text-gray-900 dark:text-white text-sm leading-tight truncate">{branding.hospitalName || 'Hospital'}</p>
              {branding.tagline && <p className="text-gray-400 text-xs truncate">{branding.tagline}</p>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        <AnimatePresence>
          {sidebarOpen && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="px-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
              Core Modules
            </motion.p>
          )}
        </AnimatePresence>
        {coreItems.map(renderLink)}

        {supportItems.length > 0 && (
          <>
            <div className="my-3 border-t border-gray-100 dark:border-gray-800" />
            <AnimatePresence>
              {sidebarOpen && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="px-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
                  Support Modules
                </motion.p>
              )}
            </AnimatePresence>
            {supportItems.map(renderLink)}
          </>
        )}
      </nav>

      {/* Need Help card */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mx-3 mb-3 p-3 rounded-2xl bg-blue-50 dark:bg-gray-800 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
              <Headphones size={16} className="text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">Need Help?</p>
              <p className="text-xs text-blue-600 truncate cursor-pointer">Contact Support</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* User / logout */}
      <div className="border-t border-gray-100 dark:border-gray-800 p-3">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 bg-blue-600 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
            {user?.name?.charAt(0)}
          </div>
          <AnimatePresence>
            {sidebarOpen && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="overflow-hidden min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{user?.name}</p>
                <p className="text-xs text-gray-400 capitalize truncate">{user?.role?.replace('_', ' ')}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-all duration-150"
        >
          <LogOut size={18} className="flex-shrink-0" />
          <AnimatePresence>
            {sidebarOpen && <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-sm">Logout</motion.span>}
          </AnimatePresence>
        </button>
      </div>
    </motion.div>
  );
}