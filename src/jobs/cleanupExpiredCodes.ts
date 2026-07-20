import cron from 'node-cron';
import { prisma } from '../db/client';

export function startCleanupExpiredCodesJob(): void {
  const schedule = process.env.CRON_CLEANUP_CODES ?? '0 3 * * *';

  cron.schedule(schedule, async () => {
    const now = new Date();
    const result = await prisma.registrationCode.updateMany({
      where: { expiresAt: { lt: now }, isActive: true },
      data: { isActive: false },
    });
    console.log(`[cron] cleanupExpiredCodes: ${result.count} Codes deaktiviert`);
  });

  console.log(`[cron] cleanupExpiredCodes gestartet (${schedule})`);
}
