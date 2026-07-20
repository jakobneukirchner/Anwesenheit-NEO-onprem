import { Router } from 'express';
import { prisma } from '../../db/client';
import { asyncHandler, HttpError } from '../../utils/http';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../utils/permissions';
import { packField, unpackField } from '../../utils/crypto';

const router = Router();
router.use(authenticate);

// GET /substitutions
router.get(
  '/',
  requirePermission('canManageSubstitutions'),
  asyncHandler(async (_req, res) => {
    const subs = await prisma.substitution.findMany({
      include: {
        event: { select: { id: true, title: true, startAt: true } },
        requester: { select: { id: true, name: true } },
        filler: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const out = await Promise.all(
      subs.map(async (s) => ({
        id: s.id,
        status: s.status,
        note: await unpackField(s.noteEnc),
        event: s.event,
        requester: s.requester,
        filler: s.filler,
        createdAt: s.createdAt,
      })),
    );
    res.json(out);
  }),
);

// POST /substitutions
router.post(
  '/',
  requirePermission('canManageSubstitutions'),
  asyncHandler(async (req, res) => {
    const { eventId } = req.body as { eventId?: string };
    if (!eventId) throw new HttpError(400, 'eventId erforderlich');
    const noteEnc = await packField(req.body.note);
    const sub = await prisma.substitution.create({
      data: { eventId, requesterId: req.user!.id, noteEnc, status: 'pending' },
    });
    res.status(201).json({ id: sub.id, status: sub.status });
  }),
);

// PATCH /substitutions/:id – bestätigen/ablehnen/übernehmen
router.patch(
  '/:id',
  requirePermission('canManageSubstitutions'),
  asyncHandler(async (req, res) => {
    const status: string | undefined = req.body.status;
    if (status && !['pending', 'confirmed', 'rejected'].includes(status)) {
      throw new HttpError(400, 'Ungültiger Status');
    }
    const data: Record<string, unknown> = {};
    if (status) data.status = status;
    if ('fillerId' in req.body) data.fillerId = req.body.fillerId || null;
    if (status === 'confirmed' && !('fillerId' in req.body)) data.fillerId = req.user!.id;
    const sub = await prisma.substitution.update({ where: { id: req.params.id }, data });
    res.json({ id: sub.id, status: sub.status, fillerId: sub.fillerId });
  }),
);

export default router;
