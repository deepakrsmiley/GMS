import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart2, Download } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend } from 'recharts';
import api from '../services/api';

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export default function ReportsPage() {
  const [days, setDays] = useState(30);
  const [activeTab, setActiveTab] = useState('revenue');

  const { data: revenue } = useQuery({
    queryKey: ['revenueReport', days],
    queryFn: () => api.get(`/billing/revenue-report?days=${days}`).then(r => r.data.data),
  });

  const { data: deptAnalytics } = useQuery({
    queryKey: ['deptAnalytics'],
    queryFn: () => api.get('/dashboard/department-analytics').then(r => r.data.data),
  });

  const { data: assetDashboard } = useQuery({
    queryKey: ['assetDashboard'],
    queryFn: () => api.get('/assets/dashboard').then(r => r.data.data),
    enabled: activeTab === 'assets',
  });

  const { data: pharmacyDashboard } = useQuery({
    queryKey: ['pharmacyDashboard'],
    queryFn: () => api.get('/pharmacy/dashboard').then(r => r.data.data),
    enabled: activeTab === 'pharmacy',
  });

  const { data: pharmacyLowStock } = useQuery({
    queryKey: ['pharmacyLowStock'],
    queryFn: () => api.get('/pharmacy/low-stock').then(r => r.data.data),
    enabled: activeTab === 'pharmacy',
  });

  const { data: pharmacyExpired } = useQuery({
    queryKey: ['pharmacyExpired'],
    queryFn: () => api.get('/pharmacy/expired').then(r => r.data.data),
    enabled: activeTab === 'pharmacy',
  });

  const tabs = ['revenue', 'departments', 'doctors', 'assets', 'pharmacy'];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Reports & Analytics</h1>
        <div className="flex gap-3">
          <select value={days} onChange={e => setDays(Number(e.target.value))} className="input-field w-36">
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={365}>Last year</option>
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700">
        {tabs.map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize ${activeTab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
            {t.replace('_', '/')}
          </button>
        ))}
      </div>

      {activeTab === 'revenue' && (
        <div className="space-y-6">
          {/* Revenue trend */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Daily Revenue ({days} days)</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={revenue?.daily || []} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="_id" tick={{ fontSize: 11 }} tickFormatter={v => v?.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₹${(v/1000).toFixed(0)}K`} />
                <Tooltip formatter={v => [`₹${v.toLocaleString()}`, 'Revenue']} />
                <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Revenue by type */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Revenue by Bill Type</h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={revenue?.byType || []} dataKey="revenue" nameKey="_id" cx="50%" cy="50%" outerRadius={80} label={({ _id, percent }) => `${_id} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                    {(revenue?.byType || []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={v => `₹${v.toLocaleString()}`} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Bill Count by Type</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={revenue?.byType || []} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="_id" type="category" tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#22c55e" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'departments' && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Department-wise OP Count (30 days)</h3>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={deptAnalytics || []} margin={{ top: 5, right: 10, left: 0, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="count" name="Total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="completed" name="Completed" fill="#22c55e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {activeTab === 'doctors' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Doctor-wise OP Consultation Count ({days} days)</h3>
              {revenue?.doctorOPCount?.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={revenue.doctorOPCount} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="doctorName" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" name="Consultations" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center py-20 text-gray-400 text-sm">No data available</p>
              )}
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Doctor Consultation Revenue ({days} days)</h3>
              {revenue?.doctorRevenue?.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={revenue.doctorRevenue} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="doctorName" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₹${v}`} />
                    <Tooltip formatter={v => [`₹${v.toLocaleString()}`, 'Revenue']} />
                    <Bar dataKey="revenue" name="Revenue" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center py-20 text-gray-400 text-sm">No data available</p>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'assets' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700">
              <p className="text-sm text-gray-500">Total Assets</p>
              <p className="text-2xl font-bold mt-1 text-gray-900 dark:text-white">{assetDashboard?.totalAssets || 0}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700">
              <p className="text-sm text-gray-500">Working</p>
              <p className="text-2xl font-bold mt-1 text-green-600">{assetDashboard?.working || 0}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700">
              <p className="text-sm text-gray-500">Under Maintenance</p>
              <p className="text-2xl font-bold mt-1 text-amber-500">{assetDashboard?.underRepair || 0}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700">
              <p className="text-sm text-gray-500">Warranty Expiring Soon</p>
              <p className="text-2xl font-bold mt-1 text-red-500">{assetDashboard?.warrantyExpiringSoon || 0}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Assets by Status</h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Working', value: assetDashboard?.working || 0 },
                      { name: 'Under Maintenance', value: assetDashboard?.underMaintenance || 0 },
                      { name: 'Breakdown', value: assetDashboard?.breakdown || 0 },
                      { name: 'Repair In Progress', value: assetDashboard?.repairInProgress || 0 },
                    ].filter(v => v.value > 0)}
                    dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {[
                      { name: 'Working', color: '#22c55e' },
                      { name: 'Under Maintenance', color: '#f59e0b' },
                      { name: 'Breakdown', color: '#ef4444' },
                      { name: 'Repair In Progress', color: '#3b82f6' },
                    ].map((item, i) => <Cell key={i} fill={item.color} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Warranty Expiring Soon</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-700 text-gray-400 text-xs font-semibold uppercase">
                      <th className="pb-2">Asset Name</th>
                      <th className="pb-2">ID</th>
                      <th className="pb-2 text-right">Expiry Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                    {(assetDashboard?.warningExpiryList || []).map((ast) => (
                      <tr key={ast._id}>
                        <td className="py-2.5 font-medium text-gray-900 dark:text-white">{ast.name}</td>
                        <td className="py-2.5 text-gray-400">{ast.assetId}</td>
                        <td className="py-2.5 text-right text-amber-600 font-medium">{new Date(ast.warrantyExpiry).toLocaleDateString('en-IN')}</td>
                      </tr>
                    ))}
                    {!(assetDashboard?.warningExpiryList?.length) && (
                      <tr>
                        <td colSpan={3} className="py-8 text-center text-gray-400">No assets expiring in 30 days</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'pharmacy' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700">
              <p className="text-sm text-gray-500">Total Medicines</p>
              <p className="text-2xl font-bold mt-1 text-gray-900 dark:text-white">{pharmacyDashboard?.cards?.totalMedicines || 0}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700">
              <p className="text-sm text-gray-500">Valuation</p>
              <p className="text-2xl font-bold mt-1 text-green-600">₹{(pharmacyDashboard?.cards?.totalInventoryValue || 0).toLocaleString()}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700">
              <p className="text-sm text-gray-500">Low Stock</p>
              <p className="text-2xl font-bold mt-1 text-amber-500">{pharmacyLowStock?.length || 0}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700">
              <p className="text-sm text-gray-500">Expired Batches</p>
              <p className="text-2xl font-bold mt-1 text-red-500">{pharmacyExpired?.length || 0}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Low Stock Alerts</h3>
              <div className="overflow-x-auto max-h-80 overflow-y-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-700 text-gray-400 text-xs font-semibold uppercase">
                      <th className="pb-2">Medicine Name</th>
                      <th className="pb-2">Current</th>
                      <th className="pb-2 text-right">Min Level</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                    {(pharmacyLowStock || []).map((med) => (
                      <tr key={med._id}>
                        <td className="py-2.5 font-medium text-gray-900 dark:text-white">{med.medicineName}</td>
                        <td className="py-2.5 text-amber-600 font-semibold">{med.currentStock}</td>
                        <td className="py-2.5 text-right font-medium text-gray-900 dark:text-white">{med.minimumStock}</td>
                      </tr>
                    ))}
                    {!(pharmacyLowStock?.length) && (
                      <tr>
                        <td colSpan={3} className="py-8 text-center text-gray-400">All stocks healthy</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Expired Medicines</h3>
              <div className="overflow-x-auto max-h-80 overflow-y-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-700 text-gray-400 text-xs font-semibold uppercase">
                      <th className="pb-2">Medicine</th>
                      <th className="pb-2">Batch</th>
                      <th className="pb-2">Qty</th>
                      <th className="pb-2 text-right">Expiry Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                    {(pharmacyExpired || []).map((med, i) => (
                      <tr key={i}>
                        <td className="py-2.5 font-medium text-gray-900 dark:text-white">{med.medicineName}</td>
                        <td className="py-2.5 text-gray-500">{med.batchNumber}</td>
                        <td className="py-2.5 text-red-500 font-semibold">{med.quantity}</td>
                        <td className="py-2.5 text-right text-red-600 font-medium">{new Date(med.expiryDate).toLocaleDateString('en-IN')}</td>
                      </tr>
                    ))}
                    {!(pharmacyExpired?.length) && (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-gray-400">No expired batches</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
