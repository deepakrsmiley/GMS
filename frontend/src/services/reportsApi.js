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
  getAuditSection: (section, { from, to } = {}) =>
    api
      .get(`/reports/audit/${section}?from=${fmt(from)}&to=${fmt(to)}`)
      .then((r) => r.data.data),
};

export default reportsApi;
