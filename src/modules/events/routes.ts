import { Router } from 'express';
import { prisma } from '../../db/client';
import { asyncHandler, HttpError } from '../../utils/http';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../utils/permissions';
import { packField } from '../../utils/crypto';
import { serializeEvent, serializeEvents, EventLike } from './serialize';
import attendanceRouter from './attendance';

const router = Router();
router.use(authenticate);

/** Erzeugt Attendance-Records für alle Gruppenmitglieder basierend auf dem Modus. */
async function createAttendanceForGroup(eventId: string, groupId: string, mode: string): Promise<void> {
  const memberships = await prisma.groupMembership.findMany({
    where: { groupId },
    select: { userId: true },
  });
  if (memberships.length === 0) return;

  let defaultStatus: string;
  switch (mode) {
    case 'signup':       defaultStatus = 'absent'; break;
    case 'confirmation': defaultStatus = 'pending'; break;
    case 'signoff':
    default:             defaultStatus = 'registered'; break;
  }

  for (const m of memberships) {
    await prisma.attendanceRecord.upsert({
      where: { eventId_userId: { eventId, userId: m.userId } },
      update: {},
      create: { eventId, userId: m.userId, status: defaultStatus },
    });
  }
}

// GET /events?groupId=&from=&to=&mode=&eventType=
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { groupId, from, to, mode, eventType, past } = req.query as Record<string, string | undefined>;
    const where: Record<string, unknown> = {};
    if (groupId) where.groupId = groupId;
    if (mode) where.mode = mode;
    if (eventType) where.eventType = eventType;
    if (from || to) {
      where.startAt = {};
      if (from) (where.startAt as Record<string, Date>).gte = new Date(from);
      if (to) (where.startAt as Record<string, Date>).lte = new Date(to);
    } else {
      const now = new Date();
      if (past === 'true') {
        where.startAt = { lt: now };
      } else {
        const lookaheadStr = await prisma.globalSetting.findUnique({ where: { key: 'eventLookaheadDays' } });
        const lookaheadDays = parseInt(lookaheadStr?.value ?? '365', 10);
        const futureLimit = new Date(now.getTime() + lookaheadDays * 24 * 60 * 60 * 1000);
        where.startAt = { gte: now, lte: futureLimit };
      }
    }
    const events = (await prisma.event.findMany({
      where,
      orderBy: { startAt: (past === 'true' && !from && !to) ? 'desc' : 'asc' },
      include: {
        attendanceRecords: {
          select: { userId: true, status: true, lockedByTeacher: true, user: { select: { role: true } } },
        },
        group: { select: { id: true, name: true, color: true } },
      },
    })) as unknown as (EventLike & {
      attendanceRecords: { userId: string; status: string; lockedByTeacher: boolean; user: { role: string } }[];
      group: { id: string; name: string; color: string | null };
    })[];

    const userId = req.user!.id;
    const serialized = await serializeEvents(
      events.map((e) => ({ ...e })) as unknown as EventLike[],
    );
    const result = serialized.map((s, i) => {
      const ev = events[i];
      const myRec = ev.attendanceRecords.find((r) => r.userId === userId);
      const counts: Record<string, number> = {};
      for (const r of ev.attendanceRecords) {
        counts[r.status] = (counts[r.status] || 0) + 1;
      }
      const teacherPresent = ev.attendanceRecords.some(r => 
        ['present', 'late_excused', 'late_unexcused'].includes(r.status) && 
        (r.user.role.includes('teacher') || r.user.role.includes('coordinator'))
      );
      return {
        ...s,
        groupName: ev.group.name,
        groupColor: ev.group.color,
        totalMembers: ev.attendanceRecords.length,
        myAttendance: myRec ? myRec.status : null,
        myAttendanceLocked: myRec ? myRec.lockedByTeacher : false,
        attendanceCounts: counts,
        totalRegistered: (counts.registered || 0) + (counts.confirmed || 0) + (counts.present || 0),
        teacherPresent,
      };
    });
    res.json(result);
  }),
);

