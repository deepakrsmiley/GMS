import React from 'react';
import { NavLink, Outlet, Navigate } from 'react-router-dom';
import { Settings, Building2, Syringe } from 'lucide-react';

const settingsNav = [
  { to: '/settings/hospital-branding', icon: Building2, label: 'Hospital Branding' },
  { to: '/settings/services', icon: Syringe, label: 'Services / Equipment Rates' },
];

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
          <Settings size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
          <p className="text-sm text-gray-500">Manage system configuration</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <nav className="lg:col-span-1 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-3 h-fit">
          {settingsNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`
              }
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="lg:col-span-3">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

export function SettingsIndexRedirect() {
  return <Navigate to="/settings/hospital-branding" replace />;
}
