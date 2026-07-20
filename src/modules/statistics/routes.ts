import { Router } from 'express';
import { prisma } from '../../db/client';
import { asyncHandler } from '../../utils/http';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../utils/permissions';

const router = Router();
router.use(authenticate);

// GET /statistics/overview
router.get(
  '/overview',
  requirePermission('canViewStatistics'),
  asyncHandler(async (_req, res) => {
    const [userCount, groupCount, eventCount, upcoming] = await Promise.all([
      prisma.user.count({ where: { role: { not: 'suad' } } }),
      prisma.group.count({ where: { isActive: true } }),
      prisma.event.count(),
      prisma.event.count({ where: { startAt: { gte: new Date() }, isCancelled: false } }),
    ]);
    res.json({ userCount, groupCount, eventCount, upcomingEvents: upcoming });
  }),
);

// GET /statistics/attendance – Quoten je Status
router.get(
  '/attendance',
  requirePermission('canViewStatistics'),
  asyncHandler(async (req, res) => {
    const groupId = req.query.groupId as string | undefined;
    const grouped = await prisma.attendanceRecord.groupBy({
      by: ['status'],
      _count: { status: true },
      where: groupId ? { event: { groupId } } : undefined,
    });
    const total = grouped.reduce((sum, g) => sum + g._count.status, 0);
    res.json({
      total,
      byStatus: Object.fromEntries(grouped.map((g) => [g.status, g._count.status])),
    });
  }),
);

export default router;
