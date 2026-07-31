import api from './api';

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
  getDocuments: (id, category) => api.get(`${base(id)}/documents${category ? `?category=${category}` : ''}`).then((r) => r.data),
  uploadDocument: (id, payload) => api.post(`${base(id)}/documents`, payload).then((r) => r.data.data),
  deleteDocument: (id, docId) => api.delete(`${base(id)}/documents/${docId}`).then((r) => r.data.data),
  getAlerts: (id) => api.get(`${base(id)}/alerts`).then((r) => r.data.data),
  getAuditHistory: (id) => api.get(`${base(id)}/audit-history`).then((r) => r.data.data),
};

export default patientProfileApi;
