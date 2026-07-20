import { Router } from 'express';
import { prisma } from '../../db/client';
import { asyncHandler, HttpError } from '../../utils/http';
import { resolvePermission } from '../../utils/permissions';
import { packField, unpackField } from '../../utils/crypto';

const router = Router();

/** Prüft, ob der anfragende Nutzer für targetUserId handeln darf. */
async function assertCanActFor(actorId: string, actorRole: string, targetUserId: string): Promise<void> {
  if (actorId === targetUserId) return;
  const isManager = await resolvePermission(actorId, 'canManageSchedule');
  if (isManager || actorRole === 'admin' || actorRole === 'suad') return;

  const canParent = await resolvePermission(actorId, 'canActAsParentForChild');
  if (canParent) {
    const link = await prisma.parentChildLink.findUnique({
      where: { parentId_childId: { parentId: actorId, childId: targetUserId } },
    });
    if (link) return;
  }
  throw new HttpError(403, 'Keine Berechtigung, für diesen Nutzer zu handeln');
}

// GET /events/:id/attendance
router.get(
  '/:id/attendance',
  asyncHandler(async (req, res) => {
    const records = await prisma.attendanceRecord.findMany({
      where: { eventId: req.params.id },
      include: { user: { select: { id: true, name: true, role: true } } },
    });
    const out = await Promise.all(
      records.map(async (r) => ({
        id: r.id,
        userId: r.userId,
        userName: r.user.name,
        status: r.status,
        registeredBy: r.registeredBy,
        note: await unpackField(r.noteEnc),
        updatedAt: r.updatedAt,
      })),
    );
    res.json(out);
  }),
);

// POST /events/:id/attendance – modusabhängige An-/Abmeldung
router.post(
  '/:id/attendance',
  asyncHandler(async (req, res) => {
    const actorId = req.user!.id;
    const targetUserId: string = req.body.userId ?? actorId;
    const action: string = req.body.action ?? 'register'; // register | withdraw

    const event = await prisma.event.findUnique({ where: { id: req.params.id } });
    if (!event) throw new HttpError(404, 'Termin nicht gefunden');
    if (event.isCancelled) throw new HttpError(400, 'Termin ist ausgefallen');
    if (event.mode === 'closed') throw new HttpError(403, 'Keine Selbstanmeldung möglich (geschlossen)');

    await assertCanActFor(actorId, req.user!.role, targetUserId);

    const now = new Date();
    let status: string;
    if (action === 'withdraw') {
      if (event.withdrawDeadline && now > event.withdrawDeadline) {
        throw new HttpError(400, 'Abmeldefrist abgelaufen');
      }
      // Kind darf sich nur selbst abmelden, wenn erlaubt
      if (targetUserId === actorId && req.user!.role === 'member') {
        const allowed = await resolvePermission(actorId, 'childCanSelfWithdraw');
        if (!allowed) throw new HttpError(403, 'Selbstabmeldung nicht erlaubt');
      }
      status = 'withdrawn';
    } else {
      if (event.signupDeadline && now > event.signupDeadline) {
        throw new HttpError(400, 'Anmeldefrist abgelaufen');
      }
      // open → sofort registered; request → vorläufig requested
      status = event.mode === 'request' ? 'requested' : 'registered';
    }

    const noteEnc = await packField(req.body.note);
    const record = await prisma.attendanceRecord.upsert({
      where: { eventId_userId: { eventId: event.id, userId: targetUserId } },
      update: { status, noteEnc, registeredBy: actorId !== targetUserId ? actorId : null },
      create: {
        eventId: event.id,
        userId: targetUserId,
        status,
        noteEnc,
        registeredBy: actorId !== targetUserId ? actorId : null,
      },
    });
    res.status(201).json({ id: record.id, status: record.status });
  }),
);

// POST /events/:id/attendance/:userId/confirm – Zusage im Bestätigungsfenster
router.post(
  '/:id/attendance/:userId/confirm',
  asyncHandler(async (req, res) => {
    await assertCanActFor(req.user!.id, req.user!.role, req.params.userId);
    const event = await prisma.event.findUnique({ where: { id: req.params.id } });
    if (!event) throw new HttpError(404, 'Termin nicht gefunden');
    if (event.isCancelled) throw new HttpError(400, 'Termin ist ausgefallen');

    // Bestätigungsfenster serverseitig erzwingen: Zusage nur bis
    // confirmationWindowMinutes vor Terminbeginn möglich.
    if (event.confirmationWindowMinutes != null) {
      const deadline = new Date(event.startAt.getTime() - event.confirmationWindowMinutes * 60 * 1000);
      if (new Date() > deadline) throw new HttpError(400, 'Bestätigungsfenster abgelaufen');
    }

    const record = await prisma.attendanceRecord.update({
      where: { eventId_userId: { eventId: req.params.id, userId: req.params.userId } },
      data: { status: 'confirmed' },
    });
    res.json({ id: record.id, status: record.status });
  }),
);

// POST /events/:id/attendance/:userId/decline – Absage
router.post(
  '/:id/attendance/:userId/decline',
  asyncHandler(async (req, res) => {
    await assertCanActFor(req.user!.id, req.user!.role, req.params.userId);
    const record = await prisma.attendanceRecord.update({
      where: { eventId_userId: { eventId: req.params.id, userId: req.params.userId } },
      data: { status: 'cancelled' },
    });
    res.json({ id: record.id, status: record.status });
  }),
);

// DELETE /events/:id/attendance/:userId – Abmelden
router.delete(
  '/:id/attendance/:userId',
  asyncHandler(async (req, res) => {
    await assertCanActFor(req.user!.id, req.user!.role, req.params.userId);
    const record = await prisma.attendanceRecord.update({
      where: { eventId_userId: { eventId: req.params.id, userId: req.params.userId } },
      data: { status: 'withdrawn' },
    });
    res.json({ id: record.id, status: record.status });
  }),
);

export default router;
