import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Users, Activity, Bed, DollarSign, FlaskConical, UserPlus, AlertTriangle, CheckCircle, Pill, Stethoscope, Building2, Package, Wrench } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, Legend } from 'recharts';
import api from '../services/api';
import KpiCard from '../components/common/KpiCard';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { getSocket } from '../services/socket';
import { format } from 'date-fns';

const fetchDashboard = () => api.get('/dashboard/stats').then((r) => r.data.data);

const statusColors = { waiting: '#f59e0b', in_consultation: '#3b82f6', completed: '#22c55e' };
const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function DashboardPage() {
  const { data, isLoading, refetch } = useQuery({ queryKey: ['dashboard'], queryFn: fetchDashboard, refetchInterval: 30000 });

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const handler = () => refetch();
    socket.on('queue:update', handler);
    socket.on('bed:update', handler);
    return () => { socket.off('queue:update', handler); socket.off('bed:update', handler); };
  }, [refetch]);

  if (isLoading) return <LoadingSpinner />;

  const d = data || {};
  const opQueuePie = [
    { name: 'Waiting', value: d.opQueue?.waiting || 0 },
    { name: 'In Consult', value: d.opQueue?.in_consultation || 0 },
    { name: 'Completed', value: d.opQueue?.completed || 0 },
  ];
  const bedPie = [
    { name: 'Available', value: d.beds?.available || 0 },
    { name: 'Occupied', value: d.beds?.occupied || 0 },
    { name: 'Cleaning', value: d.beds?.cleaning || 0 },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">{format(new Date(), 'EEEE, MMMM do yyyy')}</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard title="Today's OP" value={d.todayOP || 0} icon={Activity} color="blue" subtitle="Outpatients today" />
        <KpiCard title="Today's IP" value={d.todayIP || 0} icon={UserPlus} color="green" subtitle="New admissions" />
        <KpiCard title="Total Patients" value={(d.totalPatients || 0).toLocaleString()} icon={Users} color="purple" subtitle="Registered patients" />
        <KpiCard title="Active IP" value={d.totalIP || 0} icon={Bed} color="indigo" subtitle="Currently admitted" />
        <KpiCard title="Today Revenue" value={`₹${((d.todayRevenue || 0) / 1000).toFixed(1)}K`} icon={DollarSign} color="green" subtitle="Collected today" />
        <KpiCard title="Pending Bills" value={d.pendingBills || 0} icon={AlertTriangle} color="yellow" subtitle="Awaiting payment" />
        <KpiCard title="Lab Tests" value={d.labToday || 0} icon={FlaskConical} color="blue" subtitle="Today's tests" />
        <KpiCard title="Beds Available" value={d.beds?.available || 0} icon={CheckCircle} color="green" subtitle={`of ${(d.beds?.available || 0) + (d.beds?.occupied || 0)} total`} />
      </div>

      {/* Pharmacy & Infrastructure KPIs */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">Pharmacy & Infrastructure</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <KpiCard title="Pharmacy Sales" value={`₹${(d.todayPharmacySales?.total || 0).toLocaleString()}`} icon={Pill} color="green" subtitle={`${d.todayPharmacySales?.count || 0} sales today`} />
          <KpiCard title="Total Doctors" value={d.totalDoctors || 0} icon={Stethoscope} color="blue" subtitle="Active doctors" />
          <KpiCard title="Departments" value={d.totalDepartments || 0} icon={Building2} color="purple" subtitle="Configured dept" />
          <KpiCard title="Total Assets" value={d.totalAssets || 0} icon={Package} color="indigo" subtitle="Hospital assets" />
          <KpiCard title="Assets Under Repair" value={d.assetsUnderRepair || 0} icon={Wrench} color="red" subtitle="Need maintenance" />
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Trend */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Revenue Trend (30 Days)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={d.revenueTrend || []} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="_id" tick={{ fontSize: 11 }} tickFormatter={(v) => v?.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(v/1000).toFixed(0)}K`} />
              <Tooltip formatter={(v) => [`₹${v.toLocaleString()}`, 'Revenue']} />
              <Area type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} fill="url(#revGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* OP Queue Status */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Today's OP Queue</h3>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={opQueuePie} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
                {opQueuePie.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
              </Pie>
              <Legend iconSize={10} />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-2 space-y-1">
            {opQueuePie.map((item, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full inline-block" style={{ background: COLORS[i] }} />{item.name}
                </span>
                <span className="font-semibold text-gray-900 dark:text-white">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Live Queue & Recent Patients */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Live Queue */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              Live OP Queue
            </h3>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-700">
            {(d.liveQueue || []).slice(0, 6).map((item) => (
              <div key={item._id} className="px-6 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center text-blue-700 dark:text-blue-400 font-bold text-sm">
                    {item.tokenNumber}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{item.patient?.name}</p>
                    <p className="text-xs text-gray-400">{item.department?.name}</p>
                  </div>
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                  item.status === 'waiting' ? 'badge-yellow' :
                  item.status === 'in_consultation' ? 'badge-blue' : 'badge-green'
                }`}>
                  {item.status.replace('_', ' ')}
                </span>
              </div>
            ))}
            {!(d.liveQueue?.length) && <p className="px-6 py-8 text-center text-gray-400 text-sm">Queue is empty</p>}
          </div>
        </div>

        {/* Bed Status */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
            <h3 className="font-semibold text-gray-900 dark:text-white">Bed Occupancy</h3>
          </div>
          <div className="p-6">
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={bedPie} cx="50%" cy="50%" outerRadius={70} paddingAngle={3} dataKey="value" label={({name, value}) => `${name}: ${value}`} labelLine={false}>
                  {bedPie.map((_, i) => <Cell key={i} fill={['#22c55e','#ef4444','#f59e0b'][i]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent Patients */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">Recent Registrations</h3>
        </div>
        <div className="divide-y divide-gray-50 dark:divide-gray-700">
          {(d.recentPatients || []).map((p) => (
            <div key={p._id} className="px-6 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
                  {p.name?.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{p.name}</p>
                  <p className="text-xs text-gray-400">{p.patientId} • {p.age}yr • {p.gender}</p>
                </div>
              </div>
              <p className="text-xs text-gray-400">{format(new Date(p.createdAt), 'dd MMM, HH:mm')}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
