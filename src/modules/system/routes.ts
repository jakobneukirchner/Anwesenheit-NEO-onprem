import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { prisma } from '../../db/client';
import { asyncHandler } from '../../utils/http';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../utils/permissions';

const router = Router();
router.use(authenticate);

// GET /system/status – Cronjob-Status, letzte Backups, Kennzahlen
router.get(
  '/status',
  requirePermission('canViewSystemTab'),
  asyncHandler(async (_req, res) => {
    const backupDir = process.env.BACKUP_DIR ?? './backups';
    let backups: { file: string; size: number; mtime: Date }[] = [];
    if (fs.existsSync(backupDir)) {
      backups = fs
        .readdirSync(backupDir)
        .filter((f) => f.endsWith('.enc'))
        .map((f) => {
          const stat = fs.statSync(path.join(backupDir, f));
          return { file: f, size: stat.size, mtime: stat.mtime };
        })
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
        .slice(0, 10);
    }

    const [users, activeCodes, refreshTokens] = await Promise.all([
      prisma.user.count(),
      prisma.registrationCode.count({ where: { isActive: true } }),
      prisma.refreshToken.count({ where: { revokedAt: null } }),
    ]);

    res.json({
      uptimeSeconds: Math.round(process.uptime()),
      nodeVersion: process.version,
      cronJobs: [
        { name: 'autoCancelAttendance', schedule: process.env.CRON_AUTO_CANCEL ?? '*/5 * * * *' },
        { name: 'cleanupExpiredCodes', schedule: process.env.CRON_CLEANUP_CODES ?? '0 3 * * *' },
        { name: 'nightlyBackup', schedule: process.env.BACKUP_CRON ?? '0 2 * * *' },
        { name: 'reminderNotifications', schedule: process.env.CRON_REMINDERS ?? '0 * * * *' },
      ],
      backups,
      counts: { users, activeCodes, activeRefreshTokens: refreshTokens },
      rateLimits: [
        {
          name: 'auth',
          scope: '/auth/login, /auth/register',
          windowMs: 15 * 60 * 1000,
          maxRequests: 30,
          note: 'Pro IP im 15-Minuten-Fenster',
        },
      ],
    });
  }),
);

export default router;
