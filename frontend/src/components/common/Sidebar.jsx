import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Users, Bed, FlaskConical,
  Receipt, Pill, Calendar, BarChart3, LogOut, ChevronLeft,
  Building2, UserCog, Activity, Settings, Stethoscope,
  FileText, ClipboardList, Package, FileBarChart,
} from 'lucide-react';
import { useBranding } from '../../hooks/useBranding';
import { toggleSidebar } from '../../redux/slices/uiSlice';
import { logout } from '../../redux/slices/authSlice';
import { filterNavForRole } from '../../constants/navConfig';

const ICON_MAP = {
  LayoutDashboard, Users, Bed, FlaskConical, Receipt, Pill, Calendar,
  BarChart3, Building2, UserCog, Activity, Settings, Stethoscope,
  FileText, ClipboardList, Package, FileBarChart,
};

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

  const filteredItems = filterNavForRole(user?.role);

  return (
    <motion.div
      animate={{ width: sidebarOpen ? 256 : 64 }}
      className="fixed left-0 top-0 h-full bg-gray-900 dark:bg-gray-950 text-white z-40 flex flex-col shadow-2xl border-r border-gray-800"
    >
      <div className="flex items-center gap-3 px-4 py-5 border-b border-gray-800">
        {branding.logo ? (
          <img src={branding.logo} alt="" className="w-9 h-9 rounded-xl object-contain flex-shrink-0 bg-white/10 p-0.5" />
        ) : (
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-lg">H</div>
        )}
        <AnimatePresence>
          {sidebarOpen && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="overflow-hidden min-w-0">
              <p className="font-bold text-white text-sm leading-tight truncate">{branding.hospitalName}</p>
              {branding.tagline && <p className="text-gray-400 text-xs truncate">{branding.tagline}</p>}
            </motion.div>
          )}
        </AnimatePresence>
        <button
          onClick={() => dispatch(toggleSidebar())}
          className="ml-auto text-gray-400 hover:text-white p-1 rounded transition-colors"
        >
          <motion.div animate={{ rotate: sidebarOpen ? 0 : 180 }}>
            <ChevronLeft size={16} />
          </motion.div>
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-2">
        {filteredItems.map((item) => {
          const Icon = ICON_MAP[item.icon] || LayoutDashboard;
          return (
            <NavLink
              key={item.id}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1 transition-all duration-150 group ${
                  isActive ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              <Icon size={20} className="flex-shrink-0" />
              <AnimatePresence>
                {sidebarOpen && (
                  <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-sm font-medium whitespace-nowrap">
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t border-gray-800 p-3">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 bg-blue-500 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
            {user?.name?.charAt(0)}
          </div>
          <AnimatePresence>
            {sidebarOpen && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="overflow-hidden">
                <p className="text-sm font-medium text-white truncate">{user?.name}</p>
                <p className="text-xs text-gray-400 capitalize">{user?.role?.replace('_', ' ')}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all duration-150"
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
