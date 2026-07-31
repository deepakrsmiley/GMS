import React from 'react';
import { Phone, Mail, MapPin, ShieldCheck, Stethoscope, Calendar, Activity, Wallet, Receipt, Syringe } from 'lucide-react';
import StatCard from './StatCard';

const infoItem = (label, value) => (
  <div>
    <p className="text-[11px] text-gray-400">{label}</p>
    <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{value || '—'}</p>
  </div>
);

export default function PatientSummaryHeader({ data }) {
  if (!data) return null;
  const { patient, stats, currentStatus, lastVisit } = data;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
      <div className="flex flex-wrap items-start gap-5">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-3xl font-bold shrink-0 overflow-hidden">
          {patient.photo ? <img src={patient.photo} alt={patient.name} className="w-full h-full object-cover" /> : patient.name?.charAt(0)}
        </div>

        <div className="flex-1 min-w-[240px]">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">{patient.name}</h2>
            <span className="font-mono text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded-full" title="UHID from registration">UHID {patient.patientId}</span>
            <span className={`badge-${currentStatus === 'Admitted' ? 'red' : 'green'}`}>{currentStatus}</span>
            {patient.isVIP && <span className="badge-yellow">VIP</span>}
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {patient.age} yrs • {patient.gender} • {patient.bloodGroup || 'Blood group unknown'}
          </p>
          <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-600 dark:text-gray-300">
            <span className="flex items-center gap-1"><Phone size={13} /> {patient.phone}</span>
            {patient.email && <span className="flex items-center gap-1"><Mail size={13} /> {patient.email}</span>}
            {patient.address?.city && <span className="flex items-center gap-1"><MapPin size={13} /> {patient.address.city}</span>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 min-w-[220px]">
          {infoItem('Occupation', patient.occupation)}
          {infoItem('Nationality', patient.nationality)}
          {infoItem('Insurance', patient.insuranceInfo?.provider)}
          {infoItem('Registered', patient.createdAt ? new Date(patient.createdAt).toLocaleDateString('en-IN') : '—')}
        </div>
      </div>

      {patient.allergies?.length > 0 && (
        <div className="mt-3 text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
          <ShieldCheck size={14} /> Allergies: {patient.allergies.join(', ')}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mt-5">
        <StatCard icon={Activity} label="Total Visits" value={stats.totalVisits} tone="blue" />
        <StatCard icon={Stethoscope} label="OP Visits" value={stats.totalOPVisits} tone="purple" />
        <StatCard icon={Calendar} label="Admissions" value={stats.totalAdmissions} tone="amber" />
        <StatCard icon={Syringe} label="Procedures" value={stats.totalProcedures} tone="blue" />
        <StatCard icon={Receipt} label="Total Bills" value={stats.totalBills} tone="purple" />
        <StatCard icon={Wallet} label="Total Paid" value={`₹${(stats.totalPaid || 0).toLocaleString('en-IN')}`} tone="green" />
        <StatCard icon={Wallet} label="Outstanding" value={`₹${(stats.outstandingAmount || 0).toLocaleString('en-IN')}`} tone={stats.outstandingAmount > 0 ? 'red' : 'green'} />
      </div>

      {lastVisit && (
        <p className="text-xs text-gray-400 mt-3">Last visit: {new Date(lastVisit).toLocaleString('en-IN')}</p>
      )}
    </div>
  );
}
