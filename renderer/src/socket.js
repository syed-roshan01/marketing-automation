import { io } from 'socket.io-client';

const API_BASE = import.meta.env.VITE_API_BASE || window.location.origin;

const socket = io(API_BASE, {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    reconnectionAttempts: 10,
    reconnectionDelay: 2000,
});

export default socket;
