import { Router } from 'express';
import { prisma } from '../../db/client';
import { asyncHandler, HttpError } from '../../utils/http';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission, resolvePermission } from '../../utils/permissions';
import { unpackField } from '../../utils/crypto';
import { auditLog } from '../../utils/audit';

const router = Router();
router.use(authenticate);

async function assertParticipant(roomId: string, userId: string): Promise<void> {
  const p = await prisma.chatParticipant.findUnique({
    where: { roomId_userId: { roomId, userId } },
  });
  if (!p) throw new HttpError(403, 'Kein Teilnehmer dieses Chats');
}

// GET /chat/rooms – eigene Räume
router.get(
  '/rooms',
  requirePermission('canUseChat'),
  asyncHandler(async (req, res) => {
    const rooms = await prisma.chatRoom.findMany({
      where: { participants: { some: { userId: req.user!.id } } },
      include: { participants: { include: { user: { select: { id: true, name: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(
      rooms.map((r) => ({
        id: r.id,
        name: r.name,
        type: r.type,
        participants: r.participants.map((p) => ({ id: p.user.id, name: p.user.name })),
      })),
    );
  }),
);

// POST /chat/rooms – direct oder group
router.post(
  '/rooms',
  requirePermission('canUseChat'),
  asyncHandler(async (req, res) => {
    const type: string = req.body.type === 'group' ? 'group' : 'direct';
    const participantIds: string[] = Array.isArray(req.body.participantIds) ? req.body.participantIds : [];
    const needed = type === 'group' ? 'canStartGroupChat' : 'canStartDirectChat';
    if (!(await resolvePermission(req.user!.id, needed))) {
      throw new HttpError(403, `Fehlendes Recht: ${needed}`);
    }
    const ids = Array.from(new Set([req.user!.id, ...participantIds]));
    if (ids.length < 2) throw new HttpError(400, 'Mindestens ein weiterer Teilnehmer erforderlich');

    const room = await prisma.chatRoom.create({
      data: {
        type,
        name: type === 'group' ? req.body.name ?? null : null,
        participants: { create: ids.map((userId) => ({ userId })) },
      },
    });
    res.status(201).json({ id: room.id, type: room.type });
  }),
);

// GET /chat/rooms/:id/messages
router.get(
  '/rooms/:id/messages',
  requirePermission('canUseChat'),
  asyncHandler(async (req, res) => {
    await assertParticipant(req.params.id, req.user!.id);
    const messages = await prisma.chatMessage.findMany({
      where: { roomId: req.params.id },
      include: { sender: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    const out = await Promise.all(
      messages.map(async (m) => ({
        id: m.id,
        senderId: m.senderId,
        senderName: m.sender.name,
        body: m.deletedAt ? null : await unpackField(m.bodyEnc),
        deleted: !!m.deletedAt,
        createdAt: m.createdAt,
      })),
    );
    res.json(out);
  }),
);

// DELETE /chat/messages/:id – Moderation
router.delete(
  '/messages/:id',
  requirePermission('canModerateChat'),
  asyncHandler(async (req, res) => {
    await prisma.chatMessage.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date(), deletedBy: req.user!.id },
    });
    await auditLog('DELETE_CHAT_MESSAGE', req.user!.id, req.params.id, 'chat_message');
    res.json({ ok: true });
  }),
);

export default router;
