import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Trash2, Plus, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../common/Modal';
import LoadingSpinner from '../common/LoadingSpinner';
import patientProfileApi from '../../services/patientProfileApi';

export default function DocumentVault({ patientId, data, isLoading }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ category: '', title: '', fileUrl: '', notes: '' });
  const qc = useQueryClient();

  const uploadMut = useMutation({
    mutationFn: () => patientProfileApi.uploadDocument(patientId, form),
    onSuccess: () => {
      toast.success('Document added');
      qc.invalidateQueries({ queryKey: ['patientProfile', 'documents', patientId] });
      setShowAdd(false);
      setForm({ category: '', title: '', fileUrl: '', notes: '' });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (docId) => patientProfileApi.deleteDocument(patientId, docId),
    onSuccess: () => {
      toast.success('Document removed');
      qc.invalidateQueries({ queryKey: ['patientProfile', 'documents', patientId] });
    },
  });

  if (isLoading) return <LoadingSpinner />;

  const documents = data?.data || [];
  const categories = data?.categories || [];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">Document History</h3>
        <button onClick={() => setShowAdd(true)} className="btn-primary text-sm py-1.5">
          <Plus size={14} /> Add Document
        </button>
      </div>

      {documents.length === 0 ? (
        <p className="text-center text-gray-400 py-10">No documents uploaded yet</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {documents.map((d) => (
            <div key={d._id} className="border border-gray-100 dark:border-gray-700 rounded-xl p-3 relative group">
              <div className="flex items-center gap-2 mb-2">
                <FileText size={16} className="text-blue-500" />
                <span className="badge-gray text-[10px]">{d.category}</span>
              </div>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{d.title}</p>
              <p className="text-xs text-gray-400">{new Date(d.createdAt).toLocaleDateString('en-IN')} • {d.uploadedBy?.name}</p>
              <div className="flex items-center gap-2 mt-2">
                <a href={d.fileUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 flex items-center gap-1"><ExternalLink size={11} /> View</a>
                <button onClick={() => deleteMut.mutate(d._id)} className="text-xs text-red-500 flex items-center gap-1 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                  <Trash2 size={11} /> Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add Document" size="md">
        <form onSubmit={(e) => { e.preventDefault(); uploadMut.mutate(); }} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Category *</label>
            <select required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="input-field">
              <option value="">Select category</option>
              {categories.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title *</label>
            <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="input-field" placeholder="e.g. Aadhaar Card - Front" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">File URL *</label>
            <input required value={form.fileUrl} onChange={(e) => setForm({ ...form, fileUrl: e.target.value })} className="input-field" placeholder="https://..." />
            <p className="text-xs text-gray-400 mt-1">Paste a Cloudinary / storage link. Direct file picker upload can be wired to your existing Cloudinary config.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input-field" rows={2} />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setShowAdd(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={uploadMut.isPending} className="btn-primary">{uploadMut.isPending ? 'Saving...' : 'Save Document'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
