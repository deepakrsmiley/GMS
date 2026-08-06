import React from 'react';
import { Phone, Mail, MapPin, ShieldAlert } from 'lucide-react';

const fmtMoney = (v) => `₹${(v || 0).toLocaleString('en-IN')}`;
const fmtDate = (v) => (v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

export default function PatientSummaryHeader({ data }) {
  if (!data) return null;
  const { patient, stats = {}, currentStatus, lastVisit } = data;
  const admitted = currentStatus === 'Admitted';

  const kpis = [
    { label: 'Total Visits', value: stats.totalVisits ?? 0 },
    { label: 'OP Visits', value: stats.totalOPVisits ?? 0 },
    { label: 'Admissions', value: stats.totalAdmissions ?? 0 },
    { label: 'Procedures', value: stats.totalProcedures ?? 0 },
    { label: 'Total Bills', value: stats.totalBills ?? 0 },
    { label: 'Total Paid', value: fmtMoney(stats.totalPaid) },
    {
      label: 'Outstanding',
      value: fmtMoney(stats.outstandingAmount),
      warn: (stats.outstandingAmount || 0) > 0,
    },
  ];

  return (
    <section className="p360-hero">
      <div className="p360-hero__row">
        <div className="p360-avatar">
          {patient.photo
            ? <img src={patient.photo} alt={patient.name} />
            : (patient.name?.charAt(0) || '?')}
        </div>

        <div className="p360-hero__identity">
          <div className="p360-hero__name-row">
            <h2 className="p360-hero__name">{patient.name}</h2>
            <span className="p360-uhid" title="Unique hospital ID">UHID {patient.patientId}</span>
            <span className={`p360-badge ${admitted ? 'p360-badge--alert' : 'p360-badge--ok'}`}>
              {currentStatus || '—'}
            </span>
            {patient.isVIP && <span className="p360-badge p360-badge--vip">VIP</span>}
          </div>
          <p className="p360-hero__meta">
            {[
              patient.age != null ? `${patient.age} yrs` : null,
              patient.gender,
              patient.bloodGroup ? `Blood ${patient.bloodGroup}` : 'Blood group unknown',
            ].filter(Boolean).join(' · ')}
          </p>
          <div className="p360-hero__contacts">
            {patient.phone && (
              <span><Phone size={12} /> {patient.phone}</span>
            )}
            {patient.email && (
              <span><Mail size={12} /> {patient.email}</span>
            )}
            {patient.address?.city && (
              <span><MapPin size={12} /> {patient.address.city}</span>
            )}
          </div>
        </div>

        <div className="p360-hero__facts">
          <div>
            <p className="p360-fact__label">Occupation</p>
            <p className="p360-fact__value">{patient.occupation || '—'}</p>
          </div>
          <div>
            <p className="p360-fact__label">Insurance</p>
            <p className="p360-fact__value">{patient.insuranceInfo?.provider || '—'}</p>
          </div>
          <div>
            <p className="p360-fact__label">Nationality</p>
            <p className="p360-fact__value">{patient.nationality || '—'}</p>
          </div>
          <div>
            <p className="p360-fact__label">Registered</p>
            <p className="p360-fact__value">{fmtDate(patient.createdAt)}</p>
          </div>
        </div>
      </div>

      {patient.allergies?.length > 0 && (
        <div className="p360-allergy">
          <ShieldAlert size={14} />
          Allergies: {patient.allergies.join(', ')}
        </div>
      )}

      <div className="p360-kpis">
        {kpis.map((k) => (
          <div key={k.label} className={`p360-kpi${k.warn ? ' p360-kpi--warn' : ''}`}>
            <p className="p360-kpi__label">{k.label}</p>
            <p className="p360-kpi__value">{k.value}</p>
          </div>
        ))}
      </div>

      {lastVisit && (
        <p className="p360-last-visit">
          Last visit: {new Date(lastVisit).toLocaleString('en-IN')}
        </p>
      )}
    </section>
  );
}
