import { Router } from 'express';
import { prisma } from '../../db/client';
import { asyncHandler, HttpError } from '../../utils/http';
import { resolvePermission } from '../../utils/permissions';
import { packField, unpackField } from '../../utils/crypto';

const router = Router();

/** Prüft, ob der anfragende Nutzer für targetUserId handeln darf. */
async function assertCanActFor(actorId: string, actorRoles: string[], targetUserId: string): Promise<void> {
  if (actorId === targetUserId) return; // darf sich selbst anmelden

  // Admin/Koordinator/Trainer/SuAd dürfen alle Termine für andere verwalten
  if (actorRoles.some(r => ['admin', 'coordinator', 'teacher', 'suad'].includes(r))) return;

  const canParent = await resolvePermission(actorId, 'canActAsParentForChild');
  if (canParent) {
    const link = await prisma.parentChildLink.findUnique({
      where: { parentId_childId: { parentId: actorId, childId: targetUserId } },
    });
    if (link) return;
  }
  throw new HttpError(403, 'Keine Berechtigung, für diesen Nutzer zu handeln');
}

// GET /events/:id/attendance – Teilnehmerliste für Trainer
router.get(
  '/:id/attendance',
  asyncHandler(async (req, res) => {
    const event = await prisma.event.findUnique({
      where: { id: req.params.id },
      include: {
        group: {
          include: {
            memberships: {
              include: { user: { select: { id: true, name: true, role: true } } },
            },
          },
        },
      },
    });
    if (!event) throw new HttpError(404, 'Termin nicht gefunden');

    const records = await prisma.attendanceRecord.findMany({
      where: { eventId: req.params.id },
      include: { user: { select: { id: true, name: true, role: true } } },
    });

    // Alle Gruppenmitglieder + ihren Anwesenheitsstatus zusammenführen
    const recordMap = new Map(records.map((r) => [r.userId, r]));
    const memberList = event.group.memberships.map((m) => {
      const rec = recordMap.get(m.userId);
      return {
        userId: m.userId,
        userName: m.user.name,
        userRole: m.user.role,
        status: rec ? rec.status : (event.mode === 'signup' ? 'absent' : event.mode === 'confirmation' ? 'pending' : 'registered'),
        recordId: rec?.id ?? null,
        registeredBy: rec?.registeredBy ?? null,
        noteEnc: rec?.noteEnc ?? null,
        lockedByTeacher: rec?.lockedByTeacher ?? false,
        minutesLate: rec?.minutesLate ?? null,
        updatedAt: rec?.updatedAt ?? null,
      };
    });

    // Notizen entschlüsseln
    const out = await Promise.all(
      memberList.map(async (m) => ({
        ...m,
        note: m.noteEnc ? await unpackField(m.noteEnc) : null,
        noteEnc: undefined,
      })),
    );

    // Zusammenfassung
    const counts: Record<string, number> = {};
    for (const m of out) {
      counts[m.status] = (counts[m.status] || 0) + 1;
    }

    res.json({
      eventId: event.id,
      mode: event.mode,
      eventType: (event as unknown as { eventType: string }).eventType,
      totalMembers: out.length,
      counts,
      members: out,
    });
  }),
);

