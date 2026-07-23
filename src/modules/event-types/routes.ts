import { Router } from 'express';
import { prisma } from '../../db/client';
import { asyncHandler, HttpError } from '../../utils/http';
import { authenticate } from '../../middleware/authenticate';

const router = Router();
router.use(authenticate);

// GET /event-types
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const types = await prisma.eventType.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    res.json(types);
  }),
);

// GET /event-types/all (Admin)
router.get(
  '/all',
  asyncHandler(async (req, res) => {
    if (!req.user!.roles.includes('admin')) throw new HttpError(403, 'Forbidden');
    const types = await prisma.eventType.findMany({
      orderBy: { sortOrder: 'asc' },
    });
    res.json(types);
  }),
);

// POST /event-types
router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!req.user!.roles.includes('admin')) throw new HttpError(403, 'Forbidden');
    const { name, icon, color, sortOrder } = req.body;
    if (!name) throw new HttpError(400, 'name ist erforderlich');

    const existing = await prisma.eventType.findUnique({ where: { name } });
    if (existing) throw new HttpError(409, 'Termintyp existiert bereits');

    const type = await prisma.eventType.create({
      data: {
        name,
        icon: icon || 'event',
        color: color || null,
        sortOrder: sortOrder || 0,
      },
    });
    res.status(201).json(type);
  }),
);

// PATCH /event-types/:id
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!req.user!.roles.includes('admin')) throw new HttpError(403, 'Forbidden');
    const { name, icon, color, sortOrder, isActive } = req.body;
    const data: Record<string, any> = {};

    if (name) {
      const existing = await prisma.eventType.findUnique({ where: { name } });
      if (existing && existing.id !== req.params.id) throw new HttpError(409, 'Termintyp existiert bereits');
      data.name = name;
    }
    if (icon !== undefined) data.icon = icon;
    if (color !== undefined) data.color = color;
    if (sortOrder !== undefined) data.sortOrder = sortOrder;
    if (isActive !== undefined) data.isActive = isActive;

    if (Object.keys(data).length === 0) throw new HttpError(400, 'Keine Änderungen');

    const type = await prisma.eventType.update({
      where: { id: req.params.id },
      data,
    });
    res.json(type);
  }),
);

// DELETE /event-types/:id
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!req.user!.roles.includes('admin')) throw new HttpError(403, 'Forbidden');
    // Wir löschen nicht hart, um referentielle Integrität bei Events nicht zu brechen.
    // Aber warte, Event.eventType ist nur ein String (name), keine Relation.
    // Also könnten wir es hart löschen, aber soft-delete ist sicherer.
    const type = await prisma.eventType.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });
    res.json({ ok: true, id: type.id });
  }),
);

export default router;
