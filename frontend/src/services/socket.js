import { io } from 'socket.io-client';

let socket = null;

// The backend runs on a different origin than the frontend in both dev
// (frontend :3000/:3001, backend :8001 — see backend/.env PORT) and in
// production (Netlify frontend, https://gms-ms8j.onrender.com backend — see
// netlify.toml). Connecting to window.location.origin, as this used to do,
// silently pointed the socket at nothing and real-time updates never worked
// anywhere in the app. VITE_SOCKET_URL lets you override per-environment;
// otherwise we fall back to the known backend URLs.
const getBackendOrigin = () => {
  if (import.meta.env.VITE_SOCKET_URL) return import.meta.env.VITE_SOCKET_URL;
  if (import.meta.env.DEV) return 'http://localhost:8001';
  return 'https://gms-ms8j.onrender.com';
};

const joinUserRooms = (userId, userRole) => {
  if (!socket) return;
  socket.emit('join:room', 'hospital:chat');
  if (userId) {
    socket.emit('join:room', `doctor:${userId}`);
    socket.emit('join:room', `user:${userId}`);
  }
  if (userRole) socket.emit('join:room', `role:${userRole}`);
};

export const initSocket = (userId, userRole) => {
  if (socket) {
    // Re-join rooms if socket already exists (e.g. first call had no role)
    if (socket.connected) joinUserRooms(userId, userRole);
    return socket;
  }
  socket = io(getBackendOrigin(), {
    auth: { token: localStorage.getItem('hms_token') },
    withCredentials: true,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });
  socket.on('connect', () => {
    console.log('Socket connected:', socket.id);
    joinUserRooms(userId, userRole);
  });
  socket.on('disconnect', () => console.log('Socket disconnected'));
  socket.on('connect_error', (err) => console.warn('Socket connect_error:', err.message));
  return socket;
};

export const getSocket = () => socket;
export const disconnectSocket = () => { if (socket) { socket.disconnect(); socket = null; } };
