import api from './api';

const fmt = (d) => {
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toISOString().slice(0, 10);
};

const reportsApi = {
  getSummary: (from, to) =>
    api.get(`/reports/summary?from=${fmt(from)}&to=${fmt(to)}`).then((r) => r.data.data),
  getDetailed: (from, to, page = 1, limit = 10) =>
    api
      .get(`/reports/detailed?from=${fmt(from)}&to=${fmt(to)}&page=${page}&limit=${limit}`)
      .then((r) => r.data),
  getAuditSection: (section, { from, to, q, module, action, user, status, page, limit } = {}) => {
    const params = new URLSearchParams({
      from: fmt(from),
      to: fmt(to),
    });
    if (q) params.set('q', q);
    if (module) params.set('module', module);
    if (action) params.set('action', action);
    if (user) params.set('user', user);
    if (status) params.set('status', status);
    if (page) params.set('page', page);
    if (limit) params.set('limit', limit);
    return api.get(`/reports/audit/${section}?${params}`).then((r) => r.data.data);
  },
};

export default reportsApi;
