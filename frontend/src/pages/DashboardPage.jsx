import React, { useEffect, useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useSelector } from 'react-redux';
import { useNavigate, Link } from 'react-router-dom';
import {
  Users, Activity, Bed, IndianRupee, FlaskConical, UserPlus, AlertTriangle,
  CheckCircle, Pill, Stethoscope, Building2, Package, Wrench, ChevronDown,
  Plus, UserRoundPlus, CalendarPlus, BedDouble, FileSpreadsheet, Receipt,
  Heart, Bone, Brain, Baby, MoreHorizontal, CalendarClock, Clock3, XCircle,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import api from '../services/api';
import KpiCard from '../components/common/KpiCard';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { getSocket } from '../services/socket';
import { format } from 'date-fns';

const fetchDashboard = () => api.get('/dashboard/stats').then((r) => r.data.data);
const fetchDeptAnalytics = () => api.get('/dashboard/department-analytics').then((r) => r.data.data);
const fetchRecentBills = () => api.get('/billing?limit=5&sort=-createdAt').then((r) => r.data.data);
const fetchDepartments = () => api.get('/departments').then((r) => r.data.data);

const BILL_VIEW_ROLES = ['Super Admin', 'Admin', 'Receptionist', 'Pharmacist', 'Accountant'];

const BILL_STATUS_BADGE = {
  paid: 'badge-green',
  partial: 'badge-yellow',
  pending: 'badge-yellow',
  draft: 'badge-gray',
  cancelled: 'badge-red',
  refunded: 'badge-red',
};

const DEPT_ICONS = [Heart, Bone, Stethoscope, Brain, Baby];
const DEPT_COLORS = [
  { bg: 'bg-red-50', text: 'text-red-500' },
  { bg: 'bg-blue-50', text: 'text-blue-500' },
  { bg: 'bg-green-50', text: 'text-green-500' },
  { bg: 'bg-purple-50', text: 'text-purple-500' },
  { bg: 'bg-amber-50', text: 'text-amber-500' },
];

const QUICK_ACTIONS = [
  { label: 'Add Patient', icon: UserRoundPlus, to: '/patients', color: 'text-blue-600 bg-blue-50' },
  { label: 'New Appointment', icon: CalendarPlus, to: '/appointments', color: 'text-green-600 bg-green-50' },
  { label: 'Admit Patient (IP)', icon: BedDouble, to: '/ip-admissions', color: 'text-emerald-600 bg-emerald-50' },
  { label: 'Add Prescription', icon: FileSpreadsheet, to: '/pharmacy?tab=prescriptions', color: 'text-orange-600 bg-orange-50' },
  { label: 'Lab Test', icon: FlaskConical, to: '/lab', color: 'text-teal-600 bg-teal-50' },
  { label: 'New Invoice', icon: Receipt, to: '/billing', color: 'text-indigo-600 bg-indigo-50' },
];

export default function DashboardPage() {
  const { user } = useSelector((s) => s.auth);
  const navigate = useNavigate();
  const [showQuickMenu, setShowQuickMenu] = useState(false);
  const [showDeptMenu, setShowDeptMenu] = useState(false);
  const [selectedDept, setSelectedDept] = useState(null); // { _id, name } | null
  const quickMenuRef = useRef(null);
  const deptMenuRef = useRef(null);

  const { data, isLoading, refetch } = useQuery({ queryKey: ['dashboard'], queryFn: fetchDashboard, refetchInterval: 30000 });
  const { data: deptAnalytics } = useQuery({ queryKey: ['deptAnalytics'], queryFn: fetchDeptAnalytics });
  const { data: departments } = useQuery({ queryKey: ['allDepartments'], queryFn: fetchDepartments });
  const canViewBills = BILL_VIEW_ROLES.includes(user?.role);
  const { data: recentBills } = useQuery({ queryKey: ['recentBills'], queryFn: fetchRecentBills, enabled: canViewBills });

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const handler = () => refetch();
    socket.on('queue:update', handler);
    socket.on('bed:update', handler);
    return () => { socket.off('queue:update', handler); socket.off('bed:update', handler); };
  }, [refetch]);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (quickMenuRef.current && !quickMenuRef.current.contains(e.target)) setShowQuickMenu(false);
      if (deptMenuRef.current && !deptMenuRef.current.contains(e.target)) setShowDeptMenu(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  if (isLoading) return <LoadingSpinner />;

  const d = data || {};
  const opdTrend = (d.revenueTrend || []).map((r) => ({ ...r, label: r._id?.slice(5) }));

  const totalBeds = (d.beds?.available || 0) + (d.beds?.occupied || 0) + (d.beds?.cleaning || 0) + (d.beds?.maintenance || 0);
  const occupiedPct = totalBeds ? Math.round(((d.beds?.occupied || 0) / totalBeds) * 100) : 0;
  const bedPie = [
    { name: 'Occupied', value: d.beds?.occupied || 0 },
    { name: 'Remaining', value: totalBeds - (d.beds?.occupied || 0) },
  ];

  const revenuePie = [
    { name: 'OPD/IPD Revenue', value: d.todayRevenue || 0 },
    { name: 'Pharmacy Revenue', value: d.todayPharmacySales?.total || 0 },
  ];
  const revenueTotal = (d.todayRevenue || 0) + (d.todayPharmacySales?.total || 0);
  const REV_COLORS = ['#3b82f6', '#22c55e'];

  const topDepts = (deptAnalytics || []).slice(0, 5);

  // Apply "All Departments" filter (client-side, over already-fetched live data)
  const filteredQueue = selectedDept
    ? (d.liveQueue || []).filter((item) => item.department?._id === selectedDept._id)
    : (d.liveQueue || []);
  const filteredTopDepts = selectedDept
    ? (deptAnalytics || []).filter((dept) => dept._id === selectedDept._id)
    : topDepts;

  return (
    <div className="space-y-6">
      {/* Welcome row */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Welcome back, {user?.name?.split(' ')[0] || 'Doctor'}! 👋</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Here's what's happening with your hospital today.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-200">
            {format(new Date(), 'dd MMMM yyyy')}
          </div>
          <div className="relative" ref={deptMenuRef}>
            <button
              onClick={() => setShowDeptMenu((v) => !v)}
              className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-200"
            >
              {selectedDept ? selectedDept.name : 'All Departments'} <ChevronDown size={14} />
            </button>
            {showDeptMenu && (
              <div className="absolute right-0 top-12 w-56 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 z-50 overflow-hidden py-2 max-h-72 overflow-y-auto">
                <button
                  onClick={() => { setSelectedDept(null); setShowDeptMenu(false); }}
                  className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 ${!selectedDept ? 'text-blue-600 font-medium' : 'text-gray-700 dark:text-gray-200'}`}
                >
                  All Departments
                </button>
                {(departments || []).map((dept) => (
                  <button
                    key={dept._id}
                    onClick={() => { setSelectedDept({ _id: dept._id, name: dept.name }); setShowDeptMenu(false); }}
                    className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 ${selectedDept?._id === dept._id ? 'text-blue-600 font-medium' : 'text-gray-700 dark:text-gray-200'}`}
                  >
                    {dept.name}
                  </button>
                ))}
                {!(departments?.length) && <p className="px-4 py-3 text-xs text-gray-400">No departments configured</p>}
              </div>
            )}
          </div>
          <div className="relative" ref={quickMenuRef}>
            <button
              onClick={() => setShowQuickMenu((v) => !v)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors"
            >
              <Plus size={16} /> Quick Action
            </button>
            {showQuickMenu && (
              <div className="absolute right-0 top-12 w-56 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 z-50 overflow-hidden py-2">
                {QUICK_ACTIONS.map((qa) => (
                  <button
                    key={qa.label}
                    onClick={() => { setShowQuickMenu(false); navigate(qa.to); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 text-left"
                  >
                    <span className={`p-1.5 rounded-lg ${qa.color}`}><qa.icon size={15} /></span>
                    {qa.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Primary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        <KpiCard title="Total Patients" value={(d.totalPatients || 0).toLocaleString()} icon={Users} color="blue" subtitle="All registered patients" />
        <KpiCard title="OP Consultations" value={d.todayOP || 0} icon={Stethoscope} color="teal" subtitle="Today" />
        <KpiCard title="IP Admissions" value={d.todayIP || 0} icon={UserPlus} color="purple" subtitle="New admissions today" />
        <KpiCard title="Active IP Patients" value={d.totalIP || 0} icon={Bed} color="indigo" subtitle="Currently admitted" />
        <KpiCard title="Total Revenue (Today)" value={`₹${((d.todayRevenue || 0) / 1000).toFixed(1)}K`} icon={IndianRupee} color="green" subtitle="Collected today" />
      </div>

      {/* Secondary KPI Cards */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">Pharmacy & Infrastructure</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
          <KpiCard title="Pharmacy Sales" value={`₹${(d.todayPharmacySales?.total || 0).toLocaleString()}`} icon={Pill} color="green" subtitle={`${d.todayPharmacySales?.count || 0} sales today`} />
          <KpiCard title="Total Doctors" value={d.totalDoctors || 0} icon={Stethoscope} color="blue" subtitle="Active doctors" />
          <KpiCard title="Departments" value={d.totalDepartments || 0} icon={Building2} color="purple" subtitle="Configured dept" />
          <KpiCard title="Total Assets" value={d.totalAssets || 0} icon={Package} color="indigo" subtitle="Hospital assets" />
          <KpiCard title="Assets Under Repair" value={d.assetsUnderRepair || 0} icon={Wrench} color="red" subtitle="Need maintenance" />
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* OPD Trend */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 dark:text-white">Revenue Trend (30 Days)</h3>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={opdTrend} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
              <Tooltip formatter={(v) => [`₹${v.toLocaleString()}`, 'Revenue']} />
              <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4, fill: '#3b82f6' }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Revenue Overview donut */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Revenue Overview</h3>
          <div className="relative">
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={revenuePie} cx="50%" cy="50%" innerRadius={45} outerRadius={68} paddingAngle={3} dataKey="value" stroke="none">
                  {revenuePie.map((_, i) => <Cell key={i} fill={REV_COLORS[i]} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <p className="text-lg font-bold text-gray-900 dark:text-white">₹{(revenueTotal / 1000).toFixed(1)}K</p>
              <p className="text-xs text-gray-400">Total</p>
            </div>
          </div>
          <div className="mt-3 space-y-2">
            {revenuePie.map((item, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full inline-block" style={{ background: REV_COLORS[i] }} />{item.name}
                </span>
                <span className="font-semibold text-gray-900 dark:text-white">₹{item.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Departments */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900 dark:text-white">Top Departments</h3>
            <span className="text-xs text-gray-400">By Visits</span>
          </div>
          <div className="space-y-3">
            {filteredTopDepts.length === 0 && <p className="text-sm text-gray-400 text-center py-6">No data{selectedDept ? ` for ${selectedDept.name}` : ' yet'}</p>}
            {filteredTopDepts.map((dept, i) => {
              const Icon = DEPT_ICONS[i % DEPT_ICONS.length];
              const c = DEPT_COLORS[i % DEPT_COLORS.length];
              return (
                <div key={dept._id || i} className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${c.bg} ${c.text}`}>
                      <Icon size={15} />
                    </span>
                    <span className="text-sm text-gray-700 dark:text-gray-200 truncate">{dept.name}</span>
                  </div>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white flex-shrink-0">{dept.count}</span>
                </div>
              );
            })}
          </div>
          <Link to="/masters/departments" className="text-xs text-blue-600 font-medium mt-4 inline-block">View All Departments →</Link>
        </div>
      </div>

      {/* Appointment Summary / Bed Occupancy / Alerts / Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Appointment Summary */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 dark:text-white">OP Queue Summary</h3>
            <Link to="/op-queue" className="text-xs text-blue-600 font-medium">View All →</Link>
          </div>
          <div className="grid grid-cols-2 gap-y-6 gap-x-4">
            {[
              { label: 'Today', value: d.todayOP || 0, icon: CalendarClock, color: 'text-blue-600 bg-blue-50' },
              { label: 'Waiting', value: d.opQueue?.waiting || 0, icon: Clock3, color: 'text-amber-600 bg-amber-50' },
              { label: 'Completed', value: d.opQueue?.completed || 0, icon: CheckCircle, color: 'text-green-600 bg-green-50' },
              { label: 'In Consult', value: d.opQueue?.in_consultation || 0, icon: XCircle, color: 'text-red-600 bg-red-50' },
            ].map((s) => (
              <div key={s.label} className="flex flex-col items-center text-center">
                <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-2 ${s.color}`}>
                  <s.icon size={22} />
                </div>
                <p className="text-xl font-bold text-gray-900 dark:text-white leading-tight">{s.value}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Bed Occupancy */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-gray-900 dark:text-white">Bed Occupancy</h3>
            <Link to="/masters/beds" className="text-xs text-blue-600 font-medium">View All →</Link>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative w-28 h-28 flex-shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={bedPie} cx="50%" cy="50%" innerRadius={38} outerRadius={54} startAngle={90} endAngle={-270} paddingAngle={2} dataKey="value" stroke="none">
                    <Cell fill="#3b82f6" />
                    <Cell fill="#e5e7eb" />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <p className="text-lg font-bold text-gray-900 dark:text-white">{occupiedPct}%</p>
                <p className="text-[10px] text-gray-400">Occupied</p>
              </div>
            </div>
            <div className="space-y-2 text-sm flex-1">
              <div className="flex justify-between"><span className="text-gray-500">Total Beds</span><span className="font-semibold text-gray-900 dark:text-white">{totalBeds}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Occupied</span><span className="font-semibold text-red-600">{d.beds?.occupied || 0}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Available</span><span className="font-semibold text-green-600">{d.beds?.available || 0}</span></div>
            </div>
          </div>
        </div>

        {/* Alerts */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 dark:text-white">Alerts & Notifications</h3>
          </div>
          <div className="space-y-4">
            {[
              { title: 'Pending Bills', message: `${d.pendingBills || 0} bills awaiting payment`, icon: AlertTriangle, color: 'text-amber-500 bg-amber-50' },
              { title: 'Lab Tests Today', message: `${d.labToday || 0} lab tests ordered today`, icon: FlaskConical, color: 'text-blue-500 bg-blue-50' },
              { title: 'Assets Under Repair', message: `${d.assetsUnderRepair || 0} assets need maintenance`, icon: Wrench, color: 'text-red-500 bg-red-50' },
            ].map((a) => (
              <div key={a.title} className="flex items-start gap-3">
                <span className={`p-2 rounded-xl flex-shrink-0 ${a.color}`}><a.icon size={15} /></span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{a.title}</p>
                  <p className="text-xs text-gray-400 truncate">{a.message}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-3">
            {QUICK_ACTIONS.slice(0, 4).map((qa) => (
              <button
                key={qa.label}
                onClick={() => navigate(qa.to)}
                className="flex flex-col items-center justify-center gap-2 py-4 rounded-2xl border border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <span className={`p-2.5 rounded-xl ${qa.color}`}><qa.icon size={18} /></span>
                <span className="text-xs font-medium text-gray-600 dark:text-gray-300 text-center">{qa.label}</span>
              </button>
            ))}
          </div>
          <button onClick={() => setShowQuickMenu(true)} className="w-full mt-3 flex items-center justify-center gap-1 py-2 text-xs font-medium text-gray-500 hover:text-blue-600">
            More Actions <MoreHorizontal size={14} />
          </button>
        </div>
      </div>

      {/* Recent Appointments & Recent Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Appointments table */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              Recent Appointments{selectedDept ? ` · ${selectedDept.name}` : ''}
            </h3>
            <Link to="/op-queue" className="text-xs text-blue-600 font-medium">View All →</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-gray-100 dark:border-gray-700">
                  <th className="px-6 py-3 font-medium">Patient Name</th>
                  <th className="px-3 py-3 font-medium">Doctor</th>
                  <th className="px-3 py-3 font-medium">Department</th>
                  <th className="px-3 py-3 font-medium">Time</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                {filteredQueue.slice(0, 6).map((item) => (
                  <tr key={item._id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    <td className="px-6 py-3 font-medium text-gray-900 dark:text-white whitespace-nowrap">{item.patient?.name || '-'}</td>
                    <td className="px-3 py-3 text-gray-500 whitespace-nowrap">{item.doctor?.name || '-'}</td>
                    <td className="px-3 py-3 text-gray-500 whitespace-nowrap">{item.department?.name || '-'}</td>
                    <td className="px-3 py-3 text-gray-500 whitespace-nowrap">{item.tokenDate ? format(new Date(item.tokenDate), 'hh:mm a') : '-'}</td>
                    <td className="px-6 py-3">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap ${
                        item.status === 'waiting' ? 'badge-yellow' :
                        item.status === 'in_consultation' ? 'badge-blue' : 'badge-green'
                      }`}>
                        {item.status.replace('_', ' ')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!(filteredQueue.length) && <p className="px-6 py-8 text-center text-gray-400 text-sm">{selectedDept ? `No appointments for ${selectedDept.name}` : 'Queue is empty'}</p>}
          </div>
        </div>

        {/* Recent Transactions table */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 dark:text-white">Recent Transactions</h3>
            <Link to="/billing" className="text-xs text-blue-600 font-medium">View All →</Link>
          </div>
          {canViewBills ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-400 border-b border-gray-100 dark:border-gray-700">
                    <th className="px-6 py-3 font-medium">Invoice No</th>
                    <th className="px-3 py-3 font-medium">Patient</th>
                    <th className="px-3 py-3 font-medium">Amount</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                  {(recentBills || []).map((bill) => (
                    <tr key={bill._id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                      <td className="px-6 py-3 font-medium text-gray-900 dark:text-white whitespace-nowrap">{bill.billNumber || bill._id?.slice(-6)}</td>
                      <td className="px-3 py-3 text-gray-500 whitespace-nowrap">{bill.patient?.name || '-'}</td>
                      <td className="px-3 py-3 text-gray-500 whitespace-nowrap">₹{(bill.totalAmount || 0).toLocaleString()}</td>
                      <td className="px-3 py-3">
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize whitespace-nowrap ${BILL_STATUS_BADGE[bill.status] || 'badge-gray'}`}>
                          {bill.status}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-gray-500 whitespace-nowrap">{bill.createdAt ? format(new Date(bill.createdAt), 'hh:mm a') : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!(recentBills?.length) && <p className="px-6 py-8 text-center text-gray-400 text-sm">No recent transactions</p>}
            </div>
          ) : (
            <p className="px-6 py-8 text-center text-gray-400 text-sm">You don't have access to billing data</p>
          )}
        </div>
      </div>
    </div>
  );
}