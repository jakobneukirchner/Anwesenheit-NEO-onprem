import { Router } from 'express';
import bcrypt from 'bcrypt';
import { prisma } from '../../db/client';
import { asyncHandler, HttpError } from '../../utils/http';
import { authenticate, requireSuAd } from '../../middleware/authenticate';
import { auditLog, decryptAuditMeta } from '../../utils/audit';
import { filterChildEmails } from '../../utils/emailFilter';
import {
  generateSuAdKey,
  hashSuAdKey,
  generateRecoveryKey,
  hashRecoveryKey,
} from '../../utils/crypto';

const router = Router();

// SHA-256 des Beispiel-Bootstrap-Codes AB47-K2M8-R13Q-56TZ (per ENV überschreibbar)
const DEFAULT_BOOTSTRAP_HASH = '804d28f7c6ec846085ffe11a55c25fa67634b1bcaea9786428eac5a71011a661';
function bootstrapHash(): string {
  return process.env.SUAD_BOOTSTRAP_HASH ?? DEFAULT_BOOTSTRAP_HASH;
}

const SUAD_KEY_TTL_MS = 12 * 60 * 60 * 1000; // 12 Stunden

// ---------------------------------------------------------------------------
// "Activate Special" – getarnt als Badge-Freischaltung.
// Auth erforderlich (jeder eingeloggte Nutzer sieht das Feld unter "Mein Profil").
// ---------------------------------------------------------------------------
router.post(
  '/activate-special',
  authenticate,
  asyncHandler(async (req, res) => {
    const code: string = (req.body.code ?? '').trim();
    const specialPassword: string | undefined = req.body.specialPassword;
    if (!code) throw new HttpError(400, 'code erforderlich');

    const userId = req.user!.id;
    const codeHash = hashSuAdKey(code);

    // 1) Gültiger SuAd-Key → bestehenden Account zu suad hochstufen
    const key = await prisma.suAdKey.findUnique({ where: { keyHash: codeHash } });
    if (key && !key.usedAt && key.expiresAt > new Date()) {
      await prisma.$transaction([
        prisma.suAdKey.update({ where: { id: key.id }, data: { usedAt: new Date(), usedBy: userId } }),
        prisma.user.update({ where: { id: userId }, data: { role: 'suad' } }),
      ]);
      await auditLog('ACTIVATE_SUAD', userId, userId, 'user', { via: 'suad_key' });
      res.json({ ok: true, badge: 'Dev' }); // getarnte Antwort
      return;
    }

    // 2) Bootstrap: erster SuAd, wenn noch keiner existiert
    const suadCount = await prisma.user.count({ where: { role: 'suad' } });
    if (suadCount === 0 && codeHash === bootstrapHash()) {
      if (!specialPassword || specialPassword.length < 8) {
        throw new HttpError(400, 'specialPassword (min. 8 Zeichen) für Erst-Setup erforderlich');
      }
      const recoveryKey = generateRecoveryKey();
      const specialHash = await bcrypt.hash(specialPassword, 12);
      await prisma.$transaction([
        prisma.user.update({ where: { id: userId }, data: { role: 'suad' } }),
        prisma.systemSecret.upsert({
          where: { type: 'suad_special_hash' },
          update: {},
          create: { type: 'suad_special_hash', valueHash: specialHash },
        }),
        prisma.systemSecret.upsert({
          where: { type: 'recovery_hash' },
          update: {},
          create: { type: 'recovery_hash', valueHash: hashRecoveryKey(recoveryKey) },
        }),
      ]);
      await auditLog('CREATE_SUAD', userId, userId, 'user', { via: 'bootstrap' });
      // Recovery-Key wird nur EINMALIG zurückgegeben
      res.json({ ok: true, bootstrapped: true, recoveryKey });
      return;
    }

    // 3) Keine Übereinstimmung → neutrale Antwort (Tarnung)
    throw new HttpError(400, 'Ungültiger Code');
  }),
);

