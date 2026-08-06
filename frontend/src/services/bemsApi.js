/**
 * Biomedical Engineering API client
 */
import api from './api';

const bems = {
  dashboard: () => api.get('/bems/dashboard'),
  timeline: (id) => api.get(`/bems/equipment/${id}/timeline`),
  byQr: (code) => api.get(`/bems/qr/${encodeURIComponent(code)}`),

  listPm: (params) => api.get('/bems/pm', { params }),
  schedulePm: (body) => api.post('/bems/pm', body),
  completePm: (id, body) => api.put(`/bems/pm/${id}/complete`, body),

  listCalibrations: (params) => api.get('/bems/calibrations', { params }),
  createCalibration: (body) => api.post('/bems/calibrations', body),

  listElectricalSafety: (params) => api.get('/bems/electrical-safety', { params }),
  createElectricalSafety: (body) => api.post('/bems/electrical-safety', body),

  listWorkOrders: (params) => api.get('/bems/work-orders', { params }),
  createWorkOrder: (body) => api.post('/bems/work-orders', body),
  updateWorkOrder: (id, body) => api.put(`/bems/work-orders/${id}`, body),

  listSpares: (params) => api.get('/bems/spares', { params }),
  createSpare: (body) => api.post('/bems/spares', body),
  updateSpare: (id, body) => api.put(`/bems/spares/${id}`, body),
  adjustSpare: (id, body) => api.post(`/bems/spares/${id}/adjust`, body),

  listVendors: () => api.get('/bems/vendors'),
  createVendor: (body) => api.post('/bems/vendors', body),
  updateVendor: (id, body) => api.put(`/bems/vendors/${id}`, body),

  listContracts: (params) => api.get('/bems/contracts', { params }),
  createContract: (body) => api.post('/bems/contracts', body),
  updateContract: (id, body) => api.put(`/bems/contracts/${id}`, body),

  listMovements: (params) => api.get('/bems/movements', { params }),
  createMovement: (body) => api.post('/bems/movements', body),

  advanceLifecycle: (id, body) => api.post(`/bems/equipment/${id}/lifecycle`, body),
  addDocument: (id, body) => api.post(`/bems/equipment/${id}/documents`, body),

  listChecklists: (params) => api.get('/bems/checklists', { params }),
  createChecklist: (body) => api.post('/bems/checklists', body),

  reports: (type) => api.get('/bems/reports', { params: { type } }),
  seedDefaults: () => api.post('/bems/seed-defaults'),
};

export default bems;