// POST /events – einzeln oder Serie (repeat + count)
router.post(
  '/',
  requirePermission('canManageSchedule'),
  asyncHandler(async (req, res) => {
    const { title, groupId, startAt, endAt, mode, eventType } = req.body as Record<string, string>;
    if (!title || !groupId || !startAt || !endAt) {
      throw new HttpError(400, 'title, groupId, startAt, endAt erforderlich');
    }
    const validModes = ['signup', 'signoff', 'confirmation'];
    const eventMode = validModes.includes(mode) ? mode : 'signoff';
    const validTypes = ['training', 'match', 'event', 'other'];
    const type = validTypes.includes(eventType) ? eventType : 'training';

    const [descriptionEnc, locationEnc] = await Promise.all([
      packField(req.body.description),
      packField(req.body.location),
    ]);
    const base = {
      title,
      groupId,
      descriptionEnc,
      locationEnc,
      mode: eventMode,
      eventType: type,
      signupDeadline: req.body.signupDeadline ? new Date(req.body.signupDeadline) : null,
      withdrawDeadline: req.body.withdrawDeadline ? new Date(req.body.withdrawDeadline) : null,
      confirmationWindowMinutes: req.body.confirmationWindowMinutes ?? null,
      minParticipants: req.body.minParticipants ?? 0,
      createdBy: req.user!.id,
    };

    // Serienlogik: rrule + count erzeugt mehrere Events
    const rrule: string | undefined = req.body.rrule;
    const count: number = Math.min(parseInt(String(req.body.count ?? '1'), 10) || 1, 365);
    const start = new Date(startAt);
    const end = new Date(endAt);

    if (rrule && count > 1) {
      const intervalMatch = /INTERVAL=(\d+)/i.exec(rrule);
      const intervalMult = intervalMatch ? parseInt(intervalMatch[1], 10) : 1;
      const intervalBase = /WEEKLY/i.test(rrule) ? 7 : /MONTHLY/i.test(rrule) ? 30 : 1;
      const intervalDays = intervalBase * intervalMult;
      const series = await prisma.eventSeries.create({ data: { rrule } });
      const created = [];
      for (let i = 0; i < count; i++) {
        const offset = i * intervalDays * 24 * 60 * 60 * 1000;
        const ev = (await prisma.event.create({
          data: {
            ...base,
            seriesId: series.id,
            startAt: new Date(start.getTime() + offset),
            endAt: new Date(end.getTime() + offset),
          },
        })) as unknown as EventLike;
        // Auto-Attendance für Gruppenmitglieder
        await createAttendanceForGroup(ev.id, groupId, eventMode);
        created.push(await serializeEvent(ev));
      }
      res.status(201).json({ seriesId: series.id, events: created });
      return;
    }

    const ev = (await prisma.event.create({
      data: { ...base, startAt: start, endAt: end },
    })) as unknown as EventLike;
    // Auto-Attendance für Gruppenmitglieder
    await createAttendanceForGroup(ev.id, groupId, eventMode);
    res.status(201).json(await serializeEvent(ev));
  }),
);

// GET /events/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const ev = (await prisma.event.findUnique({ 
      where: { id: req.params.id },
      include: {
        attendanceRecords: {
          select: { status: true, user: { select: { role: true } } }
        }
      }
    })) as unknown as (EventLike & { attendanceRecords: { status: string; user: { role: string } }[] }) | null;
    if (!ev) throw new HttpError(404, 'Nicht gefunden');
    
    const serialized = await serializeEvent(ev);
    const teacherPresent = ev.attendanceRecords.some(r => 
      ['present', 'late_excused', 'late_unexcused'].includes(r.status) && 
      (r.user.role.includes('teacher') || r.user.role.includes('coordinator'))
    );
    res.json({ ...serialized, teacherPresent });
  }),
);

/** Ermittelt betroffene Event-IDs anhand des Scopes (single/following/all). */
async function scopedEventIds(eventId: string, scope: string): Promise<string[]> {
  const ev = await prisma.event.findUnique({ where: { id: eventId } });
  if (!ev) return [];
  if (scope === 'all' && ev.seriesId) {
    const evts = await prisma.event.findMany({ where: { seriesId: ev.seriesId }, select: { id: true } });
    return evts.map((e) => e.id);
  }
  if (scope === 'following' && ev.seriesId) {
    const evts = await prisma.event.findMany({
      where: { seriesId: ev.seriesId, startAt: { gte: ev.startAt } },
      select: { id: true },
    });
    return evts.map((e) => e.id);
  }
  return [eventId];
}

