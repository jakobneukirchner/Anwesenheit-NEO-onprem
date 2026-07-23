import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import type { Response } from 'express';
import { prisma } from '../../db/client';

const ACCESS_COOKIE = 'accessToken';
const REFRESH_COOKIE = 'refreshToken';

function accessMaxAgeMs(): number {
  // JWT_EXPIRES_IN wie "15m" – Cookie darf etwas länger leben als das Token
  return 60 * 60 * 1000;
}

function refreshMaxAgeMs(): number {
  const raw = process.env.REFRESH_TOKEN_EXPIRES_IN ?? '7d';
  const days = parseInt(raw.replace(/[^0-9]/g, ''), 10) || 7;
  return days * 24 * 60 * 60 * 1000;
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  };
}

export function signAccessToken(user: { id: string; roles: string[] }): string {
  return jwt.sign(
    { id: user.id, roles: user.roles },
    process.env.JWT_SECRET as string,
    { expiresIn: process.env.JWT_EXPIRES_IN ?? '15m' } as jwt.SignOptions,
  );
}

/** Erzeugt einen neuen Refresh-Token, persistiert ihn und gibt den Rohwert zurück. */
export async function issueRefreshToken(userId: string): Promise<string> {
  const token = crypto.randomBytes(48).toString('hex');
  const expiresAt = new Date(Date.now() + refreshMaxAgeMs());
  await prisma.refreshToken.create({ data: { userId, token, expiresAt } });
  return token;
}

/**
 * Refresh-Token-Rotation: prüft den alten Token, widerruft ihn und stellt einen
 * neuen aus. Gibt den neuen Token + userId zurück oder null bei Ungültigkeit.
 */
export async function rotateRefreshToken(
  oldToken: string,
): Promise<{ token: string; userId: string; roles: string[] } | null> {
  const stored = await prisma.refreshToken.findUnique({
    where: { token: oldToken },
    include: { user: true },
  });
  if (!stored || stored.revokedAt || stored.expiresAt < new Date() || !stored.user.isActive) {
    return null;
  }
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });
  const token = await issueRefreshToken(stored.userId);
  const { parseRoles } = await import('../../utils/roles');
  return { token, userId: stored.userId, roles: parseRoles(stored.user.role) };
}

export async function revokeRefreshToken(token: string): Promise<void> {
  await prisma.refreshToken
    .updateMany({ where: { token, revokedAt: null }, data: { revokedAt: new Date() } })
    .catch(() => undefined);
}

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  res.cookie(ACCESS_COOKIE, accessToken, cookieOptions(accessMaxAgeMs()));
  res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions(refreshMaxAgeMs()));
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, { path: '/' });
  res.clearCookie(REFRESH_COOKIE, { path: '/' });
}

export const REFRESH_COOKIE_NAME = REFRESH_COOKIE;
