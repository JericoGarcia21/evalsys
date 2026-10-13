import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const subjectId = localStorage.getItem('evalsys_current_subject_id');
  if (subjectId && config.headers['x-subject-id'] === undefined) {
    config.headers['x-subject-id'] = subjectId;
  }
  const instructorId = localStorage.getItem('evalsys_current_instructor_id');
  if (instructorId && config.headers['x-instructor-id'] === undefined) {
    config.headers['x-instructor-id'] = instructorId;
  }
  return config;
});

const detectBackendUpdate = (version: unknown) => {
  if (typeof version !== 'string' || !version) return;
  const key = 'evalsys_backend_version';
  try {
    const previous = localStorage.getItem(key);
    localStorage.setItem(key, version);
    if (previous && previous !== version) {
      window.dispatchEvent(new Event('evalsys:backend-updated'));
    }
  } catch {
    // Storage can be unavailable in restricted browser sessions.
  }
};

api.interceptors.response.use(
  (res) => {
    detectBackendUpdate(res.headers['x-evalsys-version']);
    return res;
  },
  (err) => {
    detectBackendUpdate(err.response?.headers?.['x-evalsys-version']);
    if (err.response?.status === 503 && err.response?.data?.maintenanceMode) {
      window.dispatchEvent(new CustomEvent('evalsys:maintenance-mode', {
        detail: {
          message: err.response.data.message,
        },
      }));
    }
    if (err.response?.status === 401 && !err.config.url?.includes('/auth/login')) {
      localStorage.removeItem('token');
      // Dispatch an event so the app can handle navigation via React Router
      // instead of a hard browser redirect that bypasses router state.
      window.dispatchEvent(new CustomEvent('evalsys:unauthorized'));
    }
    return Promise.reject(err);
  }
);

export default api;
