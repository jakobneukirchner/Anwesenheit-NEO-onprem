import { Router } from 'express';
import { prisma } from '../../db/client';
import { asyncHandler, HttpError } from '../../utils/http';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../utils/permissions';
import { auditLog } from '../../utils/audit';
import { generateRegistrationCode } from '../../utils/codes';
import { SELECTABLE_ROLES } from '../../utils/permissionCatalog';

const router = Router();
router.use(authenticate);

// GET /registration-codes
router.get(
  '/',
  requirePermission('canGenerateRegistrationCodes'),
  asyncHandler(async (_req, res) => {
    const codes = await prisma.registrationCode.findMany({
      include: { group: { select: { id: true, name: true } }, _count: { select: { uses: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(
      codes.map((c) => ({
        id: c.id,
        code: c.code,
        group: c.group,
        role: c.role,
        expiresAt: c.expiresAt,
        maxUses: c.maxUses,
        useCount: c.useCount,
        isActive: c.isActive,
        usageCount: c._count.uses,
        createdAt: c.createdAt,
      })),
    );
  }),
);

// POST /registration-codes
router.post(
  '/',
  requirePermission('canGenerateRegistrationCodes'),
  asyncHandler(async (req, res) => {
    const { groupId } = req.body as { groupId?: string };
    if (!groupId) throw new HttpError(400, 'groupId erforderlich');
    let role: string = req.body.role ?? 'member';
    if (!SELECTABLE_ROLES.includes(role)) role = 'member';

    let code = generateRegistrationCode();
    for (let tries = 0; tries < 5; tries++) {
      const existing = await prisma.registrationCode.findUnique({ where: { code } });
      if (!existing) break;
      code = generateRegistrationCode();
    }

    const created = await prisma.registrationCode.create({
      data: {
        code,
        groupId,
        role,
        expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : null,
        maxUses: req.body.maxUses ?? null,
        createdBy: req.user!.id,
      },
    });
    await auditLog('CREATE_REGISTRATION_CODE', req.user!.id, created.id, 'registration_code', { role, groupId });
    res.status(201).json({ id: created.id, code: created.code });
  }),
);

// PATCH /registration-codes/:id – Limits ändern (Zusatzrecht)
router.patch(
  '/:id',
  requirePermission('canManageRegistrationCodeLimits'),
  asyncHandler(async (req, res) => {
    const data: Record<string, unknown> = {};
    if (req.body.expiresAt !== undefined) data.expiresAt = req.body.expiresAt ? new Date(req.body.expiresAt) : null;
    if (req.body.maxUses !== undefined) data.maxUses = req.body.maxUses;
    if (typeof req.body.isActive === 'boolean') data.isActive = req.body.isActive;
    const code = await prisma.registrationCode.update({ where: { id: req.params.id }, data });
    res.json({ id: code.id });
  }),
);

// DELETE /registration-codes/:id – deaktivieren
router.delete(
  '/:id',
  requirePermission('canGenerateRegistrationCodes'),
  asyncHandler(async (req, res) => {
    await prisma.registrationCode.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ ok: true });
  }),
);

export default router;
