import axios from 'axios';
import toast from 'react-hot-toast';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
  maxBodyLength: 25 * 1024 * 1024,
  maxContentLength: 25 * 1024 * 1024,
});

console.log('API BASE URL =', api.defaults.baseURL);

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('hms_token');

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message =
      error.response?.data?.message ||
      error.message ||
      'Something went wrong';

    if (error.response?.status === 401) {
      localStorage.removeItem('hms_token');

      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    } else {
      // Always show the error now — 404s were being hidden before,
      // which made failed requests look like "nothing happened".
      toast.error(message);
    }

    return Promise.reject(error);
  }
);

export default api;