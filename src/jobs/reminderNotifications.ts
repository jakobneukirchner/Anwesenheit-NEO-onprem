/**
 * Cronjob: Erinnerungsbenachrichtigungen vor Terminen.
 * Sendet Socket.IO-Events an Teilnehmer, deren Termin in < 24h ist.
 */

import cron from 'node-cron';
import { prisma } from '../db/client';
import { getIO } from '../realtime/socketServer';

export function startReminderNotificationsJob(): void {
  const schedule = process.env.CRON_REMINDERS ?? '0 * * * *';

  cron.schedule(schedule, async () => {
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const upcomingEvents = await prisma.event.findMany({
      where: {
        isCancelled: false,
        startAt: { gte: now, lte: in24h },
      },
      include: {
        attendanceRecords: {
          where: { status: { in: ['registered', 'confirmed'] } },
        },
      },
    });

    const io = getIO();
    for (const event of upcomingEvents) {
      for (const record of event.attendanceRecords) {
        io.to(`user:${record.userId}`).emit('notification:reminder', {
          eventId: event.id,
          title: event.title,
          startAt: event.startAt,
        });
      }
    }

    console.log(`[cron] reminderNotifications: ${upcomingEvents.length} Termine geprüft`);
  });

  console.log(`[cron] reminderNotifications gestartet (${schedule})`);
}
