import { Router } from 'express';
import { prisma } from '../../db/client';
import { asyncHandler } from '../../utils/http';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../utils/permissions';
import { auditLog } from '../../utils/audit';
import { BRANDING_KEYS, getBranding, setSetting } from '../../utils/settings';

const router = Router();

// GET /settings/branding – öffentlich (Login-Screen, Theme)
router.get(
  '/branding',
  asyncHandler(async (_req, res) => {
    res.json(await getBranding());
  }),
);

router.use(authenticate);

// GET /settings – öffentliche/branding-Werte für eingeloggte Nutzer
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await getBranding());
  }),
);

// GET /settings/all – alle Einstellungen (System)
router.get(
  '/all',
  requirePermission('canManageSettings'),
  asyncHandler(async (_req, res) => {
    const rows = await prisma.globalSetting.findMany();
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;
    res.json(map);
  }),
);

// PUT /settings – Systemeinstellungen speichern (keine Branding-Keys hier)
router.put(
  '/',
  requirePermission('canManageSettings'),
  asyncHandler(async (req, res) => {
    const entries = Object.entries(req.body as Record<string, unknown>);
    for (const [key, value] of entries) {
      if (BRANDING_KEYS.includes(key)) continue; // Branding via /branding
      await setSetting(key, String(value));
    }
    await auditLog('UPDATE_SETTINGS', req.user!.id, null, 'settings', { keys: entries.map(([k]) => k) });
    res.json({ ok: true });
  }),
);

export default router;
