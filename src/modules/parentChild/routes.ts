import { Router } from 'express';
import { prisma } from '../../db/client';
import { asyncHandler, HttpError } from '../../utils/http';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../utils/permissions';
import { getSetting } from '../../utils/settings';

const router = Router();
router.use(authenticate);

// GET /parent-child-links?parentId=&childId=
router.get(
  '/',
  requirePermission('canManageUsers'),
  asyncHandler(async (req, res) => {
    const where: Record<string, string> = {};
    if (req.query.parentId) where.parentId = req.query.parentId as string;
    if (req.query.childId) where.childId = req.query.childId as string;
    const links = await prisma.parentChildLink.findMany({
      where,
      include: {
        parent: { select: { id: true, name: true } },
        child: { select: { id: true, name: true } },
      },
    });
    res.json(links);
  }),
);

// POST /parent-child-links
router.post(
  '/',
  requirePermission('canManageUsers'),
  asyncHandler(async (req, res) => {
    const { parentId, childId } = req.body as { parentId?: string; childId?: string };
    if (!parentId || !childId) throw new HttpError(400, 'parentId und childId erforderlich');

    const maxParents = parseInt((await getSetting('maxParentAccountsPerChild')) ?? '2', 10);
    const maxChildren = parseInt((await getSetting('maxChildrenPerParent')) ?? '10', 10);
    const [parentCount, childCount] = await Promise.all([
      prisma.parentChildLink.count({ where: { childId } }),
      prisma.parentChildLink.count({ where: { parentId } }),
    ]);
    if (parentCount >= maxParents) throw new HttpError(400, 'maxParentAccountsPerChild erreicht');
    if (childCount >= maxChildren) throw new HttpError(400, 'maxChildrenPerParent erreicht');

    const link = await prisma.parentChildLink.create({ data: { parentId, childId } });
    res.status(201).json(link);
  }),
);

// DELETE /parent-child-links/:id
router.delete(
  '/:id',
  requirePermission('canManageUsers'),
  asyncHandler(async (req, res) => {
    await prisma.parentChildLink.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  }),
);

export default router;
