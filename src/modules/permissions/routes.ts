import { Router } from 'express';
import { prisma } from '../../db/client';
import { asyncHandler, HttpError } from '../../utils/http';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../utils/permissions';
import { auditLog } from '../../utils/audit';
import { ALL_PERMISSION_KEYS, PERMISSION_CATALOG } from '../../utils/permissionCatalog';

const router = Router();
router.use(authenticate);

interface ProfileItemInput {
  permissionKey: string;
  value?: boolean;
}

function validateItems(items: ProfileItemInput[]): void {
  for (const it of items) {
    if (it.permissionKey === 'canViewChildEmail') {
      throw new HttpError(400, 'canViewChildEmail kann keinem Profil zugewiesen werden');
    }
    if (!ALL_PERMISSION_KEYS.includes(it.permissionKey)) {
      throw new HttpError(400, `Unbekanntes Recht: ${it.permissionKey}`);
    }
  }
}

// GET /permission-profiles
router.get(
  '/',
  requirePermission('canManagePermissionProfiles'),
  asyncHandler(async (_req, res) => {
    const profiles = await prisma.permissionProfile.findMany({
      include: { items: true, _count: { select: { userPermissions: true, groupPermissions: true } } },
      orderBy: { name: 'asc' },
    });
    res.json(profiles);
  }),
);

// GET /permission-profiles/catalog – verfügbarer Rechtekatalog
router.get(
  '/catalog',
  requirePermission('canManagePermissionProfiles'),
  asyncHandler(async (_req, res) => {
    res.json(
      Object.entries(PERMISSION_CATALOG)
        .filter(([key]) => key !== 'canViewChildEmail')
        .map(([key, description]) => ({ key, description })),
    );
  }),
);

// POST /permission-profiles
router.post(
  '/',
  requirePermission('canManagePermissionProfiles'),
  asyncHandler(async (req, res) => {
    const { name } = req.body as { name?: string };
    const items: ProfileItemInput[] = req.body.items ?? [];
    if (!name) throw new HttpError(400, 'name erforderlich');
    validateItems(items);
    const profile = await prisma.permissionProfile.create({
      data: {
        name,
        description: req.body.description,
        items: { create: items.map((i) => ({ permissionKey: i.permissionKey, value: i.value ?? true })) },
      },
      include: { items: true },
    });
    await auditLog('CREATE_PERMISSION_PROFILE', req.user!.id, profile.id, 'permission_profile', { name });
    res.status(201).json(profile);
  }),
);

// GET /permission-profiles/:id
router.get(
  '/:id',
  requirePermission('canManagePermissionProfiles'),
  asyncHandler(async (req, res) => {
    const profile = await prisma.permissionProfile.findUnique({
      where: { id: req.params.id },
      include: {
        items: true,
        userPermissions: { include: { user: { select: { id: true, name: true } } } },
        groupPermissions: { include: { group: { select: { id: true, name: true } } } },
      },
    });
    if (!profile) throw new HttpError(404, 'Nicht gefunden');
    res.json(profile);
  }),
);

// PATCH /permission-profiles/:id
router.patch(
  '/:id',
  requirePermission('canManagePermissionProfiles'),
  asyncHandler(async (req, res) => {
    const items: ProfileItemInput[] | undefined = req.body.items;
    const data: Record<string, unknown> = {};
    if (typeof req.body.name === 'string') data.name = req.body.name;
    if ('description' in req.body) data.description = req.body.description;

    await prisma.$transaction(async (tx) => {
      await tx.permissionProfile.update({ where: { id: req.params.id }, data });
      if (items) {
        validateItems(items);
        await tx.permissionProfileItem.deleteMany({ where: { profileId: req.params.id } });
        await tx.permissionProfileItem.createMany({
          data: items.map((i) => ({ profileId: req.params.id, permissionKey: i.permissionKey, value: i.value ?? true })),
        });
      }
    });
    await auditLog('UPDATE_PERMISSION_PROFILE', req.user!.id, req.params.id, 'permission_profile');
    res.json({ ok: true });
  }),
);

// DELETE /permission-profiles/:id
router.delete(
  '/:id',
  requirePermission('canManagePermissionProfiles'),
  asyncHandler(async (req, res) => {
    await prisma.permissionProfile.delete({ where: { id: req.params.id } });
    await auditLog('DELETE_PERMISSION_PROFILE', req.user!.id, req.params.id, 'permission_profile');
    res.json({ ok: true });
  }),
);

// POST /permission-profiles/:id/assign – Profil einer Person oder Gruppe zuweisen
router.post(
  '/:id/assign',
  requirePermission('canManagePermissionProfiles'),
  asyncHandler(async (req, res) => {
    const { userId, groupId } = req.body as { userId?: string; groupId?: string };
    if (!userId && !groupId) throw new HttpError(400, 'userId oder groupId erforderlich');
    if (userId) await prisma.userPermission.create({ data: { userId, profileId: req.params.id } });
    if (groupId) await prisma.groupPermission.create({ data: { groupId, profileId: req.params.id } });
    await auditLog('ASSIGN_PERMISSION_PROFILE', req.user!.id, userId ?? groupId ?? null, userId ? 'user' : 'group', {
      profileId: req.params.id,
    });
    res.status(201).json({ ok: true });
  }),
);

// POST /permission-profiles/:id/unassign – Profilzuweisung entfernen
router.post(
  '/:id/unassign',
  requirePermission('canManagePermissionProfiles'),
  asyncHandler(async (req, res) => {
    const { userId, groupId } = req.body as { userId?: string; groupId?: string };
    if (!userId && !groupId) throw new HttpError(400, 'userId oder groupId erforderlich');
    if (userId) {
      await prisma.userPermission.deleteMany({ where: { userId, profileId: req.params.id } });
    }
    if (groupId) {
      await prisma.groupPermission.deleteMany({ where: { groupId, profileId: req.params.id } });
    }
    await auditLog('UNASSIGN_PERMISSION_PROFILE', req.user!.id, userId ?? groupId ?? null, userId ? 'user' : 'group', {
      profileId: req.params.id,
    });
    res.json({ ok: true });
  }),
);

export default router;
