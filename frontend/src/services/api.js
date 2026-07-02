import axios from 'axios';
import toast from 'react-hot-toast';

const api = axios.create({
baseURL: '/api',
headers: {
'Content-Type': 'application/json',
},
withCredentials: true,
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
} else if (error.response?.status !== 404) {
  toast.error(message);
}

return Promise.reject(error);

}
);

export default api;