import api from './api';

export const getBranding = () => api.get('/branding').then((r) => r.data.data);

export const updateBranding = (data) => api.put('/branding', data).then((r) => r.data.data);
