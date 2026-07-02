import { io } from 'socket.io-client';

let socket = null;

export const initSocket = (userId) => {
  if (socket) return socket;
  socket = io(window.location.origin, {
    auth: { token: localStorage.getItem('hms_token') },
    transports: ['websocket'],
  });
  socket.on('connect', () => console.log('Socket connected:', socket.id));
  socket.on('disconnect', () => console.log('Socket disconnected'));
  if (userId) socket.emit('join:room', `doctor:${userId}`);
  return socket;
};

export const getSocket = () => socket;
export const disconnectSocket = () => { if (socket) { socket.disconnect(); socket = null; } };
