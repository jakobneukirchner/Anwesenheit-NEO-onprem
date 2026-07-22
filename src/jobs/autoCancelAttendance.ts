/**
 * Cronjob: Im Bestätigungs-Modus ausstehende Bestätigungen nach Fristablauf
 * automatisch auf 'cancelled' setzen.
 * Standard: alle 5 Minuten.
 */

import cron from 'node-cron';
import { prisma } from '../db/client';

export function startAutoCancelJob(): void {
  const schedule = process.env.CRON_AUTO_CANCEL ?? '*/5 * * * *';

  cron.schedule(schedule, async () => {
    const now = new Date();

    // Alle Events im confirmation-Modus mit Bestätigungsfenster
    const expiredEvents = await prisma.event.findMany({
      where: {
        isCancelled: false,
        mode: 'confirmation',
        startAt: { lt: now },
        confirmationWindowMinutes: { not: null },
      },
    });

    for (const event of expiredEvents) {
      const deadline = new Date(
        event.startAt.getTime() - (event.confirmationWindowMinutes! * 60 * 1000)
      );

      if (now >= deadline) {
        // pending → cancelled (Bestätigungsfrist abgelaufen)
        await prisma.attendanceRecord.updateMany({
          where: { eventId: event.id, status: 'pending' },
          data: { status: 'cancelled' },
        });
      }
    }
  });

  console.log(`[cron] autoCancelAttendance gestartet (${schedule})`);
}
