import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Users, Bed, FlaskConical,
  Receipt, Pill, Calendar, BarChart3, LogOut,
  Building2, UserCog, Activity, Settings, Stethoscope,
  FileText, ClipboardList, Package, FileBarChart, Clock,
  FileBarChart2, ShieldCheck, AlertTriangle, MonitorPlay, Database,
  ChevronRight, HeartPulse, ClipboardCheck, Wrench, BookOpen,
} from 'lucide-react';
import { useBranding } from '../../hooks/useBranding';
import { logout } from '../../redux/slices/authSlice';
import { setSidebarOpen } from '../../redux/slices/uiSlice';
import { filterNavForUser, filterGmsNavForUser, groupNavItems } from '../../constants/navConfig';
import { isSuperAdmin } from '../../utils/roles';
import { SYSTEM_SHORT_NAME, SYSTEM_NAME, SOFTWARE_LOGO } from '../../constants/branding';
import { GmsDevelopedMark } from '../branding/GmsDevelopedBar';
import { isClientOrg } from '../../utils/hospitalA';
import ProfileSettingsModal from './ProfileSettingsModal';

const ICON_MAP = {
  LayoutDashboard, Users, Bed, FlaskConical, Receipt, Pill, Calendar,
  BarChart3, Building2, UserCog, Activity, Settings, Stethoscope,
  FileText, ClipboardList, Package, FileBarChart, Clock, FileBarChart2,
  AlertTriangle, MonitorPlay, Database, HeartPulse, ClipboardCheck, Wrench,
  ShieldCheck, BookOpen,
};

export default function Sidebar({ isDesktop = true }) {
  const { sidebarOpen } = useSelector((s) => s.ui);
  const { user } = useSelector((s) => s.auth);
  const { branding } = useBranding();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [showProfile, setShowProfile] = useState(false);
  const showLabels = isDesktop ? sidebarOpen : true;

  const handleLogout = async () => {
    await dispatch(logout());
    navigate('/login');
  };

  const closeIfMobile = () => {
    if (!isDesktop) dispatch(setSidebarOpen(false));
  };

  const gmsNavItems = filterGmsNavForUser(user);
  const navItems = filterNavForUser(user);
  const navGroups = groupNavItems(navItems);
  const gmsAdmin = isSuperAdmin(user);
  const clientHospital = isClientOrg(user?.organization);
  const hospitalName = user?.organization?.name || branding.hospitalName || 'Hospital';
  const hospitalLogo = branding.logo || user?.organization?.logo || '';
  const showHospitalBrand = clientHospital || !gmsAdmin;
  const brandTitle = showHospitalBrand ? hospitalName : SYSTEM_SHORT_NAME;

  const renderLink = (item) => {
    const Icon = ICON_MAP[item.icon] || LayoutDashboard;
    return (
      <NavLink
        key={item.id}
        to={item.to}
        onClick={closeIfMobile}
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
          {showLabels && (
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
      animate={{ width: isDesktop ? (sidebarOpen ? 256 : 64) : 256 }}
      className={`fixed left-0 top-7 h-[calc(100dvh-1.75rem)] max-h-[calc(100dvh-1.75rem)] bg-white dark:bg-gray-900 text-gray-700 z-40 flex flex-col border-r border-gray-100 dark:border-gray-800 overflow-hidden transition-transform duration-300 ${
        isDesktop ? '' : (sidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full pointer-events-none')
      }`}
    >
      {/* Brand — selected client hospital logo and name (Sanjeevi, Srinivasa, later hospitals) */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
        {showHospitalBrand && hospitalLogo ? (
          <img src={hospitalLogo} alt="" className="w-9 h-9 rounded-xl object-contain flex-shrink-0" />
        ) : showHospitalBrand ? (
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
            <ShieldCheck size={20} className="text-white" />
          </div>
        ) : (
          <img src={SOFTWARE_LOGO} alt={SYSTEM_NAME} className="w-9 h-9 rounded-xl object-contain flex-shrink-0 bg-white" />
        )}
        <AnimatePresence>
          {showLabels && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="overflow-hidden min-w-0">
              {showHospitalBrand && <GmsDevelopedMark className="mb-0.5" />}
              <p className="font-bold text-gray-900 dark:text-white text-sm leading-tight truncate" title={brandTitle}>
                {brandTitle}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Nav — grouped by hospital workflow */}
      <nav className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden py-4 px-3">
        <AnimatePresence>
          {showLabels && gmsNavItems.length > 0 && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="px-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
              GMS
            </motion.p>
          )}
        </AnimatePresence>
        {gmsNavItems.map(renderLink)}
        <AnimatePresence>
          {showLabels && navItems.length > 0 && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="px-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2 mt-3">
              {clientHospital ? hospitalName : ''}
            </motion.p>
          )}
        </AnimatePresence>
        {navGroups.map((group) => (
          <div key={group.id}>
            <AnimatePresence>
              {showLabels && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="px-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1 mt-3">
                  {group.label}
                </motion.p>
              )}
            </AnimatePresence>
            {group.items.map(renderLink)}
          </div>
        ))}
      </nav>

      {/* How to Use */}
      <AnimatePresence>
        {showLabels && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mx-3 mb-3 flex-shrink-0">
            <NavLink
              to="/how-to-use"
              onClick={closeIfMobile}
              className={({ isActive }) =>
                `flex items-center gap-3 p-3 rounded-2xl ${isActive ? 'bg-blue-600 text-white' : 'bg-blue-50 dark:bg-gray-800 text-gray-800 dark:text-gray-100'}`
              }
            >
              <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                <BookOpen size={16} className="text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">How to Use</p>
                <p className="text-xs opacity-80 truncate">Correct hospital workflow</p>
              </div>
            </NavLink>
          </motion.div>
        )}
      </AnimatePresence>

      {/* User / logout */}
      <div className="border-t border-gray-100 dark:border-gray-800 p-3 flex-shrink-0">
        <button
          type="button"
          onClick={() => setShowProfile(true)}
          title="Edit profile"
          className="w-full flex items-center gap-3 mb-2 px-1 py-1.5 rounded-xl hover:bg-blue-50 dark:hover:bg-gray-800 transition-colors text-left group"
        >
          <div className="w-9 h-9 bg-blue-600 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0 overflow-hidden">
            {user?.avatar ? (
              <img src={user.avatar} alt="" className="w-full h-full object-cover" />
            ) : (
              user?.name?.charAt(0)
            )}
          </div>
          <AnimatePresence>
            {showLabels && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="overflow-hidden min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{user?.name}</p>
                <p className="text-xs text-gray-400 capitalize truncate">
                  {gmsAdmin ? 'GMS Super Admin' : user?.role?.replace('_', ' ')}
                </p>
                <p className="text-[10px] text-blue-600 font-medium mt-0.5 group-hover:underline">Edit profile</p>
              </motion.div>
            )}
          </AnimatePresence>
          {showLabels && (
            <ChevronRight size={16} className="text-gray-300 group-hover:text-blue-500 shrink-0" />
          )}
        </button>
        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-all duration-150"
        >
          <LogOut size={18} className="flex-shrink-0" />
          <AnimatePresence>
            {showLabels && <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-sm">Logout</motion.span>}
          </AnimatePresence>
        </button>
      </div>

      <ProfileSettingsModal isOpen={showProfile} onClose={() => setShowProfile(false)} />
    </motion.div>
  );
}