// POST /events/:id/attendance – Modusabhängige Statusänderung
router.post(
  '/:id/attendance',
  asyncHandler(async (req, res) => {
    const actorId = req.user!.id;
    const targetUserId: string = req.body.userId ?? actorId;
    const action: string = req.body.action; // register | withdraw | confirm | cancel

    if (!action) throw new HttpError(400, 'action erforderlich (register|withdraw|confirm|cancel)');

    const event = await prisma.event.findUnique({ where: { id: req.params.id } });
    if (!event) throw new HttpError(404, 'Termin nicht gefunden');
    if (event.isCancelled) throw new HttpError(400, 'Termin ist ausgefallen');

    await assertCanActFor(actorId, req.user!.roles, targetUserId);

    const now = new Date();
    const existing = await prisma.attendanceRecord.findUnique({
      where: { eventId_userId: { eventId: event.id, userId: targetUserId } },
    });
    const currentStatus = existing?.status ?? null;

    if (existing?.lockedByTeacher) {
      throw new HttpError(403, 'Dieser Status wurde von einem Trainer festgelegt und kann nicht mehr geändert werden.');
    }

    let newStatus: string;

    switch (event.mode) {
      case 'signup': {
        // Anmeldebasiert: absent ↔ registered
        if (action === 'register') {
          if (event.signupDeadline && now > event.signupDeadline) {
            throw new HttpError(400, 'Anmeldefrist abgelaufen');
          }
          newStatus = 'registered';
        } else if (action === 'withdraw') {
          if (event.withdrawDeadline && now > event.withdrawDeadline) {
            throw new HttpError(400, 'Abmeldefrist abgelaufen');
          }
          newStatus = 'absent_excused';
        } else if (action === 'late') {
          newStatus = 'late_excused';
        } else {
          throw new HttpError(400, `Aktion "${action}" nicht erlaubt im Modus Anmeldebasiert`);
        }
        break;
      }

      case 'signoff': {
        // Abmeldebasiert: registered ↔ absent
        if (action === 'withdraw') {
          if (event.withdrawDeadline && now > event.withdrawDeadline) {
            throw new HttpError(400, 'Abmeldefrist abgelaufen');
          }
          // Kind darf sich nur selbst abmelden, wenn erlaubt
          if (targetUserId === actorId && !req.user!.roles.some(r => ['admin', 'teacher', 'coordinator', 'suad'].includes(r))) {
            const allowed = await resolvePermission(actorId, 'childCanSelfWithdraw');
            if (!allowed) throw new HttpError(403, 'Selbstabmeldung nicht erlaubt');
          }
          newStatus = 'absent_excused';
        } else if (action === 'register') {
          if (event.signupDeadline && now > event.signupDeadline) {
            throw new HttpError(400, 'Anmeldefrist abgelaufen');
          }
          newStatus = 'registered';
        } else if (action === 'late') {
          newStatus = 'late_excused';
        } else {
          throw new HttpError(400, `Aktion "${action}" nicht erlaubt im Modus Abmeldebasiert`);
        }
        break;
      }

      case 'confirmation': {
        // Bestätigung: pending → confirmed | cancelled, bestätigt/abgesagt ↔ wechseln
        if (action === 'confirm') {
          if (event.confirmationWindowMinutes != null) {
            const deadline = new Date(event.startAt.getTime() - event.confirmationWindowMinutes * 60 * 1000);
            if (now > deadline) throw new HttpError(400, 'Bestätigungsfrist abgelaufen');
          }
          newStatus = 'confirmed';
        } else if (action === 'cancel') {
          if (event.withdrawDeadline && now > event.withdrawDeadline) {
            throw new HttpError(400, 'Abmeldefrist abgelaufen');
          }
          newStatus = 'cancelled';
        } else if (action === 'late') {
          newStatus = 'late_excused';
        } else {
          throw new HttpError(400, `Aktion "${action}" nicht erlaubt im Modus Bestätigung`);
        }
        break;
      }

      default:
        throw new HttpError(400, `Unbekannter Modus: ${event.mode}`);
    }

    const noteEnc = await packField(req.body.note);
    const record = await prisma.attendanceRecord.upsert({
      where: { eventId_userId: { eventId: event.id, userId: targetUserId } },
      update: { status: newStatus, noteEnc: noteEnc ?? existing?.noteEnc, registeredBy: actorId !== targetUserId ? actorId : null },
      create: {
        eventId: event.id,
        userId: targetUserId,
        status: newStatus,
        noteEnc,
        registeredBy: actorId !== targetUserId ? actorId : null,
      },
    });
    res.status(201).json({ id: record.id, status: record.status });
  }),
);

// POST /events/:id/attendance/set-status – Trainer setzt Status direkt
router.post(
  '/:id/attendance/set-status',
  asyncHandler(async (req, res) => {
    const actorId = req.user!.id;
    const ev = await prisma.event.findUnique({ where: { id: req.params.id } });
    if (!ev) throw new HttpError(404, 'Termin nicht gefunden');

    const actorRoles = req.user!.roles;
    let isManager = false;
    if (ev.groupId) {
      const ms = await prisma.groupMembership.findUnique({
        where: { userId_groupId: { userId: req.user!.id, groupId: ev.groupId } },
      });
      if (ms && actorRoles.some(r => ['teacher', 'coordinator'].includes(r))) isManager = true;
    }
    if (!isManager && !actorRoles.some(r => ['admin', 'suad', 'coordinator'].includes(r))) {
      throw new HttpError(403, 'Nur Trainer oder Admins können Anwesenheiten setzen');
    }

    const { userId, status, minutesLate } = req.body as { userId?: string; status?: string; minutesLate?: number };
    if (!userId || !status) throw new HttpError(400, 'userId und status erforderlich');

    const validStatuses = [
      'registered', 'absent', 'absent_excused', 'absent_unexcused', 
      'pending', 'confirmed', 'cancelled', 'present', 
      'late_excused', 'late_unexcused'
    ];
    if (!validStatuses.includes(status)) {
      throw new HttpError(400, `Ungültiger Status: ${status}. Erlaubt: ${validStatuses.join(', ')}`);
    }

    const event = await prisma.event.findUnique({ where: { id: req.params.id } });
    if (!event) throw new HttpError(404, 'Termin nicht gefunden');
    
    const isLocked = !['registered', 'pending', 'confirmed'].includes(status);

    const noteEnc = await packField(req.body.note);
    const record = await prisma.attendanceRecord.upsert({
      where: { eventId_userId: { eventId: event.id, userId } },
      update: { status, noteEnc: noteEnc ?? undefined, registeredBy: actorId, lockedByTeacher: isLocked, minutesLate },
      create: { eventId: event.id, userId, status, noteEnc, registeredBy: actorId, lockedByTeacher: isLocked, minutesLate },
    });
    res.json({ id: record.id, status: record.status, lockedByTeacher: record.lockedByTeacher, minutesLate: record.minutesLate });
  }),
);

