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

let lastToastKey = '';
let lastToastAt = 0;

const isTimeoutError = (error) => {
  const raw =
    error.response?.data?.message ||
    error.message ||
    '';
  return (
    error.code === 'ECONNABORTED' ||
    error.code === 'ETIMEDOUT' ||
    /timeout of \d+ms exceeded/i.test(raw)
  );
};

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (isTimeoutError(error)) {
      error.message = 'Could not reach the server. Please try again.';
      if (error.response?.data && typeof error.response.data === 'object') {
        error.response.data.message = error.message;
      }
      return Promise.reject(error);
    }

    const message =
      error.response?.data?.message ||
      error.message ||
      'Something went wrong';

    if (error.response?.status === 401) {
      const url = error.config?.url || '';
      if (!url.includes('/auth/login')) {
        localStorage.removeItem('hms_token');
        window.dispatchEvent(new Event('hms:unauthorized'));
      }
    } else if (!error.config?.skipErrorToast) {
      // Avoid double toasts (React Strict Mode / parallel 403s)
      const key = `${error.response?.status || ''}:${message}`;
      const now = Date.now();
      if (key !== lastToastKey || now - lastToastAt > 2500) {
        lastToastKey = key;
        lastToastAt = now;
        toast.error(message);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
