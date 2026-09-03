import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { BookOpen } from 'lucide-react';
import PageHeader from '../components/common/PageHeader';
import { getRolePlaybook } from '../constants/workflow';
import '../styles/workflow.css';

const TABS = [
  { id: 'me', label: 'My role' },
  { id: 'setup', label: 'First-time setup' },
  { id: 'op', label: 'Outpatient' },
  { id: 'ip', label: 'Inpatient' },
  { id: 'support', label: 'Pharmacy, lab, bill' },
  { id: 'roles', label: 'Who does what' },
];

export default function HowToUsePage() {
  const { user } = useSelector((s) => s.auth);
  const [tab, setTab] = useState('me');
  const book = getRolePlaybook(user);

  return (
    <div className="wf-guide space-y-4">
      <PageHeader
        icon={BookOpen}
        title="How to use this hospital software"
        subtitle="Follow the order on each screen. Search UHID first. Bill after the work is logged. Discharge after the IP bill is paid."
      />

      <div className="wf-guide__tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`wf-guide__tab${tab === t.id ? ' is-on' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'me' && (
        <section>
          <h2>{book.title}</h2>
          <p>You are logged in as <strong>{user?.role}</strong>. Do only these screens for your job.</p>
          <ol>
            {book.steps.map((s) => (
              <li key={s.label}>
                {s.to ? <Link to={s.to} className="text-blue-600 font-medium">{s.label}</Link> : s.label}
                {' — '}{s.detail}
              </li>
            ))}
          </ol>
          <p>
            Full map: <Link to="/dashboard" className="text-blue-600">Dashboard</Link> shows the same steps every morning.
          </p>
        </section>
      )}

      {tab === 'setup' && (
        <section>
          <h2>Do this once before the first patient</h2>
          <p>Admin / Super Admin only. Empty masters make every later screen look broken.</p>
          <ol>
            <li><Link to="/masters/branding" className="text-blue-600">Masters → Branding</Link> — hospital name, address, GSTIN, logo (invoices use this).</li>
            <li><Link to="/masters/departments" className="text-blue-600">Departments</Link> — General, Ortho, Gynaec, etc.</li>
            <li><Link to="/masters/staff" className="text-blue-600">Staff</Link> — real people, one login each. No shared admin123.</li>
            <li><Link to="/masters/beds" className="text-blue-600">Rooms &amp; beds</Link> — wards, rooms, all beds, daily rate.</li>
            <li><Link to="/masters/services" className="text-blue-600">Services</Link> — oxygen, nebulizer, nursing, procedures.</li>
            <li><Link to="/masters/lab-tests" className="text-blue-600">Lab test master</Link> — tests and prices.</li>
            <li><Link to="/masters/medicines" className="text-blue-600">Pharmacy</Link> — medicines, GST/HSN, opening stock, batches, expiry.</li>
          </ol>
        </section>
      )}

      {tab === 'op' && (
        <section>
          <h2>Outpatient — correct order</h2>
          <ol>
            <li>Reception: <Link to="/patients" className="text-blue-600">Patients</Link> — search phone/name/UHID. Register only if new.</li>
            <li>Optional: <Link to="/appointments" className="text-blue-600">Appointments</Link> for a future slot. On the day, still make an OP token.</li>
            <li><Link to="/op-registration" className="text-blue-600">OP Registration</Link> — department + doctor. Token. Status = Waiting.</li>
            <li>Doctor: <Link to="/op-queue" className="text-blue-600">Doctor Queue</Link> → Consult → diagnosis, lab, procedures.</li>
            <li>Optional TV: <Link to="/queue-display" className="text-blue-600">TV Queue Display</Link>.</li>
            <li>Need a bed? Admit from OP / IP — do not skip UHID.</li>
            <li>Pharmacist dispenses. Lab collects sample and enters results.</li>
            <li>Cashier: <Link to="/billing" className="text-blue-600">Billing</Link> — load unbilled charges, collect, print. Bill is last.</li>
          </ol>
        </section>
      )}

      {tab === 'ip' && (
        <section>
          <h2>Inpatient — 60-bed correct order</h2>
          <ol>
            <li><Link to="/ip-admissions" className="text-blue-600">IP Admissions</Link> — existing UHID + <strong>one free bed</strong>.</li>
            <li>Bed map turns Occupied. Do not pick an occupied bed.</li>
            <li>Nurse: <Link to="/nurse-station" className="text-blue-600">Nurse Station</Link> — vitals, notes, handover, ward medicines, O2/services as they happen.</li>
            <li>Doctor rounds and orders on the IP file. Lab/pharmacy stay linked to this admission.</li>
            <li>Doctor writes the <strong>discharge summary</strong> (not discharge yet).</li>
            <li>Billing → <strong>Pending Discharge</strong> — create bill, collect due.</li>
            <li>Then Confirm Discharge. The bed becomes Available.</li>
          </ol>
          <div className="wf-wrong">
            Regular discharge is blocked until the IP bill is paid. LAMA, death, transfer, or absconded can still leave; billing follows up after.
          </div>
        </section>
      )}

      {tab === 'support' && (
        <section>
          <h2>Pharmacy, lab, billing</h2>
          <h3>Pharmacy</h3>
          <p>
            Open <Link to="/pharmacy?tab=prescriptions" className="text-blue-600">Pharmacy → Prescriptions</Link>.
            Dispense the doctor’s list. Stock falls when you dispense. Counter sale is only for medicines without an OP Rx.
          </p>
          <h3>Lab</h3>
          <p>
            <Link to="/lab" className="text-blue-600">Lab Orders</Link>: collect sample → processing → enter results →
            {' '}<Link to="/lab?tab=reports" className="text-blue-600">Lab Reports</Link> print.
          </p>
          <h3>Billing</h3>
          <p>
            Never type a package amount with empty lines. Select the patient; the software loads consultation, medicines, lab, room, and services that were already logged.
          </p>
        </section>
      )}

      {tab === 'roles' && (
        <section>
          <h2>Who uses which screen</h2>
          <table>
            <thead>
              <tr>
                <th>Role</th>
                <th>Uses</th>
                <th>Does not</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Reception</td>
                <td>Patients, OP, Appointments, IP admit/discharge desk</td>
                <td>Enter lab results or change stock</td>
              </tr>
              <tr>
                <td>Doctor</td>
                <td>Doctor Queue, consult, IP rounds, Rx, lab orders</td>
                <td>Collect cash</td>
              </tr>
              <tr>
                <td>Nurse</td>
                <td>Nurse Station, vitals, handover, ward meds</td>
                <td>Create new UHID (ask reception)</td>
              </tr>
              <tr>
                <td>Pharmacist</td>
                <td>Pharmacy, stock, sometimes billing</td>
                <td>Discharge a patient</td>
              </tr>
              <tr>
                <td>Lab technician</td>
                <td>Lab orders and reports</td>
                <td>Admit or discharge</td>
              </tr>
              <tr>
                <td>Cashier / Accountant</td>
                <td>Billing only</td>
                <td>Change clinical notes</td>
              </tr>
              <tr>
                <td>Admin</td>
                <td>Masters, staff, reports, branding</td>
                <td>Share the Super Admin login</td>
              </tr>
              <tr>
                <td>Biomedical</td>
                <td>Assets, complaints, BEMS</td>
                <td>Open patient clinical files</td>
              </tr>
            </tbody>
          </table>
          <h3>Wrong vs right</h3>
          <table>
            <thead>
              <tr><th>Wrong</th><th>Right</th></tr>
            </thead>
            <tbody>
              <tr><td>New file every visit</td><td>One UHID forever — search first</td></tr>
              <tr><td>Collect money, then invent bill lines</td><td>Log work, then bill pulls charges</td></tr>
              <tr><td>Admit without a bed</td><td>Admission requires a free bed</td></tr>
              <tr><td>Discharge, then add O2/medicines</td><td>Log during stay → bill → discharge</td></tr>
              <tr><td>Shared logins</td><td>One person, one role</td></tr>
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
