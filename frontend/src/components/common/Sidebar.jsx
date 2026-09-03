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
  const primary = branding.primaryColor || '#4338ca';

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
              ? 'bg-white/20 text-white shadow-sm'
              : 'text-white/80 hover:bg-white/12 hover:text-white'
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
      animate={{ width: isDesktop ? (sidebarOpen ? 268 : 72) : 268 }}
      style={{ backgroundColor: primary }}
      className={`fixed left-0 top-7 h-[calc(100dvh-1.75rem)] max-h-[calc(100dvh-1.75rem)] text-white z-40 flex flex-col border-r border-white/10 overflow-hidden transition-transform duration-300 ${
        isDesktop ? '' : (sidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full pointer-events-none')
      }`}
    >
      {/* Brand — larger logo + hospital name */}
      <div className="flex items-center gap-3 px-3.5 min-h-[76px] border-b border-white/15 flex-shrink-0 py-3">
        {showHospitalBrand && hospitalLogo ? (
          <img
            src={hospitalLogo}
            alt=""
            className="w-14 h-14 rounded-2xl object-contain flex-shrink-0 bg-white p-1 shadow-sm"
          />
        ) : showHospitalBrand ? (
          <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm">
            <ShieldCheck size={28} style={{ color: primary }} />
          </div>
        ) : (
          <img src={SOFTWARE_LOGO} alt={SYSTEM_NAME} className="w-14 h-14 rounded-2xl object-contain flex-shrink-0 bg-white p-1" />
        )}
        <AnimatePresence>
          {showLabels && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="overflow-hidden min-w-0">
              {showHospitalBrand && <GmsDevelopedMark className="mb-0.5 opacity-90" />}
              <p className="font-bold text-white text-[15px] leading-snug line-clamp-2" title={brandTitle}>
                {brandTitle}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden py-4 px-3">
        <AnimatePresence>
          {showLabels && gmsNavItems.length > 0 && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="px-3 text-[11px] font-semibold uppercase tracking-wider text-white/55 mb-2">
              GMS
            </motion.p>
          )}
        </AnimatePresence>
        {gmsNavItems.map(renderLink)}
        <AnimatePresence>
          {showLabels && navItems.length > 0 && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="px-3 text-[11px] font-semibold uppercase tracking-wider text-white/55 mb-2 mt-3">
              {clientHospital ? hospitalName : ''}
            </motion.p>
          )}
        </AnimatePresence>
        {navGroups.map((group) => (
          <div key={group.id}>
            <AnimatePresence>
              {showLabels && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="px-3 text-[11px] font-semibold uppercase tracking-wider text-white/55 mb-1 mt-3">
                  {group.label}
                </motion.p>
              )}
            </AnimatePresence>
            {group.items.map(renderLink)}
          </div>
        ))}
      </nav>

      <AnimatePresence>
        {showLabels && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mx-3 mb-3 flex-shrink-0">
            <NavLink
              to="/how-to-use"
              onClick={closeIfMobile}
              className={({ isActive }) =>
                `flex items-center gap-3 p-3 rounded-2xl ${isActive ? 'bg-white/25 text-white' : 'bg-white/10 text-white'}`
              }
            >
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                <BookOpen size={17} className="text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">How to Use</p>
                <p className="text-xs text-white/70 truncate">Correct hospital workflow</p>
              </div>
            </NavLink>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="border-t border-white/15 p-3 flex-shrink-0">
        <button
          type="button"
          onClick={() => setShowProfile(true)}
          title="Edit profile"
          className="w-full flex items-center gap-3 mb-2 px-1 py-1.5 rounded-xl hover:bg-white/10 transition-colors text-left group"
        >
          <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0 overflow-hidden">
            {user?.avatar ? (
              <img src={user.avatar} alt="" className="w-full h-full object-cover" />
            ) : (
              user?.name?.charAt(0)
            )}
          </div>
          <AnimatePresence>
            {showLabels && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="overflow-hidden min-w-0 flex-1">
                <p className="text-sm font-medium text-white truncate">{user?.name}</p>
                <p className="text-xs text-white/65 capitalize truncate">
                  {gmsAdmin ? 'GMS Super Admin' : user?.role?.replace('_', ' ')}
                </p>
                <p className="text-[10px] text-white/90 font-medium mt-0.5 group-hover:underline">Edit profile</p>
              </motion.div>
            )}
          </AnimatePresence>
          {showLabels && (
            <ChevronRight size={16} className="text-white/50 group-hover:text-white shrink-0" />
          )}
        </button>
        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 text-white/75 hover:text-white hover:bg-white/10 rounded-xl transition-all duration-150"
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
