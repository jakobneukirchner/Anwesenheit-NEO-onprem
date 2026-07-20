import { Router } from 'express';
import bcrypt from 'bcrypt';
import { prisma } from '../../db/client';
import { asyncHandler, HttpError } from '../../utils/http';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission, resolvePermission } from '../../utils/permissions';
import { filterChildEmail, filterChildEmails } from '../../utils/emailFilter';
import { auditLog } from '../../utils/audit';
import { SELECTABLE_ROLES } from '../../utils/permissionCatalog';

const router = Router();
router.use(authenticate);

type UserRow = {
  id: string;
  name: string;
  email: string | null;
  role: string;
  isActive: boolean;
  lastActiveAt: Date | null;
  createdAt: Date;
  groupMemberships?: { group: { id: string; name: string } }[];
};

function toDto(u: UserRow) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    isActive: u.isActive,
    lastActiveAt: u.lastActiveAt,
    createdAt: u.createdAt,
    groups: (u.groupMemberships ?? []).map((m) => ({ id: m.group.id, name: m.group.name })),
  };
}

/** SuAd-Zugriff auf eine Kind-E-Mail protokollieren. */
async function auditChildEmailAccess(actorId: string, role: string, targets: UserRow[]): Promise<void> {
  if (role !== 'suad') return;
  const children = targets.filter((t) => t.role === 'member' && t.email);
  for (const child of children) {
    await auditLog('VIEW_CHILD_EMAIL', actorId, child.id, 'user');
  }
}

// GET /users – suad-Accounts nur für suad sichtbar; Kind-E-Mails gefiltert
router.get(
  '/',
  requirePermission('canManageUsers'),
  asyncHandler(async (req, res) => {
    const role = req.user!.role;
    const users = (await prisma.user.findMany({
      where: role === 'suad' ? {} : { role: { not: 'suad' } },
      include: { groupMemberships: { include: { group: true } } },
      orderBy: { name: 'asc' },
    })) as unknown as UserRow[];
    await auditChildEmailAccess(req.user!.id, role, users);
    res.json(filterChildEmails(users.map(toDto), role));
  }),
);

// POST /users – Nutzer direkt anlegen
router.post(
  '/',
  requirePermission('canManageUsers'),
  asyncHandler(async (req, res) => {
    const { name, password } = req.body as { name?: string; password?: string };
    const email: string | undefined = req.body.email || undefined;
    let role: string = req.body.role ?? 'member';
    if (!name || !password) throw new HttpError(400, 'name und password erforderlich');
    if (!SELECTABLE_ROLES.includes(role)) role = 'member'; // suad nie über diesen Endpoint

    if (email) {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) throw new HttpError(409, 'E-Mail bereits vergeben');
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({ data: { name, email, passwordHash, role } });
    await auditLog('CREATE_USER', req.user!.id, user.id, 'user', { role });
    res.status(201).json(filterChildEmail(toDto(user as unknown as UserRow), req.user!.role));
  }),
);

// GET /users/:id
router.get(
  '/:id',
  requirePermission('canManageUsers'),
  asyncHandler(async (req, res) => {
    const role = req.user!.role;
    const user = (await prisma.user.findUnique({
      where: { id: req.params.id },
      include: {
        groupMemberships: { include: { group: true } },
        parentLinks: { include: { child: true } },
        childLinks: { include: { parent: true } },
      },
    })) as unknown as (UserRow & {
      parentLinks: { child: UserRow }[];
      childLinks: { parent: UserRow }[];
    }) | null;
    if (!user) throw new HttpError(404, 'Nicht gefunden');
    if (user.role === 'suad' && role !== 'suad') throw new HttpError(404, 'Nicht gefunden');

    await auditChildEmailAccess(req.user!.id, role, [user]);
    const dto = filterChildEmail(toDto(user), role) as Record<string, unknown>;
    dto.children = filterChildEmails(user.parentLinks.map((l) => toDto(l.child)), role);
    dto.parents = user.childLinks.map((l) => toDto(l.parent));
    res.json(dto);
  }),
);

// PATCH /users/:id
router.patch(
  '/:id',
  requirePermission('canManageUsers'),
  asyncHandler(async (req, res) => {
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) throw new HttpError(404, 'Nicht gefunden');
    if (target.role === 'suad' && req.user!.role !== 'suad') throw new HttpError(403, 'Forbidden');

    const data: Record<string, unknown> = {};
    if (typeof req.body.name === 'string') data.name = req.body.name;
    if ('email' in req.body) data.email = req.body.email || null;
    if (typeof req.body.isActive === 'boolean') {
      // Erster SuAd darf nie deaktiviert werden
      if (target.role === 'suad' && req.body.isActive === false) {
        const firstSuAd = await prisma.user.findFirst({ where: { role: 'suad' }, orderBy: { createdAt: 'asc' } });
        if (firstSuAd?.id === target.id) throw new HttpError(403, 'Erster SuAd ist unveränderlich');
      }
      data.isActive = req.body.isActive;
    }
    if (typeof req.body.role === 'string' && SELECTABLE_ROLES.includes(req.body.role)) {
      if (target.role !== 'suad') data.role = req.body.role; // suad-Rolle nicht per REST änderbar
    }
    if (typeof req.body.password === 'string' && req.body.password.length >= 8) {
      data.passwordHash = await bcrypt.hash(req.body.password, 12);
    }
    const updated = await prisma.user.update({ where: { id: target.id }, data });
    await auditLog('UPDATE_USER', req.user!.id, target.id, 'user', { fields: Object.keys(data) });
    res.json(filterChildEmail(toDto(updated as unknown as UserRow), req.user!.role));
  }),
);

