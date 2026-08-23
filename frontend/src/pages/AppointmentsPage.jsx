import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import {
  Calendar, Plus, Search, UserPlus, Printer, Check, Ban,
  Clock, Stethoscope, Building2, Phone, RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import Modal from '../components/common/Modal';
import { hasPermission } from '../constants/permissions';

const STATUS_STYLES = {
  scheduled: 'badge-blue',
  confirmed: 'badge-green',
  waiting: 'badge-yellow',
  in_progress: 'badge-yellow',
  completed: 'badge-gray',
  cancelled: 'badge-red',
  no_show: 'badge-red',
};

const TIME_SLOTS = [
  '09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
  '12:00 PM', '12:30 PM',
  '04:00 PM', '04:30 PM', '05:00 PM', '05:30 PM', '06:00 PM', '06:30 PM',
  '07:00 PM', '07:30 PM',
];

const todayStr = () => new Date().toISOString().slice(0, 10);

const EMPTY_FORM = {
  patient: '',
  doctor: '',
  department: '',
  appointmentDate: todayStr(),
  appointmentTime: '10:00 AM',
  type: 'new',
  reason: '',
  notes: '',
};

export default function AppointmentsPage() {
  const { user } = useSelector((s) => s.auth);
  const canBook = hasPermission(user, 'CREATE_APPOINTMENT');
  const qc = useQueryClient();

  const [dateFilter, setDateFilter] = useState(todayStr());
  const [statusFilter, setStatusFilter] = useState('');
  const [doctorFilter, setDoctorFilter] = useState(user?.role === 'Doctor' ? (user?.id || user?._id || '') : '');
  const [page, setPage] = useState(1);
  const [showBook, setShowBook] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [patientSearch, setPatientSearch] = useState('');
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [doctors, setDoctors] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [quickForm, setQuickForm] = useState({ name: '', phone: '', age: '', gender: '' });
  const [cancelId, setCancelId] = useState(null);
  const [cancelReason, setCancelReason] = useState('');

  useEffect(() => {
    api.get('/staff/doctors').then((r) => setDoctors(r.data.data || [])).catch(() => {});
    api.get('/departments').then((r) => setDepartments(r.data.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (patientSearch.length < 2 || form.patient) {
      setPatients([]);
      return undefined;
    }
    const t = setTimeout(() => {
      api.get(`/patients/search?q=${encodeURIComponent(patientSearch)}`)
        .then((r) => setPatients(r.data.data || []))
        .catch(() => setPatients([]));
    }, 250);
    return () => clearTimeout(t);
  }, [patientSearch, form.patient]);

  const queryKey = ['appointments', dateFilter, statusFilter, doctorFilter, page];

  const { data, isLoading, refetch } = useQuery({
    queryKey,
    queryFn: () => {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '20');
      if (dateFilter) params.set('date', dateFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (doctorFilter) params.set('doctor', doctorFilter);
      return api.get(`/appointments?${params}`).then((r) => r.data);
    },
  });

  const { data: stats } = useQuery({
    queryKey: ['appointmentStats'],
    queryFn: () => api.get('/appointments/stats/today').then((r) => r.data.data),
  });

  const bookMut = useMutation({
    mutationFn: (payload) => api.post('/appointments', payload),
    onSuccess: () => {
      toast.success('Appointment booked successfully');
      qc.invalidateQueries(['appointments']);
      qc.invalidateQueries(['appointmentStats']);
      closeBook();
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Failed to book appointment'),
  });

  const cancelMut = useMutation({
    mutationFn: ({ id, reason }) => api.put(`/appointments/${id}/cancel`, { cancelReason: reason }),
    onSuccess: () => {
      toast.success('Appointment cancelled');
      qc.invalidateQueries(['appointments']);
      qc.invalidateQueries(['appointmentStats']);
      setCancelId(null);
      setCancelReason('');
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Cancel failed'),
  });

  const confirmMut = useMutation({
    mutationFn: (id) => api.put(`/appointments/${id}/confirm`),
    onSuccess: () => {
      toast.success('Appointment confirmed');
      qc.invalidateQueries(['appointments']);
      qc.invalidateQueries(['appointmentStats']);
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Confirm failed'),
  });

  const quickAddMut = useMutation({
    mutationFn: (d) => api.post('/patients', { ...d, age: Number(d.age) }),
    onSuccess: (r) => {
      const p = r.data.data;
      toast.success(`Patient registered — UHID ${p.patientId}`);
      pickPatient(p);
      setShowQuickAdd(false);
      setQuickForm({ name: '', phone: '', age: '', gender: '' });
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Failed to add patient'),
  });

  const pickPatient = (p) => {
    setForm((f) => ({ ...f, patient: p._id }));
    setSelectedPatient(p);
    setPatientSearch(`${p.name} (${p.patientId})`);
    setPatients([]);
  };

  const closeBook = () => {
    setShowBook(false);
    setForm(EMPTY_FORM);
    setPatientSearch('');
    setSelectedPatient(null);
    setPatients([]);
  };

  const openBook = () => {
    setForm({ ...EMPTY_FORM, appointmentDate: dateFilter || todayStr() });
    setShowBook(true);
  };

  const onDoctorChange = (doctorId) => {
    const doc = doctors.find((d) => d._id === doctorId);
    setForm((f) => ({
      ...f,
      doctor: doctorId,
      department: doc?.department?._id || doc?.department || f.department,
    }));
  };

  const handleBook = () => {
    if (!form.patient) return toast.error('Select a patient');
    if (!form.doctor) return toast.error('Select a doctor');
    if (!form.appointmentDate) return toast.error('Select a date');
    if (!form.appointmentTime) return toast.error('Select a time');
    bookMut.mutate({
      patient: form.patient,
      doctor: form.doctor,
      department: form.department || undefined,
      appointmentDate: form.appointmentDate,
      appointmentTime: form.appointmentTime,
      type: form.type,
      reason: form.reason,
      notes: form.notes,
    });
  };

  const printSlip = async (id) => {
    try {
      const res = await api.get(`/appointments/${id}/print`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      window.open(url, '_blank');
    } catch {
      toast.error('Could not print appointment slip');
    }
  };

  const filteredDoctors = useMemo(() => {
    if (!form.department) return doctors;
    return doctors.filter((d) => (d.department?._id || d.department) === form.department);
  }, [doctors, form.department]);

  const rows = data?.data || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Appointments</h1>
          <p className="text-sm text-gray-500 mt-1">Book and manage patient appointments</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => refetch()} className="btn-secondary">
            <RefreshCw size={15} /> Refresh
          </button>
          {canBook && (
            <button type="button" onClick={openBook} className="btn-primary">
              <Plus size={16} /> Book Appointment
            </button>
          )}
        </div>
      </div>

      {/* Today stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Today Total', value: stats?.total ?? 0, color: 'text-blue-600' },
          { label: 'Scheduled', value: stats?.scheduled ?? 0, color: 'text-indigo-600' },
          { label: 'Confirmed', value: stats?.confirmed ?? 0, color: 'text-emerald-600' },
          { label: 'Completed', value: stats?.completed ?? 0, color: 'text-slate-600' },
          { label: 'Cancelled', value: stats?.cancelled ?? 0, color: 'text-red-600' },
        ].map((s) => (
          <div key={s.label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4 text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Date</label>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => { setDateFilter(e.target.value); setPage(1); }}
            className="input-field"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Status</label>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="input-field">
            <option value="">All statuses</option>
            <option value="scheduled">Scheduled</option>
            <option value="confirmed">Confirmed</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="no_show">No Show</option>
          </select>
        </div>
        {user?.role !== 'Doctor' && (
          <div className="min-w-[200px]">
            <label className="text-xs text-gray-500 block mb-1">Doctor</label>
            <select value={doctorFilter} onChange={(e) => { setDoctorFilter(e.target.value); setPage(1); }} className="input-field">
              <option value="">All doctors</option>
              {doctors.map((d) => <option key={d._id} value={d._id}>Dr. {d.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* List */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-gray-400">Loading appointments...</div>
        ) : rows.length === 0 ? (
          <div className="p-12 flex flex-col items-center gap-3 text-gray-400">
            <Calendar size={48} className="text-blue-200" />
            <p className="font-semibold text-gray-600">No appointments for this date</p>
            {canBook && (
              <button type="button" onClick={openBook} className="btn-primary mt-2">
                <Plus size={16} /> Book first appointment
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  {['UHID', 'Patient', 'Doctor', 'Dept', 'Date', 'Time', 'Type', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a._id} className="border-t border-slate-100 hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-mono font-semibold text-blue-700">{a.patient?.patientId || '—'}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{a.patient?.name}</p>
                      <p className="text-xs text-slate-400">{a.patient?.phone || ''}</p>
                    </td>
                    <td className="px-4 py-3">Dr. {a.doctor?.name || '—'}</td>
                    <td className="px-4 py-3">{a.department?.name || '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {a.appointmentDate ? new Date(a.appointmentDate).toLocaleDateString('en-GB') : '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{a.appointmentTime || '—'}</td>
                    <td className="px-4 py-3 capitalize">{a.type}</td>
                    <td className="px-4 py-3">
                      <span className={STATUS_STYLES[a.status] || 'badge-gray'}>{a.status?.replace('_', ' ')}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        <button type="button" onClick={() => printSlip(a._id)} className="text-xs px-2 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 inline-flex items-center gap-1">
                          <Printer size={12} /> Print
                        </button>
                        {canBook && a.status === 'scheduled' && (
                          <button type="button" onClick={() => confirmMut.mutate(a._id)} className="text-xs px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 inline-flex items-center gap-1">
                            <Check size={12} /> Confirm
                          </button>
                        )}
                        {canBook && !['cancelled', 'completed'].includes(a.status) && (
                          <button type="button" onClick={() => setCancelId(a._id)} className="text-xs px-2 py-1 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 inline-flex items-center gap-1">
                            <Ban size={12} /> Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {(data?.pages || 1) > 1 && (
          <div className="flex justify-between items-center px-4 py-3 border-t border-slate-100 text-sm">
            <span className="text-slate-500">Page {data.page} of {data.pages} · {data.total} total</span>
            <div className="flex gap-2">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="btn-secondary text-xs disabled:opacity-40">Prev</button>
              <button type="button" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)} className="btn-secondary text-xs disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Book Appointment Modal */}
      <Modal isOpen={showBook} onClose={closeBook} title="Book Appointment" size="lg">
        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">Patient *</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={patientSearch}
                  onChange={(e) => {
                    setPatientSearch(e.target.value);
                    setForm((f) => ({ ...f, patient: '' }));
                    setSelectedPatient(null);
                  }}
                  placeholder="Search by name, UHID or phone"
                  className="input-field pl-9"
                />
                {patients.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {patients.map((p) => (
                      <button key={p._id} type="button" onClick={() => pickPatient(p)}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 border-b border-slate-50 last:border-0">
                        <span className="font-medium">{p.name}</span>
                        <span className="text-slate-400 ml-2">{p.patientId} · {p.phone}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button type="button" onClick={() => setShowQuickAdd(true)} className="btn-secondary whitespace-nowrap">
                <UserPlus size={15} /> New
              </button>
            </div>
            {selectedPatient && (
              <p className="text-xs text-emerald-700 mt-1.5">
                Selected: {selectedPatient.name} · UHID {selectedPatient.patientId}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">Department</label>
              <div className="relative">
                <Building2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <select
                  value={form.department}
                  onChange={(e) => setForm((f) => ({ ...f, department: e.target.value, doctor: '' }))}
                  className="input-field pl-9"
                >
                  <option value="">All departments</option>
                  {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">Doctor *</label>
              <div className="relative">
                <Stethoscope size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <select
                  value={form.doctor}
                  onChange={(e) => onDoctorChange(e.target.value)}
                  className="input-field pl-9"
                >
                  <option value="">Select doctor</option>
                  {filteredDoctors.map((d) => <option key={d._id} value={d._id}>Dr. {d.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">Date *</label>
              <input
                type="date"
                min={todayStr()}
                value={form.appointmentDate}
                onChange={(e) => setForm((f) => ({ ...f, appointmentDate: e.target.value }))}
                className="input-field"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">Time *</label>
              <div className="relative">
                <Clock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <select
                  value={form.appointmentTime}
                  onChange={(e) => setForm((f) => ({ ...f, appointmentTime: e.target.value }))}
                  className="input-field pl-9"
                >
                  {TIME_SLOTS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">Type</label>
              <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className="input-field">
                <option value="new">New</option>
                <option value="followup">Follow-up</option>
                <option value="review">Review</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">Phone (patient)</label>
              <div className="relative">
                <Phone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={selectedPatient?.phone || ''} readOnly className="input-field pl-9 bg-slate-50" placeholder="Auto from patient" />
              </div>
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium text-gray-700 block mb-1.5">Reason / Chief complaint</label>
              <textarea
                rows={2}
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                className="input-field"
                placeholder="Reason for visit"
              />
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium text-gray-700 block mb-1.5">Notes</label>
              <input
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className="input-field"
                placeholder="Optional notes"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={closeBook} className="btn-secondary">Cancel</button>
            <button type="button" onClick={handleBook} disabled={bookMut.isPending} className="btn-primary">
              <Calendar size={15} /> {bookMut.isPending ? 'Booking...' : 'Book Appointment'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Quick add patient */}
      <Modal isOpen={showQuickAdd} onClose={() => setShowQuickAdd(false)} title="Add New Patient" size="md">
        <form
          onSubmit={(e) => { e.preventDefault(); quickAddMut.mutate(quickForm); }}
          className="p-6 space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Full Name *</label>
              <input required className="input-field" value={quickForm.name} onChange={(e) => setQuickForm({ ...quickForm, name: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Phone *</label>
              <input required className="input-field" value={quickForm.phone} onChange={(e) => setQuickForm({ ...quickForm, phone: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Age *</label>
              <input required type="number" min="0" className="input-field" value={quickForm.age} onChange={(e) => setQuickForm({ ...quickForm, age: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Gender *</label>
              <select required className="input-field" value={quickForm.gender} onChange={(e) => setQuickForm({ ...quickForm, gender: e.target.value })}>
                <option value="">Select</option>
                <option>Male</option>
                <option>Female</option>
                <option>Other</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t">
            <button type="button" onClick={() => setShowQuickAdd(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={quickAddMut.isPending} className="btn-primary">
              {quickAddMut.isPending ? 'Saving...' : 'Add & Select'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Cancel confirm */}
      <Modal isOpen={!!cancelId} onClose={() => setCancelId(null)} title="Cancel Appointment" size="sm">
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-600">Are you sure you want to cancel this appointment?</p>
          <textarea
            className="input-field"
            rows={2}
            placeholder="Cancel reason (optional)"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
          />
          <div className="flex gap-3">
            <button type="button" onClick={() => setCancelId(null)} className="btn-secondary flex-1 justify-center">Keep</button>
            <button
              type="button"
              disabled={cancelMut.isPending}
              onClick={() => cancelMut.mutate({ id: cancelId, reason: cancelReason })}
              className="btn-primary flex-1 justify-center bg-red-600 hover:bg-red-700"
            >
              {cancelMut.isPending ? 'Cancelling...' : 'Cancel Appointment'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