// Ab hier nur SuAd
router.use(authenticate, requireSuAd);

/** Verifiziert das unveränderliche SuAd-Sonderkennwort. */
async function verifySpecialPassword(password: string | undefined): Promise<boolean> {
  if (!password) return false;
  const secret = await prisma.systemSecret.findUnique({ where: { type: 'suad_special_hash' } });
  if (!secret) return false;
  return bcrypt.compare(password, secret.valueHash);
}

// POST /internal/suad/keys – neuen 12h-SuAd-Key ausstellen
router.post(
  '/keys',
  asyncHandler(async (req, res) => {
    if (!(await verifySpecialPassword(req.body.specialPassword))) {
      throw new HttpError(403, 'Sonderkennwort ungültig');
    }
    const key = generateSuAdKey();
    const created = await prisma.suAdKey.create({
      data: {
        keyHash: hashSuAdKey(key),
        createdBy: req.user!.id,
        expiresAt: new Date(Date.now() + SUAD_KEY_TTL_MS),
      },
    });
    await auditLog('ISSUE_SUAD_KEY', req.user!.id, created.id, 'suad_key');
    // Key wird nur EINMALIG im Klartext zurückgegeben
    res.status(201).json({ id: created.id, key, expiresAt: created.expiresAt });
  }),
);

// GET /internal/suad/keys – ausgestellte Keys (ohne Klartext)
router.get(
  '/keys',
  asyncHandler(async (_req, res) => {
    const keys = await prisma.suAdKey.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(
      keys.map((k) => ({
        id: k.id,
        createdBy: k.createdBy,
        expiresAt: k.expiresAt,
        usedAt: k.usedAt,
        usedBy: k.usedBy,
        expired: k.expiresAt < new Date(),
      })),
    );
  }),
);

// GET /internal/suad/users – alle Nutzer inkl. Kind-E-Mails (auditiert)
router.get(
  '/users',
  asyncHandler(async (req, res) => {
    const { primaryRole, parseRoles } = await import('../../utils/roles');
    const users = await prisma.user.findMany({ orderBy: { name: 'asc' } });
    for (const u of users) {
      if (primaryRole(u.role) === 'member' && u.email) await auditLog('VIEW_CHILD_EMAIL', req.user!.id, u.id, 'user');
    }
    // SuAd sieht E-Mails ungefiltert
    res.json(filterChildEmails(users.map((u) => ({
      id: u.id, name: u.name, email: u.email, role: primaryRole(u.role), roles: parseRoles(u.role), isActive: u.isActive,
    })), ['suad']));
  }),
);

// GET /internal/suad/audit-logs – vollständige, entschlüsselte Audit-Logs
router.get(
  '/audit-logs',
  asyncHandler(async (_req, res) => {
    const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 500 });
    const out = await Promise.all(
      logs.map(async (l) => ({
        id: l.id,
        action: l.action,
        actorId: l.actorId,
        targetId: l.targetId,
        targetType: l.targetType,
        meta: await decryptAuditMeta(l.metaEnc),
        createdAt: l.createdAt,
      })),
    );
    res.json(out);
  }),
);

// GET /internal/suad/jobs – Cronjob-Zeitpläne
router.get(
  '/jobs',
  asyncHandler(async (_req, res) => {
    res.json([
      { name: 'autoCancelAttendance', schedule: process.env.CRON_AUTO_CANCEL ?? '*/5 * * * *' },
      { name: 'cleanupExpiredCodes', schedule: process.env.CRON_CLEANUP_CODES ?? '0 3 * * *' },
      { name: 'nightlyBackup', schedule: process.env.BACKUP_CRON ?? '0 2 * * *' },
      { name: 'reminderNotifications', schedule: process.env.CRON_REMINDERS ?? '0 * * * *' },
    ]);
  }),
);

export default router;
