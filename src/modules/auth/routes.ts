import { Router } from 'express';
import bcrypt from 'bcrypt';
import rateLimit from 'express-rate-limit';
import { prisma } from '../../db/client';
import { asyncHandler, HttpError } from '../../utils/http';
import { authenticate } from '../../middleware/authenticate';
import { auditLog } from '../../utils/audit';
import { isValidRegistrationCodeFormat } from '../../utils/codes';
import {
  signAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  setAuthCookies,
  clearAuthCookies,
  REFRESH_COOKIE_NAME,
} from './service';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /auth/login
router.post(
  '/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const identifier: string = req.body.identifier ?? req.body.email ?? req.body.name;
    const password: string = req.body.password;
    if (!identifier || !password) throw new HttpError(400, 'identifier und password erforderlich');

    const user = await prisma.user.findFirst({
      where: { OR: [{ email: identifier }, { name: identifier }] },
    });
    if (!user || !user.isActive) throw new HttpError(401, 'Login fehlgeschlagen');

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new HttpError(401, 'Login fehlgeschlagen');

    const accessToken = signAccessToken(user);
    const refreshToken = await issueRefreshToken(user.id);
    setAuthCookies(res, accessToken, refreshToken);
    await prisma.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } });

    res.json({ id: user.id, name: user.name, role: user.role });
  }),
);

// POST /auth/refresh
router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const token = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE_NAME];
    if (!token) throw new HttpError(401, 'Kein Refresh-Token');

    const rotated = await rotateRefreshToken(token);
    if (!rotated) {
      clearAuthCookies(res);
      throw new HttpError(401, 'Refresh-Token ungültig');
    }
    const accessToken = signAccessToken({ id: rotated.userId, role: rotated.role });
    setAuthCookies(res, accessToken, rotated.token);
    res.json({ ok: true });
  }),
);

// POST /auth/logout
router.post(
  '/logout',
  authenticate,
  asyncHandler(async (req, res) => {
    const token = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE_NAME];
    if (token) await revokeRefreshToken(token);
    clearAuthCookies(res);
    res.json({ ok: true });
  }),
);

// POST /auth/register – Registrierung per Code
router.post(
  '/register',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { code, name, password } = req.body as { code?: string; name?: string; password?: string };
    const email: string | undefined = req.body.email || undefined;
    if (!code || !name || !password) throw new HttpError(400, 'code, name und password erforderlich');
    if (!isValidRegistrationCodeFormat(code)) throw new HttpError(400, 'Ungültiges Code-Format');
    if (password.length < 8) throw new HttpError(400, 'Passwort zu kurz (min. 8 Zeichen)');

    const regCode = await prisma.registrationCode.findUnique({ where: { code } });
    if (!regCode || !regCode.isActive) throw new HttpError(400, 'Code ungültig oder deaktiviert');
    if (regCode.expiresAt && regCode.expiresAt < new Date()) throw new HttpError(400, 'Code abgelaufen');
    if (regCode.maxUses != null && regCode.useCount >= regCode.maxUses) {
      throw new HttpError(400, 'Code-Nutzungslimit erreicht');
    }
    // suad ist niemals per Code registrierbar
    const role = regCode.role === 'suad' ? 'member' : regCode.role;

    if (email) {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) throw new HttpError(409, 'E-Mail bereits vergeben');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { name, email, passwordHash, role },
      });
      await tx.groupMembership.create({ data: { userId: created.id, groupId: regCode.groupId } });
      await tx.registrationCode.update({
        where: { id: regCode.id },
        data: { useCount: { increment: 1 } },
      });
      await tx.registrationCodeUse.create({ data: { codeId: regCode.id, userId: created.id } });
      return created;
    });

    await auditLog('USE_REGISTRATION_CODE', user.id, regCode.id, 'registration_code', { role });

    const accessToken = signAccessToken(user);
    const refreshToken = await issueRefreshToken(user.id);
    setAuthCookies(res, accessToken, refreshToken);
    res.status(201).json({ id: user.id, name: user.name, role: user.role });
  }),
);

// GET /auth/me
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: {
        groupMemberships: { include: { group: true } },
        badges: true,
      },
    });
    if (!user) throw new HttpError(404, 'Nicht gefunden');
    await prisma.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } });
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      groups: user.groupMemberships.map((m) => ({ id: m.group.id, name: m.group.name })),
      badges: user.badges.map((b) => b.badge),
    });
  }),
);

export default router;
