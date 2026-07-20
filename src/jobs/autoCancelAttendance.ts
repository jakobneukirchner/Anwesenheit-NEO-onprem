/**
 * Cronjob: Unbestätigte Anfragen nach Bestätigungsfenster automatisch absagen.
 * Standard: alle 5 Minuten.
 */

import cron from 'node-cron';
import { prisma } from '../db/client';

export function startAutoCancelJob(): void {
  const schedule = process.env.CRON_AUTO_CANCEL ?? '*/5 * * * *';

  cron.schedule(schedule, async () => {
    const now = new Date();

    // Alle Events mit Bestätigungsfenster, die in der Vergangenheit liegen
    const expiredEvents = await prisma.event.findMany({
      where: {
        isCancelled: false,
        startAt: { lt: now },
        confirmationWindowMinutes: { not: null },
      },
    });

    for (const event of expiredEvents) {
      const deadline = new Date(
        event.startAt.getTime() - (event.confirmationWindowMinutes! * 60 * 1000)
      );

      if (now >= deadline) {
        await prisma.attendanceRecord.updateMany({
          where: { eventId: event.id, status: 'requested' },
          data: { status: 'cancelled' },
        });
      }
    }
  });

  console.log(`[cron] autoCancelAttendance gestartet (${schedule})`);
}
