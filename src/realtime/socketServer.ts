import { Server as SocketIOServer } from 'socket.io';
import type { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import { prisma } from '../db/client';
import { packField } from '../utils/crypto';
import { resolvePermission } from '../utils/permissions';

async function isParticipant(roomId: string, userId: string): Promise<boolean> {
  const p = await prisma.chatParticipant.findUnique({
    where: { roomId_userId: { roomId, userId } },
  });
  return !!p;
}

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

    socket.on('chat:join', async (roomId: string) => {
      if (await isParticipant(roomId, userId)) socket.join(`room:${roomId}`);
    });

    socket.on('chat:message', async (data: { roomId: string; body: string }) => {
      const body = typeof data?.body === 'string' ? data.body.trim() : '';
      if (!data?.roomId || !body) return;
      if (!(await resolvePermission(userId, 'canUseChat'))) return;
      if (!(await isParticipant(data.roomId, userId))) return;

      const bodyEnc = await packField(body);
      if (!bodyEnc) return;
      const message = await prisma.chatMessage.create({
        data: { roomId: data.roomId, senderId: userId, bodyEnc },
        include: { sender: { select: { id: true, name: true } } },
      });

      io.to(`room:${data.roomId}`).emit('chat:message', {
        id: message.id,
        senderId: userId,
        senderName: message.sender.name,
        roomId: data.roomId,
        body,
        createdAt: message.createdAt,
      });
    });

    socket.on('chat:typing', async (data: { roomId: string }) => {
      if (!data?.roomId) return;
      if (!(await isParticipant(data.roomId, userId))) return;
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
