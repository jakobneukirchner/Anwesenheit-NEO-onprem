import { Router } from 'express';
import { prisma } from '../../db/client';
import { asyncHandler, HttpError } from '../../utils/http';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../utils/permissions';
import { auditLog } from '../../utils/audit';

const router = Router();
router.use(authenticate);

// GET /badges?userId= – Badges eines Nutzers (oder eigene)
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = (req.query.userId as string | undefined) ?? req.user!.id;
    const badges = await prisma.badge.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(badges.map((b) => ({ id: b.id, badge: b.badge, assignedBy: b.assignedBy, createdAt: b.createdAt })));
  }),
);

// POST /badges – Badge zuweisen
router.post(
  '/',
  requirePermission('canAssignBadges'),
  asyncHandler(async (req, res) => {
    const { userId, badge } = req.body as { userId?: string; badge?: string };
    if (!userId || !badge) throw new HttpError(400, 'userId und badge erforderlich');

    const created = await prisma.badge.upsert({
      where: { userId_badge: { userId, badge } },
      update: { assignedBy: req.user!.id },
      create: { userId, badge, assignedBy: req.user!.id },
    });
    await auditLog('ASSIGN_BADGE', req.user!.id, userId, 'user', { badge });
    res.status(201).json({ id: created.id, badge: created.badge });
  }),
);

// DELETE /badges/:id – Badge entfernen
router.delete(
  '/:id',
  requirePermission('canAssignBadges'),
  asyncHandler(async (req, res) => {
    await prisma.badge.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  }),
);

export default router;
