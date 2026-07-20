import { Server as SocketIOServer } from 'socket.io';
import type { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';

let io: SocketIOServer;

export function initSocketServer(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: { origin: process.env.APP_URL ?? '*', credentials: true },
  });

  // JWT-Auth-Guard für WebSocket-Verbindungen
  io.use((socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.cookie
        ?.split(';')
        .find((c: string) => c.trim().startsWith('accessToken='))
        ?.split('=')
        .slice(1)
        .join('=');

    if (!token) return next(new Error('Unauthorized'));

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as { id: string; role: string };
      socket.data.userId = payload.id;
      socket.data.role = payload.role;
      socket.join(`user:${payload.id}`);
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const { userId } = socket.data;

    socket.on('chat:join', (roomId: string) => {
      socket.join(`room:${roomId}`);
    });

    socket.on('chat:message', async (data: { roomId: string; body: string }) => {
      io.to(`room:${data.roomId}`).emit('chat:message', {
        senderId: userId,
        roomId: data.roomId,
        body: data.body,
        createdAt: new Date(),
      });
    });

    socket.on('chat:typing', (data: { roomId: string }) => {
      socket.to(`room:${data.roomId}`).emit('chat:typing', { userId });
    });

    socket.on('disconnect', () => {
      socket.leave(`user:${userId}`);
    });
  });

  return io;
}

export function getIO(): SocketIOServer {
  if (!io) throw new Error('Socket.IO nicht initialisiert');
  return io;
}