// DELETE /users/:id
router.delete(
  '/:id',
  requirePermission('canManageUsers'),
  asyncHandler(async (req, res) => {
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) throw new HttpError(404, 'Nicht gefunden');
    if (target.role === 'suad') {
      const firstSuAd = await prisma.user.findFirst({ where: { role: 'suad' }, orderBy: { createdAt: 'asc' } });
      if (firstSuAd?.id === target.id) throw new HttpError(403, 'Erster SuAd ist unlöschbar');
      if (req.user!.role !== 'suad') throw new HttpError(403, 'Forbidden');
    }
    await prisma.user.delete({ where: { id: target.id } });
    await auditLog('DELETE_USER', req.user!.id, target.id, 'user');
    res.json({ ok: true });
  }),
);

// GET /users/:id/permissions – aufgelöste Rechte
router.get(
  '/:id/permissions',
  requirePermission('canManageUsers'),
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) throw new HttpError(404, 'Nicht gefunden');
    const { ALL_PERMISSION_KEYS } = await import('../../utils/permissionCatalog');
    const resolved: Record<string, boolean> = {};
    for (const key of ALL_PERMISSION_KEYS) {
      resolved[key] = await resolvePermission(user.id, key);
    }
    res.json(resolved);
  }),
);

// GET /users/:id/permission-overrides – direkte Rechte/Profile (roh, nicht aufgelöst)
router.get(
  '/:id/permission-overrides',
  requirePermission('canManagePermissionProfiles'),
  asyncHandler(async (req, res) => {
    const perms = await prisma.userPermission.findMany({
      where: { userId: req.params.id },
      include: { profile: true },
    });
    res.json(perms);
  }),
);

// PUT /users/:id/permissions – ersetzt Personen-Overrides (Rechte/Profile)
router.put(
  '/:id/permissions',
  requirePermission('canManagePermissionProfiles'),
  asyncHandler(async (req, res) => {
    const userId = req.params.id;
    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) throw new HttpError(404, 'Nicht gefunden');
    const { ALL_PERMISSION_KEYS } = await import('../../utils/permissionCatalog');
    const items: { permissionKey?: string; profileId?: string; value?: boolean }[] = req.body.items ?? [];
    for (const it of items) {
      if (it.permissionKey === 'canViewChildEmail') {
        throw new HttpError(400, 'canViewChildEmail nicht vergebbar');
      }
      if (it.permissionKey && !ALL_PERMISSION_KEYS.includes(it.permissionKey)) {
        throw new HttpError(400, `Unbekanntes Recht: ${it.permissionKey}`);
      }
    }
    await prisma.$transaction([
      prisma.userPermission.deleteMany({ where: { userId } }),
      prisma.userPermission.createMany({
        data: items.map((it) => ({
          userId,
          permissionKey: it.permissionKey ?? null,
          profileId: it.profileId ?? null,
          value: it.value ?? true,
        })),
      }),
    ]);
    await auditLog('UPDATE_USER_PERMISSIONS', req.user!.id, userId, 'user', { count: items.length });
    res.json({ ok: true });
  }),
);

// POST /users/:id/parent-links – Eltern-Kind-Verknüpfung (:id = Kind)
router.post(
  '/:id/parent-links',
  requirePermission('canManageUsers'),
  asyncHandler(async (req, res) => {
    const childId = req.params.id;
    const parentId: string = req.body.parentId;
    if (!parentId) throw new HttpError(400, 'parentId erforderlich');
    const [child, parent] = await Promise.all([
      prisma.user.findUnique({ where: { id: childId } }),
      prisma.user.findUnique({ where: { id: parentId } }),
    ]);
    if (!child || !parent) throw new HttpError(404, 'Nutzer nicht gefunden');

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

// DELETE /users/:id/parent-links/:parentId
router.delete(
  '/:id/parent-links/:parentId',
  requirePermission('canManageUsers'),
  asyncHandler(async (req, res) => {
    await prisma.parentChildLink.deleteMany({
      where: { childId: req.params.id, parentId: req.params.parentId },
    });
    res.json({ ok: true });
  }),
);

async function getSetting(key: string): Promise<string | null> {
  const s = await prisma.globalSetting.findUnique({ where: { key } });
  return s?.value ?? null;
}

export default router;
