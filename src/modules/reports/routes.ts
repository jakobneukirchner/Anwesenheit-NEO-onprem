import { Router } from 'express';
import { prisma } from '../../db/client';
import { asyncHandler } from '../../utils/http';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../utils/permissions';

const router = Router();
router.use(authenticate);

function csvEscape(v: unknown): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// GET /reports/export?groupId= – CSV-Export der Anwesenheiten
router.get(
  '/export',
  requirePermission('canExportReports'),
  asyncHandler(async (req, res) => {
    const groupId = req.query.groupId as string | undefined;
    const records = await prisma.attendanceRecord.findMany({
      where: groupId ? { event: { groupId } } : undefined,
      include: {
        user: { select: { name: true } },
        event: { select: { title: true, startAt: true, groupId: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const header = ['Termin', 'Beginn', 'GruppenID', 'Teilnehmer', 'Status'];
    const rows = records.map((r) =>
      [r.event.title, r.event.startAt.toISOString(), r.event.groupId, r.user.name, r.status]
        .map(csvEscape)
        .join(','),
    );
    const csv = [header.join(','), ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="attendance-report.csv"');
    res.send(csv);
  }),
);

export default router;
