import { Router } from 'express';
import { prisma } from '../../db/client';
import { asyncHandler, HttpError } from '../../utils/http';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../utils/permissions';
import { auditLog } from '../../utils/audit';
import { ALL_PERMISSION_KEYS } from '../../utils/permissionCatalog';

const router = Router();
router.use(authenticate);

// GET /groups
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const groups = await prisma.group.findMany({
      where: { isActive: true },
      include: { _count: { select: { memberships: true } } },
      orderBy: { name: 'asc' },
    });
    res.json(
      groups.map((g) => ({
        id: g.id,
        name: g.name,
        description: g.description,
        color: g.color,
        memberCount: g._count.memberships,
      })),
    );
  }),
);

// POST /groups
router.post(
  '/',
  requirePermission('canManageGroups'),
  asyncHandler(async (req, res) => {
    const { name, description, color } = req.body as { name?: string; description?: string; color?: string };
    if (!name) throw new HttpError(400, 'name erforderlich');
    const group = await prisma.group.create({ data: { name, description, color } });
    res.status(201).json(group);
  }),
);

// GET /groups/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const group = await prisma.group.findUnique({
      where: { id: req.params.id },
      include: { memberships: { include: { user: true } } },
    });
    if (!group) throw new HttpError(404, 'Nicht gefunden');
    res.json({
      id: group.id,
      name: group.name,
      description: group.description,
      color: group.color,
      isActive: group.isActive,
      members: group.memberships.map((m) => ({ id: m.user.id, name: m.user.name, role: m.user.role })),
    });
  }),
);

// PATCH /groups/:id
router.patch(
  '/:id',
  requirePermission('canManageGroups'),
  asyncHandler(async (req, res) => {
    const data: Record<string, unknown> = {};
    for (const f of ['name', 'description', 'color'] as const) {
      if (f in req.body) data[f] = req.body[f];
    }
    if (typeof req.body.isActive === 'boolean') data.isActive = req.body.isActive;
    const group = await prisma.group.update({ where: { id: req.params.id }, data });
    res.json(group);
  }),
);

// DELETE /groups/:id
router.delete(
  '/:id',
  requirePermission('canManageGroups'),
  asyncHandler(async (req, res) => {
    await prisma.group.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  }),
);

// POST /groups/:id/members
router.post(
  '/:id/members',
  requirePermission('canManageGroups'),
  asyncHandler(async (req, res) => {
    const userId: string = req.body.userId;
    if (!userId) throw new HttpError(400, 'userId erforderlich');
    const membership = await prisma.groupMembership.upsert({
      where: { userId_groupId: { userId, groupId: req.params.id } },
      update: {},
      create: { userId, groupId: req.params.id },
    });
    res.status(201).json(membership);
  }),
);

// DELETE /groups/:id/members/:userId
router.delete(
  '/:id/members/:userId',
  requirePermission('canManageGroups'),
  asyncHandler(async (req, res) => {
    await prisma.groupMembership.deleteMany({
      where: { groupId: req.params.id, userId: req.params.userId },
    });
    res.json({ ok: true });
  }),
);

// GET /groups/:id/permissions
router.get(
  '/:id/permissions',
  requirePermission('canManagePermissionProfiles'),
  asyncHandler(async (req, res) => {
    const perms = await prisma.groupPermission.findMany({
      where: { groupId: req.params.id },
      include: { profile: true },
    });
    res.json(perms);
  }),
);

// PUT /groups/:id/permissions – ersetzt Gruppenrechte/-profile
router.put(
  '/:id/permissions',
  requirePermission('canManagePermissionProfiles'),
  asyncHandler(async (req, res) => {
    const groupId = req.params.id;
    const items: { permissionKey?: string; profileId?: string; value?: boolean }[] = req.body.items ?? [];
    for (const it of items) {
      if (it.permissionKey === 'canViewChildEmail') throw new HttpError(400, 'canViewChildEmail nicht vergebbar');
      if (it.permissionKey && !ALL_PERMISSION_KEYS.includes(it.permissionKey)) {
        throw new HttpError(400, `Unbekanntes Recht: ${it.permissionKey}`);
      }
    }
    await prisma.$transaction([
      prisma.groupPermission.deleteMany({ where: { groupId } }),
      prisma.groupPermission.createMany({
        data: items.map((it) => ({
          groupId,
          permissionKey: it.permissionKey ?? null,
          profileId: it.profileId ?? null,
          value: it.value ?? true,
        })),
      }),
    ]);
    await auditLog('UPDATE_GROUP_PERMISSIONS', req.user!.id, groupId, 'group', { count: items.length });
    res.json({ ok: true });
  }),
);

export default router;
