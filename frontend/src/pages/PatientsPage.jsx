import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Phone, Bed, Edit2, Trash2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import api from '../services/api';
import Modal from '../components/common/Modal';
import DataTable from '../components/common/DataTable';
import { hasPermission } from '../constants/permissions';
import WorkflowStrip from '../components/workflow/WorkflowStrip';
import '../styles/patients.css';

const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const genders = ['Male', 'Female', 'Other'];

const fmtDate = (v) => {
  if (!v) return '—';
  return new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export default function PatientsPage() {
  const navigate = useNavigate();
  const { user } = useSelector((s) => s.auth);
  // Driven by Users & Access feature-permission checkboxes (Patients group)
  const canAdmit = hasPermission(user, 'CREATE_IP_ADMISSION');
  const canCreate = hasPermission(user, 'CREATE_PATIENT');
  const canEdit = hasPermission(user, 'UPDATE_PATIENT');
  const canDelete = hasPermission(user, 'DELETE_PATIENT');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editPatient, setEditPatient] = useState(null);
  const [showDelete, setShowDelete] = useState(null);
  const [dupMatches, setDupMatches] = useState(null);
  const [pendingRegister, setPendingRegister] = useState(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['patients', page, search],
    queryFn: () => api.get(`/patients?page=${page}&limit=20${search ? `&search=${search}` : ''}`).then((r) => r.data),
  });

  const { register, handleSubmit, reset } = useForm();

  const closeForm = () => {
    setShowAdd(false);
    setEditPatient(null);
    reset();
  };

  const openEdit = (p) => {
    setEditPatient(p);
    reset({
      name: p.name || '',
      phone: p.phone || '',
      age: p.age ?? '',
      gender: p.gender || '',
      bloodGroup: p.bloodGroup || '',
      email: p.email || '',
      address: { street: p.address?.street || '' },
    });
    setShowAdd(true);
  };

  const createMut = useMutation({
    mutationFn: (d) => (editPatient
      ? api.put(`/patients/${editPatient._id}`, d)
      : api.post('/patients', d, { skipErrorToast: true })),
    onSuccess: () => {
      toast.success(editPatient ? 'Patient updated' : 'Patient registered');
      qc.invalidateQueries(['patients']);
      closeForm();
    },
    onError: (err, vars) => {
      const body = err.response?.data;
      if (err.response?.status === 409 && body?.code === 'DUPLICATE_PHONE') {
        setPendingRegister(vars);
        setDupMatches(body.matches || []);
        toast.error(body.message);
        return;
      }
      toast.error(body?.message || 'Failed to save patient');
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/patients/${id}`),
    onSuccess: () => {
      toast.success('Patient deleted');
      qc.invalidateQueries(['patients']);
      setShowDelete(null);
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to delete patient');
      setShowDelete(null);
    },
  });

  const columns = [
    {
      key: 'patientId',
      header: 'UHID',
      render: (r) => <span className="pt-uhid" title="Unique hospital ID">{r.patientId}</span>,
    },
    {
      key: 'name',
      header: 'Patient',
      render: (r) => (
        <div className="pt-name">
          <div className="pt-avatar">{r.name?.charAt(0) || '?'}</div>
          <div className="pt-name__text">
            <p className="pt-name__primary">{r.name}</p>
            <p className="pt-name__meta">
              {[r.age != null ? `${r.age} yrs` : null, r.gender].filter(Boolean).join(' · ') || '—'}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'phone',
      header: 'Phone',
      render: (r) => (
        <span className="pt-phone">
          <Phone size={12} strokeWidth={2} />
          {r.phone || '—'}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Registered',
      render: (r) => <span className="pt-date">{fmtDate(r.createdAt)}</span>,
    },
    ...((canAdmit || canEdit || canDelete)
      ? [{
          key: 'actions',
          header: 'Action',
          render: (r) => (
            <div className="flex items-center gap-2">
              {canAdmit && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/ip-admissions?patient=${r._id}`);
                  }}
                  className="pt-admit"
                >
                  <Bed size={12} /> Admit
                </button>
              )}
              {canEdit && (
                <button
                  type="button"
                  title="Edit patient"
                  onClick={(e) => {
                    e.stopPropagation();
                    openEdit(r);
                  }}
                  className="p-1.5 rounded-md text-slate-500 hover:text-blue-600 hover:bg-blue-50"
                >
                  <Edit2 size={14} />
                </button>
              )}
              {canDelete && (
                <button
                  type="button"
                  title="Delete patient"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDelete(r);
                  }}
                  className="p-1.5 rounded-md text-slate-500 hover:text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ),
        }]
      : []),
  ];

  const total = data?.total || 0;

  return (
    <div className="pt-shell space-y-4">
      <WorkflowStrip flow="patient" current={showAdd ? 'register' : 'search'} />
      <header className="pt-masthead">
        <div>
          <p className="pt-masthead__eyebrow">Patient Master</p>
          <h1 className="pt-masthead__title">Patients</h1>
          <p className="pt-masthead__meta">
            {total.toLocaleString('en-IN')} registered · search UHID / phone before adding a new file
          </p>
        </div>
        <div className="pt-masthead__actions">
          {canAdmit && (
            <button type="button" onClick={() => navigate('/ip-admissions')} className="pt-btn pt-btn--ghost">
              <Bed size={14} /> Admit IP
            </button>
          )}
          {canCreate && (
            <button type="button" onClick={() => { setEditPatient(null); reset(); setShowAdd(true); }} className="pt-btn pt-btn--primary">
              <Plus size={14} /> Register Patient
            </button>
          )}
        </div>
      </header>

      <section className="pt-panel">
        <div className="pt-toolbar">
          <div className="pt-search">
            <Search size={15} />
            <input
              type="search"
              placeholder="Search name, UHID, or phone…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
            <p className="pt-toolbar__hint">Always search first. Register only if this person has no UHID.</p>
        </div>
        <div className="pt-table-wrap">
          <DataTable
            columns={columns}
            data={data?.data || []}
            loading={isLoading}
            page={page}
            pages={data?.pages || 1}
            onPageChange={setPage}
            onRowClick={(row) => navigate(`/patients/${row._id}/profile`)}
          />
        </div>
      </section>

      <Modal isOpen={showAdd} onClose={closeForm} title={editPatient ? `Edit Patient — ${editPatient.patientId || editPatient.name}` : 'Register New Patient'} size="lg">
        <form
          onSubmit={handleSubmit((d) => createMut.mutate(d))}
          className="p-6 space-y-4 pt-shell"
        >
          <div className="pt-form-grid">
            <p className="pt-form-section">Identity</p>
            <div>
              <label className="pt-form-label">Full Name *</label>
              <input {...register('name', { required: true })} className="input-field" placeholder="Patient full name" />
            </div>
            <div>
              <label className="pt-form-label">Phone *</label>
              <input {...register('phone', { required: true })} className="input-field" placeholder="Mobile number" />
            </div>
            <div>
              <label className="pt-form-label">Age *</label>
              <input {...register('age', { required: true, min: 0 })} type="number" className="input-field" placeholder="Years" />
            </div>
            <div>
              <label className="pt-form-label">Gender *</label>
              <select {...register('gender', { required: true })} className="input-field">
                <option value="">Select gender</option>
                {genders.map((g) => <option key={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="pt-form-label">Blood Group</label>
              <select {...register('bloodGroup')} className="input-field">
                <option value="">Unknown</option>
                {bloodGroups.map((b) => <option key={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label className="pt-form-label">Email</label>
              <input {...register('email')} type="email" className="input-field" placeholder="Email address" />
            </div>

            <p className="pt-form-section">Contact</p>
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="pt-form-label">Address</label>
              <textarea {...register('address.street')} className="input-field" rows={2} placeholder="Street address" />
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t border-blue-100">
            <button type="button" onClick={closeForm} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={createMut.isPending} className="btn-primary">
              {createMut.isPending
                ? 'Saving…'
                : (editPatient ? 'Update Patient' : 'Register Patient')}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!showDelete} onClose={() => setShowDelete(null)} title="Delete Patient" size="sm">
        {showDelete && (
          <div className="p-6 space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Delete <strong>{showDelete.name}</strong> ({showDelete.patientId})?
              This cannot be undone. Patients with OP visits, admissions, or bills cannot be deleted.
            </p>
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowDelete(null)} className="btn-secondary flex-1 justify-center">Cancel</button>
              <button
                type="button"
                disabled={deleteMut.isPending}
                onClick={() => deleteMut.mutate(showDelete._id)}
                className="btn-primary flex-1 justify-center !bg-red-600 hover:!bg-red-700"
              >
                <Trash2 size={14} /> {deleteMut.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        )}
      </Modal>
      <Modal isOpen={!!dupMatches} onClose={() => { setDupMatches(null); setPendingRegister(null); }} title="Patient already exists" size="md">
        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-600">Use the existing UHID. Do not create a second file for the same person.</p>
          <ul className="space-y-2">
            {(dupMatches || []).map((m) => (
              <li key={m._id}>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 rounded-lg border border-blue-100 hover:bg-blue-50"
                  onClick={() => {
                    setDupMatches(null);
                    closeForm();
                    navigate(`/patients/${m._id}/profile`);
                  }}
                >
                  <strong>{m.patientId}</strong> · {m.name} · {m.phone}
                  {m.age != null ? ` · ${m.age} yrs` : ''}
                </button>
              </li>
            ))}
          </ul>
          <div className="flex gap-3">
            <button type="button" className="btn-secondary flex-1 justify-center" onClick={() => { setDupMatches(null); setPendingRegister(null); }}>
              Cancel
            </button>
            {canCreate && (
              <button
                type="button"
                className="btn-secondary flex-1 justify-center"
                onClick={() => {
                  if (!pendingRegister) return;
                  createMut.mutate({ ...pendingRegister, allowDuplicatePhone: true });
                  setDupMatches(null);
                  setPendingRegister(null);
                }}
              >
                Register anyway
              </button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