// PATCH /events/:id?scope=single|following|all
router.patch(
  '/:id',
  requirePermission('canManageSchedule'),
  asyncHandler(async (req, res) => {
    const scope = (req.query.scope as string) ?? 'single';
    const ids = await scopedEventIds(req.params.id, scope);
    if (ids.length === 0) throw new HttpError(404, 'Nicht gefunden');

    const data: Record<string, unknown> = {};
    if (typeof req.body.title === 'string') data.title = req.body.title;
    if ('description' in req.body) data.descriptionEnc = await packField(req.body.description);
    if ('location' in req.body) data.locationEnc = await packField(req.body.location);
    if (typeof req.body.mode === 'string') data.mode = req.body.mode;
    if (typeof req.body.eventType === 'string') data.eventType = req.body.eventType;
    if (req.body.signupDeadline !== undefined)
      data.signupDeadline = req.body.signupDeadline ? new Date(req.body.signupDeadline) : null;
    if (req.body.withdrawDeadline !== undefined)
      data.withdrawDeadline = req.body.withdrawDeadline ? new Date(req.body.withdrawDeadline) : null;
    if (req.body.confirmationWindowMinutes !== undefined)
      data.confirmationWindowMinutes = req.body.confirmationWindowMinutes;

    // Zeiten nur bei single sinnvoll individuell
    if (scope === 'single') {
      if (req.body.startAt) data.startAt = new Date(req.body.startAt);
      if (req.body.endAt) data.endAt = new Date(req.body.endAt);
    }

    await prisma.event.updateMany({ where: { id: { in: ids } }, data });
    res.json({ ok: true, affected: ids.length });
  }),
);

// DELETE /events/:id?scope=single|following|all
router.delete(
  '/:id',
  requirePermission('canManageSchedule'),
  asyncHandler(async (req, res) => {
    const scope = (req.query.scope as string) ?? 'single';
    const ids = await scopedEventIds(req.params.id, scope);
    if (ids.length === 0) throw new HttpError(404, 'Nicht gefunden');
    await prisma.event.deleteMany({ where: { id: { in: ids } } });
    res.json({ ok: true, affected: ids.length });
  }),
);

// POST /events/:id/cancel – Ausfall mit Begründung
router.post(
  '/:id/cancel',
  requirePermission('canManageSchedule'),
  asyncHandler(async (req, res) => {
    const scope = (req.query.scope as string) ?? 'single';
    const reason: string | undefined = req.body.reason;
    if (!reason) throw new HttpError(400, 'reason (Begründung) erforderlich');
    const ids = await scopedEventIds(req.params.id, scope);
    const cancelReasonEnc = await packField(reason);
    await prisma.event.updateMany({ where: { id: { in: ids } }, data: { isCancelled: true, cancelReasonEnc } });
    res.json({ ok: true, affected: ids.length });
  }),
);

// DELETE /events/:id/cancel – Ausfall aufheben
router.delete(
  '/:id/cancel',
  requirePermission('canManageSchedule'),
  asyncHandler(async (req, res) => {
    const scope = (req.query.scope as string) ?? 'single';
    const ids = await scopedEventIds(req.params.id, scope);
    await prisma.event.updateMany({ where: { id: { in: ids } }, data: { isCancelled: false, cancelReasonEnc: null } });
    res.json({ ok: true, affected: ids.length });
  }),
);

// POST /events/bulk-action – Massenaktionen (cancel/uncancel/delete)
router.post(
  '/bulk-action',
  requirePermission('canManageSchedule'),
  asyncHandler(async (req, res) => {
    const { action, eventIds } = req.body as { action?: string; eventIds?: string[] };
    if (!action || !Array.isArray(eventIds) || eventIds.length === 0) {
      throw new HttpError(400, 'action und eventIds erforderlich');
    }
    if (action === 'cancel') {
      const cancelReasonEnc = await packField(req.body.reason ?? 'Sammel-Ausfall');
      await prisma.event.updateMany({ where: { id: { in: eventIds } }, data: { isCancelled: true, cancelReasonEnc } });
    } else if (action === 'uncancel') {
      await prisma.event.updateMany({ where: { id: { in: eventIds } }, data: { isCancelled: false, cancelReasonEnc: null } });
    } else if (action === 'delete') {
      await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
    } else {
      throw new HttpError(400, `Unbekannte Aktion: ${action}`);
    }
    res.json({ ok: true, affected: eventIds.length });
  }),
);

// Attendance-Subrouter (/events/:id/attendance...)
router.use('/', attendanceRouter);

export default router;
