import { Router } from 'express';
import { prisma } from '../../db/client';
import { asyncHandler, HttpError } from '../../utils/http';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../utils/permissions';
import { packField, unpackField } from '../../utils/crypto';

const router = Router();
router.use(authenticate);

function parseJsonArray(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// GET /messages – nur für den Nutzer relevante, nicht ausgeblendete Nachrichten
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const role = req.user!.role;
    const messages = await prisma.systemMessage.findMany({
      where: { isActive: true },
      include: { dismissals: { where: { userId } } },
      orderBy: { createdAt: 'desc' },
    });
    const visible = messages.filter((m) => {
      if (m.dismissals.length > 0) return false;
      const roles = parseJsonArray(m.targetRoles);
      const users = parseJsonArray(m.targetUsers);
      if (roles.includes('all')) return true;
      if (roles.includes(role)) return true;
      if (users.includes(userId)) return true;
      return roles.length === 0 && users.length === 0;
    });
    const out = await Promise.all(
      visible.map(async (m) => ({
        id: m.id,
        title: await unpackField(m.titleEnc),
        body: await unpackField(m.bodyEnc),
        createdAt: m.createdAt,
      })),
    );
    res.json(out);
  }),
);

// POST /messages
router.post(
  '/',
  requirePermission('canManageSystemMessages'),
  asyncHandler(async (req, res) => {
    const { title, body } = req.body as { title?: string; body?: string };
    if (!title || !body) throw new HttpError(400, 'title und body erforderlich');
    const [titleEnc, bodyEnc] = await Promise.all([packField(title), packField(body)]);
    const msg = await prisma.systemMessage.create({
      data: {
        titleEnc: titleEnc as string,
        bodyEnc: bodyEnc as string,
        targetRoles: JSON.stringify(req.body.targetRoles ?? ['all']),
        targetUsers: JSON.stringify(req.body.targetUsers ?? []),
        createdBy: req.user!.id,
      },
    });
    res.status(201).json({ id: msg.id });
  }),
);

// PATCH /messages/:id
router.patch(
  '/:id',
  requirePermission('canManageSystemMessages'),
  asyncHandler(async (req, res) => {
    const data: Record<string, unknown> = {};
    if (typeof req.body.title === 'string') data.titleEnc = await packField(req.body.title);
    if (typeof req.body.body === 'string') data.bodyEnc = await packField(req.body.body);
    if (req.body.targetRoles) data.targetRoles = JSON.stringify(req.body.targetRoles);
    if (req.body.targetUsers) data.targetUsers = JSON.stringify(req.body.targetUsers);
    if (typeof req.body.isActive === 'boolean') data.isActive = req.body.isActive;
    const msg = await prisma.systemMessage.update({ where: { id: req.params.id }, data });
    res.json({ id: msg.id });
  }),
);

// DELETE /messages/:id
router.delete(
  '/:id',
  requirePermission('canManageSystemMessages'),
  asyncHandler(async (req, res) => {
    await prisma.systemMessage.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  }),
);

// POST /messages/:id/dismiss
router.post(
  '/:id/dismiss',
  asyncHandler(async (req, res) => {
    await prisma.userMessageDismissal.upsert({
      where: { userId_messageId: { userId: req.user!.id, messageId: req.params.id } },
      update: {},
      create: { userId: req.user!.id, messageId: req.params.id },
    });
    res.json({ ok: true });
  }),
);

export default router;
