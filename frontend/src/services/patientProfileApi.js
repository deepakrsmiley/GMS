import api from './api';

const token = () => localStorage.getItem('hms_token');

export const documentFileUrl = (patientId, doc, { download = false } = {}) => {
  if (!patientId || !doc?._id) return doc?.fileUrl || '';
  if (doc.hasSecureFile || (doc.fileUrl && String(doc.fileUrl).startsWith('/api/'))) {
    const qs = download ? '?download=1' : '';
    return `/api/patients/${patientId}/profile/documents/${doc._id}/file${qs}`;
  }
  return doc.fileUrl || '';
};

export async function fetchProtectedBlob(url) {
  const res = await fetch(url, {
    headers: token() ? { Authorization: `Bearer ${token()}` } : {},
    credentials: 'include',
  });
  if (!res.ok) {
    const message = (await res.json().catch(() => ({})))?.message || 'Could not load the document';
    throw new Error(message);
  }
  return res.blob();
}

const scanFormRequest = async (url, formData) => {
  const auth = token();
  const res = await fetch(`/api${url.startsWith('/') ? url : `/${url}`}`, {
    method: 'POST',
    headers: auth ? { Authorization: `Bearer ${auth}` } : {},
    credentials: 'include',
    body: formData,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.message || 'Could not save the prescription');
    err.response = { data: json, status: res.status };
    throw err;
  }
  return json;
};

const base = (id) => `/patients/${id}/profile`;

const patientProfileApi = {
  getSummary: (id) => api.get(`${base(id)}/summary`).then((r) => r.data.data),
  getTimeline: (id) => api.get(`${base(id)}/timeline`).then((r) => r.data.data),
  getOPHistory: (id) => api.get(`${base(id)}/op-history`).then((r) => r.data.data),
  getIPHistory: (id) => api.get(`${base(id)}/ip-history`).then((r) => r.data.data),
  getAdmissionDetail: (id, admissionId) => api.get(`${base(id)}/ip-history/${admissionId}`).then((r) => r.data.data),
  getRoomHistory: (id) => api.get(`${base(id)}/room-history`).then((r) => r.data.data),
  getDoctorHistory: (id) => api.get(`${base(id)}/doctor-history`).then((r) => r.data.data),
  getMedicineHistory: (id) => api.get(`${base(id)}/medicine-history`).then((r) => r.data.data),
  getLabHistory: (id, type) => api.get(`${base(id)}/lab-history${type ? `?type=${type}` : ''}`).then((r) => r.data.data),
  getProcedureHistory: (id) => api.get(`${base(id)}/procedure-history`).then((r) => r.data.data),
  getMachineHistory: (id) => api.get(`${base(id)}/machine-history`).then((r) => r.data.data),
  getOperationHistory: (id) => api.get(`${base(id)}/operation-history`).then((r) => r.data.data),
  createOperation: (id, payload) => api.post(`${base(id)}/operation-history`, payload).then((r) => r.data.data),
  getBillingHistory: (id) => api.get(`${base(id)}/billing-history`).then((r) => r.data.data),
  getPaymentHistory: (id) => api.get(`${base(id)}/payment-history`).then((r) => r.data.data),
  getDocuments: (id, category, opRegistration) => {
    const q = new URLSearchParams();
    if (category) q.set('category', category);
    if (opRegistration) q.set('opRegistration', opRegistration);
    const qs = q.toString();
    return api.get(`${base(id)}/documents${qs ? `?${qs}` : ''}`).then((r) => r.data);
  },
  uploadDocument: (id, payload) => api.post(`${base(id)}/documents`, payload).then((r) => r.data.data),
  scanPrescription: (id, formData) => scanFormRequest(`${base(id)}/documents/scan`, formData).then((r) => r.data),
  replacePrescriptionScan: (id, docId, formData) => scanFormRequest(`${base(id)}/documents/${docId}/replace`, formData).then((r) => r.data),
  deleteDocument: (id, docId) => api.delete(`${base(id)}/documents/${docId}`).then((r) => r.data.data),
  getAlerts: (id) => api.get(`${base(id)}/alerts`).then((r) => r.data.data),
  getAuditHistory: (id) => api.get(`${base(id)}/audit-history`).then((r) => r.data.data),
};

export default patientProfileApi;