// POST /events/:id/attendance/check-in – Trainer markiert Anwesenheitskontrolle
router.post(
  '/:id/attendance/check-in',
  asyncHandler(async (req, res) => {
    const actorId = req.user!.id;
    const ev = await prisma.event.findUnique({ where: { id: req.params.id } });
    if (!ev) throw new HttpError(404, 'Termin nicht gefunden');

    const actorRoles = req.user!.roles;
    let isManager = false;
    if (ev.groupId) {
      const ms = await prisma.groupMembership.findUnique({
        where: { userId_groupId: { userId: req.user!.id, groupId: ev.groupId } },
      });
      if (ms && actorRoles.some(r => ['teacher', 'coordinator'].includes(r))) isManager = true;
    }
    if (!isManager && !actorRoles.some(r => ['admin', 'suad', 'coordinator'].includes(r))) {
      throw new HttpError(403, 'Nur Trainer/Admin dürfen die Anwesenheitskontrolle durchführen');
    }

    const { presentUserIds } = req.body as { presentUserIds?: string[] };
    if (!Array.isArray(presentUserIds)) {
      throw new HttpError(400, 'presentUserIds (Array) erforderlich');
    }

    const event = await prisma.event.findUnique({ where: { id: req.params.id } });
    if (!event) throw new HttpError(404, 'Termin nicht gefunden');

    // Alle, die als anwesend markiert werden → status 'present'
    if (presentUserIds.length > 0) {
      await prisma.attendanceRecord.updateMany({
        where: { eventId: event.id, userId: { in: presentUserIds } },
        data: { status: 'present', registeredBy: actorId, lockedByTeacher: true },
      });
    }

    // Alle angemeldeten/bestätigten, die NICHT in presentUserIds sind → status 'absent'
    await prisma.attendanceRecord.updateMany({
      where: {
        eventId: event.id,
        userId: { notIn: presentUserIds },
        status: { in: ['registered', 'confirmed', 'present'] },
      },
      data: { status: 'absent_unexcused', lockedByTeacher: true },
    });

    res.json({ ok: true, checkedIn: presentUserIds.length });
  }),
);

// DELETE /events/:id/attendance/:userId – Abmelden
router.delete(
  '/:id/attendance/:userId',
  asyncHandler(async (req, res) => {
    await assertCanActFor(req.user!.id, req.user!.roles, req.params.userId);
    const event = await prisma.event.findUnique({ where: { id: req.params.id } });
    if (!event) throw new HttpError(404, 'Termin nicht gefunden');

    const existing = await prisma.attendanceRecord.findUnique({
      where: { eventId_userId: { eventId: req.params.id, userId: req.params.userId } }
    });
    if (existing?.lockedByTeacher) {
      throw new HttpError(403, 'Dieser Status wurde von einem Trainer festgelegt und kann nicht mehr geändert werden.');
    }

    const newStatus = event.mode === 'confirmation' ? 'cancelled' : 'absent_excused';
    const record = await prisma.attendanceRecord.update({
      where: { eventId_userId: { eventId: req.params.id, userId: req.params.userId } },
      data: { status: newStatus },
    });
    res.json({ id: record.id, status: record.status });
  }),
);

// GET /events/:id/attendance/export
router.get(
  '/:id/attendance/export',
  asyncHandler(async (req, res) => {
    const actorRoles = req.user!.roles;
    const ev = await prisma.event.findUnique({ where: { id: req.params.id } });
    if (!ev) throw new HttpError(404, 'Termin nicht gefunden');

    let isManager = false;
    if (ev.groupId) {
      const ms = await prisma.groupMembership.findUnique({
        where: { userId_groupId: { userId: req.user!.id, groupId: ev.groupId } },
      });
      if (ms && actorRoles.some(r => ['teacher', 'coordinator'].includes(r))) isManager = true;
    }
    if (!isManager && !actorRoles.some(r => ['admin', 'suad', 'coordinator'].includes(r))) {
      throw new HttpError(403, 'Keine Berechtigung zum Export');
    }

    const records = await prisma.attendanceRecord.findMany({
      where: { eventId: req.params.id },
    });
    const userIds = records.map(r => r.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, role: true },
    });
    const userMap = new Map(users.map(u => [u.id, u]));

    // Generiere CSV
    let csv = '\uFEFF'; // BOM for Excel
    csv += 'Name;Rollen;Status;Datum\n';
    
    for (const r of records) {
      const u = userMap.get(r.userId);
      if (!u) continue;
      const rolesStr = u.role.startsWith('[') ? JSON.parse(u.role).join(', ') : u.role;
      const name = `"${u.name.replace(/"/g, '""')}"`;
      const date = `"${r.createdAt.toISOString()}"`;
      csv += `${name};"${rolesStr}";"${r.status}";${date}\n`;
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="Teilnehmer_${req.params.id}.csv"`);
    res.send(csv);
  }),
);

export default router;
